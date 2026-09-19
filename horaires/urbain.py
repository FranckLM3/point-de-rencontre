"""Réseaux urbains (métro, RER, Transilien, tram) : durée moyenne de chaque station vers chaque autre.

Lit le GTFS d'un réseau, garde les modes lourds d'un mardi type, et publie par réseau la liste
des stations et une matrice d'octets (minutes, 255 = injoignable), calculée par parcours de
connexions pour trois départs du matin (8 h 00, 8 h 20, 8 h 40), attente comprise.
Voir docs/superpowers/plans/2026-09-19-plan-4-reseaux-urbains.md.
"""
from __future__ import annotations

import argparse
import bisect
import csv
import datetime
import io
import json
import math
import shutil
import struct
import sys
import urllib.request
import zipfile
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

from horaires.geo import haversine_km
from horaires.gtfs import _choisir_jour, _date

RESEAUX = {
    "idf": ("Île-de-France", "https://eu.ftp.opendatasoft.com/stif/GTFS/IDFM-gtfs.zip"),
    "lyon": ("Lyon", "https://www.data.gouv.fr/api/1/datasets/r/abebedc6-28cf-4e2e-9c64-db57a40156f8"),
    "marseille": ("Marseille", "https://www.data.gouv.fr/api/1/datasets/r/7eef6ec9-9ebb-44f2-becb-2efc522522d6"),
}
# Tram, métro, train (RER et Transilien), funiculaire. Les bus (3) ne sont pas gardés.
TYPES_LOURDS = {"0", "1", "2", "7"}
# Lignes de mode lourd écartées : TER (déjà dans les horaires SNCF), navette aéroport à tarif spécial.
LIGNES_EXCLUES = {"TER", "Rhônexpress"}
DEPARTS_S = (8 * 3600, 8 * 3600 + 20 * 60, 8 * 3600 + 40 * 60)
DUREE_MAX_S = 150 * 60
CORRESPONDANCE_S = 2 * 60
MARCHE_MAX_KM = 0.8
VITESSE_MARCHE_KMH = 4.5
DETOUR = 1.3
CASES_PAR_DEGRE = 100  # 0,01° : 1,1 km en latitude, au moins 0,8 km en longitude en France
INJOIGNABLE = 255
SANS_PRECEDENTE = 65535
MARDI = 1


@dataclass(frozen=True)
class Station:
    nom: str
    lat: float
    lon: float


@dataclass
class ReseauUrbain:
    jour: str
    stations: list[Station]
    connexions: list[tuple[int, int, int, int, int]]  # départ, arrivée, de, vers, course ; triées
    marche: list[list[tuple[int, int]]]  # (voisine, secondes)


def _lire(z: zipfile.ZipFile, nom: str):
    if nom not in z.namelist():
        return iter(())
    return csv.DictReader(io.TextIOWrapper(z.open(nom), encoding="utf-8-sig"))


def _secondes(h: str) -> int:
    heures, minutes, secondes = h.split(":")
    return int(heures) * 3600 + int(minutes) * 60 + int(secondes)


def _services_des_mardis(z: zipfile.ZipFile) -> dict[str, set[str]]:
    """Services actifs à chaque mardi couvert par le calendrier."""
    regles = list(_lire(z, "calendar.txt"))
    exceptions = list(_lire(z, "calendar_dates.txt"))
    dates = [r["start_date"] for r in regles] + [r["end_date"] for r in regles] + [e["date"] for e in exceptions]
    if not dates:
        raise ValueError("Calendrier absent.")
    debut, fin = _date(min(dates)), _date(max(dates))
    par_date: dict[str, set[str]] = {}
    jour = debut + datetime.timedelta(days=(MARDI - debut.weekday()) % 7)
    while jour <= fin:
        texte = jour.strftime("%Y%m%d")
        par_date[texte] = {r["service_id"] for r in regles if r["tuesday"] == "1" and r["start_date"] <= texte <= r["end_date"]}
        jour += datetime.timedelta(days=7)
    for e in exceptions:
        services = par_date.get(e["date"])
        if services is None:
            continue
        if e["exception_type"] == "1":
            services.add(e["service_id"])
        else:
            services.discard(e["service_id"])
    return par_date


