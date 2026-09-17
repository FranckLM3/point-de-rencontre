import unittest

from horaires.gtfs import charger
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

    def test_passages_a_pied_symetriques_sous_500_m(self):
        self.assertIn((3, 0.3), [(v, round(km, 1)) for v, km in self.reseau.a_pied[2]])
        self.assertIn((2, 0.3), [(v, round(km, 1)) for v, km in self.reseau.a_pied[3]])
        self.assertEqual(self.reseau.a_pied[0], [])


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
