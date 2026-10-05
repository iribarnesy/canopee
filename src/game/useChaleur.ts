/**
 * **Le voile de chaleur**, branché sur l'instantané (§5.7).
 *
 * Les foyers se refont une fois par instantané — la chaleur de la semaine, le
 * couvert et l'herbe viennent du moteur —, et les ondes montent à chaque image.
 */

import { useCallback, useMemo, useRef } from "react";
import { foyersDeChaleur, type OndeDeChaleur, ondesDeChaleur } from "../render/temps/chaleur";
import type { Snapshot } from "./protocol";

const RIEN: readonly OndeDeChaleur[] = [];

export function useChaleur(
  snapshot: Snapshot | undefined,
  coteM: number | undefined,
): (maintenantMs: number) => readonly OndeDeChaleur[] {
  const foyers = useMemo(
    () =>
      snapshot && coteM !== undefined
        ? foyersDeChaleur(snapshot.weather.tMax, snapshot.soilLumiere, snapshot.soilHerbe, coteM)
        : [],
    [snapshot, coteM],
  );
  const dernier = useRef(foyers);
  dernier.current = foyers;
  return useCallback(
    (maintenantMs: number) =>
      dernier.current.length === 0 ? RIEN : ondesDeChaleur(dernier.current, maintenantMs),
    [],
  );
}
