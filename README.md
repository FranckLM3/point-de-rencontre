# Point de rencontre

Où se retrouver entre amis : la carte de France colorée selon la distance de chacun, le meilleur point, les villes classées et le détail d'un lieu testé. Vol d'oiseau pour l'instant, voiture et transports ensuite.

Spécification : `docs/superpowers/specs/2026-09-17-point-de-rencontre-design.md`.
Plan en cours : `docs/superpowers/plans/2026-09-17-plan-1-socle-vol-oiseau.md`.

## Développer

```bash
cp .env.example .env.local   # renseigner les trois valeurs
npm install
npm run dev
```

- `npm test` : tests unitaires.
- `npm run e2e` : parcours dans un navigateur, Supabase simulé (ordinateur et téléphone).
- `npm run donnees` : régénère la grille de 4 km et la liste des villes (déjà commitées).

Les adresses ne sont jamais dans ce dépôt : elles vivent dans Supabase, derrière le mot de passe du groupe.

## Mettre en place Supabase (une fois)

1. Créer un projet sur supabase.com, région Europe.
2. SQL Editor : exécuter, dans l'ordre, les fichiers de `supabase/migrations/`.
3. Authentication, Sign In / Providers, Email : désactiver « Allow new users to sign up ».
4. Authentication, Users, Add user : e-mail du groupe et mot de passe du groupe.
5. Project Settings, API : relever l'URL du projet et la clé publique `anon`.
6. Facultatif : charger les premières personnes depuis un fichier SQL gardé hors du dépôt.

## Publier

Variables du dépôt GitHub (Settings, Secrets and variables, Actions, Variables) :
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `COMPTE_EMAIL`. Pages : source « GitHub Actions ».

Chaque push sur `main` lance les tests, le parcours dans le navigateur, la construction et la publication. Le workflow `reveil` interroge la base deux fois par semaine pour éviter la mise en pause du projet gratuit.

Vérifier après la première publication :

```bash
# Sans connexion, aucune adresse ne sort : la réponse doit être []
curl -s "$SUPABASE_URL/rest/v1/amis?select=*" -H "apikey: $SUPABASE_ANON_KEY"
# L'inscription doit être fermée : la réponse doit contenir « Signups not allowed »
curl -s -X POST "$SUPABASE_URL/auth/v1/signup" -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" -d '{"email":"essai@exemple.fr","password":"essai-123456"}'
```

Changer le mot de passe du groupe : Authentication, Users, le compte du groupe.
