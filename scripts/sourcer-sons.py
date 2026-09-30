#!/usr/bin/env python3
"""
Les sons de la parcelle, sourcés et reproductibles (#129, lot L9).

    python3 scripts/sourcer-sons.py            # télécharge, contrôle, prépare
    python3 scripts/sourcer-sons.py --verifier  # ne fait que relire les licences

Chaque son vient de **Wikimedia Commons**, et d'une licence libre que le script
**relit à la source** avant de toucher au fichier : une licence recopiée à la
main dans ce catalogue pourrait avoir changé, ou avoir été mal lue. Un fichier
dont la licence n'est pas dans `LICENCES_ADMISES` fait échouer le script.

Ce qu'il fait de chaque fichier, et que `data/sons/PROVENANCE.md` redit :

- il prend un **extrait** : pour une ambiance (vent, pluie, eau, feu), la fenêtre
  la plus régulière, celle où l'intensité varie le moins — une boucle qui
  pompe s'entend ; pour un cri (mésange, pic, buse…), la fenêtre la plus
  énergique, là où l'oiseau chante ;
- il le passe en **mono** à 22 kHz, et le **normalise** en intensité ;
- pour une ambiance, il fond la fin dans le début : la boucle n'a pas de
  couture ;
- il l'encode en **Ogg Vorbis**.

Personne n'a **écouté** ces extraits au moment où ce script a été écrit : le
choix de la fenêtre est un calcul d'énergie, pas une oreille. C'est dit ici
pour qu'on sache ce qui reste à faire.

La mise en scène — quel son joue quand, et à quel niveau — n'est pas ici : elle
est dans `src/game/son/`, et elle ne lit que ce que le moteur donne.
"""

import array
import json
import os
import re
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SORTIE = os.path.join(RACINE, "data", "sons")
CACHE = os.path.join(RACINE, ".cache", "sons")
UA = "CanopeeSoundSourcing/0.1 (https://github.com/iribarnesy/canopee)"
#: 22 kHz suffit : le chant le plus aigu du catalogue, celui de la mésange
#: bleue, ne dépasse guère 8 kHz, et la moitié de ce taux en laisse 11.
TAUX = 22050
#: Le budget du document de rendu (§5.10) : moins de 500 ko pour tous les sons.
BUDGET_KO = 500

#: Les licences qu'on accepte d'embarquer. CC BY-SA impose que l'extrait reste
#: sous la même licence, et c'est le cas : PROVENANCE.md le dit fichier par fichier.
LICENCES_ADMISES = {
    "CC0",
    "Public domain",
    "CC BY 3.0",
    "CC BY 4.0",
    "CC BY-SA 3.0",
    "CC BY-SA 4.0",
}

#: Le catalogue. `sorte` décide du traitement : une `ambiance` boucle, un `cri`
#: se joue d'une traite, de temps en temps.
CATALOGUE = [
    {"id": "vent", "titre": "File:Wind in forest (Gravity Sound).wav", "sorte": "ambiance", "duree": 18},
    {"id": "pluie", "titre": "File:Sound of light rainfall.ogg", "sorte": "ambiance", "duree": 15},
    {"id": "ruisseau", "titre": "File:Brook sound.ogg", "sorte": "ambiance", "duree": 12},
    {"id": "feu", "titre": "File:WWS Bonfireburning.ogg", "sorte": "ambiance", "duree": 15},
    {"id": "tronconneuse", "titre": "File:Chainsaw 2.ogg", "sorte": "ambiance", "duree": 10},
    {"id": "mesange_bleue", "titre": "File:Cyanistes caeruleus - Eurasian Blue Tit XC121562.ogg", "sorte": "cri", "duree": 6},
    {"id": "mesange_charbonniere", "titre": "File:Parus major song.ogg", "sorte": "cri", "duree": 6},
    {"id": "pic_epeiche", "titre": "File:Great Spotted Woodpecker drum.ogg", "sorte": "cri", "duree": 4},
    {"id": "buse_variable", "titre": "File:Buteo buteo - Common Buzzard XC538277.mp3", "sorte": "cri", "duree": 5},
    {"id": "geai", "titre": "File:Garrulus glandarius - Eurasian Jay XC461842.mp3", "sorte": "cri", "duree": 4},
]

