/**
 * Le gel des jeunes pousses : une nuit de printemps grille le feuillage qui vient
 * de sortir, l'arbre refait ses feuilles sur ses réserves, et l'année de
 * croissance en paie le prix (#371).
 *
 * Le moteur ne gelait que les fleurs. Or le premier test humain attendait d'un
 * épisode de gel qu'il touche « les fleurs et les jeunes pousses », et c'est
 * l'un des dégâts climatiques les mieux documentés des feuillus tempérés : le
 * gel de mai 2011 a roussi les hêtraies d'Allemagne du Sud, et les cernes de
 * l'année y ont perdu jusqu'à plus de 90 % de leur largeur (Dittmar, Fricke et
 * Elling 2006 ; Menzel, Helm et Zang 2015).
 *
 * ─── **le stade décide**, **pas l'essence** ──────────────────────────────────────────
 * Un bourgeon dormant tient de −25 à −35 °C ; la résistance s'effondre au
 * débourrement, où la température qui tue la moitié des tissus d'une feuille
 * qui sort va de −2 à −8 °C selon l'essence (Vitasse, Lenz et Körner 2014,
 * *Front. Plant Sci.* 5:541). Avant le débourrement, rien ne gèle ; après le
 * durcissement de la feuille, rien non plus. Entre les deux, le feuillage est
 * **tendre**.
 *
 * ─── **le seuil se tire de la précocité** ─────────────────────────────────────────────
 * À l'émergence, les essences qui débourrent tôt sont parmi les plus
 * résistantes, les tardives parmi les moins résistantes : de −8,3 °C pour le
 * merisier à −3,5 °C pour le frêne (Vitasse, Lenz, Hoch et Körner 2014,
 * *J. Ecol.* 102:981, sept essences). Une fois cette résistance prise en
 * compte, la date de débourrement converge vers un risque presque nul (Lenz et
 * al. 2016, *Funct. Ecol.* 30:1480). Et chez le noyer, l'exposition décide plus
 * que la vulnérabilité : les génotypes précoces gèlent, les tardifs échappent
 * (Charrier et al. 2018, *Plant Cell Environ.* 41:1008).
 *
 * Le seuil n'est donc pas un trait d'essence : il se lit sur le cumul de
 * débourrement que l'atlas porte déjà (`debourrementDJ`). Une droite passe par
 * le hêtre (240 °C·j, −5 °C, la sensibilité des feuilles fraîches selon Menzel
 * et al. 2015) et le frêne (310 °C·j, −3,5 °C, Vitasse et al. 2014), bornée par
 * l'étendue mesurée à l'émergence. La droite elle-même est *(à calibrer)*.
 * Le noyer hybride suit le commun tant que sa fiche n'a pas tranché son
 * calendrier (#213) : sa moindre sensibilité tombera de son débourrement, comme
 * le dit Charrier.
 *
 * Ces températures sont celles d'un tissu en enceinte ; le moteur lit l'air sous
 * abri (`tMinAbsC`), et une feuille rayonne par nuit claire sous l'air qui
 * l'entoure. D'où un écart air-feuille : les modèles posent leur seuil en air
 * plus haut, −1,65 ± 0,85 °C pour le hêtre (Meyer et al. 2024, *Biogeosciences*
 * 21:1355), et Dittmar (2006) ne voit aucun effet au-dessus de −3 °C.
 *
 * ─── **ce que l'arbre perd**, **et ce qu'il paie** ─────────────────────────────────────
 * Le feuillage sorti, d'un coup : c'est la règle de LPJ-GUESS-FROST (Meyer et
 * al. 2024), qui retrouve les pertes des cernes du hêtre. Les bourgeons dormants
 * repartent ensuite — 19 à 38 jours après le gel dans la hêtraie de Menzel,
 * 40 jours sans feuilles puis 20 de reverdissement chez Meyer. Pendant ce temps
 * l'arbre ne gagne rien et entretient tout ce qu'il porte : chaque semaine de
 * feuillage perdu se paie sur les réserves comme une semaine sans revenu
 * (`reserves.ts`, dont l'ancre est justement la défoliation totale : un feuillu
 * en supporte une par an, et meurt à la deuxième ou troisième consécutive). Les
 * réserves se refont vite, mais aux dépens de la croissance (Baumgarten, Gessler
 * et Vitasse 2023, *Funct. Ecol.*).
 *
 * L'abri vient de #407 : la nuit se juge sous le couvert qui surplombe l'arbre.
 * Le semis du milieu d'une coupe gèle, celui qui pousse sous un houppier non —
 * c'est la régénération sous abri des forestiers.
 *
 * *Ce qui n'est pas représenté* : les jeunes plants débourrent plus tôt que les
 * adultes et gèlent donc plus souvent (Vitasse et al. 2014) — le calendrier du
 * moteur est celui de l'essence ; la flèche gelée et la fourche (frêne, noyer) ;
 * la pousse elle-même, qui n'est pas retirée à la hauteur ; les résineux, dont
 * le moteur ne suit pas la pousse de printemps.
 */

