/**
 * Les fiches graphiques, une par espèce (docs/interface-visuelle.md §5.4).
 *
 * **L'ordre de travail a suivi ce qui MUTUALISE, pas ce qui est le plus
 * utile.** Une fiche par famille de port d'abord, pour éprouver le générateur
 * sur les huit géométries et faire remonter ses manques ; les autres ensuite,
 * chacune dans une famille déjà défrichée. Ce détour a payé : c'est en écrivant
 * le pin qu'est apparu `verticille`, et en écrivant le noisetier que
 * `brinsDeCepee` est devenu nécessaire — deux champs qu'il aurait fallu
 * rétro-ajouter à vingt-cinq fiches si l'ordre avait été alphabétique.
 *
 * **Le catalogue est complet, et il le REDEVIENT à chaque fois que le moteur
 * grandit.** Vingt-six espèces aujourd'hui, et un test le vérifie dans les deux
 * sens — aucune fiche ne désigne une espèce absente, aucune espèce n'est laissée
 * au port générique. C'est ce test qui a signalé l'arrivée du NOYER, que le
 * moteur a ajouté pour l'allélopathie : sans lui, le noyer serait resté un
 * feuillu générique de plus, et la leçon du juglone — le sol nu sous le
 * houppier — serait passée inaperçue faute qu'on reconnaisse l'arbre qui le
 * cause. Le repli sur le port de famille (`ficheDe` rend `undefined`) reste en
 * place, mais il ne sert qu'aux espèces à venir.
 *
 * La huitième famille — **fourré bas** (ronce, ajonc, genêt, callune) — a bien
 * ses fiches, mais elles portent `fourre: true` et ne sont pas lues de la même
 * façon : ces espèces se dessinent **par cellule agrégée** et non par tige
 * (`couches/fourre.ts`), donc ni leur port ni leur branchement ne servent. Ce
 * qu'on leur demande, ce sont leurs couleurs et leur texture.
 *
 * **Ce que « complet » ne veut PAS dire.** Le critère de fin est ailleurs :
 * *une essence n'est finie que si quelqu'un d'autre la reconnaît sans
 * étiquette.* Aucune des vingt-six ne l'a passé — elles ont passé celui du
 * générateur, qui n'est pas le même. Ce fichier dit qu'il n'y a plus de trou,
 * pas que le travail est fini.
 */

import type { FicheGraphique } from "../fiche";
import { ABRICOTIER } from "./abricotier";
import { AJONC } from "./ajonc";
import { ARBOUSIER } from "./arbousier";
import { AUBEPINE } from "./aubepine";
import { AULNE_GLUTINEUX } from "./aulne";
import { BOULEAU } from "./bouleau";
import { CALLUNE } from "./callune";
import { CHARME } from "./charme";
import { CHATAIGNIER } from "./chataignier";
import { CHENE_LIEGE } from "./chene_liege";
import { CHENE_PUBESCENT } from "./chene_pubescent";
import { CORNOUILLER_MALE } from "./cornouiller";
import { FRENE } from "./frene";
import { FUSAIN } from "./fusain";
import { GENET } from "./genet";
import { HETRE } from "./hetre";
import { HOUX } from "./houx";
import { NOISETIER } from "./noisetier";
import { NOYER } from "./noyer";
import { PIN_SYLVESTRE } from "./pin_sylvestre";
import { POMMIER } from "./pommier";
import { PRUNELLIER } from "./prunellier";
import { RONCE } from "./ronce";
import { SAULE_BLANC } from "./saule";
import { SUREAU } from "./sureau";
import { TROENE } from "./troene";

export const FICHES: readonly FicheGraphique[] = [
  // Arbres de futaie.
  HETRE,
  CHENE_PUBESCENT,
  CHATAIGNIER,
  FRENE,
  NOYER,
  CHARME,
  BOULEAU,
  AULNE_GLUTINEUX,
  SAULE_BLANC,
  PIN_SYLVESTRE,
  CHENE_LIEGE,
  // Fruitiers greffés : le gobelet est une taille, pas un port.
  POMMIER,
  ABRICOTIER,
  // Arbustes de haie et de lisière.
  NOISETIER,
  PRUNELLIER,
  AUBEPINE,
  SUREAU,
  CORNOUILLER_MALE,
  FUSAIN,
  TROENE,
  HOUX,
  ARBOUSIER,
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
  ABRICOTIER,
  AJONC,
  ARBOUSIER,
  AUBEPINE,
  AULNE_GLUTINEUX,
  BOULEAU,
  CALLUNE,
  CHARME,
  CHATAIGNIER,
  CHENE_LIEGE,
  CHENE_PUBESCENT,
  CORNOUILLER_MALE,
  FRENE,
  FUSAIN,
  GENET,
  HETRE,
  HOUX,
  NOISETIER,
  NOYER,
  PIN_SYLVESTRE,
  POMMIER,
  PRUNELLIER,
  RONCE,
  SAULE_BLANC,
  SUREAU,
  TROENE,
};
