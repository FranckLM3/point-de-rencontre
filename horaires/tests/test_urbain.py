import io
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

import struct

from horaires.urbain import INJOIGNABLE, SANS_PRECEDENTE, charger, depart_unique, ecrire, matrice

# Ligne 1 (métro) : A -> B -> C, départs de A à 8 h 00, 8 h 20, 8 h 40 et 9 h 00 (5 min entre stations).
# Ligne 2 (tram) : C -> E à 8 h 11 (1 min après l'arrivée : correspondance manquée) et 8 h 30.
# Ligne 3 (métro) : D -> E à 8 h 15 (arrivée 8 h 50). D est à 500 m au nord de C.
# F est desservi seulement par un bus et une ligne TER,
# tous deux ignorés. Les quais de A sont regroupés sous leur zone d'arrêt.
STOPS = """stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station
ZA,Alpha,48.0000,2.0000,1,
QA1,Alpha quai 1,48.0000,2.0001,0,ZA
QA2,Alpha quai 2,48.0000,2.0002,0,ZA
B,Beta,48.0000,2.0200,0,
C,Gamma,48.0000,2.0400,0,
D,Delta,48.0045,2.0400,0,
E,Epsilon,48.0000,2.0800,0,
F,Phi,48.1000,2.1000,0,
"""
ROUTES = """route_id,agency_id,route_short_name,route_long_name,route_type
M1,1,1,Ligne 1,1
M3,1,3,Ligne 3,1
T2,1,T2,Tram 2,0
BUS,1,42,Bus 42,3
TER,1,TER,TER,2
"""
TRIPS = """route_id,service_id,trip_id
M1,S,M1a
M1,S,M1b
M1,S,M1c
M1,S,M1d
M3,S,M3a
T2,S,T2a
T2,S,T2b
BUS,S,BUSa
TER,S,TERa
M1,AUTRE,M1z
"""


def _ligne1(course: str, h: int, m: int) -> str:
    lignes = []
    for i, arret in enumerate(("QA1", "B", "C")):
        t = f"{h:02d}:{m + 5 * i:02d}:00"
        lignes.append(f"{course},{t},{t},{arret},{i}")
    return "\n".join(lignes)


STOP_TIMES = "\n".join(
    [
        "trip_id,arrival_time,departure_time,stop_id,stop_sequence",
        _ligne1("M1a", 8, 0),
        _ligne1("M1b", 8, 20),
        _ligne1("M1c", 8, 40),
        _ligne1("M1d", 9, 0),
        "M3a,08:15:00,08:15:00,D,0",
        "M3a,08:50:00,08:50:00,E,1",
        "T2a,08:11:00,08:11:00,C,0",
        "T2a,08:21:00,08:21:00,E,1",
        "T2b,08:30:00,08:30:00,C,0",
        "T2b,08:40:00,08:40:00,E,1",
        "BUSa,08:00:00,08:00:00,QA2,0",
        "BUSa,08:03:00,08:03:00,F,1",
        "TERa,08:00:00,08:00:00,QA2,0",
        "TERa,08:02:00,08:02:00,F,1",
        # Heure absente (arrêt interpolé) : ignorée, la course reste continue.
        "M1z,08:00:00,08:00:00,QA1,0",
        "M1z,,,B,1",
        "M1z,08:10:00,08:10:00,C,2",
    ]
) + "\n"
# 2026-10-06 est un mardi ; AUTRE ne circule qu'un mercredi.
CALENDAR = """service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date
S,1,1,1,1,1,0,0,20260928,20261031
"""
CALENDAR_DATES = """service_id,date,exception_type
AUTRE,20261007,1
"""


def archive() -> bytes:
    tampon = io.BytesIO()
    with zipfile.ZipFile(tampon, "w") as z:
        for nom, contenu in (
            ("stops", STOPS), ("routes", ROUTES), ("trips", TRIPS), ("stop_times", STOP_TIMES),
            ("calendar", CALENDAR), ("calendar_dates", CALENDAR_DATES),
        ):
            z.writestr(f"{nom}.txt", "﻿" + contenu)
    return tampon.getvalue()


