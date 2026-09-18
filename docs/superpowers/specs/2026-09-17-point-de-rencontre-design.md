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
7. Donner à chaque ami son moyen de transport (voiture ou transports en
   commun) et calculer le centre avec le moyen propre à chacun.

Hors périmètre de la v1 : pays étrangers, photos de villes, trains de nuit,
filtre « direct », horaires à une date précise, prix réels de billets.

## 2. Critères

Pour un ensemble S d'amis sélectionnés et un point P :

- **Total** : somme sur S du temps (ou du prix) de chaque ami vers P.
- **Pire trajet** : maximum sur S du temps (ou du prix) vers P.

L'utilisateur choisit le mode parmi quatre :

- **Chacun son moyen** (mode par défaut dès que voiture et transports
  existent) : chaque ami compte avec le moyen de transport de sa fiche ;
- **Tous en voiture**, **Tous en transports** : on force le même moyen pour
  tout le monde, pour comparer ;
- **Vol d'oiseau**.

Il choisit aussi la
grandeur (temps, prix) et le critère (total, pire trajet). Le meilleur point
de chaque combinaison est marqué sur la carte comme « centre ».

Un ami dont le temps vers P est inconnu (calcul en attente) est signalé ; P
n'est alors pas classé pour ce mode tant que le calcul manque.

## 3. Interface (inspirée de Chronotrains)

### Accès par mot de passe

- Premier écran : un seul champ « Mot de passe du groupe ». Rien d'autre
  n'est affiché ni chargé depuis Supabase avant la connexion.
- Le mot de passe ouvre une session sur le compte Supabase partagé ; la
  session reste ouverte sur l'appareil (bouton « Se déconnecter » dans le
  panneau).
- Changer le mot de passe se fait dans la console Supabase ; toutes les
  sessions sont alors coupées.
- Limite connue : GitHub Pages ne sait pas protéger les fichiers eux-mêmes.
  Le code de la page et la matrice gare → gare restent publics, mais ils ne
  contiennent aucune donnée sur le groupe. Noms, adresses et temps par ami
  ne sortent de Supabase qu'après connexion.
- Supabase limite déjà les tentatives de connexion par adresse IP.


### Ordinateur (≥ 1024 px)

- Panneau à gauche (~ 460 px), carte à droite sur le reste. Fond gris-bleu
  clair, cartes blanches arrondies.
- En-tête du panneau :
  - rangée d'amis en pastilles (nom + ville + icône voiture ou train),
    case à cocher sur chacune,
    « tout / aucun », menu des groupes enregistrés, bouton « + » pour ajouter ;
  - champ « Où se retrouver ? » pour tester un lieu (autocomplétion IGN) ;
  - pastilles de filtres sombres : mode (Voiture, Transports, Vol d'oiseau),
    (Chacun son moyen, Tous en voiture, Tous en transports, Vol d'oiseau),
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
  (autocomplétion), moyen de transport (Voiture ou Transports en commun,
  choix obligatoire) et l'option « abonné Navigo ».

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

- `amis(id, nom, adresse, lat, lon, transport ('voiture' | 'tc'), navigo bool, maj_le)`
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
- Les temps voiture sont calculés pour tous les amis, quel que soit leur
  moyen, pour que le mode « Tous en voiture » fonctionne.
- En mode « Chacun son moyen », la couche d'un ami est sa couche voiture ou
  sa couche transports selon sa fiche ; l'agrégation ne change pas.

### 5.3 Transports, France

- Action hebdomadaire : télécharge les horaires ouverts SNCF (TER,
  Intercités, TGV) sur transport.data.gouv.fr, retient un mardi type.
- Algorithme : parcours de connexions (Connection Scan) depuis chaque gare,
  un calcul par départ réel entre 6 h et 20 h (le premier train part dans
  la fenêtre), temps retenu = durée minimale depuis le départ de la source.
  Montée et descente interdites respectées. Correspondance minimale 5 min
  entre deux trains ; liaisons enchaînables entre gares desservies : à pied
  jusqu'à 1 km (4,5 km/h × 1,3), urbaine jusqu'à 6 km (15 min + 20 km/h),
  60 min de liaison au plus (voir 5.4 ter).
- Sortie : `data/tc/stations.json` (nom, lat, lon, desservie),
  `data/tc/voisins-4km.bin` et une ligne par gare `data/tc/lignes/<i>.bin`
  (5 octets par gare cible : minutes, km, drapeaux grande ligne et nombre de
  correspondances). Gares au-delà de 50 km ignorées (la Corse n'a pas de
  train dans ces horaires).
- Trajet d'un ami vers une gare cible G :
  min sur les 3 gares les plus proches de l'ami A de
  (accès(ami, A) + ligne[A][G]). Accès = vol d'oiseau × 1,3, à pied si
  ≤ 1,5 km (4,5 km/h), sinon en voiture (40 km/h) si l'ami se déplace en
  voiture, ou en bus (20 km/h) sinon.
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

### 5.4 bis Transports urbains des grandes villes (ajout du 2026-09-17)

Demande de Franck : les réseaux de métro, tram et bus des grandes villes
(Paris et Île-de-France, Lyon, Marseille, Lille, Bordeaux, Toulouse,
Nantes, Strasbourg, Nice, Rennes, Montpellier, Grenoble) comptent dans
les trajets. Ils sont publiés en GTFS sur transport.data.gouv.fr.

- Ils ne sont pas fusionnés dans la matrice gare vers gare (elle passerait
  d'environ 3400 à plus de 6000 arrêts, soit environ 180 Mo).
- Ils servent à deux choses :
  1. **correspondances entre gares d'une même ville** : durée réelle en
     métro, tram ou bus, à la place de la liaison urbaine forfaitaire du
     plan 2 (15 min plus 20 km/h jusqu'à 6 km) ;
  2. **premier et dernier kilomètre** : du domicile à la gare et de la
     gare au lieu visé, sur une grille plus fine dans ces villes.
- Réalisé par le plan 4, qui couvre l'Île-de-France et ces villes. En
  attendant, la règle forfaitaire du plan 2 s'applique.

### 5.4 ter Trajets multimodaux (ajout du 2026-09-17)

Un trajet enchaîne librement marche (jusqu'à 1 km), liaison urbaine et
train, y compris plusieurs fois. La marche depuis la gare de départ vers
une gare voisine et la marge de correspondance comptent dans la durée.
Le détail affiché donne : mode et durée d'accès, gare de départ, gare
d'arrivée, nombre de correspondances, mode et durée de sortie.

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
