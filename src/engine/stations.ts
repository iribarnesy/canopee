/**
 * Stations V0 de développement/test — caricatures contrastées pour éprouver
 * le moteur (sécheresse, engorgement, pauvreté en azote). Les 6 vraies
 * stations françaises documentées (docs/regles.md §2.2) arrivent en V1 avec
 * les données Météo-France/DRIAS.
 */

import { type EauDeSurface, SANS_EAU } from "./eau_surface";
import type { SyntheticClimate } from "./meteo";
import { bordersUniformes, entourageDeLaStation } from "./paysage";
import { phosphoreAssimilableGM2, potassiumEchangeableGM2 } from "./pk";
import {
  carboneProfilTHa,
  drainageProfilMmSemaine,
  horizon,
  mineralisationPotentielleKgHaSemaine,
  phSurface,
  porositeProfilMm,
  ruProfilMm,
  type SoilProfile,
} from "./soil";
import type { Station } from "./state";

export interface StationClimat {
  station: Station;
  climat: SyntheticClimate;
}

/**
 * Construit une station à partir de son **profil de sol** : réserve utile,
 * drainage, porosité, minéralisation, carbone et pH sont dérivés de la
 * physique du sol (soil.ts), jamais saisis. C'est ce qui permettra de générer
 * des stations quelconques — critère de réalisme A9.
 */
export function stationDepuisProfil(
  base: Omit<
    Station,
    | "ruMm"
    | "excessCapacityMm"
    | "drainagePerWeekMm"
    | "mineralizationPotentialKgHaWeek"
    | "initialSoilCTHa"
    | "phInitial"
    | "phosphoreInitialGM2"
    | "potassiumInitialGM2"
    | "voisinage"
    | "gibierParHa"
    | "sanglierParHa"
    | "depositionNKgHaAn"
    | "ventExposition"
    | "bordures"
    | "eau"
  > & { profil: SoilProfile; initialMineralNKgHa: number; eau?: EauDeSurface },
): Station {
  const { profil, eau, ...reste } = base;
  // Tout ce qui vient de l'**entourage** se déduit du paysage, d'un bloc : semis,
  // gibier, dépôts d'azote, vent. Les saisir un par un permettait de décrire
  // des voisinages incohérents (paysage.ts).
  // Par défaut, les quatre côtés portent le même paysage ; le joueur peut les
  // choisir séparément au lancement (paysage.ts).
  const bordures = bordersUniformes(reste.paysageId);
  return {
    ...reste,
    profil,
    // Sans mention contraire, une parcelle n'a pas d'eau libre : le ruisseau
    // et la mare se choisissent (eau_surface.ts).
    eau: eau ?? SANS_EAU,
    bordures,
    ...entourageDeLaStation(bordures, phSurface(profil), ruProfilMm(profil)),
    ruMm: ruProfilMm(profil),
    excessCapacityMm: porositeProfilMm(profil),
    drainagePerWeekMm: Math.min(drainageProfilMmSemaine(profil), reste.drainageExterneMmSemaine),
    mineralizationPotentialKgHaWeek: mineralisationPotentielleKgHaSemaine(profil),
    initialSoilCTHa: carboneProfilTHa(profil),
    phInitial: phSurface(profil),
    // Stocks de départ dérivés du sol, comme tout le reste : l'argile porte
    // le potassium, la matière organique et le pH décident du phosphore
    // assimilable (pk.ts).
    phosphoreInitialGM2: phosphoreAssimilableGM2(profil),
    potassiumInitialGM2: potassiumEchangeableGM2(profil),
  };
}

