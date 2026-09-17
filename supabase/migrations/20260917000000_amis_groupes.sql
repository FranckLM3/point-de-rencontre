create table public.amis (
  id uuid primary key default gen_random_uuid(),
  nom text not null check (char_length(nom) between 1 and 60),
  adresse text not null check (char_length(adresse) between 3 and 200),
  lat double precision not null check (lat between 41 and 51.5),
  lon double precision not null check (lon between -5.5 and 10),
  transport text not null default 'tc' check (transport in ('voiture', 'tc')),
  navigo boolean not null default false,
  maj_le timestamptz not null default now()
);

create table public.groupes (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique check (char_length(nom) between 1 and 40),
  amis uuid[] not null default '{}'
);

alter table public.amis enable row level security;
alter table public.groupes enable row level security;

create policy "groupe connecté : amis" on public.amis
  for all to authenticated using (true) with check (true);
create policy "groupe connecté : groupes" on public.groupes
  for all to authenticated using (true) with check (true);

create or replace function public.toucher_maj_le() returns trigger
language plpgsql as $$ begin new.maj_le := now(); return new; end $$;

create trigger amis_maj_le before update on public.amis
  for each row execute function public.toucher_maj_le();
