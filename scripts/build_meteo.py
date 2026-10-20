#!/usr/bin/env python3
"""Construit les séries météo hebdomadaires du jeu depuis l'open data Météo-France.

Source : « Données climatologiques de base — quotidiennes » (meteo.data.gouv.fr,
licence ouverte Etalab), fichiers départementaux :
  https://meteofrance.s3.sbg.io.cloud.ovh.net/data/synchro_ftp/BASE/QUOT/Q_<dep>_previous-1950-2024_RR-T-Vent.csv.gz

Usage :
  python3 scripts/build_meteo.py <dossier_contenant_les_csv.gz>
  python3 scripts/build_meteo.py <dossier_contenant_les_csv.gz> --ajouter-jours-de-pluie

Écrit data/meteo/<station-du-jeu>.json : 60 ans × 52 semaines de
[tMoy, tMin, tMax, pluie_mm, tMinAbs, jours_de_pluie], trous comblés par la
climatologie de la semaine.

**Les jours de pluie** (#405) sont les jours où il est tombé au moins 1 mm
(`RR >= 1`), le seuil des normales de Météo-France (« nombre moyen de jours
avec précipitations >= 1 mm ») et de l'indice R1mm de l'ETCCDI. Une semaine de
15 mm, ce peut être un orage et six jours secs ou une bruine quotidienne : le
cumul ne les distingue pas, ce compte si. Il est ramené à sept jours comme la
pluie l'est (la semaine 51 en compte huit ou neuf, et une semaine a parfois
des jours manquants) : c'est donc un réel, et jamais plus que le cumul en
millimètres, puisque chaque jour compté apporte au moins un millimètre.

**Pourquoi `--ajouter-jours-de-pluie`.** Reconstruite en entier depuis le
fichier republié le 2 octobre 2026, une série ne se refait plus à l'octet :
sept cumuls de semaine 51, sur quatre stations, bougent de 0,01 mm. Ce sont
des semaines de huit jours dont le cumul ramené à sept tombe pile sur un
demi-centième (58,2 × 7 / 8 = 50,925), et l'arrondi dépend alors de l'ordre
dans lequel la somme flottante a été faite ; aucun ordre simple (celui du
fichier, l'inverse, le tri) ne rend les sept à la fois. Chaque partie sur
série réelle en serait déplacée. L'option ajoute donc la sixième colonne aux
séries publiées sans toucher aux cinq autres, après avoir vérifié qu'elles
ne s'écartent nulle part de plus de 0,01 de ce que le fichier donne.
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
    # La seule station non tempérée du jeu (#212). Le Luc est au pied du massif
    # des Maures, en pleine plaine des Maures : c'est le pays du chêne-liège, et
    # le poste couvre 1950-2024 sans trou.
    "suberaie-maures": ("Q_83_previous-1950-2024_RR-T-Vent.csv.gz", "LE LUC"),
}
YEAR_START, YEAR_END = 1964, 2023  # 60 ans, incluant 1976, 2003 et 2022
COLONNES = ["tMoyC", "tMinC", "tMaxC", "pluieMm", "tMinAbsC", "joursPluie"]
# Seuil d'un jour de pluie, mm : celui des normales de Météo-France.
SEUIL_JOUR_DE_PLUIE_MM = 1.0

def week_of_year(d: date) -> int:
    """Semaine 0-51 ; les jours 365/366 sont rattachés à la semaine 51."""
    return min(51, (d.timetuple().tm_yday - 1) // 7)

def construire(src_dir: Path) -> dict:
    """Les séries de chaque station du jeu, sans rien écrire."""
    series = {}
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
        # (+ tMinAbs = **la** nuit la plus froide de la semaine : les gels tardifs
        # sont des événements ponctuels, invisibles dans une moyenne)
        weekly = {}
        for (y, w), s in acc.items():
            if len(s["tm"]) >= 4 and len(s["rr"]) >= 4:
                # pluie hebdo = cumul, ajusté si jours manquants
                rr = sum(s["rr"]) * 7 / len(s["rr"])
                # jours de pluie, ramenés à sept jours de la même façon
                jours = sum(1 for v in s["rr"] if v >= SEUIL_JOUR_DE_PLUIE_MM) * 7 / len(s["rr"])
                tn_mean = statistics.mean(s["tn"]) if s["tn"] else statistics.mean(s["tm"]) - 4
                weekly[(y, w)] = (
                    statistics.mean(s["tm"]),
                    tn_mean,
                    statistics.mean(s["tx"]) if s["tx"] else statistics.mean(s["tm"]) + 4,
                    rr,
                    min(s["tn"]) if s["tn"] else tn_mean - 3,
                    jours,
                )

        # climatologie par semaine (pour combler les trous)
        climato = {}
        for w in range(52):
            vals = [weekly[(y, w)] for y in range(YEAR_START, YEAR_END + 1) if (y, w) in weekly]
            if not vals:
                raise SystemExit(f"{game_id}: aucune donnée pour la semaine {w}")
            climato[w] = tuple(statistics.mean(v[i] for v in vals) for i in range(len(COLONNES)))

        semaines = []
        filled = 0
        for y in range(YEAR_START, YEAR_END + 1):
            for w in range(52):
                v = weekly.get((y, w))
                if v is None:
                    v = climato[w]
                    filled += 1
                semaines.append([round(x, 2) for x in v])

        series[game_id] = {
            "out": {
                "id": game_id,
                "stationMeteo": nom,
                "poste": meta.get("poste", ""),
                "lat": meta.get("lat", 0),
                "alti": meta.get("alti", 0),
                "periode": [YEAR_START, YEAR_END],
                "source": "Météo-France, données climatologiques de base quotidiennes (meteo.data.gouv.fr, licence ouverte Etalab)",
                "colonnes": COLONNES,
                "semaines": semaines,
            },
            "filled": filled,
        }
    return series

def resume(out: dict, filled: int) -> str:
    semaines = out["semaines"]
    ans = range(YEAR_END - YEAR_START + 1)
    rains = [sum(semaines[i][3] for i in range(y * 52, (y + 1) * 52)) for y in ans]
    jours = [sum(semaines[i][5] for i in range(y * 52, (y + 1) * 52)) for y in ans]
    return (
        f"{out['id']}: {out['stationMeteo']} ({out['poste']}), {len(semaines)} semaines, "
        f"{filled} comblées par climatologie, pluie annuelle {min(rains):.0f}-{max(rains):.0f} mm "
        f"(moy {statistics.mean(rains):.0f}), jours de pluie {min(jours):.0f}-{max(jours):.0f} "
        f"(moy {statistics.mean(jours):.1f})"
    )

def build(src_dir: Path, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    for serie in construire(src_dir).values():
        out = serie["out"]
        (out_dir / f"{out['id']}.json").write_text(json.dumps(out, ensure_ascii=False))
        print(resume(out, serie["filled"]))

def ajouter_jours_de_pluie(src_dir: Path, out_dir: Path) -> None:
    """Ajoute la colonne des jours de pluie aux séries publiées, sans toucher aux cinq autres."""
    for game_id, serie in construire(src_dir).items():
        neuve = serie["out"]
        path = out_dir / f"{game_id}.json"
        publiee = json.loads(path.read_text())
        if publiee["colonnes"] != COLONNES[:5] or len(publiee["semaines"]) != len(neuve["semaines"]):
            raise SystemExit(f"{game_id}: la série publiée n'a pas la forme attendue")
        ecarts = 0
        for ancienne, nouvelle in zip(publiee["semaines"], neuve["semaines"]):
            ecart = max(abs(a - b) for a, b in zip(ancienne, nouvelle[:5]))
            if ecart > 0.0101:
                raise SystemExit(f"{game_id}: écart de {ecart} avec la série publiée")
            if ecart > 0:
                ecarts += 1
        publiee["colonnes"] = COLONNES
        publiee["semaines"] = [a + [b[5]] for a, b in zip(publiee["semaines"], neuve["semaines"])]
        path.write_text(json.dumps(publiee, ensure_ascii=False))
        print(resume(publiee, serie["filled"]) + f" ; {ecarts} semaines à 0,01 près, gardées telles quelles")

if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    src = Path(args[0]) if args else Path(".")
    dest = Path(__file__).parent.parent / "data" / "meteo"
    if "--ajouter-jours-de-pluie" in sys.argv:
        ajouter_jours_de_pluie(src, dest)
    else:
        build(src, dest)