/** Lande sableuse sèche et pauvre (esprit Sud-Gironde) : RU faible, drainage éclair. */
export const LANDE_SECHE: StationClimat = {
  station: stationDepuisProfil({
    id: "lande-seche",
    relief: { altitudeM: 60, pentePct: 1, expositionDeg: 180, forme: "plan", bassinAmontHa: 0 },
    paysageId: "lande-ouverte",
    nom: "Lande sableuse sèche",
    latitudeDeg: 44.5,
    // Podzol landais : un horizon de surface acide, un sable lessivé épais où
    // les racines descendent, puis l'alios induré qui les arrête et fait
    // stagner l'eau l'hiver.
    profil: [
      horizon(20, { sable: 85, limon: 10, argile: 5 }, { moPct: 1.8, ph: 4.5 }),
      horizon(55, { sable: 92, limon: 6, argile: 2 }, { moPct: 0.4, ph: 4.8 }),
      horizon(40, { sable: 88, limon: 8, argile: 4 }, { moPct: 0.3, ph: 5, induration: 0.9 }),
    ],
    initialMineralNKgHa: 15,
    // Nappe perchée sur l'alios, autour de deux mètres et demi — plus haute
    // l'hiver, plus basse l'été. Elle reste sous le profil : le sable
    // au-dessus est à sec en été, et c'est bien ce contraste qui fait la
    // lande. *(Une nappe plus haute la rendrait confortable, et les espèces
    // frugales n'y auraient plus aucun avantage : c'est ce que les essais ont
    // montré en la remontant à 90 cm.)*
    profondeurNappeEquilibreCm: 420,
    remonteeNappeMmSemaine: 0,
    // Nappe perchée hivernale sur l'alios : l'eau ne part pas vite.
    drainageExterneMmSemaine: 30,
    herbeInitiale: 0.5, // lande rase : callune et molinie couvrent déjà le sol // les Landes brûlent : c'est LE risque de la station
    coteM: 100,
  }),
  climat: {
    tMeanAnnual: 13.5,
    tSeasonalAmplitude: 7.5,
    tDiurnalRange: 11,
    rainAnnualMm: 800,
    rainWinterShare: 0.68,
  },
};

/** Fond de vallée engorgé : sol riche mais drainage très lent → anoxie hivernale. */
export const VALLEE_ENGORGEE: StationClimat = {
  station: stationDepuisProfil({
    id: "vallee-engorgee",
    relief: { altitudeM: 80, pentePct: 2, expositionDeg: 180, forme: "vallon", bassinAmontHa: 6 },
    paysageId: "massif-forestier",
    nom: "Fond de vallée engorgé",
    latitudeDeg: 47,
    // Alluvions limono-argileuses profondes : réserve énorme, mais l'argile
    // draine si lentement que l'hiver l'eau stagne.
    profil: [
      horizon(30, { sable: 25, limon: 50, argile: 25 }, { moPct: 3, ph: 6.5 }),
      horizon(55, { sable: 20, limon: 45, argile: 35 }, { moPct: 1.2, ph: 6.6 }),
    ],
    initialMineralNKgHa: 40,
    // Fond de vallée : la nappe est juste sous les pieds toute l'année, et le
    // réseau régional la réalimente en permanence.
    profondeurNappeEquilibreCm: 40,
    remonteeNappeMmSemaine: 12,
    // Nappe affleurante : l'exutoire est saturé, rien ne s'évacue.
    drainageExterneMmSemaine: 5,
    herbeInitiale: 0.8, // prairie humide dense // fond de vallée humide
    coteM: 100,
  }),
  climat: {
    tMeanAnnual: 12,
    tSeasonalAmplitude: 7,
    tDiurnalRange: 9,
    rainAnnualMm: 1050,
    rainWinterShare: 0.62,
  },
};

/** Limon profond riche : la station confort, aucune contrainte forte. */
export const LIMON_RICHE: StationClimat = {
  station: stationDepuisProfil({
    id: "limon-riche",
    relief: { altitudeM: 110, pentePct: 4, expositionDeg: 180, forme: "plan", bassinAmontHa: 0.5 },
    paysageId: "bocage",
    nom: "Limon profond riche",
    latitudeDeg: 49.5,
    // Limon éolien profond, le sol de référence des plateaux du Nord.
    profil: [
      horizon(35, { sable: 15, limon: 70, argile: 15 }, { moPct: 2.2, ph: 7 }),
      horizon(65, { sable: 15, limon: 70, argile: 15 }, { moPct: 0.8, ph: 7.2 }),
    ],
    initialMineralNKgHa: 60,
    // Plateau limoneux bien drainé : la nappe est hors de portée des racines.
    profondeurNappeEquilibreCm: 630,
    remonteeNappeMmSemaine: 0,
    drainageExterneMmSemaine: Number.POSITIVE_INFINITY, // plateau bien drainé
    herbeInitiale: 0.2, // sortie de culture : le sol se réenherbe // limon frais du Nord
    coteM: 100,
  }),
  climat: {
    tMeanAnnual: 11.5,
    tSeasonalAmplitude: 7,
    tDiurnalRange: 8,
    rainAnnualMm: 750,
    rainWinterShare: 0.55,
  },
};

