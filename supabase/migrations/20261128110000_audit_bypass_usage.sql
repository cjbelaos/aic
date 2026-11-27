-- Fix for 20261128090000: on Supabase, postgres holds an ADMIN-only (non-inheriting) membership in the
-- aic_app role it created, which pg_has_role(..., 'MEMBER') counts, so the importer lost its bypass and
-- re-stamped imported rows. 'USAGE' means "acts with aic_app's privileges": true for aic_app and aic_web,
-- false for the owner/import role.
create or replace function aic.audit_stamp() returns trigger language plpgsql set search_path = '' as $$
declare actor text := nullif(current_setting('aic.actor', true), '');
begin
  if current_setting('aic.importing', true) = 'on' and not pg_has_role(current_user, 'aic_app', 'USAGE') then return new; end if;
  if actor is null then raise exception 'aic.actor is not set for this transaction' using errcode = 'P0001'; end if;
  if tg_op = 'INSERT' then
    new.created_at := now(); new.created_by := actor; new.source_row := null; new.import_raw := null;
  else
    new.created_at := old.created_at; new.created_by := old.created_by;
    new.source_row := old.source_row; new.import_raw := old.import_raw;
  end if;
  new.updated_at := now(); new.updated_by := actor;
  return new;
end $$;
