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
 * - il tue les **fleurs ouvertes**, quand la nuit passe sous le seuil de
 *   l'essence (`fruits.gelFatalC`) — et la récolte de l'année part avec ;
 * - il grille les **jeunes pousses** qui viennent de sortir (#371, #420) : l'arbre
 *   reste nu quelques semaines, puis refeuille (`gelPousses.ts`). L'avis nomme
 *   les arbres que ce gel-ci a touchés, d'après `gelPousseSemaine` (#425) ;
 * - **sous le couvert, la nuit est moins froide** (`tMinimumSousCouvert`) ;
 * - hors de ces deux moments, il ne fait rien aux arbres.
 *
 * L'avis disait que le gel « ne détruit que les fleurs ouvertes » : c'était vrai
 * du moteur jusqu'à #420, et il ne l'inventait pas. Il suit maintenant.
 *
 * Il ne revient pas chaque semaine d'un épisode : une fois au début, jusqu'à ce
 * qu'on le ferme ou que le gel cesse.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { REFEUILLAISON_ATTENTE_SEMAINES, REFEUILLAISON_DUREE_SEMAINES } from "../engine/gelPousses";
import { nomEspeces, s } from "./mots";

export interface AvisDuGel {
  texte: string;
  fermer: () => void;
}

/**
 * **Une température de gelée, dite** (#406) : « −6 °C », et au dixième sous un
 * degré — « −0,4 °C ».
 *
 * L'arrondi à l'entier disait « -0 °C » d'une nuit à −0,1 °C : un zéro signé,
 * avec le trait d'union du clavier. Sous un degré, l'entier ne dit plus rien
 * d'une gelée, le dixième si. Un dixième qui s'arrondit à zéro se dit « 0 °C »,
 * sans signe. Le vrai signe moins partout, et la virgule française.
 */
export function degresDuGel(tC: number): string {
  const dixieme = Math.round(tC * 10) / 10;
  const texte =
    Math.abs(dixieme) >= 1
      ? String(Math.round(tC))
      : dixieme === 0
        ? "0"
        : dixieme.toFixed(1).replace(".", ",");
  return `${texte.replace("-", "−")} °C`;
}

/**
 * Les arbres dont ce gel a grillé les jeunes pousses, par essence, les plus
 * nombreuses d'abord : « 2 frênes, 1 chêne pubescent ».
 */
function essencesTouchees(especeIds: readonly string[]): string {
  const parEspece = new Map<string, number>();
  for (const id of especeIds) parEspece.set(id, (parEspece.get(id) ?? 0) + 1);
  return [...parEspece]
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => `${n} ${nomEspeces(id, n)}`)
    .join(", ");
}

/**
 * La phrase de l'avis, pour la nuit la plus froide de la semaine.
 *
 * `pousses` : les essences des arbres dont **ce** gel a grillé les jeunes pousses
 * (`poussesGeleesALaSemaine`). Vide, la phrase dit ce que le gel peut faire ;
 * remplie, elle dit ce qu'il a fait.
 */
export function phraseDuGel(tMinC: number, pousses: readonly string[] = []): string {
  const n = pousses.length;
  const debut = `Gel : ${degresDuGel(tMinC)} au plus froid de la nuit, l'herbe a blanchi. `;
  const fin =
    "Un arbre en fleur y perd sa récolte de l'année ; sous le couvert, la nuit est moins froide.";
  if (n === 0) {
    return `${debut}Il ne détruit que les fleurs ouvertes et les feuilles à peine sorties. ${fin}`;
  }
  return (
    debut +
    `Les jeunes pousses de ${n} arbre${s(n)} ont grillé (${essencesTouchees(pousses)}) : ` +
    `${n >= 2 ? "ils restent" : "il reste"} nu${s(n)} ${REFEUILLAISON_ATTENTE_SEMAINES} semaines, ` +
    `puis refeuille${n >= 2 ? "nt" : ""} en ${REFEUILLAISON_DUREE_SEMAINES}. ` +
    fin
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
  /** les essences des arbres dont ce gel a grillé les pousses (#425) */
  pousses: readonly string[] = [],
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
  return { texte: phraseDuGel(tMinC, pousses), fermer };
}
