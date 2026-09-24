#!/usr/bin/env bash
# Garde-fous d'architecture (docs/stack.md) : le moteur reste pur.
set -euo pipefail
cd "$(dirname "$0")/.."

fail=0

if grep -rnE "Math\.random\s*\(" src/engine; then
  echo "ERREUR : Math.random interdit dans src/engine — utiliser src/engine/rng.ts (seedé)." >&2
  fail=1
fi

if grep -rnE "from ['\"](react|react-dom|pixi\.js)" src/engine; then
  echo "ERREUR : src/engine ne doit importer ni React ni PixiJS." >&2
  fail=1
fi

if grep -rnE "\b(document|window|localStorage|indexedDB)\." src/engine; then
  echo "ERREUR : pas d'accès DOM/stockage navigateur dans src/engine." >&2
  fail=1
fi

if grep -rnE "from ['\"]\.\./(ui|render|sim-worker)" src/engine; then
  echo "ERREUR : src/engine ne doit rien importer depuis ui/, render/ ou sim-worker/." >&2
  fail=1
fi

# Le rendu doit être **déterministe** : deux parties de même graine donnent la même
# image. Toute variation « organique » (penchant d'un arbre, phase de son
# balancement, forme de son houppier) dérive de son id, pas du hasard — sinon
# une capture d'écran n'est pas reproductible et un bug de rendu ne se rejoue
# pas (docs/interface-visuelle.md §8).
if [ -d src/render ] && grep -rnE "Math\.random\s*\(" src/render; then
  echo "ERREUR : Math.random interdit dans src/render — dériver la variation de l'id de l'arbre." >&2
  fail=1
fi

# Un **essai n'écrit pas hors du dépôt**. Les bancs de mesure versent volontiers
# leurs relevés dans un dossier de travail personnel ; oublié dans un commit,
# le chemin n'existe pas sur le runner et la CI tombe sur un ENOENT — au milieu
# d'un essai d'écologie qui, lui, marchait. C'est arrivé (#136), et la suite
# locale ne l'a pas vu, justement parce que le dossier existait ici. Les
# relevés se recopient dans les **commentaires** de l'essai, qui est leur place.
if grep -rnE "writeFileSync|appendFileSync|/tmp/" tests; then
  echo "ERREUR : un essai écrit hors du dépôt — recopier le relevé en commentaire." >&2
  fail=1
fi

if [ "$fail" -eq 0 ]; then
  echo "Frontières du moteur respectées."
fi
exit "$fail"
