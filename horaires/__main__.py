"""python3 -m horaires --sortie public/data/tc [--source fichier.zip]

python3 -m horaires --url affiche l'adresse du GTFS SNCF (source unique, lue par la CI).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

from horaires.gtfs import charger
from horaires.rails import ecrire_rails
from horaires.sortie import ecrire_tout

URL_SNCF = "https://eu.ftp.opendatasoft.com/sncf/plandata/Export_OpenData_SNCF_GTFS_NewTripId.zip"
URL_RAILS = "https://ressources.data.sncf.com/api/explore/v2.1/catalog/datasets/formes-des-lignes-du-rfn/exports/geojson"
GRILLE = Path("public/data/grille-4km.json")


def _charger_source(valeur: str, timeout: int = 180) -> bytes:
    """`valeur` : URL (téléchargée) ou chemin local (lu tel quel)."""
    if valeur.startswith(("http://", "https://")):
        return urllib.request.urlopen(valeur, timeout=timeout).read()
    return Path(valeur).read_bytes()


def main() -> int:
    p = argparse.ArgumentParser(description="Calcule les trajets en train entre toutes les gares.")
    p.add_argument("--url", action="store_true", help="affiche l'adresse du GTFS SNCF et s'arrête")
    p.add_argument("--sortie", type=Path)
    p.add_argument("--source", type=Path, help="archive GTFS locale (sinon téléchargée)")
    p.add_argument("--rails", default=URL_RAILS, help="GeoJSON des voies ferrées (fichier local ou URL, SNCF par défaut)")
    p.add_argument("--processus", type=int, default=os.cpu_count() or 1)
    args = p.parse_args()
    if args.url:
        print(URL_SNCF)
        return 0
    if args.sortie is None:
        p.error("--sortie est requis")

    debut = time.monotonic()
    contenu = args.source.read_bytes() if args.source else urllib.request.urlopen(URL_SNCF, timeout=120).read()
    reseau = charger(contenu)
    print(f"horaires {reseau.version}, jour {reseau.jour} : {len(reseau.gares)} gares, {len(reseau.connexions)} connexions")
    for motif, nombre in sorted(reseau.anomalies.items()):
        print(f"  ligne sautée ({motif}) : {nombre}")
    if not reseau.anomalies:
        print("  aucune ligne sautée")
    grille = json.loads(GRILLE.read_text())
    ecrire_tout(reseau, grille, args.sortie, args.processus)
    print(f"écrit dans {args.sortie} en {time.monotonic() - debut:.0f} s")

    debut_rails = time.monotonic()
    donnees_rails = _charger_source(args.rails)
    nb_traces, nb_paires = ecrire_rails(reseau, donnees_rails, args.sortie / "rails.bin")
    pourcentage = f"{nb_traces / nb_paires * 100:.1f} %" if nb_paires else "0 %"
    print(f"rails : {nb_traces}/{nb_paires} paires de gares avec un tracé ({pourcentage}) en {time.monotonic() - debut_rails:.0f} s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
