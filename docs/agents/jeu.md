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

## L'état des lieux, au 25 novembre 2026

*Relevé par l'état des lieux du jeu du 25 novembre 2026 (base `main` à
`39aec6f`), qui a joué le niveau livré et le bac à sable dans le navigateur. La
version précédente de ce paragraphe disait que le jeu n'existait pas, que
l'accueil était un banc d'essai et que la couche visuelle n'était pas branchée :
c'était vrai en septembre, ça ne l'est plus depuis octobre.*

**Il y a un niveau jouable (#188).** `src/game/niveaux.ts` est le mécanisme : un
niveau est une **fiche** — un énoncé, des paliers qui lisent l'instantané et les
cumuls de gestes rapportés, un temps imparti, la faillite, la mémoire des
paliers acquis — et un seul code les joue toutes. `niveauxLivres.ts` en livre
un, « Le verger » : douze pommiers en terre, à l'abri du gibier, puis deux cents
kilos de pommes, en vingt ans. `useNiveau.ts` le suit pendant la partie,
`panneaux/PanneauNiveau.tsx` annonce les paliers avec une aide sous le palier
courant, et `panneaux/FinDeNiveau.tsx` dit si l'objectif est atteint et ce qui
s'est passé. Le niveau se joue de bout en bout et se gagne. Ce qui manque : les
trois autres niveaux, l'enchaînement de l'un à l'autre, et des gestes limités à
ce que le niveau enseigne (les décisions du propriétaire du 25 novembre sont
dans `v1.md`).

**L'accueil n'est plus un banc d'essai (#189).** Les niveaux sont la porte. Les
quatorze réglages — station, graine, scénario climatique, entourage des quatre
bordures, relief, eau, nappe, bassin, vieillissement, année, économie — sont
passés derrière « Régler une partie », dans la carte « Bac à sable » : le mode
à part que `v1.md` demande, intact, avec ses huit stations, son éditeur de
terrain et ses profils de départ exportables. Un niveau pose ces réglages
lui-même (`lancerLeNiveau`, `GameView.tsx`).

**La couche visuelle est branchée.** `VueParcelle.tsx` monte `SceneParcelle`,
la scène PixiJS de `src/render`, en isométrique dimétrique, en fond d'écran ;
tout le reste se pose par-dessus. Le canvas oblique de `GameView` n'existe plus ;
`src/apercu` reste le harnais de revue de `src/render`.

**Le bac à sable reste mûr.** Une vingtaine de gestes jouables — planter,
couper, récolter, éclaircir, élaguer, recéper, étêter, trogner, lever l'écorce,
chauler, labourer, épandre du BRF, faucher, clôturer, chasser, protéger,
ramasser le bois mort, embaucher —, un journal d'événements, des avis qui
mettent le temps en pause, la fiche et l'histoire d'un arbre suivi avec la
cause de sa mort, une carte du sol en calques, une économie qui peut refuser une
action et mener à la faillite. La sauvegarde garde huit parties dans
`localStorage` (autosave toutes les 30 s) et leur bloc de reprise dans IndexedDB
(`blocs.ts`, #338) ; sans bloc, la partie se rejoue depuis son journal.

**Ce qui manque pour qu'un joueur apprenne seul**, d'après le même relevé : le
coût d'un geste avant le clic (seuls planter, le manchon et l'embauche le
disent), un sol qui s'appauvrit et qui se voit avant l'irréversible, des plants
qu'on voit à l'échelle de la parcelle, des commandes de caméra hors du menu. La
liste des lots de la v0.6 est dans [`README.md`](README.md), « Où en est le
projet ».

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
