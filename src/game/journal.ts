/**
 * **Le journal d'une semaine**, d'où qu'il vienne.
 *
 * Une seule fonction, et elle a une raison d'exister à part : **quatre lectures
 * différentes partent du même journal**. L'ellipse le joue (`useEllipse`), le
 * calque le pointe (`changements.ts`), le bilan le compte (`bilan.ts`), et le
 * worker le replie semaine après semaine. Si chacun choisit lui-même les champs
 * qu'il recopie, le jour où le moteur en ajoute un, trois des quatre l'ignorent
 * en silence — et personne ne s'en aperçoit, puisque rien ne casse.
 *
 * **La forme est structurelle et non nominale**, et c'est ce qui permet la
 * quatrième lecture : un `Snapshot` et un `TickResult` portent les mêmes sept
 * champs sous les mêmes noms. Le worker n'a donc pas à fabriquer un instantané
 * pour compter une semaine qu'il vient de simuler.
 *
 * Module **pur** : pas de React, pas de DOM, pas d'horloge.
 */

import type { GesteVisible } from "../engine/actions";
import type {
  ChuteDeChandelle,
  FranchissementDeStade,
  IncendieResult,
  MortDeLaSemaine,
  NaissanceDeLaSemaine,
  TempeteResult,
} from "../engine/tick";
import type { JournalDeSemaine } from "../render/temps/ellipse";

/** Ce qui suffit à porter un journal : l'instantané comme le résultat d'un tick. */
export interface PorteurDeJournal {
  morts: readonly MortDeLaSemaine[];
  chutes: readonly ChuteDeChandelle[];
  gestes: readonly GesteVisible[];
  naissances: readonly NaissanceDeLaSemaine[];
  franchissements: readonly FranchissementDeStade[];
  incendie?: IncendieResult;
  tempete?: TempeteResult;
}

/** Le journal que porte un instantané ou un tick, dans la forme attendue. */
export function journalDe(porteur: PorteurDeJournal): JournalDeSemaine {
  return {
    morts: porteur.morts,
    chutes: porteur.chutes,
    gestes: porteur.gestes,
    naissances: porteur.naissances,
    franchissements: porteur.franchissements,
    ...(porteur.incendie ? { incendie: porteur.incendie } : {}),
    ...(porteur.tempete ? { tempete: porteur.tempete } : {}),
  };
}
