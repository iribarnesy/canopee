/**
 * Phénologie foliaire : quand les feuilles sortent, et quand elles tombent
 * (docs/regles.md §7.2).
 *
 * Le moteur travaillait avec un booléen — `leavesOn = tMean > 6 °C` — et
 * faisait tomber toute la litière en une semaine. Deux couperets, et le premier
 * était en plus IDENTIQUE POUR TOUTES LES ESPÈCES : un bouleau et un frêne
 * débourraient le même jour, ce qui est faux de six semaines. Or l'ordre de
 * débourrement est un fait de terrain massif — c'est lui qui décide de qui
 * profite de la lumière d'avril sous un couvert encore nu.
 *
 * Le modèle retenu combine les deux commandes que la littérature donne comme
 * indissociables :
 *
 *  - le FORÇAGE : un cumul de degrés-jours base 5 °C depuis le 1ᵉʳ janvier,
 *    propre à chaque espèce ;
 *  - la PHOTOPÉRIODE : un seuil de durée du jour en dessous duquel rien ne
 *    part, quelle que soit la chaleur.
 *
 * Le second n'est pas un raffinement : sans lui, le modèle est absurde au sud.
 * Notre propre série le montre — au 12 avril, la lande girondine a cumulé
 * 341 °C·j quand le limon du Nord n'en a que 123. Un seuil de forçage seul
 * ferait donc débourrer les Landes six semaines avant le Nord, là où l'écart
 * réel est de deux à trois. C'est précisément ce que la photopériode empêche,
 * et c'est pourquoi le hêtre, le chêne et l'épicéa y sont notoirement
 * sensibles : elle ne se réchauffe pas, elle.
 *
 * L'automne suit la même logique en sens inverse : la sénescence part quand le
 * jour raccourcit sous un seuil, et l'étalement fait tomber la litière sur un
 * mois au lieu d'une semaine.
 *
 * Et l'automne se joue en DEUX temps, qu'on distingue ici : la feuille jaunit
 * d'abord — la chlorophylle se démonte, l'azote est rapatrié — puis elle
 * tombe, deux à trois semaines plus tard.
 *
 * D'où TROIS parts foliaires, qu'il faut tenir séparées :
 *
 *  - `partFoliaireOmbrageante` : ce qui intercepte la lumière, y compris les
 *    feuilles mortes qu'un marcescent garde accrochées. C'est Beer-Lambert.
 *  - `partFoliaireActive` : le feuillage vivant déployé. C'est lui qui commande
 *    la croissance et la transpiration (tick.ts), en produit avec un facteur
 *    thermique qui ne porte plus que la vitesse du métabolisme.
 *  - `partFoliaireAssimilante` : le vivant ENCORE VERT, soit le précédent moins
 *    ce que `senescenceFoliaire` a jauni.
 *
 * *Ce que la troisième ne commande pas encore* : la croissance. Un houppier
 * entièrement doré d'octobre produit donc toujours. Brancher l'assimilante à
 * la place de l'active suppose de recalibrer `GROWING_WEEKS` et `pousseMaxMAn`
 * une seconde fois — mesuré avant que le premier recalibrage n'ait eu lieu :
 * la croissance baissait d'environ 5 % et deux seuils écologiques calibrés se
 * déplaçaient, sans que la sortie se rapproche du terrain. À remesurer sur la
 * calibration actuelle. Voir docs/realisme.md, « le houppier doré produit
 * encore ».
 *
 * Enfin, le BESOIN DE FROID. Un bourgeon n'est pas une graine qu'on chauffe :
 * il sort de dormance en accumulant d'abord des semaines fraîches, et ce n'est
 * qu'ensuite que la chaleur le fait partir. C'est le paradoxe bien documenté du
 * réchauffement sur la phénologie de printemps.
 *
 * Mesuré sur le limon du Nord, hêtre : onze semaines de froid à climat figé
 * contre quatre sous SSP5-8.5 en 2090, ce qui porte son exigence de 315 à
 * 420 °C·j. L'effet AMORTIT l'avance sans la renverser à ces latitudes — le
 * hêtre débourre quand même plus tôt, simplement moins tôt qu'il ne l'aurait
 * fait sans dormance. Le renversement complet ne s'observe que là où l'hiver
 * est déjà doux.
 *
 * Enfin la MARCESCENCE, qui oblige à distinguer deux feuillages là où le moteur
 * n'en comptait qu'un. Le charme garde tout l'hiver ses feuilles MORTES,
 * attachées jusqu'à ce que les bourgeons les poussent en avril. Elles font
 * encore de l'ombre, mais elles ne photosynthétisent plus. Confondre ce cas
 * avec le troène SEMI-PERSISTANT — qui, lui, garde des feuilles VIVANTES —
 * reviendrait à faire pousser un charme en janvier ; le confondre avec un
 * caduc ordinaire reviendrait à éclairer son sous-étage tout l'hiver, alors
 * qu'un taillis de charme est notoirement sombre en février.
 *
 * D'où deux parts foliaires : celle qui TRAVAILLE (`partFoliaireActive`, le
 * feuillage vivant, seul à compter pour la croissance et la litière) et celle
 * qui OMBRE (`partFoliaireOmbrageante`, feuilles mortes comprises, seule à
 * entrer dans Beer-Lambert). Elles ne se séparent que chez les marcescents.
 *
 * Deux limites assumées. Le retour de litière d'un marcescent suit encore la
 * part active, donc l'automne, alors que ses feuilles ne tombent qu'au
 * débourrement suivant. Et l'abri au vent (light.ts) ne regarde aucun
 * feuillage, pas même celui des caducs : la marcescence n'y change donc rien
 * pour l'instant.
 */

