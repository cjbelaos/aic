/* eslint-disable @typescript-eslint/no-require-imports -- Isolated proxy/session harness. */
// Staging lock: SITE_BASIC_AUTH gates every request; ACCESS_ALLOWED_USER_IDS limits sessions and
// sign-in to listed users. Both must be no-ops when unset (production).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function load(file, mocks = {}) {
  const fixture = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', output)((id) => (Object.hasOwn(mocks, id) ? mocks[id] : id.startsWith('@/') ? (require('./lib/sheets-mode-stubs.cjs').SHEETS_MODE_STUBS[id] ?? {}) : require(id)), fixture, fixture.exports);
  return fixture.exports;
}

class FakeResponse { constructor(body, init = {}) { this.status = init.status ?? 200; this.headers = new Headers(init.headers); } static next() { return new FakeResponse(null, { status: 200 }); } }
const { proxy } = load('src/proxy.ts', { 'next/server': { NextResponse: FakeResponse } });
const request = (auth) => ({ headers: new Headers(auth ? { authorization: auth } : {}) });
const basic = (s) => `Basic ${Buffer.from(s).toString('base64')}`;

const session = load('src/lib/auth/session.ts', { 'next/headers': { cookies: async () => ({}) }, '@/lib/auth/superAdmin': { isSuperAdmin: () => false } });
const user = (userId) => ({ userId, username: userId, userRoleId: 2 });

function main() {
  delete process.env.SITE_BASIC_AUTH; delete process.env.ACCESS_ALLOWED_USER_IDS;
  assert.equal(proxy(request()).status, 200, 'no gate when SITE_BASIC_AUTH is unset');

  process.env.SITE_BASIC_AUTH = 'chris:s3cret-pass';
  const denied = proxy(request());
  assert.equal(denied.status, 401);
  assert.match(denied.headers.get('www-authenticate'), /^Basic realm=/);
  assert.equal(proxy(request(basic('chris:wrong'))).status, 401);
  assert.equal(proxy(request(basic('chris:s3cret-pass-longer'))).status, 401);
  assert.equal(proxy(request('Bearer abc')).status, 401);
  assert.equal(proxy(request(basic('chris:s3cret-pass'))).status, 200);
  delete process.env.SITE_BASIC_AUTH;

  const tokenA = session.createSessionToken(user('user-a'));
  const tokenB = session.createSessionToken(user('user-b'));
  assert.equal(session.parseSessionToken(tokenB)?.userId, 'user-b', 'every user allowed when the list is unset');
  process.env.ACCESS_ALLOWED_USER_IDS = ' user-a , other ';
  assert.equal(session.isAccessAllowed('user-a'), true);
  assert.equal(session.isAccessAllowed('user-b'), false);
  assert.equal(session.parseSessionToken(tokenA)?.userId, 'user-a');
  assert.equal(session.parseSessionToken(tokenB), null, 'a copied account outside the list has no session');
  process.env.ACCESS_ALLOWED_USER_IDS = '  ';
  assert.equal(session.isAccessAllowed('user-b'), true, 'blank list means unrestricted');
  delete process.env.ACCESS_ALLOWED_USER_IDS;

  const login = fs.readFileSync('src/app/api/auth/login/route.ts', 'utf8');
  assert.ok(login.indexOf('isAccessAllowed(user.userId)') < login.indexOf('setSessionCookie({'), 'login refuses before issuing a cookie');
  const mobile = fs.readFileSync('src/app/api/mobile/login/route.ts', 'utf8');
  assert.ok(mobile.indexOf('isAccessAllowed(user.userId)') > 0 && mobile.indexOf('isAccessAllowed(user.userId)') < mobile.indexOf('signMobileToken({'), 'mobile login refuses before issuing a token');
  console.log('Restricted access regression tests passed.');
}
main();
