# Plan 2 : transports en France (horaires SNCF)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activer le mode « Tous en transports » : zones colorées, meilleur point, villes classées et lieu testé, en temps ou en prix, calculés à partir des horaires ouverts de la SNCF.

**Architecture:** Un script Python sans dépendance lit le GTFS SNCF, calcule par parcours de connexions le trajet le plus rapide de chaque gare vers toutes les autres sur un mardi type (départs de 6 h à 20 h), et écrit des fichiers binaires statiques. GitHub Actions le lance à chaque publication, avec un cache indexé sur la version des horaires. Le navigateur charge les lignes des 3 gares proches de chaque personne et calcule tout le reste localement.

**Tech Stack:** Python 3.12 (bibliothèque standard seule, `unittest`, `multiprocessing`), TypeScript, Vitest, Playwright, GitHub Actions (`actions/setup-python`, `actions/cache`).

Spécification : `docs/superpowers/specs/2026-09-17-point-de-rencontre-design.md`, section 5.3. Plan précédent : `docs/superpowers/plans/2026-09-17-plan-1-socle-vol-oiseau.md` (en ligne).

## Faits mesurés le 2026-09-17 (source de vérité pour ce plan)

- Source : `https://eu.ftp.opendatasoft.com/sncf/plandata/Export_OpenData_SNCF_GTFS_NewTripId.zip`
  (jeu « Réseau SNCF TGV, Intercités et TER » de transport.data.gouv.fr).
  3,9 Mo compressé, 60 Mo décompressé.
- Fichiers : `agency`, `calendar_dates` (pas de `calendar.txt`), `feed_info`,
  `routes`, `stop_times`, `stops`, `transfers` (vide), `trips`.
- `feed_info.txt` : `feed_start_date`, `feed_end_date`, `feed_version`.
- `stops.txt` : zones d'arrêt `location_type=1` (3389), points d'arrêt
  `location_type=0` avec `parent_station`. Le type de service est dans
  l'identifiant du point : `StopPoint:OCE<type>-<code>`, types observés
  `Train TER`, `Car TER`, `TGV INOUI`, `INTERCITES`, `INTERCITES de nuit`,
  `OUIGO`, `Car à réservation`, `TramTrain`, `ICE`, `Lyria`, `Train`,
  `Navette`.
- Mardi 2026-10-06 : 11018 trajets, 85531 connexions, 3234 zones desservies.
- Contrôle : Paris Gare de Lyon (`StopArea:OCE87686006`) vers Marseille
  Saint-Charles (`StopArea:OCE87751008`) = 194 min au mieux entre 7 h et
  10 h. Un parcours depuis une gare prend environ 8 ms en Python.
- 234 paires de zones d'arrêt à moins de 500 m.

## Écarts assumés par rapport à la spécification

- Fenêtre de départ **6 h à 20 h toutes les 20 min** (la spec disait 7 h à
  10 h) : une ligne rurale sans train le matin resterait sinon injoignable.
  La durée comptée part du premier train pris, pas de l'heure de départ
  de la fenêtre.
- Pas d'écriture du résultat par personne dans Supabase : le calcul dans le
  navigateur prend quelques millisecondes (3 fichiers de 17 Ko et une
  boucle sur la grille). La table `temps` attend le plan 3.
- Les fichiers d'horaires ne sont **pas commités** : ils sont produits pendant
  la publication et mis en cache par GitHub Actions (clé = `feed_version`).
- Le prix du train est une estimation au kilomètre : TER et cars 0,12 €/km,
  grandes lignes 0,10 €/km, minimum 5 € ; accès en bus 2 € si la gare est à
  plus de 1,5 km et que la personne n'a pas de voiture.
- Les zones utilisent la grille de 4 km du plan 1 (et non une grille à 5 km).

## Structure des fichiers

```
horaires/                         paquet Python (python3 -m horaires)
├── __init__.py
├── __main__.py                   ligne de commande : télécharge, calcule, écrit
├── geo.py                        haversine
├── gtfs.py                       lecture : jour type, zones, connexions, passages à pied
├── parcours.py                   parcours de connexions (durée, km, grande ligne)
├── sortie.py                     fichiers binaires et index des gares voisines
└── tests/
    ├── __init__.py
    ├── fabrique.py               petit GTFS synthétique en mémoire
    ├── test_gtfs.py
    ├── test_parcours.py
    └── test_sortie.py
public/data/tc/                   généré, ignoré par git
├── stations.json                 [{nom, lat, lon}] ; l'indice = numéro de gare
├── version.json                  {feed_version, jour, genere_le}
├── voisins-4km.bin               3 gares les plus proches de chaque point de grille
└── lignes/<i>.bin                trajets depuis la gare i vers toutes les gares
src/
├── types.ts                      + Grandeur, Etat.grandeur
├── etat/url.ts                   + paramètre grandeur
├── calcul/
│   ├── unites.ts                 unité, pas des tranches, maxima proposés
│   ├── tc.ts                     accès, prix, trajets par gare, couche, point
│   └── villes.ts                 classement générique (fonction de mesure)
├── donnees/horaires.ts           chargement des fichiers et cache des lignes
└── ui/
    ├── format.ts                 + duree, euros, valeur(v, unite), titre générique
    ├── filtres.ts                + mode tc actif, pastilles Temps / Prix, maxima par unité
    ├── liste-villes.ts           + unité, trajet et liens de réservation
    ├── lieu.ts                   + unité et trajet
    ├── legende.ts                + unité
    └── marqueurs.ts              + unité dans l'infobulle du centre
```

## Format des fichiers binaires (petit-boutiste)

- `lignes/<i>.bin` : pour chaque gare `j` dans l'ordre de `stations.json`,
  5 octets : `minutes` (uint16, 65535 = injoignable), `km` (uint16,
  kilomètres ferroviaires arrondis), `drapeaux` (uint8, bit 0 = une grande
  ligne est empruntée). Taille = 5 x nombre de gares.
- `voisins-4km.bin` : pour chaque point `k` de la grille de 4 km (ordre de
  la grille, `nx * ny` points, y compris hors de France), 3 fois
  (`gare` uint16, `hectometres` uint16). Hors de France : gare 65535.
  Taille = 12 x nx x ny.

---

### Task 1 : lecture du GTFS

**Files:**
- Create: `horaires/__init__.py`, `horaires/geo.py`, `horaires/gtfs.py`, `horaires/tests/__init__.py`, `horaires/tests/fabrique.py`, `horaires/tests/test_gtfs.py`
- Modify: `.gitignore`, `package.json`

- [ ] **Step 1 : fabrique de test**

`horaires/tests/fabrique.py` :

```python
"""Petit GTFS synthétique, écrit dans une archive zip en mémoire."""
import io
import zipfile

# Trois gares alignées (A, B, C) et une gare D à 300 m de C.
STOPS = """stop_id,stop_name,stop_desc,stop_lat,stop_lon,zone_id,stop_url,location_type,parent_station
StopArea:OCE1,Alpha,,45.0000,4.0000,,,1,
StopArea:OCE2,Beta,,45.0000,5.0000,,,1,
StopArea:OCE3,Gamma,,45.0000,6.0000,,,1,
StopArea:OCE4,Delta,,45.0027,6.0000,,,1,
StopPoint:OCETGV INOUI-1,Alpha,,45.0000,4.0000,,,0,StopArea:OCE1
StopPoint:OCETGV INOUI-2,Beta,,45.0000,5.0000,,,0,StopArea:OCE2
StopPoint:OCETrain TER-2,Beta,,45.0000,5.0000,,,0,StopArea:OCE2
StopPoint:OCETrain TER-3,Gamma,,45.0000,6.0000,,,0,StopArea:OCE3
StopPoint:OCETrain TER-4,Delta,,45.0027,6.0000,,,0,StopArea:OCE4
"""

ROUTES = """route_id,agency_id,route_short_name,route_long_name,route_desc,route_type,route_url,route_color,route_text_color
R1,1,,Alpha - Beta,,2,,,
R2,1,,Beta - Gamma,,2,,,
"""

# T1 : A 08:00 -> B 09:00 (grande ligne). T2 : B 09:10 -> C 09:40 (TER).
# T3 : B 08:50 -> C 09:20, parti avant l'arrivée de T1 : correspondance manquée.
# T4 : circule un autre jour.
TRIPS = """route_id,service_id,trip_id,trip_headsign,direction_id,block_id,shape_id
R1,S1,T1,,0,,
R2,S1,T2,,0,,
R2,S1,T3,,0,,
R2,S2,T4,,0,,
"""

STOP_TIMES = """trip_id,arrival_time,departure_time,stop_id,stop_sequence,stop_headsign,pickup_type,drop_off_type,shape_dist_traveled
T1,08:00:00,08:00:00,StopPoint:OCETGV INOUI-1,0,,0,1,
T1,09:00:00,09:00:00,StopPoint:OCETGV INOUI-2,1,,1,0,
T2,09:10:00,09:10:00,StopPoint:OCETrain TER-2,0,,0,1,
T2,09:40:00,09:40:00,StopPoint:OCETrain TER-3,1,,1,0,
T3,08:50:00,08:50:00,StopPoint:OCETrain TER-2,0,,0,1,
T3,09:20:00,09:20:00,StopPoint:OCETrain TER-3,1,,1,0,
T4,10:00:00,10:00:00,StopPoint:OCETrain TER-2,0,,0,1,
T4,10:05:00,10:05:00,StopPoint:OCETrain TER-3,1,,1,0,
"""

# 2026-10-06 et 2026-10-13 sont des mardis ; S2 ne circule que le 2026-10-07.
CALENDAR_DATES = """service_id,date,exception_type
S1,20261006,1
S1,20261013,1
S2,20261007,1
"""

FEED_INFO = """feed_id,feed_publisher_name,feed_publisher_url,feed_lang,feed_start_date,feed_end_date,feed_version,conv_rev,plan_rev
0,SNCF,http://www.sncf.com,fr,20260928,20261031,2026-09-28,1,1
"""


def archive() -> bytes:
    tampon = io.BytesIO()
    with zipfile.ZipFile(tampon, "w") as z:
        for nom, contenu in {
            "stops.txt": STOPS,
            "routes.txt": ROUTES,
            "trips.txt": TRIPS,
            "stop_times.txt": STOP_TIMES,
            "calendar_dates.txt": CALENDAR_DATES,
            "feed_info.txt": FEED_INFO,
        }.items():
            z.writestr(nom, contenu)
    return tampon.getvalue()
```