import type { EspeceV0 } from "./especes";
import { dureeDuJourH, midWeekDayOfYear } from "./meteo";

/**
 * Semaine du solstice d'été : au-delà, le jour raccourcit. C'est le
 * basculement qui donne son sens à la porte photopériodique — onze heures de
 * jour en mars ne veulent pas dire la même chose qu'en octobre.
 */
export const SOLSTICE_ETE_SEMAINE = 25;
/**
 * Semaine où la chute des feuilles commence à se compter. La sénescence
 * s'enclenche quand le jour passe sous son seuil ; on date le compteur
 * d'étalement à partir d'ici plutôt que de porter un état de plus.
 */
export const SENESCENCE_DEBUT_SEMAINE = 40;
/** Sur combien de degrés-jours le feuillage se déploie, une fois parti. */
export const ETALEMENT_DEBOURREMENT_DJ = 90;
/** Durée du jour à partir de laquelle la sénescence s'enclenche, heures. */
export const SEUIL_SENESCENCE_H = 11.5;
/** Semaines sur lesquelles les feuilles tombent une fois la sénescence lancée. */
export const ETALEMENT_CHUTE_SEMAINES = 5;
/**
 * Semaines sur lesquelles une feuille ENCORE ACCROCHÉE jaunit et cesse
 * d'assimiler.
 *
 * La sénescence n'est pas la chute : c'est ce qui la précède. Le jour
 * raccourcit, la plante démonte sa chlorophylle et rapatrie son azote, et la
 * feuille devient jaune, puis rousse — **avant** de se détacher. Deux à trois
 * semaines séparent les deux, et c'est ce décalage qui fait tout l'automne :
 * un houppier presque plein, mais entièrement doré, qui ne produit plus rien.
 *
 * Plus court que `ETALEMENT_CHUTE_SEMAINES`, donc : le jaunissement DEVANCE
 * l'abscission. La conséquence n'est pas décorative — une feuille jaune a
 * cessé de photosynthétiser, donc l'arbre ne pousse plus et ne transpire
 * presque plus, alors que la température, elle, autoriserait encore les deux.
 *
 * *(à calibrer : les suivis phénologiques donnent deux à quatre semaines entre
 * le pic de coloration et la chute, selon l'essence et l'année)*
 */
export const ETALEMENT_SENESCENCE_SEMAINES = 2;
/** Largeur de la porte photopériodique, heures : elle ne s'ouvre pas d'un coup. */
export const LARGEUR_PORTE_H = 1.2;

/**
 * Températures entre lesquelles une semaine compte comme du froid utile. En
 * dessous de zéro le bourgeon est gelé et rien ne progresse ; au-dessus de dix
 * degrés il ne s'agit plus de froid *(à calibrer)*.
 */
export const FROID_MIN_C = 0;
export const FROID_MAX_C = 10;

/**
 * De combien le besoin de forçage enfle quand le froid n'a pas été satisfait.
 * Un doublement : un hiver sans froid demande deux fois plus de chaleur pour
 * débourrer, ce qui décale de plusieurs semaines *(à calibrer)*.
 */
