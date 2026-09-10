#!/usr/bin/env bash
# Régénère toutes les scènes que le banc d'aperçu utilise.
#
# **Ce fichier existe parce que les recettes n'étaient écrites nulle part.**
# `apercu/scenes/` est dans `.gitignore` — les scènes sont produites, pas
# versionnées — mais les planches de `src/apercu/apercu.ts` les nomment. Sans
# recette, un dépôt fraîchement cloné ne peut pas rendre les planches, et une
# scène périmée fait rendre le banc avec des champs manquants : les plus
# anciennes ici n'avaient ni `lumiere`, ni `herbeHumidite`, ni le bois couché,
# donc plusieurs grandeurs branchées depuis ne s'y voyaient pas.
#
# Les recettes des scènes ANCIENNES ont été reconstituées depuis le contenu
# des fichiers eux-mêmes (semaine 1536 = an 30 semaine 28 ; relief, eau libre
# et valeurs forcées relus cellule par cellule). Elles sont donc à vérifier
# une fois rejouées ; celles du bois couché, ajoutées avec lui, sont sûres.
#
# **Depuis le 2026-09-09, chaque scène porte son JOURNAL** — ce qui a changé
# depuis l'instantané précédent, avec la sémantique du worker. Les scènes cuites
# avant n'en ont pas, et le banc leur fabrique un journal postiche ; seules les
# `friche-*` ont été régénérées. Refaire les autres, c'est relancer la ligne
# correspondante ci-dessous.
#
# Usage :  bash scripts/apercu-scenes.sh [nom...]
#          bash scripts/apercu-scenes.sh bois          # juste le bois couché
#
# Compter une poignée de minutes par scène : chacune rejoue trente ans de
# simulation semaine par semaine.
set -euo pipefail
cd "$(dirname "$0")/.."

quoi="${*:-tout}"
veut() { [ "$quoi" = "tout" ] || printf '%s\n' $quoi | grep -qx "$1"; }

# ── La friche, sept semaines de l'an 30 ────────────────────────────────────
# La scène de référence : c'est celle que le lot L0 a mesurée comme pire cas.
if veut friche; then
  APERCU_NOM=friche.json APERCU_ANS=30 APERCU_SEMAINES=4,13,17,24,28,36,42 \
    npx tsx scripts/apercu-scene.ts
fi

# ── La mare et le ruisseau ─────────────────────────────────────────────────
if veut mare; then
  APERCU_NOM=mare.json APERCU_ANS=30 APERCU_SEMAINES=28 APERCU_EAU=mare \
    npx tsx scripts/apercu-scene.ts
fi
if veut ruisseau; then
  APERCU_NOM=ruisseau.json APERCU_ANS=30 APERCU_SEMAINES=28 APERCU_EAU=ruisseau \
    npx tsx scripts/apercu-scene.ts
fi

# ── Le versant ─────────────────────────────────────────────────────────────
if veut versant; then
  APERCU_NOM=versant.json APERCU_ANS=30 APERCU_SEMAINES=28 APERCU_PENTE=12 \
    npx tsx scripts/apercu-scene.ts
fi

# ── Le banc de pelouse ─────────────────────────────────────────────────────
# Des BOUTS d'échelle que la simulation ne produit jamais tous ensemble :
# couverture pleine, litière nulle, et la biomasse au choix — rase pour un
# gazon, sur pied pour du foin.
if veut pelouse; then
  APERCU_NOM=pelouse.json APERCU_ANS=30 APERCU_SEMAINES=28 APERCU_SANS_ARBRES=1 \
    APERCU_HERBE=1 APERCU_BIOMASSE=0.25 APERCU_LITIERE=0 \
    npx tsx scripts/apercu-scene.ts
  APERCU_NOM=pelouse-seche.json APERCU_ANS=30 APERCU_SEMAINES=28 APERCU_SANS_ARBRES=1 \
    APERCU_HERBE=1 APERCU_BIOMASSE=1 APERCU_LITIERE=0 \
    npx tsx scripts/apercu-scene.ts
  APERCU_NOM=pelouse-arbres.json APERCU_ANS=30 APERCU_SEMAINES=28 \
    APERCU_HERBE=1 APERCU_BIOMASSE=0.3 APERCU_LITIERE=0 \
    npx tsx scripts/apercu-scene.ts
fi

# ── L'incendie ─────────────────────────────────────────────────────────────
# **Trois ans et pas huit, et c'est le moteur qui l'a décidé** : à huit ans le
# couvert s'est refermé, le combustible de surface reste humide
# (`PORTANCE_SOUS_COUVERT`), et l'allumage ne prend pas — zéro cellule brûlée.
# Une friche de trois ans, herbeuse et ouverte, brûle : 6 505 cellules et un
# front de 116 rangs. C'est exactement la pédagogie que le §6.4 attend, et elle
# s'est manifestée avant même qu'on regarde l'image.
if veut feu; then
  APERCU_NOM=feu.json APERCU_ANS=3 APERCU_SEMAINES=30 APERCU_FEU=1 \
    npx tsx scripts/apercu-scene.ts
fi

# ── Le banc du bois couché ─────────────────────────────────────────────────
# Deux troncs de vingt-cinq mètres, à deux azimuts. La transversalité n'est pas
# forcée : `transversalite` du moteur la calcule depuis l'azimut posé et l'aval
# local, sans quoi le banc fabriquerait un état inatteignable. Sur ce relief,
# l'azimut 20° donne 0,97 (au-delà du seuil : il barre) et 90° donne 0,33
# (en deçà : il fait gouttière).
if veut bois; then
  APERCU_NOM=bois-barre.json APERCU_ANS=6 APERCU_PENTE=12 \
    APERCU_BOIS=15000 APERCU_BOIS_AZIMUT=20 \
    npx tsx scripts/apercu-scene.ts
  APERCU_NOM=bois-longe.json APERCU_ANS=6 APERCU_PENTE=12 \
    APERCU_BOIS=15000 APERCU_BOIS_AZIMUT=90 \
    npx tsx scripts/apercu-scene.ts
fi