- [ ] **Step 2 : tests qui échouent**

`horaires/tests/test_gtfs.py` :

```python
import unittest

from horaires.gtfs import charger
from horaires.tests.fabrique import archive


class LectureTest(unittest.TestCase):
    def setUp(self):
        self.reseau = charger(archive())

    def test_jour_type_est_un_mardi_apres_la_premiere_semaine(self):
        self.assertEqual(self.reseau.jour, "20261006")
        self.assertEqual(self.reseau.version, "2026-09-28")

    def test_gares_triees_par_identifiant(self):
        self.assertEqual([g.nom for g in self.reseau.gares], ["Alpha", "Beta", "Gamma", "Delta"])

    def test_connexions_du_jour_seulement_et_triees(self):
        trajets = {c.trajet for c in self.reseau.connexions}
        self.assertEqual(trajets, {"T1", "T2", "T3"})
        departs = [c.depart for c in self.reseau.connexions]
        self.assertEqual(departs, sorted(departs))

    def test_connexion_porte_gares_km_et_grande_ligne(self):
        t1 = next(c for c in self.reseau.connexions if c.trajet == "T1")
        self.assertEqual((t1.de, t1.vers), (0, 1))
        self.assertAlmostEqual(t1.km, 78.7, delta=0.5)
        self.assertTrue(t1.grande_ligne)
        t2 = next(c for c in self.reseau.connexions if c.trajet == "T2")
        self.assertFalse(t2.grande_ligne)

    def test_passages_a_pied_symetriques_sous_500_m(self):
        self.assertIn((3, 0.3), [(v, round(km, 1)) for v, km in self.reseau.a_pied[2]])
        self.assertIn((2, 0.3), [(v, round(km, 1)) for v, km in self.reseau.a_pied[3]])
        self.assertEqual(self.reseau.a_pied[0], [])


if __name__ == "__main__":
    unittest.main()
```

Run: `python3 -m unittest discover -s horaires/tests -t .`
Expected: FAIL (`ModuleNotFoundError: horaires.gtfs`).

- [ ] **Step 3 : implémentation**

`horaires/__init__.py` : fichier vide.
`horaires/tests/__init__.py` : fichier vide.

`horaires/geo.py` :

```python
import math

RAYON_TERRE_KM = 6371.0088


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * RAYON_TERRE_KM * math.asin(min(1.0, math.sqrt(a)))
```

`horaires/gtfs.py` :

```python
"""Lecture du GTFS SNCF : jour type, gares (zones d'arrêt), connexions, passages à pied."""
from __future__ import annotations

import csv
import datetime
import io
import zipfile
from collections import defaultdict
from dataclasses import dataclass, field

from horaires.geo import haversine_km

TYPES_GRANDE_LIGNE = {"TGV INOUI", "INTERCITES", "INTERCITES de nuit", "OUIGO", "ICE", "Lyria"}
DISTANCE_A_PIED_KM = 0.5
MARGE_PREMIERE_SEMAINE = 7
MARDI = 1
NB_MARDIS_CANDIDATS = 6


@dataclass(frozen=True)
class Gare:
    identifiant: str
    nom: str
    lat: float
    lon: float


@dataclass(frozen=True)
class Connexion:
    depart: int  # secondes depuis minuit
    arrivee: int
    de: int  # indice de gare
    vers: int
    trajet: str
    km: float
    grande_ligne: bool


@dataclass
class Reseau:
    version: str
    jour: str
    gares: list[Gare]
    connexions: list[Connexion]
    a_pied: list[list[tuple[int, float]]] = field(default_factory=list)


def _lire(z: zipfile.ZipFile, nom: str):
    with z.open(nom) as f:
        yield from csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))


def _secondes(h: str) -> int:
    heures, minutes, secondes = (int(x) for x in h.split(":"))
    return heures * 3600 + minutes * 60 + secondes


def _date(texte: str) -> datetime.date:
    return datetime.date(int(texte[:4]), int(texte[4:6]), int(texte[6:]))


def _type_service(stop_id: str) -> str:
    return stop_id.removeprefix("StopPoint:OCE").rsplit("-", 1)[0]


def _choisir_jour(services_par_date: dict[str, set[str]], debut: str) -> str:
    """Le mardi le plus chargé parmi les premiers mardis après la première semaine."""
    seuil = _date(debut) + datetime.timedelta(days=MARGE_PREMIERE_SEMAINE)
    mardis = sorted(d for d in services_par_date if _date(d).weekday() == MARDI and _date(d) >= seuil)
    candidats = mardis[:NB_MARDIS_CANDIDATS]
    if not candidats:
        raise ValueError("Aucun mardi exploitable dans les horaires.")
    return max(candidats, key=lambda d: (len(services_par_date[d]), -int(d)))


def _passages_a_pied(gares: list[Gare]) -> list[list[tuple[int, float]]]:
    cases: dict[tuple[int, int], list[int]] = defaultdict(list)
    for i, g in enumerate(gares):
        cases[(round(g.lat * 100), round(g.lon * 100))].append(i)
    voisins: list[list[tuple[int, float]]] = [[] for _ in gares]
    for i, g in enumerate(gares):
        cle = (round(g.lat * 100), round(g.lon * 100))
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                for j in cases.get((cle[0] + dy, cle[1] + dx), []):
                    if j == i:
                        continue
                    d = haversine_km(g.lat, g.lon, gares[j].lat, gares[j].lon)
                    if d <= DISTANCE_A_PIED_KM:
                        voisins[i].append((j, d))
    return voisins


def charger(contenu: bytes) -> Reseau:
    with zipfile.ZipFile(io.BytesIO(contenu)) as z:
        info = next(_lire(z, "feed_info.txt"))
        services_par_date: dict[str, set[str]] = defaultdict(set)
        for r in _lire(z, "calendar_dates.txt"):
            if r["exception_type"] == "1":
                services_par_date[r["date"]].add(r["service_id"])
        jour = _choisir_jour(services_par_date, info["feed_start_date"])
        actifs = services_par_date[jour]

        zones = sorted((r for r in _lire(z, "stops.txt") if r["location_type"] == "1"), key=lambda r: r["stop_id"])
        gares = [Gare(r["stop_id"], r["stop_name"], float(r["stop_lat"]), float(r["stop_lon"])) for r in zones]
        indice = {g.identifiant: i for i, g in enumerate(gares)}
        parent = {r["stop_id"]: r["parent_station"] for r in _lire(z, "stops.txt") if r["location_type"] == "0"}

        trajets = {r["trip_id"] for r in _lire(z, "trips.txt") if r["service_id"] in actifs}
        passages: dict[str, list[dict]] = defaultdict(list)
        for r in _lire(z, "stop_times.txt"):
            if r["trip_id"] in trajets:
                passages[r["trip_id"]].append(r)

    connexions: list[Connexion] = []
    for trajet, arrets in passages.items():
        arrets.sort(key=lambda r: int(r["stop_sequence"]))
        for a, b in zip(arrets, arrets[1:]):
            de, vers = indice[parent[a["stop_id"]]], indice[parent[b["stop_id"]]]
            if de == vers:
                continue
            ga, gb = gares[de], gares[vers]
            connexions.append(
                Connexion(
                    depart=_secondes(a["departure_time"]),
                    arrivee=_secondes(b["arrival_time"]),
                    de=de,
                    vers=vers,
                    trajet=trajet,
                    km=haversine_km(ga.lat, ga.lon, gb.lat, gb.lon),
                    grande_ligne=_type_service(a["stop_id"]) in TYPES_GRANDE_LIGNE,
                )
            )
    connexions.sort(key=lambda c: (c.depart, c.arrivee))
    return Reseau(info["feed_version"], jour, gares, connexions, _passages_a_pied(gares))
```

Note sur le test du jour type : la fabrique commence le 2026-09-28 ; le
seuil est le 2026-10-05 ; les mardis candidats sont le 6 et le 13, avec
le même nombre de services, et l'égalité est tranchée en faveur du plus
tôt (`-int(d)`).

Ajouter à `.gitignore` :

