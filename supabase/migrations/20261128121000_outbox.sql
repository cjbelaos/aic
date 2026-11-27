-- Side-effect outbox (plan 2026-11-28 Task 3): Google work after a save (PDF export, tracker sync, email)
-- is recorded in the save's transaction and run afterwards, so a failed or retried export can never
-- duplicate or block the document. One pending job per (kind, document).
create table aic.outbox (
  id bigint generated always as identity primary key,
  kind text not null,
  document_key text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  attempts integer not null default 0,
  last_error text,
  next_attempt_at timestamptz not null default now(),
  source_row integer,
  import_raw jsonb,
  created_by text,
  created_at timestamptz,
  updated_by text,
  updated_at timestamptz
);
create unique index outbox_one_pending on aic.outbox (kind, document_key) where status = 'pending';
create index outbox_due on aic.outbox (kind, next_attempt_at) where status = 'pending';
alter table aic.outbox enable row level security;
create trigger audit_stamp before insert or update on aic.outbox for each row execute function aic.audit_stamp();
create policy aic_app_all on aic.outbox for all to aic_app using (true) with check (true);
grant select, insert, update, delete on aic.outbox to aic_app;