/** Même limon, mais appauvri en azote (MO effondrée) : isole le facteur N. */
export const LIMON_PAUVRE_N: StationClimat = {
  station: stationDepuisProfil({
    ...LIMON_RICHE.station,
    id: "limon-pauvre-n",
    relief: { altitudeM: 95, pentePct: 3, expositionDeg: 0, forme: "plan", bassinAmontHa: 0.3 },
    paysageId: "plaine-cerealiere",
    nom: "Limon profond pauvre en azote",
    // Même limon, mais matière organique effondrée par des décennies de
    // grande culture (§2.2) : il retient moins l'eau et minéralise peu.
    profil: [
      horizon(30, { sable: 15, limon: 70, argile: 15 }, { moPct: 0.7, ph: 7 }),
      horizon(70, { sable: 15, limon: 70, argile: 15 }, { moPct: 0.4, ph: 7.2 }),
    ],
    initialMineralNKgHa: 5,
  }),
  climat: LIMON_RICHE.climat,
};

/**
 * Limon sableux acide de Sologne : le sol lessivé et podzolisant des sables et
 * argiles de l'Orléanais, entre Loire et Cher.
 *
 * Il manquait, et son absence se voyait : la station de référence du moteur est
 * à pH 7, or le châtaignier s'arrête à 6,5 et le houx à 7. Deux espèces de
 * l'atlas ne pouvaient donc vivre sur **aucune** station de comparaison, et l'essai
 * des hauteurs devait s'en fabriquer une à la volée pour les mesurer. Ce
 * n'était pas un défaut du modèle de pH — un châtaignier ne pousse pas sur
 * calcaire, c'est un fait — mais une lacune du catalogue.
 *
 * Ce n'est pas « le limon riche avec un pH plus bas » : un sol lessivé et
 * acide diffère par plus que son pH. Il est plus sableux, sa matière
 * organique s'accumule parce qu'elle se minéralise lentement, et son azote
 * minéral disponible est plus bas pour la même raison. L'acidité est plus forte
 * en surface, où la litière l'entretient, qu'en profondeur.
 *
 * Ce qui y est chez soi : châtaignier, houx, bouleau, ajonc, callune, genêt —
 * une bonne part de l'atlas, et précisément celle qui n'avait pas de terrain.
 */
export const LIMON_ACIDE: StationClimat = {
  station: stationDepuisProfil({
    id: "limon-acide",
    relief: { altitudeM: 110, pentePct: 2, expositionDeg: 180, forme: "plan", bassinAmontHa: 0.4 },
    paysageId: "bocage",
    nom: "Limon sableux acide (Sologne)",
    latitudeDeg: 47.5,
    profil: [
      horizon(30, { sable: 30, limon: 55, argile: 15 }, { moPct: 3, ph: 5 }),
      horizon(60, { sable: 35, limon: 50, argile: 15 }, { moPct: 1, ph: 5.4 }),
    ],
    // La minéralisation est lente en sol acide : la matière organique
    // s'accumule, mais elle libère peu.
    initialMineralNKgHa: 30,
    profondeurNappeEquilibreCm: 500,
    remonteeNappeMmSemaine: 0,
    drainageExterneMmSemaine: Number.POSITIVE_INFINITY,
    herbeInitiale: 0.3,
    coteM: 100,
  }),
  // Même climat que la vallée engorgée, et pour une bonne raison : la Sologne
  // est à une heure de Tours, et c'est la série de Tours que la station
  // partage (data/meteo.ts). Ajouter une série demanderait de reconstruire un
  // département entier de données Météo-France ; partager celle du voisin le
  // plus proche est plus honnête que d'en inventer une.
  climat: VALLEE_ENGORGEE.climat,
};

/**
 * Friche sur limon moyen, 50 × 50 m : la station du test de succession
 * émergente — on ne plante rien, le paysage voisin colonise.
 */
