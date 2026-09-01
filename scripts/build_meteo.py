#!/usr/bin/env python3
"""Construit les séries météo hebdomadaires du jeu depuis l'open data Météo-France.

Source : « Données climatologiques de base — quotidiennes » (meteo.data.gouv.fr,
licence ouverte Etalab), fichiers départementaux :
  https://meteofrance.s3.sbg.io.cloud.ovh.net/data/synchro_ftp/BASE/QUOT/Q_<dep>_previous-1950-2024_RR-T-Vent.csv.gz

Usage : python3 scripts/build_meteo.py <dossier_contenant_les_csv.gz>
Écrit data/meteo/<station-du-jeu>.json : 60 ans × 52 semaines de
[tMoy, tMin, tMax, pluie_mm], trous comblés par la climatologie de la semaine.
"""

import csv
import gzip
import json
import statistics
import sys
from datetime import date
from pathlib import Path

# station du jeu -> (fichier département, NOM_USUEL Météo-France)
STATIONS = {
    "lande-seche": ("Q_40_previous-1950-2024_RR-T-Vent.csv.gz", "MONT-DE-MARSAN"),
    "vallee-engorgee": ("Q_37_previous-1950-2024_RR-T-Vent.csv.gz", "TOURS"),
    "limon-riche": ("Q_80_previous-1950-2024_RR-T-Vent.csv.gz", "ABBEVILLE"),
    "friche-limon": ("Q_21_previous-1950-2024_RR-T-Vent.csv.gz", "DIJON-LONGVIC"),
}
YEAR_START, YEAR_END = 1964, 2023  # 60 ans, incluant 1976, 2003 et 2022

def week_of_year(d: date) -> int:
    """Semaine 0-51 ; les jours 365/366 sont rattachés à la semaine 51."""
    return min(51, (d.timetuple().tm_yday - 1) // 7)

def build(src_dir: Path, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    for game_id, (filename, nom) in STATIONS.items():
        # cumuls par (année, semaine)
        acc = {}  # (y, w) -> dict(rr=[], tn=[], tx=[], tm=[])
        meta = {}
        with gzip.open(src_dir / filename, "rt", encoding="utf-8") as f:
            for row in csv.DictReader(f, delimiter=";"):
                if row["NOM_USUEL"] != nom:
                    continue
                d = date(int(row["AAAAMMJJ"][:4]), int(row["AAAAMMJJ"][4:6]), int(row["AAAAMMJJ"][6:8]))
                if not (YEAR_START <= d.year <= YEAR_END):
                    continue
                meta = {"lat": float(row["LAT"]), "alti": float(row["ALTI"]), "poste": row["NUM_POSTE"]}
                slot = acc.setdefault((d.year, week_of_year(d)), {"rr": [], "tn": [], "tx": [], "tm": []})
                if row["RR"]:
                    slot["rr"].append(float(row["RR"]))
                tn = float(row["TN"]) if row["TN"] else None
                tx = float(row["TX"]) if row["TX"] else None
                tm = float(row["TM"]) if row["TM"] else (
                    (tn + tx) / 2 if tn is not None and tx is not None else None
                )
                if tn is not None:
                    slot["tn"].append(tn)
                if tx is not None:
                    slot["tx"].append(tx)
                if tm is not None:
                    slot["tm"].append(tm)

        # première passe : moyennes hebdo quand les données existent
        # (+ tMinAbs = LA nuit la plus froide de la semaine : les gels tardifs
        # sont des événements ponctuels, invisibles dans une moyenne)
        weekly = {}
        for (y, w), s in acc.items():
            if len(s["tm"]) >= 4 and len(s["rr"]) >= 4:
                # pluie hebdo = cumul, ajusté si jours manquants
                rr = sum(s["rr"]) * 7 / len(s["rr"])
                tn_mean = statistics.mean(s["tn"]) if s["tn"] else statistics.mean(s["tm"]) - 4
                weekly[(y, w)] = (
                    statistics.mean(s["tm"]),
                    tn_mean,
                    statistics.mean(s["tx"]) if s["tx"] else statistics.mean(s["tm"]) + 4,
                    rr,
                    min(s["tn"]) if s["tn"] else tn_mean - 3,
                )

        # climatologie par semaine (pour combler les trous)
        climato = {}
        for w in range(52):
            vals = [weekly[(y, w)] for y in range(YEAR_START, YEAR_END + 1) if (y, w) in weekly]
            if not vals:
                raise SystemExit(f"{game_id}: aucune donnée pour la semaine {w}")
            climato[w] = tuple(statistics.mean(v[i] for v in vals) for i in range(5))

        semaines = []
        filled = 0
        for y in range(YEAR_START, YEAR_END + 1):
            for w in range(52):
                v = weekly.get((y, w))
                if v is None:
                    v = climato[w]
                    filled += 1
                semaines.append(
                    [round(v[0], 2), round(v[1], 2), round(v[2], 2), round(v[3], 2), round(v[4], 2)]
                )

        out = {
            "id": game_id,
            "stationMeteo": nom,
            "poste": meta.get("poste", ""),
            "lat": meta.get("lat", 0),
            "alti": meta.get("alti", 0),
            "periode": [YEAR_START, YEAR_END],
            "source": "Météo-France, données climatologiques de base quotidiennes (meteo.data.gouv.fr, licence ouverte Etalab)",
            "colonnes": ["tMoyC", "tMinC", "tMaxC", "pluieMm", "tMinAbsC"],
            "semaines": semaines,
        }
        path = out_dir / f"{game_id}.json"
        path.write_text(json.dumps(out, ensure_ascii=False))
        rains = [sum(semaines[i][3] for i in range(y * 52, (y + 1) * 52)) for y in range(YEAR_END - YEAR_START + 1)]
        print(
            f"{game_id}: {nom} ({meta.get('poste')}), {len(semaines)} semaines, "
            f"{filled} comblées par climatologie, pluie annuelle {min(rains):.0f}-{max(rains):.0f} mm "
            f"(moy {statistics.mean(rains):.0f})"
        )

if __name__ == "__main__":
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
    build(src, Path(__file__).parent.parent / "data" / "meteo")
