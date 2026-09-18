-- Temps et distances en voiture d'un Croco vers la grille de 8 km.
-- Écrite uniquement par la fonction Edge `voiture`, avec la clé de service
-- (aucune politique d'écriture pour `authenticated` : lecture seule côté client).

create table public.temps (
  ami_id uuid not null references public.amis (id) on delete cascade,
  couche text not null check (couche in ('voiture')),
  cle text not null,
  minutes bytea not null,
  km bytea not null,
  maj_le timestamptz not null default now(),
  primary key (ami_id, couche)
);

alter table public.temps enable row level security;

create policy "groupe connecté : lecture temps" on public.temps
  for select to authenticated using (true);
