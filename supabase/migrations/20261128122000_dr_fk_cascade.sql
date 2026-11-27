-- Promoting a draft DR renumbers it (negative placeholder -> real number). Rows that reference the DR
-- follow the new number in the same statement (plan 2026-11-28 Task 4).
alter table aic.delivery_receipt_items drop constraint delivery_receipt_items_dr_number_fkey,
  add constraint delivery_receipt_items_dr_number_fkey foreign key (dr_number) references aic.delivery_receipts (dr_number) on update cascade;
alter table aic.delivery_receipt_status_history drop constraint delivery_receipt_status_history_dr_number_fkey,
  add constraint delivery_receipt_status_history_dr_number_fkey foreign key (dr_number) references aic.delivery_receipts (dr_number) on update cascade;
alter table aic.service_invoices drop constraint service_invoices_dr_number_fkey,
  add constraint service_invoices_dr_number_fkey foreign key (dr_number) references aic.delivery_receipts (dr_number) on update cascade;
alter table aic.sales_invoices drop constraint sales_invoices_dr_number_fkey,
  add constraint sales_invoices_dr_number_fkey foreign key (dr_number) references aic.delivery_receipts (dr_number) on update cascade;
