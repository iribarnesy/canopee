/**
 * LE SUIVI D'ARBRES, côté React : qui l'on suit, et ce qui leur est arrivé (#149).
 *
 * Le calcul, lui, est ailleurs et il est pur (`suivis.ts`). Ce fichier ne fait
 * que trois choses que seul React peut faire : garder l'ensemble suivi, le
 * faire descendre au worker — qui seul sait arrêter le temps à la semaine
 * exacte d'une mort — et empiler les événements au fil des instantanés.
 *
 * **Un instantané n'est lu qu'une fois.** L'accumulation se fait dans un effet,
 * et un effet se rejoue à chaque changement de dépendance : suivre un arbre de
 * plus, en pause, ferait relire le même instantané et redirait tout ce qu'il
 * portait. La référence `dernierLu` tient donc l'identité de l'instantané déjà
 * dépouillé, et l'ensemble suivi voyage par référence pour ne pas faire
 * dépendance.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Snapshot } from "./protocol";
import {
  accumulerLesSuivis,
  type EvenementSuivi,
  type MemoireDesSuivis,
  suivisMorts,
} from "./suivis";

/**
 * Combien d'événements on garde en tout.
 *
 * Un arbre suivi cinquante ans en produit quelques dizaines — un geste, deux
 * franchissements, des brouts. La borne n'est là que pour qu'un suivi de toute
 * une plantation ne fasse pas grossir la page sans fin.
 */
export const EVENEMENTS_GARDES = 400;

export interface SuivisDuJeu {
  /** les identifiants suivis */
  suivis: ReadonlySet<number>;
  /** le journal, le plus RÉCENT en tête */
  journal: readonly EvenementSuivi[];
  /**
   * Suivre ou ne plus suivre, d'un seul geste, pour toute une sélection.
   * Tout le lot est déjà suivi → on le lâche ; sinon on prend le reste.
   */
  basculer: (ids: Iterable<number>) => void;
  /** Ne plus suivre cet arbre-là : son journal s'en va avec lui. */
  oublier: (id: number) => void;
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
  envoyerAuWorker: (ids: ReadonlySet<number>) => void,
): SuivisDuJeu {
  const [suivis, setSuivis] = useState<ReadonlySet<number>>(new Set());
  const [journal, setJournal] = useState<readonly EvenementSuivi[]>([]);
  const [cadrerSur, setCadrerSur] = useState<{ x: number; y: number }>();
  const memoire = useRef<MemoireDesSuivis>(new Map());
  const dernierLu = useRef<Snapshot>(undefined);
  /**
   * L'ensemble suivi, lisible depuis l'effet sans en être une dépendance.
   * Sans ça, suivre un arbre relirait l'instantané courant (voir l'en-tête).
   */
  const ensemble = useRef<ReadonlySet<number>>(suivis);

  useEffect(() => {
    if (!snapshot || snapshot === dernierLu.current) return;
    dernierLu.current = snapshot;
    const { evenements, memoire: suite } = accumulerLesSuivis(
      memoire.current,
      snapshot,
      ensemble.current,
    );
    memoire.current = suite;
    if (evenements.length > 0) {
      // Le plus récent en tête, comme le journal de la partie : c'est ce
      // qu'on lit en premier quand la pause vient d'arriver.
      setJournal((prev) => [...evenements.reverse(), ...prev].slice(0, EVENEMENTS_GARDES));
    }
    const morts = suivisMorts(snapshot, ensemble.current);
    const premier = morts[0];
    // Le centre de la cellule, comme partout ailleurs : viser le coin
    // décalerait le cadrage d'un demi-mètre.
    if (premier) setCadrerSur({ x: premier.x + 0.5, y: premier.y + 0.5 });
  }, [snapshot]);

  const changer = useCallback(
    (suite: ReadonlySet<number>) => {
      ensemble.current = suite;
      setSuivis(suite);
      envoyerAuWorker(suite);
    },
    [envoyerAuWorker],
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
      // Un arbre qu'on ne suit plus n'a plus de journal : le laisser ferait
      // une liste d'événements sans arbre pour les porter.
      setJournal((prev) => prev.filter((e) => e.idArbre !== id));
    },
    [changer],
  );

  return {
    suivis,
    journal,
    basculer,
    oublier,
    ...(cadrerSur ? { cadrerSur } : {}),
  };
}
