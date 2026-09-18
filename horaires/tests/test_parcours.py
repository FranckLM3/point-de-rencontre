import unittest

from horaires.gtfs import charger
from horaires.parcours import INJOIGNABLE, meilleurs_trajets
from horaires.tests.fabrique import archive, heure as H, reseau_synthetique


def _lien(n, *paires):
    """Liaisons symétriques entre n gares à partir de (a, b, secondes)."""
    liens = [[] for _ in range(n)]
    for a, b, s in paires:
        liens[a].append((b, s))
        liens[b].append((a, s))
    return liens


def _chaine(trajets, arrivee):
    """Remonte les gares précédentes de `arrivee` jusqu'à la source (INJOIGNABLE)."""
    chaine = [arrivee]
    while trajets[chaine[-1]].precedente != INJOIGNABLE:
        chaine.append(trajets[chaine[-1]].precedente)
    return chaine


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

    def test_gare_sans_train_jamais_atteinte(self):
        # Delta, à 300 m de Gamma, n'a aucun train : aucune liaison n'y mène.
        t = meilleurs_trajets(self.reseau, 1)
        self.assertEqual(t[3].minutes, INJOIGNABLE)

    def test_injoignable(self):
        t = meilleurs_trajets(self.reseau, 2)
        self.assertEqual(t[0].minutes, INJOIGNABLE)

    def test_source_a_zero(self):
        t = meilleurs_trajets(self.reseau, 0)
        self.assertEqual((t[0].minutes, t[0].km), (0, 0))
        self.assertEqual(t[0].precedente, INJOIGNABLE)


class PrecedenteTest(unittest.TestCase):
    def test_train_direct(self):
        r = reseau_synthetique(2, [(H(8), H(9), 0, 1, "T")])
        t = meilleurs_trajets(r, 0)
        self.assertEqual(_chaine(t, 1), [1, 0])

    def test_une_correspondance(self):
        trains = [(H(8), H(9), 0, 1, "A"), (H(9, 10), H(10), 1, 2, "B")]
        t = meilleurs_trajets(reseau_synthetique(3, trains), 0)
        self.assertEqual(_chaine(t, 2), [2, 1, 0])

    def test_liaison_a_pied_ou_urbaine_apres_un_train(self):
        # T amène en 1 ; une liaison (marche ou urbaine) mène ensuite en 2.
        liens = _lien(3, (1, 2, 900))
        trains = [(H(8), H(9), 0, 1, "T")]
        t = meilleurs_trajets(reseau_synthetique(3, trains, liaisons=liens), 0)
        self.assertEqual(_chaine(t, 2), [2, 1, 0])

    def test_injoignable(self):
        t = meilleurs_trajets(reseau_synthetique(2, []), 0)
        self.assertEqual(t[1].precedente, INJOIGNABLE)


if __name__ == "__main__":
    unittest.main()