```
public/data/tc/
__pycache__/
.cache-horaires/
```

Ajouter aux scripts de `package.json` :

```json
"test:horaires": "python3 -m unittest discover -s horaires/tests -t .",
"horaires": "python3 -m horaires --sortie public/data/tc"
```

- [ ] **Step 4 : vérifier**

Run: `npm run test:horaires`
Expected: 5 tests OK.

- [ ] **Step 5 : commit**

```bash
git add horaires .gitignore package.json
git commit -m "feat: lecture des horaires SNCF (jour type, gares, connexions)"
```

---

### Task 2 : parcours de connexions

**Files:**
- Create: `horaires/parcours.py`, `horaires/tests/test_parcours.py`

Principe : pour un départ `h` depuis la gare source, on balaie les
connexions par heure de départ. Une connexion est utilisable si son
trajet a déjà été pris, ou si l'on est à sa gare de départ assez tôt (à la
source sans délai, ailleurs avec 5 min de correspondance). Chaque gare
garde la meilleure arrivée, l'heure du premier train pris depuis la
source, les km cumulés et le drapeau « grande ligne ». On répète pour
chaque départ de la fenêtre et on garde, par gare, la **durée** la plus
courte (arrivée moins heure du premier train).

- [ ] **Step 1 : tests qui échouent**

`horaires/tests/test_parcours.py` :

```python
import unittest

from horaires.gtfs import charger
from horaires.parcours import INJOIGNABLE, meilleurs_trajets
from horaires.tests.fabrique import archive


class ParcoursTest(unittest.TestCase):
    def setUp(self):
        self.reseau = charger(archive())

    def test_direct(self):
        t = meilleurs_trajets(self.reseau, 0)
        self.assertEqual(t[1].minutes, 60)
        self.assertTrue(t[1].grande_ligne)

    def test_correspondance_manquee_puis_suivante(self):
        # T3 part de Beta à 08:50, avant l'arrivée de T1 : on prend T2 (09:10 -> 09:40).
        t = meilleurs_trajets(self.reseau, 0)
        self.assertEqual(t[2].minutes, 100)
        self.assertAlmostEqual(t[2].km, 157.4, delta=1)
        self.assertTrue(t[2].grande_ligne)

    def test_duree_comptee_depuis_le_premier_train(self):
        # Depuis Beta, T3 (08:50 -> 09:20) donne 30 min, quelle que soit l'heure de la fenêtre.
        t = meilleurs_trajets(self.reseau, 1)
        self.assertEqual(t[2].minutes, 30)
        self.assertFalse(t[2].grande_ligne)

    def test_passage_a_pied_apres_arrivee(self):
        # Delta n'a aucun train : on y arrive à pied depuis Gamma (300 m, 5 min).
        t = meilleurs_trajets(self.reseau, 1)
        self.assertEqual(t[3].minutes, 35)
        self.assertAlmostEqual(t[3].km, t[2].km + 0.3, delta=0.05)

    def test_injoignable(self):
        t = meilleurs_trajets(self.reseau, 2)
        self.assertEqual(t[0].minutes, INJOIGNABLE)

    def test_source_a_zero(self):
        t = meilleurs_trajets(self.reseau, 0)
        self.assertEqual((t[0].minutes, t[0].km), (0, 0))


if __name__ == "__main__":
    unittest.main()
```

Le temps à pied vaut 0,3 x 1,3 / 4,5 h = 5,2 min, arrondi à la minute la
plus proche : 5 min.

Run: `npm run test:horaires`
Expected: FAIL (`horaires.parcours` introuvable).

- [ ] **Step 2 : implémentation**

`horaires/parcours.py` :

```python
"""Parcours de connexions : durée la plus courte de la gare source vers chaque gare."""
from __future__ import annotations

from dataclasses import dataclass

from horaires.gtfs import Reseau

INJOIGNABLE = 65535
CORRESPONDANCE_S = 300
DEBUT_FENETRE_S = 6 * 3600
FIN_FENETRE_S = 20 * 3600
PAS_FENETRE_S = 20 * 60
VITESSE_MARCHE_KMH = 4.5
DETOUR_MARCHE = 1.3


@dataclass(frozen=True)
class Trajet:
    minutes: int
    km: float
    grande_ligne: bool


def _marche_s(km: float) -> int:
    return round(km * DETOUR_MARCHE / VITESSE_MARCHE_KMH * 3600 / 60) * 60


def _un_depart(reseau: Reseau, source: int, depart: int) -> list[tuple[int, int, float, bool] | None]:
    """Étiquettes (arrivée, heure du premier train, km, grande ligne) pour un départ donné."""
    etiquettes: list[tuple[int, int, float, bool] | None] = [None] * len(reseau.gares)
    etiquettes[source] = (depart, -1, 0.0, False)
    for voisin, km in reseau.a_pied[source]:
        etiquettes[voisin] = (depart + _marche_s(km), -1, km, False)
    en_cours: dict[str, tuple[int, float, bool]] = {}
    for c in reseau.connexions:
        if c.depart < depart:
            continue
        pris = en_cours.get(c.trajet)
        if pris is None:
            e = etiquettes[c.de]
            if e is None:
                continue
            marge = 0 if c.de == source else CORRESPONDANCE_S
            if e[0] + marge > c.depart:
                continue
            premier = c.depart if e[1] < 0 else e[1]
            pris = (premier, e[2], e[3])
        premier, km, gl = pris
        km, gl = km + c.km, gl or c.grande_ligne
        en_cours[c.trajet] = (premier, km, gl)
        actuelle = etiquettes[c.vers]
        if actuelle is None or c.arrivee < actuelle[0]:
            etiquettes[c.vers] = (c.arrivee, premier, km, gl)
            for voisin, pas in reseau.a_pied[c.vers]:
                arrivee = c.arrivee + _marche_s(pas)
                e = etiquettes[voisin]
                if e is None or arrivee < e[0]:
                    etiquettes[voisin] = (arrivee, premier, km + pas, gl)
    return etiquettes


def meilleurs_trajets(reseau: Reseau, source: int) -> list[Trajet]:
    meilleurs = [Trajet(INJOIGNABLE, 0.0, False)] * len(reseau.gares)
    meilleurs[source] = Trajet(0, 0.0, False)
    for depart in range(DEBUT_FENETRE_S, FIN_FENETRE_S + 1, PAS_FENETRE_S):
        for j, e in enumerate(_un_depart(reseau, source, depart)):
            if e is None or j == source:
                continue
            arrivee, premier, km, gl = e
            debut = depart if premier < 0 else premier
            minutes = round((arrivee - debut) / 60)
            if minutes < meilleurs[j].minutes:
                meilleurs[j] = Trajet(minutes, km, gl)
    return meilleurs
```

Remarques pour l'implémenteur :
- Une gare atteinte seulement à pied depuis la source a `premier = -1` :
  sa durée est le temps de marche (le départ de la fenêtre sert de début).
- Le passage à pied relâché depuis une gare n'est pas propagé en chaîne
  (pas de marche après marche) : c'est voulu, les paires sont à moins de
  500 m.

- [ ] **Step 3 : vérifier**

Run: `npm run test:horaires`
Expected: 11 tests OK. Si `test_correspondance_manquee_puis_suivante`
donne 70 min, la correspondance de 5 min n'est pas appliquée à Beta.

- [ ] **Step 4 : contrôle sur les vraies données**

Écrire un script jetable hors du dépôt (dossier temporaire) :

```python
import urllib.request
from horaires.gtfs import charger
from horaires.parcours import meilleurs_trajets
URL = "https://eu.ftp.opendatasoft.com/sncf/plandata/Export_OpenData_SNCF_GTFS_NewTripId.zip"
r = charger(urllib.request.urlopen(URL).read())
i = {g.identifiant: k for k, g in enumerate(r.gares)}
t = meilleurs_trajets(r, i["StopArea:OCE87686006"])
print(r.jour, len(r.gares), len(r.connexions), t[i["StopArea:OCE87751008"]])
```

Expected: `Trajet(minutes=` entre 180 et 200, `km` entre 650 et 800,
`grande_ligne=True)`.

- [ ] **Step 5 : commit**

```bash
git add horaires/parcours.py horaires/tests/test_parcours.py
git commit -m "feat: parcours de connexions, durée depuis le premier train"
```

---

### Task 3 : fichiers de sortie et ligne de commande

**Files:**
- Create: `horaires/sortie.py`, `horaires/__main__.py`, `horaires/tests/test_sortie.py`

- [ ] **Step 1 : tests qui échouent**

`horaires/tests/test_sortie.py` :

