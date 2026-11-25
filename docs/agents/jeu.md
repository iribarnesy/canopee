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
c'était vrai quand elle a été écrite, et plus depuis l'automne (#188 et #189 sont
fermées depuis le 23 et le 24 septembre 2026).*

**Il y a un niveau jouable (#188).** `src/game/niveaux.ts` est le mécanisme : un
niveau est une **fiche** — un énoncé, des paliers qui lisent l'instantané et les
cumuls de gestes rapportés, un temps imparti, la faillite, la mémoire des
paliers acquis — et un seul code les joue toutes. `niveauxLivres.ts` en livre
un, « Le verger » : douze pommiers en terre, le gibier qui vient les brouter, la
protection, douze de plus sous manchon, les premières pommes, puis deux tonnes
de pommes cueillies à la main, en vingt ans. `useNiveau.ts` le suit pendant la partie,
`panneaux/PanneauNiveau.tsx` annonce les paliers avec une aide sous le palier
courant, et `panneaux/FinDeNiveau.tsx` dit si l'objectif est atteint et ce qui
s'est passé. Le niveau se joue de bout en bout et se gagne.

**Un niveau ne montre que les gestes qu'il enseigne (#507).** La fiche les
déclare (`gestes`), et un palier peut en ouvrir d'autres quand on arrive sur lui
(`Palier.gestes`) : c'est la prise du tour de tutoriel. `gestesOuverts` en tire
ce que montrent le panneau des gestes, le volet de sélection, la case du manchon
et l'avis des fruits mûrs ; une fiche qui ne déclare rien, comme le bac à sable,
les montre tous. Ce qui manque : les trois autres niveaux (les décisions du
propriétaire du 25 novembre sont dans `v1.md`).

**Le verger est le premier niveau-tutoriel (#514).** Ses paliers ouvrent les
gestes un à un : planter d'entrée, protéger quand le gibier a brouté un premier
plant (le bouton sur l'arbre, puis la case du manchon à la plantation), récolter
quand les premières pommes sont mûres. Chaque palier dit en une
phrase ce qu'il apprend (`Palier.apprend`), le panneau du niveau l'annonce sur
le palier courant, et le temps s'arrête quand on en franchit un en cours de
route (`useNiveau.ts`). **La récolte automatique est coupée dans les niveaux**
(`recolteAutoPermise`, `recolteAuto.ts`) : l'écran la coupe quand la partie
devient un niveau, le volet de la partie retire sa case et le volet des arbres
ses pastilles, et « Tout récolter » ne cueille que ce qu'on a semé ; le bac à
sable la garde. Un niveau se gagne donc en cueillant : les deux tonnes du verger
tombent à la septième cueillette, vers l'an 13, sur les trois graines mesurées
(tableau et temps réel en tête de `niveauxLivres.ts`).

**L'accueil n'est plus un banc d'essai (#189).** Les niveaux sont la porte. Les
quatorze réglages — station, graine, scénario climatique, entourage des quatre
bordures, relief, eau, nappe, bassin, vieillissement, année, économie — sont
passés derrière « Régler une partie », dans la carte « Bac à sable » : le mode
à part que `v1.md` demande, intact, avec ses huit stations, son éditeur de
terrain et ses profils de départ exportables. Un niveau pose ces réglages
lui-même (`lancerLeNiveau`, `GameView.tsx`).

**Les niveaux s'enchaînent et se verrouillent dans l'ordre (#506).**
`src/game/progression.ts` retient les niveaux réussis dans le stockage du
navigateur (stockage donné, comme `sauvegardes.ts`) et dit lesquels sont
ouverts : le premier toujours, chacun des suivants une fois le précédent
réussi, dans l'ordre de `NIVEAUX_LIVRES`. `useNiveau.ts` retient la réussite ;
l'écran de fin propose « Niveau suivant » quand l'objectif est atteint et qu'il
en reste un ; l'accueil (`panneaux/ListeDesNiveaux.tsx`) coche les niveaux
faits, met en avant le prochain et grise les niveaux verrouillés en disant quoi
réussir pour les ouvrir. Le bac à sable reste ouvert. Il n'y a pas de
déverrouillage caché.

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

`npm run apercu:jeu` photographie l'écran de jeu sans navigateur visible, en
partant d'un niveau (`NIVEAU="Le verger"`) ou du bac à sable (`STATION`, `ANS`),
au mois voulu (`MOIS`) ; les variables sont en tête de `scripts/capture-jeu.mjs`.
**Dans un conteneur sans carte graphique, comptez cinq à quinze minutes** : la
scène tourne en GL logiciel, à une image par seconde, et un vieillissement de
quarante ans en prend six. Le script dit où il en est et s'arrête de lui-même
au bout de `LIMITE_MIN`.

Et pour ce rôle plus que pour les autres : **une capture vaut une description.**
Ce qui se juge ici, c'est si c'est agréable — un critère qu'aucun test
automatisé ne rend.