export const FRICHE_LIMON: StationClimat = {
  station: stationDepuisProfil({
    id: "friche-limon",
    relief: { altitudeM: 130, pentePct: 6, expositionDeg: 180, forme: "plan", bassinAmontHa: 0.4 },
    paysageId: "lisiere-forestiere",
    nom: "Friche sur limon (succession)",
    latitudeDeg: 47.5,
    profil: [
      horizon(30, { sable: 25, limon: 60, argile: 15 }, { moPct: 2.5, ph: 6.8 }),
      horizon(50, { sable: 25, limon: 60, argile: 15 }, { moPct: 0.9, ph: 6.9 }),
    ],
    initialMineralNKgHa: 40,
    profondeurNappeEquilibreCm: 610,
    remonteeNappeMmSemaine: 0,
    drainageExterneMmSemaine: Number.POSITIVE_INFINITY,
    herbeInitiale: 0.9, // friche : l'herbe tient déjà tout le terrain
    coteM: 50,
  }),
  climat: {
    tMeanAnnual: 11.5,
    tSeasonalAmplitude: 7,
    tDiurnalRange: 8,
    rainAnnualMm: 850,
    rainWinterShare: 0.55,
  },
};

/**
 * Suberaie des Maures : **la première station du jeu qui porte un été sec**
 * (issue #212).
 *
 * Les sept autres sont tempérées océaniques ou subocéaniques, et l'atlas
 * comptait pourtant trois essences méditerranéennes — chêne-liège, arbousier,
 * chêne pubescent — dont les références de croissance sont, forcément,
 * méditerranéennes. On ne pouvait donc les caler nulle part : les confronter
 * sur un limon du Nord, c'est comparer deux climats.
 *
 * ── **la météo est réelle, et c'est ce qui a tranché** ───────────────────────
 *
 * L'issue posait la bonne question : est-ce que `rainWinterShare` suffit à
 * faire un été méditerranéen, ou est-ce que l'année synthétique lisse le creux ?
 * Mesuré sur la formule, la sinusoïde **peut** faire l'étiage — il faut monter
 * la part à 0,88 pour tomber sur les bons millimètres de juillet. Mais la
 * mesure a répondu autre chose, et de plus haut : **le maximum de pluie
 * méditerranéen n'est pas en hiver, il est en automne.**
 *
 * Le Luc (Var), poste 83031001, soixante ans de relevés quotidiens
 * (1964-2023, Météo-France, licence ouverte) :
 *
 *   mois   J   F   M   A   M   J   J   A   S    O    N   D
 *   mm    78  62  57  66  62  44  20  42  72  118  113  84
 *
 * Octobre et novembre pèsent 231 mm contre 141 mm pour janvier-février. Aucune
 * sinusoïde qui culmine en janvier ne rend ça, et pour un chêne-liège c'est
 * exactement ce qui compte : la pluie qui revient après la sécheresse. La
 * station porte donc une **série réelle**, comme les quatre autres qui en ont
 * une (`data/meteo/suberaie-maures.json`).
 *
 * Le climat synthétique ci-dessous reste renseigné parce que des essais s'en
 * servent, et il est calé sur cette même série : 14,7 °C de moyenne,
 * demi-amplitude 9,1, écart diurne 12,5, 820 mm. `rainWinterShare` vaut 0,72,
 * la valeur qui reproduit la part réelle du semestre octobre-mars (62,6 %) —
 * **et il ne reproduit pas le pic d'automne**, ce qui est la limite assumée de
 * l'année synthétique sur cette station.
 *
 * ── le sol ───────────────────────────────────────────────────────────────────
 *
 * Arène granitique des Maures : un sol sableux acide issu de l'altération du
 * socle, filtrant, pauvre, et peu épais avant la roche fissurée. C'est le sol
 * du chêne-liège, qui est strictement calcifuge — sur calcaire il cède la
 * place au chêne vert, et ce tri-là, le moteur le fait déjà par le pH.
 *
 * Pas de nappe accessible : sur un versant de massif, la réserve est celle de
 * l'arène et rien ne la réalimente en été. C'est le contraste qui fait la
 * station, comme l'alios fait la lande.
 *
 * *(Profil à calibrer : les textures et les teneurs sont des ordres de grandeur
 * d'arène granitique acide, aucune analyse de suberaie des Maures n'a été
 * consultée.)*
 *
 * ── ce que la station produit, mesuré ────────────────────────────────────────
 *
 * Réserve utile 121 mm sur trois horizons (33, 44, 43). **Sol nu, cinq ans, la
 * sécheresse d'été est bien là — et elle est dans l'horizon qui évapore** :
 *
 *   semaine      0     12     16     20     24     28     32     40
 *   horizon 0  0,88   0,35   0,14   0,11   0,20   0,15   0,14   0,48
 *   horizons 1-2  1,00 partout, toute l'année
 *
 * Les deux horizons profonds restent pleins, et **c'est correct** : évaporer
 * est un geste de surface, et sans racine rien ne puise en dessous. Le piège
 * est pour qui mesure la réserve du profil ENTIER — elle ne descend qu'à 0,74,
 * et on lirait « station pas sèche » là où la couche qui compte est à 0,14.
 *
 * Sur la station peuplée le minimum du profil entier vaut 0,62, contre 0,59 sur
 * le limon riche d'Abbeville. Ça ne veut pas dire que la Méditerranée est plus
 * humide que la Picardie : ça veut dire que la suberaie ne porte presque que de
 * la ronce, donc peu de racines profondes pour vider les horizons du bas.
 */
