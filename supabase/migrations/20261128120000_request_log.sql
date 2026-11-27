-- Idempotent requests (plan 2026-11-28 Task 2): a client retry with the same request id returns the
-- original result instead of saving twice. One row per request id, written in the save's transaction.
create table aic.request_log (
  request_id text primary key,
  scope text not null,
  actor text not null,
  payload_sha256 text not null,
  result jsonb not null,
  source_row integer,
  import_raw jsonb,
  created_by text,
  created_at timestamptz,
  updated_by text,
  updated_at timestamptz
);
alter table aic.request_log enable row level security;
create trigger audit_stamp before insert or update on aic.request_log for each row execute function aic.audit_stamp();
create policy aic_app_all on aic.request_log for all to aic_app using (true) with check (true);
grant select, insert, update, delete on aic.request_log to aic_app;
