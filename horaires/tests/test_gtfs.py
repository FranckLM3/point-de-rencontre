import unittest

from horaires.gtfs import Gare, charger, liaisons_entre_gares
from horaires.tests.fabrique import STOP_TIMES, archive


class LectureTest(unittest.TestCase):
    def setUp(self):
        self.reseau = charger(archive())

    def test_jour_type_est_un_mardi_apres_la_premiere_semaine(self):
        self.assertEqual(self.reseau.jour, "20261006")
        self.assertEqual(self.reseau.version, "2026-09-28")

    def test_gares_triees_par_identifiant(self):
        self.assertEqual([g.nom for g in self.reseau.gares], ["Alpha", "Beta", "Gamma", "Delta"])

    def test_connexions_du_jour_seulement_et_triees(self):
        trajets = {c.trajet for c in self.reseau.connexions}
        self.assertEqual(trajets, {"T1", "T2", "T3"})
        departs = [c.depart for c in self.reseau.connexions]
        self.assertEqual(departs, sorted(departs))

    def test_connexion_porte_gares_km_et_grande_ligne(self):
        t1 = next(c for c in self.reseau.connexions if c.trajet == "T1")
        self.assertEqual((t1.de, t1.vers), (0, 1))
        self.assertAlmostEqual(t1.km, 78.7, delta=0.5)
        self.assertTrue(t1.grande_ligne)
        t2 = next(c for c in self.reseau.connexions if c.trajet == "T2")
        self.assertFalse(t2.grande_ligne)

    def test_aucune_liaison_vers_une_gare_sans_train(self):
        # Delta est à 300 m de Gamma mais sans train ; les autres gares sont à 78 km.
        self.assertEqual(self.reseau.liaisons, [[], [], [], []])


class LiaisonsTest(unittest.TestCase):
    def test_marche_jusqu_a_1_km_puis_liaison_urbaine_jusqu_a_6_km(self):
        # 0,9 km, 1,5 km, 5,9 km et 6,5 km au nord de la gare 0 (un degré de latitude = 111,2 km).
        km = [0.0, 0.9, 1.5, 5.9, 6.5]
        gares = [Gare(str(i), str(i), 45.0 + d / 111.195, 4.0) for i, d in enumerate(km)]
        liens = dict(liaisons_entre_gares(gares, [True] * 5)[0])
        # Marche : 0,9 x 1,3 / 4,5 h = 15,6 min -> 16 min.
        self.assertEqual(liens[1], 16 * 60)
        # Urbain : 15 min + 1,5 x 1,3 / 20 h = 20,85 min -> 21 min.
        self.assertEqual(liens[2], 21 * 60)
        self.assertEqual(liens[3], 38 * 60)
        self.assertNotIn(4, liens)
        self.assertEqual(sorted(liens), [1, 2, 3])

    def test_symetriques_et_seulement_entre_gares_desservies(self):
        gares = [Gare(str(i), str(i), 45.0 + i * 0.005, 4.0) for i in range(3)]
        liens = liaisons_entre_gares(gares, [True, False, True])
        self.assertEqual([j for j, _ in liens[0]], [2])
        self.assertEqual([j for j, _ in liens[2]], [0])
        self.assertEqual(liens[1], [])


class MonteeDescenteTest(unittest.TestCase):
    def test_autorisees_par_defaut(self):
        t1 = next(c for c in charger(archive()).connexions if c.trajet == "T1")
        self.assertEqual((t1.montee, t1.descente), (True, True))

    def test_interdites_si_type_1_seulement(self):
        # T2 : montée interdite à Beta ; T3 : descente vide (autorisée) ; T1 : descente sur demande (3).
        horaires = (
            STOP_TIMES.replace("T2,09:10:00,09:10:00,StopPoint:OCETrain TER-2,0,,0,1,", "T2,09:10:00,09:10:00,StopPoint:OCETrain TER-2,0,,1,1,")
            .replace("T3,09:20:00,09:20:00,StopPoint:OCETrain TER-3,1,,1,0,", "T3,09:20:00,09:20:00,StopPoint:OCETrain TER-3,1,,,,")
            .replace("T1,09:00:00,09:00:00,StopPoint:OCETGV INOUI-2,1,,1,0,", "T1,09:00:00,09:00:00,StopPoint:OCETGV INOUI-2,1,,1,3,")
        )
        par_trajet = {c.trajet: c for c in charger(archive(stop_times=horaires)).connexions}
        self.assertEqual((par_trajet["T2"].montee, par_trajet["T2"].descente), (False, True))
        self.assertEqual((par_trajet["T3"].montee, par_trajet["T3"].descente), (True, True))
        self.assertEqual((par_trajet["T1"].montee, par_trajet["T1"].descente), (True, True))

    def test_descente_interdite_a_l_arrivee(self):
        horaires = STOP_TIMES.replace(
            "T2,09:40:00,09:40:00,StopPoint:OCETrain TER-3,1,,1,0,", "T2,09:40:00,09:40:00,StopPoint:OCETrain TER-3,1,,1,1,"
        )
        t2 = next(c for c in charger(archive(stop_times=horaires)).connexions if c.trajet == "T2")
        self.assertEqual((t2.montee, t2.descente), (True, False))


if __name__ == "__main__":
    unittest.main()
