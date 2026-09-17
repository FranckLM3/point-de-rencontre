# Point de rencontre : spécification

Date : 2026-09-17. Statut : à relire par Franck.

## 1. But

Une appli web, adaptée au mobile, pour un groupe d'amis répartis en France
(plus de 30 adresses, beaucoup en Île-de-France). Elle répond à la question
« où se retrouver ? » pour trois modes : vol d'oiseau, voiture, train et
transports en commun.

Chronotrains (chronotrains.com) sert de modèle d'interface, avec une
différence de fond : Chronotrains part d'une gare, nous partons de plusieurs
adresses à la fois.

Fonctions :

1. Voir où sont les amis sur une carte.
2. Colorer la France par tranches de temps (ou de prix) pour le groupe
   sélectionné, selon le mode et le critère.
3. Classer les villes candidates du meilleur au moins bon pour le groupe.
4. Tester un lieu précis : temps et prix de chaque ami jusqu'à ce lieu.
5. Choisir qui entre dans le calcul (cases à cocher, groupes enregistrés).
6. Ajouter, modifier, supprimer une adresse depuis le téléphone.

Hors périmètre de la v1 : pays étrangers, photos de villes, trains de nuit,
filtre « direct », horaires à une date précise, prix réels de billets.

## 2. Critères

Pour un ensemble S d'amis sélectionnés et un point P :

- **Total** : somme sur S du temps (ou du prix) de chaque ami vers P.
- **Pire trajet** : maximum sur S du temps (ou du prix) vers P.

L'utilisateur choisit le mode (vol d'oiseau, voiture, transports), la
grandeur (temps, prix) et le critère (total, pire trajet). Le meilleur point
de chaque combinaison est marqué sur la carte comme « centre ».

Un ami dont le temps vers P est inconnu (calcul en attente) est signalé ; P
n'est alors pas classé pour ce mode tant que le calcul manque.

## 3. Interface (inspirée de Chronotrains)

### Ordinateur (≥ 1024 px)

- Panneau à gauche (~ 460 px), carte à droite sur le reste. Fond gris-bleu
  clair, cartes blanches arrondies.
