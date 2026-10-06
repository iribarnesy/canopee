/**
 * **Le givre et la brume de la semaine** (#130, lot L10).
 *
 * Tous deux se lisent dans l'instantané — la nuit la plus froide, la lumière
 * au sol, la nappe, le vent. Le givre est un **état** de la semaine qui a gelé :
 * il reste tant qu'elle dure (`givre.ts` dit pourquoi). La brume est un matin :
 * elle est là quand la semaine arrive et se lève en quelques secondes ; son
 * horloge part de l'arrivée de l'instantané, comme l'ellipse.
 *
 * Un crochet à part et non un acte de l'ellipse : une semaine sans rien à
 * raconter a une ellipse vide, et elle peut très bien avoir gelé.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { ventRecuParLeSite } from "../engine/feu";
import { type BouffeeDeBrume, brumeEnCours, cellulesAffleurantes } from "../render/temps/brume";
import { cellulesGelees, type GivreDeLaSemaine, givreDeLaSemaine } from "../render/temps/givre";
import type { Snapshot, StationInfo } from "./protocol";

const AUCUNE_BOUFFEE: readonly BouffeeDeBrume[] = [];

export interface MatinDeLaSemaine {
  /** le givre de la semaine ; absent si elle n'a pas gelé */
  givre: GivreDeLaSemaine | undefined;
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
  const givre = useMemo(
    () => (matin && snapshot ? givreDeLaSemaine(matin.gelees, snapshot.soilHerbe) : undefined),
    [matin, snapshot],
  );
  const brume = useCallback((maintenantMs: number) => {
    const m = dernier.current;
    if (!m || m.affleurantes.length === 0) return AUCUNE_BOUFFEE;
    return brumeEnCours(m.affleurantes, m.coteM, m.ventRecuMs, maintenantMs - debut.current);
  }, []);
  return useMemo(() => ({ givre, brume }), [givre, brume]);
}
