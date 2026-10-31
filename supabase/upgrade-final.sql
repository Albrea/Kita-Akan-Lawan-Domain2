-- Run this once in Supabase → SQL Editor if your tables were created before the final-round update.
-- It lets StockNow save "an Orbyte payment needs a person to check" alerts. Nothing else changes.
alter table alerts drop constraint if exists alerts_type_check;
alter table alerts add constraint alerts_type_check check (type in ('PLAN', 'LOW', 'PAYMENT'));

-- Business profile and approved forecast settings (Settings → Business, AI Restock → Forecast settings).
alter table settings add column if not exists business_type text not null default 'clothing';
alter table settings add column if not exists business_years int;
alter table settings add column if not exists forecast_config jsonb;