```python
import json
import struct
import tempfile
import unittest
from pathlib import Path

from horaires.gtfs import charger
from horaires.parcours import INJOIGNABLE, Trajet
from horaires.sortie import encoder_ligne, index_voisins, ecrire_tout
from horaires.tests.fabrique import archive


class SortieTest(unittest.TestCase):
    def test_encoder_ligne(self):
        octets = encoder_ligne([Trajet(0, 0.0, False), Trajet(100, 157.4, True), Trajet(INJOIGNABLE, 0.0, False)])
        self.assertEqual(len(octets), 15)
        self.assertEqual(struct.unpack_from("<HHB", octets, 5), (100, 157, 1))
        self.assertEqual(struct.unpack_from("<HHB", octets, 10), (INJOIGNABLE, 0, 0))

    def test_index_voisins(self):
        reseau = charger(archive())
        grille = {"lon0": 4.0, "lat0": 45.0, "pasLon": 1.0, "pasLat": 1.0, "nx": 3, "ny": 1, "dedans": [1, 1, 0]}
        octets = index_voisins(reseau.gares, grille)
        self.assertEqual(len(octets), 3 * 12)
        gare, hm = struct.unpack_from("<HH", octets, 0)
        self.assertEqual((gare, hm), (0, 0))
        self.assertEqual(struct.unpack_from("<H", octets, 24)[0], INJOIGNABLE)

    def test_ecrire_tout(self):
        reseau = charger(archive())
        grille = {"lon0": 4.0, "lat0": 45.0, "pasLon": 1.0, "pasLat": 1.0, "nx": 3, "ny": 1, "dedans": [1, 1, 1]}
        with tempfile.TemporaryDirectory() as d:
            ecrire_tout(reseau, grille, Path(d), processus=1)
            stations = json.loads((Path(d) / "stations.json").read_text())
            self.assertEqual(stations[0], {"nom": "Alpha", "lat": 45.0, "lon": 4.0})
            self.assertEqual(len((Path(d) / "lignes" / "0.bin").read_bytes()), 5 * 4)
            version = json.loads((Path(d) / "version.json").read_text())
            self.assertEqual(version["jour"], "20261006")


if __name__ == "__main__":
    unittest.main()
```

Run: `npm run test:horaires` : FAIL.

- [ ] **Step 2 : implémentation**

`horaires/sortie.py` :

```python
"""Écriture des fichiers statiques lus par le navigateur."""
from __future__ import annotations

import base64
import datetime
import heapq
import json
import struct
from multiprocessing import Pool
from pathlib import Path

from horaires.geo import haversine_km
from horaires.gtfs import Gare, Reseau
from horaires.parcours import INJOIGNABLE, Trajet, meilleurs_trajets

NB_VOISINS = 3
KM_MAX = 65535
HECTOMETRES_MAX = 65535

_reseau: Reseau | None = None


def encoder_ligne(trajets: list[Trajet]) -> bytes:
    sortie = bytearray()
    for t in trajets:
        km = 0 if t.minutes == INJOIGNABLE else min(KM_MAX, round(t.km))
        sortie += struct.pack("<HHB", t.minutes, km, 1 if t.grande_ligne else 0)
    return bytes(sortie)


def _dedans(grille: dict) -> list[int]:
    brut = grille["dedans"]
    return list(base64.b64decode(brut)) if isinstance(brut, str) else list(brut)


def index_voisins(gares: list[Gare], grille: dict) -> bytes:
    """Pour chaque point de grille : les 3 gares les plus proches et leur distance en hectomètres."""
    dedans = _dedans(grille)
    cases: dict[tuple[int, int], list[int]] = {}
    for i, g in enumerate(gares):
        cases.setdefault((int(g.lat * 2), int(g.lon * 2)), []).append(i)
    sortie = bytearray()
    for k in range(grille["nx"] * grille["ny"]):
        if not dedans[k]:
            sortie += struct.pack("<HH", INJOIGNABLE, 0) * NB_VOISINS
            continue
        lon = grille["lon0"] + (k % grille["nx"]) * grille["pasLon"]
        lat = grille["lat0"] + (k // grille["nx"]) * grille["pasLat"]
        candidats: list[int] = []
        rayon = 1
        while len(candidats) < NB_VOISINS and rayon <= 40:
            cy, cx = int(lat * 2), int(lon * 2)
            candidats = [
                i
                for dy in range(-rayon, rayon + 1)
                for dx in range(-rayon, rayon + 1)
                for i in cases.get((cy + dy, cx + dx), [])
            ]
            rayon += 1
        proches = heapq.nsmallest(
            NB_VOISINS, ((haversine_km(lat, lon, gares[i].lat, gares[i].lon), i) for i in candidats)
        )
        for d, i in proches:
            sortie += struct.pack("<HH", i, min(HECTOMETRES_MAX, round(d * 10)))
        sortie += struct.pack("<HH", INJOIGNABLE, 0) * (NB_VOISINS - len(proches))
    return bytes(sortie)


def _initialiser(reseau: Reseau) -> None:
    global _reseau
    _reseau = reseau


def _ligne(source: int) -> tuple[int, bytes]:
    assert _reseau is not None
    return source, encoder_ligne(meilleurs_trajets(_reseau, source))


def ecrire_tout(reseau: Reseau, grille: dict, dossier: Path, processus: int) -> None:
    (dossier / "lignes").mkdir(parents=True, exist_ok=True)
    stations = [{"nom": g.nom, "lat": g.lat, "lon": g.lon} for g in reseau.gares]
    (dossier / "stations.json").write_text(json.dumps(stations, ensure_ascii=False))
    (dossier / "voisins-4km.bin").write_bytes(index_voisins(reseau.gares, grille))
    sources = range(len(reseau.gares))
    if processus == 1:
        _initialiser(reseau)
        resultats = map(_ligne, sources)
    else:
        pool = Pool(processus, initializer=_initialiser, initargs=(reseau,))
        resultats = pool.imap_unordered(_ligne, sources, chunksize=16)
    for source, octets in resultats:
        (dossier / "lignes" / f"{source}.bin").write_bytes(octets)
    if processus != 1:
        pool.close()
        pool.join()
    version = {
        "feed_version": reseau.version,
        "jour": reseau.jour,
        "genere_le": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "nb_gares": len(reseau.gares),
    }
    (dossier / "version.json").write_text(json.dumps(version))
```

`horaires/__main__.py` :

```python
"""python3 -m horaires --sortie public/data/tc [--source fichier.zip]"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

from horaires.gtfs import charger
from horaires.sortie import ecrire_tout

URL_SNCF = "https://eu.ftp.opendatasoft.com/sncf/plandata/Export_OpenData_SNCF_GTFS_NewTripId.zip"
GRILLE = Path("public/data/grille-4km.json")


def main() -> int:
    p = argparse.ArgumentParser(description="Calcule les trajets en train entre toutes les gares.")
    p.add_argument("--sortie", type=Path, required=True)
    p.add_argument("--source", type=Path, help="archive GTFS locale (sinon téléchargée)")
    p.add_argument("--processus", type=int, default=os.cpu_count() or 1)
    args = p.parse_args()

    debut = time.monotonic()
    contenu = args.source.read_bytes() if args.source else urllib.request.urlopen(URL_SNCF, timeout=120).read()
    reseau = charger(contenu)
    print(f"horaires {reseau.version}, jour {reseau.jour} : {len(reseau.gares)} gares, {len(reseau.connexions)} connexions")
    grille = json.loads(GRILLE.read_text())
    ecrire_tout(reseau, grille, args.sortie, args.processus)
    print(f"écrit dans {args.sortie} en {time.monotonic() - debut:.0f} s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 3 : vérifier**

Run: `npm run test:horaires` puis `npm run horaires`
Expected: tests OK ; la commande affiche le nombre de gares (environ
3389) et de connexions, puis une durée de quelques minutes. Contrôle :
`ls public/data/tc/lignes | wc -l` = nombre de gares ;
`du -sh public/data/tc` environ 18 Mo.

- [ ] **Step 4 : commit**

```bash
git add horaires/sortie.py horaires/__main__.py horaires/tests/test_sortie.py
git commit -m "feat: fichiers d'horaires pour le navigateur"
```

---

### Task 4 : publication avec les horaires

**Files:**
- Modify: `.github/workflows/pages.yml`, `README.md`

- [ ] **Step 1 : workflow**

Dans le job `construire` de `.github/workflows/pages.yml`, ajouter le
déclencheur hebdomadaire et, **avant** l'étape `npm run build`, les étapes
suivantes :

```yaml
on:
  push:
    branches: [main]
  schedule:
    - cron: '23 4 * * 3'
  workflow_dispatch:
```

```yaml
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - name: Tests des horaires
        run: npm run test:horaires
      - name: Version des horaires
        id: version
        run: |
          mkdir -p .cache-horaires
          curl -sfL -o .cache-horaires/sncf.zip "https://eu.ftp.opendatasoft.com/sncf/plandata/Export_OpenData_SNCF_GTFS_NewTripId.zip"
          v=$(unzip -p .cache-horaires/sncf.zip feed_info.txt | tail -1 | cut -d, -f7)
          echo "cle=horaires-$v-$(sha256sum horaires/*.py public/data/grille-4km.json | sha256sum | cut -c1-12)" >> "$GITHUB_OUTPUT"
      - name: Cache des horaires
        id: cache
        uses: actions/cache@v4
        with:
          path: public/data/tc
          key: ${{ steps.version.outputs.cle }}
      - name: Calculer les horaires
        if: steps.cache.outputs.cache-hit != 'true'
        run: python3 -m horaires --sortie public/data/tc --source .cache-horaires/sncf.zip
```

La clé change si les horaires, le code de calcul ou la grille changent.

- [ ] **Step 2 : README**

Ajouter à la section « Développer » :

```markdown
- `npm run horaires` : télécharge les horaires SNCF et calcule les trajets
  entre gares dans `public/data/tc/` (quelques minutes, non commité).
