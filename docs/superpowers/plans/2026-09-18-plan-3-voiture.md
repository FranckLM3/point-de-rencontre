# Plan 3 : voiture et « Chacun son moyen »

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter les modes « Tous en voiture » et « Chacun son moyen » : zones, repaire, villes et lieu testé en temps ou en prix, avec des temps de route réels.

**Architecture:** Une fonction Supabase (Edge Function Deno) appelle la matrice d'OpenRouteService avec une clé secrète et enregistre, pour chaque Croco, les temps et distances vers une grille de 8 km (environ 9000 points en France) dans la table `temps`. Le navigateur lit ces couches, les ramène sur la grille de 4 km, ajoute l'accès local et calcule prix et agrégats. Le mode « Chacun son moyen » prend pour chaque personne la couche de son moyen de transport.

**Tech Stack:** Supabase (Postgres, Edge Functions Deno, secrets), OpenRouteService Matrix API (profil `driving-car`), TypeScript, Vitest, Playwright, GitHub Actions.

Spécification : section 5.2 de `docs/superpowers/specs/2026-09-17-point-de-rencontre-design.md`.

## Faits vérifiés le 2026-09-18

- ORS Matrix : 3500 couples origine x destination au plus par requête ;
  quota quotidien du plan gratuit à relire dans le compte (ordre de
  grandeur connu : 500 matrices par jour, 40 par minute).
- Prix des carburants : `https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records?select=avg(gazole_prix) as gazole,avg(sp95_prix) as sp95,avg(e10_prix) as e10&limit=1`
  renvoie les moyennes nationales (gazole 2,40 €, SP95 2,22 €, E10 2,18 €
  le 2026-09-18).
- Supabase : projet `eisvgokrarrgewkclcdc`, MCP `supabase-pdr` avec
  `apply_migration`, `deploy_edge_function`, `execute_sql`. Les secrets se
  posent dans le tableau de bord (Edge Functions, Secrets) par Franck.

## Décisions

- Grille voiture de 8 km (`public/data/grille-8km.json`, même générateur
  que la grille de 4 km, même élargissement d'une case sur les côtes).
  Environ 9000 points en France, donc 3 requêtes de matrice par personne
  (1 x 3500 au plus).
- Une couche voiture par personne et par version de grille, stockée en
  `bytea` : `uint16` minutes (65535 = injoignable) puis `uint16` km,
  dans l'ordre des points **en France** de la grille de 8 km.
- Recalcul seulement quand l'adresse change (clé = lat, lon arrondis à
  5 décimales, et version de grille).
- Valeur sur la grille de 4 km : interpolation bilinéaire des 4 points de
  8 km voisins (points injoignables ignorés, pondération renormalisée).
