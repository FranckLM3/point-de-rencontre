import unittest

from horaires.gtfs import charger
from horaires.parcours import INJOIGNABLE, meilleurs_trajets
from horaires.tests.fabrique import archive


class ParcoursTest(unittest.TestCase):
    def setUp(self):
        self.reseau = charger(archive())

    def test_direct(self):
        t = meilleurs_trajets(self.reseau, 0)
        self.assertEqual(t[1].minutes, 60)
        self.assertTrue(t[1].grande_ligne)

    def test_correspondance_manquee_puis_suivante(self):
        # T3 part de Beta à 08:50, avant l'arrivée de T1 : on prend T2 (09:10 -> 09:40).
        t = meilleurs_trajets(self.reseau, 0)
        self.assertEqual(t[2].minutes, 100)
        self.assertAlmostEqual(t[2].km, 157.4, delta=1)
        self.assertTrue(t[2].grande_ligne)

    def test_duree_comptee_depuis_le_premier_train(self):
        # Depuis Beta, T3 (08:50 -> 09:20) donne 30 min, quelle que soit l'heure de la fenêtre.
        t = meilleurs_trajets(self.reseau, 1)
        self.assertEqual(t[2].minutes, 30)
        self.assertFalse(t[2].grande_ligne)

    def test_passage_a_pied_apres_arrivee(self):
        # Delta n'a aucun train : on y arrive à pied depuis Gamma (300 m, 5 min).
        t = meilleurs_trajets(self.reseau, 1)
        self.assertEqual(t[3].minutes, 35)
        self.assertAlmostEqual(t[3].km, t[2].km + 0.3, delta=0.05)

    def test_injoignable(self):
        t = meilleurs_trajets(self.reseau, 2)
        self.assertEqual(t[0].minutes, INJOIGNABLE)

    def test_source_a_zero(self):
        t = meilleurs_trajets(self.reseau, 0)
        self.assertEqual((t[0].minutes, t[0].km), (0, 0))


if __name__ == "__main__":
    unittest.main()
