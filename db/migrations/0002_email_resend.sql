-- Permite o transporte de e-mail via API HTTP (Resend), usado no Cloudflare Workers.
alter table email_outbox drop constraint if exists email_outbox_transport_check;
alter table email_outbox add constraint email_outbox_transport_check check (transport in ('smtp','resend','log','disabled'));
