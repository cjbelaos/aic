# Contract FOR Client — Design

Date: 2026-11-23 · Size: small change · Follows: `2026-11-23-golden-east-dr-form-design.md`

## Intent

Golden East (COMP-96) holds contracts with Aerich that serve its own clients. CTR-0038 is Golden
East's contract serving Holy Family Hospital – Padre Garcia, and more will follow, one per client.
A DR counts against a contract automatically: each item matches the first active contract of the
DR's company that has the same product. With two Golden East contracts holding the same product,
a delivery could count against the wrong client's contract. Recording the FOR client on the
contract makes the DR's FOR client decide which contract it counts against.

## Goals

- Contracts get an optional **FOR (client)** field: a company billed to the contract's company.
  The list is the same as the DR's FOR field.
- **Strict matching (Chris's choice).** A DR's contract lines only match contracts whose FOR client
  equals the DR's FOR client, with blank matching only blank.
- The server rejects a mismatched contract line.
- A DR that has already released contract items can't change its FOR client.

## Non-goals

- No change to past releases, release periods or entitlements.
- No contract picker on the DR. Matching stays automatic.
- Contracts of customers with no billed clients look and behave as today: the field is hidden and
  every value is blank.

## Approaches

- **FOR on the contract, and the DR's FOR filters matching (chosen).** It reuses the DR's FOR
  dropdown and makes a wrong-client release impossible.
- Lock the DR's FOR to the contract's. Rejected: no contract is "picked" on the DR, because matching
  is automatic by product.
- Lenient matching (a blank contract FOR accepts any DR). Rejected by Chris: a DR with a blank FOR
  could count against another client's contract.

## Data

- **Contracts column Q `ForCompanyId`.** Q1 is empty, and the tab is already 27 columns wide.
  `scripts/setup-inventory-sheets.mjs` writes the header (additive, audited).
- Read into `Contract.forCompanyId`. It's written on create and on edit (when sent), and validated
  with `validateForCompany(companies, companyId, forCompanyId)`.

## Behavior

- **Contracts page:** a "FOR (client)" dropdown appears when the selected customer has billed
  clients. It's cleared when the customer changes, and the view dialog shows the FOR client.
- **DR form:** contract items considered for matching are limited to contracts with
  `(forCompanyId || "") === (DR FOR || "")`. The entitlement card shows the same filtered list.
- **Server, `validateContractLines`:** gains `forCompanyId`. When it doesn't match the line's
  contract, the error is "Agreement <id> is for a different client than this DR."
- **DR edit:** changing the FOR client of a DR that has contract release rows is rejected with
  "This DR released contract items, so its FOR client can't change."

## After release (Chris)

Set CTR-0038's FOR to Holy Family. Until then, under strict matching, Holy Family DRs don't count
against it.
