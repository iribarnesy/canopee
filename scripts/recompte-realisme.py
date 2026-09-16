#!/usr/bin/env python3
"""Recompte le tableau de score de `docs/realisme.md` DEPUIS LES LIGNES.

Règle issue de #76 : un compte tenu à la main diverge. L'en-tête a déjà annoncé
80/26/16 sur 122 quand les lignes en portaient 104/28/2 sur 134, et la dérive
s'était accumulée sur une trentaine de lots.

    python3 scripts/recompte-realisme.py            # vérifie, sort 1 si ça diverge
    python3 scripts/recompte-realisme.py --ecrire    # réécrit le tableau

Un critère est une ligne de tableau dont la première colonne est un identifiant
`<Lettre><n°>` et la troisième un ✅, 🟡 ou ❌.
"""

from __future__ import annotations

import pathlib
import re
import sys

DOC = pathlib.Path(__file__).resolve().parent.parent / "docs" / "realisme.md"
DOMAINES = {
    "A": "A. Sol, eau, atmosphère",
    "B": "B. Lumière et structure",
    "C": "C. Nutriments et cycles",
    "D": "D. Climat et phénologie",
    "E": "E. Interactions entre plantes",
    "F": "F. Dynamique des peuplements",
    "G": "G. Faune et santé",
    "H": "H. Gestion, économie, travail",
    "I": "I. Carbone",
    "J": "J. Biodiversité et structure",
}
ETATS = ["✅", "🟡", "❌"]
LIGNE = re.compile(r"^\|\s*([A-J])(\d+)\s*\|[^|]*\|\s*(✅|🟡|❌)\s*\|")


def recense(texte: str):
    """{domaine: {état: n}}, et la liste des numéros vus, pour les doublons."""
    compte = {d: dict.fromkeys(ETATS, 0) for d in DOMAINES}
    vus: dict[str, list[str]] = {d: [] for d in DOMAINES}
    for ligne in texte.splitlines():
        m = LIGNE.match(ligne)
        if not m:
            continue
        domaine, numero, etat = m.group(1), m.group(2), m.group(3)
        compte[domaine][etat] += 1
        vus[domaine].append(numero)
    return compte, vus


def tableau(compte) -> str:
    lignes = ["| Domaine | ✅ | 🟡 | ❌ | Total |", "|---|---|---|---|---|"]
    totaux = dict.fromkeys(ETATS, 0)
    for lettre, nom in DOMAINES.items():
        c = compte[lettre]
        for e in ETATS:
            totaux[e] += c[e]
        lignes.append(f"| {nom} | {c['✅']} | {c['🟡']} | {c['❌']} | {sum(c.values())} |")
    total = sum(totaux.values())
    lignes.append(
        f"| **Total** | **{totaux['✅']}** | **{totaux['🟡']}** | **{totaux['❌']}** | **{total}** |"
    )
    pct = round(100 * (totaux["✅"] + totaux["🟡"] / 2) / total)
    lignes.append("")
    lignes.append(
        f"**Score de réalisme : {totaux['✅']} pleins + {totaux['🟡']} partiels "
        f"sur {total} → {pct} %** *(un partiel compte 1/2)*."
    )
    return "\n".join(lignes)


def main() -> int:
    texte = DOC.read_text(encoding="utf-8")
    compte, vus = recense(texte)

    doublons = {
        d: sorted({n for n in v if v.count(n) > 1}) for d, v in vus.items() if len(set(v)) != len(v)
    }
    if doublons:
        print("NUMÉROS EN DOUBLE (un critère ne doit porter qu'un numéro) :")
        for d, ns in doublons.items():
            print(f"  {d} : {', '.join(ns)}")

    attendu = tableau(compte)
    debut = texte.index("| Domaine | ✅ | 🟡 | ❌ | Total |")
    fin = texte.index("\n\n", texte.index("**Score de réalisme :", debut))
    actuel = texte[debut:fin]

    if actuel == attendu:
        print("le tableau est conforme aux lignes")
        return 1 if doublons else 0

    print("DIVERGENCE entre l'en-tête et les lignes.\n--- en-tête actuel ---")
    print(actuel)
    print("--- recompté depuis les lignes ---")
    print(attendu)
    if "--ecrire" in sys.argv:
        DOC.write_text(texte[:debut] + attendu + texte[fin:], encoding="utf-8")
        print("\n→ tableau réécrit.")
        return 1 if doublons else 0
    print("\n(relancer avec --ecrire pour corriger)")
    return 1


if __name__ == "__main__":
    sys.exit(main())
