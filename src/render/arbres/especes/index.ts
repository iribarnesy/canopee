/**
 * Les fiches graphiques, une par espèce (docs/interface-visuelle.md §5.4).
 *
 * **L'ordre de travail suit ce qui MUTUALISE, pas ce qui est le plus utile.**
 * Une fiche par famille de port d'abord, pour éprouver le générateur sur les
 * huit géométries et faire remonter ses manques ; les dix-sept restantes
 * ensuite, chacune dans une famille déjà défrichée. C'est ce qui est fait ici :
 * sept fiches, une par famille d'arbre.
 *
 * La huitième famille — **fourré bas** (ronce, ajonc, genêt, callune) — a bien
 * ses fiches, mais elles portent `fourre: true` et ne sont pas lues de la même
 * façon : ces espèces se dessinent **par cellule agrégée** et non par tige
 * (`couches/fourre.ts`), donc ni leur port ni leur branchement ne servent. Ce
 * qu'on leur demande, ce sont leurs couleurs et leur texture.
 *
 * **Une espèce sans fiche n'est pas un problème** : elle prend le port de sa
 * famille en attendant la sienne, et la vue tourne. Le critère de fin, lui, est
 * le même pour toutes : *une essence n'est finie que si quelqu'un d'autre la
 * reconnaît sans étiquette.* Aucune des sept ci-dessous n'a encore passé ce
 * test-là — elles ont passé celui du générateur, qui n'est pas le même.
 */

import type { FicheGraphique } from "../fiche";
import { AJONC } from "./ajonc";
import { AULNE_GLUTINEUX } from "./aulne";
import { BOULEAU } from "./bouleau";
import { CALLUNE } from "./callune";
import { CHARME } from "./charme";
import { CHATAIGNIER } from "./chataignier";
import { CHENE_LIEGE } from "./chene_liege";
import { CHENE_PUBESCENT } from "./chene_pubescent";
import { FRENE } from "./frene";
import { GENET } from "./genet";
import { HETRE } from "./hetre";
import { NOISETIER } from "./noisetier";
import { PIN_SYLVESTRE } from "./pin_sylvestre";
import { POMMIER } from "./pommier";
import { RONCE } from "./ronce";
import { SAULE_BLANC } from "./saule";

export const FICHES: readonly FicheGraphique[] = [
  HETRE,
  CHENE_PUBESCENT,
  CHATAIGNIER,
  FRENE,
  CHARME,
  BOULEAU,
  AULNE_GLUTINEUX,
  SAULE_BLANC,
  PIN_SYLVESTRE,
  CHENE_LIEGE,
  POMMIER,
  NOISETIER,
  // Le fourré bas : dessiné par cellule agrégée, pas par tige.
  RONCE,
  AJONC,
  GENET,
  CALLUNE,
];

const PAR_ID = new Map(FICHES.map((f) => [f.especeId, f]));

/** La fiche d'une espèce, ou `undefined` si elle n'est pas encore écrite. */
export function ficheDe(especeId: string): FicheGraphique | undefined {
  return PAR_ID.get(especeId);
}

export {
  AJONC,
  AULNE_GLUTINEUX,
  BOULEAU,
  CALLUNE,
  CHARME,
  CHATAIGNIER,
  CHENE_LIEGE,
  CHENE_PUBESCENT,
  FRENE,
  GENET,
  HETRE,
  NOISETIER,
  PIN_SYLVESTRE,
  POMMIER,
  RONCE,
  SAULE_BLANC,
};