export const SUBERAIE_MAURES: StationClimat = {
  station: stationDepuisProfil({
    id: "suberaie-maures",
    relief: { altitudeM: 80, pentePct: 8, expositionDeg: 180, forme: "plan", bassinAmontHa: 0 },
    // **Il n'y a pas de maquis dans le catalogue des paysages**, et c'est une
    // limite déclarée : le massif forestier est ce qui s'en approche le plus —
    // beaucoup de semis, beaucoup de gibier, du vent cassé —, mais il sème des
    // essences tempérées. Le moteur décide ensuite qui survit à l'été, et c'est
    // mesuré plus bas (`stations-mediterraneennes.test.ts`).
    paysageId: "massif-forestier",
    nom: "Suberaie des Maures",
    latitudeDeg: 43.4,
    profil: [
      horizon(25, { sable: 70, limon: 22, argile: 8 }, { moPct: 3.5, ph: 5.2 }),
      horizon(45, { sable: 78, limon: 16, argile: 6 }, { moPct: 0.9, ph: 5.5 }),
      horizon(50, { sable: 82, limon: 12, argile: 6 }, { moPct: 0.4, ph: 5.7 }),
    ],
    initialMineralNKgHa: 20,
    // Versant de massif : la roche fissurée sous l'arène ne porte pas de nappe
    // que les racines atteignent, et rien ne la réalimente en été.
    profondeurNappeEquilibreCm: 600,
    remonteeNappeMmSemaine: 0,
    drainageExterneMmSemaine: 60,
    // Un maquis bas occupe déjà le sol sous les lièges.
    herbeInitiale: 0.45,
    coteM: 100,
  }),
  climat: {
    tMeanAnnual: 14.7,
    tSeasonalAmplitude: 9.1,
    tDiurnalRange: 12.5,
    rainAnnualMm: 820,
    rainWinterShare: 0.72,
  },
};

