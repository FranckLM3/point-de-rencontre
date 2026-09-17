import subprocess
import sys
import unittest

from horaires.__main__ import URL_SNCF


class LigneDeCommandeTest(unittest.TestCase):
    def test_url_affichee_pour_la_ci(self):
        sortie = subprocess.run([sys.executable, "-m", "horaires", "--url"], capture_output=True, text=True, check=True)
        self.assertEqual(sortie.stdout.strip(), URL_SNCF)

    def test_sortie_requise_sans_url(self):
        resultat = subprocess.run([sys.executable, "-m", "horaires"], capture_output=True, text=True)
        self.assertNotEqual(resultat.returncode, 0)
        self.assertIn("--sortie", resultat.stderr)


if __name__ == "__main__":
    unittest.main()