#: Recouvrement de la boucle, secondes : la fin se fond dans le début.
FONDU_BOUCLE_S = 1.5
#: Fondu d'entrée et de sortie d'un cri, secondes.
FONDU_CRI_S = 0.08
#: Intensité visée, en valeur efficace sur [-1, 1] : environ −20 dBFS.
RMS_VISEE = 0.1


def contexte_tls():
    fichier = os.environ.get("SSL_CERT_FILE") or "/root/.ccr/ca-bundle.crt"
    return ssl.create_default_context(cafile=fichier) if os.path.exists(fichier) else ssl.create_default_context()


CTX = contexte_tls()


def ouvrir(url):
    """Une requête polie : un User-Agent qui dit qui l'on est, et on attend quand on nous le demande."""
    for essai in range(5):
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        try:
            return urllib.request.urlopen(req, context=CTX, timeout=60)
        except urllib.error.HTTPError as e:
            if e.code != 429 or essai == 4:
                raise
            attente = int(e.headers.get("Retry-After") or 0) or 20 * (essai + 1)
            print(f"   429 — j'attends {attente} s", flush=True)
            time.sleep(attente)


def metadonnees(titres):
    params = {
        "action": "query",
        "format": "json",
        "titles": "|".join(titres),
        "prop": "imageinfo",
        "iiprop": "url|extmetadata|mime|size",
        "iiextmetadatafilter": "LicenseShortName|LicenseUrl|Artist|Credit|UsageTerms",
    }
    with ouvrir("https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(params)) as r:
        d = json.load(r)
    pages = {}
    for p in d["query"]["pages"].values():
        ii = (p.get("imageinfo") or [{}])[0]
        em = ii.get("extmetadata", {})
        g = lambda k: (em.get(k) or {}).get("value", "")
        pages[p["title"]] = {
            "url": ii.get("url"),
            "page": ii.get("descriptionurl"),
            "licence": g("LicenseShortName"),
            "licenceUrl": g("LicenseUrl"),
            "auteur": texte(g("Artist")),
            "credit": texte(g("Credit")),
        }
    return pages


def texte(html):
    """Les champs de Commons sont en HTML : on garde le texte."""
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", html or "")).strip()


def pcm(chemin):
    """Le fichier en échantillons mono flottants à `TAUX` Hz."""
    brut = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", chemin, "-ac", "1", "-ar", str(TAUX), "-f", "f32le", "-"],
        check=True,
        capture_output=True,
    ).stdout
    a = array.array("f")
    a.frombytes(brut)
    return a


def rms(a, debut, fin):
    s = 0.0
    for i in range(debut, fin):
        s += a[i] * a[i]
    return (s / max(1, fin - debut)) ** 0.5


def fenetre(a, duree_s, sorte):
    """
    Où couper. On mesure l'intensité par tranches d'un quart de seconde, et on
    choisit la fenêtre qui minimise sa variation (ambiance) ou maximise son
    énergie (cri).
    """
    n = int(duree_s * TAUX)
    if len(a) <= n:
        return 0, len(a)
    pas = TAUX // 4
    tranches = [rms(a, i, min(len(a), i + pas)) for i in range(0, len(a) - pas, pas)]
    k = n // pas
    meilleur, score_meilleur = 0, None
    for j in range(0, len(tranches) - k):
        t = tranches[j : j + k]
        m = sum(t) / k
        if sorte == "ambiance":
            # Régulier, et pas silencieux : l'écart relatif, pénalisé si c'est mou.
            v = (sum((x - m) ** 2 for x in t) / k) ** 0.5
            score = v / max(m, 1e-6)
        else:
            score = -m
        if score_meilleur is None or score < score_meilleur:
            meilleur, score_meilleur = j, score
    return meilleur * pas, meilleur * pas + n


def normaliser(a):
    r = rms(a, 0, len(a))
    g = RMS_VISEE / max(r, 1e-6)
    pic = max((abs(x) for x in a), default=0) * g
    if pic > 0.98:
        g *= 0.98 / pic
    return array.array("f", (x * g for x in a))


def boucler(a):
    """La fin se fond dans le début : l'extrait, rejoué, n'a pas de couture."""
    f = int(FONDU_BOUCLE_S * TAUX)
    if len(a) <= 2 * f:
        return a
    corps = array.array("f", a[: len(a) - f])
    queue = a[len(a) - f :]
    for i in range(f):
        k = i / f
        corps[i] = corps[i] * k + queue[i] * (1 - k)
    return corps


