/**
 * **Ramener une semaine sous le plafond** (#133).
 *
 * Le plafond de soixante heures ne refuse plus rien — il se paie (#137). Reste
 * l'autre branche de l'arbitrage : « ou on s'en tient à vos 60 h ». Et là est
 * le point dur que l'issue avait nommé : une action est appliquée **au clic**, et
 * couper un arbre change beaucoup de choses.
 *
 * **On ne défait donc rien : on rejoue la semaine depuis son début avec une
 * liste élaguée.** Ce module ne fait que ça, et il est pur : un état de départ,
 * des actions, et le plus long **préfixe** qui tienne dans le plafond.
 *
 * **Un préfixe, c'est-à-dire l'ordre inverse de saisie** : ce sont les derniers
 * gestes posés qui tombent. C'est la règle que l'issue demandait de choisir et
 * surtout de **dire** — un joueur ne doit pas découvrir ce qu'il a perdu.
 *
 * Le plafond lui-même n'est pas ici : `depassementHoraire` est au moteur, et
 * c'est lui qui sait ce qu'une UTH autorise.
 */

import type { GameAction, GesteVisible } from "../engine/actions";
import { applyAction, depassementHoraire } from "../engine/actions";
import type { GameState } from "../engine/state";

export interface SemaineElaguee {
  /** les actions qu'on garde, dans l'ordre où elles ont été posées */
  gardees: GameAction[];
  /** l'état qui en résulte — celui du début, rejoué avec ces actions-là */
  etat: GameState;
  /** ce que ces actions ont donné à mettre en scène */
  gestes: GesteVisible[];
  /** combien sont tombées */
  annulees: number;
}

export function prefixeSousLePlafond(
  depart: GameState,
  actions: readonly GameAction[],
): SemaineElaguee {
  let etat = depart;
  const gardees: GameAction[] = [];
  const gestes: GesteVisible[] = [];
  for (const action of actions) {
    const resultat = applyAction(etat, action);
    // **On s'arrête au premier dépassement, on ne saute pas par-dessus.** Un
    // élagage qui garderait les actions suivantes parce qu'elles sont moins
    // chères remettrait l'ordre en cause, et le joueur ne saurait plus ce
    // qu'il a perdu — la règle vaut d'être prévisible avant d'être maligne.
    if (depassementHoraire(resultat.state.economy) > 0) break;
    etat = resultat.state;
    gardees.push(action);
    gestes.push(...(resultat.gestes ?? []));
  }
  return { gardees, etat, gestes, annulees: actions.length - gardees.length };
}
