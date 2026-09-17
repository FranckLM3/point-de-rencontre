"""Lecture du GTFS SNCF : jour type, gares (zones d'arrêt), connexions, liaisons à pied ou urbaines."""
from __future__ import annotations

import csv
import datetime
import io
import math
import zipfile
from collections import Counter, defaultdict
from dataclasses import dataclass, field

from horaires.geo import haversine_km

TYPES_GRANDE_LIGNE = {"TGV INOUI", "INTERCITES", "INTERCITES de nuit", "OUIGO", "ICE", "Lyria"}
DISTANCE_A_PIED_KM = 1.0
VITESSE_MARCHE_KMH = 4.5
DETOUR = 1.3
DISTANCE_URBAINE_KM = 6.0
VITESSE_URBAINE_KMH = 20.0
ATTENTE_URBAINE_S = 15 * 60
CASES_PAR_DEGRE = 10  # 0,1° : au moins 6 km en latitude comme en longitude en France
MARGE_PREMIERE_SEMAINE = 7
MARDI = 1
NB_MARDIS_CANDIDATS = 6
INTERDIT = "1"


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
    montee: bool = True  # montée autorisée à `de`
    descente: bool = True  # descente autorisée à `vers`


@dataclass
class Reseau:
    version: str
    jour: str
    gares: list[Gare]
    connexions: list[Connexion]
    liaisons: list[list[tuple[int, int]]] = field(default_factory=list)  # (voisine, secondes)
    anomalies: dict[str, int] = field(default_factory=dict)  # lignes sautées, par motif


def _lire(z: zipfile.ZipFile, nom: str):
    with z.open(nom) as f:
        yield from csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))


def _secondes(h: str) -> int:
    heures, minutes, secondes = (int(x) for x in h.split(":"))
    return heures * 3600 + minutes * 60 + secondes


def _autorise(type_arret: str | None) -> bool:
    """GTFS pickup_type / drop_off_type : seul 1 interdit ; 0, 2, 3 ou vide autorisent."""
    return (type_arret or "").strip() != INTERDIT


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


def _minute(heures: float) -> int:
    return round(heures * 60) * 60


def duree_liaison_s(km: float) -> int | None:
    """Durée d'une liaison entre deux gares : à pied jusqu'à 1 km, urbaine jusqu'à 6 km."""
    durees = []
    if km <= DISTANCE_A_PIED_KM:
        durees.append(_minute(km * DETOUR / VITESSE_MARCHE_KMH))
    if km <= DISTANCE_URBAINE_KM:
        durees.append(ATTENTE_URBAINE_S + _minute(km * DETOUR / VITESSE_URBAINE_KMH))
    return min(durees, default=None)


def liaisons_entre_gares(gares: list[Gare], desservies: list[bool]) -> list[list[tuple[int, int]]]:
    """Liaisons directes (voisine, secondes) entre gares desservies, symétriques."""
    def case(g: Gare) -> tuple[int, int]:
        return math.floor(g.lat * CASES_PAR_DEGRE), math.floor(g.lon * CASES_PAR_DEGRE)

    cases: dict[tuple[int, int], list[int]] = defaultdict(list)
    for i, g in enumerate(gares):
        if desservies[i]:
            cases[case(g)].append(i)
    liaisons: list[list[tuple[int, int]]] = [[] for _ in gares]
    for i, g in enumerate(gares):
        if not desservies[i]:
            continue
        cy, cx = case(g)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                for j in cases.get((cy + dy, cx + dx), []):
                    if j == i:
                        continue
                    duree = duree_liaison_s(haversine_km(g.lat, g.lon, gares[j].lat, gares[j].lon))
                    if duree is not None:
                        liaisons[i].append((j, duree))
        liaisons[i].sort()
    return liaisons


def _info(z: zipfile.ZipFile) -> dict:
    if "feed_info.txt" not in z.namelist():
        raise ValueError("Archive GTFS sans feed_info.txt : version et dates des horaires inconnues.")
    info = next(_lire(z, "feed_info.txt"), None) or {}
    for champ in ("feed_start_date", "feed_version"):
        if not (info.get(champ) or "").strip():
            raise ValueError(f"feed_info.txt : champ {champ} vide ou absent.")
    return info


