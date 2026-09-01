# Canopée

Jeu de gestion d'une parcelle en agroforesterie tempérée, dans le navigateur.
Simulation à visée scientifique : stations réelles françaises, loi du minimum,
succession écologique, bilan carbone honnête.

- **Règles du jeu / game design** : [docs/regles.md](docs/regles.md)
- Sources scientifiques : cours d'agroforesterie et atlas des espèces (`~/Notes`),
  à recouper avec la *Flore forestière française* et des références publiques
  (chaque valeur du jeu doit être sourcée).

- **Stack technique** : [docs/stack.md](docs/stack.md)

État : V0 « le sol et l'eau » en cours — moteur pur (météo/ETP Hargreaves, bilan
hydrique, PRNG seedé) + UI jetable de visualisation.

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
