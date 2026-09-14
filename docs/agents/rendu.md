# Agent de rendu

Lire d'abord [`README.md`](README.md) — assignation, labels, règles communes.

## Périmètre

`src/ui`, `src/render`, et la traduction `src/game/snapshot.ts`. **Jamais
`src/engine`** : `scripts/check-boundaries.sh` le vérifie à chaque CI, et c'est
volontaire — le moteur doit rester pur, testable et indépendant de l'affichage.

Documents de référence : [`../attentes-du-rendu.md`](../attentes-du-rendu.md) et
[`../interface-visuelle.md`](../interface-visuelle.md).

## La règle qui évite les pires bugs

**Ne jamais recalculer une règle du moteur dans le rendu.** Si une grandeur
manque pour dessiner, elle se demande — issue avec le label `rendu` — elle ne se
reconstitue pas.

Ça s'est mal passé une fois et ça valait la leçon : faute que le moteur donne
les identités des arbres torchés, le rendu les reconnaissait en comparant
`brulEeSemaine` à la fenêtre du journal. Ça marchait, sauf qu'un arbre brûlé
lors d'un incendie *précédent* garde son `brulEeSemaine` — la jointure était
fausse dans un cas que personne n'aurait cherché. Le moteur expose maintenant
les identités.

Autre exemple, dans l'autre sens : `SnapshotTree.diametreCm` voyage désormais
parce qu'il **ne se déduit pas** de la hauteur — deux tiges de vingt mètres
n'ont pas la même grosseur selon qu'elles ont poussé serrées ou au large. Le
déduire d'une formule dans le rendu dessinerait des perches en sujets de plein
vent.

## Comment demander quelque chose au moteur

Ouvrir une issue avec le label `rendu`, et dire **ce qu'on cherche à dessiner**
avant de dire quelle donnée on veut. Les meilleures issues du dépôt sont de
cette forme : elles expliquent la mise en scène visée, montrent le contournement
en place et pourquoi il est fragile, puis proposent une ou deux formes possibles
en laissant le moteur trancher.

Le moteur a déjà répondu à plusieurs demandes de ce genre — rang du front
d'incendie, charge de combustible par cellule, base du houppier, identités des
arbres torchés. Ça marche.

## Ce que le moteur expose aujourd'hui

Le contrat est dans `src/game/protocol.ts` et il est commenté champ par champ,
avec la raison de chaque voyage. Le lire plutôt que ce paragraphe, qui vieillira.

Deux structures à connaître : `Snapshot` (l'état à une semaine, dont
`SnapshotTree[]`) et les événements de `TickResult` — notamment `IncendieResult`,
qui porte les cellules brûlées **rangées par rang d'arrivée du front**, de quoi
faire courir une ligne de flammes plutôt que de noircir une tache d'un coup.

## Vérifier son travail

Le dépôt tourne sur Vite. Vérifier dans le navigateur plutôt que de demander à
l'utilisateur de regarder : ouvrir l'aperçu, recharger, lire la console et le
DOM, prendre une capture pour montrer le résultat.
