-- One custody record per document (plan 2026-11-28 Task 6). Sheets relied on a read-then-append check;
-- here the database enforces it. Snapshot 1 has no duplicate keys.
drop index if exists aic.document_handovers_document_type_document_number_idx;
create unique index document_handovers_document_key on aic.document_handovers (document_type, document_number);