def _gares(z: zipfile.ZipFile, anomalies: Counter) -> tuple[list[Gare], dict[str, str]]:
    """Zones d'arrêt triées par identifiant, et zone de chaque point d'arrêt."""
    zones: list[Gare] = []
    points: dict[str, str] = {}
    for r in _lire(z, "stops.txt"):
        type_lieu = (r.get("location_type") or "").strip() or "0"
        if type_lieu == "1":
            try:
                zones.append(Gare(r["stop_id"], r["stop_name"], float(r["stop_lat"]), float(r["stop_lon"])))
            except (TypeError, ValueError):
                anomalies["zone sans position"] += 1
        elif type_lieu == "0":
            points[r["stop_id"]] = (r.get("parent_station") or "").strip()
    zones.sort(key=lambda g: g.identifiant)
    connues = {g.identifiant for g in zones}
    parent = {}
    for point, zone in points.items():
        if zone in connues:
            parent[point] = zone
        else:
            anomalies["point sans zone connue"] += 1
    return zones, parent


def _passages(z: zipfile.ZipFile, trajets: set[str], parent: dict[str, str], anomalies: Counter):
    """Passages valides des trajets du jour, triés par rang : (rang, arrivée, départ, ligne)."""
    passages: dict[str, list[tuple[int, int, int, dict]]] = defaultdict(list)
    for r in _lire(z, "stop_times.txt"):
        if r["trip_id"] not in trajets:
            continue
        if r["stop_id"] not in parent:
            anomalies["passage vers un point inconnu"] += 1
            continue
        try:
            rang = int(r["stop_sequence"])
        except (TypeError, ValueError):
            anomalies["passage sans rang"] += 1
            continue
        try:
            arrivee, depart = _secondes(r["arrival_time"]), _secondes(r["departure_time"])
        except (TypeError, ValueError):
            anomalies["passage sans heure"] += 1
            continue
        passages[r["trip_id"]].append((rang, arrivee, depart, r))
    for arrets in passages.values():
        arrets.sort(key=lambda p: p[0])
    return passages


def charger(contenu: bytes) -> Reseau:
    anomalies: Counter = Counter()
    with zipfile.ZipFile(io.BytesIO(contenu)) as z:
        info = _info(z)
        services_par_date: dict[str, set[str]] = defaultdict(set)
        for r in _lire(z, "calendar_dates.txt"):
            if r["exception_type"] == "1":
                services_par_date[r["date"]].add(r["service_id"])
        jour = _choisir_jour(services_par_date, info["feed_start_date"])
        actifs = services_par_date[jour]
        gares, parent = _gares(z, anomalies)
        indice = {g.identifiant: i for i, g in enumerate(gares)}
        trajets = {r["trip_id"] for r in _lire(z, "trips.txt") if r["service_id"] in actifs}
        passages = _passages(z, trajets, parent, anomalies)

    connexions: list[Connexion] = []
    for trajet, arrets in passages.items():
        for (_, _, depart, a), (_, arrivee, _, b) in zip(arrets, arrets[1:]):
            de, vers = indice[parent[a["stop_id"]]], indice[parent[b["stop_id"]]]
            if de == vers:
                continue
            ga, gb = gares[de], gares[vers]
            connexions.append(
                Connexion(
                    depart=depart,
                    arrivee=arrivee,
                    de=de,
                    vers=vers,
                    trajet=trajet,
                    km=haversine_km(ga.lat, ga.lon, gb.lat, gb.lon),
                    grande_ligne=_type_service(a["stop_id"]) in TYPES_GRANDE_LIGNE,
                    montee=_autorise(a.get("pickup_type")),
                    descente=_autorise(b.get("drop_off_type")),
                )
            )
    connexions.sort(key=lambda c: (c.depart, c.arrivee))
    desservies = [False] * len(gares)
    for c in connexions:
        desservies[c.de] = desservies[c.vers] = True
    liaisons = liaisons_entre_gares(gares, desservies)
    return Reseau(info["feed_version"], jour, gares, connexions, liaisons, dict(anomalies))
