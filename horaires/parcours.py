"""Parcours de connexions : durée la plus courte de la gare source vers chaque gare.

Un parcours par heure de départ réelle depuis la source (train pris à la source,
ou à une gare voisine en comptant la marche et la marge) : la durée retenue est
le minimum, sur ces départs, de l'arrivée moins l'heure de départ de la source.
"""
from __future__ import annotations

from bisect import bisect_left
from dataclasses import dataclass

from horaires.gtfs import Reseau

INJOIGNABLE = 65535
CORRESPONDANCE_S = 300
DEBUT_FENETRE_S = 6 * 3600
FIN_FENETRE_S = 20 * 3600
VITESSE_MARCHE_KMH = 4.5
DETOUR_MARCHE = 1.3
JAMAIS = 1 << 40


@dataclass(frozen=True)
class Trajet:
    minutes: int
    km: float
    grande_ligne: bool


@dataclass(frozen=True)
class Index:
    """Connexions à plat et départs par gare, préparés une fois par réseau."""

    connexions: list[tuple]  # (départ, arrivée, de, vers, n° de trajet, km, grande ligne, montée, descente)
    departs: list[int]
    departs_par_gare: list[list[int]]
    liaisons: list[list[tuple[int, int, float]]]  # (voisine, secondes, km)


def _marche_s(km: float) -> int:
    return round(km * DETOUR_MARCHE / VITESSE_MARCHE_KMH * 3600 / 60) * 60


def preparer(reseau: Reseau) -> Index:
    numeros: dict[str, int] = {}
    connexions = [
        (c.depart, c.arrivee, c.de, c.vers, numeros.setdefault(c.trajet, len(numeros)), c.km, c.grande_ligne, c.montee, c.descente)
        for c in reseau.connexions
    ]
    departs_par_gare: list[set[int]] = [set() for _ in reseau.gares]
    for c in reseau.connexions:
        if c.montee:
            departs_par_gare[c.de].add(c.depart)
    liaisons = [[(j, _marche_s(km), km) for j, km in voisins] for voisins in reseau.a_pied]
    return Index(
        connexions=connexions,
        departs=[c[0] for c in connexions],
        departs_par_gare=[sorted(s) for s in departs_par_gare],
        liaisons=liaisons,
    )


def _departs_source(index: Index, source: int) -> list[int]:
    """Heures de départ réelles de la source, dans la fenêtre, marche et marge comprises."""
    heures = set(index.departs_par_gare[source])
    for voisine, secondes, _ in index.liaisons[source]:
        heures.update(d - secondes - CORRESPONDANCE_S for d in index.departs_par_gare[voisine])
    return sorted(h for h in heures if DEBUT_FENETRE_S <= h <= FIN_FENETRE_S)


def _un_depart(index: Index, source: int, depart: int, arrivee: list[int], info: list):
    """Arrivée au plus tôt (et km, grande ligne) pour un départ de la source à `depart`.

    `arrivee` arrive rempli de JAMAIS ; renvoie les gares atteintes, à remettre à JAMAIS.
    """
    atteintes = [source]
    arrivee[source] = depart
    info[source] = (0.0, False)
    for voisine, secondes, km in index.liaisons[source]:
        if depart + secondes < arrivee[voisine]:
            arrivee[voisine] = depart + secondes
            info[voisine] = (km, False)
            atteintes.append(voisine)
    en_cours: dict[int, tuple[float, bool]] = {}
    connexions = index.connexions
    for k in range(bisect_left(index.departs, depart), len(connexions)):
        dep, arr, de, vers, trajet, km, gl, montee, descente = connexions[k]
        pris = en_cours.get(trajet)
        if pris is None:
            if not montee:
                continue
            marge = 0 if de == source else CORRESPONDANCE_S
            if arrivee[de] + marge > dep:
                continue
            pris = info[de]
        pris = (pris[0] + km, pris[1] or gl)
        en_cours[trajet] = pris
        if descente and arr < arrivee[vers]:
            arrivee[vers] = arr
            info[vers] = pris
            atteintes.append(vers)
            for voisine, secondes, pas in index.liaisons[vers]:
                if arr + secondes < arrivee[voisine]:
                    arrivee[voisine] = arr + secondes
                    info[voisine] = (pris[0] + pas, pris[1])
                    atteintes.append(voisine)
    return atteintes


def meilleurs_trajets(reseau: Reseau, source: int, index: Index | None = None) -> list[Trajet]:
    index = index or preparer(reseau)
    n = len(reseau.gares)
    meilleurs = [Trajet(INJOIGNABLE, 0.0, False)] * n
    meilleurs[source] = Trajet(0, 0.0, False)
    duree_min = [JAMAIS] * n
    duree_min[source] = 0
    arrivee = [JAMAIS] * n
    info: list = [None] * n
    for depart in _departs_source(index, source):
        atteintes = _un_depart(index, source, depart, arrivee, info)
        for j in set(atteintes):
            duree = arrivee[j] - depart
            if duree < duree_min[j]:
                duree_min[j] = duree
                meilleurs[j] = Trajet(round(duree / 60), *info[j])
            arrivee[j] = JAMAIS
    return meilleurs
