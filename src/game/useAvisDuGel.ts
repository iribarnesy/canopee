/**
 * **L'avis « Gel »** : la semaine où une gelée commence, une ligne qui dit ce
 * qu'elle fait (#355).
 *
 * Le premier test humain de la v0.4 l'a demandé deux fois : la parcelle
 * blanchissait sans qu'on sache pourquoi, et le seul mot était « ❄ gel −6 °C »
 * dans la barre du haut. La gelée se dit maintenant comme les autres choses qui
 * arrivent — dans la colonne des avis —, et elle dit **ce que le moteur en
 * fait**, ni plus ni moins :
 *
 * - le gel ne tue que les **fleurs ouvertes**, quand la nuit passe sous le seuil
 *   de l'essence (`fruits.gelFatalC`) — et la récolte de l'année part avec ;
 * - **sous le couvert, la nuit est moins froide** (`tMinimumSousCouvert`) ;
 * - hors floraison, il ne fait rien aux arbres.
 *
 * Ce qu'il ne dit **pas** : que les jeunes pousses gèlent. Le moteur ne le
 * modélise pas, et l'avis ne l'inventera pas.
 *
 * Il ne revient pas chaque semaine d'un épisode : une fois au début, jusqu'à ce
 * qu'on le ferme ou que le gel cesse.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface AvisDuGel {
  texte: string;
  fermer: () => void;
}

/** La phrase de l'avis, pour la nuit la plus froide de la semaine. */
export function phraseDuGel(tMinC: number): string {
  return (
    // Le vrai signe moins, et non le trait d'union du clavier.
    `Gel : ${String(Math.round(tMinC)).replace("-", "−")} °C au plus froid de la nuit, l'herbe a blanchi. ` +
    "Il ne détruit que les fleurs ouvertes — un arbre en fleur y perd sa récolte de l'année ; " +
    "sous le couvert, la nuit est moins froide."
  );
}

/**
 * L'avis à montrer, ou rien.
 *
 * `gele` dit si la semaine affichée a gelé — c'est le givre qui le dit
 * (`useMatin`), la même lecture que le dessin. Un **épisode** commence à la
 * première semaine gelée qui suit une semaine sans gel ; c'est lui qu'on ferme.
 */
export function useAvisDuGel(
  semaine: number | undefined,
  gele: boolean,
  tMinC: number | undefined,
): AvisDuGel | undefined {
  const [debut, setDebut] = useState<number>();
  const [ferme, setFerme] = useState<number>();
  const geleAvant = useRef(false);
  useEffect(() => {
    if (semaine === undefined) return;
    if (gele && !geleAvant.current) setDebut(semaine);
    if (!gele) setDebut(undefined);
    geleAvant.current = gele;
  }, [semaine, gele]);
  const fermer = useCallback(() => setFerme(debut), [debut]);
  if (!gele || debut === undefined || ferme === debut || tMinC === undefined) return undefined;
  return { texte: phraseDuGel(tMinC), fermer };
}
