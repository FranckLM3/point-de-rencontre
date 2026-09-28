import unittest

from horaires.parcours import preparer
from horaires.retour import AUCUN_RETOUR, PAS_MINUTES, derniers_departs, etiquettes_vides, miroir
from horaires.tests.fabrique import heure, reseau_synthetique


def _retours(reseau, source):
    index = preparer(miroir(reseau))
    return derniers_departs(index, source, etiquettes_vides(len(reseau.gares)), len(reseau.gares))


class RetourTest(unittest.TestCase):
    def test_dernier_depart_qui_permet_de_rentrer(self):
        # Aller 0 -> 1 le matin ; retours 1 -> 0 à 18 h (arrivée 19 h) et à 22 h 40 (arrivée 23 h 40).
        reseau = reseau_synthetique(2, [
            (heure(8), heure(9), 0, 1, "aller"),
            (heure(18), heure(19), 1, 0, "retour1"),
            (heure(22, 40), heure(23, 40), 1, 0, "retour2"),
        ])
        r = _retours(reseau, 0)
        self.assertEqual(r[1], heure(22, 40) // 60 // PAS_MINUTES)
        self.assertEqual(r[0], 24 * 60 // PAS_MINUTES)  # chez soi : rien à prendre

    def test_retour_trop_tardif_ignore(self):
        # Le seul retour arrive à 00 h 30 : impossible de rentrer avant minuit.
        reseau = reseau_synthetique(2, [
            (heure(8), heure(9), 0, 1, "aller"),
            (heure(23, 30), heure(24) + 1800, 1, 0, "retour"),
        ])
        self.assertEqual(_retours(reseau, 0)[1], AUCUN_RETOUR)

    def test_correspondance_du_retour(self):
        # 2 -> 1 à 19 h (arrivée 19 h 30), puis 1 -> 0 à 20 h (arrivée 21 h) : dernier départ de 2 à 19 h.
        reseau = reseau_synthetique(3, [
            (heure(19), heure(19, 30), 2, 1, "r1"),
            (heure(20), heure(21), 1, 0, "r2"),
            (heure(21), heure(21, 30), 2, 1, "r3"),
        ])
        r = _retours(reseau, 0)
        self.assertEqual(r[2], heure(19) // 60 // PAS_MINUTES)
        self.assertEqual(r[1], heure(20) // 60 // PAS_MINUTES)

    def test_retour_qui_obligerait_a_partir_la_veille_ignore(self):
        # Le seul train 1 -> 0 est un train de nuit qui part à 00 h 02 ; la gare 2 est à une heure
        # de marche de la gare 1, il faudrait donc en partir la veille : aucun retour depuis 2.
        reseau = reseau_synthetique(
            3,
            [(heure(0, 2), heure(6), 1, 0, "nuit")],
            liaisons=[[], [(2, 3600)], [(1, 3600)]],
        )
        r = _retours(reseau, 0)
        self.assertEqual(r[1], heure(0, 2) // 60 // PAS_MINUTES)
        self.assertEqual(r[2], AUCUN_RETOUR)

    def test_aucun_retour_depuis_une_gare_sans_train_du_soir(self):
        reseau = reseau_synthetique(2, [(heure(8), heure(9), 0, 1, "aller")])
        self.assertEqual(_retours(reseau, 0)[1], AUCUN_RETOUR)


if __name__ == "__main__":
    unittest.main()
