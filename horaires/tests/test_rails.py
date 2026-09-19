"""Réseau ferré synthétique : deux lignes qui se rejoignent à une jonction (sommet partagé),
une troisième reliée par un écart de moins de 50 m (pas de sommet partagé), et une gare trop
loin de toute voie (aucun rattachement)."""
import json
import struct
import unittest

from horaires.gtfs import Connexion, Gare, Reseau
from horaires.rails import (
    E5,
    MAGIC,
    charger,
    construire_traces,
    encoder_traces,
    paires_train,
    simplifier,
)

# Ligne A : parfaitement rectiligne (même latitude), de près de la gare X jusqu'à la jonction J.
LIGNE_A = {
    "type": "Feature",
    "properties": {"code_ligne": "A"},
    "geometry": {
        "type": "LineString",
        "coordinates": [[2.000, 45.000], [2.003, 45.000], [2.007, 45.000], [2.010, 45.000]],
    },
}
# Ligne B : premier point = dernier de A (jonction, sommet partagé), avec un vrai coude
# (déviation d'environ 167 m, au-delà de la tolérance de 100 m : le point du milieu doit rester).
LIGNE_B = {
    "type": "Feature",
    "properties": {"code_ligne": "B"},
    "geometry": {"type": "LineString", "coordinates": [[2.010, 45.000], [2.015, 45.0015], [2.020, 45.000]]},
}
# Ligne C : démarre à environ 28 m de la fin de B (pas de sommet partagé : teste le raccord
# d'extrémités à moins de 50 m), jusque près de la gare Y.
LIGNE_C = {
    "type": "Feature",
    "properties": {"code_ligne": "C"},
    "geometry": {"type": "LineString", "coordinates": [[2.020, 45.00025], [2.030, 45.00025]]},
}
# Ligne D : isolée, à des dizaines de km, sans aucune arête vers A/B/C.
LIGNE_D = {
    "type": "Feature",
    "properties": {"code_ligne": "D"},
    "geometry": {"type": "LineString", "coordinates": [[3.500, 46.000], [3.510, 46.000]]},
}
POINT_IGNORE = {"type": "Feature", "properties": {}, "geometry": {"type": "Point", "coordinates": [0, 0]}}

FEATURES = [LIGNE_A, LIGNE_B, LIGNE_C, LIGNE_D, POINT_IGNORE]

GARE_X = Gare("X", "Gare X", 45.0001, 2.0002)  # à ~15 m du début de la ligne A
GARE_Y = Gare("Y", "Gare Y", 45.00028, 2.0298)  # à ~20 m de la fin de la ligne C
GARE_FAR = Gare("F", "Gare lointaine", 46.5, 4.5)  # à des dizaines de km de toute voie
GARE_Z = Gare("Z", "Gare Z", 46.0001, 3.5001)  # près de la ligne D, isolée du reste
GARES = [GARE_X, GARE_Y, GARE_FAR, GARE_Z]


def connexion(de: int, vers: int, car: bool = False) -> Connexion:
    return Connexion(depart=8 * 3600, arrivee=8 * 3600 + 600, de=de, vers=vers, trajet=f"t{de}{vers}", km=1.0, grande_ligne=False, car=car)


class ChargerTest(unittest.TestCase):
    def test_ne_garde_que_les_linestring(self):
        donnees = json.dumps({"type": "FeatureCollection", "features": FEATURES}).encode()
        features = charger(donnees)
        self.assertEqual(len(features), 4)
        self.assertTrue(all(f["geometry"]["type"] == "LineString" for f in features))


class PairesTrainTest(unittest.TestCase):
    def test_exclut_les_autocars(self):
        reseau = Reseau("v", "j", GARES, [connexion(0, 1), connexion(1, 2, car=True)])
        self.assertEqual(paires_train(reseau), {(0, 1)})

    def test_ordonne_chaque_paire(self):
        reseau = Reseau("v", "j", GARES, [connexion(1, 0)])
        self.assertEqual(paires_train(reseau), {(0, 1)})


