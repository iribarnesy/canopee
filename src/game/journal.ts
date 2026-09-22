/**
 * LE JOURNAL QUE PORTE UN INSTANTANÉ.
 *
 * Une seule fonction, et elle a une raison d'exister à part : **trois lectures
 * différentes partent du même journal**. L'ellipse le joue (`useEllipse`), le
 * calque le pointe (`changements.ts`), le bilan le compte (`bilan.ts`). Si
 * chacun choisit lui-même les champs de l'instantané qu'il recopie, le jour où
 * le moteur en ajoute un, deux des trois l'ignorent en silence — et personne
 * ne s'en aperçoit, puisque rien ne casse.
 *
 * Module **pur** : pas de React, pas de DOM, pas d'horloge.
 */

import type { JournalDeSemaine } from "../render/temps/ellipse";
import type { Snapshot } from "./protocol";

/** Le journal que porte un instantané, dans la forme que le plan attend. */
export function journalDe(snapshot: Snapshot): JournalDeSemaine {
  return {
    morts: snapshot.morts,
    chutes: snapshot.chutes,
    gestes: snapshot.gestes,
    naissances: snapshot.naissances,
    franchissements: snapshot.franchissements,
    ...(snapshot.incendie ? { incendie: snapshot.incendie } : {}),
    ...(snapshot.tempete ? { tempete: snapshot.tempete } : {}),
  };
}