class LectureTest(unittest.TestCase):
    def setUp(self):
        self.r = charger(archive())
        self.noms = [s.nom for s in self.r.stations]

    def test_modes_lourds_seulement_et_quais_regroupes(self):
        self.assertEqual(sorted(self.noms), ["Alpha", "Beta", "Delta", "Epsilon", "Gamma"])
        self.assertNotIn("Phi", self.noms)  # desservie seulement par un bus et un TER

    def test_jour_type_mardi_et_courses_du_jour(self):
        self.assertEqual(self.r.jour, "20261006")
        self.assertEqual(len({c[4] for c in self.r.connexions}), 7)  # M1a..M1d, M3a, T2a, T2b

    def test_stations_voisines_reliees_a_pied(self):
        d = self.noms.index("Delta")
        c = self.noms.index("Gamma")
        voisins = dict(self.r.marche[c])
        self.assertIn(d, voisins)
        self.assertAlmostEqual(voisins[d] / 60, 0.5 * 1.3 / 4.5 * 60, delta=0.5)


class ParcoursTest(unittest.TestCase):
    def setUp(self):
        self.r = charger(archive())
        self.i = {s.nom: k for k, s in enumerate(self.r.stations)}

    def test_un_depart_correspondance_de_2_min_et_marche(self):
        t, _ = depart_unique(self.r, self.i["Alpha"], 8 * 3600)
        self.assertEqual(t[self.i["Gamma"]], 8 * 3600 + 10 * 60)
        # Le tram de 8 h 11 part 1 min après l'arrivée : on prend celui de 8 h 30.
        self.assertEqual(t[self.i["Epsilon"]], 8 * 3600 + 40 * 60)
        self.assertAlmostEqual(t[self.i["Delta"]] - t[self.i["Gamma"]], 0.5 * 1.3 / 4.5 * 3600, delta=30)

    def test_station_precedente_arret_par_arret_marche_comprise(self):
        _, p = depart_unique(self.r, self.i["Alpha"], 8 * 3600)
        self.assertEqual(p[self.i["Alpha"]], SANS_PRECEDENTE)
        self.assertEqual(p[self.i["Beta"]], self.i["Alpha"])
        self.assertEqual(p[self.i["Gamma"]], self.i["Beta"])
        self.assertEqual(p[self.i["Epsilon"]], self.i["Gamma"])
        self.assertEqual(p[self.i["Delta"]], self.i["Gamma"])  # à pied

    def test_matrice_moyenne_des_trois_departs_attente_comprise(self):
        m = matrice(self.r)
        n = len(self.r.stations)
        self.assertEqual(len(m), n * n)
        # Depuis Beta à 8 h 00 : attente jusqu'à 8 h 05, arrivée à Gamma à 8 h 10, soit 10 min, idem à 8 h 20 et 8 h 40.
        self.assertEqual(m[self.i["Beta"] * n + self.i["Gamma"]], 10)
        self.assertEqual(m[self.i["Alpha"] * n + self.i["Alpha"]], 0)
        # Gamma vers Alpha : aucune course dans ce sens.
        self.assertEqual(m[self.i["Gamma"] * n + self.i["Alpha"]], INJOIGNABLE)


class EcritureTest(unittest.TestCase):
    def test_fichiers_publies(self):
        r = charger(archive())
        with tempfile.TemporaryDirectory() as d:
            ecrire({"test": ("Test", r)}, Path(d))
            index = json.loads((Path(d) / "reseaux.json").read_text())
            (reseau,) = index["reseaux"]
            self.assertEqual((reseau["id"], reseau["nom"], reseau["jour"]), ("test", "Test", "20261006"))
            self.assertEqual(len(reseau["stations"]), 5)
            nom, lat, lon = reseau["stations"][0]
            self.assertIsInstance(nom, str)
            self.assertEqual((Path(d) / "test.bin").stat().st_size, 25)
            alpha = [s[0] for s in reseau["stations"]].index("Alpha")
            precedentes = struct.unpack("<5H", (Path(d) / "test" / f"{alpha}.bin").read_bytes())
            self.assertEqual(precedentes[alpha], SANS_PRECEDENTE)


if __name__ == "__main__":
    unittest.main()
