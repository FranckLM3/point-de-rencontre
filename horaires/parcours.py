"""Parcours de connexions : durée la plus courte de la gare source vers chaque gare.

Un parcours par heure de départ réelle depuis la source (train pris à la source,
ou à une gare atteinte par liaisons, temps de liaison compris) : la durée retenue
est le minimum, sur ces départs, de l'arrivée moins l'heure de départ de la source.

Deux étiquettes par gare : arrivée par un train (5 min de marge avant un autre
train) et arrivée libre (source ou liaison, dont le temps compte déjà la marge).
Après chaque arrivée en train, les liaisons s'enchaînent jusqu'à une heure.
"""
from __future__ import annotations

import heapq
from bisect import bisect_left
from dataclasses import dataclass

from horaires.gtfs import Reseau

INJOIGNABLE = 65535
CORRESPONDANCE_S = 300
DEBUT_FENETRE_S = 6 * 3600
FIN_FENETRE_S = 20 * 3600
LIAISONS_MAX_S = 3600
JAMAIS = 1 << 40
AUCUN_TRAIN = (0.0, False, 0)  # km, grande ligne, nombre de trains


@dataclass(frozen=True)
class Trajet:
    minutes: int
    km: float
    grande_ligne: bool
    correspondances: int = 0


@dataclass(frozen=True)
class Index:
    """Connexions à plat, départs par gare et liaisons enchaînées, préparés une fois par réseau."""

    connexions: list[tuple]  # (départ, arrivée, de, vers, n° de trajet, km, grande ligne, montée, descente)
    departs: list[int]
    departs_par_gare: list[list[int]]
    fermeture: list[list[tuple[int, int]]]  # (gare, secondes) par la plus courte chaîne de liaisons


def _fermeture(liaisons: list[list[tuple[int, int]]], depart: int) -> list[tuple[int, int]]:
    """Dijkstra borné à LIAISONS_MAX_S sur le graphe des liaisons."""
    meilleur = {depart: 0}
    tas = [(0, depart)]
    while tas:
        t, g = heapq.heappop(tas)
        if t > meilleur[g]:
            continue
        for v, s in liaisons[g]:
            u = t + s
            if u <= LIAISONS_MAX_S and u < meilleur.get(v, JAMAIS):
                meilleur[v] = u
                heapq.heappush(tas, (u, v))
    del meilleur[depart]
    return sorted(meilleur.items())


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
    return Index(
        connexions=connexions,
        departs=[c[0] for c in connexions],
        departs_par_gare=[sorted(s) for s in departs_par_gare],
        fermeture=[_fermeture(reseau.liaisons, g) for g in range(len(reseau.gares))],
    )


def _departs_source(index: Index, source: int) -> list[int]:
    """Heures de départ réelles de la source, dans la fenêtre, temps de liaison compris."""
    heures = set(index.departs_par_gare[source])
    for voisine, secondes in index.fermeture[source]:
        heures.update(d - secondes for d in index.departs_par_gare[voisine])
    return sorted(h for h in heures if DEBUT_FENETRE_S <= h <= FIN_FENETRE_S)


def _quitte_l_origine_a_temps(info: tuple, dep: int, liaison_s: int) -> bool:
    """Sans train encore pris, le premier train doit partir dans la fenêtre (liaison depuis la source comprise).

    Sinon un départ en journée permettrait d'attendre à quai un train du soir.
    """
    return info[2] > 0 or dep - liaison_s <= FIN_FENETRE_S


@dataclass
class _Etiquettes:
    par_train: list[int]
    libre: list[int]
    info_train: list
    info_libre: list


