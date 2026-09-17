import unittest

from horaires.parcours import meilleurs_trajets
from horaires.tests.fabrique import heure as H
from horaires.tests.fabrique import reseau_synthetique


class DureesExactesTest(unittest.TestCase):
    def test_train_rapide_parti_dans_le_meme_creneau(self):
        r = reseau_synthetique(2, [(H(8), H(10), 0, 1, "LENT"), (H(8, 15), H(10, 5), 0, 1, "RAPIDE")])
        self.assertEqual(meilleurs_trajets(r, 0)[1].minutes, 110)

    def test_meme_arrivee_depart_plus_tardif(self):
        r = reseau_synthetique(2, [(H(8), H(10), 0, 1, "LENT"), (H(8, 15), H(10), 0, 1, "RAPIDE")])
        self.assertEqual(meilleurs_trajets(r, 0)[1].minutes, 105)

    def test_monter_plus_tard_sur_le_meme_train(self):
        # F amène à 1 à 8 h 50 ; on attrape T à 9 h : 8 h 10 -> 10 h, soit 110 min.
        r = reseau_synthetique(
            3, [(H(8), H(9), 0, 1, "T"), (H(9), H(10), 1, 2, "T"), (H(8, 10), H(8, 50), 0, 1, "F")]
        )
        self.assertEqual(meilleurs_trajets(r, 0)[2].minutes, 110)

    def test_marche_depuis_la_source_comptee(self):
        # 500 m à pied (9 min) puis le train de 1 à 8 h : la durée part de la source.
        r = reseau_synthetique(3, [(H(8), H(9), 1, 2, "W")], a_pied=[[(1, 0.5)], [(0, 0.5)], []])
        self.assertEqual(meilleurs_trajets(r, 0)[2].minutes, 60 + 9 + 5)

    def test_depart_hors_fenetre_ignore(self):
        r = reseau_synthetique(2, [(H(20, 10), H(21), 0, 1, "N"), (H(5, 50), H(6, 30), 0, 1, "M")])
        self.assertEqual(meilleurs_trajets(r, 0)[1].minutes, 65535)

    def test_train_de_nuit(self):
        r = reseau_synthetique(2, [(H(20), H(25, 30), 0, 1, "N")])
        self.assertEqual(meilleurs_trajets(r, 0)[1].minutes, 330)


class MonteeDescenteTest(unittest.TestCase):
    def test_pas_de_montee_a_un_arret_interdit(self):
        # T : 0 -> 1 -> 2, montée interdite en 1.
        r = reseau_synthetique(3, [(H(8), H(9), 0, 1, "T"), (H(9), H(10), 1, 2, "T", False, True)])
        self.assertEqual(meilleurs_trajets(r, 1)[2].minutes, 65535)
        self.assertEqual(meilleurs_trajets(r, 0)[2].minutes, 120)

    def test_pas_d_arrivee_a_un_arret_interdit_mais_le_train_continue(self):
        # T : 0 -> 1 -> 2, descente interdite en 1 ; U part de 1 à 9 h 30.
        r = reseau_synthetique(
            4,
            [(H(8), H(9), 0, 1, "T", True, False), (H(9), H(10), 1, 2, "T"), (H(9, 30), H(10), 1, 3, "U")],
        )
        t = meilleurs_trajets(r, 0)
        self.assertEqual(t[1].minutes, 65535)
        self.assertEqual(t[2].minutes, 120)
        self.assertEqual(t[3].minutes, 65535)


if __name__ == "__main__":
    unittest.main()
