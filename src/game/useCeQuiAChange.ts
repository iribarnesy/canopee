/**
 * **Ce qui a changé**, branché sur le jeu : l'historique des arbres qui ont
 * changé, et le bouton qui demande à les voir (`ceQuiAChange.ts`).
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { sujetsDuJournal } from "../render/temps/changements";
import { type Changements, changesDans, type FenetreDuChangement, retenir } from "./ceQuiAChange";
import { journalDe } from "./journal";
import type { Snapshot } from "./protocol";

export interface CeQuiAChange {
  /** le bouton est-il allumé ? */
  actif: boolean;
  fenetre: FenetreDuChangement;
  /** les arbres qui ont changé dans la fenêtre — vide quand le bouton est éteint */
  changes: ReadonlySet<number>;
  basculer: () => void;
  choisir: (fenetre: FenetreDuChangement) => void;
  /** allume sur cette fenêtre : ce que font « +1 mois » et « +1 an » */
  montrer: (fenetre: FenetreDuChangement) => void;
}

const AUCUN: ReadonlySet<number> = new Set();

export function useCeQuiAChange(snapshot: Snapshot | undefined): CeQuiAChange {
  const [actif, setActif] = useState(false);
  const [fenetre, setFenetre] = useState<FenetreDuChangement>("semaine");
  const historique = useRef<Changements[]>([]);
  // Une fois par instantané : les sujets de son journal, datés de sa semaine.
  const semaine = useMemo(() => {
    if (!snapshot) return undefined;
    historique.current = retenir(
      historique.current,
      snapshot.week,
      sujetsDuJournal(journalDe(snapshot)),
    );
    return snapshot.week;
  }, [snapshot]);
  const changes = useMemo(
    () =>
      actif && semaine !== undefined ? changesDans(historique.current, semaine, fenetre) : AUCUN,
    [actif, semaine, fenetre],
  );
  const basculer = useCallback(() => setActif((a) => !a), []);
  const choisir = useCallback((f: FenetreDuChangement) => setFenetre(f), []);
  const montrer = useCallback((f: FenetreDuChangement) => {
    setFenetre(f);
    setActif(true);
  }, []);
  return { actif, fenetre, changes, basculer, choisir, montrer };
}
