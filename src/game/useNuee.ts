/**
 * **La nuée de ravageurs**, branchée sur l'instantané (#129).
 *
 * Les essaims se refont une fois par instantané — la pression par cellule et
 * la chaleur de la semaine viennent du moteur —, et leurs points dansent à
 * chaque image.
 */

import { useCallback, useMemo, useRef } from "react";
import { essaimsDeLaNuee, type PointDeNuee, pointsDeLaNuee } from "../render/faune/nuee";
import type { Snapshot } from "./protocol";

const RIEN: readonly PointDeNuee[] = [];

export function useNuee(
  snapshot: Snapshot | undefined,
  coteM: number | undefined,
): (maintenantMs: number) => readonly PointDeNuee[] {
  const essaims = useMemo(
    () =>
      snapshot && coteM !== undefined
        ? essaimsDeLaNuee(snapshot.soilRavageurs, coteM, snapshot.weather.tMean)
        : [],
    [snapshot, coteM],
  );
  const dernier = useRef(essaims);
  dernier.current = essaims;
  return useCallback(
    (maintenantMs: number) =>
      dernier.current.length === 0 ? RIEN : pointsDeLaNuee(dernier.current, maintenantMs),
    [],
  );
}
