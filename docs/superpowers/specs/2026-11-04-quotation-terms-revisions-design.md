# Quotation terms and sent revision history

Approved in chat on 2026-11-04. Payment terms are mandatory for every save, including drafts. Delivery and warranty are mandatory before sending; `No warranty` is valid and must be printed. Store and reload these fields consistently. Print, download and email use the same document component.

Sent quotations can be revised under the same base reference. Saving edits marks an unsent revision; sending successfully advances the revision (original is 0). Preserve each sent snapshot, PDF, sender, recipient and send time in QuotationHistory. Preserve an available legacy sent PDF before editing or replacing it; unknown historical terms must remain unknown. Display revision separately in the PDF and email.

Approach: additive quotation columns plus a dedicated history sheet, authenticated history endpoint and server-controlled send completion. This retains existing quotation references and makes history independently reviewable. Replacing the previous PDF loses backtracking; allocating new quotation numbers conflicts with the approved workflow.

Implementation choices: use existing authentication and Sheets/Drive/SMTP integrations; no dependencies. Detect stale document submissions, serialize modifications per quotation, persist send attempts before SMTP, and refuse automatic resend after uncertain delivery. Changes to live historical terms are not inferred. Do not send customer emails or modify live quotation data during tests.