- `npm run test:horaires` : tests du calcul (Python, bibliothèque standard).
```

- [ ] **Step 3 : commit**

```bash
git add .github/workflows/pages.yml README.md
git commit -m "ci: horaires calculés et mis en cache à la publication"
```

---

### Task 5 : grandeur, unités et état

**Files:**
- Modify: `src/types.ts`, `src/etat/url.ts`, `src/ui/assemblage.ts`
- Create: `src/calcul/unites.ts`
- Test: `tests/unit/url.test.ts`, `tests/unit/unites.test.ts`, `tests/unit/assemblage.test.ts`

- [ ] **Step 1 : tests qui échouent**

`tests/unit/unites.test.ts` :

```ts
import { expect, test } from 'vitest'
import { maximaProposes, pasTranches, uniteDe } from '../../src/calcul/unites'

test('unité selon le mode et la grandeur', () => {
  expect(uniteDe('oiseau', 'prix')).toBe('km')
  expect(uniteDe('tc', 'temps')).toBe('min')
  expect(uniteDe('tc', 'prix')).toBe('eur')
})

test('pas des tranches par unité', () => {
  expect(pasTranches('km')).toBe(100)
  expect(pasTranches('min')).toBe(60)
  expect(pasTranches('eur')).toBe(20)
})

test('maxima proposés par unité', () => {
  expect(maximaProposes('min')).toEqual([60, 120, 180, 240, 300, 360])
  expect(maximaProposes('eur')).toEqual([20, 40, 60, 80, 100, 150])
})
```

Ajouter à `tests/unit/url.test.ts` :

```ts
test('grandeur lue, écrite, et temps par défaut', () => {
  expect(lireEtat('').grandeur).toBe('temps')
  expect(lireEtat('?grandeur=prix').grandeur).toBe('prix')
  expect(lireEtat('?grandeur=poids').grandeur).toBe('temps')
  expect(lireEtat(ecrireEtat({ ...ETAT_DEFAUT, grandeur: 'prix' })).grandeur).toBe('prix')
})
```

et ajouter `grandeur: 'temps'` à l'objet `e` du test d'aller-retour.

Ajouter à `tests/unit/assemblage.test.ts` :

```ts
test('la grandeur change la clé des zones', () => {
  const a = cleZones({ ...ETAT_DEFAUT, mode: 'tc', grandeur: 'temps' }, ['x'], 1)
  const b = cleZones({ ...ETAT_DEFAUT, mode: 'tc', grandeur: 'prix' }, ['x'], 1)
  expect(a).not.toBe(b)
})
```

(importer `ETAT_DEFAUT` depuis `../../src/etat/url` si ce n'est pas déjà
fait).

Run: `npm test` : FAIL.

- [ ] **Step 2 : implémentation**

`src/types.ts` : ajouter

```ts
/** Ce qui est colorié en voiture et en transports ; le vol d'oiseau est toujours en km. */
export type Grandeur = 'temps' | 'prix'
```

et le champ `grandeur: Grandeur` dans `Etat` (après `critere`).

`src/calcul/unites.ts` :

```ts
import type { Grandeur, Mode } from '../types'

export type Unite = 'km' | 'min' | 'eur'

export function uniteDe(mode: Mode, grandeur: Grandeur): Unite {
  if (mode === 'oiseau') return 'km'
  return grandeur === 'temps' ? 'min' : 'eur'
}

const PAS: Record<Unite, number> = { km: 100, min: 60, eur: 20 }
const MAXIMA: Record<Unite, number[]> = {
  km: [100, 200, 300, 400, 500, 700],
  min: [60, 120, 180, 240, 300, 360],
  eur: [20, 40, 60, 80, 100, 150],
}

export const pasTranches = (u: Unite): number => PAS[u]
export const maximaProposes = (u: Unite): number[] => MAXIMA[u]
```

`src/etat/url.ts` : `ETAT_DEFAUT` gagne `grandeur: 'temps'` ; `lireEtat`
lit `grandeur` (valeurs `temps`, `prix`, sinon `temps`) ; `ecrireEtat`
écrit `grandeur` seulement si le mode n'est pas `oiseau`.

`src/ui/assemblage.ts` : `cleZones` inclut `e.grandeur`.

- [ ] **Step 3 : vérifier et commit**

Run: `npm test && npx tsc --noEmit` : PASS (corriger les objets `Etat`
des tests existants en ajoutant `grandeur`).

```bash
git add src/types.ts src/etat/url.ts src/ui/assemblage.ts src/calcul/unites.ts tests/unit
git commit -m "feat: grandeur temps ou prix et unités"
```

---

### Task 6 : formats et titre génériques

**Files:**
- Modify: `src/ui/format.ts`, `src/ui/legende.ts`, `src/ui/marqueurs.ts`
- Test: `tests/unit/format.test.ts`, `tests/unit/legende.test.ts`, `tests/unit/marqueurs.test.ts`

- [ ] **Step 1 : tests qui échouent**

Ajouter à `tests/unit/format.test.ts` :

```ts
import { duree, euros, valeur, titre } from '../../src/ui/format'

test('durées lisibles', () => {
  expect(duree(45)).toBe('45 min')
  expect(duree(60)).toBe('1 h')
  expect(duree(194)).toBe('3 h 14')
  expect(duree(125.6)).toBe('2 h 06')
})

test('prix arrondis à l’euro, sans espace des milliers', () => {
  expect(euros(61.4)).toBe('61 €')
  expect(euros(1234)).toBe('1234 €')
})

test('valeur selon l’unité', () => {
  expect(valeur(120, 'km')).toBe('120 km')
  expect(valeur(120, 'min')).toBe('2 h')
  expect(valeur(40, 'eur')).toBe('40 €')
})

test('titre selon le mode, la grandeur et le maximum', () => {
  expect(titre({ nombre: 3, mode: 'tc', unite: 'min', critere: 'pire', max: 180 })).toBe(
    'Où se retrouver à 3, en transports, sans dépasser 3 h',
  )
  expect(titre({ nombre: 3, mode: 'tc', unite: 'eur', critere: 'moyenne', max: null })).toBe(
    'Où se retrouver à 3, en transports, au moins cher en moyenne',
  )
  expect(titre({ nombre: 2, mode: 'oiseau', unite: 'km', critere: 'pire', max: null })).toBe(
    'Où se retrouver à 2, à vol d’oiseau, au pire trajet le plus court',
  )
})
```

Remplacer les anciens tests de `titre(n, critere, max)` par cette
nouvelle signature.

Dans les tests de légende et de marqueurs, ajouter un cas en minutes :
`rendreLegende(el, tranches, 'min')` affiche « 1 h », « 2 h » et l'unité
finale n'est pas répétée ; `infobulleCentre(194, 'pire', 'min')` =
« Meilleur point, 3 h 14 au pire ».

Run: `npm test` : FAIL.

- [ ] **Step 2 : implémentation**

`src/ui/format.ts` :

```ts
import type { Unite } from '../calcul/unites'
import type { Critere, Mode, Transport } from '../types'

export const km = (v: number): string => `${Math.round(v)} km`

