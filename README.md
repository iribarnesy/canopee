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

- **Interface visuelle** : [docs/interface-visuelle.md](docs/interface-visuelle.md) —
  l'inventaire du chantier de la vue isométrique (visuels, animations, ce que
  le moteur devra apprendre à dire).

- **Attentes du rendu** : [docs/attentes-du-rendu.md](docs/attentes-du-rendu.md) —
  la file d'attente des évolutions que la vue isométrique demande au moteur,
  avec leur urgence. C'est là que se répond « qu'est-ce que je fais ensuite ? »
  quand on travaille dans `src/engine/`.

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
npm run verif:rapide # pendant qu'on écrit : tout sauf les essais d'écologie
npm run verif        # avant de pousser : la vérification complète
```

Les deux vérifications enchaînent les mêmes contrôles — types, style, frontières
du moteur, tableau de réalisme — et ne diffèrent que par les essais :

| | fichiers | essais | mesuré sur quatre cœurs |
|---|---|---|---|
| `verif:rapide` | 73 | 1 034 | **3 minutes** |
| `verif` | 151 | 1 745 | **une heure** |

Les 711 essais d'écart sont ceux de `tests/ecology`, et l'écart n'est pas une
lenteur à corriger : ils font croître de vrais peuplements sur quarante ans
pour les comparer aux tables de production. Quatre fichiers à eux seuls font
42 % de l'heure.

Chaque contrôle se lance aussi tout seul — `npm test`, `npm run typecheck`,
`npm run lint`, `npm run check:boundaries` (le moteur reste pur : pas de DOM,
pas de `Math.random`), `npm run check:realisme`.

Le moteur vit dans `src/engine/` et n'importe jamais rien de l'UI — c'est vérifié en CI.

Après le clone : `git config core.hooksPath .githooks` — le hook pre-push
rejoue toute la vérification (`npm run verif`) avant chaque push. C'est là que
l'heure se paie, et c'est le bon endroit : elle se paie une fois par push, pas
une fois par idée.
