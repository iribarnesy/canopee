/**
 * **Les habitants qui bougent**, branchés sur l'instantané (#129).
 *
 * Le moteur dit qui habite la parcelle (`Snapshot.faune`) et quel arbre porte
 * chaque gîte ; les arbres posés donnent les houppiers où se percher. Les
 * gestes du joueur de l'instantané deviennent des **dérangements**, datés du
 * moment où on les a appris — c'est aussi celui où l'ellipse les joue.
 *
 * Comme pour les chevreuils, l'objet qui tient la vie des corps survit aux
 * instantanés : une mésange en vol ne saute pas quand la semaine change.
 */

import { useCallback, useMemo, useRef } from "react";
import type { ArbreAPoser } from "../render/couches/arbres";
import {
  type Derangement,
  derangementsDuJournal,
  FUITE_MS,
  type MondeDesHabitants,
  type PoseDHabitant,
  Residents,
} from "../render/faune/residents";
import type { Snapshot } from "./protocol";

const PERSONNE: readonly PoseDHabitant[] = [];

export function useResidents(
  snapshot: Snapshot | undefined,
  arbres: readonly ArbreAPoser[],
  coteM: number | undefined,
): (maintenantMs: number) => readonly PoseDHabitant[] {
  // Les dérangements récents, gardés d'un instantané à l'autre : une fuite dure
  // plus longtemps qu'une semaine à grande vitesse.
  const derangements = useRef<Derangement[]>([]);
  // **Une fois par instantané, et pas une fois par liste d'arbres** : les arbres
  // posés se refont aussi quand l'ellipse avance, et dater à nouveau les mêmes
  // gestes ferait refuir les oiseaux à chaque fois.
  const recents = useMemo(() => {
    if (!snapshot || coteM === undefined) return derangements.current;
    const maintenant = performance.now();
    const parId = new Map(snapshot.trees.map((t) => [t.id, t]));
    derangements.current = [
      ...derangements.current.filter((d) => maintenant - d.depuisMs < FUITE_MS),
      ...derangementsDuJournal(snapshot.gestes, (id) => parId.get(id), coteM, maintenant),
    ];
    return derangements.current;
  }, [snapshot, coteM]);
  const monde = useMemo<MondeDesHabitants | undefined>(
    () =>
      snapshot?.faune && snapshot.faune.length > 0
        ? { habitants: snapshot.faune, arbres, derangements: recents }
        : undefined,
    [snapshot, arbres, recents],
  );

  const residents = useRef(new Residents());
  const dernier = useRef(monde);
  dernier.current = monde;

  return useCallback((maintenantMs: number) => {
    const m = dernier.current;
    return m ? residents.current.poses(m, maintenantMs) : PERSONNE;
  }, []);
}
