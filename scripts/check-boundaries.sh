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

if [ "$fail" -eq 0 ]; then
  echo "Frontières du moteur respectées."
fi
exit "$fail"
