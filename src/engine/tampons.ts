/**
 * Les tableaux de travail d'un tick, prêtés au lieu d'être recréés.
 *
 * POURQUOI. `tick` allouait une trentaine de tableaux de `nCells` À CHAQUE
 * SEMAINE SIMULÉE. Sur une parcelle de 40 m (1 600 cellules) et quarante ans,
 * ça fait des dizaines de millions de cases allouées puis jetées, et le profil
 * CPU le montrait sans ambiguïté : 13,8 % du temps passé dans le ramasse-
 * miettes, deuxième poste derrière `tick` lui-même. Ce n'est pas un coût de
 * calcul, c'est un coût de gaspillage.
 *
 * CE QUE ÇA NE CHANGE PAS : les valeurs, et surtout leur ORDRE. Un tampon
 * rendu par `tampon()` est intégralement réécrit par `fill()` avant d'être
 * lu, donc chaque semaine part exactement du même état qu'avant. L'addition
 * flottante n'étant pas associative, c'est la seule chose qui compte ici.
 *
 * `Float64Array` plutôt que `Array<number>` : mêmes doubles IEEE, donc même
 * arithmétique au bit près, mais une zone contiguë sans boîtage. Les trente
 * tableaux repris n'utilisent que l'indexation et `.length` — vérifié un par
 * un, aucun n'appelle `map`, `reduce`, `push` ni n'est étalé.
 *
 * ## Ce qu'on NE prête pas, et pourquoi c'est la question qui compte
 *
 * UN TAMPON QUI S'ÉCHAPPE DU TICK CORROMPRAIT LA SEMAINE PRÉCÉDENTE : l'état
 * retourné garderait une référence que le tick suivant réécrirait sous lui.
 * Les tableaux qui sortent — `eauCellule`, `excesCellule`, `ph`,
 * `couvertArbore` — restent donc alloués à neuf, et doivent le rester.
 *
 * Avant d'ajouter un tampon ici, vérifier que le tableau ne sort pas : ni dans
 * l'objet retourné, ni dans `soil`, ni confié à quoi que ce soit qui survit au
 * tick. `tampons.test.ts` tient ce garde-fou en faisant tourner deux parties
 * EN ALTERNANCE, tick par tick : si un tampon fuyait, les deux se
 * contamineraient et cesseraient d'égaler leurs parties jouées séparément.
 *
 * ## L'autre piège, qui a failli passer
 *
 * `new Array<number>(n)` SANS `.fill()` donne des TROUS, que le code lit en
 * `?? 0`. Un tampon prêté rendrait la valeur de la semaine d'avant, et le
 * `?? 0` ne rattraperait rien — pas d'erreur, pas de type cassé, juste un
 * résultat faux. Aucun de ces tableaux-là n'est prêté.
 */

/**
 * Les tampons vivants, par clé. La clé est le nom de la variable dans `tick`,
 * qui y est unique.
 *
 * C'est un état de module, ce que `src/engine` évite partout ailleurs. Il est
 * tolérable ici parce qu'un tampon est écrit et lu DANS le même tick, jamais à
 * cheval : deux parties menées en alternance ne peuvent pas se gêner, et
 * l'essai de garde-fou le vérifie plutôt que de l'affirmer.
 */
const tampons = new Map<string, Float64Array>();

/**
 * Un tableau de `taille` cases, toutes à `valeur`.
 *
 * Le tampon est réalloué si la taille demandée change — une partie sur une
 * autre parcelle, typiquement. Le `fill` est fait ici, systématiquement : c'est
 * lui qui garantit qu'un tampon prêté ne porte rien de la semaine d'avant.
 */
export function tampon(cle: string, taille: number, valeur: number): Float64Array {
  let t = tampons.get(cle);
  if (t === undefined || t.length !== taille) {
    t = new Float64Array(taille);
    tampons.set(cle, t);
  }
  t.fill(valeur);
  return t;
}

/** Rend la mémoire des tampons. Sert aux essais, pas au jeu. */
export function oublierLesTampons(): void {
  tampons.clear();
}
