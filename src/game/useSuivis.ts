/**
 * **Le suivi d'arbres**, côté React : qui l'on suit, et ce qui leur est arrivé (#149).
 *
 * **Le journal n'est plus tenu ici** (#225). Il l'était, et il perdait : à ×52
 * un instantané couvre une demi-année et React n'en rend qu'un tiers — 35
 * repliés sur 115 reçus, mesuré —, si bien que l'accumulation manquait les deux
 * tiers de ce qui arrive aux arbres, précisément à la vitesse où le joueur ne
 * regarde pas. Elle ne survivait pas non plus au chargement d'une sauvegarde,
 * que le worker rejoue tout seul.
 *
 * Le worker tient donc l'histoire de **tous** les arbres depuis le début de la
 * partie, et l'écran la **demande**. Ce qui reste ici est ce que seul React peut
 * faire : garder l'ensemble suivi, le faire descendre au worker — qui seul sait
 * arrêter le temps à la semaine exacte d'une mort —, compter ce qui est arrivé
 * depuis la dernière lecture, et aller cadrer sur un suivi qui meurt.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Snapshot } from "./protocol";
import { type LigneDeSuivi, suivisMorts } from "./suivis";

/** Ce que le hook demande au jeu : la frontière du worker, et rien d'autre. */
export interface JeuPourSuivis {
  /** dire au worker qui l'on suit (leur mort arrête le temps) */
  suivre: (ids: ReadonlySet<number>) => void;
  /** l'histoire reçue, par arbre */
  histoires: ReadonlyMap<number, readonly LigneDeSuivi[]>;
  /** en demander une, ou la remettre à jour */
  demanderLHistoire: (id: number) => void;
  /** combien d'événements ont touché les suivis depuis le début de la partie */
  suivisRecus: number;
}

export interface SuivisDuJeu {
  /** les identifiants suivis */
  suivis: ReadonlySet<number>;
  /**
   * L'histoire de chaque arbre, du plus **ancien** au plus récent.
   *
   * Elle vient du worker et couvre toute la partie, y compris ce qui est arrivé
   * **avant** qu'on suive l'arbre : c'est la demande de #225 — *« cliquer sur un
   * arbre au pif et regarder tout son historique »*. Un arbre absent de la table
   * est un arbre dont la réponse n'est pas encore arrivée.
   */
  histoires: ReadonlyMap<number, readonly LigneDeSuivi[]>;
  /**
   * Suivre ou ne plus suivre, d'un seul geste, pour toute une sélection.
   * Tout le lot est déjà suivi → on le lâche ; sinon on prend le reste.
   */
  basculer: (ids: Iterable<number>) => void;
  /** Ne plus suivre cet arbre-là : il quitte la liste. */
  oublier: (id: number) => void;
  /**
   * Combien d'événements sont arrivés depuis qu'on a lu le volet.
   *
   * **Une notification et pas une pause**, ce que l'issue demande nommément :
   * un franchissement de stade ou un brout n'arrête pas le temps, sinon on ne
   * joue plus. Le chiffre sur le bouton suffit à dire qu'il s'est passé
   * quelque chose, et c'est le joueur qui décide d'aller voir.
   */
  nouveautes: number;
  /** Le compte total, qui ne recule pas : de quoi savoir qu'il vient d'arriver quelque chose. */
  recus: number;
  /** « J'ai lu » : le volet s'ouvre, le compte repart de zéro. */
  marquerLu: () => void;
  /**
   * Où cadrer la vue, quand un suivi vient de mourir (#149).
   *
   * C'est le pendant visuel de l'autopause du worker : le temps s'arrête, et
   * la vue va voir. Rien tant qu'aucun suivi ne meurt — le cadrage de
   * l'incendie garde alors la main.
   */
  cadrerSur?: { x: number; y: number };
}

export function useSuivis(
  snapshot: Snapshot | undefined,
  jeu: JeuPourSuivis,
  /**
   * Une relecture est-elle en cours (#128) ? Alors on ne va cadrer nulle part.
   *
   * Le worker ne ré-écrit pas les histoires pendant une relecture — ce qui est
   * rejoué a déjà été vécu une fois —, mais il **repasse** les morts dans ses
   * instantanés : sans ce garde-fou, la caméra irait se poser sur un arbre mort
   * il y a cinq ans.
   */
  enRelecture = false,
): SuivisDuJeu {
  const { suivre, histoires, demanderLHistoire, suivisRecus } = jeu;
  const [suivis, setSuivis] = useState<ReadonlySet<number>>(new Set());
  const [cadrerSur, setCadrerSur] = useState<{ x: number; y: number }>();
  /** Le compte au moment où l'on a lu : la différence fait les nouveautés. */
  const [lu, setLu] = useState(0);
  const dernierLu = useRef<Snapshot>(undefined);
  /**
   * L'ensemble suivi, lisible depuis l'effet sans en être une dépendance.
   * Sans ça, suivre un arbre relirait l'instantané courant.
   */
  const ensemble = useRef<ReadonlySet<number>>(suivis);
  /** Les histoires déjà demandées, pour ne pas les redemander à chaque rendu. */
  const demandees = useRef<Set<number>>(new Set());

  // **Suivre un arbre, c'est lire son passé.** La demande part dès qu'il entre
  // dans la liste — y compris pour une chandelle dont la mort est vieille de
  // quatre ans, qui est le cas de #225.
  useEffect(() => {
    for (const id of suivis) {
      if (demandees.current.has(id)) continue;
      demandees.current.add(id);
      demanderLHistoire(id);
    }
  }, [suivis, demanderLHistoire]);

  useEffect(() => {
    if (!snapshot || snapshot === dernierLu.current) return;
    dernierLu.current = snapshot;
    if (enRelecture) return;
    const morts = suivisMorts(snapshot, ensemble.current);
    const premier = morts[0];
    // Le centre de la cellule, comme partout ailleurs : viser le coin
    // décalerait le cadrage d'un demi-mètre.
    if (premier) setCadrerSur({ x: premier.x + 0.5, y: premier.y + 0.5 });
  }, [snapshot, enRelecture]);

  const changer = useCallback(
    (suite: ReadonlySet<number>) => {
      ensemble.current = suite;
      setSuivis(suite);
      suivre(suite);
    },
    [suivre],
  );

  const basculer = useCallback(
    (ids: Iterable<number>) => {
      const lot = [...ids];
      if (lot.length === 0) return;
      const suite = new Set(ensemble.current);
      if (lot.every((id) => suite.has(id))) for (const id of lot) suite.delete(id);
      else for (const id of lot) suite.add(id);
      changer(suite);
    },
    [changer],
  );

  const oublier = useCallback(
    (id: number) => {
      const suite = new Set(ensemble.current);
      suite.delete(id);
      changer(suite);
      // On le redemandera s'il revient : son histoire, elle, ne s'efface pas —
      // c'est celle du worker, et elle a survécu à sa mort, elle survivra bien
      // à un désabonnement.
      demandees.current.delete(id);
    },
    [changer],
  );

  const marquerLu = useCallback(() => setLu(suivisRecus), [suivisRecus]);

  return {
    suivis,
    histoires,
    basculer,
    oublier,
    // Une partie neuve remet le compte du jeu à zéro sans passer par ici : le
    // plancher évite un nombre négatif sur le bouton.
    nouveautes: Math.max(0, suivisRecus - lu),
    recus: suivisRecus,
    marquerLu,
    ...(cadrerSur ? { cadrerSur } : {}),
  };
}
