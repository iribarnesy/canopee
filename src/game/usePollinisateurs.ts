/**
 * **Papillons et abeilles**, branchés sur l'instantané (#129, #299).
 *
 * Les blocs où l'on butine se refont une fois par instantané — la présence par
 * cellule vient du moteur (`soilPollinisateurs`) —, et les insectes volent à
 * chaque image.
 */

import { useCallback, useMemo, useRef } from "react";
import { butinages, insectesEnVol, type PoseDInsecte } from "../render/faune/pollinisateurs";
import type { Snapshot } from "./protocol";

const PERSONNE: readonly PoseDInsecte[] = [];

export function usePollinisateurs(
  snapshot: Snapshot | undefined,
  coteM: number | undefined,
): (maintenantMs: number) => readonly PoseDInsecte[] {
  const blocs = useMemo(
    () => (snapshot && coteM !== undefined ? butinages(snapshot.soilPollinisateurs, coteM) : []),
    [snapshot, coteM],
  );
  const dernier = useRef(blocs);
  dernier.current = blocs;
  return useCallback(
    (maintenantMs: number) =>
      dernier.current.length === 0 ? PERSONNE : insectesEnVol(dernier.current, maintenantMs),
    [],
  );
}
