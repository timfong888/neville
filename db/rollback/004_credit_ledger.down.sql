-- Reverses db/migrations/004_credit_ledger.sql. Run by hand; the migration runner never reads this folder.
-- Drops every credit grant and spend, so export the table first if any purchase has been made.
-- Also delete the row in schema_migrations if the migration should run again later:
--   delete from schema_migrations where name = '004_credit_ledger.sql';
drop table if exists credit_ledger;
