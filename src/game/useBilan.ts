/**
 * LA PÉRIODE DU BILAN (#128, §6.8 №2) : jusqu'où remonte « ce qui a changé ».
 *
 * ## La période, c'est « depuis que le temps s'est remis à couler »
 *
 * Le §6.8 fixe la durée de vie des marqueurs — *« ils s'accumulent tant qu'on
 * avance vite, et ne s'effacent qu'à la pause (ou par un clic "vu") »* — et le
 * bilan prend exactement la même. C'est ce qui permet de le lire à côté d'eux :
 * une ligne du bilan désigne des marqueurs encore affichés, et cliquer dessus
 * emmène la caméra là où ils sont.
 *
 * Concrètement : l'horloge repart → on oublie et on recommence ; l'horloge
 * s'arrête → on GÈLE, parce que c'est là qu'on lit. Geler plutôt qu'effacer
 * n'est pas un détail : effacer à la pause viderait le panneau à la seconde
 * exacte où le joueur s'arrête pour le consulter.
 *
 * ## Ce que ce module ne fait PAS, et pourquoi
 *
 * **Il n'accumule rien.** Le pli est dans `useGame`, dans le gestionnaire de
 * messages du worker, et il a fallu une mesure pour l'y mettre : replier
 * l'instantané que React garde en ÉTAT perdait soixante-dix pour cent des
 * instantanés (115 reçus, 35 repliés sur douze ans à ×52). Ici on ne décide que
 * d'une chose — quand refermer la période — parce que c'est la seule qui
 * regarde l'écran et non la simulation.
 */

import { useEffect, useMemo, useRef } from "react";
import { type LigneLue, lignesDuBilan } from "./bilan";
import type { GameApi } from "./useGame";

export interface BilanDuJeu {
  /** les lignes de la période, triées, prêtes à lire */
  lignes: readonly LigneLue[];
  /** la semaine où la période a commencé */
  depuis: number;
}

export function useBilan(
  bilan: GameApi["bilan"],
  /** l'horloge coule-t-elle ? */
  enMarche: boolean,
): BilanDuJeu {
  const marchait = useRef(enMarche);
  const oublier = bilan.oublier;

  useEffect(() => {
    // La REPRISE de l'horloge ouvre une période neuve. Pas l'arrêt : c'est à
    // l'arrêt qu'on lit.
    if (enMarche && !marchait.current) oublier();
    marchait.current = enMarche;
  }, [enMarche, oublier]);

  // Le tri et les phrases une fois par bilan, et pas une fois par image : le
  // panneau se redessine à chaque survol de la parcelle.
  const lignes = useMemo(() => lignesDuBilan(bilan.lignes), [bilan.lignes]);

  return { lignes, depuis: bilan.depuis };
}