import type { EspeceV0 } from "./especes";
import {
  type ContextePhenologique,
  debourrementExigeDJ,
  ETALEMENT_DEBOURREMENT_DJ,
} from "./phenologie";

/** Cumul et seuil de tissu de l'ancrage tardif : le frêne (Vitasse et al. 2014). */
const ANCRE_TARDIVE_DJ = 310;
const ANCRE_TARDIVE_C = -3.5;
/** Cumul et seuil de tissu de l'ancrage du milieu : le hêtre (Menzel et al. 2015). */
const ANCRE_HETRE_DJ = 240;
const ANCRE_HETRE_C = -5;
/** Le plus résistant mesuré à l'émergence : le merisier, −8,3 °C (Vitasse et al. 2014). */
export const SEUIL_TISSU_LE_PLUS_BAS_C = -8.3;
/** Le moins résistant mesuré : le frêne, −3,5 °C (Vitasse et al. 2014). */
export const SEUIL_TISSU_LE_PLUS_HAUT_C = -3.5;

/**
 * Écart entre l'air sous abri et la feuille par nuit de gel, °C *(à calibrer : 2 à
 * 3,4 °C, entre le « rien au-dessus de −3 °C » de Dittmar 2006 et le seuil d'air
 * de −1,65 °C que Meyer et al. 2024 calent pour un hêtre dont la feuille
 * fraîche tient à −5 °C)*.
 */
export const ECART_AIR_FEUILLE_C = 2.5;

/**
 * Cumul au-delà du feuillage déployé pendant lequel la jeune feuille reste
 * tendre, °C·j : deux à trois semaines de mai *(à calibrer)*. La résistance remonte
 * à mesure que la feuille mûrit (Vitasse et al. 2014).
 */
export const DURCISSEMENT_DJ = 100;

/**
 * Semaines sans feuilles après le gel, puis semaines de reverdissement : 19 à
 * 38 jours avant que les bourgeons dormants repartent (Menzel et al. 2015), 40
 * jours puis 20 dans LPJ-GUESS-FROST (Meyer et al. 2024).
 */
export const REFEUILLAISON_ATTENTE_SEMAINES = 5;
export const REFEUILLAISON_DUREE_SEMAINES = 3;

/** Température de tissu qui grille la jeune feuille de cette essence, °C. */
export function seuilTissuGelPousses(espece: EspeceV0): number {
  const pente = (ANCRE_TARDIVE_C - ANCRE_HETRE_C) / (ANCRE_TARDIVE_DJ - ANCRE_HETRE_DJ);
  const t = ANCRE_HETRE_C + pente * (espece.phenologie.debourrementDJ - ANCRE_HETRE_DJ);
  return Math.min(SEUIL_TISSU_LE_PLUS_HAUT_C, Math.max(SEUIL_TISSU_LE_PLUS_BAS_C, t));
}

/** Minimum de l'air sous lequel la jeune feuille de cette essence gèle, °C. */
export function seuilAirGelPousses(espece: EspeceV0): number {
  return seuilTissuGelPousses(espece) + ECART_AIR_FEUILLE_C;
}

/**
 * Le feuillage de cette essence est-il tendre cette semaine ? Sorti (au-delà du
 * plancher d'un semi-persistant), et pas encore durci. Un sempervirent ne
 * débourre pas dans le moteur : jamais.
 */
export function feuillageTendre(
  espece: EspeceV0,
  ctx: ContextePhenologique,
  partActive: number,
): boolean {
  if (!espece.lumiere.caduc || ctx.automne) return false;
  const plancher = espece.lumiere.retentionHivernale ?? 0;
  if (partActive <= plancher) return false;
  const exige = debourrementExigeDJ(espece, ctx.semainesDeFroid);
  return ctx.ddYearBase5 <= exige + ETALEMENT_DEBOURREMENT_DJ + DURCISSEMENT_DJ;
}

/**
 * Part du feuillage revenue, `semaines` après le gel ∈ [0,1] : rien pendant
 * l'attente, puis une rampe jusqu'au feuillage plein.
 */
export function refeuillaison(semaines: number): number {
  if (semaines <= REFEUILLAISON_ATTENTE_SEMAINES) return 0;
  return Math.min(1, (semaines - REFEUILLAISON_ATTENTE_SEMAINES) / REFEUILLAISON_DUREE_SEMAINES);
}