def fondre(a):
    f = int(FONDU_CRI_S * TAUX)
    for i in range(min(f, len(a))):
        k = i / f
        a[i] *= k
        a[len(a) - 1 - i] *= k
    return a


def encoder(a, chemin):
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(TAUX), "-ac", "1", "-i", "-",
         "-c:a", "libvorbis", "-q:a", "1", chemin],
        input=a.tobytes(),
        check=True,
    )


def main():
    verifier = "--verifier" in sys.argv
    os.makedirs(CACHE, exist_ok=True)
    os.makedirs(SORTIE, exist_ok=True)
    meta = metadonnees([s["titre"] for s in CATALOGUE])
    provenance = []
    for son in CATALOGUE:
        m = meta.get(son["titre"])
        if not m or not m["url"]:
            sys.exit(f"{son['id']} : {son['titre']} introuvable sur Commons")
        if m["licence"] not in LICENCES_ADMISES:
            sys.exit(f"{son['id']} : licence « {m['licence']} » hors de la liste admise")
        print(f"{son['id']:<22} {m['licence']:<14} {m['auteur'][:50]}", flush=True)
        if verifier:
            continue
        brut = os.path.join(CACHE, os.path.basename(urllib.parse.unquote(m["url"])))
        if not os.path.exists(brut):
            with ouvrir(m["url"]) as r, open(brut, "wb") as f:
                f.write(r.read())
            time.sleep(2)
        a = pcm(brut)
        debut, fin = fenetre(a, son["duree"] + (FONDU_BOUCLE_S if son["sorte"] == "ambiance" else 0), son["sorte"])
        extrait = normaliser(array.array("f", a[debut:fin]))
        extrait = boucler(extrait) if son["sorte"] == "ambiance" else fondre(extrait)
        fichier = f"{son['id']}.ogg"
        encoder(extrait, os.path.join(SORTIE, fichier))
        provenance.append(
            {
                "id": son["id"],
                "fichier": fichier,
                "sorte": son["sorte"],
                "source": son["titre"],
                "page": m["page"],
                "auteur": m["auteur"],
                "credit": m["credit"],
                "licence": m["licence"],
                "licenceUrl": m["licenceUrl"],
                "extraitS": [round(debut / TAUX, 2), round(fin / TAUX, 2)],
                "modifications": (
                    "extrait, mono 22 kHz, intensité normalisée, "
                    + ("boucle fondue sur 1,5 s, " if son["sorte"] == "ambiance" else "fondus de 80 ms, ")
                    + "Ogg Vorbis q1"
                ),
            }
        )
    if verifier:
        return
    total = sum(os.path.getsize(os.path.join(SORTIE, p["fichier"])) for p in provenance) / 1024
    print(f"total : {total:.0f} ko (budget {BUDGET_KO} ko)")
    if total > BUDGET_KO:
        sys.exit(f"les sons pèsent {total:.0f} ko, au-delà du budget de {BUDGET_KO} ko (§5.10)")
    with open(os.path.join(SORTIE, "provenance.json"), "w", encoding="utf-8") as f:
        json.dump(provenance, f, ensure_ascii=False, indent=2)
        f.write("\n")
    with open(os.path.join(SORTIE, "PROVENANCE.md"), "w", encoding="utf-8") as f:
        f.write("# Provenance des sons\n\n")
        f.write("Produit par `scripts/sourcer-sons.py` — ne pas éditer à la main.\n\n")
        f.write("Chaque fichier de ce dossier est un **extrait modifié** d'un enregistrement de ")
        f.write("Wikimedia Commons, sous la licence de l'original. Les fichiers sous CC BY-SA ")
        f.write("restent sous CC BY-SA.\n\n")
        f.write("| Fichier | Source | Auteur | Licence | Extrait | Modifications |\n")
        f.write("|---|---|---|---|---|---|\n")
        for p in provenance:
            f.write(
                f"| `{p['fichier']}` | [{p['source'].removeprefix('File:')}]({p['page']}) | {p['auteur'] or p['credit']} "
                f"| [{p['licence']}]({p['licenceUrl']}) | {p['extraitS'][0]}–{p['extraitS'][1]} s | {p['modifications']} |\n"
            )


if __name__ == "__main__":
    main()
