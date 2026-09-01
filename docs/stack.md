# Canopée — Stack technique (proposition)

> v0.1 (2026-09-01), à valider. Principe directeur : le moteur de simulation est l'actif précieux — il doit être pur, testable et indépendant de tout choix d'UI, qu'on pourra remplacer sans le toucher.

## Recommandation

| Brique | Choix | Pourquoi |
|---|---|---|
| Langage | **TypeScript strict** (partout) | Le moteur manipule des dizaines de types d'états ; le typage est notre premier filet. |
| Build / dev | **Vite** | Standard actuel, HMR instantané, zéro config, build statique. |
| Moteur | **TS pur, zéro dépendance DOM** | Une fonction `tick(état, actions, météo) → état`. Tourne dans Node pour les tests et dans un Worker en jeu. |
| Exécution en jeu | **Web Worker** | À vitesse ×512 le moteur calcule beaucoup ; l'UI reste fluide, le moteur envoie des snapshots. |
| Rendu parcelle | **PixiJS v8** (WebGL/WebGPU) | Vue isométrique avec des dizaines de milliers de sprites (10 ha = 100 k cellules) : Canvas 2D ne suivra pas, Three.js est du sur-mesure 3D inutile. Pixi = 2D batché, culling simple, et sait faire la vue « plan » de dessus aussi. |
| UI (HUD, panneaux, menus) | **React 19** + **Zustand** | Tu le pratiques déjà (VL-React) ; les panneaux (fiche arbre, bilan C, marché) sont du formulaire/tableau, le domaine de React. Zustand plutôt que Redux : minuscule et suffisant. |
| Données espèces/stations | **JSON versionnés + schémas Zod** | Chaque fiche espèce/variété/station est un JSON relu par un schéma Zod à la compilation ET au chargement — l'équivalent de tes data contracts : une valeur manquante ou hors bornes casse le build, pas la partie. Champ `sources` obligatoire. |
| Aléa | **PRNG seedé maison (xoshiro128)** | `Math.random` interdit dans `engine/` (règle lint). La seed vit dans la sauvegarde. |
| Tests | **Vitest** + **fast-check** | Vitest = Jest moderne natif Vite. fast-check = property-based testing, taillé pour les invariants de conservation (eau/C/N) du §16 des règles. |
| Lint/format | **Biome** | Un seul outil, rapide, remplace ESLint+Prettier. + une règle d'architecture : `engine/` n'importe jamais depuis `ui/`/`render/`. |
| CI | **GitHub Actions** | typecheck + tests + golden runs sur chaque PR. |
| Déploiement | **GitHub Pages** | Jeu 100 % client, aucun backend. Une URL de démo par push sur main. |
| Sauvegardes | **IndexedDB** + export/import JSON | Local d'abord ; le format de save = (seed, station, scénario SSP, journal d'actions datées) — rejouable, donc compact et debuggable. |

## Arborescence cible

```
canopee/
  data/                  # les "seeds" du jeu : JSON sourcés + schémas Zod
    especes/  varietes/  stations/  meteo/
  src/
    engine/              # moteur pur — AUCUN import DOM/UI (lint)
      soil/  water/  light/  growth/  biotic/  economy/  carbon/
      rng.ts  tick.ts  state.ts
    sim-worker/          # pont Worker <-> UI (messages typés)
    render/              # PixiJS : vue isométrique + vue plan
    ui/                  # React : HUD, panneaux, écrans, réglages
  tests/
    unit/  properties/  ecology/  golden/
  docs/                  # regles.md, stack.md, décisions
```

Un seul package (pas de monorepo pnpm-workspaces pour l'instant) : la frontière moteur/UI est tenue par le lint, on éclatera en packages si le besoin apparaît (ex. CLI de calibration qui rejoue des runs en masse).

## Points de vigilance

- **Le format de save = journal d'actions rejouées** (event sourcing) : élégant et testable, mais chaque changement de règles casse les vieilles saves → prévoir un numéro de version de moteur par save, et assumer la casse pendant le développement.
- **Perf du rendu iso** : objectif 60 fps sur 1 ha, dégradation propre à 10 ha (LOD : sprites simplifiés dézoommé). À prototyper tôt — c'est le seul vrai risque technique.
- **Snapshots Worker → UI** : on n'envoie pas 100 k cellules 60 fois/s ; on envoie des deltas ou un snapshot par tick simulé, l'interpolation visuelle est côté rendu.

## Alternatives écartées (et pourquoi)

- **Svelte** : très bien, mais tu connais React et le bénéfice ne justifie pas d'apprendre un framework en plus du jeu lui-même.
- **Godot / Unity export web** : puissants pour l'iso, mais binaires lourds, pipeline opaque, et notre valeur est dans le moteur écologique custom, pas dans un moteur de jeu générique.
- **Three.js / 3D vraie** : coût énorme (assets, caméra, éclairage) pour un gain de lisibilité discutable — l'iso 2D en donne l'essentiel.
- **Canvas 2D nu** : tiendrait 1 ha, pas 10 ; et on réécrirait à la main ce que Pixi donne (batching, textures, culling).
- **Backend (save serveur, comptes)** : rien ne le justifie ; tout est client, ça simplifie déploiement et vie privée.

## Premier jalon technique (V0 « le sol et l'eau », cf. règles §17)

1. Scaffold Vite + TS strict + Biome + Vitest + CI.
2. `engine/` : état du sol, série météo, bilan hydrique + Hargreaves, cycle N minimal, 5 espèces, croissance Liebig.
3. Tests : conservation de l'eau, déterminisme à seed fixée, premier test écologique (l'aulne survit en sol engorgé, le chêne pubescent non).
4. UI jetable (tableaux React, pas encore de Pixi) pour visualiser les courbes — le rendu iso n'arrive qu'en V0.5/V1.
