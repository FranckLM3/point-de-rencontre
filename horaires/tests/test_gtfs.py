import unittest

from horaires.gtfs import Gare, charger, liaisons_entre_gares
from horaires.tests.fabrique import FEED_INFO, ROUTES, STOP_TIMES, STOPS, archive


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


class CarTest(unittest.TestCase):
    def test_train_normal_nest_pas_car(self):
        t1 = next(c for c in charger(archive()).connexions if c.trajet == "T1")
        self.assertFalse(t1.car)

    def test_stop_id_de_type_car_est_car(self):
        # T2 part d'un point de type « Car TER » plutôt que « Train TER ».
        stops = STOPS + "StopPoint:OCECar TER-2,Beta,,45.0000,5.0000,,,0,StopArea:OCE2\n"
        stop_times = STOP_TIMES.replace(
            "T2,09:10:00,09:10:00,StopPoint:OCETrain TER-2,0,,0,1,",
            "T2,09:10:00,09:10:00,StopPoint:OCECar TER-2,0,,0,1,",
        )
        t2 = next(c for c in charger(archive(stops=stops, stop_times=stop_times)).connexions if c.trajet == "T2")
        self.assertTrue(t2.car)

    def test_route_type_3_est_car(self):
        # R2 (Beta - Gamma, empruntée par T2 et T3) devient un service de bus (route_type 3).
        routes = ROUTES.replace("R2,1,,Beta - Gamma,,2,,,", "R2,1,,Beta - Gamma,,3,,,")
        connexions = charger(archive(routes=routes)).connexions
        self.assertTrue(next(c for c in connexions if c.trajet == "T2").car)
        self.assertFalse(next(c for c in connexions if c.trajet == "T1").car)


class LectureTolerante(unittest.TestCase):
    def test_lignes_malformees_sautees_et_comptees(self):
        arrets = (
            STOPS
            # location_type vide = point d'arrêt.
            + "StopPoint:OCETrain TER-9,Beta bis,,45.0000,5.0000,,,,StopArea:OCE2\n"
            + "StopPoint:OCETrain TER-7,Orphelin,,45.0,5.0,,,0,\n"
            + "StopPoint:OCETrain TER-8,Perdu,,45.0,5.0,,,0,StopArea:OCE99\n"
            + "StopArea:OCE6,Sans position,,,,,,1,\n"
        )
        horaires = STOP_TIMES + (
            "T2,09:50:00,09:50:00,StopPoint:OCEInconnu-1,2,,0,0,\n"
            "T2,,,StopPoint:OCETrain TER-3,3,,0,0,\n"
            "T3,09:30:00,09:30:00,StopPoint:OCETrain TER-9,2,,0,0,\n"
            "T3,09:40:00,09:40:00,StopPoint:OCETrain TER-7,3,,0,0,\n"
            "T3,09:45:00,09:45:00,StopPoint:OCETrain TER-2,x,,0,0,\n"
        )
        reseau = charger(archive(stops=arrets, stop_times=horaires))
        self.assertEqual([g.nom for g in reseau.gares], ["Alpha", "Beta", "Gamma", "Delta"])
        self.assertEqual(
            reseau.anomalies,
            {
                "zone sans position": 1,
                "point sans zone connue": 2,
                "passage vers un point inconnu": 2,
                "passage sans heure": 1,
                "passage sans rang": 1,
            },
        )
        # T3 continue vers Beta (point à location_type vide) : Gamma 09:20 -> Beta 09:30.
        t3 = [(c.de, c.vers) for c in reseau.connexions if c.trajet == "T3"]
        self.assertEqual(t3, [(1, 2), (2, 1)])

    def test_sans_feed_info_erreur_claire(self):
        with self.assertRaisesRegex(ValueError, "feed_info.txt"):
            charger(archive(feed_info=None))

    def test_dates_vides_erreur_claire(self):
        with self.assertRaisesRegex(ValueError, "feed_start_date"):
            charger(archive(feed_info=FEED_INFO.replace("20260928,20261031", ",")))

    def test_sans_anomalie(self):
        self.assertEqual(charger(archive()).anomalies, {})


if __name__ == "__main__":
    unittest.main()