class ConstruireTracesTest(unittest.TestCase):
    def test_relie_par_la_jonction_et_le_raccord_sous_50m(self):
        reseau = Reseau("v", "j", GARES, [connexion(0, 1)])
        traces = construire_traces(reseau, FEATURES)
        self.assertEqual(len(traces), 1)
        t = traces[0]
        self.assertEqual((t.de, t.vers), (0, 1))
        # Le coude de la ligne B doit survivre à la simplification, les points alignés de A non :
        # au moins 3 points (départ, coude, arrivée), nettement moins que les 9 sommets bruts.
        self.assertGreaterEqual(len(t.points), 3)
        self.assertLess(len(t.points), 9)
        # Le chemin part près de la gare X et arrive près de la gare Y.
        self.assertAlmostEqual(t.points[0][0], GARE_X.lat, delta=0.01)
        self.assertAlmostEqual(t.points[-1][0], GARE_Y.lat, delta=0.01)

    def test_gare_trop_loin_de_toute_voie_aucun_trace(self):
        reseau = Reseau("v", "j", GARES, [connexion(1, 2)])
        traces = construire_traces(reseau, FEATURES)
        self.assertEqual(traces, [])

    def test_reseau_isole_aucun_chemin(self):
        # Z est proche de la ligne D (rattaché), mais D n'a aucune arête vers A/B/C : pas de chemin.
        reseau = Reseau("v", "j", GARES, [connexion(0, 3)])
        traces = construire_traces(reseau, FEATURES)
        self.assertEqual(traces, [])

    def test_paire_deja_dans_le_bon_ordre_conservee(self):
        reseau = Reseau("v", "j", GARES, [connexion(1, 0)])
        traces = construire_traces(reseau, FEATURES)
        self.assertEqual((traces[0].de, traces[0].vers), (0, 1))


class SimplifierTest(unittest.TestCase):
    def test_supprime_les_points_parfaitement_alignes(self):
        points = [(45.0, 2.000), (45.0, 2.003), (45.0, 2.007), (45.0, 2.010)]
        self.assertEqual(simplifier(points), [points[0], points[-1]])

    def test_garde_un_point_qui_devie_au_dela_de_la_tolerance(self):
        points = [(45.0, 2.010), (45.0015, 2.015), (45.0, 2.020)]  # déviation ~167 m
        self.assertEqual(simplifier(points), points)

    def test_supprime_un_point_qui_devie_sous_la_tolerance(self):
        points = [(45.0, 2.010), (45.0002, 2.015), (45.0, 2.020)]  # déviation ~22 m
        self.assertEqual(simplifier(points), [points[0], points[-1]])

    def test_deux_points_ou_moins_inchange(self):
        self.assertEqual(simplifier([(45.0, 2.0)]), [(45.0, 2.0)])
        self.assertEqual(simplifier([]), [])


class EncoderTracesTest(unittest.TestCase):
    def test_format_binaire(self):
        reseau = Reseau("v", "j", GARES, [connexion(0, 1)])
        traces = construire_traces(reseau, FEATURES)
        octets = encoder_traces(traces)
        self.assertEqual(octets[:4], MAGIC)
        (nb,) = struct.unpack_from("<I", octets, 4)
        self.assertEqual(nb, 1)
        de, vers, n = struct.unpack_from("<HHH", octets, 8)
        self.assertEqual((de, vers), (0, 1))
        self.assertEqual(n, len(traces[0].points))
        # Premier point : absolu, proche de la gare X en longitude (1e-5°).
        lon0, lat0 = struct.unpack_from("<ii", octets, 14)
        self.assertAlmostEqual(lon0 / E5, traces[0].points[0][1], places=2)
        self.assertAlmostEqual(lat0 / E5, traces[0].points[0][0], places=2)
        taille_attendue = 4 + 4 + (6 + 8 + (n - 1) * 8)
        self.assertEqual(len(octets), taille_attendue)

    def test_aucune_trace_fichier_minimal(self):
        octets = encoder_traces([])
        self.assertEqual(octets, MAGIC + struct.pack("<I", 0))


if __name__ == "__main__":
    unittest.main()
