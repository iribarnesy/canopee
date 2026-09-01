# Canopée

Jeu de gestion d'une parcelle en agroforesterie tempérée, dans le navigateur.
Simulation à visée scientifique : stations réelles françaises, loi du minimum,
succession écologique, bilan carbone honnête.

- **Règles du jeu / game design** : [docs/regles.md](docs/regles.md)
- Sources scientifiques : cours d'agroforesterie et atlas des espèces (`~/Notes`),
  à recouper avec la *Flore forestière française* et des références publiques
  (chaque valeur du jeu doit être sourcée).

- **Stack technique** : [docs/stack.md](docs/stack.md)

État : moteur spatial complet sur 5 espèces — grille de sol 1 m² (eau, azote,
litières), arbres positionnés (zone racinaire, ombres portées décalées au
nord), croissance en loi du minimum, régénération naturelle et succession
émergente (testée sur 200 ans), météo réelle Météo-France (60 ans), premières
actions joueur (planter, couper-vendre/épandre) avec argent et temps de
travail — le journal d'actions daté + la seed forment la sauvegarde rejouable.
UI jetable de visualisation (courbes + carte de parcelle).

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
