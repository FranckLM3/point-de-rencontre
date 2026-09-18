import dataclasses
import json
import struct
import tempfile
import unittest
from pathlib import Path

from horaires.gtfs import Gare, charger
from horaires.parcours import INJOIGNABLE, Trajet
from horaires.sortie import encoder_ligne, ecrire_tout, gares_desservies, gares_train, index_voisins
from horaires.tests.fabrique import archive, reseau_synthetique


class SortieTest(unittest.TestCase):
    def test_encoder_ligne(self):
        octets = encoder_ligne(
            [Trajet(0, 0.0, False, 0, INJOIGNABLE), Trajet(100, 157.4, True, 0, 3), Trajet(INJOIGNABLE, 0.0, False)]
        )
        self.assertEqual(len(octets), 21)
        self.assertEqual(struct.unpack_from("<HHBH", octets, 7), (100, 157, 1, 3))
        self.assertEqual(struct.unpack_from("<HHBH", octets, 14), (INJOIGNABLE, 0, 0, INJOIGNABLE))

    def test_drapeaux_grande_ligne_et_correspondances(self):
        octets = encoder_ligne([Trajet(100, 10.0, True, 2), Trajet(100, 10.0, False, 3), Trajet(100, 10.0, True, 40)])
        self.assertEqual([octets[k * 7 + 4] for k in range(3)], [0b101, 0b110, 0b11111])

    def test_precedente_encodee(self):
        octets = encoder_ligne([Trajet(60, 10.0, False, 0, 5)])
        self.assertEqual(struct.unpack_from("<H", octets, 5)[0], 5)

    def test_index_voisins(self):
        reseau = charger(archive())
        grille = {"lon0": 4.0, "lat0": 45.0, "pasLon": 1.0, "pasLat": 1.0, "nx": 3, "ny": 1, "dedans": [1, 1, 0]}
        octets = index_voisins(reseau.gares, grille, gares_desservies(reseau), gares_train(reseau))
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
            self.assertEqual(stations[0], {"nom": "Alpha", "lat": 45.0, "lon": 4.0, "desservie": True, "train": True})
            self.assertFalse(stations[3]["desservie"])
            self.assertEqual(len((Path(d) / "lignes" / "0.bin").read_bytes()), 7 * 4)
            version = json.loads((Path(d) / "version.json").read_text())
            self.assertEqual(version["jour"], "20261006")
    def test_ecriture_atomique_et_lignes_perimees_retirees(self):
        reseau = charger(archive())
        grille = {"lon0": 4.0, "lat0": 45.0, "pasLon": 1.0, "pasLat": 1.0, "nx": 1, "ny": 1, "dedans": [1]}
        with tempfile.TemporaryDirectory() as d:
            sortie = Path(d) / "tc"
            (sortie / "lignes").mkdir(parents=True)
            (sortie / "lignes" / "99.bin").write_bytes(b"vieux")
            ecrire_tout(reseau, grille, sortie, processus=2)
            self.assertEqual(sorted(p.name for p in (sortie / "lignes").iterdir()), ["0.bin", "1.bin", "2.bin", "3.bin"])
            self.assertEqual(sorted(p.name for p in Path(d).iterdir()), ["tc"])

    def test_echec_laisse_l_ancienne_sortie_intacte(self):
        reseau = charger(archive())
        with tempfile.TemporaryDirectory() as d:
            sortie = Path(d) / "tc"
            sortie.mkdir()
            (sortie / "version.json").write_text("ancien")
            with self.assertRaises(KeyError):
                ecrire_tout(reseau, {"nx": 1}, sortie, processus=1)
            self.assertEqual((sortie / "version.json").read_text(), "ancien")
            self.assertFalse((sortie / "stations.json").exists())
            self.assertEqual(sorted(p.name for p in Path(d).iterdir()), ["tc"])


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
        octets = index_voisins(reseau.gares, grille, gares_desservies(reseau), gares_train(reseau))
        self.assertEqual(_voisins(octets, 0), [0, 1, 2])
        # Au point de Gamma, Delta (300 m, sans train) n'est pas retenu.
        self.assertEqual(_voisins(octets, 1), [2, 1, 0])

    def test_gares_a_moins_de_500_m_comptent_pour_une(self):
        gares = [Gare(str(i), str(i), 45.0 + d, 4.0) for i, d in enumerate([0.0, 0.003, 0.01, 0.02])]
        grille = {"lon0": 4.0, "lat0": 45.0, "pasLon": 1.0, "pasLat": 1.0, "nx": 1, "ny": 1, "dedans": [1]}
        octets = index_voisins(gares, grille, [True] * 4, [True] * 4)
        self.assertEqual(_voisins(octets, 0), [0, 2, 3])

    def test_gare_routiere_et_vraie_gare_a_moins_de_500_m_gardees_toutes_les_deux(self):
        # Même fixture côté TS (garesProches, E7) : une gare de train et une gare routière à
        # 280 m l'une de l'autre, comme Lyon Part Dieu et Lyon-Part-Dieu Gare Routière. Même
        # règle que `tropPres` (src/calcul/tc.ts) : le statut (train/car) compte, pas la seule
        # distance, donc les deux sont gardées ; la plus proche du point (la gare de train) sort
        # en premier.
        gares = [Gare("g1", "Lyon Part Dieu", 45.0, 5.0), Gare("g2", "Lyon-Part-Dieu Gare Routière", 45.0025, 5.0)]
        train = [True, False]
        grille = {"lon0": 5.0, "lat0": 45.0, "pasLon": 1.0, "pasLat": 1.0, "nx": 1, "ny": 1, "dedans": [1]}
        octets = index_voisins(gares, grille, [True, True], train)
        self.assertEqual(_voisins(octets, 0), [0, 1, INJOIGNABLE])


class GaresTrainTest(unittest.TestCase):
    def test_gare_desservie_seulement_par_un_car_nest_pas_train(self):
        # 0 -> 1 en train ; 1 -> 2 en autocar seulement (car=True) : la gare 2 n'a pas de train.
        r = reseau_synthetique(3, [(0, 100, 0, 1, "T"), (200, 300, 1, 2, "C", True, True, True)])
        self.assertEqual(gares_train(r), [True, True, False])

    def test_gare_desservie_par_train_et_car_est_train(self):
        r = reseau_synthetique(3, [(0, 100, 0, 1, "T", True, True, True), (200, 300, 0, 1, "N")])
        self.assertEqual(gares_train(r), [True, True, False])

    def test_gare_sans_aucune_connexion_nest_pas_train(self):
        r = reseau_synthetique(2, [])
        self.assertEqual(gares_train(r), [False, False])


if __name__ == "__main__":
    unittest.main()
