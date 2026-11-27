-- Security advisor 0011: pin the audit trigger's search_path. It only calls pg_catalog functions.
alter function aic.audit_stamp() set search_path = '';
