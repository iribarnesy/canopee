# Agent du jeu

Lire d'abord [`README.md`](README.md) — assignation, labels, règles communes —
puis [`../v1.md`](../v1.md), qui dit ce que la version en cours doit contenir et
ce qu'elle doit refuser.

## Périmètre

**Tout ce qui n'est pas `src/engine`** : `src/game` (niveaux, objectifs,
progression, HUD, écrans), `src/ui`, `src/render` (la couche visuelle).

Ce rôle couvrait au départ le seul rendu. Il a été élargi pour une raison
pratique : les niveaux, l'interface et le dessin se rejoignent tous dans
`GameView.tsx`, et deux agents qui y travaillent en même temps se marchent
dessus. Le projet a déjà payé ce prix — quatre lots écrits deux fois.

La frontière avec le moteur, elle, reste stricte : `scripts/check-boundaries.sh`
vérifie à chaque CI que `src/engine` ne connaît ni React, ni le DOM, ni `src/ui`.

## L'état des lieux, au moment où cette note est écrite

**Le bac à sable est mûr.** `GameView.tsx` porte une vingtaine de gestes
jouables — planter, couper, récolter, éclaircir, élaguer, recéper, étêter,
trogner, chauler, labourer, épandre du BRF, faucher, clôturer, chasser,
protéger, ramasser le bois mort, embaucher — un HUD, un journal d'événements, la
sauvegarde (`localStorage`, autosave 30 s) et une économie qui peut refuser une
action et mener à la faillite. Six stations, un éditeur de terrain, des profils
de départ exportables.

**Le jeu, lui, n'existe pas.** Cherchés dans tout `src/` : *objectif*, *niveau*,
*tutoriel*, *score*, *victoire*, *fin de partie*, *progression* — zéro
occurrence. Le `§13` de `regles.md` prévoit cinq scénarios avec objectifs ;
aucun n'est implémenté.

**L'écran de démarrage est un banc d'essai.** Quatorze réglages : station,
graine du hasard, scénario climatique, entourage des quatre bordures, relief,
eau de surface, nappe, part du bassin, années de vieillissement, année de
départ, économie. Excellent pour un chercheur, infranchissable pour un joueur.
Il ne disparaît pas — il devient un mode à part (voir `v1.md`).

**La couche visuelle n'est pas branchée.** `src/render` — caméra, lumière,
palette, ombres, décor, tapis, terrain, eau — n'est importé que par
`src/apercu/apercu.ts`, un harnais de revue. Le jeu tourne encore sur le canvas
oblique écrit dans `GameView`, dont le commentaire annonce lui-même que
« l'isométrique complète viendra comme couche visuelle ».

## La règle qui évite les pires bugs

**Ne jamais recalculer une règle du moteur dans le jeu.** Si une grandeur manque
pour dessiner ou pour évaluer un objectif, elle se demande — issue avec le label
`rendu` — elle ne se reconstitue pas.

Ça s'est mal passé une fois et ça valait la leçon : faute que le moteur donne
les identités des arbres torchés, le rendu les reconnaissait en comparant
`brulEeSemaine` à la fenêtre du journal. Ça marchait, sauf qu'un arbre brûlé
lors d'un incendie *précédent* garde son `brulEeSemaine` — la jointure était
fausse dans un cas que personne n'aurait cherché.

Autre exemple, dans l'autre sens : `SnapshotTree.diametreCm` voyage parce qu'il
**ne se déduit pas** de la hauteur — deux tiges de vingt mètres n'ont pas la
même grosseur selon qu'elles ont poussé serrées ou au large. Le déduire d'une
formule dans le rendu dessinerait des perches en sujets de plein vent.

Cette règle vaut doublement pour les objectifs de niveau : « a-t-il récolté une
tonne de pommes » se lit dans l'état que le moteur expose, jamais d'une
estimation refaite à côté.

## Comment demander quelque chose au moteur

Ouvrir une issue avec le label `rendu`, et dire **ce qu'on cherche à obtenir**
avant de dire quelle donnée on veut. Les meilleures issues du dépôt sont de
cette forme : elles expliquent la mise en scène ou la règle visée, montrent le
contournement en place et pourquoi il est fragile, puis proposent une ou deux
formes possibles en laissant le moteur trancher.

Le moteur a déjà répondu à plusieurs demandes de ce genre — rang du front
d'incendie, charge de combustible par cellule, base du houppier, identités des
arbres torchés. Ça marche.

## Ce que le moteur expose aujourd'hui

Le contrat est dans `src/game/protocol.ts`, commenté champ par champ avec la
raison de chaque voyage. Le lire plutôt que ce paragraphe, qui vieillira.

Deux structures à connaître : `Snapshot` (l'état à une semaine, dont
`SnapshotTree[]`) et les événements de `TickResult` — notamment
`IncendieResult`, qui porte les cellules brûlées **rangées par rang d'arrivée du
front**, de quoi faire courir une ligne de flammes plutôt que de noircir une
tache d'un coup.

## Vérifier son travail

Le dépôt tourne sur Vite (`npm run dev`, port 5173, `.claude/launch.json`).
Vérifier dans le navigateur soi-même plutôt que de demander à l'utilisateur de
regarder : ouvrir l'aperçu, recharger, lire la console et le DOM, prendre une
capture pour montrer le résultat.

Et pour ce rôle plus que pour les autres : **une capture vaut une description.**
Ce qui se juge ici, c'est si c'est agréable — un critère qu'aucun test
automatisé ne rend.
