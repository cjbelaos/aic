$planPath = 'C:\Users\chris\KOS\02 - Projects\Active\AIC\MOBILE-RESPONSIVENESS-PLAN.md'
$planText = [IO.File]::ReadAllText($planPath)
$planText = $planText.Replace('- [ ] Adapt `/dashboard/product-units`, `/dashboard/product-categories`, `/dashboard/payment-terms`, `/dashboard/positions`, and `/dashboard/location-addresses` one at a time.', '- [x] Add shared mobile lists to Product Units, Product Categories, Positions, and Location Addresses (implementation complete; full workflow verification pending).' + "`r`n" + '- [ ] Add the Payment Terms mobile list configuration.')
$planText = $planText.Replace('pending).\n- [ ] Adapt `/dashboard/admin/google-token` separately.', 'pending).' + "`r`n" + '- [x] Add responsive padding to the Google Token password gate and generator (layout change only; authorization workflow testing pending).')
$planText = $planText.Replace('- [x] `/dashboard/products` (code updated; browser verification pending)', '- [ ] `/dashboard/products` (mobile list implemented; full route acceptance pending)').Replace('- [x] `/dashboard/supplier-products` (code updated; browser verification pending)', '- [ ] `/dashboard/supplier-products` (mobile list implemented; full route acceptance pending)')
$progress = @'

## PO screenshot review and user acceptance

These checks cover the Chrome responsive view at approximately 390px shown in this conversation. They do not close full route acceptance or M20.

- [x] PO list screenshot reviewed: card fits, status appears at upper right, record details and actions are visible.
- [x] Create PO: full-width dropdowns and stacked PO number controls implemented and shown in screenshots.
- [x] Supplier requirement: Add Item and product selection disabled until a supplier is selected.
- [x] Item editor: full-width product selector, labeled Unit/Quantity/Unit Price/Total fields, and labeled Remove Item action implemented for create and edit.
- [x] Long product name wraps and populated item stays within the dialog in the supplied screenshot.
- [x] Create PO mobile layout approved by Chris after the item redesign.
- [x] Edit PO mobile layout approved by Chris.
- [x] Preview mobile layout approved by Chris after stacking Print, Update Drive PDF, and Open in Drive buttons and moving the supplier below the title.
- [x] Removed sticky create/edit footer behavior that could cover form fields.
- [x] Latest focused TypeScript check passed after preview changes.
- [ ] Verify actual printing, PDF contents/pagination, and Drive save/update behavior.
- [ ] Verify remaining widths, physical phone browsers, keyboard-open behavior, desktop regression, and full workflows.

Progress clarification: M07-M14 checkmarks record the described list/layout edits only. Nested forms, uploads, approvals, and other unchecked scope are not complete. M15 Payment Terms remains unfinished. M19/M20 are not complete; static list checks do not prove full mobile acceptance. The earlier full lint run reported 293 issues; their provenance was not established by a complete baseline comparison.
'@
$planText += $progress
[IO.File]::WriteAllText($planPath, $planText, [Text.UTF8Encoding]::new($false))
$handoffPath = 'C:\Users\chris\KOS\02 - Projects\Active\AIC\handoff.md'
$handoffText = [IO.File]::ReadAllText($handoffPath)
$handoffText += "`r`n## Latest PO mobile acceptance`r`nChris approved the Create PO, Edit PO, and Preview layouts at the approximately 390px Chrome responsive width used in this conversation. Labeled item cards, supplier-first item selection, full-width dropdowns, stacked numbering controls, and preview actions are implemented. TypeScript passed. See the PO screenshot review section in MOBILE-RESPONSIVENESS-PLAN for checked evidence. Printing, Drive updates, other widths, physical devices, and remaining unchecked implementation scope are still pending; M20 is not complete.`r`n"
[IO.File]::WriteAllText($handoffPath, $handoffText, [Text.UTF8Encoding]::new($false))
Write-Output 'Updated mobile checklist and handoff with scoped implementation and user acceptance records.'
