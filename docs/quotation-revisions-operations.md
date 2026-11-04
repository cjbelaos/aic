# Quotation terms and revisions

## Deployment and schema

The first save adds missing headers V:AA on Quotations while preserving existing data and checking for conflicting headers. V remains DiscountSettings; W is Delivery, X Warranty, Y Revision, Z RevisionPending and AA LastSentAt. Legacy GET requests remain read-only and work with older grid widths. The first archive/send creates QuotationHistory with SendId, QuotationNo, Revision, State, File, SnapshotJSON, SentBy, Recipient, SentAt, MessageId, Error and SnapshotToken.

Existing Google credentials must allow adding Sheets tabs and creating/copying Drive files in the configured quotation folder. History links inherit Drive access; no new public-sharing permission is created.

Payment, delivery and warranty terms are required for all saves (including drafts), current previews, PDF generation and sending; No warranty is valid. Old missing terms are not inferred or backfilled. Q-20261104-002 therefore still needs its actual payment/delivery/warranty terms entered through Revise quotation.

## User workflow

Use Revise quotation on a sent quotation, enter the changes and required terms, then Save revision & preview. Review the PDF and select Send revised quotation. The base reference stays fixed. Original sends are revision 0; saving edits marks a pending next revision; successful delivery records that revision. Resending unchanged content creates another send receipt without advancing the revision.

History shows sent snapshots, immutable PDFs, sender, To/CC recipients and send time. Available legacy sent PDFs are copied before the current quotation changes. Unknown original recipients/send times/unsaved terms are labeled unavailable. Saved detail views are snapshots; the archived PDF is the authoritative representation of previously sent signatures and layout.

## API contract

- GET `/api/quotations/[refNo]/history` requires the existing authenticated session and returns history entries. Reading does not create the history sheet.
- POST `/api/quotations/save-pdf` requires quotationNo, PDF base64 and snapshotToken. It creates a new PDF ID and changes only the current File pointer. A stale token returns 409.
- POST `/api/quotations/send-email` requires multipart quotationNo, sendId, snapshotToken, email, JSON cc array and PDF file. It validates the saved quotation and uses its authoritative customer/amount/description. A send ID is bound to its snapshot and To/CC recipient list. Replaying a completed ID returns its receipt without another email.
- Create/update/status APIs cannot directly mark SENT. The send lifecycle records SENT and the history row in one atomic Sheets batch after SMTP acceptance.

## Recipient review and signatures

Every new send, revision and resend requires a recipient review. To is the single primary contact for the quotation customer company; missing/multiple primary contacts or missing/invalid primary email block sending with a visible error. CC includes all other company contacts with nonblank valid emails plus sales.aerichinnovationcorp@gmail.com. Addresses are normalized and deduplicated across To/CC. If the sales address is itself To, it is not duplicated in CC. Invalid nonblank CC emails also require correction. The previous automatic SMTP-sender CC is replaced by these approved rules.

GET `/api/quotations/[refNo]/recipients` is authenticated and resolves the review list from current company contacts. The review is read-only to preserve the required primary/CC rules; update company contacts to correct recipients. Sending rechecks contacts and rejects a changed list with 409 before uploading or mailing. To/CC are archived in `SnapshotJSON.emailRecipients`, requiring no new history columns. Older history without CC data does not invent it.

A blank/whitespace Approved By removes the whole approval block and its signature line in current print/PDF output. The remaining signatures use two columns. Previously archived PDFs stay unchanged for backtracking.

## Interrupted deliveries

SENDING is persisted before SMTP. An explicit SMTP rejection is FAILED and may be retried. Partial recipient acceptance, a timeout, lost SMTP acknowledgement or failure to persist an accepted send is UNCERTAIN (or remains SENDING if storage is unavailable). Further sends are blocked; the PDF/snapshot remain available for reconciliation. The same-browser client recovers a completed receipt after a lost HTTP response before sending again.

An administrator must check the sender's sent mailbox/SMTP logs and the history MessageId and recipient before reconciling uncertain attempts. Do not mark a delivery failed solely because the caller saw an error. If sent, reconcile the history row and current quotation sent metadata consistently; if conclusively not sent, mark the attempt FAILED. Preserve its snapshot/PDF. No automatic timeout-based resend is used.

`__QuotationWriteLock` serializes all quotation mutations across app instances. If a process crashes leaving this hidden tab, verify that no operation is running and resolve any SENDING/UNCERTAIN history before an administrator removes the orphaned lock. Never remove an active lock on a timer.

## Verification and rollback

Run `npm run test:quotations`, `npm run test:sales-orders`, TypeScript and the production build. Automated tests use in-memory dependencies; they do not send customer emails or write live Sheets/Drive data. Browser PDF pagination and delivery against the production SMTP/Drive account remain runtime checks.

Keep the additive columns, history rows and archived Drive files on rollback. Disable quotation sending/PDF updates before reverting to an older app version that overwrites Drive files, otherwise old behavior could alter a file referenced by sent history. No live schema migration was run as part of implementation.
