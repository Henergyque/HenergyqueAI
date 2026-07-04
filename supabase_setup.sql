-- ═══════════════════════════════════════════════════════════
-- HenergyqueAI — Setup Supabase
-- Exécuter dans l'éditeur SQL de supabase.com > SQL Editor
-- ═══════════════════════════════════════════════════════════

-- 1. Table des profils utilisateurs
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  name text,
  plan text not null default 'gratuit' check (plan in ('gratuit', 'pro')),
  api_key text unique,
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz default now()
);

-- 2. Table du compteur d'usage quotidien
create table if not exists usage (
  id bigserial primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  date date not null default current_date,
  count integer not null default 0,
  constraint usage_user_date_uniq unique (user_id, date)
);

-- 3. Index pour les requêtes usage par utilisateur/date
create index if not exists idx_usage_user_date on usage (user_id, date);

-- 4. Fonction RPC pour incrémenter l'usage de manière atomique (évite les race conditions)
create or replace function increment_usage(p_user_id uuid, p_date date)
returns void
language plpgsql
security definer
as $$
begin
  insert into usage (user_id, date, count)
  values (p_user_id, p_date, 1)
  on conflict (user_id, date)
  do update set count = usage.count + 1;
end;
$$;

-- 5. Row-Level Security : chaque utilisateur ne voit que son propre profil
alter table profiles enable row level security;
alter table usage enable row level security;

create policy "profiles: lecture propre" on profiles
  for select using (auth.uid() = id);

create policy "profiles: mise à jour propre" on profiles
  for update using (auth.uid() = id);

create policy "usage: lecture propre" on usage
  for select using (auth.uid() = user_id);

-- Note : les INSERT/UPDATE sur profiles et usage se font via la service_role_key
-- depuis le serveur (api/), qui contourne le RLS. Les policies ci-dessus
-- protègent uniquement les accès directs côté client (anon key).
