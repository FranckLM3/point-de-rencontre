"""Tracés réels des voies ferrées entre gares.

Construit un graphe non orienté à partir du fichier de formes des lignes du Réseau Ferré
National (SNCF Réseau, GeoJSON de LineString), attache chaque gare au nœud du graphe le
plus proche (à 1,5 km près), puis calcule par Dijkstra le plus court chemin le long des
voies pour chaque paire de gares reliée par au moins un train du jour type (hors autocar).
Chaque chemin est simplifié (Douglas-Peucker) puis encodé en binaire compact
(`public/data/tc/rails.bin`), lu paresseusement par le navigateur (src/donnees/rails.ts).
"""
from __future__ import annotations

import heapq
import json
import math
import struct
from dataclasses import dataclass, field

from horaires.geo import haversine_km
from horaires.gtfs import Gare, Reseau

# ~5 m en degrés (basé sur la latitude ; légèrement plus strict en longitude aux latitudes
# françaises, sans conséquence pratique) : deux points de lignes différentes tombant dans la
# même case sont fondus en un seul nœud du graphe (jonction).
SNAP_DEG = 5.0 / 111_320
# Cases de recherche de plus proche voisin (~111 m) : pour le rattachement des gares et le
# raccord des extrémités de ligne proches sans être confondues par l'arrondi ci-dessus.
CASE_DEG = 0.001
RACCORD_EXTREMITE_M = 50.0
GARE_MAX_KM = 1.5
BORNE_FACTEUR = 3.0
BORNE_MARGE_KM = 20.0
SIMPLIFICATION_M = 100.0

MAGIC = b"RAB1"
E5 = 100_000  # quantification : 1e-5 degré (environ 1,1 m)

Clef = tuple[int, int]


def _snap(lat: float, lon: float) -> Clef:
    return (round(lat / SNAP_DEG), round(lon / SNAP_DEG))


def _case(lat: float, lon: float) -> tuple[int, int]:
    return (math.floor(lat / CASE_DEG), math.floor(lon / CASE_DEG))


@dataclass
class Graphe:
    """Graphe non orienté des voies : nœuds = coordonnées fondues, arêtes en mètres."""

    coord: dict[Clef, tuple[float, float]] = field(default_factory=dict)
    voisins: dict[Clef, dict[Clef, float]] = field(default_factory=dict)
    cases: dict[tuple[int, int], list[Clef]] = field(default_factory=dict)

    def ajouter_noeud(self, lat: float, lon: float) -> Clef:
        k = _snap(lat, lon)
        if k not in self.coord:
            self.coord[k] = (lat, lon)
            self.cases.setdefault(_case(lat, lon), []).append(k)
        return k

    def relier(self, k1: Clef, k2: Clef) -> None:
        if k1 == k2:
            return
        lat1, lon1 = self.coord[k1]
        lat2, lon2 = self.coord[k2]
        poids = haversine_km(lat1, lon1, lat2, lon2) * 1000
        if poids <= 0:
            return
        d1 = self.voisins.setdefault(k1, {})
        if k2 not in d1 or poids < d1[k2]:
            d1[k2] = poids
            self.voisins.setdefault(k2, {})[k1] = poids

    def plus_proche(self, lat: float, lon: float, sauf: Clef | None, rayon_m: float) -> tuple[Clef, float] | None:
        """Nœud le plus proche (hors `sauf`) à moins de `rayon_m`, par balayage des cases voisines."""
        cy, cx = _case(lat, lon)
        rayon_cases = max(1, math.ceil(rayon_m / (CASE_DEG * 111_320)) + 1)
        meilleur: tuple[Clef, float] | None = None
        for dy in range(-rayon_cases, rayon_cases + 1):
            for dx in range(-rayon_cases, rayon_cases + 1):
                for k in self.cases.get((cy + dy, cx + dx), []):
                    if k == sauf:
                        continue
                    klat, klon = self.coord[k]
                    d = haversine_km(lat, lon, klat, klon) * 1000
                    if d <= rayon_m and (meilleur is None or d < meilleur[1]):
                        meilleur = (k, d)
        return meilleur


def charger(donnees: bytes) -> list[dict]:
    """Features `LineString` d'un GeoJSON de formes de lignes ; ignore le reste sans échouer."""
    brut = json.loads(donnees)
    return [f for f in brut.get("features", []) if (f.get("geometry") or {}).get("type") == "LineString"]


def construire_graphe(features: list[dict]) -> Graphe:
    g = Graphe()
    bouts: list[tuple[Clef, float, float]] = []
    for f in features:
        geometrie = f.get("geometry") or {}
        if geometrie.get("type") != "LineString":
            continue
        points = geometrie["coordinates"]
        if len(points) < 2:
            continue
        cles = [g.ajouter_noeud(lat, lon) for lon, lat in points]
        for k1, k2 in zip(cles, cles[1:]):
            g.relier(k1, k2)
        (lon0, lat0), (lon1, lat1) = points[0], points[-1]
        bouts.append((cles[0], lat0, lon0))
        bouts.append((cles[-1], lat1, lon1))
    # Après coup (pas pendant l'ajout) : une extrémité ne doit pas se raccorder à un nœud de
    # sa propre ligne posé juste après elle dans la boucle ci-dessus.
    for k, lat, lon in bouts:
        proche = g.plus_proche(lat, lon, k, RACCORD_EXTREMITE_M)
        if proche:
            g.relier(k, proche[0])
    return g