export const PENALITE_SANS_FROID = 1;

/** Une semaine compte-t-elle comme du froid utile à la levée de dormance ? */
export function semaineDeFroid(tMeanC: number): boolean {
  return tMeanC >= FROID_MIN_C && tMeanC <= FROID_MAX_C;
}

/**
 * Cumul de forçage réellement exigé, une fois le froid pris en compte.
 * Satisfait, le besoin nominal suffit ; pas du tout satisfait, il double.
 */
export function debourrementExigeDJ(espece: EspeceV0, semainesDeFroid: number): number {
  const satisfait = Math.min(
    1,
    semainesDeFroid / Math.max(1, espece.phenologie.besoinFroidSemaines),
  );
  return espece.phenologie.debourrementDJ * (1 + PENALITE_SANS_FROID * (1 - satisfait));
}

/**
 * Part du feuillage VIVANT déployé ∈ [0,1] pour une espèce donnée : celui qui
 * assimile, et lui seul. C'est la part qui commande la croissance et le retour
 * de litière — les feuilles marcescentes n'y entrent pas, elles sont mortes.
 *
 * `ddYearBase5` est le cumul de degrés-jours depuis le 1ᵉʳ janvier,
 * `dureeJourH` la durée du jour de la semaine, `automne` true après le
 * solstice d'été (c'est le raccourcissement qui déclenche, pas la durée seule :
 * onze heures de jour en mars ne veulent pas dire la même chose qu'en octobre).
 */
export function partFoliaireActive(
  espece: EspeceV0,
  ddYearBase5: number,
  dureeJourH: number,
  automne: boolean,
  semainesDepuisSenescence: number,
  semainesDeFroid = Number.POSITIVE_INFINITY,
): number {
  // Les sempervirents gardent leur feuillage : ni débourrement ni chute.
  if (!espece.lumiere.caduc) return 1;

  // Les SEMI-PERSISTANTS gardent une partie de leur feuillage : ils ne se
  // dénudent jamais tout à fait. C'est un plancher, pas un régime à part.
  const plancher = espece.lumiere.retentionHivernale ?? 0;

  if (automne) {
    if (dureeJourH > SEUIL_SENESCENCE_H) return 1;
    const tombe = 1 - semainesDepuisSenescence / ETALEMENT_CHUTE_SEMAINES;
    return Math.max(plancher, Math.min(1, tombe));
  }

  const pheno = espece.phenologie;
  // Forçage : le cumul de chaleur depuis janvier, contre un besoin que le
  // manque de froid a pu gonfler.
  const exige = debourrementExigeDJ(espece, semainesDeFroid);
  const forcage = Math.min(1, Math.max(0, (ddYearBase5 - exige) / ETALEMENT_DEBOURREMENT_DJ));
  // Porte photopériodique : tant que le jour est trop court, rien ne part.
  const porte = Math.min(1, Math.max(0, (dureeJourH - pheno.seuilJourH) / LARGEUR_PORTE_H));
  // Le plancher vaut au printemps comme à l'automne, et c'est tout l'intérêt :
  // les feuilles qu'un semi-persistant a gardées en décembre sont encore là en
  // mars. Sans cette ligne il se dénudait à la Saint-Sylvestre pour reverdir au
  // débourrement — soit exactement le contraire d'un semi-persistant.
  return Math.max(plancher, Math.min(forcage, porte));
}

/**
 * Ce qu'une feuille morte intercepte, rapporté à une feuille verte. Brunie,
 * enroulée, elle laisse passer davantage, et le houppier s'est éclairci de
 * toutes celles que le vent a emportées *(à calibrer)*.
 */
export const OPACITE_FEUILLE_MORTE = 0.55;

/**
 * Part du feuillage qui INTERCEPTE la lumière ∈ [0,1] : le feuillage vivant,
 * plus les feuilles mortes qu'un marcescent garde attachées. C'est cette
 * part-là qui entre dans Beer-Lambert (light.ts), et elle seule.
 */
