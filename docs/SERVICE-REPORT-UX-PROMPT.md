# Prompt: Service Report UI/UX + Responsive Hardening

Save-and-reuse prompt. Copy the block under **The prompt** into a fresh session.
Lines beginning with `>` are Markdown quoting only — strip them if you paste into
a tool that is not Markdown-aware.
Grounding facts were verified against the repository on 23 Sep 2026.

---

## The prompt

> ### Role
>
> You are a senior front-end engineer working in the **aic** Next.js repository at
> `c:\Users\chris\aic`. Your job is a bounded UI/UX and responsive hardening pass
> over the **entire Service Report feature** (all five routes plus its shared
> components), followed by desktop and phone regression checks.
>
> ### Objective
>
> Make the Service Report journey genuinely good on desktop, tablet, and phone —
> and especially good for the technician who fills the report in on a phone at a
> customer site and the customer representative who signs on a phone or tablet.
> Clear hierarchy, no horizontal page scrolling at any width, correct touch
> sizing, reachable actions, and no lost functionality. Do not change business
> logic, the status model, data contracts, permissions, or the signature
> integrity rules.
>
> ### Read these first (do not skip, do not bulk-load anything else)
>
> 1. `c:\Users\chris\aic\AGENTS.md` — repo rules. It states this Next.js is
>    **Next 16** with breaking changes; read the relevant guide under
>    `node_modules/next/dist/docs/` before writing framework code.
> 2. The five routes you are changing:
>    - `src\app\dashboard\service-reports\page.tsx` (91 lines) — list
>    - `src\app\dashboard\service-reports\new\page.tsx` (260 lines) — create
>    - `src\app\dashboard\service-reports\[id]\page.tsx` (281 lines) — detail
>    - `src\app\dashboard\service-reports\[id]\edit\page.tsx` (116 lines) — edit
>    - `src\app\dashboard\service-reports\[id]\acknowledge\page.tsx` (232 lines) —
>      customer review and signature
> 3. The feature's components:
>    - `src\components\service-reports\general-service-report-form.tsx` (153 lines)
>    - `src\components\service-reports\water-treatment-service-report-form.tsx`
>      (290 lines)
>    - `src\components\service-report-signature-pad.tsx` (291 lines)
>    - `src\components\service-report-badges.tsx` (32 lines)
> 4. `src\components\ui\entity-table.tsx` — the shared list component the list
>    route uses, including its opt-in `mobileLayout` stacked-record mode.
> 5. `src\app\globals.css`, lines ~150–200 — the project's existing phone rules.
>    Reuse and extend these; do not duplicate them.
> 6. `src\app\dashboard\layout.tsx` — the shell (sticky header, `main` with
>    `p-3 sm:p-6`) that already wraps every one of these routes.
> 7. `src\components\ui\` — the shadcn/ui primitives you must reuse (button, card,
>    dialog, sheet/drawer, dropdown-menu, badge, checkbox, select, input,
>    textarea, skeleton, alert-dialog, confirm-delete-dialog, tabs, collapsible).
> 8. **Authoritative acceptance criteria for this feature:**
>    - `docs\SERVICE-REPORT-IMPLEMENTATION-PLAN.md` line 243 — "Mobile testing
>      covers 320, 360, 390 and 430 pixel widths, keyboard overlap, signature
>      scrolling, focus order, light/dark themes, and real-device touch input."
>    - Same file, line 220 — Phase 3 exit criteria: "Assigned technician completes
>      the workflow on desktop and phone."
>    - Same file, lines 89–96 — signature canvas requirements.
>    - `docs\SERVICE-REPORT-MVP-PLAN.md` line 96 — Service Report must use "the
>      same page structure, cards, spacing, controls, loading feedback, and
>      responsive behavior as Delivery Release and Sales Orders." Follow the
>      existing `.dr-item-row` / `.po-item-row` phone precedents rather than
>      inventing a new mobile pattern.
>    - Same file, lines 136–147 (signature experience) and line 266.
>    - `docs\WATER-TREATMENT-SERVICE-REPORT-PLAN.md` — the Water Treatment field
>      contract. Layout may change; fields and their meaning may not.
>
> ### Verified current state (treat as the starting point, confirm before editing)
>
> **Coverage gap first — this matters.**
> - Service Report **does not exist anywhere** in
>   `C:\Users\chris\KOS\02 - Projects\Active\AIC\MOBILE-RESPONSIVENESS-PLAN.md`:
>   there is no M-batch for it and no `/dashboard/service-reports` line in the
>   route-coverage list. Report this gap at the end of your pass and propose that
>   Service Report becomes its own batch (five routes, so it is larger than the
>   "one shared component or one complex page" daily-scope rule and should be
>   split). **Do not edit KOS files.**
>
> **What is already right — preserve it.**
> - All five routes already use a `flex min-w-0 flex-col gap-6` wrapper and add
>   **no page padding of their own**; the shell supplies `p-3 sm:p-6`. Do not
>   introduce a `p-6` page wrapper — that is the Document Tracker's double-padding
>   bug, and it is absent here.
> - Definition lists are already responsive: `grid-cols-1 sm:grid-cols-2
>   lg:grid-cols-3` on the detail page (line ~120), `grid-cols-1 gap-3
>   sm:grid-cols-2` for acknowledgment details (line ~209), `grid-cols-1 gap-2
>   sm:grid-cols-2` for Before/After measurements (line ~146), `grid-cols-1 gap-4
>   md:grid-cols-2` on the acknowledgment form (line ~186), `flex flex-col` for
>   samples and equipment (lines ~160, ~168). Mostly sound — verify, don't rewrite.
> - Header action clusters already use `flex flex-wrap` (detail page line ~99
>   header, line ~105 actions; edit page line ~80; acknowledgment `CardFooter`).
>   Verify they fit 320px rather than assuming they do.
> - The list route already passes `mobileLayout={{ primary: ["reportNo",
>   "customer", "serviceDate", "status"], labels: {...} }}` and its three row
>   actions are `variant="ghost" size="icon"` buttons carrying `title` attributes
>   ("View Service Report", "Edit draft", "Open final PDF"). `globals.css` turns a
>   `title` into a visible label inside `.mobile-record-actions` on phone —
>   **keep those `title` attributes**, they are load-bearing.
> - The signature pad is deliberately engineered: strokes stored in unit
>   coordinates (0..1), a `ResizeObserver` that re-renders on rotation/resize so
>   the drawing survives, `touchAction: "none"` plus `onTouchMove` prevention so
>   the page never scrolls mid-stroke, palm/scroll-accident cancel handling, and
>   a PNG exported only on submit. **Do not change the drawing model,
>   coordinate system, resize behaviour, PDF/PNG export, or the meaningfulness
>   gate (`MIN_POINTS`, `MIN_STROKE_LENGTH_CSS`, `MIN_BBOX_DIAGONAL_CSS`).**
>
> **Likely defects to confirm and fix.**
> - **Loading states collapse.** Detail, edit, and acknowledge all render
>   `<Card className="animate-pulse bg-muted" />` with **no height**, so on a phone
>   the loading state is a thin empty bar instead of a believable page skeleton.
>   Use the existing `Skeleton` primitive to mirror the real layout.
> - **Create page, line ~152:** `mt-4 grid grid-cols-1 gap-4 md:grid-cols-2` with
>   `md:col-span-2` children (the amber warning banner at ~153 and the
>   exception-details `Textarea` at ~179). The report-type choice buttons are a
>   stacked set of large `<button>` cards (icon + label + description) — check
>   their height and tap area at 320px, and check the `SearchableSelect` invoice /
>   customer / technician pickers wrap without clipping.
> - **Create page, line ~185:** `grid grid-cols-1 gap-3 sm:grid-cols-2`.
> - **List page:** the status filter is a `Select` with a fixed `h-8 w-52`
>   trigger, sharing a wrapping toolbar with the page-size select, Export, and
>   Import. Verify 320px, and note the `labels` map on the list has no `actions`
>   entry.
> - **Detail page:** up to four header actions (Edit Draft, Acknowledge, Retry
>   PDF, Void) on one wrapping row; the Void dialog is `max-w-md` with a required
>   reason `Input`; there is **no Back control** on this page, which is a real
>   navigation cost on phone.
> - **Edit page:** the report-type `Select` sits in a `max-w-sm` block; report type
>   changes and the unsaved-changes guard both use raw `window.confirm` (lines ~61
>   and ~74).
> - **Acknowledge page:** the long `ACKNOWLEDGMENT_TEXT` block, the consent
>   `Checkbox` row, and the signature card plus its `CardFooter` submit button all
>   compete for a small screen. Browser keyboard and browser chrome are the main
>   risks: the submit button must stay reachable after typing a name and drawing a
>   signature. `globals.css` has **no rule for `[data-slot="checkbox"]` tap size**
>   — the checkbox itself is likely under 44px even though its `<label htmlFor>`
>   is clickable.
> - **Signature canvas** is `h-48 w-full sm:h-56` (192px / 224px tall). In phone
>   landscape this can crowd the Clear/Redraw row and the submit button. The
>   Clear/Redraw buttons are `h-8 px-2 text-xs`; the global phone rule gives every
>   `[data-slot="button"]` a 44px minimum height, so verify rather than assume.
> - **`EntityTable` is used by 25 dashboard routes.** Any change to it must be
>   additive and opt-in behind a new optional prop; never change existing default
>   rendering for the other 24 routes.
> - `next.config.ts` enables CORS on `/api/:path*` for a separate Flutter mobile
>   client, so **`/api` request/response shapes are a public contract — do not
>   change them** (this includes the signature multipart upload).
>
> ### Required work
>
> **A. `/dashboard/service-reports` (list)**
> - Verify the phone record shows Report No. + status, customer, service date, and
>   technician, with report type and Service Invoice in the "More details"
>   disclosure. Add an `actions` entry to `labels` if the action row needs a
>   heading on phone.
> - Keep the status filter counts and values exactly as they are; make the trigger
>   fluid (`w-full sm:w-52`) so it cannot squeeze the toolbar.
> - Confirm Export/Import, the page-size select, pagination, sorting, and
>   row-click navigation all work on phone, and that Export still emits the full
>   filtered set.
>
> **B. `/dashboard/service-reports/new` (create)**
> - Make the report-type choice readable and tappable at 320px with a clear
>   selected state, and keep the "type is fixed once created" note visible.
> - Stack the metadata fields cleanly on phone; keep `readOnly` snapshot fields
>   from dominating the screen (they are reference, not input).
> - Make sure the validation, blocked-invoice, and existing-report conflict
>   messages (`conflict`, `error`, `blockedMatches`, the "already has a report"
>   hint) remain visible next to the control they concern, and the `CardFooter`
>   submit button stays reachable and disabled for the same reasons as today.
>
> **C. `/dashboard/service-reports/[id]/edit`**
> - **Preserve the stored-type dispatch rule**: the form is chosen from
>   `report.reportType` in the loaded report, never from a query parameter. Do not
>   change that comment or that behaviour.
> - Make the header, the status badge, and the Back control work on a 320px
>   header row, and make the report-type `Select` full-width on phone.
> - Replace the two raw `window.confirm` calls with the project's existing
>   `AlertDialog` (`src/components/ui/alert-dialog.tsx`) so the type change and the
>   unsaved-changes guard are styled, focus-managed, and readable on phone —
>   keeping the same wording intent and the same cancel/confirm outcomes.
> - Keep the unsaved-changes `beforeunload` guard working.
>
> **D. `/dashboard/service-reports/[id]` (detail)**
> - Group the header row so the report number and statuses read first, then the
>   actions; if the four actions cannot sit comfortably at 320px, demote the
>   occasional one (Retry PDF) into a labelled More menu — but keep Void visually
>   distinct.
> - Add a Back affordance to the report list so phone users are not dependent on
>   browser chrome.
> - Keep every field and every section (Service information, the Water Treatment
>   measurement / sample / equipment cards or the General field report, Customer
>   acknowledgment, History), the PDF-open button, the signature image block, and
>   the Void dialog with its required reason. There is no watermark today — do not
>   add one. A voided report is currently communicated only by its status badge; if
>   you strengthen that, derive it from the existing `status` value.
> - Verify the scaled-down signature image (`h-28 w-full object-contain`) and long
>   unbroken values (addresses, remarks) wrap instead of forcing horizontal
>   scroll.
>
> **E. `/dashboard/service-reports/[id]/acknowledge` (customer signature flow) —
> highest-value mobile surface, treat it as the priority**
> - Make this a comfortable one-handed flow: review the report, type the name and
>   position, read the acknowledgment statement, tick consent, draw, submit.
> - Ensure the acknowledgment text is readable without dominating the screen, and
>   that the consent control has a generous tap area (the label already toggles
>   the checkbox via `htmlFor`; make the checkbox itself comfortably tappable).
> - Keep the signature canvas usable in portrait **and** landscape, ensure
>   Clear/Redraw stay visible next to the canvas, and ensure the submit button
>   remains reachable with the on-screen keyboard open. Do not shrink the canvas
>   so far that signing becomes hard, and do not break stroke preservation across
>   rotation or resize.
> - Keep the validation contract identical: submit stays disabled until full name +
>   consent + meaningful ink + exported PNG. Keep the inline field error.
> - Confirm that submitting twice, backing out, or retrying after a failed upload
>   cannot produce a second acknowledgment.
>
> **F. Shared and cross-cutting**
> - Replace the three height-less `animate-pulse bg-muted` loading cards with
>   `Skeleton`-based page skeletons that match the real layout.
> - Extend `globals.css` inside the existing
>   `@media screen and (max-width: 767px)` block rather than adding a new
>   stylesheet: add a checkbox/consent tap-size rule if you confirm the gap, and
>   add a page-scoped class (follow the `.dr-item-row` / `.po-item-row` naming
>   precedent, e.g. `sr-*`) only if a layout genuinely cannot be expressed with
>   utilities.
> - Keep accessible names on icon-only controls, keep focus order logical, keep
>   light/dark parity, and reuse existing primitives and `lucide-react` icons. Do
>   not add new dependencies.
>
> ### Non-goals / guardrails (hard)
>
> - Do not touch services, API routes, Sheets helpers, the schema, validation, the
>   status model, commands, history, permissions, PDF generation, or Drive upload.
> - Do not change the signature's data contract: PNG-only-on-submit, private Drive
>   folder, no base64 in Sheets or logs.
> - Do not weaken or strengthen the acknowledgment gate. Full name + consent +
>   meaningful ink + exported PNG stay required, exactly as now.
> - Do not change the stored-type dispatch (form chosen from the loaded report's
>   `reportType`, never a query parameter) or the immutability of report type after
>   non-draft status.
> - Do not render Water Treatment answers into the General `fieldReport` or a
>   catch-all column, and do not let either report type show the other's fields.
> - Do not change other routes. `EntityTable` has 25 consumers; additive, opt-in
>   props only.
> - Do not remove any field, section, action, or validation message — move it,
>   don't drop it.
> - Do not run `npm run dev` or any watch/streaming command. Do not bulk-search the
>   repo.
> - If a fix fails three times, stop and report the evidence instead of continuing
>   to guess.
>
> ### Definition of done (from the project's own Service Report plans)
>
> - [ ] Verified at **320, 360, 390, 430** px, tablet, and desktop
>       (`docs\SERVICE-REPORT-IMPLEMENTATION-PLAN.md` line 243).
> - [ ] No horizontal page scrolling at any of those widths; nothing clipped.
> - [ ] Touch targets ≥44px, readable body text, 16px inputs on phone.
> - [ ] Keyboard overlap checked on the create, edit, and acknowledge forms.
> - [ ] Signature scrolling checked: the page does not scroll while drawing, and
>       Clear / Redraw / Submit stay reachable (portrait **and** landscape).
> - [ ] Focus order checked on every route; light/dark checked on every route.
> - [ ] Real-device touch input checked or explicitly listed as outstanding.
> - [ ] The whole technician journey (create → edit → mark ready) and the whole
>       acknowledgment journey work on a phone, per Phase 3/4 exit criteria.
> - [ ] Repeat of the MVP acceptance list: empty and accidental signatures
>       rejected, Clear/Redraw work, rotation does not erase the signature, signed
>       report is read-only, PDF failure preserves the acknowledgment, void needs a
>       reason and the right permission.
>
> ### Verification (run these; keep output quiet)
>
> ```
> npx tsc --noEmit
> npm run lint
> npm run build
> npm run test:service-reports
> ```
>
> `tsc` must exit 0, the build must compile, and the Service Report test script must
> still pass. Lint must show no new errors in the files you touched. Do not run
> `npm run dev`.
>
> ### Process
>
> 1. First reply with a short plan: the defects you confirmed, the files and line
>    ranges you will change, and your intended phone layout per route — then wait
>    for confirmation before editing.
> 2. Because this feature has five routes, split the work into bounded batches and
>    do **one route per batch**, in this order: list → detail → edit → create →
>    acknowledge. Do not attempt the whole feature in one pass.
> 3. Finish each batch with a change summary, the verification commands you ran
>    with their results, and an explicit list of what still needs real-browser or
>    real-device verification.
> 4. At the end, report the KOS coverage gap: Service Report has no mobile batch and
>    no route-coverage line in
>    `C:\Users\chris\KOS\02 - Projects\Active\AIC\MOBILE-RESPONSIVENESS-PLAN.md`.
>    Propose where it belongs; do not edit KOS files yourself.

---

## Why this prompt is written this way

| Prompt element | Why it matters here |
| --- | --- |
| Five routes listed with exact paths and line counts | Service Report is not one page — it's a 91+260+281+116+232-line journey plus four components. Without the map, an agent explores instead of fixing. |
| "Coverage gap first" | Service Report is absent from the KOS mobile checklist entirely. The pass should close that gap by *reporting* it, not by inventing a batch number. |
| The signature pad's frozen contract | It is already correct-by-design (unit coordinates, ResizeObserver, touch-action, PNG-on-submit). The most likely regression is an agent "simplifying" it while making the page responsive. |
| Acknowledgment gate frozen | `fullName + consent + meaningfulInk + png` is a legal/integrity control, not a UX detail. |
| Stored-type dispatch rule | The edit page's comment says the stored `reportType` decides the form. Changing that to a query param would silently render the wrong report type. |
| Project's own line 243 as DoD | Real per-width, keyboard-overlap, signature-scrolling, focus, and dark-mode criteria already exist — no need to invent acceptance criteria. |
| `Skeleton` for loading states | The current `<Card className="animate-pulse bg-muted" />` has no height; it is a visible defect on phone, not a style preference. |
| One route per batch, list → detail → edit → create → acknowledge | The KOS working agreement permits one complex page per session; this feature is five pages, so it must be sequenced or it will be rushed. |
| `window.confirm` → `AlertDialog` | `confirm-delete-dialog.tsx` / `alert-dialog.tsx` already exist in `src/components/ui`; raw `window.confirm` is inconsistent and poor on mobile. |
| `EntityTable` 25-consumer warning | Prevents breaking the other 24 list routes while polishing this one. |

## Suggested follow-ups after this pass

- Add Service Report as its own batch in the KOS mobile checklist, split per route,
  and add `/dashboard/service-reports` (plus its three sub-routes) to the route
  coverage list.
- Consider whether the Service Invoice list and preview's **Create Service Report**
  action (required by `SERVICE-REPORT-IMPLEMENTATION-PLAN.md` line 77) is reachable
  on a phone — that is a Service Invoice route concern, out of scope here.
- Water Treatment measurement cards are the densest phone surface in this feature.
  If a two-column Before/After pair proves too tight at 320px, promote it to the
  KOS "dense report matrix" exception list rather than hiding values.
- When a real device is available, close out the "real-device touch input" and
  "keyboard overlap" items that cannot be verified in a desktop browser.