def attacher_gares(g: Graphe, gares: list[Gare]) -> list[Clef | None]:
    """Nœud du graphe le plus proche de chaque gare, à 1,5 km près ; None au-delà."""
    return [
        (proche[0] if (proche := g.plus_proche(gare.lat, gare.lon, None, GARE_MAX_KM * 1000)) else None) for gare in gares
    ]


def _dijkstra(g: Graphe, depart: Clef, arrivee: Clef, borne_m: float) -> list[tuple[float, float]] | None:
    """Plus court chemin en mètres, borné à `borne_m` ; None si hors borne ou inatteignable."""
    if depart == arrivee:
        return [g.coord[depart]]
    dist: dict[Clef, float] = {depart: 0.0}
    precedent: dict[Clef, Clef] = {}
    tas: list[tuple[float, Clef]] = [(0.0, depart)]
    while tas:
        d, k = heapq.heappop(tas)
        if d > dist.get(k, math.inf):
            continue
        if k == arrivee:
            chemin = [k]
            while chemin[-1] != depart:
                chemin.append(precedent[chemin[-1]])
            chemin.reverse()
            return [g.coord[c] for c in chemin]
        for voisin, poids in g.voisins.get(k, {}).items():
            nd = d + poids
            if nd <= borne_m and nd < dist.get(voisin, math.inf):
                dist[voisin] = nd
                precedent[voisin] = k
                heapq.heappush(tas, (nd, voisin))
    return None


def _vers_metres(lat: float, lon: float, lat0: float) -> tuple[float, float]:
    """Projection plane locale (équirectangulaire autour de `lat0`), assez précise sur la
    distance d'un chemin ferroviaire pour une simplification Douglas-Peucker."""
    return lon * 111_320 * math.cos(math.radians(lat0)), lat * 111_320


def simplifier(points: list[tuple[float, float]], tolerance_m: float = SIMPLIFICATION_M) -> list[tuple[float, float]]:
    """Douglas-Peucker : garde les points à plus de `tolerance_m` de la corde locale."""
    if len(points) <= 2:
        return points
    lat0 = sum(p[0] for p in points) / len(points)
    plan = [_vers_metres(lat, lon, lat0) for lat, lon in points]
    garder = [False] * len(points)
    garder[0] = garder[-1] = True

    def _rdp(debut: int, fin: int) -> None:
        if fin <= debut + 1:
            return
        (x1, y1), (x2, y2) = plan[debut], plan[fin]
        dx, dy = x2 - x1, y2 - y1
        norme = math.hypot(dx, dy)
        plus_loin, indice = -1.0, -1
        for i in range(debut + 1, fin):
            x, y = plan[i]
            d = math.hypot(x - x1, y - y1) if norme == 0 else abs(dy * x - dx * y + x2 * y1 - y2 * x1) / norme
            if d > plus_loin:
                plus_loin, indice = d, i
        if plus_loin > tolerance_m:
            garder[indice] = True
            _rdp(debut, indice)
            _rdp(indice, fin)

    _rdp(0, len(points) - 1)
    return [p for p, k in zip(points, garder) if k]


@dataclass(frozen=True)
class Trace:
    de: int
    vers: int
    points: list[tuple[float, float]]  # (lat, lon), dans l'ordre de `de` vers `vers`


def paires_train(reseau: Reseau) -> set[tuple[int, int]]:
    """Paires de gares non ordonnées reliées par au moins une connexion non-autocar."""
    return {
        (c.de, c.vers) if c.de < c.vers else (c.vers, c.de)
        for c in reseau.connexions
        if not c.car and c.de != c.vers
    }


def construire_traces(reseau: Reseau, features: list[dict]) -> list[Trace]:
    graphe = construire_graphe(features)
    noeuds = attacher_gares(graphe, reseau.gares)
    traces: list[Trace] = []
    for a, b in sorted(paires_train(reseau)):
        na, nb = noeuds[a], noeuds[b]
        if na is None or nb is None:
            continue
        ga, gb = reseau.gares[a], reseau.gares[b]
        droite_km = haversine_km(ga.lat, ga.lon, gb.lat, gb.lon)
        borne_m = (BORNE_FACTEUR * droite_km + BORNE_MARGE_KM) * 1000
        chemin = _dijkstra(graphe, na, nb, borne_m)
        if chemin is None:
            continue
        traces.append(Trace(a, b, simplifier(chemin)))
    return traces


def encoder_traces(traces: list[Trace]) -> bytes:
    """MAGIC, nb de traces, puis par trace : (de, vers, n) uint16, premier point en int32
    (1e-5°), points suivants en delta int32 depuis le précédent (lon, lat)."""
    sortie = bytearray(MAGIC)
    sortie += struct.pack("<I", len(traces))
    for t in traces:
        sortie += struct.pack("<HHH", t.de, t.vers, len(t.points))
        plon = plat = None
        for lat, lon in t.points:
            clon, clat = round(lon * E5), round(lat * E5)
            if plon is None:
                sortie += struct.pack("<ii", clon, clat)
            else:
                sortie += struct.pack("<ii", clon - plon, clat - plat)
            plon, plat = clon, clat
    return bytes(sortie)


def ecrire_rails(reseau: Reseau, donnees: bytes, chemin) -> tuple[int, int]:
    """Écrit `chemin` (rails.bin) ; renvoie (paires avec tracé, paires de gares reliées par un train)."""
    features = charger(donnees)
    traces = construire_traces(reseau, features)
    chemin.parent.mkdir(parents=True, exist_ok=True)
    tmp = chemin.with_suffix(".tmp")
    tmp.write_bytes(encoder_traces(traces))
    tmp.replace(chemin)
    return len(traces), len(paires_train(reseau))
