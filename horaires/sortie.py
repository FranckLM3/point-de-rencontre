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
