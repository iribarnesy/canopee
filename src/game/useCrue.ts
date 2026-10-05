/**
 * **La crue, suivie d'un instantané à l'autre** (#127, #288).
 *
 * Le moteur émet un `CrueResult` pour chaque semaine de crue, et le worker les
 * envoie avec l'instantané puis les **oublie** : un instantané déclenché par
 * une action en pause n'en porte aucun. C'est donc ici qu'on se rappelle
 * l'emprise en cours, avec la règle que le moteur écrit lui-même : une crue
 * n'est finie que quand **des semaines ont passé** sans qu'aucun `CrueResult`
 * ne porte plus son identifiant. Un instantané de la même semaine ne dit rien
 * de neuf ; il garde l'eau où elle est.
 *
 * Rien n'est calculé : l'emprise et les lames sont celles du moteur, les
 * cellules quittées sont ce que deux emprises successives ne partagent pas.
 */

import { useMemo, useRef } from "react";
import type { CrueResult } from "../engine/crue";
import {
  type CrueDeLaSemaine,
  lameDeLaCrue,
  monteeDeLaCrue,
  retraitDeLaCrue,
} from "../render/temps/crue";
import type { Snapshot, StationInfo } from "./protocol";

export interface CrueALEcran {
  /** la lame sur chaque cellule, mm — l'état que le terrain cuit ; absent sans crue */
  lameMm: Float32Array | undefined;
  /** les montées et retraits à jouer dans l'ellipse de cet instantané, dans l'ordre */
  actes: readonly CrueDeLaSemaine[];
  /** part de la parcelle sous l'eau ∈ [0,1] */
  partNoyee: number;
}

const SANS_CRUE: CrueALEcran = { lameMm: undefined, actes: [], partNoyee: 0 };

interface Souvenir {
  semaine: number;
  emprise: ReadonlySet<number>;
  ecran: CrueALEcran;
}

/**
 * Une semaine de plus : ce que l'ellipse doit jouer et l'eau qui reste, depuis
 * l'emprise qu'on tenait.
 *
 * Pur, pour être éprouvé sans React : le crochet ne fait que se rappeler le
 * résultat d'une fois sur l'autre.
 */
export function suivreLaCrueALEcran(
  avant: { semaine: number; emprise: ReadonlySet<number> } | undefined,
  semaine: number,
  crues: readonly CrueResult[],
  nCells: number,
  altitudesM: readonly number[],
): { emprise: ReadonlySet<number>; ecran: CrueALEcran } | undefined {
  // Même semaine : rien n'a été simulé, l'eau reste où elle est.
  if (avant && avant.semaine === semaine) return undefined;
  const actes: CrueDeLaSemaine[] = [];
  let emprise: ReadonlySet<number> = avant?.emprise ?? new Set();
  for (const c of crues) {
    const ici = new Set<number>(c.cellules);
    const quittees = [...emprise].filter((i) => !ici.has(i));
    const retrait = retraitDeLaCrue(quittees, altitudesM);
    if (retrait) actes.push(retrait);
    const montee = monteeDeLaCrue(c);
    if (montee) actes.push(montee);
    emprise = ici;
  }
  // La crue de la **dernière semaine simulée**, celle sur laquelle l'instantané
  // s'ouvre. Si aucune ne la porte, l'eau est partie : tout ce qu'elle tenait
  // se retire.
  const courante = crues.find((c) => c.id + c.semaine === semaine - 1);
  if (!courante && emprise.size > 0) {
    const retrait = retraitDeLaCrue([...emprise], altitudesM);
    if (retrait) actes.push(retrait);
    emprise = new Set();
  }
  return {
    emprise,
    ecran: {
      lameMm: lameDeLaCrue(courante, nCells),
      actes,
      partNoyee: nCells > 0 ? emprise.size / nCells : 0,
    },
  };
}

export function useCrue(
  snapshot: Snapshot | undefined,
  station: StationInfo | undefined,
): CrueALEcran {
  const souvenir = useRef<Souvenir | undefined>(undefined);
  return useMemo(() => {
    if (!snapshot || !station) return SANS_CRUE;
    const nCells = station.coteM * station.coteM;
    const suite = suivreLaCrueALEcran(
      souvenir.current,
      snapshot.week,
      snapshot.crues ?? [],
      nCells,
      station.altitudesM,
    );
    if (!suite) {
      // Même semaine : on garde l'eau, et on ne rejoue rien.
      const deja = souvenir.current?.ecran ?? SANS_CRUE;
      return deja.actes.length === 0 ? deja : { ...deja, actes: [] };
    }
    souvenir.current = { semaine: snapshot.week, emprise: suite.emprise, ecran: suite.ecran };
    return suite.ecran;
  }, [snapshot, station]);
}