/**
 * Sable acide profond **sans alios** : la station qui vaut une classe médiane
 * **pour un pin**, et il n'y en avait aucune (issue #254).
 *
 * ── le manque, et l'atlas l'avait écrit avant l'issue ────────────────────────
 *
 * Le dépôt cale ses hauteurs sur les tables néerlandaises de Jansen 1996 et,
 * faute d'indice de fertilité, il **décrète** qu'une station vaut la classe
 * médiane. Cette convention a été taillée sur le limon riche, c'est-à-dire pour
 * des feuillus mésophiles. Un pin sylvestre n'en est pas un : son site médian,
 * dans la table même qui le juge, est un sable.
 *
 * Mesuré avant d'écrire une ligne, hauteur moyenne de huit sujets au large à
 * quarante ans, graine par graine (table : 15,5 m) :
 *
 *   station                          17      43      71      101     moyenne
 *   lande sableuse (alios à 75 cm)   7,85    6,42    6,47    0,00    5,2 m
 *   limon riche (pH 7,0)            17,14   16,03   16,96   16,34   16,6 m
 *   limon sableux acide (Sologne)   19,15   18,62   18,45   18,77   18,7 m
 *
 * Les deux extrêmes **encadrent** la table sans la contenir, et le zéro de la
 * lande n'est pas un arrondi : sur cette graine-là, un semis a été arraché par
 * un boutis de sanglier à un an et demi, et les sept autres ont brûlé la même
 * semaine, à cinq ans et demi. Ce qui manque entre les deux est un **sable que
 * rien n'ampute** — la lande est un sable que l'alios coupe à 75 cm, la Sologne
 * un limon qui n'est pas un sable.
 *
 * ── et la station n'est pas inventée : c'est celle de la table ───────────────
 *
 * Les pineraies que Jansen tabule poussent sur les **dekzand**, les sables de
 * couverture éoliens du Pléistocène supérieur qui font le sous-sol de la
 * Veluwe, de la Drenthe et de la Campine. Le sol y est un podzol — Bakker &
 * Schelling 1966 les range en *veldpodzolgronden* et *haarpodzolgronden* sur
 * « sable fin pauvre en limon » —, donc profond, acide, pauvre, **et sans
 * alios** : l'horizon spodique y est une accumulation d'humus et de fer que les
 * racines traversent, pas la dalle de grès ferrugineux des Landes. Prendre
 * cette station n'est donc pas caler le moteur sur lui-même, c'est aller
 * chercher le site que la source décrit. C'est le geste de la suberaie (#212).
 *
 * Elle a un analogue français, et il vaut d'être nommé parce qu'il est jouable :
 * le sable landais **après défoncement**, c'est-à-dire la conduite réelle des
 * Landes de Gascogne depuis l'assainissement de Chambrelent et la loi du 19 juin
 * 1857 — on casse l'alios au soc avant de planter, et le podzol redevient un
 * sable profond. La lande sèche du dépôt est l'état d'avant ce geste.
 *
 * ── la météo est celle d'Abbeville, et c'est un partage assumé ───────────────
 *
 * `LIMON_ACIDE` a posé le précédent : partager la série d'un voisin plutôt que
 * d'en inventer une. Abbeville (poste 80001001, 50,14° N) est la plus
 * océanique-septentrionale des cinq séries du dépôt, et c'est elle qui approche
 * le mieux le climat de la table : **10,33 °C et 773 mm** sur les soixante ans
 * de la série, quand De Bilt tourne autour de 10 °C et 800 mm. Mont-de-Marsan,
 * elle, est à 13,07 °C et 933 mm.
 *
 * Le **climat synthétique** déclaré plus bas est celui du limon riche, et c'est
 * délibéré : c'est celui que toutes les autres essences du banc subissent, donc
 * le pin sur son sable et le hêtre sur son limon sont comparés à climat égal.
 * Une partie, elle, joue sur la série réelle.
 *
 * **Mont-de-Marsan, l'autre candidate, a été mesurée, et elle n'a pas rendu de
 * banc.** C'est l'analogue landais, plus chaud de deux degrés et plus arrosé en
 * hiver (68 % de 800 mm contre 55 % de 750). Sur le même sol et le même
 * paysage, et sur le climat synthétique correspondant, le pin monte **plus
 * vite** à vingt ans — 10,10 et 9,56 m contre 9,43 et 8,58 sous Abbeville — et
 * il n'en reste **aucun** à quarante, sur les deux graines essayées. Deux causes, et elles n'ont pas le même statut : deux
 * ou trois semis meurent d'**engorgement** à trois ans et trois mois, au même
 * mois sur les deux graines — un sable se noie quand l'hiver recharge plus vite
 * que la pente n'évacue, et là c'est le climat qui parle ; les autres versent en
 * **chablis** (vingt-six et trente-deux ans sur une graine, trente sur l'autre)
 * ou **brûlent** (trente-trois ans), et un coup de vent comme un incendie sont
 * des tirages, donc deux graines n'en font pas une loi.
 *
 * Ce qui décide n'est donc pas ce relevé, c'est la température et la pluie ;
 * le relevé dit seulement qu'on n'a pas échangé un bon analogue climatique
 * contre une station qui aurait rendu des mesures plus sûres.
 *
 * La latitude déclarée est donc celle d'Abbeville : la durée du jour doit aller
 * avec la série qui la porte.
 *
 * ── le sol ───────────────────────────────────────────────────────────────────
 *
 * Trois horizons, 130 cm en tout, sans une trace d'induration : l'humifère
 * mince d'une pineraie, le sable lessivé, le sable de fond. Les textures sont
 * celles d'un sable de couverture (moins de 10 % de limon + argile, ce que la
 * classification néerlandaise appelle *leemarm fijn zand*) *(à calibrer : aucune
 * analyse granulométrique n'a été consultée, ce sont des ordres de grandeur)*.
 *
 * **Le pH est le chiffre qui a demandé le plus de prudence, et il est plus haut
 * que le terrain.** Un podzol de dekzand sous pin titre pH-KCl 3,3 à 4,0, soit
 * pH-eau 4,0 à 4,8 environ *(à confirmer)*. Le moteur, lui, lit l'amplitude
 * déclarée de l'espèce comme un **plateau à bords en rampe** : le pin (4,0-7,5)
 * n'est à pleine vigueur qu'entre 4,67 et 6,84, et il tombe à 0,34 dès pH 4,2.
 * Déclarer le sol à son pH réel aurait donc mesuré `facteurGammePh`, pas le
 * sable — `soil.ts` avait prévu le piège en toutes lettres, en nommant le pin
 * sylvestre comme l'espèce dont la station de référence tombe dans une rampe.
 * On retient donc **4,8 en surface**, le haut de la fourchette de terrain, qui
 * est aussi ce que donne un sable landais remué par le défoncement ; et la
 * dette de forme reste ouverte, elle n'est pas payée ici.
 *
 * Ce que ça pèse, mesuré à profil, paysage et climat identiques : à pH 4,2 le
 * pin rend **6,79 m** à quarante ans, à pH 4,8 **14,91 m** sur les deux mêmes
 * graines. Six dixièmes de pH valent ici plus de la moitié de la hauteur — la
 * station serait donc muette sur le sol tant que cette rampe décide.
 *
 * Pas de nappe dans le profil, mais une nappe à deux mètres : c'est le
 * *veldpodzol*, le podzol de bas de pente qui porte l'essentiel des pineraies
 * néerlandaises, et le pin la touche du pivot (200 cm à l'atlas). Sans elle on
 * décrit un *haarpodzol* de dune, qui est un site de mauvaise classe et non la
 * médiane.
 *
 * ── ce que la station produit, mesuré ────────────────────────────────────────
 *
 * Réserve utile **104 mm sur 130 cm entièrement pénétrables**, contre 186 mm sur
 * le limon riche et 92 mm sur la lande — dont l'alios ne laisse explorer que
 * 75 cm, si bien que la lande en offre réellement moins que ce que son profil
 * annonce. Carbone 83 t C/ha, minéralisation potentielle 113 kg N/ha/an contre
 * 172 sur le limon riche et 45 sur la lande.
 *
 * Ce dernier chiffre corrige une intuition qu'il vaut mieux écrire que garder :
 * **ce sable n'est pas un sol mort**. Sa pauvreté n'est pas dans ce qu'il
 * minéralise, c'est dans ce qu'il ne retient pas — 104 mm de réserve et
 * 1 614 mm/semaine de conductivité, donc une eau qui passe et un azote qui
 * part avec elle.
 *
 * **Limite déclarée** : le paysage de lande rend 7,4 kg N/ha/an de dépôts
 * atmosphériques, ce qui est un chiffre pré-industriel. Les pineraies que
 * Jansen tabulait recevaient trois à cinq fois cela — l'azote néerlandais des
 * années 1980 est un fait d'élevage intensif, pas de géographie —, et le moteur
 * dérive les dépôts de l'occupation du sol, pas d'une époque. La station est
 * donc un dekzand **propre**, et sa classe médiane est celle d'un site qui n'a
 * jamais été engraissé par le ciel.
 *
 * ── et le pin y tombe sur sa table ───────────────────────────────────────────
 *
 * Huit pins au large, quatre graines, hauteur moyenne à quarante ans : 14,99 ·
 * 14,82 · 14,42 · 15,12, soit **14,84 m pour 15,5 m tabulés (−4,3 %)**. Les
 * quatre graines tiennent dans cinq pour cent, là où la lande allait de 7,8 m à
 * la mortalité totale.
 *
 * **Ce que cet âge prouve, et ce qu'il ne prouve pas.** Quarante ans est l'âge
 * que la station visait : elle a été bâtie pour valoir une classe médiane, donc
 * il la **garde** plutôt qu'il ne la valide, comme le hêtre garde son
 * `pousseMaxMAn`. Ce qui est vrai, et qui vaut d'être noté : le profil est celui
 * du premier jet au pH près, aucun de ses chiffres n'a été retouché après la
 * mesure, et le pH a été relevé pour une raison qui n'est pas la hauteur.
 *
 * Vingt ans reste tenu à l'écart, et c'est l'âge qui dit quelque chose :
 * **8,98 m pour 8,1 tabulés (+10,8 %)**. Le pin monte donc un peu vite en
 * jeunesse sur ce sable — c'est la forme de la courbe, pas son niveau, et
 * l'écart est du même ordre que sur les autres essences (−13 % à +10 %).
 *
 * **Sur combien d'arbres porte cette moyenne** : 3, 7, 3 et 7 des huit sujets
 * sont encore debout à quarante ans selon la graine, et **tous les manquants
 * sont des chablis** — aucun n'est mort de soif ni de faim, ce qui dit au
 * passage que la station nourrit son pin. La moyenne porte donc sur les
 * survivants d'un coup de vent. Ce n'est pas contre la hauteur dominante — une
 * table compte les cent plus gros à l'hectare, pas les tiges couchées — mais il
 * faut le savoir : sur la graine 71, un sujet de 18,79 m est tombé à trente-sept
 * ans, et il aurait tiré la moyenne vers le haut.
 */
