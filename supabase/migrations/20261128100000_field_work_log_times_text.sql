-- FieldWorkLogs timeStart/timeEnd are times of day shown as HH:MM:SS; they were mapped as numbers
-- (day fractions). Store the displayed text, as the app reads it.
alter table aic.field_work_logs
  alter column time_start type text using to_char(time '00:00' + time_start * interval '1 day', 'HH24:MI:SS'),
  alter column time_end type text using to_char(time '00:00' + time_end * interval '1 day', 'HH24:MI:SS');
