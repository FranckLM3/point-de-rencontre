"""Écriture des fichiers statiques lus par le navigateur."""
from __future__ import annotations

import base64
import datetime
import json
import math
import shutil
import struct
import tempfile
from multiprocessing import Pool
from pathlib import Path

from horaires.geo import haversine_km
from horaires.gtfs import Gare, Reseau
from horaires.parcours import INJOIGNABLE, Index, Trajet, meilleurs_trajets, preparer

NB_VOISINS = 3
CORRESPONDANCES_MAX = 15  # bits 1 à 4 des drapeaux
KM_MAX = 65535
HECTOMETRES_MAX = 65535
CASES_PAR_DEGRE = 2
RAYON_MAX_CASES = 40
DISTANCE_GARES_DISTINCTES_KM = 0.5

_reseau: Reseau | None = None
_index: Index | None = None


def encoder_ligne(trajets: list[Trajet]) -> bytes:
    sortie = bytearray()
    for t in trajets:
        km = 0 if t.minutes == INJOIGNABLE else min(KM_MAX, round(t.km))
        drapeaux = (1 if t.grande_ligne else 0) | min(CORRESPONDANCES_MAX, t.correspondances) << 1
        sortie += struct.pack("<HHBH", t.minutes, km, drapeaux, t.precedente)
    return bytes(sortie)


def _dedans(grille: dict) -> list[int]:
    brut = grille["dedans"]
    return list(base64.b64decode(brut)) if isinstance(brut, str) else list(brut)


def gares_desservies(reseau: Reseau) -> list[bool]:
    """Vrai pour chaque gare de départ ou d'arrivée d'au moins une connexion du jour type."""
    desservies = [False] * len(reseau.gares)
    for c in reseau.connexions:
        desservies[c.de] = desservies[c.vers] = True
    return desservies


def gares_train(reseau: Reseau) -> list[bool]:
    """Vrai pour chaque gare desservie par au moins une connexion non-autocar (un vrai train)."""
    train = [False] * len(reseau.gares)
    for c in reseau.connexions:
        if c.car:
            continue
        train[c.de] = train[c.vers] = True
    return train


def _case(lat: float, lon: float) -> tuple[int, int]:
    return math.floor(lat * CASES_PAR_DEGRE), math.floor(lon * CASES_PAR_DEGRE)


def _choisir_distinctes(gares: list[Gare], tries: list[tuple[float, int]]) -> list[tuple[float, int]]:
    """Les plus proches d'abord, en sautant celles à moins de 500 m d'une gare déjà retenue."""
    retenues: list[tuple[float, int]] = []
    for d, i in tries:
        g = gares[i]
        if all(haversine_km(g.lat, g.lon, gares[j].lat, gares[j].lon) > DISTANCE_GARES_DISTINCTES_KM for _, j in retenues):
            retenues.append((d, i))
            if len(retenues) == NB_VOISINS:
                break
    return retenues


def _voisines(gares: list[Gare], cases: dict[tuple[int, int], list[int]], lat: float, lon: float):
    cy, cx = _case(lat, lon)
    retenues: list[tuple[float, int]] = []
    for rayon in range(1, RAYON_MAX_CASES + 1):
        candidats = (
            i for dy in range(-rayon, rayon + 1) for dx in range(-rayon, rayon + 1) for i in cases.get((cy + dy, cx + dx), [])
        )
        tries = sorted((haversine_km(lat, lon, gares[i].lat, gares[i].lon), i) for i in candidats)
        retenues = _choisir_distinctes(gares, tries)
        if len(retenues) == NB_VOISINS:
            break
    return retenues


def index_voisins(gares: list[Gare], grille: dict, desservies: list[bool]) -> bytes:
    """Pour chaque point de grille : 3 gares desservies et distinctes, les plus proches, en hectomètres."""
    dedans = _dedans(grille)
    cases: dict[tuple[int, int], list[int]] = {}
    for i, g in enumerate(gares):
        if desservies[i]:
            cases.setdefault(_case(g.lat, g.lon), []).append(i)
    vide = struct.pack("<HH", INJOIGNABLE, 0)
    sortie = bytearray()
    for k in range(grille["nx"] * grille["ny"]):
        if not dedans[k]:
            sortie += vide * NB_VOISINS
            continue
        lon = grille["lon0"] + (k % grille["nx"]) * grille["pasLon"]
        lat = grille["lat0"] + (k // grille["nx"]) * grille["pasLat"]
        retenues = _voisines(gares, cases, lat, lon)
        for d, i in retenues:
            sortie += struct.pack("<HH", i, min(HECTOMETRES_MAX, round(d * 10)))
        sortie += vide * (NB_VOISINS - len(retenues))
    return bytes(sortie)


def _initialiser(reseau: Reseau) -> None:
    global _reseau, _index
    _reseau = reseau
    _index = preparer(reseau)


def _ligne(source: int) -> tuple[int, bytes]:
    assert _reseau is not None
    return source, encoder_ligne(meilleurs_trajets(_reseau, source, _index))


def _ecrire_lignes(reseau: Reseau, dossier: Path, processus: int) -> None:
    sources = range(len(reseau.gares))
    if processus == 1:
        _initialiser(reseau)
        for source, octets in map(_ligne, sources):
            (dossier / f"{source}.bin").write_bytes(octets)
        return
    with Pool(processus, initializer=_initialiser, initargs=(reseau,)) as pool:
        for source, octets in pool.imap_unordered(_ligne, sources, chunksize=16):
            (dossier / f"{source}.bin").write_bytes(octets)


def _remplacer(neuf: Path, dossier: Path) -> None:
    """Met `neuf` à la place de `dossier` par renommages ; l'ancien contenu disparaît en entier."""
    ancien = dossier.with_name(f".{dossier.name}.ancien")
    shutil.rmtree(ancien, ignore_errors=True)
    if dossier.exists():
        dossier.rename(ancien)
    neuf.rename(dossier)
    shutil.rmtree(ancien, ignore_errors=True)


def ecrire_tout(reseau: Reseau, grille: dict, dossier: Path, processus: int) -> None:
    """Écrit tout dans un dossier temporaire voisin, puis le met à la place de `dossier`."""
    dossier.parent.mkdir(parents=True, exist_ok=True)
    neuf = Path(tempfile.mkdtemp(prefix=f".{dossier.name}.", dir=dossier.parent))
    try:
        (neuf / "lignes").mkdir()
        desservies = gares_desservies(reseau)
        train = gares_train(reseau)
        stations = [
            {"nom": g.nom, "lat": g.lat, "lon": g.lon, "desservie": d, "train": t}
            for g, d, t in zip(reseau.gares, desservies, train)
        ]
        (neuf / "stations.json").write_text(json.dumps(stations, ensure_ascii=False))
        (neuf / "voisins-4km.bin").write_bytes(index_voisins(reseau.gares, grille, desservies))
        _ecrire_lignes(reseau, neuf / "lignes", processus)
        version = {
            "feed_version": reseau.version,
            "jour": reseau.jour,
            "genere_le": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
            "nb_gares": len(reseau.gares),
        }
        (neuf / "version.json").write_text(json.dumps(version))
        neuf.chmod(0o755)
        _remplacer(neuf, dossier)
    except BaseException:
        shutil.rmtree(neuf, ignore_errors=True)
        raise
