# Prompt: Document Tracker UI/UX + Responsive Hardening

Save-and-reuse prompt. Copy the block under **The prompt** into a fresh session.
Lines beginning with `>` are Markdown quoting only — strip them if you paste into
a tool that is not Markdown-aware (or copy the plain-text version in chat).
Grounding facts were verified against the repository on 23 Sep 2026.

---

## The prompt

> ### Role
>
> You are a senior front-end engineer working in the **aic** Next.js repository at
> `c:\Users\chris\aic`. Your job is a bounded, single-route UI/UX and responsive
> hardening pass on the **Document Tracker**, followed by desktop and phone
> regression checks.
>
> ### Objective
>
> Make `/dashboard/document-tracker` genuinely good on both desktop and phone:
> clear information hierarchy, no horizontal page scrolling at any width, all
> existing functionality (search, filters, sorting, pagination, selection, row
> actions, permissions, export) preserved, obvious primary actions, and correct
> touch sizing — without changing any business logic, data contracts, or
> permissions.
>
> ### Read these first (do not skip, do not bulk-load anything else)
>
> 1. `c:\Users\chris\aic\AGENTS.md` — repo rules. It states this Next.js is
>    **Next 16** with breaking changes; read the relevant guide under
>    `node_modules/next/dist/docs/` before writing framework code.
> 2. `c:\Users\chris\aic\src\app\dashboard\document-tracker\page.tsx` (~1474 lines,
>    `"use client"`) — the route you are changing.
> 3. `c:\Users\chris\aic\src\components\ui\entity-table.tsx` — the shared list
>    component this page uses, including the opt-in `mobileLayout` stacked-record
>    mode.
> 4. `c:\Users\chris\aic\src\app\globals.css`, lines ~150–200 — the project's
>    existing phone rules. Reuse and extend these; do not duplicate them.
> 5. `c:\Users\chris\aic\src\app\dashboard\layout.tsx` — page shell, header, and
>    padding that already applies around your route.
> 6. `c:\Users\chris\aic\src\components\ui\` — the shadcn/ui primitives you must
>    reuse (button, dialog, sheet, drawer, dropdown-menu, card, badge, checkbox,
>    collapsible, tabs, skeleton, table, searchable-select, date-picker).
> 7. `C:\Users\chris\KOS\02 - Projects\Active\AIC\MOBILE-RESPONSIVENESS-PLAN.md` —
>    the authoritative checklist. This route is batch **M12 (Collections and
>    document tracking)**; its route-coverage checkbox is still open. Apply the
>    document's *Design decisions* and *Definition of done* literally.
>
> ### Verified current state (treat as the starting point, confirm before editing)
>
> - Route wrapper is `<div className="p-6 space-y-6">` (page.tsx ~line 753). The
>   dashboard shell already applies `p-3 sm:p-6` to `<main>`, so the page's own
>   `p-6` stacks on top and wastes ~48px of width on a 360px phone. Fix the
>   double padding.
> - Header block (page.tsx ~755–833) is `flex flex-col md:flex-row`, but the
>   action cluster inside it is `flex items-center gap-2` with **no wrapping** and
>   holds up to five controls: *My Docs Only* checkbox, *Refresh*, the
>   Receive/Verify segmented toggle, *Receive Documents* / *Verify Received
>   Documents*, and *Assign Document* (admin). At 360px this row overflows.
> - KPI strip (page.tsx ~836–879): `grid grid-cols-1 md:grid-cols-3 gap-4` with
>   three cards (*Total Tracked*, *Awaiting After Sales*, *Returned*). Each card
>   repeats its meaning in a long description line — redundant on phone.
> - Main list (page.tsx ~882–969) is `<EntityTable>` with
>   `mobileLayout={{ primary: ["documentNumber", "customerName", "status"], ... }}`.
>   `EntityTable` renders a stacked record list below `md` and the real table at
>   `md`+ (entity-table.tsx ~line 330–357), exposes `data-mobile-list`, and
>   paginates the mobile list with a "Page X of Y" label.
> - `EntityTable` is used by **25 dashboard routes**. Any change to it must be
>   additive and opt-in behind a new optional prop; never change existing default
>   rendering for the other 24 routes.
> - **Assign Documents dialog** (page.tsx ~974–1235, `sm:max-w-[800px]
>   max-h-[90vh] overflow-y-auto`): the document picker uses `grid grid-cols-12`
>   header + rows with `col-span-1 / col-span-3 / col-span-4 / col-span-4`, and
>   `truncate` on the customer cell. On a phone this squeezes three columns plus a
>   checkbox into ~320px and clips the customer name.
> - **Receive / Verify dialog** (page.tsx ~1240–1420, `sm:max-w-[800px]
>   max-h-[90vh] flex flex-col`): filters use `grid gap-3
>   sm:grid-cols-[1fr_auto_auto]`, the results panel is
>   `max-h-[48vh] overflow-y-auto` with the same `grid grid-cols-12` rows and a
>   `min-w-48` assignee select.
> - **Single document return dialog** (page.tsx ~1429+).
> - Existing global phone rules (globals.css) already guarantee 44px minimum
>   touch targets for `[data-slot="button" | "select-trigger" | "tabs-trigger" |
>   "sidebar-menu-button"]`, 16px inputs, `[data-slot="dialog-content"]`
>   `max-height: 92dvh` with `max-width: calc(100vw - 24px)`, wrapping dialog
>   footers, and `[data-mobile-list="true"]` / `.mobile-record-actions` hooks that
>   surface a button's `title` as a visible label. There is precedent for
>   page-scoped phone CSS (`.dr-item-row`, `.po-item-row`).
> - `next.config.ts` enables CORS on `/api/:path*` for a separate Flutter mobile
>   client, so **`/api` request/response shapes are a public contract — do not
>   change them.**
>
> ### Required work
>
> **A. Page shell and header**
> - Remove the redundant page padding so content spans `3 / sm:6` only once.
> - Make the header action cluster wrap and re-flow on phone: primary action
>   first and full-width at `sm` and below where it reads better, secondary
>   actions grouped, occasional actions behind a clearly labelled More menu
>   (`DropdownMenu`) if the row still cannot fit 360px comfortably.
> - Keep *Assign Document* visible only for admins and *Receive/Verify* only for
>   the roles that currently see them. **Do not change `isAdmin`,
>   `canReceiveDocuments`, `canVerifyDocuments`, `isSuperAdmin`, or
>   `AFTER_SALES_DOCUMENT_RECEIVER_ID` logic.**
> - Keep *My Docs Only*, *Refresh* (with its spin and disabled states), and the
>   workflow toggle behaving exactly as today.
>
> **B. KPI strip**
> - Make it survive 320px: aim for a compact stacked or 2-up arrangement with
>   readable numbers, and drop or shorten the explanatory sublines on phone.
> - Numbers, colours, and which values are counted must not change
>   (`stats.total`, `stats.pending`, `stats.returned`).
>
> **C. Main handover list**
> - Review the `mobileLayout` mapping. The phone record must clearly show
>   document type + number, customer, assigned-to, assigned date, and status, with
>   the remaining fields inside the existing "More details" disclosure, and every
>   row action reachable. Update `primary` / `labels` (or add an optional
>   `EntityTable` prop) rather than forking a second list.
> - Confirm the phone toolbar (page-size select, the *Assigned to* and *Status*
>   selects passed via `toolbarFilters`, Export) wraps without clipping, and that
>   Export still emits the full filtered dataset, not just visible fields.
> - Confirm empty, loading, and error states are readable on phone.
>
> **D. Dialogs**
> - Replace the fixed `grid grid-cols-12` picker rows in the Assign and
>   Receive/Verify dialogs with a layout that works at 320px: a stacked
>   label/value record on phone (follow the page's existing class-name
>   convention, e.g. a `dt-picker-row` rule inside the existing
>   `@media screen and (max-width: 767px)` block in globals.css) and the column
>   grid at `md`+. Remove `truncate`, or pair it with a way to read the full
>   value.
> - Ensure pickers scroll internally, avoid `vh`-only heights where the on-screen
>   keyboard matters, and keep the confirm button reachable without scrolling past
>   a long list.
> - Selection state (select-all, per-group indeterminate checkbox, per-document
>   checkbox, "N selected", Clear All) must keep working identically.
>
> **E. Accessibility and consistency**
> - Preserve or add accessible names on every icon-only control; keep focus order
>   logical and keep the no-horizontal-scroll behaviour.
> - Maintain light/dark parity (the page already uses paired `dark:` classes).
> - Reuse existing shadcn primitives and `lucide-react` icons; follow the
>   existing class-name and formatting conventions in the file. Do not add new
>   dependencies.
>
> ### Non-goals / guardrails (hard)
>
> - Do not touch services, API routes, Sheets helpers, validation, workflow logic,
>   or any file outside the Document Tracker route — except strictly additive
>   changes to `src/components/ui/entity-table.tsx` and `src/app/globals.css`.
> - Do not change A4 print styles, PDF generation, or Drive behaviour.
> - Do not change other routes. `EntityTable` has 25 consumers; additive, opt-in
>   props only.
> - Do not remove any feature, column, filter, or action — move it, don't drop it.
> - Do not run `npm run dev` or any watch/streaming command. Do not bulk-search
>   the repo.
> - If a fix fails three times, stop and report the evidence instead of continuing
>   to guess.
>
> ### Definition of done (from the project's own mobile plan)
>
> - [ ] Verified at **320px, 360px, 390px, 430px**, tablet, and desktop — including
>       long customer names, long notes, many records, and empty/loading/error
>       states.
> - [ ] No horizontal page scrolling at any of those widths; nothing clipped.
> - [ ] Touch targets ≥44px, readable body text, 16px form inputs on phone.
> - [ ] Dialog content fits `100vw`, scrolls internally, footer actions reachable,
>       works in portrait and landscape.
> - [ ] Desktop layout unchanged in quality; keyboard navigation still works.
> - [ ] Search, filters, sorting, pagination, selection, row actions, admin
>       actions, and Export all verified working on both phone and desktop.
> - [ ] Light and dark mode checked.
>
> ### Verification (run these; keep output quiet)
>
> ```
> npx tsc --noEmit
> npm run lint
> npm run build
> ```
>
> `tsc` must exit 0 and the build must compile. Lint must show no new errors in
> the files you touched. Do not run `npm run dev`.
>
> ### Process
>
> 1. First reply with a short plan: the exact defects you confirmed, the files and
>    line ranges you will change, and your intended mobile layout — then wait for
>    confirmation before editing.
> 2. Work in one bounded batch per session. Do not mix in unrelated routes or
>    pending DR/PO work.
> 3. Finish with a change summary, the verification commands you ran with their
>    results, and an explicit list of what still needs real-browser verification.
> 4. Report the updated state for KOS batch **M12** and the
>    `/dashboard/document-tracker` route-coverage checkbox so the KOS checklist
>    and `handoff.md` can be updated. Do not edit KOS files yourself.

---

## Why this prompt is written this way

| Prompt element | Why it matters here |
| --- | --- |
| Named file paths and line ranges | The page is ~1474 lines of mostly bespoke JSX; pointing at exact blocks avoids wasted exploration. |
| "Verified current state" section | Gives the agent the defect list up front so it spends tokens fixing, not auditing. |
| `EntityTable` has 25 consumers | Prevents the classic regression where a shared list component is "improved" for one route and broken for 24. |
| `/api` CORS note | There is a separate Flutter mobile client; API shape is a contract. |
| KOS M12 reference | Ties the work to the project's existing acceptance checklist instead of inventing new criteria. |
| Explicit width matrix (320/360/390/430) | Removes "looks fine on my screen" ambiguity. |
| Guardrail on logic | The route is permission- and workflow-sensitive (Admin, After Sales receive/verify, returns). |
| Process: plan first, then edit | Matches the repo's working agreement: one bounded batch per session. |

## Suggested follow-ups after this pass

- Extend the same treatment to `/dashboard/collections` (the other half of M12).
- Add `.mobile-record-actions` labels to any remaining icon-only row actions on
  this route so the phone list shows text, not just glyphs.
- When a connected browser is available, close out the M12 browser-verification
  gap and the route-coverage checkbox in the KOS checklist.
