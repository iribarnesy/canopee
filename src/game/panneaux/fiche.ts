/**
 * LA FICHE D'UN ARBRE : ce qu'il porte, en clair (#149).
 *
 * « Pour un arbre suivi, on aimerait bien voir ses stats détaillées — sa
 * vigueur, son feuillage. » Le journal dit ce qui lui EST ARRIVÉ ; la fiche dit
 * ce qu'il EST aujourd'hui, et les deux se lisent ensemble.
 *
 * **Rien n'est recalculé.** Chaque ligne est un champ de l'instantané, rendu
 * lisible — ou, pour le feuillage, un appel aux fonctions du moteur
 * (`phenologie.ts`), celles-là mêmes que la scène appelle pour dessiner. Le
 * rendu ne refait pas le calendrier foliaire : il le demande.
 *
 * **Pas de verdict, des nombres.** Dire « cet arbre végète » demanderait un
 * seuil, et un seuil est une règle : le moteur n'en a pas donné. On montre donc
 * la vigueur telle qu'elle est, avec ce qu'elle veut dire en infobulle.
 *
 * Module pur : pas de React, pas de DOM.
 */

import { getEspece } from "../../engine/especes";
import {
  type ContextePhenologique,
  partFoliaireOmbrageanteDans,
  senescenceDans,
} from "../../engine/phenologie";
import { stadeDe } from "../../engine/stades";
import type { SnapshotTree } from "../protocol";
import { CAUSE_AU_SINGULIER } from "../suivis";

export interface LigneDeFiche {
  /** l'intitulé, à gauche */
  quoi: string;
  /** la valeur, telle qu'on la lit */
  valeur: string;
  /** ce que la grandeur veut dire, pour l'infobulle */
  aide?: string;
}

const pourcent = (part: number): string => `${Math.round(part * 100)} %`;

/** « il y a 3 ans », « il y a 12 semaines » — une durée se lit mieux qu'une date. */
export function ilYA(semaines: number): string {
  if (semaines < 52)
    return `il y a ${Math.max(0, Math.round(semaines))} semaine${semaines >= 2 ? "s" : ""}`;
  const ans = Math.floor(semaines / 52);
  return `il y a ${ans} an${ans > 1 ? "s" : ""}`;
}

/**
 * Depuis quand — ou « avant votre arrivée ».
 *
 * **Une marque peut être plus VIEILLE que la partie**, et c'est ce qui rendait
 * la fiche fausse : une parcelle vieillie de quarante ans porte des arbres
 * broutés en semaine 1 800, alors que le compteur du joueur repart de zéro à
 * son arrivée (`worker.ts`, `faireVieillir`). L'écart est négatif, et un
 * `Math.max(0, …)` en faisait un « il y a 0 semaine » — un brout de l'année
 * dernière annoncé comme celui de cette semaine. Relevé dans le navigateur, sur
 * un pin dont la fiche disait qu'il venait d'être brouté.
 */
export function depuis(semaine: number, marque: number): string {
  return marque > semaine ? "avant votre arrivée" : ilYA(semaine - marque);
}