def _un_depart(index: Index, source: int, depart: int, e: _Etiquettes) -> list[int]:
    """Arrivées au plus tôt pour un départ de la source à `depart`.

    Les étiquettes arrivent à JAMAIS ; renvoie les gares touchées, à remettre à JAMAIS.
    """
    par_train, libre, info_train, info_libre = e.par_train, e.libre, e.info_train, e.info_libre
    touchees = [source]
    libre[source] = depart
    info_libre[source] = AUCUN_TRAIN
    for voisine, secondes in index.fermeture[source]:
        libre[voisine] = depart + secondes
        info_libre[voisine] = AUCUN_TRAIN
        touchees.append(voisine)
    en_cours: dict[int, tuple[float, bool, int]] = {}
    fermeture = index.fermeture
    connexions = index.connexions
    for k in range(bisect_left(index.departs, depart), len(connexions)):
        dep, arr, de, vers, trajet, km, gl, montee, descente = connexions[k]
        pris = en_cours.get(trajet)
        if pris is None:
            if not montee:
                continue
            if libre[de] <= dep and _quitte_l_origine_a_temps(info_libre[de], dep, libre[de] - depart):
                avant = info_libre[de]
                if par_train[de] + CORRESPONDANCE_S <= dep and info_train[de][2] < avant[2]:
                    avant = info_train[de]
            elif par_train[de] + CORRESPONDANCE_S <= dep:
                avant = info_train[de]
            else:
                continue
            pris = (avant[0], avant[1], avant[2] + 1)
        elif montee and pris[2] > 1:
            # Déjà à bord : remonter ici avec moins de trains, à durée égale, compte moins de correspondances.
            n = pris[2] - 1
            if libre[de] <= dep and info_libre[de][2] < n and _quitte_l_origine_a_temps(info_libre[de], dep, libre[de] - depart):
                n = info_libre[de][2]
                pris = (info_libre[de][0], info_libre[de][1], n + 1)
            if par_train[de] + CORRESPONDANCE_S <= dep and info_train[de][2] < n:
                pris = (info_train[de][0], info_train[de][1], info_train[de][2] + 1)
        pris = (pris[0] + km, pris[1] or gl, pris[2])
        en_cours[trajet] = pris
        if descente and (arr < par_train[vers] or (arr == par_train[vers] and pris[2] < info_train[vers][2])):
            par_train[vers] = arr
            info_train[vers] = pris
            touchees.append(vers)
            for voisine, secondes in fermeture[vers]:
                u = arr + secondes
                if u < libre[voisine] or (u == libre[voisine] and pris[2] < info_libre[voisine][2]):
                    libre[voisine] = u
                    info_libre[voisine] = pris
                    touchees.append(voisine)
    return touchees


def meilleurs_trajets(reseau: Reseau, source: int, index: Index | None = None) -> list[Trajet]:
    index = index or preparer(reseau)
    n = len(reseau.gares)
    meilleurs = [Trajet(INJOIGNABLE, 0.0, False)] * n
    meilleurs[source] = Trajet(0, 0.0, False)
    duree_min = [JAMAIS] * n
    duree_min[source] = 0
    for voisine, secondes in index.fermeture[source]:
        duree_min[voisine] = secondes
        meilleurs[voisine] = Trajet(round(secondes / 60), 0.0, False)
    e = _Etiquettes([JAMAIS] * n, [JAMAIS] * n, [None] * n, [None] * n)
    for depart in _departs_source(index, source):
        for j in set(_un_depart(index, source, depart, e)):
            par_train, libre = e.par_train[j], e.libre[j]
            if par_train < libre or (par_train == libre and e.info_train[j][2] <= e.info_libre[j][2]):
                arrivee, (km, gl, trains) = par_train, e.info_train[j]
            else:
                arrivee, (km, gl, trains) = libre, e.info_libre[j]
            duree = arrivee - depart
            correspondances = max(0, trains - 1)
            if duree < duree_min[j] or (duree == duree_min[j] and correspondances < meilleurs[j].correspondances):
                duree_min[j] = duree
                meilleurs[j] = Trajet(round(duree / 60), km, gl, correspondances)
            e.par_train[j] = e.libre[j] = JAMAIS
    return meilleurs
