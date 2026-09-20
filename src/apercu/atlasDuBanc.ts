/**
 * L'atlas des espèces, vu par le BANC : une recherche qui ne lève pas.
 *
 * **Le banc relit des scènes CUITES, et une scène survit à l'atlas.** Un
 * fichier d'`apercu/scenes/` peut porter une espèce que le catalogue ne
 * connaît plus — renommée, retirée — et `getEspece` LÈVE sur un identifiant
 * inconnu au lieu de rendre `undefined`. Le banc entier tombait alors sur une
 * seule tige périmée, ce qui est le contraire de ce qu'on attend d'un harnais
 * de revue.
 *
 * Le jeu, lui, n'a pas ce problème : ses identifiants viennent du moteur dans
 * la même exécution. C'est pour ça que le repli est ICI et pas partout — un
 * repli posé sur un chemin qui ne peut pas échouer cache les vrais défauts au
 * lieu d'en éviter.
 */

import { ESPECES_V0, type EspeceV0 } from "../engine/especes";

/** L'espèce, ou `undefined` si l'atlas ne la connaît plus. */
export function especeSiConnue(especeId: string): EspeceV0 | undefined {
  return ESPECES_V0.find((e) => e.id === especeId);
}
