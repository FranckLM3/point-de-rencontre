"""Contrôles sur le vrai GTFS SNCF, si HORAIRES_GTFS désigne l'archive."""
import os
import unittest
from pathlib import Path

from horaires.gtfs import charger
from horaires.parcours import meilleurs_trajets

ARCHIVE = os.environ.get("HORAIRES_GTFS", "")
GARE_DE_LYON = "StopArea:OCE87686006"


@unittest.skipUnless(ARCHIVE and Path(ARCHIVE).is_file(), "HORAIRES_GTFS non défini")
class ReelTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.reseau = charger(Path(ARCHIVE).read_bytes())
        numero = {g.identifiant: i for i, g in enumerate(cls.reseau.gares)}
        cls.numero = numero
        cls.depuis_gare_de_lyon = meilleurs_trajets(cls.reseau, numero[GARE_DE_LYON])

    def _vers(self, nom):
        j = next(i for i, g in enumerate(self.reseau.gares) if g.nom == nom)
        return self.depuis_gare_de_lyon[j]

    def test_gare_de_lyon_bordeaux(self):
        # Liaison urbaine vers Montparnasse (30 min) puis TGV direct (2 h 02 au mieux le 2026-11-03).
        self.assertTrue(150 <= self._vers("Bordeaux Saint-Jean").minutes <= 210)

    def test_gare_de_lyon_austerlitz(self):
        self.assertLessEqual(self._vers("Paris Austerlitz").minutes, 25)

    def test_gare_de_lyon_marseille(self):
        self.assertLessEqual(self._vers("Marseille Saint-Charles").minutes, 194)


if __name__ == "__main__":
    unittest.main()
