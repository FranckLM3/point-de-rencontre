import json
import struct
import tempfile
import unittest
from pathlib import Path

from horaires.gtfs import charger
from horaires.parcours import INJOIGNABLE, Trajet
from horaires.sortie import encoder_ligne, index_voisins, ecrire_tout
from horaires.tests.fabrique import archive


class SortieTest(unittest.TestCase):
    def test_encoder_ligne(self):
        octets = encoder_ligne([Trajet(0, 0.0, False), Trajet(100, 157.4, True), Trajet(INJOIGNABLE, 0.0, False)])
        self.assertEqual(len(octets), 15)
        self.assertEqual(struct.unpack_from("<HHB", octets, 5), (100, 157, 1))
        self.assertEqual(struct.unpack_from("<HHB", octets, 10), (INJOIGNABLE, 0, 0))

    def test_index_voisins(self):
        reseau = charger(archive())
        grille = {"lon0": 4.0, "lat0": 45.0, "pasLon": 1.0, "pasLat": 1.0, "nx": 3, "ny": 1, "dedans": [1, 1, 0]}
        octets = index_voisins(reseau.gares, grille)
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
            self.assertEqual(stations[0], {"nom": "Alpha", "lat": 45.0, "lon": 4.0})
            self.assertEqual(len((Path(d) / "lignes" / "0.bin").read_bytes()), 5 * 4)
            version = json.loads((Path(d) / "version.json").read_text())
            self.assertEqual(version["jour"], "20261006")


if __name__ == "__main__":
    unittest.main()
