# Canopée

Jeu de gestion d'une parcelle en agroforesterie tempérée, dans le navigateur.
Simulation à visée scientifique : stations réelles françaises, loi du minimum,
succession écologique, bilan carbone honnête.

- **Règles du jeu / game design** : [docs/regles.md](docs/regles.md)
- Sources scientifiques : cours d'agroforesterie et atlas des espèces (`~/Notes`),
  à recouper avec la *Flore forestière française* et des références publiques
  (chaque valeur du jeu doit être sourcée).

- **Stack technique** : [docs/stack.md](docs/stack.md)
- **Critères de réalisme** : [docs/realisme.md](docs/realisme.md) — le référentiel
  de vérité écologique que le moteur doit atteindre, et où on en est.

État : moteur spatial sur 25 espèces — sol en **horizons** dont tout est
dérivé (texture, MO, pierrosité → réserve utile, drainage, fertilité), grille
1 m², arbres positionnés qui puisent selon la **profondeur de leurs racines**,
lumière avec ombres portées et pénombre, effet nurse et brise-vent, régénération
et succession émergente, météo réelle Météo-France (60 ans), phénologie et
récoltes, carbone, économie (argent, UTH, contrats). Jeu jouable en ligne :
https://iribarnesy.github.io/canopee/

## Développement

```bash
npm install
npm run dev          # labo moteur sur http://localhost:5173
npm test             # tests (unitaires, propriétés de conservation, déterminisme)
npm run typecheck
npm run lint
npm run check:boundaries   # garde-fous : le moteur reste pur (pas de DOM, pas de Math.random)
```

Le moteur vit dans `src/engine/` et n'importe jamais rien de l'UI — c'est vérifié en CI.

Après le clone : `git config core.hooksPath .githooks` — le hook pre-push
rejoue toute la vérification (`npm run verif`) avant chaque push.
