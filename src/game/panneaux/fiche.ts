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
import { elancement, elancementLimite, hauteurStableM } from "../../engine/trees";
import type { SnapshotTree } from "../protocol";
import { CAUSE_AU_SINGULIER } from "../suivis";

/**
 * Comment se lit une part : une part haute est-elle une bonne nouvelle ?
 *
 * « neutre » n'est pas une facilité, c'est le cas le plus fréquent et le plus
 * important : un chêne nu en janvier n'est pas un chêne malade, et colorer son
 * feuillage en rouge ferait crier l'écran tous les hivers. La couleur ne sert
 * qu'aux grandeurs qui ont un SENS — ce qui monte quand l'arbre va mal, ou
 * l'inverse.
 */
export type SensDeLecture = "hautBon" | "hautMauvais" | "neutre";

export interface LigneDeFiche {
  /** l'intitulé, à gauche */
  quoi: string;
  /** la valeur, telle qu'on la lit */
  valeur: string;
  /** le picto qui la précède, pour retrouver la ligne sans la lire */
  icone: string;
  /** ce que la grandeur veut dire, pour l'infobulle */
  aide?: string;
  /** ∈ [0,1] : ce que la jauge remplit, quand la grandeur en a une */
  part?: number;
  sens?: SensDeLecture;
  /**
   * Cette jauge ne compte pas dans le point d'alerte.
   *
   * **Parce que son ZÉRO ne veut pas dire « rien à signaler ».** L'élancement
   * en est le seul cas aujourd'hui : un arbre sain remplit déjà la moitié de sa
   * jauge — mesuré, 57 % sur un sujet de neuf mètres en pleine forme — parce
   * que la référence est la limite de flambage et non un idéal. Le faire entrer
   * dans l'alerte mettait tout le peuplement à l'orange, ce qui revient à
   * n'alerter sur rien.
   */
  horsAlerte?: boolean;
}

/**
 * La couleur d'une part, en teinte continue du vert au rouge.
 *
 * **Continue, et c'est le point** : un palier serait un seuil, et un seuil est
 * une règle que le moteur n'a pas donnée. Ici la couleur EST le nombre — 120°
 * de teinte pour ce qui va bien, 0° pour ce qui va mal — et le nombre reste
 * écrit à côté d'elle. On ne dit donc jamais « cet arbre va mal », on montre
 * plus de rouge quand la grandeur monte.
 */
export function couleurDeLaPart(part: number, sens: SensDeLecture = "neutre"): string {
  if (sens === "neutre") return "#7d8a6a";
  const p = Math.min(1, Math.max(0, part));
  const mauvais = sens === "hautMauvais" ? p : 1 - p;
  return `hsl(${Math.round(120 * (1 - mauvais))} 55% 38%)`;
}

/**
 * LE POINT D'ALERTE d'un arbre : la pire de ses grandeurs orientées, ∈ [0,1].
 *
 * Suivre toute une plantation veut dire lire cent quarante-neuf fiches. Ce
 * point-là se regarde à la place : il ne dit rien de plus que ce que les lignes
 * disent déjà, il dit seulement laquelle regarder en premier.
 */
export function alerteDeLArbre(lignes: readonly LigneDeFiche[]): number {
  return Math.min(1, partOrientee(pireLigne(lignes)));
}

/** Ce qu'une ligne orientée « vaut » en alerte : 0 si elle n'en est pas une. */
function partOrientee(ligne: LigneDeFiche | undefined): number {
  if (!ligne || ligne.part === undefined || ligne.sens === undefined) return 0;
  if (ligne.sens === "neutre" || ligne.horsAlerte) return 0;
  return ligne.sens === "hautMauvais" ? ligne.part : 1 - ligne.part;
}

/**
 * LA LIGNE qui tient l'alerte — celle qu'il faut nommer quand on n'en montre
 * qu'une. Rien à signaler sur aucune : `undefined`.
 */
