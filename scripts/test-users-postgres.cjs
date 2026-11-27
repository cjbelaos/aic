/* eslint-disable @typescript-eslint/no-require-imports -- Integration harness against the staging database. */
// Exercises src/lib/userSheets.ts with DATA_BACKEND=postgres against a real database (aic_web role).
//   node --env-file=.env.local scripts/test-users-postgres.cjs      (uses STAGING_APP_DATABASE_URL)
// Creates one throwaway user and removes it again; never prints personal data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const url = process.env.TEST_DATABASE_URL || process.env.STAGING_APP_DATABASE_URL;
if (!url) { console.log('SKIP users-postgres: no STAGING_APP_DATABASE_URL'); process.exit(0); }
process.env.DATABASE_URL = url;
process.env.DATA_BACKEND = 'postgres';
delete process.env.ACCESS_ALLOWED_USER_IDS;

const cookieJar = new Map();
const mocks = { 'next/headers': { cookies: async () => ({ get: (name) => (cookieJar.has(name) ? { value: cookieJar.get(name) } : undefined) }) } };
const cache = new Map();
function load(file) {
  const full = path.resolve(file);
  if (cache.has(full)) return cache.get(full).exports;
  const mod = { exports: {} };
  cache.set(full, mod);
  const output = ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const req = (id) => {
    if (Object.hasOwn(mocks, id)) return mocks[id];
    if (id.startsWith('@/')) return load(path.join('src', id.slice(2)) + '.ts');
    if (id.startsWith('./')) return load(path.join(path.dirname(full), id) + '.ts');
    return require(id);
  };
  new Function('require', 'module', 'exports', output)(req, mod, mod.exports);
  return mod.exports;
}

const users = load('src/lib/userSheets.ts');
const session = load('src/lib/auth/session.ts');
const db = load('src/lib/db/postgres.ts');

async function main() {
  const actorId = 'test:users-postgres';
  cookieJar.set('aic_session', session.createSessionToken({ userId: actorId, username: actorId, email: '', userRoleId: 1, departmentId: 0, positionId: 0, fullName: 'Integration test' }));
  const username = `zz_it_${Date.now()}`;
  let createdId;
  try {
    const all = await users.getUsers();
    const [{ n }] = await db.dbQuery("select count(*)::int n from aic.users where btrim(coalesce(username,'')) <> ''");
    assert.equal(all.length, n);
    assert.ok(all.every((u) => u.userId && typeof u.userRoleId === 'number' && typeof u.requiresApproval === 'boolean' && !('passwordHash' in u)));
    const sample = all[0];
    const found = await users.getUserByUsername(sample.username.toUpperCase());
    assert.equal(found?.userId, sample.userId, 'username lookup ignores case');
    assert.ok(found.passwordHash, 'the full record carries the hash for sign-in');
    assert.equal((await users.getUserById(sample.userId))?.username, sample.username);

    const created = await users.addUser({ username, fullName: 'Integration Test', email: 'it@example.invalid', password: 'first-pass', userRoleId: 2, departmentId: 0, positionId: 0, requiresApproval: false });
    createdId = created.userId;
    const [row] = await db.dbQuery('select created_by, created_at is not null as stamped, department_id, requires_approval from aic.users where user_id = $1', [createdId]);
    assert.deepEqual(row, { created_by: actorId, stamped: true, department_id: null, requires_approval: 'NO' });
    await assert.rejects(users.addUser({ username: username.toUpperCase(), fullName: 'x', email: '', password: 'another', userRoleId: 2, departmentId: 0, positionId: 0 }), /Username already exists/);

    const before = await users.getUserById(createdId);
    await users.updateUser(createdId, { fullName: 'Renamed Test', password: 'second-pass' });
    const after = await users.getUserById(createdId);
    assert.equal(after.fullName, 'Renamed Test');
    assert.notEqual(after.passwordHash, before.passwordHash);
    assert.equal(after.requiresApproval, false);
    assert.equal(load('src/lib/password.ts').verifyPassword('second-pass', after.passwordHash, after.salt), true);

    await users.updateLastLogin(createdId);
    const [login] = await db.dbQuery('select last_login is not null as set, updated_by from aic.users where user_id = $1', [createdId]);
    assert.deepEqual(login, { set: true, updated_by: createdId });

    const [busy] = await db.dbQuery('select user_id from aic.fti_requests where user_id is not null limit 1');
    if (busy) await assert.rejects(users.deleteUser(busy.user_id), /can't be deleted/);

    await users.deleteUser(createdId);
    createdId = undefined;
    assert.equal(await users.getUserById(created.userId), null);
    console.log('Users on PostgreSQL integration tests passed.');
  } finally {
    if (createdId) await db.withTransaction(actorId, (c) => c.query('delete from aic.users where user_id = $1', [createdId]));
    const pool = globalThis.__aicPgPool;
    if (pool) await pool.end();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
