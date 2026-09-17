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