export function partFoliaireOmbrageante(
  espece: EspeceV0,
  ddYearBase5: number,
  dureeJourH: number,
  automne: boolean,
  semainesDepuisSenescence: number,
  semainesDeFroid = Number.POSITIVE_INFINITY,
): number {
  const active = partFoliaireActive(
    espece,
    ddYearBase5,
    dureeJourH,
    automne,
    semainesDepuisSenescence,
    semainesDeFroid,
  );
  const marcescence = espece.lumiere.marcescence ?? 0;
  if (marcescence <= 0) return active;
  // Les feuilles mortes occupent la place que le feuillage vivant libère :
  // elles s'installent à mesure qu'il meurt à l'automne et s'en vont à mesure
  // que les bourgeons les poussent au printemps. Un complément, donc, pas une
  // somme — sinon un charme d'octobre ombrerait plus qu'un charme de juillet.
  return active + OPACITE_FEUILLE_MORTE * marcescence * (1 - active);
}

/**
 * Avancement de la SÉNESCENCE des feuilles encore accrochées ∈ [0,1] :
 * 0 = vertes et fonctionnelles, 1 = entièrement jaunies, vidées de leur azote
 * et hors service.
 *
 * C'est la grandeur qui manquait. `partFoliaireActive` dit COMBIEN de feuillage
 * vivant reste ; celle-ci dit DANS QUEL ÉTAT il est. Les deux sont
 * indépendantes : à la mi-octobre un chêne peut porter les trois quarts de son
 * feuillage et n'en tirer plus rien (sénescence à 1).
 *
 * Un sempervirent ne sénesce pas de façon saisonnière : ses aiguilles se
 * renouvellent sur plusieurs années, sans automne. Il reste donc à 0.
 *
 * Ne pas confondre avec la MARCESCENCE (`OPACITE_FEUILLE_MORTE`,
 * `partFoliaireOmbrageante`), qui est l'étape d'après : la sénescence vide la
 * feuille de son azote et la fait jaunir, la marcescence dit qu'elle reste
 * accrochée après sa mort. Un charme fait les deux, un bouleau seulement la
 * première.
 */
export function senescenceFoliaire(
  espece: EspeceV0,
  dureeJourH: number,
  automne: boolean,
  semainesDepuisSenescence: number,
): number {
  if (!espece.lumiere.caduc) return 0;
  if (!automne || dureeJourH > SEUIL_SENESCENCE_H) return 0;
  return Math.min(1, Math.max(0, semainesDepuisSenescence / ETALEMENT_SENESCENCE_SEMAINES));
}

/**
 * Feuillage ASSIMILANT ∈ [0,1] : ce qui est déployé, vivant **et** encore vert.
 *
 * Trois parts foliaires cohabitent maintenant, et il faut les tenir distinctes
 * — c'est la seule difficulté de ce module :
 *
 * - `partFoliaireOmbrageante` : ce qui intercepte la lumière, feuilles mortes
 *   marcescentes comprises. La plus grande des trois. C'est Beer-Lambert.
 * - `partFoliaireActive` : le feuillage vivant déployé, marcescence exclue.
 * - `partFoliaireAssimilante` : celui-ci, la part vivante **et pas encore
 *   jaunie**. La plus petite. Un houppier doré d'octobre est déployé, vivant,
 *   et ne produit plus rien.
 *
 * **Elle n'est PAS branchée sur la croissance**, et c'est délibéré : mesuré, le
 * branchement déplace des seuils écologiques calibrés (`docs/realisme.md`).
 * Elle existe pour le rendu — colorer un houppier demande de savoir s'il
 * travaille encore — et pour le jour où la calibration sera refaite.
 */
export function partFoliaireAssimilante(
  espece: EspeceV0,
  ddYearBase5: number,
  dureeJourH: number,
  automne: boolean,
  semainesDepuisSenescence: number,
  semainesDeFroid = Number.POSITIVE_INFINITY,
): number {
  const vivante = partFoliaireActive(
    espece,
    ddYearBase5,
    dureeJourH,
    automne,
    semainesDepuisSenescence,
    semainesDeFroid,
  );
  const jaunie = senescenceFoliaire(espece, dureeJourH, automne, semainesDepuisSenescence);
  return vivante * (1 - jaunie);
}

/**
 * La sénescence est-elle enclenchée ? Pour les usages qui n'ont pas d'espèce
 * sous la main (le calendrier de la litière est commun).
 */
export function senescenceEnCours(dureeJourH: number, automne: boolean): boolean {
  return automne && dureeJourH <= SEUIL_SENESCENCE_H;
}