- Lieu testé et villes : même interpolation (aucun appel à l'API).
- Prix = km x consommation / 100 x prix du litre + péage estimé
  (0,09 €/km sur 70 % de la distance au-delà de 80 km), divisé par le
  nombre de personnes par voiture (réglage, 1 par défaut). Consommation
  6,5 L/100 et carburant « gazole » par défaut, réglables dans la fiche
  de la personne (plus tard) ; prix du litre lu dans
  `public/data/carburant.json`, mis à jour par la publication.
- Mode « Chacun son moyen » : couche voiture si `transport = 'voiture'`,
  couche transports sinon ; le prix suit la même règle.
- Un Croco dont la couche voiture n'est pas encore calculée est marqué
  « calcul en cours » dans la liste ; la zone est calculée sans lui et un
  bandeau le signale.

## Tâches

### Task 1 : grille de 8 km
- `scripts/generer-grille.mjs` accepte `--pas 8 --sortie public/data/grille-8km.json`.
- Test : la grille générée contient Paris, Brest, Strasbourg, Ajaccio,
  Bastia ; nombre de points en France entre 8500 et 9800.
- Commit `feat: grille de 8 km pour la voiture`.

### Task 2 : table `temps` et politiques
- Migration `supabase/migrations/20260918000000_temps.sql` :
  `temps(ami_id uuid references amis on delete cascade, couche text check (couche in ('voiture')), cle text not null, minutes bytea not null, km bytea not null, maj_le timestamptz default now(), primary key (ami_id, couche))`,
  RLS : lecture pour `authenticated`, aucune écriture côté client (la
  fonction écrit avec la clé de service).
- Appliquée avec le MCP `apply_migration`, vérifiée par `get_advisors`.
- Commit `feat: table des temps en voiture`.

### Task 3 : fonction `voiture`
- `supabase/functions/voiture/index.ts` (Deno) :
  - entrée `POST { ami_id }` avec le jeton de l'utilisateur connecté
    (vérifié par `supabase.auth.getUser`), sinon 401 ;
  - lit l'ami, calcule la clé, rend `{ etat: 'a_jour' }` si la couche
    existe avec la même clé ;
  - sinon charge la liste des points de la grille de 8 km (fichier
    publié sur Pages, URL en variable `GRILLE_URL`), découpe en paquets
    de 3499 destinations, appelle
    `POST https://api.openrouteservice.org/v2/matrix/driving-car` avec
    `{ locations: [[lon, lat] ami, ...points], sources: [0], destinations: [1..n], metrics: ['duration', 'distance'] }`
    et l'en-tête `Authorization: <ORS_CLE>` ;
  - `null` (injoignable) donne 65535 ; écrit la couche (`upsert`) ;
  - erreurs : quota (429) rendu tel quel avec un message français,
    réseau rendu en 502 ; journalise sans adresse ni coordonnées.
- Tests Deno sur le découpage et l'encodage (fonctions pures dans
  `supabase/functions/voiture/encodage.ts`), exécutés en CI avec
  `deno test` (setup-deno).
- Déployée avec le MCP `deploy_edge_function`.
- Commit `feat: fonction de calcul des temps en voiture`.

### Task 4 : prix du carburant
- `scripts/carburant.mjs` lit l'API des prix et écrit
  `public/data/carburant.json` (`{ gazole, sp95, e10, date }`) ; lancé
  par `pages.yml` avant la construction, avec repli sur le fichier commité
  si l'API ne répond pas.
- Commit `feat: prix moyen du carburant`.

### Task 5 : calcul voiture dans le navigateur
- `src/donnees/voiture.ts` : lecture des couches (`select` sur `temps`),
  décodage, déclenchement de la fonction pour les personnes sans couche
  à jour (une à la fois, file d'attente).
- `src/calcul/voiture.ts` : interpolation 8 km vers 4 km, valeur en un
  point, prix (tests avec une petite grille synthétique).
- Commit `feat: temps et prix en voiture`.

### Task 6 : modes « Tous en voiture » et « Chacun son moyen »
- Les interrupteurs de mode reprennent « Voiture » et « Chacun son moyen »
  (Mode : Vol d'oiseau, Transports, Voiture, Chacun son moyen).
- `couches.ts` : mesure et couche par mode ; « Chacun son moyen » par
  personne.
- Réglage « Personnes par voiture » (1 à 4) visible en mode voiture et
  mixte quand la mesure est le prix.
- États : « calcul en cours » par personne, bandeau quota.
- Détail d'un trajet en voiture : « 3 h 12 de route, 468 km, ≈ 71 € ».
- Tests unitaires et e2e (couches voiture simulées).
- Commit `feat: modes voiture et chacun son moyen`.

### Task 7 : mise en ligne
- Franck crée le compte OpenRouteService, pose le secret `ORS_CLE` dans
  Supabase, et la variable `GRILLE_URL` est posée par le MCP ou le
  tableau de bord.
- Fusion, publication, contrôle en ligne : Marseille vers Lyon en voiture
  entre 3 h et 3 h 30.