def _liaisons_a_pied(stations: list[Station]) -> list[list[tuple[int, int]]]:
    cases: dict[tuple[int, int], list[int]] = defaultdict(list)
    for i, s in enumerate(stations):
        cases[(math.floor(s.lat * CASES_PAR_DEGRE), math.floor(s.lon * CASES_PAR_DEGRE))].append(i)
    marche: list[list[tuple[int, int]]] = [[] for _ in stations]
    for i, s in enumerate(stations):
        ci, cj = math.floor(s.lat * CASES_PAR_DEGRE), math.floor(s.lon * CASES_PAR_DEGRE)
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                for j in cases.get((ci + di, cj + dj), ()):
                    if j == i:
                        continue
                    km = haversine_km(s.lat, s.lon, stations[j].lat, stations[j].lon)
                    if km <= MARCHE_MAX_KM:
                        marche[i].append((j, round(km * DETOUR / VITESSE_MARCHE_KMH * 3600)))
    return marche


def charger(contenu: bytes) -> ReseauUrbain:
    z = zipfile.ZipFile(io.BytesIO(contenu))
    lignes = {
        r["route_id"]
        for r in _lire(z, "routes.txt")
        if r["route_type"] in TYPES_LOURDS and r.get("route_short_name", "") not in LIGNES_EXCLUES
    }
    par_date = _services_des_mardis(z)
    jour = _choisir_jour(par_date, min(par_date))
    actifs = par_date[jour]
    courses = {t["trip_id"] for t in _lire(z, "trips.txt") if t["service_id"] in actifs and t["route_id"] in lignes}

    arrets = {s["stop_id"]: s for s in _lire(z, "stops.txt")}
    zone = {sid: (s.get("parent_station") or sid) for sid, s in arrets.items()}

    fin = DEPARTS_S[-1] + DUREE_MAX_S
    brutes: list[tuple[int, int, str, str, int]] = []
    numero: dict[str, int] = {}
    precedent: dict[str, tuple[str, int]] = {}
    for st in _lire(z, "stop_times.txt"):
        course = st["trip_id"]
        if course not in courses:
            continue
        depart_texte = st["departure_time"] or st["arrival_time"]
        if not depart_texte:
            continue  # arrêt sans heure (interpolé) : la course passe directement au suivant
        ici = zone[st["stop_id"]]
        arrivee = _secondes(st["arrival_time"] or depart_texte)
        p = precedent.get(course)
        if p is not None and p[0] != ici and DEPARTS_S[0] <= p[1] <= fin:
            brutes.append((p[1], arrivee, p[0], ici, numero.setdefault(course, len(numero))))
        precedent[course] = (ici, _secondes(depart_texte))

    zones = sorted({b[2] for b in brutes} | {b[3] for b in brutes}, key=lambda k: (arrets[k]["stop_name"], k))
    indice = {k: i for i, k in enumerate(zones)}
    stations = [Station(arrets[k]["stop_name"], float(arrets[k]["stop_lat"]), float(arrets[k]["stop_lon"])) for k in zones]
    connexions = sorted((d, a, indice[u], indice[v], c) for d, a, u, v, c in brutes)
    return ReseauUrbain(jour, stations, connexions, _liaisons_a_pied(stations))


def depart_unique(
    r: ReseauUrbain, source: int, depart: int, departs: list[int] | None = None
) -> tuple[list[float], list[int]]:
    """Heure d'arrivée au plus tôt à chaque station en partant de `source` à `depart`, et la station
    précédente sur ce trajet (arrêt par arrêt, marche comprise ; SANS_PRECEDENTE pour la source)."""
    n = len(r.stations)
    arrivee = [math.inf] * n
    precedente = [SANS_PRECEDENTE] * n
    marge = [0] * n  # correspondance à respecter en descendant d'un véhicule, pas à pied
    arrivee[source] = depart
    for j, s in r.marche[source]:
        if depart + s < arrivee[j]:
            arrivee[j] = depart + s
            precedente[j] = source
    montees: set[int] = set()
    departs = departs if departs is not None else [c[0] for c in r.connexions]
    borne = depart + DUREE_MAX_S
    for k in range(bisect.bisect_left(departs, depart), len(r.connexions)):
        d, a, u, v, course = r.connexions[k]
        if d > borne:
            break
        if course not in montees and arrivee[u] + marge[u] > d:
            continue
        montees.add(course)
        if a < arrivee[v]:
            arrivee[v] = a
            precedente[v] = u
            marge[v] = CORRESPONDANCE_S
            for j, s in r.marche[v]:
                if a + s < arrivee[j]:
                    arrivee[j] = a + s
                    precedente[j] = v
                    marge[j] = 0
    return arrivee, precedente


