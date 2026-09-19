# Plan 4 : réseaux urbains (Île-de-France, Lyon, Marseille)

**Goal:** remplacer l'estimation forfaitaire de l'accès aux gares, du dernier kilomètre et des trajets dans une même ville par de vrais temps en métro, RER, Transilien, tram et funiculaire, à Paris et en Île-de-France, à Lyon et à Marseille.

**Architecture:** un calcul Python hebdomadaire (même bibliothèque standard que `horaires/`) lit le GTFS de chaque réseau, garde les modes lourds d'un mardi type et calcule, par parcours de connexions, la durée moyenne de chaque station vers chaque autre (départs à 8 h 00, 8 h 20 et 8 h 40, attente comprise). Il publie la liste des stations et une matrice d'octets par réseau. Le navigateur combine cette matrice avec la marche et avec les horaires SNCF : aucun calcul par personne côté serveur, aucune adresse ne quitte Supabase.

Spécification : sections 5.4 et 5.4 bis de `docs/superpowers/specs/2026-09-17-point-de-rencontre-design.md`.

## Décision (2026-09-19) : parcours de connexions, pas r5py

La spec prévoyait r5py avec un calcul par personne dans Actions, et le parcours de connexions en repli. Le repli est retenu d'emblée :

- mesuré le 2026-09-19 sur les GTFS du jour : Île-de-France 939 stations et 84000 connexions ferrées de 7 h 45 à 10 h 30, Lyon 287 et 12000, Marseille 150 et 5100 ; le calcul toutes stations vers toutes stations prend moins d'une minute en Python pur ;
- temps plausibles : Nation vers Châtelet 9 min, La Défense vers Gare de Lyon 22 min, Versailles-Chantiers vers Gare du Nord 41 min ;
- pas de Java, pas de `repository_dispatch`, pas d'adresse lue par Actions, et une nouvelle personne est calculée tout de suite, dans le navigateur.

Limite assumée : les bus ne sont pas dans la matrice (5 à 6 fois plus de connexions et des dizaines de milliers d'arrêts). Au-delà de 1,5 km à pied d'une station, on la rejoint « en transports » à 20 km/h jusqu'à 5 km ; plus loin, on est hors réseau et la règle voiture s'applique.

## Données

| Réseau | GTFS | Modes gardés |
|---|---|---|
| Île-de-France | `https://eu.ftp.opendatasoft.com/stif/GTFS/IDFM-gtfs.zip` | métro, RER et Transilien, tram, funiculaire (hors lignes « TER ») |
| Lyon (TCL) | `https://www.data.gouv.fr/api/1/datasets/r/abebedc6-28cf-4e2e-9c64-db57a40156f8` | métro, tram, funiculaire (hors Rhônexpress) |
| Marseille (RTM) | `https://www.data.gouv.fr/api/1/datasets/r/7eef6ec9-9ebb-44f2-becb-2efc522522d6` | métro, tram |

Le lien GTFS direct du Grand Lyon demande un compte (401) ; la version publiée sur data.gouv.fr est libre.

## Format publié

- `public/data/urbain/reseaux.json` : `{ "reseaux": [{ "id", "nom", "jour", "stations": [[nom, lat, lon], ...] }] }`.
- `public/data/urbain/<id>.bin` : N x N octets, ligne i = durées en minutes depuis la station i ; 255 = injoignable ou plus de 254 min.

## Règles de calcul (navigateur)

- Réseau d'un point : celui dont une station est à 5 km au plus.
- Stations d'un point : les 6 plus proches à 1,5 km au plus, à pied (4,5 km/h, détour 1,3) ; sinon les 3 plus proches à 5 km au plus, en transports (20 km/h).
- Durée d'un point A à un point B du même réseau : min sur les stations de A et de B de (accès + matrice + sortie), comparée à la marche directe.
- Gares SNCF du réseau : celles à 400 m au plus d'une station urbaine. Pour une personne dans un réseau, toutes ces gares deviennent des gares de départ possibles (en plus des 3 plus proches), avec 5 min de correspondance ; de même à l'arrivée pour un lieu dans un réseau.
- Prix : un ticket par trajet urbain (Île-de-France 2,50 €, Lyon 2,10 €, Marseille 2 €, estimations), 0 € en Île-de-France pour un abonné Navigo.
- Hors réseau : inchangé (à pied jusqu'à 1,5 km, puis voiture).

## Tâches

1. `horaires/urbain.py` + tests sur un petit GTFS fabriqué : lecture (modes, jour type, stations regroupées par `parent_station`, heures vides ignorées), parcours d'un départ (correspondance 2 min, marche 800 m entre stations), moyenne des trois départs, écriture des fichiers. `python3 -m horaires.urbain --sortie public/data/urbain`.
2. CI : étape « Réseaux urbains » avec sa propre réserve (`urbain-<empreinte>-…`), recalcul si pas de réserve, le mercredi ou sur demande ; en cas d'échec de téléchargement, la réserve sert ; sans réserve, la publication continue sans réseaux urbains (règle voiture partout) avec un avertissement.
3. `src/donnees/urbain.ts` : chargement avec les horaires (échec non bloquant), rattachement des gares SNCF.
4. `src/calcul/urbain.ts` : réseau d'un point, stations proches, durée point à point, durées depuis ou vers les gares SNCF du réseau.
5. `tc.ts` : départs et arrivées par les gares du réseau, trajet direct dans le réseau, prix du ticket et Navigo ; `reseaux-urbains.ts` (rectangle Île-de-France) remplacé par le réseau calculé, y compris pour les tracés (`trace.ts`).
6. Textes : détail du trajet et aide du repaire.
7. Plus tard, hors de ce plan : correspondances entre gares d'une même ville (Gare de Lyon vers Montparnasse) calculées dans `horaires/` avec la matrice urbaine au lieu de la liaison forfaitaire.
