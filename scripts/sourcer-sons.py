#!/usr/bin/env python3
"""
Les sons de la parcelle, sourcés et reproductibles (#129, lot L9).

    python3 scripts/sourcer-sons.py            # télécharge, contrôle, prépare
    python3 scripts/sourcer-sons.py --verifier  # ne fait que relire les licences

Chaque son vient de là où il a été **déposé par son auteur** :

- les ambiances, de **radio aporee ::: maps**, des enregistrements de terrain
  conservés par Internet Archive (`archive.org`) ;
- les oiseaux, de **xeno-canto**, la phonothèque des chants d'oiseaux.

Et d'une licence libre que le script **relit à la source** avant de toucher
au fichier : une licence recopiée à la main dans ce catalogue pourrait avoir
changé, ou avoir été mal lue. Un fichier dont la licence n'est pas admise
(`licence_admise`) fait échouer le script — une clause NC ou ND, en
particulier, ne passe pas.

Le premier jet tirait tout de Wikimedia Commons, qui en héberge des copies. Le
2026-09-30, Commons a refusé nos téléchargements (429, « please contact
noc@wikimedia.org ») : on est allé chercher les originaux chez leurs auteurs.

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

def licence_admise(url):
    """
    Le nom court d'une licence qu'on accepte d'embarquer, ou `None`.

    CC0, marque du domaine public, CC BY, CC BY-SA. CC BY-SA impose que
    l'extrait reste sous la même licence, et c'est le cas : PROVENANCE.md le
    dit fichier par fichier. Une clause **NC** (pas d'usage commercial) ou
    **ND** (pas de modification — or on coupe, on normalise, on boucle) ne
    passe pas.
    """
    u = (url or "").lower()
    m = re.search(r"creativecommons\.org/(licenses|publicdomain)/([a-z-]+)/([0-9.]+)", u)
    if not m:
        return None
    famille, code, version = m.groups()
    if famille == "publicdomain":
        return {"zero": "CC0", "mark": "Domaine public"}.get(code)
    return {"by": f"CC BY {version}", "by-sa": f"CC BY-SA {version}"}.get(code)

#: Le catalogue. `sorte` décide du traitement : une `ambiance` boucle, un `cri`
#: se joue d'une traite, de temps en temps.
#: `archive` est un identifiant d'Internet Archive, `xc` un numéro de xeno-canto.
CATALOGUE = [
    # Udo Noll, Tempelhofer Feld (Berlin) : « nice wind in the poplars ».
    {"id": "vent", "archive": "aporee_13863_41578", "sorte": "ambiance", "duree": 18},
    # oliverfuchs67, Andernach : « Evening time - Heavy rain ».
    {"id": "pluie", "archive": "aporee_62266_71666", "sorte": "ambiance", "duree": 15},
    # Matthes, Schleiden : un ruisseau remis à l'air libre après des décennies en conduite.
    {"id": "ruisseau", "archive": "aporee_21934_25484", "sorte": "ambiance", "duree": 12},
    # samuelcarladams, Lone Pine (Californie) : un feu près du camping, sous le mont Whitney.
    {"id": "feu", "archive": "aporee_52994_60560", "sorte": "ambiance", "duree": 15},
    # kaoss012, Toulouse : une tronçonneuse dans un parc, en hiver.
    {"id": "tronconneuse", "archive": "aporee_55426_63339", "sorte": "ambiance", "duree": 10},
    {"id": "mesange_bleue", "xc": 121562, "sorte": "cri", "duree": 6},
    {"id": "mesange_charbonniere", "xc": 129643, "sorte": "cri", "duree": 6},
    # Malton (Royaume-Uni) : « great spotted woodpecker ... drumming ». Un
    # grondement grave (vent, route) y domine le spectre brut et guidait le
    # choix de l'extrait vers lui : on coupe sous 500 Hz, là où le coup de bec
    # n'est pas.
    {"id": "pic_epeiche", "archive": "aporee_63892_73703", "sorte": "cri", "duree": 4, "passeHaut": 500},
    {"id": "buse_variable", "xc": 538277, "sorte": "cri", "duree": 5},
    {"id": "geai", "xc": 461842, "sorte": "cri", "duree": 4},
]

#: Coupure sous laquelle on nettoie un cri, Hz : le grondement du vent et de la
#: route, qui n'est pas l'oiseau. C'est l'usage pour les enregistrements
#: d'oiseaux, dont aucun chant du catalogue ne descend si bas.
PASSE_HAUT_CRI_HZ = 250

#: Au-delà, on ne décode pas : l'extrait se cherche dans les trois premières minutes.
DECODE_MAX_S = 180

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
        except (urllib.error.URLError, ConnectionError, TimeoutError) as e:
            # Une connexion coupée en route : les serveurs de fichiers d'Internet
            # Archive le font sur les gros téléchargements. On reprend.
            if essai == 4:
                raise
            print(f"   coupure ({e}) — nouvel essai dans {5 * (essai + 1)} s", flush=True)
            time.sleep(5 * (essai + 1))


def fiche(son):
    """
    Où télécharger le son, et ce que sa source dit de lui : auteur, licence,
    page. Lu **à la source**, à chaque exécution.
    """
    if "archive" in son:
        ident = son["archive"]
        with ouvrir(f"https://archive.org/metadata/{ident}") as r:
            d = json.load(r)
        m = d.get("metadata", {})
        # Le plus léger des formats compressés : on va de toute façon réencoder.
        fichiers = [f for f in d.get("files", []) if f["name"].lower().endswith((".ogg", ".mp3"))]
        fichiers.sort(key=lambda f: int(f.get("size") or 0))
        if not fichiers:
            sys.exit(f"{son['id']} : aucun fichier audio dans {ident}")
        nom = fichiers[0]["name"]
        auteur = m.get("creator")
        return {
            "url": f"https://archive.org/download/{ident}/{urllib.parse.quote(nom)}",
            "page": f"https://archive.org/details/{ident}",
            "titre": texte(str(m.get("title", ident))),
            "licenceUrl": m.get("licenseurl", ""),
            "auteur": texte(auteur if isinstance(auteur, str) else ", ".join(auteur or [])),
            "credit": "radio aporee ::: maps, Internet Archive",
        }
    n = son["xc"]
    with ouvrir(f"https://xeno-canto.org/{n}") as r:
        page = r.read().decode("utf-8", "replace")
    titre = re.findall(r"<title>(.*?)</title>", page, re.S)
    auteur = re.findall(r"Recordist</td>\s*<td[^>]*>(.*?)</td>", page, re.S)
    licence = re.findall(r"(//creativecommons\.org/(?:licenses|publicdomain)/[^'\"]+)", page)
    return {
        "url": f"https://xeno-canto.org/{n}/download",
        "page": f"https://xeno-canto.org/{n}",
        "titre": texte(titre[0]).replace(" :: xeno-canto", "") if titre else f"XC{n}",
        "licenceUrl": ("https:" + licence[0]) if licence else "",
        "auteur": texte(auteur[0]) if auteur else "",
        "credit": "xeno-canto",
    }


def telecharger(url, chemin):
    """Télécharge dans un fichier temporaire, renommé seulement une fois complet."""
    for essai in range(4):
        try:
            with ouvrir(url) as r, open(chemin + ".part", "wb") as f:
                while bloc := r.read(1 << 16):
                    f.write(bloc)
            os.replace(chemin + ".part", chemin)
            return
        except (urllib.error.URLError, ConnectionError, TimeoutError) as e:
            if essai == 3:
                raise
            print(f"   coupure en cours de téléchargement ({e}) — on reprend", flush=True)
            time.sleep(5 * (essai + 1))


def texte(html):
    """Les champs des sources sont en HTML : on garde le texte."""
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", html or "")).strip()


def pcm(chemin, passe_haut=None):
    """Le fichier en échantillons mono flottants à `TAUX` Hz, filtré au besoin."""
    filtre = ["-af", f"highpass=f={passe_haut},highpass=f={passe_haut}"] if passe_haut else []
    brut = subprocess.run(
        ["ffmpeg", "-v", "error", "-t", str(DECODE_MAX_S), "-i", chemin, *filtre,
         "-ac", "1", "-ar", str(TAUX), "-f", "f32le", "-"],
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
    provenance = []
    for son in CATALOGUE:
        m = fiche(son)
        m["licence"] = licence_admise(m["licenceUrl"])
        if not m["licence"]:
            sys.exit(f"{son['id']} : licence « {m['licenceUrl'] or 'inconnue'} » non admise ({m['page']})")
        print(f"{son['id']:<22} {m['licence']:<14} {m['auteur'][:40]:<40} {m['titre'][:50]}", flush=True)
        time.sleep(1)
        if verifier:
            continue
        # Le nom du cache porte la source : deux sources peuvent donner le même
        # nom de fichier (« download »).
        brut = os.path.join(CACHE, f"{son['id']}-" + os.path.basename(urllib.parse.unquote(m["url"])))
        if not os.path.exists(brut):
            telecharger(m["url"], brut)
            time.sleep(2)
        passe_haut = son.get("passeHaut", PASSE_HAUT_CRI_HZ if son["sorte"] == "cri" else None)
        a = pcm(brut, passe_haut)
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
                "source": m["titre"],
                "page": m["page"],
                "auteur": m["auteur"],
                "credit": m["credit"],
                "licence": m["licence"],
                "licenceUrl": m["licenceUrl"],
                "extraitS": [round(debut / TAUX, 2), round(fin / TAUX, 2)],
                "modifications": (
                    "extrait, mono 22 kHz, "
                    + (f"passe-haut {passe_haut} Hz, " if passe_haut else "")
                    + "intensité normalisée, "
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
        f.write("Chaque fichier de ce dossier est un **extrait modifié** d'un enregistrement ")
        f.write("déposé par son auteur sur radio aporee ::: maps (Internet Archive) ou sur ")
        f.write("xeno-canto, sous la licence de l'original. Les fichiers sous CC BY-SA ")
        f.write("restent sous CC BY-SA.\n\n")
        f.write("| Fichier | Source | Auteur | Licence | Extrait | Modifications |\n")
        f.write("|---|---|---|---|---|---|\n")
        for p in provenance:
            f.write(
                f"| `{p['fichier']}` | [{p['source']}]({p['page']}) ({p['credit']}) | {p['auteur']} "
                f"| [{p['licence']}]({p['licenceUrl']}) | {p['extraitS'][0]}–{p['extraitS'][1]} s | {p['modifications']} |\n"
            )


if __name__ == "__main__":
    main()
