# Canopée

Jeu de gestion d'une parcelle en agroforesterie tempérée, dans le navigateur.
Simulation à visée scientifique : stations réelles françaises, loi du minimum,
succession écologique, bilan carbone honnête.

- **Règles du jeu / game design** : [docs/regles.md](docs/regles.md)
- Sources scientifiques : cours d'agroforesterie et atlas des espèces (`~/Notes`),
  à recouper avec la *Flore forestière française* et des références publiques
  (chaque valeur du jeu doit être sourcée).

- **Stack technique** : [docs/stack.md](docs/stack.md)

État : moteur spatial V0.5 — grille de sol 1 m² (eau, azote), arbres positionnés
qui puisent dans leur zone racinaire, ombres portées décalées au nord,
croissance en loi du minimum sur 5 espèces. UI jetable de visualisation
(courbes + carte de parcelle).

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
