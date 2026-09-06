/**
 * Les fiches graphiques, une par espèce (docs/interface-visuelle.md §5.4).
 *
 * **L'ordre de travail suit ce qui MUTUALISE, pas ce qui est le plus utile.**
 * Une fiche par famille de port d'abord, pour éprouver le générateur sur les
 * huit géométries et faire remonter ses manques ; les dix-sept restantes
 * ensuite, chacune dans une famille déjà défrichée. C'est ce qui est fait ici :
 * sept fiches, une par famille d'arbre.
 *
 * La huitième famille — **fourré bas** (ronce, ajonc, genêt, callune) — n'a pas
 * de fiche ici et ce n'est pas un oubli : ces espèces se dessinent **par
 * cellule agrégée** et non par tige, donc elles ne passent pas par le
 * générateur de squelette. Leur place est dans la couche du sol, pas ici.
 *
 * **Une espèce sans fiche n'est pas un problème** : elle prend le port de sa
 * famille en attendant la sienne, et la vue tourne. Le critère de fin, lui, est
 * le même pour toutes : *une essence n'est finie que si quelqu'un d'autre la
 * reconnaît sans étiquette.* Aucune des sept ci-dessous n'a encore passé ce
 * test-là — elles ont passé celui du générateur, qui n'est pas le même.
 */

import type { FicheGraphique } from "../fiche";
import { AULNE_GLUTINEUX } from "./aulne";
import { BOULEAU } from "./bouleau";
import { CHARME } from "./charme";
import { CHATAIGNIER } from "./chataignier";
import { CHENE_LIEGE } from "./chene_liege";
import { CHENE_PUBESCENT } from "./chene_pubescent";
import { FRENE } from "./frene";
import { HETRE } from "./hetre";
import { NOISETIER } from "./noisetier";
import { PIN_SYLVESTRE } from "./pin_sylvestre";
import { POMMIER } from "./pommier";
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
];

const PAR_ID = new Map(FICHES.map((f) => [f.especeId, f]));

/** La fiche d'une espèce, ou `undefined` si elle n'est pas encore écrite. */
export function ficheDe(especeId: string): FicheGraphique | undefined {
  return PAR_ID.get(especeId);
}

export {
  AULNE_GLUTINEUX,
  BOULEAU,
  CHARME,
  CHATAIGNIER,
  CHENE_LIEGE,
  CHENE_PUBESCENT,
  FRENE,
  HETRE,
  NOISETIER,
  PIN_SYLVESTRE,
  POMMIER,
  SAULE_BLANC,
};
