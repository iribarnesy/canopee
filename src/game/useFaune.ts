/**
 * **Les bêtes de passage**, branchées sur l'instantané (#129).
 *
 * Le monde du gibier se refait une fois par instantané — la densité, la
 * clôture, les arbres broutés ou frottés —, et le troupeau le lit à chaque
 * image. Le troupeau lui-même survit aux instantanés : c'est ce qui fait
 * qu'une bête en chemin ne saute pas quand la semaine change.
 *
 * Rien n'est calculé ici : la densité est le produit que le moteur fait brouter
 * (`gibierParHa × pressionGibier`), la clôture est la sienne, les témoins sont
 * ses dates de broutage et de frottis.
 */

import { useCallback, useMemo, useRef } from "react";
import { type MondeDuGibier, type PoseDuChevreuil, Troupeau } from "../render/faune/chevreuils";
import { estInondee } from "../render/palette";
import type { Snapshot, StationInfo } from "./protocol";

const PERSONNE: readonly PoseDuChevreuil[] = [];

export function useFaune(
  snapshot: Snapshot | undefined,
  station: StationInfo | undefined,
  /** la lame de la crue en cours, mm (`useCrue`) ; absente sans crue */
  lameMm?: ArrayLike<number>,
): (maintenantMs: number) => readonly PoseDuChevreuil[] {
  const monde = useMemo<MondeDuGibier | undefined>(() => {
    if (!snapshot || !station) return undefined;
    return {
      coteM: station.coteM,
      semaine: snapshot.week,
      densiteParHa: station.gibierParHa * snapshot.pressionGibier,
      cloture: snapshot.soilCloture,
      // Seuls les vivants se broutent : une chandelle garde sa dernière date
      // de broutage, mais aucune bête ne vient plus la visiter.
      arbres: snapshot.trees.filter((t) => t.mortSemaine === undefined && !t.chandelle),
      // On n'envoie pas brouter dans l'eau qui **reste** — la lame de la crue,
      // au seuil du terrain. L'eau qui ne fait que passer ne l'arrête pas.
      interdite: (i) => estInondee(lameMm?.[i] ?? 0),
    };
  }, [snapshot, station, lameMm]);

  const troupeau = useRef(new Troupeau());
  const dernier = useRef(monde);
  dernier.current = monde;

  return useCallback((maintenantMs: number) => {
    const m = dernier.current;
    return m ? troupeau.current.poses(m, maintenantMs) : PERSONNE;
  }, []);
}