export function pireLigne(lignes: readonly LigneDeFiche[]): LigneDeFiche | undefined {
  let pire: LigneDeFiche | undefined;
  for (const l of lignes) {
    if (partOrientee(l) > partOrientee(pire)) pire = l;
  }
  return pire;
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

/**
 * OÙ EN EST L'ÉTIOLEMENT, ∈ [0,1] — ou `undefined` si la question n'a pas de
 * sens (une tige sans diamètre mesurable).
 *
 * **Zéro n'est pas « pas d'élancement », c'est « élancement d'un arbre au
 * large ».** La borne basse est le haut de la gamme que le moteur cite pour un
 * arbre de plein vent (25 à 40) ; la borne haute est SA limite structurelle,
 * qui dépend du diamètre — une grosse tige flambe plus tôt en H/D qu'une fine.
 * Sans ce décalage, tout le peuplement partait à l'orange : mesuré, un sujet
 * sain remplit déjà 57 % de la jauge si on la fait partir de zéro.
 */
export const ELANCEMENT_AU_LARGE = 40;

export function partEtiolement(diametreCm: number, heightM: number): number | undefined {
  const h = elancement(diametreCm, heightM);
  const limite = elancementLimite(diametreCm);
  if (!Number.isFinite(h) || !Number.isFinite(limite) || limite <= ELANCEMENT_AU_LARGE) {
    return undefined;
  }
  return Math.min(1, Math.max(0, (h - ELANCEMENT_AU_LARGE) / (limite - ELANCEMENT_AU_LARGE)));
}

/**
 * Le mot qui va avec la part. Ce ne sont pas des seuils du moteur mais des mots
 * de sylviculture, et le nombre reste sous la jauge : on nomme ce qu'on montre,
 * on ne décide rien à la place du joueur.
 */
export function motDeLEtiolement(part: number): string {
  if (part <= 0.01) return "aucun (plein vent)";
  if (part < 0.35) return "léger";
  if (part < 0.7) return "net : la tige file";
  return "sévère : elle ne se tient plus";
}

export function ficheDeLArbre(
  arbre: SnapshotTree,
  ctx: { semaine: number; pheno: ContextePhenologique },
): LigneDeFiche[] {
  const lignes: LigneDeFiche[] = [];
  const espece = getEspece(arbre.especeId);
  const dire = (
    icone: string,
    quoi: string,
    valeur: string,
    extra: { aide?: string; part?: number; sens?: SensDeLecture; horsAlerte?: boolean } = {},
  ) =>
    lignes.push({
      quoi,
      valeur,
      icone,
      ...(extra.aide ? { aide: extra.aide } : {}),
      ...(extra.part === undefined ? {} : { part: extra.part, sens: extra.sens ?? "neutre" }),
      ...(extra.horsAlerte ? { horsAlerte: true } : {}),
    });

  dire(
    "📏",
    "Taille",
    `${arbre.heightM.toFixed(1)} m · Ø ${arbre.diametreCm.toFixed(1)} cm · ${stadeDe(arbre.diametreCm)}`,
    {
      aide: `Le stade est une classe de DIAMÈTRE, pas de hauteur. La jauge dit où il en est de la taille adulte de son espèce (${espece.hauteurMaxM} m).`,
      // NEUTRE : un jeune arbre n'est pas un arbre malade. La jauge dit sa
      // maturité, pas sa santé — la colorer reviendrait à reprocher à un semis
      // d'être un semis.
      part: Math.min(1, arbre.heightM / Math.max(0.1, espece.hauteurMaxM)),
      sens: "neutre",
    },
  );
  dire("🎂", "Âge", `${Math.floor(arbre.ageWeeks / 52)} ans`);

  if (arbre.chandelle) {
    // Une chandelle n'a plus ni feuillage ni vigueur : ce qui reste à dire
    // d'elle, c'est depuis quand elle est morte et de quoi.
    if (arbre.causeMort) dire("✝️", "Morte", CAUSE_AU_SINGULIER[arbre.causeMort]);
    if (arbre.mortSemaine !== undefined) {
      dire("🕰", "Sur pied depuis", depuis(ctx.semaine, arbre.mortSemaine));
    }
    if (arbre.caviteTeteL > 0) dire("🕳", "Cavité", `${arbre.caviteTeteL.toFixed(0)} L`);
    return lignes;
  }

  dire("💪", "Vigueur", pourcent(arbre.vigueur), {
    aide: "Pousse-t-il à son potentiel ? Un feuillage clairsemé et pâle se voit bien avant le moindre stress. C'est la réponse du moteur à « cet arbre est-il en retard ».",
    part: arbre.vigueur,
    sens: "hautBon",
  });

  // **L'ÉTIOLEMENT, dit en français et non en H/D.** « La ligne H/D n'est pas
  // très parlante » — elle ne l'était pas, en effet : le nombre brut ne dit
  // rien sans les deux repères qui l'encadrent. Les voici, et ils ne sont pas
  // de nous : la gamme forestière que `trees.ts` cite (« 25–40 au large, 90–100
  // en perche ») donne le plancher, et `elancementLimite` — le moteur — donne
  // le point où la tige ne se tient plus. La part va de l'un à l'autre.
  //
  // C'est la seule ligne qui dise l'arbre FILÉ par l'ombre : il est grand ET
  // mince, donc ni sa taille ni son âge ne le trahissent. Elle compte donc dans
  // l'alerte — « un arbre très étiolé, c'est un risque ».
  const part = partEtiolement(arbre.diametreCm, arbre.heightM);
  if (part !== undefined) {
    dire("📐", "Étiolement", motDeLEtiolement(part), {
      aide: `Élancement H/D (hauteur sur diamètre) : ${elancement(arbre.diametreCm, arbre.heightM).toFixed(0)}. Au large un arbre tient 25 à 40 ; une perche filée par l'ombre monte à 90 ou 100. La jauge est pleine à la limite du moteur — ${elancementLimite(arbre.diametreCm).toFixed(0)}, soit ${hauteurStableM(arbre.diametreCm).toFixed(1)} m de haut pour ce diamètre — au-delà de laquelle la tige flambe ou ploie sous la neige.`,
      part,
      sens: "hautMauvais",
    });
  }

  const feuillage = partFoliaireOmbrageanteDans(espece, ctx.pheno);
  const jaunit = senescenceDans(espece, ctx.pheno);
  dire(
    "🍃",
    "Feuillage",
    `${pourcent(feuillage)} déployé${jaunit > 0 ? ` · jaunit ${pourcent(jaunit)}` : ""}`,
    {
      aide: "Le calendrier foliaire du moteur, celui-là même que la scène dessine. NEUTRE à dessein : un caduc nu en janvier n'est pas un caduc malade.",
      part: feuillage,
      sens: "neutre",
    },
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
      "⚠️",
      "Stress",
      `${arbre.stress.toFixed(1)}/10${parts.length > 0 ? ` — ${parts.join(", ")}` : ""}`,
      {
        aide: "Les parts nommées sont des parts de ce stress ; ce qui manque est ce que le moteur ne sait pas encore nommer.",
        part: arbre.stress / 10,
        sens: "hautMauvais",
      },
    );
  }
  if (arbre.dommageHydraulique > 0.01) {
    dire("🥀", "Cime sèche", pourcent(arbre.dommageHydraulique), {
      aide: "La mémoire des sécheresses passées. Elle ne se répare pas.",
      part: arbre.dommageHydraulique,
      sens: "hautMauvais",
    });
  }

  if (arbre.floraison > 0) {
    dire("🌸", "En fleur", pourcent(arbre.floraison), {
      part: arbre.floraison,
      sens: "neutre",
    });
  }
  if (arbre.bloomFrosted) dire("❄️", "Fleurs", "grillées par le gel");
  if (arbre.fruitsKg > 0.05) dire("🍎", "Fruits mûrs", `${arbre.fruitsKg.toFixed(1)} kg`);
  else if (arbre.fruitProgress > 0) {
    dire("🍏", "Fruits", `${pourcent(arbre.fruitProgress)} formés`, {
      part: arbre.fruitProgress,
      sens: "neutre",
    });
  }

  if (arbre.hauteurElagueeM > 0) {
    dire("✂️", "Bille élaguée", `${arbre.hauteurElagueeM.toFixed(1)} m`, {
      aide: "Ce qui fera du bois d'œuvre.",
    });
  }
  if (arbre.baseHouppierM > 0) {
    // **« Houppier à partir de 0,3 m » se lisait de travers**, et la question
    // posée en partie le dit : « ça voudrait dire que 30 cm au-dessus du sol
    // c'est déjà le houppier ? » Oui, et c'est normal — un jeune pin au large
    // est branchu presque jusqu'au sol. Ce qui manquait, c'est que la grandeur
    // se lit par le BAS : c'est la hauteur de fût nu, pas le début d'une
    // couronne haut perchée.
    const part = arbre.baseHouppierM / Math.max(0.1, arbre.heightM);
    dire(
      "🪵",
      "Fût sans branches",
      `${arbre.baseHouppierM.toFixed(1)} m sur ${arbre.heightM.toFixed(1)} m`,
      {
        aide: "La hauteur en dessous de laquelle il n'y a plus une seule branche vivante : au-dessus, l'arbre est branchu. Elle ne descend jamais — une branche morte ne repousse pas — et elle monte de deux façons que l'arbre ne distingue pas : l'ombre qui tue les branches basses, ou le sécateur. Un arbre de plein vent garde donc un fût court ; une tige de futaie en porte quinze mètres.",
        part,
        sens: "neutre",
      },
    );
  }
  // **La question du moteur, et non la nôtre** : il ne suffit pas d'avoir une
  // hauteur de tête pour être une trogne (`trogne.ts` demande aussi un
  // étêtage), et `diametreTeteCm` vaut exactement zéro tant que ce n'en est
  // pas une. On lit donc sa réponse au lieu de refaire son test.
  if (arbre.diametreTeteCm > 0 && arbre.teteTrogneM !== undefined) {
    const creux = arbre.caviteTeteL > 0 ? `, cavité ${arbre.caviteTeteL.toFixed(0)} L` : "";
    dire(
      "🪵",
      "Trogne",
      `tête à ${arbre.teteTrogneM.toFixed(1)} m, Ø ${arbre.diametreTeteCm.toFixed(0)} cm${creux}`,
      { aide: "La tête grossit et se creuse à chaque étêtage ; le creux vaut habitat." },
    );
  }
  if (arbre.recepages > 0) dire("🪓", "Recépages", `${arbre.recepages}`);
  if (arbre.protege) dire("🛡️", "Manchon", "posé — le gibier ne l'atteint pas");
  if (arbre.derniereLeveeSemaine !== undefined) {
    dire("🟤", "Écorce levée", depuis(ctx.semaine, arbre.derniereLeveeSemaine));
  }
  if (arbre.pousseTendreM > 0.01) {
    dire("🌱", "Pousse tendre", `${(arbre.pousseTendreM * 100).toFixed(0)} cm`, {
      aide: "Ce que le gibier mange : un stock, qui repart quand on le laisse tranquille.",
    });
  }
  if (arbre.brouteSemaine !== undefined) {
    dire("🦌", "Brouté", depuis(ctx.semaine, arbre.brouteSemaine));
  }
  if (arbre.frotteSemaine !== undefined) {
    dire("🦌", "Frotté", depuis(ctx.semaine, arbre.frotteSemaine));
  }
  return lignes;
}
