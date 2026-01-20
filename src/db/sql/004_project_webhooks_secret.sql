-- 004_project_webhooks_secret.sql

-- project_webhooks should not store secrets in plaintext.
-- Keep webhook metadata in this table; store encrypted secret if needed (asana handshake).

alter table project_webhooks add column if not exists encrypted_secret text;

-- migrate existing plaintext secret if the column exists (dev installs)
do $$
begin
  if exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='project_webhooks' and column_name='secret'
  ) then
    update project_webhooks set encrypted_secret = secret where encrypted_secret is null and secret is not null;
  end if;
end $$;

-- optional: remove plaintext column if it exists
alter table project_webhooks drop column if exists secret;