def calculer(r: ReseauUrbain) -> tuple[bytes, list[bytes]]:
    """Matrice N x N octets (durée moyenne en minutes sur les trois départs, 255 si injoignable) et,
    par station de départ, la station précédente vers chaque autre (uint16, départ de 8 h 00),
    pour retracer le trajet arrêt par arrêt sur la carte."""
    n = len(r.stations)
    departs = [c[0] for c in r.connexions]
    sortie = bytearray([INJOIGNABLE]) * (n * n)
    chemins: list[bytes] = []
    for source in range(n):
        sommes = [0.0] * n
        comptes = [0] * n
        for k, depart in enumerate(DEPARTS_S):
            arrivee, precedente = depart_unique(r, source, depart, departs)
            if k == 0:
                chemins.append(struct.pack(f"<{n}H", *precedente))
            for j, t in enumerate(arrivee):
                if t != math.inf:
                    sommes[j] += t - depart
                    comptes[j] += 1
        for j in range(n):
            if comptes[j]:
                sortie[source * n + j] = min(INJOIGNABLE - 1, round(sommes[j] / comptes[j] / 60))
    return bytes(sortie), chemins


def matrice(r: ReseauUrbain) -> bytes:
    return calculer(r)[0]


def ecrire(reseaux: dict[str, tuple[str, ReseauUrbain]], dossier: Path) -> None:
    dossier.mkdir(parents=True, exist_ok=True)
    index = []
    for ident, (nom, r) in reseaux.items():
        minutes, chemins = calculer(r)
        (dossier / f"{ident}.bin").write_bytes(minutes)
        (dossier / ident).mkdir(exist_ok=True)
        for source, octets in enumerate(chemins):
            (dossier / ident / f"{source}.bin").write_bytes(octets)
        stations = [[s.nom, round(s.lat, 5), round(s.lon, 5)] for s in r.stations]
        index.append({"id": ident, "nom": nom, "jour": r.jour, "stations": stations})
    (dossier / "reseaux.json").write_text(json.dumps({"reseaux": index}, ensure_ascii=False, separators=(",", ":")))


def _source(valeur: str) -> bytes:
    if valeur.startswith(("http://", "https://")):
        with urllib.request.urlopen(valeur, timeout=300) as reponse:
            return reponse.read()
    return Path(valeur).read_bytes()


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--sortie", type=Path, required=True)
    p.add_argument("--source", action="append", default=[], metavar="ID=CHEMIN_OU_URL", help="remplace la source d'un réseau")
    args = p.parse_args()
    sources = {ident: url for ident, (_, url) in RESEAUX.items()}
    for s in args.source:
        ident, _, valeur = s.partition("=")
        sources[ident] = valeur
    reseaux = {}
    for ident, (nom, _) in RESEAUX.items():
        r = charger(_source(sources[ident]))
        print(f"{nom} : {len(r.stations)} stations, {len(r.connexions)} connexions, jour {r.jour}", file=sys.stderr)
        reseaux[ident] = (nom, r)
    # Écrit à côté puis remplace d'un coup : une réserve restaurée n'est jamais à moitié écrasée.
    neuf = args.sortie.with_name(args.sortie.name + ".neuf")
    shutil.rmtree(neuf, ignore_errors=True)
    ecrire(reseaux, neuf)
    shutil.rmtree(args.sortie, ignore_errors=True)
    neuf.rename(args.sortie)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
