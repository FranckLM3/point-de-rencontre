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
