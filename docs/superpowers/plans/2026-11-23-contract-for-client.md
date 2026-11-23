# Contract FOR Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Contracts record a FOR client (Contracts column Q). A DR's contract lines only match and only validate against contracts whose FOR client equals the DR's FOR client, with blank matching only blank.

**Architecture:** `Contract.forCompanyId` is read and written in `contractSheets.ts`. The pure `validateContractLines` gains a `forCompanyId` input, and the POST route passes the DR's FOR. The DR page filters its contract-item list by FOR. The DR update path refuses a FOR change once release rows exist. The Contracts page gets the FOR dropdown, reusing `forCompanyOptions`.

**Tech Stack:** Next.js 16, TypeScript, Google Sheets API.

**Spec:** `docs/superpowers/specs/2026-11-23-contract-for-client-design.md`

## Global Constraints

- Strict equality: `(contract.forCompanyId || "") === (dr.forCompanyId || "")`.
- Contracts column **Q**, header `ForCompanyId`, provisioned by `scripts/setup-inventory-sheets.mjs`. No other new columns.
- Error copy: "Agreement <id> is for a different client than this DR." and "This DR released contract items, so its FOR client can't change."

## Review Focus

- A DR with no FOR and a customer with no FOR contracts must match exactly as before. Covered in Task 1 (existing tests stay green with `forCompanyId` undefined) and Task 3 (filter is `"" === ""`).
- Two Golden East contracts holding the same product: a DR FOR Primeluck must not pick Holy Family's item. Task 3's filter runs before the "first match" lookup. Covered in Task 1 on the server side.
- Editing a contract without touching FOR must not clear Q. Task 2 writes Q only when `payload.forCompanyId !== undefined`.
- A DR whose contract lines were filtered to none because of a FOR mismatch saves with no releases. That's expected under strict matching, so the user gets no warning beyond the entitlement card being empty.
- A DR FOR change after releases: blocked in Task 4, including changing to or from blank.

---

### Task 1: `validateContractLines` checks the FOR client

**Files:** Modify `src/types/contract.ts` (`forCompanyId?: string` on `Contract` and `CreateContractPayload`), `src/lib/contractReleases/lines.ts`, `scripts/contract-release-tests/lines-test.ts`.

- [ ] Write tests: contracts gain `{ id: "CTR-0004", companyId: "C1", forCompanyId: "HF", … }` with item `CTI-6` (`INK-A`, `P-A`). Then `v([L("CTI-6",1,0)])` matches `/different client/`, `v([L("CTI-6",1,0)], { forCompanyId: "HF" })` is ok, and `v([L("CTI-1",1,0)], { forCompanyId: "HF" })` matches `/different client/`. All existing assertions stay unchanged.
- [ ] Run `npm run test:contract-releases`. Expected: FAIL (compile error on `forCompanyId`).
- [ ] Add `forCompanyId?: string` to the input. After the company check: `if ((contract.forCompanyId || "") !== (forCompanyId || "")) return { error: \`Agreement ${contract.id} is for a different client than this DR.\` }`.
- [ ] Run `npm run test:contract-releases` and `npm run test:delivery-releases`. Expected: PASS.
- [ ] Commit `feat(contracts): contract lines must match the DR's FOR client`.

### Task 2: Store the contract FOR client (column Q)

**Files:** `src/lib/contractSheets.ts`, `scripts/setup-inventory-sheets.mjs`, `src/app/api/deliveries/route.ts`.

- [ ] `CONTRACTS_RANGE` becomes `A2:Q`. `getContracts` maps `forCompanyId: String(row[16] ?? "").trim() || undefined`. `addContract` appends `payload.forCompanyId || ""` as Q. `updateContractInSheets` writes Q only when `payload.forCompanyId !== undefined` (add `["Q", payload.forCompanyId]` to the N/O/P loop) and returns it. Both add and update call `validateForCompany(await getCompanies(), companyId, forCompanyId)` and throw its message when they get a non-empty value (on update, against the effective company).
- [ ] Setup script: add `["Contracts!Q1", "ForCompanyId"]` to the header targets.
- [ ] POST `/api/deliveries`: pass `forCompanyId: body.forCompanyId` to `validateContractLines`.
- [ ] Run `npx tsc --noEmit -p tsconfig.json` and `npm run test:contract-releases`. Expected: clean. Check that `appendContractWithInitialNote` appends the same row array, so Q comes along.
- [ ] Commit `feat(contracts): store FOR client on contracts (column Q)`.

### Task 3: DR form matches contract items by FOR

**Files:** `src/app/dashboard/delivery-releases/page.tsx`.

- [ ] Carry `forCompanyId` per contract into the mapped contract items (from `companyContracts`). Derive `forContracts = contracts.filter(c => (c.forCompanyId || "") === effectiveForCompanyId)` and use it for matching in both save paths and in the entitlement card.
- [ ] Run tsc and eslint. Expected: no new problems.
- [ ] Commit `feat(deliveries): DR contract matching follows the FOR client`.

### Task 4: Block a FOR change on a DR with releases

**Files:** `src/lib/deliverySheets.ts`.

- [ ] In `updateDeliveryReceipt`, when `nextForCompanyId !== storedForCompanyId` and the DR has a positive number, load `getContractReleases()` and throw the spec's message if any release has `drNumber === drNumber`.
- [ ] Run tsc and `npm run test:delivery-releases`. Expected: PASS.
- [ ] Commit `feat(deliveries): FOR client is fixed once a DR released contract items`.

### Task 5: Contracts page FOR dropdown

**Files:** `src/app/dashboard/customer-contracts/page.tsx`.

- [ ] Form state `forCompanyId` (default ""), filled from the row on edit and cleared when `customerId` changes. Show a "FOR (client)" `SearchableSelect` (None plus `forCompanyOptions(companies, form.customerId)`, keeping a stored id that's no longer listed) only when there are options. Send `forCompanyId` in create and edit. In the view dialog show "FOR: <name>" when set.
- [ ] Run tsc and eslint. Expected: no new problems.
- [ ] Commit `feat(contracts): FOR client dropdown on contracts`.

## After the build

With the user's OK, run `npm run setup:inventory` and then `-- --apply` to write `Contracts!Q1`. Then the user sets CTR-0038's FOR to Holy Family.
