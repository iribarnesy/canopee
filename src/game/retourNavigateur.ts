/**
 * Le bouton RETOUR du navigateur remonte d'un cran, au lieu d'éjecter (#148).
 *
 * L'application n'écrivait rien dans l'historique : lancer une partie ne créait
 * aucune entrée, et le réflexe « retour = un écran en arrière » — que tout le
 * monde a — quittait la page entière, en pleine partie. C'est comme ça que des
 * paramètres d'une partie en cours se sont perdus.
 *
 * Le principe tient en deux mouvements, symétriques :
 *
 *  - la partie qui COMMENCE pousse une entrée d'historique. Le retour, en
 *    partie, consomme cette entrée et emprunte la même porte que le bouton
 *    « Sauvegarder et quitter » (`useGame.quit`) — l'écran titre revient sans
 *    que la page se décharge, et la sauvegarde a son délai de grâce ;
 *  - la partie qui FINIT PAR LE BOUTON consomme l'entrée elle-même
 *    (`history.back()`, marqué pour que son `popstate` ne re-quitte rien).
 *    Sans ce ménage, le retour suivant, depuis l'écran titre, aurait « mangé »
 *    une entrée fantôme au lieu de quitter le site.
 *
 * Depuis l'écran titre, le retour garde donc son sens de toujours : on quitte
 * le site. Et une entrée « partie » retrouvée au chargement — un rechargement
 * en pleine partie l'a laissée là — est neutralisée sur place : elle ne
 * correspond plus à rien.
 *
 * L'écouteur `popstate` est posé une fois, et lit l'état courant à travers des
 * refs : le poser/déposer au fil des rendus perdrait des événements, et une
 * fermeture sur un rendu passé quitterait avec un `quit` périmé.
 */

import { useEffect, useRef } from "react";

/** Ce que l'entrée d'historique d'une partie porte, pour se reconnaître. */
const ENTREE_PARTIE = { ecran: "partie" } as const;

function estEntreePartie(state: unknown): boolean {
  return (
    typeof state === "object" &&
    state !== null &&
    (state as { ecran?: unknown }).ecran === ENTREE_PARTIE.ecran
  );
}

export function useRetourNavigateur(enPartie: boolean, quitter: () => void): void {
  const enPartieRef = useRef(enPartie);
  const quitterRef = useRef(quitter);
  enPartieRef.current = enPartie;
  quitterRef.current = quitter;
  /** L'entrée « partie » est-elle au sommet de l'historique ? */
  const entreePosee = useRef(false);
  /** Un `history.back()` demandé par le hook : son `popstate` est du ménage. */
  const popAttendu = useRef(false);

  useEffect(() => {
    // Une entrée « partie » qui survit à un rechargement ne correspond plus à
    // rien — la page revient sur l'écran titre. On la banalise plutôt que de
    // la dépiler : un `back()` au chargement est une navigation visible.
    if (estEntreePartie(history.state)) history.replaceState(null, "");

    const surRetour = () => {
      if (popAttendu.current) {
        popAttendu.current = false;
        return;
      }
      if (enPartieRef.current) {
        // Le navigateur vient de dépiler l'entrée de la partie : on suit.
        entreePosee.current = false;
        quitterRef.current();
        return;
      }
      // Hors partie, le bouton AVANT peut remettre une entrée « partie »
      // orpheline sous les pieds : on la banalise aussi, pour que le retour
      // suivant quitte le site au lieu de faire un tour à vide.
      if (estEntreePartie(history.state)) history.replaceState(null, "");
    };
    window.addEventListener("popstate", surRetour);
    return () => window.removeEventListener("popstate", surRetour);
  }, []);

  useEffect(() => {
    if (enPartie && !entreePosee.current) {
      history.pushState(ENTREE_PARTIE, "");
      entreePosee.current = true;
    } else if (!enPartie && entreePosee.current) {
      entreePosee.current = false;
      popAttendu.current = true;
      history.back();
    }
  }, [enPartie]);
}
