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
import { getEspece } from "../engine/especes";
import type { ArbreAPoser } from "../render/couches/arbres";
import { posesDesGeais, type VisiteDuGeai, visitesDuGeai } from "../render/faune/geai";
import { posesDesOiseauxDePassage } from "../render/faune/passage";
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
  // Les geais que les semis de l'instantané appellent (#129). Même règle que
  // les dérangements : datés une fois, à l'arrivée de l'instantané.
  const precedents = useRef<VisiteDuGeai[]>([]);
  const geais = useMemo(() => {
    if (!snapshot || coteM === undefined) return precedents.current;
    const maintenant = performance.now();
    precedents.current = [
      ...precedents.current.filter((v) => v.finMs > maintenant),
      ...visitesDuGeai(
        snapshot.naissances,
        (id) => getEspece(id).regeneration.dissemination === "geai",
        coteM,
        maintenant,
      ),
    ];
    return precedents.current;
  }, [snapshot, coteM]);
  const derniersGeais = useRef(geais);
  derniersGeais.current = geais;
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

  // **Les oiseaux de passage** (#296) : ceux que la fréquentation de la semaine
  // compte, posés sur les arbres qu'elle nomme. La graine est la semaine : la
  // bande de cette semaine n'est pas celle de la suivante.
  const passage = useMemo(
    () =>
      snapshot?.oiseauxDePassage?.some((g) => g.oiseaux > 0)
        ? {
            guildes: snapshot.oiseauxDePassage,
            arbres: new Map(arbres.map((a) => [a.id, a])),
            graine: snapshot.week,
          }
        : undefined,
    [snapshot, arbres],
  );
  const dernierPassage = useRef(passage);
  dernierPassage.current = passage;

  return useCallback((maintenantMs: number) => {
    const m = dernier.current;
    const habitants = m ? residents.current.poses(m, maintenantMs) : PERSONNE;
    const p = dernierPassage.current;
    const geais = derniersGeais.current;
    if (geais.length === 0 && !p) return habitants;
    return [
      ...habitants,
      ...(geais.length > 0 ? posesDesGeais(geais, maintenantMs) : []),
      ...(p ? posesDesOiseauxDePassage(p.guildes, p.arbres, p.graine, maintenantMs) : []),
    ];
  }, []);
}
