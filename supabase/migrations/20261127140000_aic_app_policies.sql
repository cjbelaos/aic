-- RLS is on for every aic table with no policies, which hides all rows from aic_app (the owner bypasses RLS).
-- aic_app is the server-side app role; authorization is enforced in the app (plan §4/§5), and the public API
-- roles have no usage on schema aic. Grant aic_app full row visibility. import_batches stays read-only.
-- New tables need their own policy in the migration that creates them.
do $$
declare t record;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'aic' and c.relkind = 'r' loop
    if t.relname = 'import_batches' then
      execute format('create policy aic_app_read on aic.%I for select to aic_app using (true)', t.relname);
    else
      execute format('create policy aic_app_all on aic.%I for all to aic_app using (true) with check (true)', t.relname);
    end if;
  end loop;
end $$;
