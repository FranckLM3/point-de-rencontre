import dataclasses
import json
import struct
import tempfile
import unittest
from pathlib import Path

from horaires.gtfs import Gare, charger
from horaires.parcours import INJOIGNABLE, Trajet
from horaires.sortie import encoder_ligne, ecrire_tout, gares_desservies, index_voisins
from horaires.tests.fabrique import archive


class SortieTest(unittest.TestCase):
    def test_encoder_ligne(self):
        octets = encoder_ligne([Trajet(0, 0.0, False), Trajet(100, 157.4, True), Trajet(INJOIGNABLE, 0.0, False)])
        self.assertEqual(len(octets), 15)
        self.assertEqual(struct.unpack_from("<HHB", octets, 5), (100, 157, 1))
        self.assertEqual(struct.unpack_from("<HHB", octets, 10), (INJOIGNABLE, 0, 0))

    def test_drapeaux_grande_ligne_et_correspondances(self):
        octets = encoder_ligne([Trajet(100, 10.0, True, 2), Trajet(100, 10.0, False, 3), Trajet(100, 10.0, True, 40)])
        self.assertEqual([octets[k * 5 + 4] for k in range(3)], [0b101, 0b110, 0b11111])

    def test_index_voisins(self):
        reseau = charger(archive())
        grille = {"lon0": 4.0, "lat0": 45.0, "pasLon": 1.0, "pasLat": 1.0, "nx": 3, "ny": 1, "dedans": [1, 1, 0]}
        octets = index_voisins(reseau.gares, grille, gares_desservies(reseau))
        self.assertEqual(len(octets), 3 * 12)
        gare, hm = struct.unpack_from("<HH", octets, 0)
        self.assertEqual((gare, hm), (0, 0))
        self.assertEqual(struct.unpack_from("<H", octets, 24)[0], INJOIGNABLE)

    def test_ecrire_tout(self):
        reseau = charger(archive())
        grille = {"lon0": 4.0, "lat0": 45.0, "pasLon": 1.0, "pasLat": 1.0, "nx": 3, "ny": 1, "dedans": [1, 1, 1]}
        with tempfile.TemporaryDirectory() as d:
            ecrire_tout(reseau, grille, Path(d), processus=1)
            stations = json.loads((Path(d) / "stations.json").read_text())
            self.assertEqual(stations[0], {"nom": "Alpha", "lat": 45.0, "lon": 4.0, "desservie": True})
            self.assertFalse(stations[3]["desservie"])
            self.assertEqual(len((Path(d) / "lignes" / "0.bin").read_bytes()), 5 * 4)
            version = json.loads((Path(d) / "version.json").read_text())
            self.assertEqual(version["jour"], "20261006")


def _voisins(octets: bytes, k: int) -> list[int]:
    return [struct.unpack_from("<H", octets, k * 12 + 4 * n)[0] for n in range(3)]


def _avec_epsilon(reseau):
    """Ajoute Epsilon, zone d'arrêt sans train à 100 m d'Alpha."""
    gares = reseau.gares + [Gare("StopArea:OCE5", "Epsilon", 45.0009, 4.0)]
    return dataclasses.replace(reseau, gares=gares, liaisons=reseau.liaisons + [[]])


class VoisinsTest(unittest.TestCase):
    def test_gares_desservies(self):
        reseau = _avec_epsilon(charger(archive()))
        self.assertEqual(gares_desservies(reseau), [True, True, True, False, False])

    def test_gare_non_desservie_jamais_voisine(self):
        reseau = _avec_epsilon(charger(archive()))
        grille = {"lon0": 4.0, "lat0": 45.0009, "pasLon": 2.0, "pasLat": 1.0, "nx": 2, "ny": 1, "dedans": [1, 1]}
        octets = index_voisins(reseau.gares, grille, gares_desservies(reseau))
        self.assertEqual(_voisins(octets, 0), [0, 1, 2])
        # Au point de Gamma, Delta (300 m, sans train) n'est pas retenu.
        self.assertEqual(_voisins(octets, 1), [2, 1, 0])

    def test_gares_a_moins_de_500_m_comptent_pour_une(self):
        gares = [Gare(str(i), str(i), 45.0 + d, 4.0) for i, d in enumerate([0.0, 0.003, 0.01, 0.02])]
        grille = {"lon0": 4.0, "lat0": 45.0, "pasLon": 1.0, "pasLat": 1.0, "nx": 1, "ny": 1, "dedans": [1]}
        octets = index_voisins(gares, grille, [True] * 4)
        self.assertEqual(_voisins(octets, 0), [0, 2, 3])


if __name__ == "__main__":
    unittest.main()
