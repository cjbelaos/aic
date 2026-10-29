# Customer contract badges and dated notes

## Intent and agreed behavior

Make contract readiness visible and preserve separate dated notes for follow-up tracking. The user selected individually dated notes and confirmed that users may edit and delete them.

- Render the Client / Company name as a green badge only when the effective displayed status is Active and Paperwork is Complete. Every other combination is red, including expired contracts and missing paperwork status. Preserve wrapping for long names and existing status labels.
- Show individual notes newest first with an automatically recorded added date and time. Editing retains the original added timestamp and shows a last-updated timestamp. Deletion requires confirmation.
- Preserve existing text as one legacy note per contract with “Date unavailable”; never infer an original timestamp.

## Approach

The recommended approach discussed with the user is a separate ContractNotes worksheet in the existing Google Sheets database, with stable note IDs, contract IDs, text, createdAt, and updatedAt. This fits independent add/edit/delete operations without replacing the entire history on each save.

Keeping one editable field with timestamps was rejected in favor of individually dated history. Encoding the entire history in the existing cell avoids a worksheet but makes independent updates more prone to overwriting other notes; use separate records instead. The user approved this design on 2026-10-29.

## Implementation boundaries

Reuse existing authentication, Sheets access, badges, dialogs, services, and error feedback. Validate nonempty note text and parent-contract membership on the server; generate timestamps and IDs there. Store timestamps in UTC and display them in the viewer's local timezone with a visible timezone indication. This timezone choice was proposed by the implementer and included in the approved design.

Replace the notes dialog with an add form and editable history. Keep table previews, contract detail views, create/edit contract flows, and Excel exports consistent with the new history. Creating a contract with an initial note must preserve that note. Editing unrelated contract fields must not overwrite notes.

Preserve legacy text through a retry-safe transition without duplicate legacy entries. Remove obsolete single-field writes once note operations own this data. Contract deletion must handle its associated notes. Provision the worksheet through an idempotent setup path and document deployment requirements; do not change live Sheets during local implementation or testing.

Failed requests retain drafts and show errors. Prevent duplicate submissions. Maintain keyboard access and usable mobile layouts. Editing is not a revision archive, and deletion does not introduce a recycle bin. No new dependencies or unrelated contract changes are planned.

## Verification

Verify badge combinations, including automatic expiration; note creation, ordering, editing with preserved added timestamps, deletion, legacy preservation, invalid inputs, missing contracts, and authentication. Check integration with initial notes, exports, and unrelated contract edits. Run relevant repository checks and inspect the changed UI when a local runtime is available. Report any untested live Sheets behavior explicitly.

## Approval

Approved by the user on 2026-10-29: “Let's proceed with the implementation.” Live data changes and deployment are outside this implementation session.