export function duree(minutes: number): string {
  const total = Math.round(minutes)
  if (total < 60) return `${total} min`
  const h = Math.floor(total / 60)
  const m = total % 60
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`
}

export const euros = (v: number): string => `${Math.round(v)} €`

export function valeur(v: number, unite: Unite): string {
  if (unite === 'min') return duree(v)
  if (unite === 'eur') return euros(v)
  return km(v)
}

export const libelleTransport = (t: Transport): string => (t === 'voiture' ? 'voiture' : 'transports')

const LIBELLE_MODE: Record<Mode, string> = {
  oiseau: 'à vol d’oiseau',
  tc: 'en transports',
  voiture: 'en voiture',
  mixte: 'chacun avec son moyen',
}

export interface OptionsTitre {
  nombre: number
  mode: Mode
  unite: Unite
  critere: Critere
  max: number | null
}

export function titre(o: OptionsTitre): string {
  const debut = `Où se retrouver à ${o.nombre}, ${LIBELLE_MODE[o.mode]}`
  if (o.max !== null) return `${debut}, sans dépasser ${valeur(o.max, o.unite)}`
  if (o.unite === 'eur') return o.critere === 'pire' ? `${debut}, sans billet trop cher pour personne` : `${debut}, au moins cher en moyenne`
  return o.critere === 'pire' ? `${debut}, au pire trajet le plus court` : `${debut}, au plus court en moyenne`
}

/** Échappe le texte avant insertion dans le HTML. */
export function echapper(texte: string): string {
  return texte.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}
```

`src/ui/legende.ts` : `rendreLegende(el, tranches, unite: Unite = 'km')`.
Les cases affichent `valeur(seuil, unite)` sans unité quand l'unité est
`km` (comportement actuel : nombres puis « km » final) ; en `min` et
`eur`, chaque case porte sa valeur formatée (`1 h`, `20 €`) et il n'y a
pas d'unité finale. L'`aria-label` utilise `valeur`.

`src/ui/marqueurs.ts` : `infobulleCentre(v, critere, unite: Unite = 'km')`
utilise `valeur(v, unite)`.

- [ ] **Step 3 : vérifier et commit**

Mettre à jour les appels dans `filtres.ts` (titre) et `main.ts`
(légende, infobulle) avec l'unité courante calculée par
`uniteDe(s.etat.mode, s.etat.grandeur)`.

Run: `npm test && npx tsc --noEmit` : PASS.

```bash
git add src/ui tests/unit src/main.ts
git commit -m "feat: formats de durée et de prix, titre selon le mode"
```

---

### Task 7 : chargement des horaires dans le navigateur

**Files:**
- Create: `src/donnees/horaires.ts`
- Test: `tests/unit/horaires.test.ts`

- [ ] **Step 1 : tests qui échouent**

`tests/unit/horaires.test.ts` :

```ts
import { afterEach, expect, test, vi } from 'vitest'
import { creerHoraires, decoderLigne, decoderVoisins } from '../../src/donnees/horaires'

afterEach(() => vi.unstubAllGlobals())

function ligneBinaire(entrees: [number, number, number][]): ArrayBuffer {
  const v = new DataView(new ArrayBuffer(entrees.length * 5))
  entrees.forEach(([m, k, f], j) => {
    v.setUint16(j * 5, m, true)
    v.setUint16(j * 5 + 2, k, true)
    v.setUint8(j * 5 + 4, f)
  })
  return v.buffer
}

test('decoderLigne lit minutes, km et grande ligne', () => {
  const l = decoderLigne(ligneBinaire([[0, 0, 0], [194, 750, 1]]))
  expect(Array.from(l.minutes)).toEqual([0, 194])
  expect(Array.from(l.km)).toEqual([0, 750])
  expect(Array.from(l.grandeLigne)).toEqual([0, 1])
})

test('decoderLigne refuse une taille incohérente', () => {
  expect(() => decoderLigne(new ArrayBuffer(7))).toThrow('horaires')
})

test('decoderVoisins lit gares et distances', () => {
  const v = new DataView(new ArrayBuffer(12))
  v.setUint16(0, 5, true)
  v.setUint16(2, 12, true)
  const d = decoderVoisins(v.buffer)
  expect(d.gares[0]).toBe(5)
  expect(d.hectometres[0]).toBe(12)
})

test('les lignes sont chargées une seule fois', async () => {
  const f = vi.fn(async (url: string) => {
    if (url.endsWith('stations.json')) return new Response(JSON.stringify([{ nom: 'A', lat: 45, lon: 4 }]))
    if (url.endsWith('voisins-4km.bin')) return new Response(new ArrayBuffer(12))
    return new Response(ligneBinaire([[0, 0, 0]]))
  })
  vi.stubGlobal('fetch', f)
  const h = await creerHoraires()
  await Promise.all([h.lignes([0]), h.lignes([0])])
  expect(f.mock.calls.filter(([u]) => String(u).endsWith('lignes/0.bin'))).toHaveLength(1)
  expect(h.ligne(0)?.minutes[0]).toBe(0)
})

test('horaires absents : erreur claire', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
  await expect(creerHoraires()).rejects.toThrow('Horaires des trains indisponibles')
})
```

Run: `npm test` : FAIL.

- [ ] **Step 2 : implémentation**

`src/donnees/horaires.ts` :

```ts
export interface Station {
  nom: string
  lat: number
  lon: number
}

export interface Ligne {
  minutes: Uint16Array
  km: Uint16Array
  grandeLigne: Uint8Array
}

export interface Voisins {
  gares: Uint16Array
  hectometres: Uint16Array
}

export interface Horaires {
  stations: Station[]
  voisins: Voisins
  /** Charge (une fois) les lignes demandées. */
  lignes(indices: number[]): Promise<void>
  /** Ligne déjà chargée, sinon undefined. */
  ligne(indice: number): Ligne | undefined
}

export const INJOIGNABLE = 65535
export const NB_VOISINS = 3
const OCTETS_PAR_GARE = 5
const MESSAGE = 'Horaires des trains indisponibles pour le moment.'

export function decoderLigne(tampon: ArrayBuffer): Ligne {
  if (tampon.byteLength % OCTETS_PAR_GARE !== 0) throw new Error(`Fichier d’horaires invalide (${tampon.byteLength} octets).`)
  const n = tampon.byteLength / OCTETS_PAR_GARE
  const v = new DataView(tampon)
  const ligne: Ligne = { minutes: new Uint16Array(n), km: new Uint16Array(n), grandeLigne: new Uint8Array(n) }
  for (let j = 0; j < n; j++) {
    ligne.minutes[j] = v.getUint16(j * OCTETS_PAR_GARE, true)
    ligne.km[j] = v.getUint16(j * OCTETS_PAR_GARE + 2, true)
    ligne.grandeLigne[j] = v.getUint8(j * OCTETS_PAR_GARE + 4)
  }
  return ligne
}

export function decoderVoisins(tampon: ArrayBuffer): Voisins {
  const n = Math.floor(tampon.byteLength / 4)
  const v = new DataView(tampon)
  const gares = new Uint16Array(n)
  const hectometres = new Uint16Array(n)
  for (let i = 0; i < n; i++) {
    gares[i] = v.getUint16(i * 4, true)
    hectometres[i] = v.getUint16(i * 4 + 2, true)
  }
  return { gares, hectometres }
}

async function lire(chemin: string): Promise<Response> {
  let reponse: Response
  try {
    reponse = await fetch(`${import.meta.env.BASE_URL}data/tc/${chemin}`)
  } catch (e) {
    console.error('Horaires : réseau', e)
    throw new Error(MESSAGE)
  }
  if (!reponse.ok) {
    console.error(`Horaires : ${chemin} HTTP ${reponse.status}`)
    throw new Error(MESSAGE)
  }
  return reponse
}

export async function creerHoraires(): Promise<Horaires> {
  const [stations, voisins] = await Promise.all([
    lire('stations.json').then((r) => r.json() as Promise<Station[]>),
    lire('voisins-4km.bin').then((r) => r.arrayBuffer()).then(decoderVoisins),
  ])
  const chargees = new Map<number, Ligne>()
  const enCours = new Map<number, Promise<void>>()
  const charger = (i: number): Promise<void> => {
    if (chargees.has(i)) return Promise.resolve()
    const deja = enCours.get(i)
    if (deja) return deja
    const p = lire(`lignes/${i}.bin`)
      .then((r) => r.arrayBuffer())
      .then((b) => { chargees.set(i, decoderLigne(b)) })
      .finally(() => enCours.delete(i))
    enCours.set(i, p)
    return p
  }
  return {
    stations,
    voisins,
    lignes: async (indices) => { await Promise.all([...new Set(indices)].map(charger)) },
    ligne: (i) => chargees.get(i),
  }
}
```

- [ ] **Step 3 : vérifier et commit**

Run: `npm test && npx tsc --noEmit` : PASS.

```bash
git add src/donnees/horaires.ts tests/unit/horaires.test.ts
git commit -m "feat: chargement des horaires dans le navigateur"
```

---

### Task 8 : calcul des trajets en transports

**Files:**
- Create: `src/calcul/tc.ts`
- Test: `tests/unit/tc.test.ts`

Règles (spec 5.3, écarts ci-dessus) :
- distance routière estimée = vol d'oiseau x 1,3 ;
- **accès** d'une personne à une gare : à pied si ≤ 1,5 km (4,5 km/h),
  sinon voiture (40 km/h) si la personne se déplace en voiture, sinon bus
  (20 km/h) ;
- **sortie** d'une gare vers le lieu : à pied si ≤ 1,5 km, sinon bus ;
- **trajet direct** sans train, par les mêmes règles que l'accès, retenu
  seulement si le vol d'oiseau fait au plus 30 km ;
- temps total = accès + train + sortie, minimum sur les 3 gares proches de
  la personne et les 3 gares proches du lieu ;
- prix du chemin le plus rapide = prix du train + 2 € par trajet en bus
  (accès et sortie) ; prix du train = max(5 €, km x taux), taux 0,10 si
  une grande ligne est empruntée, sinon 0,12 ; pas de train = 0 €.

- [ ] **Step 1 : tests qui échouent**

`tests/unit/tc.test.ts` :

```ts
import { expect, test } from 'vitest'
import type { Grille } from '../../src/calcul/grille'
import { acces, coucheTc, depuisGares, garesProches, prixTrain, versPointTc } from '../../src/calcul/tc'
import type { Horaires, Ligne } from '../../src/donnees/horaires'
import type { Ami } from '../../src/types'

const ligne = (m: number[], k: number[], g: number[]): Ligne => ({
  minutes: Uint16Array.from(m), km: Uint16Array.from(k), grandeLigne: Uint8Array.from(g),
})

// Gare 0 à Marseille, gare 1 à Paris ; 194 min, 750 km, grande ligne.
const lignes = new Map([
  [0, ligne([0, 194], [0, 750], [0, 1])],
  [1, ligne([196, 0], [750, 0], [1, 0])],
])
const horaires: Horaires = {
  stations: [{ nom: 'Marseille Saint-Charles', lat: 43.3027, lon: 5.3804 }, { nom: 'Paris Gare de Lyon', lat: 48.8449, lon: 2.3735 }],
  voisins: { gares: new Uint16Array(), hectometres: new Uint16Array() },
  lignes: async () => {},
  ligne: (i) => lignes.get(i),
}
const franck: Ami = { id: 'f', nom: 'Franck', adresse: 'x', lat: 43.2955, lon: 5.3925, transport: 'tc', navigo: false }

test('accès : à pied, en bus, en voiture', () => {
  expect(acces(1, 'tc')).toBeCloseTo((1 * 1.3 / 4.5) * 60)
  expect(acces(10, 'tc')).toBeCloseTo((10 * 1.3 / 20) * 60)
  expect(acces(10, 'voiture')).toBeCloseTo((10 * 1.3 / 40) * 60)
})

test('prix du train', () => {
  expect(prixTrain(0, false)).toBe(0)
  expect(prixTrain(20, false)).toBe(5)
  expect(prixTrain(750, true)).toBeCloseTo(75)
  expect(prixTrain(100, false)).toBeCloseTo(12)
})

test('garesProches trie par distance', () => {
  const g = garesProches(horaires.stations, 48.85, 2.35, 2)
  expect(g.map((x) => x.gare)).toEqual([1, 0])
})

test('depuisGares : temps et prix vers chaque gare, gare de départ retenue', () => {
  const d = depuisGares(horaires, franck)
  expect(d.minutes[1]).toBeGreaterThan(194)
  // Accès à pied d'environ 1,3 km depuis le boulevard Chave : un peu plus de 20 min.
  expect(d.minutes[1]).toBeLessThan(194 + 30)
  expect(d.euros[1]).toBeCloseTo(75)
  expect(d.depart[1]).toBe(0)
})

test('versPointTc : trajet complet avec gares et direct si proche', () => {
  const d = depuisGares(horaires, franck)
  const loin = versPointTc(horaires, d, franck, 48.8566, 2.3522)!
  expect(loin.minutes).toBeGreaterThan(194)
  expect(loin.depart).toBe('Marseille Saint-Charles')
  expect(loin.arrivee).toBe('Paris Gare de Lyon')
  const pres = versPointTc(horaires, d, franck, 43.2965, 5.37)!
  expect(pres.depart).toBeNull()
})

test('coucheTc : NaN hors de France, valeurs ailleurs', () => {
  const grille: Grille = { lon0: 2.3522, lat0: 48.8566, pasLon: 1, pasLat: 1, nx: 2, ny: 1, dedans: new Uint8Array([1, 0]) }
  const h: Horaires = {
    ...horaires,
    voisins: {
      gares: Uint16Array.from([1, 65535, 65535, 65535, 65535, 65535]),
      hectometres: Uint16Array.from([20, 0, 0, 0, 0, 0]),
    },
  }
  const d = depuisGares(h, franck)
  const temps = coucheTc(grille, h, d, franck, 'temps')
  expect(temps[0]).toBeGreaterThan(194)
  expect(Number.isNaN(temps[1])).toBe(true)
  const prix = coucheTc(grille, h, d, franck, 'prix')
  expect(prix[0]).toBeCloseTo(75 + 2)
})
```

Run: `npm test` : FAIL.

- [ ] **Step 2 : implémentation**

`src/calcul/tc.ts` :

```ts
import type { Horaires, Station } from '../donnees/horaires'
import { INJOIGNABLE, NB_VOISINS } from '../donnees/horaires'
import type { Ami, Grandeur, Transport } from '../types'
import { haversineKm } from './geo'
import type { Grille } from './grille'

const DETOUR = 1.3
const MARCHE_MAX_KM = 1.5
const VITESSE = { marche: 4.5, bus: 20, voiture: 40 } as const
const DIRECT_MAX_KM = 30
const PRIX_BUS = 2
const PRIX_MIN_TRAIN = 5
const TAUX_GRANDE_LIGNE = 0.1
const TAUX_REGIONAL = 0.12

const minutesA = (km: number, vitesse: number): number => ((km * DETOUR) / vitesse) * 60

export function acces(km: number, transport: Transport): number {
  if (km <= MARCHE_MAX_KM) return minutesA(km, VITESSE.marche)
  return minutesA(km, transport === 'voiture' ? VITESSE.voiture : VITESSE.bus)
}

const prixAcces = (km: number, transport: Transport): number =>
  km > MARCHE_MAX_KM && transport !== 'voiture' ? PRIX_BUS : 0

export function prixTrain(km: number, grandeLigne: boolean): number {
  if (km <= 0) return 0
  return Math.max(PRIX_MIN_TRAIN, km * (grandeLigne ? TAUX_GRANDE_LIGNE : TAUX_REGIONAL))
}

export interface Proche {
  gare: number
  km: number
}

export function garesProches(stations: Station[], lat: number, lon: number, n = NB_VOISINS): Proche[] {
  return stations
    .map((s, gare) => ({ gare, km: haversineKm(lat, lon, s.lat, s.lon) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, n)
}

/** Meilleur trajet d'une personne vers chaque gare (accès compris). */
export interface DepuisGares {
  minutes: Float32Array
  euros: Float32Array
  /** Gare de départ retenue, -1 si injoignable. */
  depart: Int32Array
  proches: Proche[]
}

export function depuisGares(h: Horaires, ami: Ami): DepuisGares {
  const n = h.stations.length
  const r: DepuisGares = {
    minutes: new Float32Array(n).fill(Number.POSITIVE_INFINITY),
    euros: new Float32Array(n).fill(Number.NaN),
    depart: new Int32Array(n).fill(-1),
    proches: garesProches(h.stations, ami.lat, ami.lon),
  }
  for (const p of r.proches) {
    const ligne = h.ligne(p.gare)
    if (!ligne) continue
    const avant = acces(p.km, ami.transport)
    const prixAvant = prixAcces(p.km, ami.transport)
    for (let g = 0; g < n; g++) {
      const m = ligne.minutes[g]!
      if (m === INJOIGNABLE) continue
      const total = avant + m
      if (total < r.minutes[g]!) {
        r.minutes[g] = total
        r.euros[g] = prixAvant + prixTrain(ligne.km[g]!, ligne.grandeLigne[g] === 1)
        r.depart[g] = p.gare
      }
    }
  }
  return r
}

export interface TrajetTc {
  minutes: number
  euros: number
  /** Noms des gares, null pour un trajet direct sans train. */
  depart: string | null
  arrivee: string | null
}

function meilleurVers(h: Horaires, d: DepuisGares, ami: Ami, km: number, gares: Proche[]): TrajetTc | null {
  let best: TrajetTc | null = null
  if (km <= DIRECT_MAX_KM) {
    best = { minutes: acces(km, ami.transport), euros: prixAcces(km, ami.transport), depart: null, arrivee: null }
  }
  for (const g of gares) {
    const avant = d.minutes[g.gare]!
    if (!Number.isFinite(avant)) continue
    const minutes = avant + acces(g.km, 'tc')
    if (best === null || minutes < best.minutes) {
      best = {
        minutes,
        euros: d.euros[g.gare]! + prixAcces(g.km, 'tc'),
        depart: h.stations[d.depart[g.gare]!]!.nom,
        arrivee: h.stations[g.gare]!.nom,
      }
    }
  }
  return best
}

export function versPointTc(h: Horaires, d: DepuisGares, ami: Ami, lat: number, lon: number): TrajetTc | null {
  return meilleurVers(h, d, ami, haversineKm(ami.lat, ami.lon, lat, lon), garesProches(h.stations, lat, lon))
}

export function coucheTc(grille: Grille, h: Horaires, d: DepuisGares, ami: Ami, grandeur: Grandeur): Float32Array {
  const sortie = new Float32Array(grille.nx * grille.ny).fill(Number.NaN)
  for (let k = 0; k < sortie.length; k++) {
    if (grille.dedans[k] !== 1) continue
    const lon = grille.lon0 + (k % grille.nx) * grille.pasLon
    const lat = grille.lat0 + Math.floor(k / grille.nx) * grille.pasLat
    const gares: Proche[] = []
    for (let v = 0; v < NB_VOISINS; v++) {
      const gare = h.voisins.gares[k * NB_VOISINS + v]!
      if (gare !== INJOIGNABLE) gares.push({ gare, km: h.voisins.hectometres[k * NB_VOISINS + v]! / 10 })
    }
    const t = meilleurVers(h, d, ami, haversineKm(ami.lat, ami.lon, lat, lon), gares)
    if (t) sortie[k] = grandeur === 'temps' ? t.minutes : t.euros
  }
  return sortie
}
```

- [ ] **Step 3 : vérifier et commit**

Run: `npm test && npx tsc --noEmit` : PASS. Mesurer : `coucheTc` sur la
vraie grille de 4 km (80920 points) en moins de 50 ms (test ponctuel
avec `performance.now()` dans un script jetable, non commité).

```bash
git add src/calcul/tc.ts tests/unit/tc.test.ts
git commit -m "feat: trajets en transports, temps et prix"
```

---

### Task 9 : classement générique et affichage des trajets

**Files:**
- Modify: `src/calcul/villes.ts`, `src/ui/liste-villes.ts`, `src/ui/lieu.ts`
- Test: `tests/unit/villes.test.ts`, `tests/unit/panneau.test.ts`

- [ ] **Step 1 : tests qui échouent**

`classerVilles` prend une fonction de mesure à la place du vol d'oiseau :

```ts
export type Mesure = (ami: Ami, lat: number, lon: number) => Detail | null

export interface Detail {
  valeur: number
  /** Texte court sous la valeur, par exemple « Marseille Saint-Charles → Paris Gare de Lyon ». */
  precision?: string
}

export interface VilleClassee {
  ville: Ville
  parAmi: Detail[]
  total: number
  moyenne: number
  pire: number
}

export function classerVilles(villes, amis, mesure, critere, max, limite): VilleClassee[]
```

Une ville est écartée si une personne ne peut pas l'atteindre (`null`).

Tests à ajouter à `tests/unit/villes.test.ts` : la mesure vol d'oiseau
redonne l'ancien classement ; une mesure qui renvoie `null` pour une
personne écarte la ville.

Dans `tests/unit/panneau.test.ts` :
- une carte de ville en minutes affiche « Pire trajet 3 h 14 » et
  « Total 5 h 20 » ;
- en transports, le détail par personne affiche la précision (« Marseille
  Saint-Charles → Paris Gare de Lyon ») et les liens « SNCF Connect » et
  « Trainline » (ouverture dans un nouvel onglet, `rel="noopener"`) ;
- en vol d'oiseau, aucun lien de réservation ;
- le lieu testé affiche les valeurs dans l'unité courante et la précision.

Run: `npm test` : FAIL.

- [ ] **Step 2 : implémentation**

- `src/calcul/villes.ts` : implémenter la signature ci-dessus ; exporter
  `mesureOiseau: Mesure = (a, lat, lon) => ({ valeur: haversineKm(a.lat, a.lon, lat, lon) })`.
- `src/ui/liste-villes.ts` :
  - `DonneesVilles` gagne `unite: Unite` et `mode: Mode` ;
  - `detailParAmi(amis, details, unite)` : une ligne par personne, nom,
    valeur formatée, précision en petit texte sous le nom si présente ;
  - la ligne de la carte utilise `valeur(…, unite)` ;
  - en mode `tc`, deux liens dans le détail :
    `https://www.sncf-connect.com/` et `https://www.thetrainline.com/fr`
    (libellés « SNCF Connect » et « Trainline », `target="_blank"
    rel="noopener"`) ; les adresses sont constantes, aucune donnée de
    l'utilisateur n'y est ajoutée ;
  - le message « Aucune ville à moins de … » utilise l'unité.
- `src/ui/lieu.ts` : `rendreResultatLieu(el, lieu, amis, details, unite, retirer)`
  reçoit les détails déjà calculés (le calcul quitte le module
  d'affichage).

- [ ] **Step 3 : vérifier et commit**

Run: `npm test && npx tsc --noEmit` : PASS.

```bash
git add src/calcul/villes.ts src/ui/liste-villes.ts src/ui/lieu.ts tests/unit
git commit -m "feat: classement et détail des trajets dans l'unité courante"
```

---

### Task 10 : filtres du mode transports

**Files:**
- Modify: `src/ui/filtres.ts`
- Test: `tests/unit/panneau.test.ts`

- [ ] **Step 1 : tests qui échouent**

- le bouton « Tous en transports » est actif et, cliqué, appelle
  `changer({ mode: 'tc', max: null })` ;
- « Vol d’oiseau » cliqué appelle `changer({ mode: 'oiseau', max: null })` ;
- « Chacun son moyen » et « Tous en voiture » restent désactivés ;
- en mode `tc`, deux pastilles « Temps » et « Prix » (groupe
  `aria-label="Grandeur"`), la courante a `aria-pressed="true"` ; cliquer
  « Prix » appelle `changer({ grandeur: 'prix', max: null })` ;
- en mode `oiseau`, pas de pastilles Temps / Prix ;
- le menu maximum s'appelle « Durée maximum » (min), « Prix maximum »
  (eur) ou « Distance maximum » (km) et propose `maximaProposes(unite)`
  formatés (« 3 h max », « 40 € max », « 300 km max ») ;
- le titre suit `titre({ nombre, mode, unite, critere, max })`.

Run: `npm test` : FAIL.

- [ ] **Step 2 : implémentation**

Réécrire `rendreFiltres(el, e, nombre, changer)` selon ces règles. Les
boutons de mode actifs reçoivent un gestionnaire ; le changement de mode
ou de grandeur remet `max` à `null` (les unités diffèrent). Le mode actif
reste en tête de la rangée (décision du plan 1).

- [ ] **Step 3 : vérifier et commit**

Run: `npm test && npx tsc --noEmit` : PASS.

```bash
git add src/ui/filtres.ts tests/unit/panneau.test.ts
git commit -m "feat: filtres du mode transports, temps ou prix"
```

---

### Task 11 : assemblage du mode transports

**Files:**
- Modify: `src/main.ts`
- Create (si `main.ts` dépasse 300 lignes) : `src/calcul/couches.ts` avec tests

Règles :
- Les horaires sont chargés **à la première activation** du mode `tc`
  (`creerHoraires()`), pas au démarrage. Pendant le chargement,
  `#chargement` affiche « Chargement des horaires… ». En cas d'échec, le
  bandeau affiche le message avec « Réessayer », et le mode repasse en vol
  d'oiseau.
- Avant chaque calcul en `tc`, charger les lignes des 3 gares proches de
  chaque personne cochée (`horaires.lignes(indices)`), puis calculer.
- Cache par personne : clé `${mode}|${grandeur}|${lat},${lon},${transport}|${versionHoraires}`
  pour les couches ; `depuisGares` est mis en cache par personne avec la
  clé `${lat},${lon},${transport}`.
- `rendreZones` utilise `pasTranches(unite)`, `rendreLegende(…, unite)`,
  `infobulleCentre(…, unite)`.
- Villes : `mesure` = `mesureOiseau` ou, en `tc`,
  `(a, lat, lon) => { const t = versPointTc(h, depuis(a), a, lat, lon); return t && { valeur: grandeur === 'temps' ? t.minutes : t.euros, precision: t.depart ? `${t.depart} → ${t.arrivee}` : 'sans train' } }`.
- Lieu testé : mêmes détails.
- Le calcul asynchrone ne doit pas afficher un résultat périmé : un
  compteur de rendu ignore la fin d'un calcul si l'état a changé entre-temps.

- [ ] **Step 1 : tests**

Si `src/calcul/couches.ts` est créé : tests unitaires des clés de cache et
du choix de mesure. Sinon, la couverture vient de la Task 12.

- [ ] **Step 2 : implémentation et vérification**

Run: `npm test && npx tsc --noEmit && npm run build` : PASS.

Contrôle manuel : `npm run horaires` (si pas encore fait), faux Supabase
local (voir le plan 1, session du 2026-09-17), `npm run dev`, mode
« Tous en transports » : la carte se colore, Paris-Marseille ≈ 3 h 15 au
pire pour deux personnes à Paris et Marseille, le mode Prix affiche des
euros.

- [ ] **Step 3 : commit**

```bash
git add src/main.ts src/calcul
git commit -m "feat: mode tous en transports"
```

---

### Task 12 : parcours dans le navigateur

**Files:**
- Modify: `tests/e2e/parcours.spec.ts`
- Create: `tests/e2e/horaires-simules.ts`

- [ ] **Step 1 : horaires simulés**

`tests/e2e/horaires-simules.ts` fabrique en mémoire un petit jeu
d'horaires cohérent avec les deux personnes du parcours (Paris et Lyon) :
deux gares (Paris Gare de Lyon, Lyon Part-Dieu), lignes de 120 min et
465 km en grande ligne, et un `voisins-4km.bin` de la taille de la vraie
grille (`nx * ny` lu dans `public/data/grille-4km.json`) où chaque point
en France a pour voisine la gare la plus proche des deux. Les routes
Playwright servent `**/data/tc/stations.json`, `**/data/tc/voisins-4km.bin`
et `**/data/tc/lignes/*.bin` depuis ces tampons.

- [ ] **Step 2 : scénarios**

Ajouter :
1. « Tous en transports » : `#chargement` montre « Chargement des
   horaires… » puis disparaît ; le titre contient « en transports » ;
   légende en heures (« 1 h ») ; au moins une ville ; le détail d'une
   ville contient « Paris Gare de Lyon » et les liens SNCF Connect et
   Trainline ; l'URL contient `mode=tc`.
2. « Prix » : légende en euros, titre « au moins cher » ou menu « Prix
   maximum ».
3. Horaires absents (routes en 404) : bandeau « Horaires des trains
   indisponibles pour le moment. » avec « Réessayer », le mode revient à
   « Vol d’oiseau ».

Run: `npm run e2e`
Expected: tous les tests passent sur les deux projets (hors ignorés).

- [ ] **Step 3 : commit**

```bash
git add tests/e2e
git commit -m "test: parcours du mode transports avec horaires simulés"
```

---

### Task 13 : publication et contrôle en ligne

- [ ] **Step 1 :** fusionner la branche dans `main` après la revue finale,
  pousser, suivre le workflow `pages` (`gh run watch`). Le premier passage
  calcule les horaires (quelques minutes) ; un second passage sans
  changement doit afficher `Cache restored` et sauter le calcul.
- [ ] **Step 2 :** contrôle en ligne :
  `curl -sI https://francklm3.github.io/point-de-rencontre/data/tc/version.json`
  renvoie 200 ; le contenu donne le jour type et le nombre de gares.
- [ ] **Step 3 :** Franck se connecte, active « Tous en transports » et
  valide visuellement ; noter dans la mémoire du projet la date de mise
  en ligne.