export const SABLE_PROFOND: StationClimat = {
  station: stationDepuisProfil({
    id: "sable-profond",
    relief: { altitudeM: 25, pentePct: 1, expositionDeg: 180, forme: "plan", bassinAmontHa: 0 },
    // Le paysage du dekzand : bruyère, pins et bouleaux, et le vent qui passe.
    // C'est aussi celui de la lande landaise, et pour la même raison — un sable
    // pauvre ne porte pas de bocage.
    paysageId: "lande-ouverte",
    nom: "Sable acide profond (sans alios)",
    latitudeDeg: 50.1,
    profil: [
      horizon(25, { sable: 88, limon: 9, argile: 3 }, { moPct: 3, ph: 4.8 }),
      horizon(45, { sable: 92, limon: 6, argile: 2 }, { moPct: 0.9, ph: 4.9 }),
      horizon(60, { sable: 94, limon: 4, argile: 2 }, { moPct: 0.3, ph: 5 }),
    ],
    // Le stock minéral de départ est bas, et ce n'est pas parce que le sol ne
    // libère rien — il porte 113 kg N/ha/an de minéralisation potentielle. C'est
    // qu'un sable ne retient pas : ce qui n'est pas prélevé dans la semaine
    // s'en va avec l'eau.
    initialMineralNKgHa: 25,
    // Veldpodzol : la nappe est à portée du pivot, et c'est ce qui sépare un
    // site de classe médiane d'une dune sèche.
    profondeurNappeEquilibreCm: 200,
    remonteeNappeMmSemaine: 0,
    // Sable de couverture sur sable : l'exutoire n'est jamais le goulot.
    drainageExterneMmSemaine: Number.POSITIVE_INFINITY,
    herbeInitiale: 0.4, // callune et molinie sous la pineraie claire
    coteM: 100,
  }),
  // Série partagée avec le limon riche, c'est-à-dire Abbeville (data/meteo.ts).
  climat: LIMON_RICHE.climat,
};

export const STATIONS_V0: readonly StationClimat[] = [
  LANDE_SECHE,
  VALLEE_ENGORGEE,
  LIMON_RICHE,
  LIMON_PAUVRE_N,
  LIMON_ACIDE,
  FRICHE_LIMON,
  SUBERAIE_MAURES,
  SABLE_PROFOND,
];
