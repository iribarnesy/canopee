/**
 * **L'aide de la caméra** (#510) : une ligne posée sur la vue à l'arrivée sur
 * la parcelle, qui s'efface au premier glissement, zoom ou quart de tour.
 *
 * Les commandes n'étaient écrites que dans le volet « La partie », qu'on n'a
 * aucune raison d'ouvrir pour regarder sa parcelle. Or à l'échelle d'ensemble
 * un pommier de neuf ans fait quelques pixels : il faut zoomer pour voir son
 * verger, et rien ne disait comment.
 *
 * **Elle part au premier geste, et non au bout d'un délai** : un joueur qui
 * lit d'abord l'objectif du niveau la manquerait, et un joueur qui sait déjà
 * piloter la vue la chasse d'un cran de molette. Elle ne prend aucun clic —
 * elle est posée sur la parcelle, et cliquer la parcelle est le geste qu'on
 * est en train de faire.
 */

import { useState } from "react";
import { VOLET } from "./styles";

/**
 * Les trois commandes de la caméra, dans les mots que lit le joueur.
 *
 * Une seule phrase pour l'aide et pour le volet « La partie » : deux libellés
 * tenus à part finiraient par dire deux choses.
 */
export const COMMANDES_DE_LA_CAMERA =
  "Glisser pour déplacer · molette pour zoomer · ← → pour tourner";

/** Durée du fondu, en millisecondes : assez pour qu'on voie qu'elle s'en va. */
const FONDU_MS = 700;

export function AideCamera({ estompee }: { estompee: boolean }) {
  // Retirée du DOM une fois le fondu fini : une ligne invisible n'a rien à
  // faire sur la vue, même sans prendre de clic.
  const [partie, setPartie] = useState(false);
  if (partie) return null;
  return (
    <div
      data-aide-camera=""
      aria-hidden={estompee}
      onTransitionEnd={() => {
        if (estompee) setPartie(true);
      }}
      style={{
        ...VOLET,
        // Au milieu de la rangée du bas, entre les boutons des deux coins : les
        // volets s'y déplient **au-dessus** de leurs boutons, donc aucun ne
        // vient la couvrir — posée plus haut, le choix des essences la mangeait
        // à moitié sur un écran de 1280.
        left: "50%",
        bottom: 12,
        transform: "translateX(-50%)",
        maxWidth: "calc(100% - 24px)",
        padding: "4px 14px",
        borderRadius: 999,
        fontSize: 13,
        textAlign: "center",
        color: "var(--encre)",
        pointerEvents: "none",
        opacity: estompee ? 0 : 1,
        transition: `opacity ${FONDU_MS}ms ease`,
      }}
    >
      {COMMANDES_DE_LA_CAMERA}
    </div>
  );
}
