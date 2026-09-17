"""python3 -m horaires --sortie public/data/tc [--source fichier.zip]"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

from horaires.gtfs import charger
from horaires.sortie import ecrire_tout

URL_SNCF = "https://eu.ftp.opendatasoft.com/sncf/plandata/Export_OpenData_SNCF_GTFS_NewTripId.zip"
GRILLE = Path("public/data/grille-4km.json")


def main() -> int:
    p = argparse.ArgumentParser(description="Calcule les trajets en train entre toutes les gares.")
    p.add_argument("--sortie", type=Path, required=True)
    p.add_argument("--source", type=Path, help="archive GTFS locale (sinon téléchargée)")
    p.add_argument("--processus", type=int, default=os.cpu_count() or 1)
    args = p.parse_args()

    debut = time.monotonic()
    contenu = args.source.read_bytes() if args.source else urllib.request.urlopen(URL_SNCF, timeout=120).read()
    reseau = charger(contenu)
    print(f"horaires {reseau.version}, jour {reseau.jour} : {len(reseau.gares)} gares, {len(reseau.connexions)} connexions")
    grille = json.loads(GRILLE.read_text())
    ecrire_tout(reseau, grille, args.sortie, args.processus)
    print(f"écrit dans {args.sortie} en {time.monotonic() - debut:.0f} s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
