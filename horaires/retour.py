"""Dernier retour : heure du dernier départ de chaque gare qui ramène à la source avant minuit.

Le calcul est le parcours de connexions habituel, mais sur le réseau *miroir* : le temps y est
retourné (`RENTRER_AVANT_S - t`), les connexions changent de sens, et montée et descente
s'échangent. L'arrivée au plus tôt dans ce réseau depuis la gare de la personne correspond donc au
départ le plus tard, dans le vrai monde, depuis la gare visée.
"""
from __future__ import annotations

from horaires.gtfs import Connexion, Reseau
from horaires.parcours import JAMAIS, Index, _Etiquettes, _un_depart, INJOIGNABLE

RENTRER_AVANT_S = 24 * 3600
PAS_MINUTES = 10
AUCUN_RETOUR = 255


def miroir(reseau: Reseau) -> Reseau:
    """Même réseau, temps retourné : une connexion de A vers B devient une connexion de B vers A."""
    connexions = sorted(
        (
            Connexion(
                depart=RENTRER_AVANT_S - c.arrivee,
                arrivee=RENTRER_AVANT_S - c.depart,
                de=c.vers,
                vers=c.de,
                trajet=c.trajet,
                km=c.km,
                grande_ligne=c.grande_ligne,
                montee=c.descente,
                descente=c.montee,
                car=c.car,
            )
            for c in reseau.connexions
            if c.arrivee <= RENTRER_AVANT_S
        ),
        key=lambda c: (c.depart, c.arrivee),
    )
    return Reseau(reseau.version, reseau.jour, reseau.gares, connexions, reseau.liaisons)


def etiquettes_vides(n: int) -> _Etiquettes:
    return _Etiquettes([JAMAIS] * n, [JAMAIS] * n, [None] * n, [None] * n, [INJOIGNABLE] * n, [INJOIGNABLE] * n)


def derniers_departs(index: Index, source: int, e: _Etiquettes, n: int) -> list[int]:
    """Par gare, l'heure du dernier départ qui ramène à `source`, en pas de 10 min ; 255 si aucun."""
    resultat = [AUCUN_RETOUR] * n
    for j in set(_un_depart(index, source, 0, e)):
        arrivee = min(e.par_train[j], e.libre[j])
        if arrivee < JAMAIS:
            resultat[j] = min(AUCUN_RETOUR - 1, (RENTRER_AVANT_S - arrivee) // 60 // PAS_MINUTES)
        e.par_train[j] = e.libre[j] = JAMAIS
    return resultat
