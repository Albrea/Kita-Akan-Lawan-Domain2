-- StockNow database schema for Supabase (PostgreSQL).
-- Run this once in Supabase → SQL Editor. The app fills the tables with the demo shop on first start.
--
-- Security: the demo has no login page, so the browser never talks to Supabase directly.
-- Only the Next.js server (with SUPABASE_SERVICE_ROLE_KEY, kept in Replit Secrets) reads and writes.
-- Row Level Security is switched on with no policies, so the public anon key can read nothing.
-- Times are shop-local text ("YYYY-MM-DD HH:MM", Asia/Kuala_Lumpur), the format the app shows.

create table if not exists settings (
  id              int primary key default 1 check (id = 1),
  business_name   text not null,
  monthly_budget  numeric(12, 2) not null check (monthly_budget >= 0),
  plan_day        int not null default 23 check (plan_day between 1 and 28),
  scenario        text not null default 'mixed',
  po_seq          int not null default 32,
  sales_months    jsonb not null default '[]',
  business_type   text not null default 'clothing',
  business_years  int,
  forecast_config jsonb  -- approved forecast settings (null = the business type's defaults), with who approved and the backtest
);

-- People come from Orbyte Directory; role = StockNow access (null = no access).
create table if not exists people (
  id           text primary key,
  name         text not null,
  email        text not null,
  dept         text not null default '',
  role         text check (role in ('OWNER', 'MANAGER', 'STAFF')),
  leave_until  text,           -- from Orbyte eLeave
  seq          bigint not null
);

create table if not exists suppliers (
  id         text primary key,
  name       text not null,
  contact    text not null default '',
  phone      text not null,
  lead_days  int not null check (lead_days between 1 and 90),
  note       text not null default '',
  seq        bigint not null
);

create table if not exists categories (
  id    text primary key,
  name  text not null,
  seq   bigint not null
);

create table if not exists products (
  id             text primary key,
  name           text not null,
  short_name     text not null,
  sku            text not null unique,
  category_id    text not null,
  min_stock      int not null default 0 check (min_stock >= 0),
  cost_price     numeric(12, 2) not null check (cost_price > 0),
  selling_price  numeric(12, 2) not null check (selling_price > 0),
  supplier_id    text not null default '',
  stock          int not null default 0 check (stock >= 0),
  seq            bigint not null
);

-- Units sold per month, oldest first (the months are listed in settings.sales_months).
create table if not exists sales_history (
  product_id     text primary key,
  monthly_units  jsonb not null default '[]',
  seq            bigint not null
);

create table if not exists stock_transactions (
  id            text primary key,
  created_at    text not null,
  product_id    text not null,
  type          text not null check (type in ('STOCK_IN', 'STOCK_OUT')),
  qty           int not null check (qty > 0),
  stock_before  int not null,
  stock_after   int not null check (stock_after >= 0),
  supplier_id   text not null default '',
  reason        text not null default '',
  po_id         text,
  created_by    text not null,
  pending       boolean not null default false,  -- recorded offline, not synced yet
  seq           bigint not null
);

-- AI restock plans sent for approval. items/analysis keep the AI's numbers and reasons.
create table if not exists purchase_requests (
  id             text primary key,
  code           text not null,
  created_by     text not null,
  created_at     text not null,
  budget         numeric(14, 2),                 -- null = "no limit" plan
  note           text not null default '',
  status         text not null check (status in ('PENDING', 'APPROVED', 'PARTIAL', 'REJECTED')),
  decided_by     text,
  decided_at     text,
  decision_note  text not null default '',
  po_ids         jsonb not null default '[]',
  sent_to        jsonb not null default '[]',
  summary        text not null default '',
  items          jsonb not null default '[]',
  analysis       jsonb,
  seq            bigint not null
);

-- One supplier order per supplier, created when a plan is approved.
create table if not exists purchase_orders (
  id           text primary key,
  code         text not null,
  request_id   text not null,
  supplier_id  text not null,
  created_at   text not null,
  expected_at  text not null,
  sent_at      text,
  chased_at    text,
  approved_by  text not null,
  status       text not null check (status in ('ORDERED', 'PARTIAL', 'RECEIVED')),
  items        jsonb not null default '[]',      -- [{pid, qty, received, unitCost}]
  seq          bigint not null
);

create table if not exists activity_logs (
  id           text primary key,
  created_at   text not null,
  actor_id     text not null,                    -- person id, or 'sys' for automation
  action       text not null,
  description  text not null,
  seq          bigint not null
);

create table if not exists alerts (
  id          text primary key,
  created_at  text not null,
  type        text not null check (type in ('PLAN', 'LOW', 'PAYMENT')),  -- PAYMENT: an Orbyte payment a person must check (po_id holds the payment id)
  product_id  text,
  po_id       text,
  is_open     boolean not null default true,
  seq         bigint not null
);

create index if not exists stock_transactions_seq_idx on stock_transactions (seq desc);
create index if not exists activity_logs_seq_idx on activity_logs (seq desc);
create index if not exists purchase_requests_seq_idx on purchase_requests (seq desc);
create index if not exists purchase_orders_seq_idx on purchase_orders (seq desc);

alter table settings            enable row level security;
alter table people              enable row level security;
alter table suppliers           enable row level security;
alter table categories          enable row level security;
alter table products            enable row level security;
alter table sales_history       enable row level security;
alter table stock_transactions  enable row level security;
alter table purchase_requests   enable row level security;
alter table purchase_orders     enable row level security;
alter table activity_logs       enable row level security;
alter table alerts              enable row level security;