- En-tête du panneau :
  - rangée d'amis en pastilles (nom + ville), case à cocher sur chacune,
    « tout / aucun », menu des groupes enregistrés, bouton « + » pour ajouter ;
  - champ « Où se retrouver ? » pour tester un lieu (autocomplétion IGN) ;
  - pastilles de filtres sombres : mode (Voiture, Transports, Vol d'oiseau),
    critère (Pire trajet, Total), grandeur (Temps, Prix), puis une pastille
    verte « Temps maximum » (menu 1 à 8 h) et « Prix maximum ».
- Grand titre en gras, par exemple « Où se retrouver à 12, en transports,
  sans dépasser 3 h ».
- Liste des villes candidates classées. Chaque carte, sans photo : nom de la
  ville, département, puis une ligne « Pire trajet 2 h 40 · Total 18 h » et
  une pastille verte « ≈ 410 € au total ». Un clic ouvre le détail par ami
  (temps, prix, mode d'accès) et trace les lignes ami → ville sur la carte.
  Liens de réservation SNCF Connect et Trainline sur les villes en
  transports, lien d'itinéraire (Google Maps / Waze) en voiture.
- Carte : zones colorées par tranches d'une heure (ou de 20 € en prix),
  masquées au-delà du maximum choisi, amis en points, centres marqués.
  Fond clair OpenStreetMap.

### Mobile (< 1024 px)

- La liste occupe l'écran ; un bouton flottant « Carte » / « Liste » bascule,
  comme sur Chronotrains.
- Les pastilles de filtres défilent horizontalement.
- Ajout / modification d'un ami : feuille plein écran avec nom, adresse
  (autocomplétion), et deux options : « abonné Navigo », « a une voiture ».

### État dans l'URL

Mode, critère, grandeur, maximum, sélection d'amis et lieu testé sont écrits
dans l'URL, pour partager une vue précise.

## 4. Architecture

```
GitHub Pages (front statique, Vite + TypeScript, Leaflet)
   │  lit    data/tc/stations.bin, data/tc/lignes/*.bin, data/grilles/*.json
   │  appelle
Supabase
   ├─ Postgres : amis, groupes, temps par ami (RLS : utilisateur connecté)
   ├─ Auth : un compte partagé, mot de passe connu du groupe
   └─ Edge Functions : voiture (OpenRouteService), relance calcul transports
GitHub Actions
   ├─ hebdo : matrice gare → gare France (horaires SNCF), publiée sur Pages
   └─ à la demande : trajets fins Île-de-France d'un ami (r5py), écrits en base
```

Aucune adresse n'est écrite dans le dépôt, dans les fichiers publiés ou dans
les journaux d'Actions. Le dépôt peut donc être public.

### 4.1 Front

- Vite + TypeScript, sans framework ; Leaflet ; d3-contour pour les zones.
- Modules : `donnees/` (Supabase, fichiers statiques), `calcul/` (agrégation,
  critères, prix, zones), `carte/`, `panneau/`, `etat/` (URL + sélection).
- Toute agrégation (sélection, critère, maximum) se fait dans le navigateur à
  partir des temps par ami : cocher un ami ne déclenche aucun appel réseau.

### 4.2 Données Supabase

- `amis(id, nom, adresse, lat, lon, navigo bool, voiture bool, maj_le)`
- `groupes(id, nom, amis uuid[])`
- `temps(ami_id, couche text, version int, minutes bytea, km bytea, maj_le)`
  : une ligne par ami et par couche (`voiture`, `tc_france`, `tc_idf`). Les
  valeurs sont des tableaux `uint16` alignés sur la grille de la couche
  (65535 = injoignable). Une ligne par couche reste petite (≤ 30 Ko).
- `parametres(cle, valeur)` : prix du carburant, barèmes, consommation par
  défaut.

Accès : politique RLS « rôle authenticated » en lecture et écriture sur
`amis` et `groupes`, lecture seule sur `temps` (écriture par les fonctions
et Actions avec la clé de service).

Le mot de passe partagé ouvre une session Supabase sur un compte unique ;
l'e-mail de ce compte est fixé dans le front.

### 4.3 Grilles

| Couche | Points | Maille |
|---|---|---|
| Vol d'oiseau | calcul direct | 2 km |
| Voiture | ~5500 cellules en France métropolitaine | 10 km |
| Transports France | ~3000 gares SNCF | gares |
| Transports Île-de-France | ~12000 cellules | 1 km |

Les grilles sont des fichiers statiques versionnés (`data/grilles/`),
générés une fois par script à partir du contour de la France.

## 5. Calculs

### 5.1 Vol d'oiseau

Distance haversine dans le navigateur. Temps affiché = aucun ; la grandeur
est la distance en km. Prix : non applicable (la pastille Prix est grisée).

### 5.2 Voiture

- À l'ajout ou à la modification d'un ami « a une voiture », le front appelle
  l'Edge Function `voiture`. Elle interroge la matrice d'OpenRouteService
  (profil `driving-car`) de l'ami vers les cellules, par paquets respectant
  la limite de l'API, et écrit minutes et km dans `temps`.
- Tester un lieu : un appel matrice amis → lieu, non stocké.
- Prix = km × consommation (L/100 km) / 100 × prix du litre + péage estimé.
  - Prix du litre : moyenne nationale du flux public « prix des carburants »,
    rafraîchie chaque semaine par l'Action hebdo dans `parametres`.
  - Péage estimé : au-delà de 80 km, 0,09 € × 70 % de la distance.
    Constantes dans `parametres`, présentées comme estimation.
  - Réglage « personnes par voiture » : divise le prix affiché.
- Un ami sans voiture a un temps voiture « injoignable » et est signalé.

### 5.3 Transports, France

- Action hebdomadaire : télécharge les horaires ouverts SNCF (TER,
  Intercités, TGV) sur transport.data.gouv.fr, retient un mardi type.
- Algorithme : parcours de connexions (Connection Scan) depuis chaque gare,
  départs toutes les 15 min entre 7 h et 10 h, temps retenu = durée minimale.
  Correspondance minimale 5 min, transferts à pied entre gares à moins de
  500 m (vitesse 4,5 km/h × 1,3 de détour).
- Sortie : `data/tc/stations.bin` (id, nom, lat, lon) et une ligne par gare
  `data/tc/lignes/<id>.bin` (`uint16` minutes et `uint16` km par gare cible).
- Trajet d'un ami vers une gare cible G :
  min sur les 3 gares les plus proches de l'ami A de
  (accès(ami, A) + ligne[A][G]). Accès = vol d'oiseau × 1,3, à pied si
  ≤ 1,5 km (4,5 km/h), sinon en voiture (40 km/h) ou vélo si pas de voiture.
- Temps vers un point quelconque P : min sur les 3 gares proches de P de
  (temps vers G + sortie(G, P)), même règle. Les zones sont tracées sur une
  grille de 5 km remplie ainsi.
- Ce calcul d'ami se fait dans le navigateur : il ne dépend que des fichiers
  publiés. Seul le résultat de l'ami est écrit en base (couche `tc_france`)
  pour éviter de le refaire.
- Prix : km ferroviaires × barème (TER 0,12 €/km, grandes lignes 0,10 €/km,
  minimum 5 €), constantes dans `parametres`, affichées comme estimation.

### 5.4 Transports, Île-de-France

- Horaires ouverts d'Île-de-France Mobilités (métro, RER, Transilien, tram,
  bus) + horaires SNCF + extrait OpenStreetMap Île-de-France.
- Moteur : r5py (R5), matrice de temps de l'ami vers les cellules de 1 km et
  vers les grandes gares parisiennes, départ entre 7 h et 10 h, marche
  réelle sur les rues.
- Déclenché à l'ajout ou à la modification d'un ami dont l'adresse est en
  Île-de-France ou pour qui une cible est en Île-de-France : l'Edge Function
  `relance_tc` envoie un `repository_dispatch` avec le seul identifiant de
  l'ami ; l'Action lit ses coordonnées en base, calcule, écrit `tc_idf`.
- En attendant le résultat, le front utilise le calcul France (5.3) et
  marque l'ami « estimation ».
- Combinaison : pour un Francilien, le temps vers une gare hors Île-de-France
  = min sur les grandes gares parisiennes de (r5py vers la gare + ligne SNCF).
- Prix : ticket unique Île-de-France (constante), 0 € si « abonné Navigo ».

### 5.5 Risque à lever d'abord

r5py demande Java 21 et une mémoire notable. Première tâche du plan : un
essai qui fait tourner r5py dans GitHub Actions sur l'extrait
Île-de-France avec les horaires IDFM, et mesure durée et mémoire. Si
l'essai échoue, repli : parcours de connexions (5.3) étendu aux horaires
IDFM ferrés (métro, RER, Transilien, tram), sans bus, maille de 1 km
remplie par la marche vers les stations.

Autres points à vérifier en tout début de plan : limites actuelles de la
matrice OpenRouteService (taille par appel, quota journalier) et URLs
exactes des jeux de données SNCF et IDFM.

## 6. Zones colorées

- Pour la couche et la sélection courantes : valeur agrégée par point de
  grille, puis d3-contour en tranches (1 h, ou 20 € pour le prix, ou 100 km
  pour le vol d'oiseau), projetées sur la carte.
- Palette séquentielle du vert (proche) au rouge (loin), tranches au-delà du
  maximum masquées.
- Villes candidates : communes de plus de 20000 habitants et toutes les gares
  desservies par des grandes lignes, avec valeur lue au point le plus proche.

## 7. Erreurs

- API voiture en erreur ou quota atteint : l'ami est marqué « voiture en
  attente », nouvel essai au prochain chargement ; message clair dans le
  panneau.
- Action Île-de-France en échec : l'ami garde l'estimation France, un
  bandeau le signale.
- Adresse introuvable : l'ajout est refusé tant qu'aucune proposition de
  l'autocomplétion n'est choisie.
- Mot de passe faux : message simple, pas de détail.
- Fichiers statiques manquants : le mode transports est désactivé avec un
  message, les autres modes restent utilisables.

## 8. Sécurité et vie privée

- Adresses uniquement dans Supabase, derrière RLS et connexion.
- Clés OpenRouteService et GitHub uniquement dans les secrets Supabase et
  GitHub. La clé publique Supabase (anon) est dans le front, c'est prévu.
- Les Actions ne journalisent ni nom ni coordonnées.
- Pas d'indexation : `noindex` dans la page.

## 9. Tests

- Vitest : agrégation (total, pire trajet, sélection), prix voiture et train,
  accès aux gares, remplissage de grille, tranches.
- Pytest : parcours de connexions sur un petit jeu d'horaires fabriqué
  (correspondance manquée, transfert à pied, gare injoignable), écriture des
  fichiers binaires.
- Playwright : parcours complet (connexion, ajout d'un ami, changement de
  mode, test d'un lieu) à 375 px et 1440 px, avec Supabase simulé.

## 10. Déploiement

- Dépôt GitHub `point-de-rencontre`, public (aucune donnée personnelle).
- GitHub Actions : tests + build Vite + publication Pages sur `main` ;
  Action hebdo transports France ; Action à la demande Île-de-France.
- Supabase : migrations SQL et Edge Functions versionnées dans `supabase/`.
