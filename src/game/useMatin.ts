/**
 * **Le petit matin de la semaine** : le givre et la brume (#130, lot L10).
 *
 * Tous deux se lisent dans l'instantané — la nuit la plus froide, la lumière
 * au sol, la nappe, le vent — et tous deux sont des matins : ils sont là quand
 * la semaine arrive et s'en vont en quelques secondes. L'horloge part donc de
 * l'arrivée de l'instantané, comme l'ellipse.
 *
 * Un crochet à part et non un acte de l'ellipse : une semaine sans rien à
 * raconter a une ellipse vide, et elle peut très bien avoir gelé.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { ventRecuParLeSite } from "../engine/feu";
import { type BouffeeDeBrume, brumeEnCours, cellulesAffleurantes } from "../render/temps/brume";
import { cellulesGelees, givreEnCours } from "../render/temps/givre";
import type { CelluleVoilee } from "../render/temps/voile";
import type { Snapshot, StationInfo } from "./protocol";

const AUCUN_VOILE: readonly CelluleVoilee[] = [];
const AUCUNE_BOUFFEE: readonly BouffeeDeBrume[] = [];

export interface MatinDeLaSemaine {
  /** le givre, pour la couche des voiles */
  givre: (maintenantMs: number) => readonly CelluleVoilee[];
  /** la brume, bouffée par bouffée, parmi les arbres */
  brume: (maintenantMs: number) => readonly BouffeeDeBrume[];
}

export function useMatin(
  snapshot: Snapshot | undefined,
  station: StationInfo | undefined,
): MatinDeLaSemaine {
  const matin = useMemo(() => {
    if (!snapshot || !station) return undefined;
    const w = snapshot.weather;
    return {
      gelees: cellulesGelees(w.tMinAbsC, snapshot.soilLumiere),
      affleurantes: cellulesAffleurantes(snapshot.soilNappeCm),
      coteM: station.coteM,
      ventRecuMs:
        w.ventMoyMs === undefined ? 0 : ventRecuParLeSite(w.ventMoyMs, station.ventExposition),
    };
  }, [snapshot, station]);
  const debut = useRef(0);
  useEffect(() => {
    if (snapshot) debut.current = performance.now();
  }, [snapshot]);
  const dernier = useRef(matin);
  dernier.current = matin;
  const givre = useCallback((maintenantMs: number) => {
    const m = dernier.current;
    if (!m || m.gelees.length === 0) return AUCUN_VOILE;
    return givreEnCours(m.gelees, maintenantMs - debut.current);
  }, []);
  const brume = useCallback((maintenantMs: number) => {
    const m = dernier.current;
    if (!m || m.affleurantes.length === 0) return AUCUNE_BOUFFEE;
    return brumeEnCours(m.affleurantes, m.coteM, m.ventRecuMs, maintenantMs - debut.current);
  }, []);
  return useMemo(() => ({ givre, brume }), [givre, brume]);
}