export function ficheDeLArbre(
  arbre: SnapshotTree,
  ctx: { semaine: number; pheno: ContextePhenologique },
): LigneDeFiche[] {
  const lignes: LigneDeFiche[] = [];
  const espece = getEspece(arbre.especeId);
  const dire = (quoi: string, valeur: string, aide?: string) =>
    lignes.push({ quoi, valeur, ...(aide ? { aide } : {}) });

  dire(
    "Taille",
    `${arbre.heightM.toFixed(1)} m · Ø ${arbre.diametreCm.toFixed(1)} cm · ${stadeDe(arbre.diametreCm)}`,
    "Le stade est une classe de DIAMÈTRE, pas de hauteur : deux arbres de même taille n'y sont pas forcément ensemble.",
  );
  dire("Âge", `${Math.floor(arbre.ageWeeks / 52)} ans`);

  if (arbre.chandelle) {
    // Une chandelle n'a plus ni feuillage ni vigueur : ce qui reste à dire
    // d'elle, c'est depuis quand elle est morte et de quoi.
    if (arbre.causeMort) dire("Morte", CAUSE_AU_SINGULIER[arbre.causeMort]);
    if (arbre.mortSemaine !== undefined) {
      dire("Sur pied depuis", depuis(ctx.semaine, arbre.mortSemaine));
    }
    if (arbre.caviteTeteL > 0) dire("Cavité", `${arbre.caviteTeteL.toFixed(0)} L`);
    return lignes;
  }

  dire(
    "Vigueur",
    pourcent(arbre.vigueur),
    "Pousse-t-il à son potentiel ? Un feuillage clairsemé et pâle se voit bien avant le moindre stress.",
  );

  const feuillage = partFoliaireOmbrageanteDans(espece, ctx.pheno);
  const jaunit = senescenceDans(espece, ctx.pheno);
  dire(
    "Feuillage",
    `${pourcent(feuillage)} déployé${jaunit > 0 ? ` · jaunit ${pourcent(jaunit)}` : ""}`,
    "Le calendrier foliaire du moteur, celui-là même que la scène dessine.",
  );

  if (arbre.stress > 0.05) {
    const parts: string[] = [];
    if (arbre.stressLent !== undefined && arbre.stressLent > 0.01 && arbre.causeLente) {
      parts.push(`${CAUSE_AU_SINGULIER[arbre.causeLente]} ${pourcent(arbre.stressLent)}`);
    }
    if (arbre.stressRavageurs !== undefined && arbre.stressRavageurs > 0.01) {
      parts.push(`ravageurs ${pourcent(arbre.stressRavageurs)}`);
    }
    if (arbre.stressMaladie !== undefined && arbre.stressMaladie > 0.01) {
      parts.push(`maladie ${pourcent(arbre.stressMaladie)}`);
    }
    dire(
      "Stress",
      `${arbre.stress.toFixed(1)}/10${parts.length > 0 ? ` — ${parts.join(", ")}` : ""}`,
      "Les parts nommées sont des parts de ce stress ; ce qui manque est ce que le moteur ne sait pas encore nommer.",
    );
  }
  if (arbre.dommageHydraulique > 0.01) {
    dire(
      "Cime sèche",
      pourcent(arbre.dommageHydraulique),
      "La mémoire des sécheresses passées. Elle ne se répare pas.",
    );
  }

  if (arbre.floraison > 0) dire("En fleur", pourcent(arbre.floraison));
  if (arbre.bloomFrosted) dire("Fleurs", "grillées par le gel");
  if (arbre.fruitsKg > 0.05) dire("Fruits mûrs", `${arbre.fruitsKg.toFixed(1)} kg`);
  else if (arbre.fruitProgress > 0) dire("Fruits", `${pourcent(arbre.fruitProgress)} formés`);

  if (arbre.hauteurElagueeM > 0) {
    dire("Bille élaguée", `${arbre.hauteurElagueeM.toFixed(1)} m`, "Ce qui fera du bois d'œuvre.");
  }
  if (arbre.baseHouppierM > 0) dire("Houppier à partir de", `${arbre.baseHouppierM.toFixed(1)} m`);
  // **La question du moteur, et non la nôtre** : il ne suffit pas d'avoir une
  // hauteur de tête pour être une trogne (`trogne.ts` demande aussi un
  // étêtage), et `diametreTeteCm` vaut exactement zéro tant que ce n'en est
  // pas une. On lit donc sa réponse au lieu de refaire son test.
  if (arbre.diametreTeteCm > 0 && arbre.teteTrogneM !== undefined) {
    const creux = arbre.caviteTeteL > 0 ? `, cavité ${arbre.caviteTeteL.toFixed(0)} L` : "";
    dire(
      "Trogne",
      `tête à ${arbre.teteTrogneM.toFixed(1)} m, Ø ${arbre.diametreTeteCm.toFixed(0)} cm${creux}`,
      "La tête grossit et se creuse à chaque étêtage ; le creux vaut habitat.",
    );
  }
  if (arbre.recepages > 0) dire("Recépages", `${arbre.recepages}`);
  if (arbre.protege) dire("Manchon", "posé — le gibier ne l'atteint pas");
  if (arbre.derniereLeveeSemaine !== undefined) {
    dire("Écorce levée", depuis(ctx.semaine, arbre.derniereLeveeSemaine));
  }
  if (arbre.pousseTendreM > 0.01) {
    dire(
      "Pousse tendre",
      `${(arbre.pousseTendreM * 100).toFixed(0)} cm`,
      "Ce que le gibier mange : un stock, qui repart quand on le laisse tranquille.",
    );
  }
  if (arbre.brouteSemaine !== undefined) {
    dire("Brouté", depuis(ctx.semaine, arbre.brouteSemaine));
  }
  if (arbre.frotteSemaine !== undefined) {
    dire("Frotté", depuis(ctx.semaine, arbre.frotteSemaine));
  }
  return lignes;
}