/**
 * Tout ce qu'il faut savoir de la SAISON pour calculer une part foliaire, sans
 * avoir l'état de la partie sous la main.
 *
 * Cinq scalaires : deux viennent de l'état (le cumul de chaleur et le froid
 * accumulé), trois se déduisent de la latitude et de la semaine. C'est
 * exactement ce que `partFoliaire` demande — et ça tient dans un instantané,
 * là où une valeur par arbre dupliquerait ce que l'espèce sait déjà. Si la
 * phénologie se raffine, le contexte grossit et les deux appelants suivent.
 */
export interface ContextePhenologique {
  /** cumul de degrés-jours base 5 °C depuis le 1ᵉʳ janvier (GameState) */
  ddYearBase5: number;
  /** durée du jour au milieu de la semaine, heures */
  jourH: number;
  /** true après le solstice d'été : le jour raccourcit */
  automne: boolean;
  /** semaines écoulées depuis le début du compteur de chute */
  semainesDepuisSenescence: number;
  /** semaines de froid utile accumulées pour lever la dormance (GameState) */
  semainesDeFroid: number;
}

/**
 * Le contexte phénologique d'une semaine. `semaineAnnee` est la semaine DANS
 * L'ANNÉE (0–51), pas la semaine absolue de la partie.
 *
 * Un seul endroit calcule ce calendrier : le tick s'en sert pour faire pousser
 * les feuilles, le rendu pour les colorer. Deux copies dériveraient — un
 * houppier doré côté écran, un houppier vert côté moteur.
 */
export function contextePhenologique(
  latitudeDeg: number,
  semaineAnnee: number,
  ddYearBase5: number,
  semainesDeFroid: number,
): ContextePhenologique {
  const automne = semaineAnnee >= SOLSTICE_ETE_SEMAINE;
  return {
    ddYearBase5,
    jourH: dureeDuJourH(latitudeDeg, midWeekDayOfYear(semaineAnnee)),
    automne,
    semainesDepuisSenescence: automne ? Math.max(0, semaineAnnee - SENESCENCE_DEBUT_SEMAINE) : 0,
    semainesDeFroid,
  };
}

/** Le feuillage qui TRAVAILLE, pris dans son contexte : la forme qu'appellent le tick et le rendu. */
export function partFoliaireActiveDans(espece: EspeceV0, ctx: ContextePhenologique): number {
  return partFoliaireActive(
    espece,
    ctx.ddYearBase5,
    ctx.jourH,
    ctx.automne,
    ctx.semainesDepuisSenescence,
    ctx.semainesDeFroid,
  );
}

/** Le feuillage qui OMBRE, pris dans son contexte : ce que la lumière traverse. */
export function partFoliaireOmbrageanteDans(espece: EspeceV0, ctx: ContextePhenologique): number {
  return partFoliaireOmbrageante(
    espece,
    ctx.ddYearBase5,
    ctx.jourH,
    ctx.automne,
    ctx.semainesDepuisSenescence,
    ctx.semainesDeFroid,
  );
}

/**
 * La sénescence est-elle enclenchée ? Le nom suit `partFoliaireDans` : « dans »
 * veut dire « pris dans son contexte ».
 *
 * Ne pas confondre avec `senescenceFoliaire`, qui n'est pas un oui/non mais un
 * AVANCEMENT ∈ [0,1] : la première dit que l'automne a commencé, la seconde à
 * quel point le feuillage a jauni. C'est cette dernière qu'il faut pour colorer
 * un houppier ; celle-ci ne sert qu'à savoir si le compteur tourne.
 */
export function senescenceEnCoursDans(ctx: ContextePhenologique): boolean {
  return senescenceEnCours(ctx.jourH, ctx.automne);
}

/** `senescenceFoliaire` prise dans son contexte : l'avancement du jaunissement. */
export function senescenceDans(espece: EspeceV0, ctx: ContextePhenologique): number {
  return senescenceFoliaire(espece, ctx.jourH, ctx.automne, ctx.semainesDepuisSenescence);
}

/**
 * `partFoliaireAssimilante` prise dans son contexte : déployé, vivant ET vert,
 * donc ce qui travaille. C'est la forme que le rendu appellera pour savoir si
 * un arbre est en pleine production ou déjà à l'arrêt.
 */
export function partFoliaireAssimilanteDans(espece: EspeceV0, ctx: ContextePhenologique): number {
  return partFoliaireAssimilante(
    espece,
    ctx.ddYearBase5,
    ctx.jourH,
    ctx.automne,
    ctx.semainesDepuisSenescence,
    ctx.semainesDeFroid,
  );
}
