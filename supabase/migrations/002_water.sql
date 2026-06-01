-- 002_water.sql — water tracking table

create table if not exists public.water_logs (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  date         date not null,
  amount_ml    numeric not null default 0,
  updated_at   timestamptz not null default now(),
  unique (profile_id, date)
);

alter table public.water_logs enable row level security;

create policy "authenticated_all" on public.water_logs
  for all
  to authenticated
  using (
    profile_id in (
      select id from public.profiles where auth_user_id = auth.uid()
    )
  )
  with check (
    profile_id in (
      select id from public.profiles where auth_user_id = auth.uid()
    )
  );
