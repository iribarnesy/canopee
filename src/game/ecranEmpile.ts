/**
 * **Un écran empilé, et la porte de sortie qui va avec** (#226, #148).
 *
 * Tout écran qui se superpose à l'accueil — une partie, le bac à sable, et ceux
 * qui viendront — pousse une entrée d'historique, pour que le bouton retour du
 * navigateur remonte d'**un** écran au lieu d'éjecter du site. Cette manœuvre
 * était écrite deux fois, à deux endroits de `GameView`, et elle allait l'être
 * une troisième : *« le recopier à trois endroits serait le meilleur moyen de
 * les faire diverger »*.
 *
 * ── **pourquoi c'est plus compliqué qu'un `preventDefault`** ─────────────────────
 *
 * **`popstate` n'est pas annulable.** Quand l'événement arrive, le navigateur a
 * DÉJÀ reculé : il n'y a rien à empêcher. Le seul motif qui marche est de
 * **repousser aussitôt l'entrée** pour annuler le recul, puis de poser la
 * question ; si le joueur confirme, on sort pour de bon.
 *
 * À savoir, et ce n'est pas un défaut de ce module : un glissement appuyé peut
 * enjamber plusieurs entrées d'un coup, et Safari joue sa propre animation de
 * recul pendant l'opération — la re-poussée peut donc se voir. C'est le prix de
 * la manœuvre, il n'y a pas d'autre porte.
 *
 * ── **le geste qui a motivé tout ça** ────────────────────────────────────────────
 *
 * > *« Étant sur Mac c'est vraiment souvent que je fais retour intempestivement
 * > en scrollant avec deux doigts. »*
 *
 * Ce n'est pas un bouton qu'on presse par erreur une fois par mois : c'est un
 * geste de défilement ordinaire, sur un jeu où l'on fait précisément défiler
 * une parcelle.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Ce qu'un retour du navigateur doit déclencher.
 *
 * **Écrit à part pour être éprouvé** : le reste de ce module est de la plomberie
 * de navigateur — des écouteurs, une pile d'historique — qui ne se vérifie qu'à
 * l'écran. La règle, elle, tient en trois cas, et c'est elle qui coûterait cher
 * si elle se trompait.
 */
export type SuiteDuRetour =
  /** Une sortie est déjà en cours par nos soins : ce retour est le nôtre. */
  | "ignorer"
  /** Rien à défaire sur cet écran : on sort sans rien demander. */
  | "sortir"
  /** Repousser l'entrée que le navigateur vient de consommer, et demander. */
  | "demander";

export function queFaireAuRetour(etat: {
  sortieEnCours: boolean;
  confirmer: boolean;
}): SuiteDuRetour {
  if (etat.sortieEnCours) return "ignorer";
  return etat.confirmer ? "demander" : "sortir";
}

export interface EcranEmpile {
  /**
   * La question est-elle posée ? L'écran la dessine lui-même — le texte dépend
   * de ce qui est en jeu, qui n'est pas le même partout.
   */
  aConfirmer: boolean;
  /** « Non, je continue. » */
  annuler: () => void;
  /** « Oui, je sors. » Consomme l'entrée d'historique, puis sort. */
  confirmer: () => void;
  /**
   * Sortir par un bouton de l'écran, sans question : c'est le joueur qui l'a
   * demandé, on ne lui redemande pas.
   */
  sortir: () => void;
}

export interface OptionsEcranEmpile {
  /** L'écran est-il ouvert ? Rien n'est posé quand il ne l'est pas. */
  actif: boolean;
  /**
   * La marque de l'entrée d'historique — `{ canopee: nom }`.
   *
   * Distincte par écran : c'est elle qui dit, au moment de sortir, si l'entrée
   * qu'on s'apprête à consommer est bien la nôtre.
   */
  nom: string;
  /** Ce qu'on fait quand la sortie a lieu, confirmée ou non. */
  surSortie: () => void;
  /**
   * Le retour doit-il **demander** avant de défaire ce qui est en cours ?
   *
   * Faux quand il n'y a rien à défaire — et il faut le dire, parce qu'une boîte
   * qui demande pour rien apprend à répondre oui sans lire. Le bac à sable est
   * ce cas : ses réglages survivent au retour, il les partage avec l'accueil.
   */
  confirmer?: boolean;
  /**
   * Y a-t-il quelque chose à perdre si l'onglet se ferme **maintenant** ?
   *
   * Arme l'avertissement du navigateur, et lui seul : `beforeunload` n'attend
   * rien d'asynchrone, donc il ne peut pas sauvegarder — il avertit. En partie,
   * ce qui est en jeu est l'écart avec le dernier autosave, trente secondes au
   * pire. **Faux par défaut, et il le faut** : posé en permanence, le navigateur
   * râlerait à chaque fois qu'on quitte le site depuis l'écran titre, où il n'y
   * a rien à perdre.
   */
  aPerdre?: boolean;
}

export function useEcranEmpile(options: OptionsEcranEmpile): EcranEmpile {
  const { actif, nom, confirmer: avecQuestion = false, aPerdre = false } = options;
  const [aConfirmer, setAConfirmer] = useState(false);
  /**
   * La sortie passe par une référence parce que l'appelant la refabrique à
   * chaque rendu : un effet qui en dépendrait pousserait une entrée
   * d'historique **par rendu**.
   */
  const surSortie = useRef(options.surSortie);
  surSortie.current = options.surSortie;
  /**
   * Une sortie est-elle en cours par nos soins ?
   *
   * Sortir par un bouton appelle `history.back()` pour consommer l'entrée — et
   * ce retour-là ne doit pas déclencher une seconde sortie.
   */
  const sortieDemandee = useRef(false);
  const question = useRef(avecQuestion);
  question.current = avecQuestion;

  useEffect(() => {
    if (!actif) return;
    sortieDemandee.current = false;
    history.pushState({ canopee: nom }, "");
    const surRetour = () => {
      switch (
        queFaireAuRetour({ sortieEnCours: sortieDemandee.current, confirmer: question.current })
      ) {
        case "ignorer":
          return;
        case "sortir":
          sortieDemandee.current = true;
          surSortie.current();
          return;
        default:
          // **Repoussée d'abord, question ensuite** : le navigateur a déjà
          // reculé, et sans cette entrée un second retour sortirait vraiment du
          // site.
          history.pushState({ canopee: nom }, "");
          setAConfirmer(true);
      }
    };
    window.addEventListener("popstate", surRetour);
    return () => window.removeEventListener("popstate", surRetour);
  }, [actif, nom]);

  useEffect(() => {
    if (!actif || !aPerdre) return;
    const avertir = (e: BeforeUnloadEvent) => {
      // **Le texte n'est pas choisissable** : les navigateurs imposent le leur
      // depuis des années. On ne peut que déclencher l'avertissement standard ;
      // la phrase en français vit dans la boîte qu'on dessine nous-mêmes.
      e.preventDefault();
    };
    window.addEventListener("beforeunload", avertir);
    return () => window.removeEventListener("beforeunload", avertir);
  }, [actif, aPerdre]);

  const sortir = useCallback(() => {
    sortieDemandee.current = true;
    // Notre entrée, et pas une autre : la consommer sans vérifier ferait
    // remonter d'un écran de trop quand le retour l'a déjà consommée.
    if (window.history.state?.canopee === nom) history.back();
    surSortie.current();
  }, [nom]);

  return {
    aConfirmer,
    annuler: useCallback(() => setAConfirmer(false), []),
    confirmer: useCallback(() => {
      setAConfirmer(false);
      sortir();
    }, [sortir]),
    sortir,
  };
}
