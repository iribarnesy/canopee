/**
 * Stations V0 de développement/test — caricatures contrastées pour éprouver
 * le moteur (sécheresse, engorgement, pauvreté en azote). Les 6 vraies
 * stations françaises documentées (docs/regles.md §2.2) arrivent en V1 avec
 * les données Météo-France/DRIAS.
 *
 * ── **un profil n'est pas une fosse pédologique** (issue #257) ───────────────
 *
 * Les sept profils s'arrêtaient tous entre 80 et 120 cm, et ce n'était pas une
 * décision : c'est la profondeur à laquelle **une fosse s'arrête**. Un pédologue
 * décrit le sol, c'est-à-dire la partie du terrain qui a été transformée par
 * les processus pédogénétiques ; il note « substrat » sous le dernier horizon
 * et referme le trou. La convention est parfaitement légitime — elle décrit ce
 * qu'elle prétend décrire — mais le moteur, lui, lit ces épaisseurs comme le
 * **volume que les racines peuvent explorer**, et là elle ment par omission.
 *
 * Le fait mesuré : dix des vingt-six espèces de l'atlas déclarent plus de
 * 120 cm de racines — jusqu'à 250 pour les deux chênes méditerranéens — et
 * **aucune n'atteignait jamais sa profondeur déclarée, sur aucune station**. Le
 * blé tendre, qui descend à 120 cm, s'enracinait donc plus profond que le noyer,
 * ce qui retourne l'argument même de l'agroforesterie à noyers.
 *
 * Le terrain dit l'inverse, et il le dit en mètres. Les deux synthèses globales
 * d'enracinement — **Canadell et al. 1996** (*Oecologia* 108:583-595, « Maximum
 * rooting depth of vegetation types at the global scale ») et **Jackson et al.
 * 1996** (*Oecologia* 108:389-411) — donnent un maximum moyen de **2,9 ± 0,2 m**
 * en forêt décidue tempérée et **3,9 m** en conifères tempérés. En France,
 * **Lucot & Bruckert 1992** (*Ann. Sci. For.* 49:465-479) ont dégagé le système
 * racinaire de chênes pédonculés de cent cinquante ans dans un sol brun lessivé
 * colluvial de quatre mètres : racines intensives jusqu'à 120 cm, pivots
 * sub-verticaux **au-delà de quatre mètres**.
 *
 * Chaque station porte donc maintenant son **horizon C** : l'altérite, l'arène,
 * la formation résiduelle ou l'alluvion grossière que la fosse ne décrivait pas
 * et que les racines exploitent. Ce n'est pas un réglage, c'est une donnée
 * géologique, sourcée station par station ci-dessous.
 *
 * **Deux choses à savoir avant d'en ajouter un.**
 *
 * La première est que l'horizon C **ne se choisit pas pour sa réserve utile**.
 * L'issue espérait qu'un C peu réservant permettrait de gagner de la profondeur
 * sans gonfler la RU ; mesuré, il en économise à peu près la moitié — à
 * profondeur égale sur le limon riche (210 cm), une formation à silex
 * caillouteuse porte la réserve de 186 à 291 mm quand du lœss prolongé la
 * pousse à 378. Mais la mesure a surtout dit que **la question ne se posait
 * pas** : les hauteurs à quarante ans ne bougent pas de plus de 2,5 % dans un
 * cas comme dans l'autre. La raison est que la réserve profonde n'est
 * atteinte que par les racines qui y descendent, et que la densité racinaire
 * décroît exponentiellement (`fractionsRacinairesParHorizon`) : un hêtre, qui
 * plafonne à 110 cm, ne voit pas le mètre qu'on ajoute sous lui. Le C se choisit
 * donc sur la **géologie**, et sa réserve utile est ce qu'elle est.
 *
 * La seconde est que **le dernier horizon du profil commande la nappe** :
 * `porositeDrainable`, `subordinationAuRelief` et `hauteurCapillaireCm` le
 * lisent, lui et pas un autre. Changer la texture du fond d'un profil déplace
 * donc l'amplitude du battement et la frange capillaire. C'est la raison pour
 * laquelle le fond de vallée prolonge ses alluvions **à texture identique** :
 * une alluvion fine de plusieurs mètres est ce que le terrain dit, et ça laisse
 * la machinerie de nappe exactement où elle était.
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
    //
    // **Le remblaiement continue sous la fosse** (#257), et « profondes » le
    // disait déjà : un fond de vallée est un remblaiement alluvial de plusieurs
    // mètres, pas quatre-vingt-cinq centimètres de terre sur du vide. La
    // troisième couche est **la même alluvion fine**, simplement plus pauvre en
    // matière organique, et ce n'est pas une facilité : c'est le seul choix qui
    // laisse la nappe où elle est. `porositeDrainable`,
    // `subordinationAuRelief` et `hauteurCapillaireCm` lisent tous les trois le
    // **dernier** horizon du profil ; y mettre un matériau grossier aurait
    // divisé la porosité drainable par 1,5 et coupé la frange capillaire de
    // moitié, sur la seule station dont la nappe fait l'identité.
    //
    // **Ce que ça ne fait pas** : ça ne donne pas d'eau en plus aux arbres. La
    // nappe est à quarante centimètres, donc ces horizons-là sont saturés la
    // plus grande partie de l'année, et ce qu'un arbre y gagne en profondeur il
    // le paie en anoxie — `waterlogging` est pondéré par les fractions
    // racinaires (tick.ts), un enracinement plus profond en ressent donc
    // **davantage**. C'est le comportement de terrain : dans un fond de vallée
    // engorgé, ce n'est pas la roche qui borne les racines, c'est l'eau.
    profil: [
      horizon(30, { sable: 25, limon: 50, argile: 25 }, { moPct: 3, ph: 6.5 }),
      horizon(55, { sable: 20, limon: 45, argile: 35 }, { moPct: 1.2, ph: 6.6 }),
      horizon(110, { sable: 20, limon: 45, argile: 35 }, { moPct: 0.3, ph: 6.8 }),
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
    //
    // **Et sous le limon, la formation résiduelle à silex** (#257). Le Plateau
    // picard est un plateau de craie coiffé de limon des plateaux — plusieurs
    // mètres, jusqu'à une dizaine au centre du plateau — et entre les deux
    // s'intercale une formation résiduelle brun-rouge, argilo-limoneuse, bourrée
    // de silex entiers ou éclatés issus de la craie (notices BRGM de la feuille
    // picarde ; CNPF Hauts-de-France, *Le Plateau picard*). C'est un matériau que
    // les racines exploitent — les relevés d'enracinement du plateau y comptent
    // encore une à trois racines au décimètre carré sous un mètre —, et c'est
    // lui qui donne à la station la profondeur qu'un limon de plateau a
    // réellement.
    //
    // On n'en décrit qu'**un mètre**, et c'est un choix conservateur : la
    // formation en fait souvent plusieurs, et la craie altérée sous elle est
    // encore pénétrable. Deux mètres pénétrables suffisent à ce que les dix
    // espèces profondes de l'atlas cessent d'être bridées ici *(épaisseur à
    // confirmer sur une carte pédologique du secteur d'Abbeville)*.
    profil: [
      horizon(35, { sable: 15, limon: 70, argile: 15 }, { moPct: 2.2, ph: 7 }),
      horizon(65, { sable: 15, limon: 70, argile: 15 }, { moPct: 0.8, ph: 7.2 }),
      horizon(
        100,
        { sable: 20, limon: 50, argile: 30 },
        // La pierrosité est le fait marquant du matériau : près de la moitié du
        // volume est du silex, donc autant de terre en moins pour l'eau.
        { moPct: 0.15, ph: 6.5, pierrosite: 0.45 },
      ),
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
    // Le substrat, lui, est le même : c'est le même plateau, et la charrue ne
    // descend pas à un mètre — la formation à silex est identique à celle du
    // limon riche (#257).
    profil: [
      horizon(30, { sable: 15, limon: 70, argile: 15 }, { moPct: 0.7, ph: 7 }),
      horizon(70, { sable: 15, limon: 70, argile: 15 }, { moPct: 0.4, ph: 7.2 }),
      horizon(
        100,
        { sable: 20, limon: 50, argile: 30 },
        { moPct: 0.15, ph: 6.5, pierrosite: 0.45 },
      ),
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
    // **Sous le sol lessivé, les sables de Sologne** (#257). Le sous-sol solognot
    // est fait de sables poreux et d'argiles imperméables en lentilles
    // anastomosées, sur vingt à cinquante mètres d'épaisseur (CAUE 41 / CDPNE,
    // *Les sables et argiles de Sologne*). La profondeur de l'horizon
    // imperméable y est **le** facteur écologique : au-dessous d'un mètre de
    // sable filtrant, les sols restent secs toute l'année, et c'est cette
    // Sologne-là — la sèche, celle de la lande à callune et du châtaignier — que
    // la station représente. La lentille argileuse est donc plus bas que le
    // profil décrit *(épaisseur du sable à confirmer : elle varie d'un point à
    // l'autre, c'est même la définition de la Sologne)*.
    profil: [
      horizon(30, { sable: 30, limon: 55, argile: 15 }, { moPct: 3, ph: 5 }),
      horizon(60, { sable: 35, limon: 50, argile: 15 }, { moPct: 1, ph: 5.4 }),
      horizon(110, { sable: 80, limon: 15, argile: 5 }, { moPct: 0.15, ph: 5.6 }),
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
    // Même famille de substrat que les plateaux limoneux du Nord (#257) : un
    // limon de couverture sur une formation résiduelle à silex, qui est ce que
    // portent les confins de Touraine et du Berry à cette latitude. La friche
    // est la station la plus mince du catalogue ; elle le reste — c'est le sol
    // décrit qui est mince, pas le terrain sous lui.
    profil: [
      horizon(30, { sable: 25, limon: 60, argile: 15 }, { moPct: 2.5, ph: 6.8 }),
      horizon(50, { sable: 25, limon: 60, argile: 15 }, { moPct: 0.9, ph: 6.9 }),
      horizon(
        100,
        { sable: 20, limon: 50, argile: 30 },
        { moPct: 0.15, ph: 6.2, pierrosite: 0.45 },
      ),
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
      // **L'arène grossière, et c'est elle qui porte les deux chênes à 250 cm**
      // (#257). Sur les formations cristallines des Maures, l'altération des
      // granites et des gneiss développe une arène sableuse qui atteint une
      // dizaine de mètres, et où circule une nappe de plateau ou de versant
      // mal alimentée (fiche hydrogéologique PAC13A, *Formations cristallines
      // du massif des Maures*, Eaufrance Rhône-Méditerranée). C'est un matériau
      // très drainant qui **retient peu d'eau** — d'où une réserve utile qui ne
      // monte que de 121 à 180 mm pour 140 cm de plus.
      //
      // Le chêne-liège s'y tient par un pivot, et les racines suivent les
      // diaclases, qui sont précisément les sites privilégiés de l'altération
      // du granite. Cette station est la seule du catalogue à dépasser 250 cm,
      // et c'est correct : les maxima d'enracinement les plus profonds de
      // Canadell 1996 sont ceux des formations sclérophylles méditerranéennes.
      horizon(140, { sable: 88, limon: 8, argile: 4 }, { moPct: 0.1, ph: 5.8, pierrosite: 0.45 }),
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

export const STATIONS_V0: readonly StationClimat[] = [
  LANDE_SECHE,
  VALLEE_ENGORGEE,
  LIMON_RICHE,
  LIMON_PAUVRE_N,
  LIMON_ACIDE,
  FRICHE_LIMON,
  SUBERAIE_MAURES,
];
