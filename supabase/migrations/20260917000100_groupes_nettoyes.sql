-- Retire une personne supprimée de tous les groupes qui la contenaient.
-- Les deux fonctions déclenchées reçoivent `search_path = ''` (durcissement
-- Supabase habituel) : tous les noms d'objets sont donc qualifiés `public.`.

create or replace function public.toucher_maj_le() returns trigger
language plpgsql
set search_path = ''
as $$ begin new.maj_le := now(); return new; end $$;

create or replace function public.nettoyer_groupes() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.groupes set amis = array_remove(amis, old.id) where old.id = any(amis);
  return old;
end
$$;

create trigger amis_nettoyer_groupes before delete on public.amis
  for each row execute function public.nettoyer_groupes();
