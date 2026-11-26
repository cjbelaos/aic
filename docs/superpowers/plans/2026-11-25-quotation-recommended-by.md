# Quotation "Recommended by" + Sales Order Confirmation Email: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record the recommending technician on quotations and Sales Orders. Email them, the After Sales manager(s), and the company inbox the first time a Sales Order becomes Confirmed, so they raise the Purchase Request. Hide Service Reports from the sidebar.

**Architecture:** A new pure module, `src/lib/recommendedBy.ts`, holds every rule: who is eligible, resolving a name, recipients, when to send, and the email copy. Quotations and Sales Orders each append two columns (`RecommendedByUserId`, `RecommendedByName`). A server-only notifier, `src/lib/salesOrders/recommenderNotice.ts`, is called by the three routes that can make an order Confirmed. It never throws, and it returns a `notice` that the UI shows as a warning toast.

**Tech Stack:** Next.js 16 app router (read `node_modules/next/dist/docs/` before touching routes), TypeScript, Google Sheets via `googleapis`, nodemailer, sonner toasts. Tests are plain `node:assert` scripts compiled by `tsc`.

**Spec:** `docs/superpowers/specs/2026-11-25-quotation-recommended-by-design.md`

## Global Constraints

- After Sales department id is `1` (the department `app-sidebar.tsx` uses for the Technician group).
- The company inbox CC is `aerichinnovationcorp@gmail.com`, defined once as a constant.
- A manager is an After Sales user whose position title contains `manager` (case-insensitive).
- Send only when the order becomes CONFIRMED for the first time: either created as CONFIRMED, or confirmed from DRAFT. ON_HOLD → CONFIRMED never sends. (Orders are usually created already Confirmed; this widens the spec's "DRAFT → CONFIRMED" to cover that, as the user intended.)
- No recommender selected: no email and no warning.
- The email never blocks or rolls back a Sales Order write.
- New sheet columns are appended only. Existing column positions never move.
- The recommender is never printed on the quotation PDF.
- The server resolves `RecommendedByName` from the Users sheet. A name sent by the client is ignored.

## Review Focus

1. **The technician is also a manager:** they appear once, in To, and are not repeated in CC. *Test:* Task 2 `noticeRecipients` case.
2. **The recommender has no email, or was moved out of After Sales after the quotation was saved:** the confirm still succeeds and admin sees "Technician was not notified: …". *Test:* Task 2 `noticeRecipients` returns null on a blank email, and Task 6 notifier returns FAILED.
3. **Customer or item text containing `&`, `<` or `"`:** escaped in the email HTML. *Test:* Task 2 email case.
4. **Historical rows shorter than the new column count:** they read as blank recommenders with no crash. *Test:* Task 3 row-mapping case.
5. **A retried confirm request that replays the same commandId:** it may send a second email. That's accepted, but it must not error. *Test:* manual note in Task 7; no automated test.

---

### Task 1: Hide Service Reports in the sidebar

**Files:**
- Modify: `src/components/app-sidebar.tsx:112-117, 562-575, 741-755`

- [ ] **Step 1:** Delete both Service Reports `SidebarMenuItem` blocks, the `showServiceReportsInTechnicianGroup` constant, and its doc comment. Leave `/dashboard/service-reports` routes untouched.
- [ ] **Step 2:** Run `npx eslint src/components/app-sidebar.tsx`. Expected: no errors or unused-variable warnings.
- [ ] **Step 3:** Commit `feat(sidebar): hide Service Reports (managed in a separate app)`.

### Task 2: Pure rules module `recommendedBy.ts`

**Files:**
- Create: `src/lib/recommendedBy.ts` (pure; imports only types)
- Create: `scripts/sales-order-tests/recommended-by-test.ts`
- Modify: `scripts/sales-order-tests/run.ts` (import it), `scripts/sales-order-tests/tsconfig.json` (include `../../src/lib/recommendedBy.ts`, `../../src/types/user.ts`, `../../src/types/position.ts`)

**Interfaces (Produces):**
```ts
export const AFTER_SALES_DEPARTMENT_ID = 1;
export const COMPANY_INBOX = "aerichinnovationcorp@gmail.com";
type UserLite = Pick<PublicUser, "userId" | "fullName" | "username" | "email" | "departmentId" | "positionId">;
export interface RecommenderOption { userId: string; fullName: string }
export function recommenderOptions(users: readonly UserLite[]): RecommenderOption[]; // dept 1 only, sorted by fullName (fallback username)
export type ResolvedRecommender = { recommendedByUserId: string; recommendedByName: string };
export function resolveRecommendedBy(userId: string | undefined, users: readonly UserLite[]): ResolvedRecommender | { error: string };
export function noticeRecipients(technicianUserId: string, users: readonly UserLite[], positions: readonly Position[]): { to: string; cc: string[] } | null;
export function shouldSendRecommenderNotice(previous: OrderStatus | null, next: OrderStatus): boolean;
export interface NoticeEmailInput { salesOrderNo: string; customer: string; quotationNo: string; technicianName: string;
  items: ReadonlyArray<{ description: string; quantity: number | null; unit: string }>; orderUrl: string; purchaseRequestUrl: string }
export function purchaseRequestNoticeEmail(input: NoticeEmailInput): { subject: string; html: string };
```

- [ ] **Step 1: Write the failing tests** in `recommended-by-test.ts`, using fixtures: tech `u1` (dept 1, position 5 "Technician", `t@x.com`), manager `u2` (dept 1, position 6 "After Sales Manager", `m@x.com`), and admin `u3` (dept 2, position 6, `a@x.com`).
  - `recommenderOptions` returns `[u2, u1]` sorted by name, excluding `u3`.
  - `resolveRecommendedBy("")` and `resolveRecommendedBy(undefined)` → `{ recommendedByUserId: "", recommendedByName: "" }`. `"u1"` → `u1`'s fullName. `"u3"` → `{ error: "The recommending technician must be an After Sales user." }`. `"nope"` → the same error.
  - `noticeRecipients("u1")` → `{ to: "t@x.com", cc: ["m@x.com", "aerichinnovationcorp@gmail.com"] }`. `"u2"` (a manager) → `{ to: "m@x.com", cc: ["aerichinnovationcorp@gmail.com"] }`. A tech with blank email → `null`. CC entries are lower-cased and de-duplicated.
  - `shouldSendRecommenderNotice`: `(null,"CONFIRMED")` true, `("DRAFT","CONFIRMED")` true, `("ON_HOLD","CONFIRMED")` false, `(null,"DRAFT")` false.
  - `purchaseRequestNoticeEmail` with customer `"A & B <Co>"`: the subject is `"Purchase Request needed: AIC-SO-2026-0001 (A & B <Co>)"`. The html contains `A &amp; B &lt;Co&gt;`, both URLs, and every item description, and does not contain the raw `<Co>`.
- [ ] **Step 2:** Run `npm run test:sales-orders`. Expected: compile FAIL (module not found).
- [ ] **Step 3: Implement** `src/lib/recommendedBy.ts`. The body says: "Hi {technicianName}, the client has confirmed Sales Order {no} for {customer} (from quotation {quotationNo} — omit when blank) that you recommended. Please create the Purchase Request." Then an items table (description, qty, unit), then links "Open Sales Order" and "Create Purchase Request".
- [ ] **Step 4:** Run `npm run test:sales-orders`. Expected: `All sales-order focused tests passed.`
- [ ] **Step 5:** Commit `feat(recommended-by): rules for technician picker, recipients and notice email`.

### Task 3: Quotation storage (columns AB/AC)

**Files:**
- Modify: `src/lib/quotationRow.ts` (count 27 → 29; `QUOTATION_ROW.recommendedByUserId: 27`, `recommendedByName: 28`; headers `"RecommendedByUserId", "RecommendedByName"`; parse and write both; update the layout doc comment)
- Modify: `src/types/quotation.ts` (`Quotation.recommendedByUserId?: string; recommendedByName?: string;`)
- Modify: `src/lib/quotationSheets.ts`: `buildQuotationRow` (~l.189) and the second parser (~l.256) map both fields. The writers in `addQuotation` (~l.373), `updateQuotation` (~l.644) and `saveQuotationData` (~l.842, with new `SaveQuotationDataParams` fields) pass both.
- Modify: `src/app/api/quotations/save/route.ts` and the PUT handler in `src/app/api/quotations/[refNo]/route.ts`. Each calls `resolveRecommendedBy(payload.recommendedByUserId, await getUsers())`, returns 400 `{ error }` on error, and passes the resolved pair on.
- Test: `scripts/quotation-tests/row-mapping-test.ts`

- [ ] **Step 1: Update tests.** Change the count asserts to `29`, the range to `"Quotations!A2:AC"`, and add `["RecommendedByUserId","recommendedByUserId",27,"AB"]` and `["RecommendedByName","recommendedByName",28,"AC"]` to `expectedLayout`. The round trip asserts `parsed.recommendedByUserId === "u1"` and `parsed.recommendedByName === "Juan Tech"`. The existing 27-cell historical row parses both as `""`.
- [ ] **Step 2:** Run `npm run test:quotations`. Expected: FAIL on the count assert.
- [ ] **Step 3: Implement** the files listed above.
- [ ] **Step 4:** Run `npm run test:quotations`. Expected: all pass, including `test-quotation-persistence.cjs`. If a .cjs fixture asserts row length 27, update it to 29.
- [ ] **Step 5:** Commit `feat(quotations): store recommending technician (AB/AC)`.

### Task 4: Quotation UI

**Files:**
- Modify: `src/components/quotation-form.tsx`: state `recommendedByUserId` (init from `initialData?.recommendedByUserId`). Add a `SearchableSelect` labelled **"Recommended by"** next to "Approved by" (~l.1707), with options from `recommenderOptions(allUsers)`, the placeholder "Select technician (optional)…", and the hint "The technician who recommended this work. They're emailed when the Sales Order is confirmed." Clearing it is allowed. Add it to the form data type (~l.184) and the payload (~l.818). Show it in the read-only InfoField block (~l.865).
- Modify: `src/lib/services/quotation.service.ts` (`SaveQuotationPayload.recommendedByUserId?: string`)
- Modify: `src/app/dashboard/quotations/page.tsx`: pass `recommendedByUserId` in both the update (~l.381) and create (~l.393) payloads, map it into the form initial data (~l.233), and add a **"Recommended By"** list column (accessor `recommendedByName`) plus an export column.

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** Run `npx tsc --noEmit -p tsconfig.json` and `npx eslint` on the touched files. Expected: no new errors.
- [ ] **Step 3: Manual check** with `npm run dev`. Create a quotation with a technician, reopen it, and confirm the technician is retained. Change it to blank and save. Confirm the PDF preview shows no technician.
- [ ] **Step 4:** Commit `feat(quotations): Recommended by picker and list column`.

### Task 5: Sales Order storage and inheritance

**Files:**
- Modify: `src/types/salesOrder.ts` (`SalesOrder.recommendedByUserId?: string; recommendedByName?: string;`)
- Modify: `src/lib/salesOrders/repository.ts`: append `"RecommendedByUserId", "RecommendedByName"` to `ORDERS_HEADERS` (becoming AL, AM). `orderFromRow` reads `r[37]`, `r[38]`, and `orderToRow` appends both.
- Modify: `src/lib/salesOrders/validation.ts`: `recommendedByUserId: optionalStringField("recommendedByUserId")` in the create and update parsers and their `Validated*` types.
- Modify: `src/lib/salesOrders/service.ts`: `baseOrder` and `createOrderImpl` accept and set both fields. `updateOrderImpl` applies both via `applyString`, so history records the change. `createOrderFromQuotationImpl` copies `quotation.recommendedByUserId/Name`.
- Modify: `src/app/api/sales-orders/route.ts` (POST) and the update handler in `src/app/api/sales-orders/[id]/route.ts`. Both resolve with `resolveRecommendedBy` (400 on error) and pass the pair to the service.
- Modify: `src/app/api/sales-orders/options/route.ts`: add `recommenders: recommenderOptions(users)`, which needs `departmentId` in the user map, and `recommendedByUserId` on each quotation option. Update `OptionsResponse` and `OrderInput` in `src/lib/services/sales-order.service.ts`.
- Test: `scripts/sales-order-tests/validation-test.ts`

- [ ] **Step 1: Failing test.** `parseCreateOrderInput({...validCreateFixture, recommendedByUserId: " u1 "}).recommendedByUserId === "u1"`. When the field is omitted, the result is `undefined` or `""`.
- [ ] **Step 2:** Run `npm run test:sales-orders`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm run test:sales-orders` and `npx tsc --noEmit -p tsconfig.json`. Expected: pass and no new errors.
- [ ] **Step 5:** Commit `feat(sales-orders): carry recommending technician (AL/AM)`.

### Task 6: Notifier and email transport

**Files:**
- Modify: `src/lib/emailService.ts`: add `sendEmail({ to, cc, subject, html }): Promise<{ success: boolean }>` (nodemailer `cc`). `sendQuotationEmail` delegates to it unchanged.
- Create: `src/lib/salesOrders/recommenderNotice.ts`

**Interfaces (Produces):**
```ts
export type RecommenderNotice = { status: "SENT" | "SKIPPED" | "FAILED"; warning?: string };
export async function notifyRecommender(order: SalesOrder, items: SalesOrderItem[], baseUrl: string): Promise<RecommenderNotice>;
```
The behaviour:
- No `order.recommendedByUserId` → `SKIPPED`.
- Load `getUsers()` and `getPositions()`. If `noticeRecipients` returns null → `FAILED`, `"Technician was not notified: {name} has no email address."`.
- Build the email with `orderUrl = ${baseUrl}/dashboard/sales-orders/${order.salesOrderId}` and `purchaseRequestUrl = ${baseUrl}/dashboard/purchase-requests`, using only lines with `lineStatus === "ACTIVE"`.
- `sendEmail` returns `success:false` → `FAILED`, `"Technician was not notified: email is not configured."`. A thrown error → `FAILED`, `"Technician was not notified: the email could not be sent."` plus `console.error`.
- It never throws.

- [ ] **Step 1:** Implement both files.
- [ ] **Step 2:** Run `npx tsc --noEmit -p tsconfig.json`. Expected: no new errors.
- [ ] **Step 3:** Commit `feat(sales-orders): recommender notice email`.

### Task 7: Wire the notice into the confirm paths and the UI

**Files:**
- Modify: `src/app/api/sales-orders/[id]/confirm/route.ts`: after the tracker sync, `notice = await notifyRecommender(detail.order, detail.items, new URL(request.url).origin)`. Respond with `{ success, order, notice }`.
- Modify: `src/app/api/sales-orders/route.ts` (POST): the same, only when `shouldSendRecommenderNotice(null, detail.order.orderStatus)`.
- Modify: `src/app/api/sales-orders/from-quotation/route.ts`: the same, only when `!detail.reusedExisting && shouldSendRecommenderNotice(null, detail.order.orderStatus)`.
- Modify: `src/lib/services/sales-order.service.ts`: `create`, `confirm` and `fromQuotation` results gain `notice?: RecommenderNotice`.
- Modify: `src/components/sales-orders/order-form.tsx`: a **"Recommended by"** `SearchableSelect` (`options.recommenders`, optional, `md:col-span-4`) after Billing type, in header state and the submit payload. When `sourceQuotationNo` changes to an internal quotation, prefill from that quotation's `recommendedByUserId` (admin may change it).
- Modify: `src/app/dashboard/sales-orders/[id]/page.tsx`: show "Recommended by: {recommendedByName || '—'}". After Confirm, call `toast.warning(res.notice.warning)` when present. On success with `status === "SENT"`, `toast.success("Technician notified.")`.
- Modify: `src/app/dashboard/sales-orders/new/page.tsx` and `src/app/dashboard/sales-orders/[id]/edit/page.tsx`: pass the field through, and show the same warning or success toast after create and from-quotation.

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** Run `npx tsc --noEmit -p tsconfig.json`, `npm run lint`, and `npm run test:sales-orders`. Expected: no new errors, and the tests pass.
- [ ] **Step 3: Manual check** with `npm run dev` and SMTP configured in `.env.local`:
  1. "Confirmed from Quotation" on a quotation with a technician → one email (To: technician; CC: manager(s) and the inbox), plus a success toast.
  2. "Draft from Quotation" → no email. Confirm → one email.
  3. Hold, then resume → no email.
  4. Direct order with no recommender → no email and no toast.
  5. A recommender with a blank email → the order confirms and the warning toast shows.
- [ ] **Step 4:** Commit `feat(sales-orders): email recommending technician on confirm`.

### Task 8: Provision live sheet headers and run the final checks

- [ ] **Step 1:** **Ask Chris before writing to the live spreadsheet.** Then add the header cells `Quotations!AB1:AC1 = RecommendedByUserId, RecommendedByName` and `SalesOrders!AL1:AM1 = RecommendedByUserId, RecommendedByName`.
- [ ] **Step 2:** Run `node --env-file=.env.local scripts/verify-sales-order-sheet-schema.mjs`. Expected: SalesOrders OK with no missing headers.
- [ ] **Step 3:** Run `npm run test:quotations`, `npm run test:sales-orders`, `npm run test:purchase-requests`, and `npm run build`. Expected: all pass and the build succeeds.
- [ ] **Step 4:** Refresh `C:\Users\chris\KOS\02 - Projects\Active\AIC\handoff.md`, then commit any remaining fixes.
