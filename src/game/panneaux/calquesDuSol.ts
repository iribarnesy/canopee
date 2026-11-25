/**
 * Les **calques** de la carte du sol : ce que chaque teinte veut dire, chiffré.
 *
 * La carte montrait six dégradés sans échelle ni bornes (#144) : sur le calque
 * pH, l'orangé disait « plus acide que le bleuté », et rien ne disait si on
 * était à 5,2 ou à 6,8 — alors que le chaulage annonce « +0,5 » et que la
 * station affiche un pH de départ chiffré. On chaulait sans savoir.
 *
 * **Une seule table, deux lecteurs.** La carte et sa légende lisent la **même**
 * fiche : mêmes bornes, même teinte, même format. Écrire la légende à côté du
 * dessin aurait fait deux copies d'une règle, et le §2.1 dit ce qui leur
 * arrive — celle qu'on ne regarde pas dérive, et ici c'est la légende qui
 * mentirait, ce qui est pire qu'une absence de légende.
 *
 * **Rien n'est recalculé ici.** Chaque fiche va **chercher** sa grandeur dans
 * l'instantané ou dans la station, telle que le moteur la donne ; le seul
 * calcul est la position dans le dégradé, qui est un fait d'affichage.
 */

import { K_SUR_K2O } from "../../engine/pk";
import type { Snapshot, StationInfo } from "../protocol";

export type Calque =
  | "eau"
  | "ph"
  | "azote"
  | "potassium"
  | "herbe"
  | "nappe"
  | "engorgement"
  | "ravageurs"
  | "erosion"
  | "ecartPh";

/** Une teinte HSL, telle que le canvas et le CSS l'attendent. */
export type Teinte = readonly [hue: number, saturation: number, luminosite: number];

export interface FicheDeCalque {
  id: Calque;
  /** Le nom sur le bouton : court, ils tiennent sur une ligne ou deux. */
  libelle: string;
  /** Ce que le calque montre vraiment, en toutes lettres, pour la légende. */
  titre: string;
  /** L'unité des valeurs affichées — celle de `format`, pas celle du moteur. */
  unite: string;
  /**
   * Les deux bouts du dégradé, dans l'unité **brute** du moteur.
   *
   * Ce sont de vraies bornes et pas des maxima décoratifs : l'eau va de zéro à
   * la réserve utile de l'horizon de surface, que la station donne ; le pH va
   * de 4 à 8,5, ce que l'atlas couvre ; la nappe de l'affleurement à 3 m, au
   * delà de quoi plus aucune racine de la parcelle ne la touche.
   */
  bornes: (station: StationInfo) => readonly [number, number];
  /** La grandeur d'une cellule, telle que le moteur la donne. */
  lire: (snapshot: Snapshot, station: StationInfo, i: number) => number;
  /**
   * La **même** grandeur dans la même cellule, telle que le joueur l'a trouvée
   * en arrivant (#509) : le relevé de `StationInfo.solALArrivee`, dans l'unité
   * brute de `lire`. Absente des calques dont le relevé n'a pas de grille ;
   * rend `undefined` quand la partie n'a pas de relevé (bloc d'avant #509).
   */
  aLArrivee?: (station: StationInfo, i: number) => number | undefined;
  /**
   * La **courbe** du dégradé, quand une échelle droite ne montre rien.
   *
   * Elle envoie la position linéaire dans les bornes sur la position dans les
   * couleurs, et `depuis` la ramène — c'est elle qui gradue la légende, donc
   * les deux sens sont écrits ensemble et ne peuvent pas diverger. Absente =
   * échelle droite, le cas de cinq calques sur six.
   */
  courbe?: { vers: (t: number) => number; depuis: (t: number) => number };
  /** La teinte au point `part` du dégradé — l'unique règle de couleur. */
  teinte: (part: number) => Teinte;
  /** La valeur, dans l'unité affichée, avec son nombre de décimales. */
  format: (valeur: number) => string;
  /** Une phrase qui dit ce que la couleur raconte, des deux côtés. */
  sens: string;
  /**
   * La même valeur dans **l'unité d'un bulletin d'analyse**, quand ce n'est pas
   * celle du moteur — le cas du potassium (#435) : le moteur compte en mg K/kg,
   * un laboratoire français écrit des mg K₂O/kg. Absente partout ailleurs.
   */
  auBulletin?: { unite: string; format: (valeur: number) => string };
  /**
   * La borne haute est-elle un **seuil** et non un maximum ?
   *
   * Le cas de la nappe : à 3 m elle ne concerne plus aucune racine de la
   * parcelle, mais elle descend bien plus bas — mesuré à 6 m sur un limon
   * riche. La teinte s'y arrête, et la légende doit le dire (« ≥ 3 »), sinon
   * elle affirme un maximum qui n'existe pas.
   */
  borneHauteOuverte?: boolean;
  /**
   * Et son symétrique, pour une échelle qui a **deux** bouts ouverts.
   *
   * Le cas de l'érosion, et le seul : ce qu'une cellule perd et ce qu'une autre
   * reçoit n'ont pas de maximum, ils s'accumulent tant que la partie dure. Les
   * deux bornes sont donc des seuils de teinte, et la légende doit écrire
   * « ≤ −3 » comme elle écrit « ≥ 3 » — sinon elle affirme deux extrêmes qui
   * n'existent pas.
   */
  borneBasseOuverte?: boolean;
}

/** Où tombe une valeur dans son dégradé, entre 0 et 1. */
export function partDuDegrade(valeur: number, fiche: FicheDeCalque, station: StationInfo): number {
  const [bas, haut] = fiche.bornes(station);
  if (haut === bas) return 0;
  if (!Number.isFinite(valeur)) return valeur > 0 ? 1 : 0;
  const t = Math.min(1, Math.max(0, (valeur - bas) / (haut - bas)));
  return fiche.courbe ? fiche.courbe.vers(t) : t;
}

/** La valeur brute au point `part` du dégradé — l'inverse, pour graduer. */
export function valeurDuDegrade(part: number, fiche: FicheDeCalque, station: StationInfo): number {
  const [bas, haut] = fiche.bornes(station);
  const t = fiche.courbe ? fiche.courbe.depuis(part) : part;
  return bas + t * (haut - bas);
}

/** Une teinte, en CSS. */
export function enCss([h, s, l]: Teinte): string {
  return `hsl(${h} ${s}% ${l}%)`;
}

/**
 * L'eau **libre** prime sur tous les calques : une mare n'a pas de pH lisible.
 * Sortie en constante pour que la légende montre exactement ce bleu-là.
 */
export const TEINTE_EAU_LIBRE: Teinte = [200, 55, 45];

/** Au delà de cette profondeur, la nappe ne concerne plus la parcelle, cm. */
const NAPPE_HORS_DE_PORTEE_CM = 300;

/**
 * Une teneur en potassium, mg K/kg, dite comme un laboratoire français l'écrit :
 * en mg K₂O/kg. Le rapport est celui du moteur (`K_SUR_K2O`, 2 × 39,10 / 94,20),
 * soit environ 1,2 de K₂O par K.
 */
export function enK2O(mgKKg: number): number {
  return mgKKg / K_SUR_K2O;
}

/**
 * Le haut du dégradé du potassium, mg K/kg : **300 mg K₂O/kg**, le haut de la
 * classe la plus riche que relèvent les médianes cantonales de la Base de
 * Données d'Analyses de Terre — « 100-200 mg/kg » sur les plateaux de limon du
 * Nord, « avec des taches à 200-300 » (Gis Sol 2011, cité par le moteur sous
 * `K_ECHANGEABLE_TERRE_DE_LIMON_MG_KG`). Exprimé en K₂O comme une analyse
 * française, donc ramené en K ici.
 *
 * C'est un **seuil** et non un maximum : des potasses répétées sur un limon déjà
 * riche passent au-dessus. La teinte s'y arrête, le curseur donne le chiffre.
 */
const POTASSIUM_HAUT_MG_KG = 300 * K_SUR_K2O;

/**
 * De combien la courbe de l'érosion étale son bas.
 *
 * Cent, et c'est une décision de **plage** : ce calque doit tenir ensemble le
 * millimètre d'un versant tranquille et les dizaines de centimètres d'une
 * ravine. Sondé sur limon riche, trente ans : la cellule médiane perd deux
 * centièmes de centimètre à 2 % de pente et un dixième à 45 %, tandis que les
 * cellules de tête en perdent des centimètres. Une racine carrée ne suffit pas
 * à couvrir trois ordres de grandeur — le logarithme, si.
 */
const ETALEMENT_EROSION = 100;

/**
 * La courbe d'une échelle **divergente**, étalée des deux côtés du zéro.
 *
 * Même intention que la racine carrée de l'azote et des ravageurs — la moitié
 * des cellules vit trop près de zéro pour se distinguer sur une échelle droite
 * — mais appliquée **en miroir** : on ramène la position à un écart signé au
 * zéro, on étale cet écart, et on revient. Écrite ici avec son inverse, comme
 * toute courbe de ce module, pour que la légende gradue avec le dessin.
 */
const LOG_SIGNE = {
  vers: (t: number) => {
    const ecart = t * 2 - 1;
    const etale = Math.log1p(Math.abs(ecart) * ETALEMENT_EROSION) / Math.log1p(ETALEMENT_EROSION);
    return (Math.sign(ecart) * etale + 1) / 2;
  },
  depuis: (t: number) => {
    const ecart = t * 2 - 1;
    const brut = Math.expm1(Math.abs(ecart) * Math.log1p(ETALEMENT_EROSION)) / ETALEMENT_EROSION;
    return (Math.sign(ecart) * brut + 1) / 2;
  },
};

export const CALQUES: readonly FicheDeCalque[] = [
  {
    id: "eau",
    libelle: "Eau",
    titre: "Eau de l'horizon de surface",
    unite: "mm",
    // La réserve de l'**horizon de surface**, parce que `soilWater` ne rapporte
    // que celui-là : la borne haute est le sol plein, pas un maximum choisi.
    // Elle portait le nom `ruMm`, qui désigne ailleurs le profil entier —
    // d'où #190, et d'où ce nom-ci.
    bornes: (station) => [0, station.ruHorizonSurfaceMm],
    lire: (snapshot, _station, i) => snapshot.soilWater[i] ?? 0,
    teinte: (part) => [90, 18, 88 - 45 * part],
    format: (v) => v.toFixed(0),
    sens: "du sol sec au sol plein",
  },
  {
    id: "ph",
    libelle: "pH",
    titre: "pH du sol",
    unite: "",
    bornes: () => [4, 8.5],
    lire: (snapshot, _station, i) => snapshot.soilPh[i] ?? 7,
    aLArrivee: (station, i) => station.solALArrivee?.ph[i],
    // Acide = orangé, calcaire = bleuté.
    teinte: (part) => [20 + part * 200, 35, 70],
    format: (v) => v.toFixed(1),
    sens: "de l'acide au calcaire",
  },
  {
    id: "azote",
    libelle: "Azote",
    titre: "Azote minéral disponible",
    // Le moteur compte en g/m² ; le reste du volet parle en kg/ha, et c'est
    // dans cette unité-là qu'un apport se décide.
    unite: "kg/ha",
    // **Quatre-vingts kg/ha et non trente, et l'échelle est courbe.** Sondé
    // sur les six stations livrées, cinq ans chacune : un limon riche monte à
    // 6,2 g/m² — le double de l'ancien haut de gamme, où la carte saturait
    // donc sur la moitié de la parcelle — tandis qu'une lande sèche vit sous
    // 0,3 g/m² et n'était qu'un aplat. Une seule échelle droite ne peut pas
    // servir les deux ; la racine carrée étale le bas sans tronquer le haut,
    // et la légende gradue avec elle, donc elle ne ment pas. Un apport d'engrais
    // peut passer au-dessus : la teinte s'y arrête, le curseur donne le chiffre.
    bornes: () => [0, 8],
    courbe: { vers: Math.sqrt, depuis: (t) => t * t },
    lire: (snapshot, _station, i) => snapshot.soilN[i] ?? 0,
    aLArrivee: (station, i) => station.solALArrivee?.azote[i],
    teinte: (part) => [55, 30, 90 - 50 * part],
    // Une décimale sous 10 kg/ha : sur une lande, tout le calque vit là, et
    // arrondir à l'entier rendait « 0 » partout.
    format: (v) => (v * 10 < 10 ? (v * 10).toFixed(1) : (v * 10).toFixed(0)),
    sens: "du sol épuisé au sol riche",
  },
  {
    // **Le potassium se lit comme une analyse de terre** (#435). Le volet
    // l'écrivait en kg/ha « assimilables », une moyenne de parcelle dans une
    // unité qu'aucun bulletin n'emploie, alors que la station déclare depuis
    // #395 une teneur de laboratoire. L'instantané la donne par cellule, relue
    // par la conversion du moteur (`potassiumEnTeneurDAnalyse`, snapshot.ts) :
    // rien n'est pesé ici.
    id: "potassium",
    libelle: "Potassium",
    titre: "Potassium échangeable de l'horizon de surface",
    unite: "mg K/kg",
    bornes: () => [0, POTASSIUM_HAUT_MG_KG],
    // **Courbe, pour la même raison que l'azote.** Les stations forestières
    // déclarent 20 à 34 mg K/kg (RENECOFOR, `stations.ts`), les terres de
    // limon 125 : sur une échelle droite, toutes les landes et les pinèdes
    // tiendraient dans le premier huitième et se ressembleraient. La racine
    // carrée les met au tiers du dégradé, le limon aux sept dixièmes.
    courbe: { vers: Math.sqrt, depuis: (t) => t * t },
    lire: (snapshot, _station, i) => snapshot.soilPotassiumMgKg[i] ?? 0,
    aLArrivee: (station, i) => station.solALArrivee?.potassium[i],
    // Du gris rosé au lie-de-vin : la teinte du chlorure de potassium tel qu'on
    // l'épand, et aucun autre calque ne l'occupe — le violet de l'engorgement
    // est plus bleu, le rouge des ravageurs plus orangé.
    teinte: (part) => [330, 8 + 42 * part, 90 - 45 * part],
    format: (v) => v.toFixed(0),
    sens: "du sol épuisé au sol bien pourvu",
    borneHauteOuverte: true,
    auBulletin: { unite: "mg K₂O/kg", format: (v) => enK2O(v).toFixed(0) },
  },
  {
    id: "herbe",
    libelle: "Herbe",
    titre: "Couverture herbacée",
    unite: "%",
    bornes: () => [0, 1],
    lire: (snapshot, _station, i) => snapshot.soilHerbe[i] ?? 0,
    // Plus l'herbe couvre, plus le vert est franc.
    teinte: (part) => [95, 15 + 45 * part, 85 - 35 * part],
    format: (v) => (v * 100).toFixed(0),
    sens: "du sol nu au tapis fermé",
  },
  {
    id: "nappe",
    libelle: "Nappe",
    titre: "Profondeur de la nappe",
    unite: "m",
    bornes: () => [0, NAPPE_HORS_DE_PORTEE_CM],
    // La nappe de la station est **fixe**, celle de l'instantané **vit** : c'est la
    // plus haute des deux qui mouille les racines.
    lire: (snapshot, station, i) =>
      Math.min(
        snapshot.soilNappeCm[i] ?? Number.POSITIVE_INFINITY,
        station.nappeCm?.[i] ?? Number.POSITIVE_INFINITY,
      ),
    // Du bleu franc là où elle affleure au beige là où elle est hors de
    // portée : c'est la carte qui explique la ripisylve, et celle qui montre
    // la nappe remonter après un incendie.
    teinte: (part) => [205, 8 + 52 * (1 - part), 88 - 40 * (1 - part)],
    format: (v) => (Number.isFinite(v) ? (v / 100).toFixed(2) : "hors de portée"),
    sens: "de l'affleurement aux 3 m hors de portée",
    borneHauteOuverte: true,
  },
  {
    id: "engorgement",
    libelle: "Engorgement",
    titre: "Macroporosité noyée",
    unite: "%",
    bornes: () => [0, 1],
    lire: (snapshot, _station, i) => snapshot.soilEngorgement[i] ?? 0,
    // Du beige au violet, parce que ce n'est **pas** de l'eau disponible — c'est
    // de l'asphyxie.
    teinte: (part) => [280, 6 + 44 * part, 90 - 45 * part],
    format: (v) => (v * 100).toFixed(0),
    sens: "des racines au sec aux racines asphyxiées",
  },
  {
    // **Ce n'est pas du sol, et c'est pourtant ici que ça se lit** (#109). Le
    // volet porte les grandeurs qui vivent *par cellule* et que la vue en
    // losange ne peut pas montrer — l'herbe y est déjà pour la même raison. La
    // défoliation se lit par **taches** : une pullulation part d'un foyer et
    // s'étend, et seule une carte peut dire où. La moyenne, elle, voyageait
    // depuis toujours (`fluxes.ravageurMoyen`) sans jamais dire vers où
    // regarder.
    id: "ravageurs",
    libelle: "Ravageurs",
    titre: "Population de ravageurs",
    // Une part de la population maximale, que le moteur tient entre 0 et 1
    // (`ravageurs.ts`) : ce n'est pas un effectif d'insectes, et l'écrire en
    // pourcents est la seule façon honnête de le dire.
    unite: "%",
    // **La gamme du moteur, et non celle qu'on observe.** Sondé sur les huit
    // stations livrées, quarante ans chacune : la cellule la plus chargée de
    // toutes les parties monte à 0,75, et le pic d'une année ordinaire tient
    // entre 0,15 et 0,49. Borner sur ce qu'on a vu ferait saturer la carte la
    // première fois qu'une partie fait pire, et une carte saturée ne montre
    // plus de foyer — c'est justement ce qu'on vient chercher ici.
    bornes: () => [0, 1],
    // **Et l'échelle est courbe, pour la même raison que l'azote.** Le même
    // sondage donne une médiane de cellule entre 0,02 et 0,12 : la parcelle
    // ordinaire vit dans le premier dixième d'une échelle droite, où toutes
    // les teintes se ressemblent. La racine carrée étale ce bas-là — 0,04
    // passe à un cinquième du dégradé, 0,30 à plus de la moitié — sans
    // tronquer le haut, et la légende gradue avec elle.
    courbe: { vers: Math.sqrt, depuis: (t) => t * t },
    lire: (snapshot, _station, i) => snapshot.soilRavageurs[i] ?? 0,
    // Du paille au rouge sombre : la couleur de ce qui grille sur pied. Aucun
    // autre calque ne va vers le rouge — l'acide du pH est un orangé pâle et
    // désaturé, qui ne se confond pas avec un foyer.
    teinte: (part) => [45 - 37 * part, 15 + 55 * part, 92 - 47 * part],
    format: (v) => (v * 100).toFixed(0),
    sens: "de la parcelle indemne au foyer de pullulation",
  },
  {
    // **Un seul champ dit les deux moitiés du phénomène** (#110) : la terre qui
    // part d'un versant et celle qui se dépose en bas. C'est ce qui permet de
    // les dessiner comme un même mouvement plutôt que deux effets sans rapport
    // — et c'est pour ça que le calque est **divergent**, avec le zéro au milieu.
    //
    // Les moyennes de `TickFluxes` disent déjà combien la parcelle a perdu, et
    // ce volet les affiche en t/ha/an. Elles ne disent jamais **où** : ni la
    // ravine, ni le bas de pente qui s'engraisse.
    id: "erosion",
    libelle: "Érosion",
    titre: "Sol emporté ou déposé depuis le début",
    unite: "cm",
    // **Un cumul, et non un débit.** Le moteur ajoute à cette grille semaine
    // après semaine (`tick.ts`) : ce qu'on lit est l'épaisseur d'horizon de
    // surface que la cellule a perdue depuis le premier jour de la partie.
    // **L'échelle est l'horizon lui-même**, et c'est la seule qui veuille dire
    // quelque chose : perdre un centimètre n'est pas la même chose sur un
    // horizon de 20 cm et sur un horizon de 40. Au bout, la couche que
    // l'érosion mange a entièrement disparu — ou l'équivalent s'est déposé.
    //
    // **Les deux bouts sont des seuils**, parce qu'un cumul n'a pas de maximum :
    // mesuré dans le jeu, une parcelle d'un hectare à 45 % de pente laissée
    // 120 ans perd jusqu'à 18 m sur ses cellules de crête et en entasse autant
    // en bas — bien au-delà de ce qu'un horizon contient, et c'est une question
    // pour le moteur (issue ouverte). La carte s'arrête donc à l'horizon, la
    // légende l'écrit « ≤ » et « ≥ », et le curseur donne le chiffre exact.
    bornes: (station) => [-station.epaisseurHorizonSurfaceCm, station.epaisseurHorizonSurfaceCm],
    courbe: LOG_SIGNE,
    lire: (snapshot, _station, i) => snapshot.soilEpaisseurPerdueCm[i] ?? 0,
    // Brun d'un côté, bleu-vert de l'autre, pâle au milieu : c'est la paire que
    // la cartographie des sols emploie pour ce genre de carte, et aucun autre
    // calque n'occupe ces deux teintes-là — le vert de l'herbe est plus jaune,
    // le bleu de la nappe plus franc.
    teinte: (part) => {
      const cote = part * 2 - 1;
      const force = Math.abs(cote);
      return [cote >= 0 ? 25 : 175, 6 + 52 * force, 92 - 48 * force];
    },
    // Deux décimales : la moitié des cellules d'une parcelle en pente vit sous
    // le dixième de centimètre, et arrondir y écrirait « 0 » partout.
    format: (v) => v.toFixed(2),
    sens: "du limon accumulé (−) à l'horizon décapé (+)",
    borneHauteOuverte: true,
    borneBasseOuverte: true,
  },
];

/**
 * La courbe d'une échelle divergente **en racine** : même miroir que
 * `LOG_SIGNE`, avec un étalement plus doux. Un dixième de pH tombe au tiers du
 * chemin vers le bout, au lieu du vingtième qu'une échelle droite lui laissait.
 */
const RACINE_SIGNEE = {
  vers: (t: number) => {
    const ecart = t * 2 - 1;
    return (Math.sign(ecart) * Math.sqrt(Math.abs(ecart)) + 1) / 2;
  },
  depuis: (t: number) => {
    const ecart = t * 2 - 1;
    return (Math.sign(ecart) * ecart * ecart + 1) / 2;
  },
};

/**
 * Un écart signé : « +0.12 », « −0.35 », et « 0.00 » sans signe quand il
 * s'arrondit à zéro. Le vrai signe moins, et le point décimal du reste du volet.
 */
export function ecartSigne(v: number, decimales: number): string {
  const texte = Math.abs(v).toFixed(decimales);
  if (Number(texte) === 0) return texte;
  return `${v > 0 ? "+" : "−"}${texte}`;
}

/**
 * **Ce que le pH a fait depuis l'arrivée**, cellule par cellule (#509).
 *
 * La moyenne de la parcelle ne le dit pas, et c'est mesuré : sur la friche
 * vieillie de vingt ans, vingt ans de plus laissent le pH moyen à 6,70 — celui
 * de l'arrivée — pendant que la cellule la plus acidifiée passe de 6,24 à 5,53.
 * La litière acidifie sous les arbres (#495) et nulle part ailleurs ; seule une
 * carte peut dire où.
 *
 * Il n'est **pas** dans `CALQUES` : il n'existe que si la partie a son relevé
 * d'arrivée, ce qui n'est pas le cas d'une partie reprise d'un bloc écrit avant
 * lui. `calquesDeLaCarte` l'ajoute quand il a de quoi se dessiner.
 */
export const CALQUE_ECART_PH: FicheDeCalque = {
  id: "ecartPh",
  libelle: "Écart de pH",
  titre: "pH gagné ou perdu depuis votre arrivée",
  unite: "pH",
  // **Un pH entier de chaque côté**, et ce sont des seuils : c'est un peu plus
  // que ce que le moteur fait perdre en cinquante ans sous peuplement sur un
  // limon acide (0,4 à 0,8, #495), deux chaulages de ce que le geste annonce
  // (+0,5). Au-delà, la teinte s'arrête et le curseur donne le chiffre.
  bornes: () => [-1, 1],
  // La racine, parce que l'écart commence petit : les premières années d'une
  // plantation déplacent le pH de quelques centièmes, et une échelle droite
  // les laisserait dans le blanc du milieu jusqu'à ce qu'il soit trop tard
  // pour les voir venir — tout l'objet de ce calque.
  courbe: RACINE_SIGNEE,
  lire: (snapshot, station, i) => {
    const arrivee = station.solALArrivee?.ph[i];
    return arrivee === undefined ? Number.NaN : (snapshot.soilPh[i] ?? 7) - arrivee;
  },
  // Orangé du côté acide, bleuté du côté calcaire, comme le calque du pH ;
  // pâle au milieu, où rien n'a bougé.
  teinte: (part) => {
    const cote = part * 2 - 1;
    const force = Math.abs(cote);
    return [cote < 0 ? 20 : 215, 6 + 54 * force, 93 - 43 * force];
  },
  format: (v) => ecartSigne(v, 2),
  sens: "du sol acidifié (−) au sol remonté (+)",
  borneHauteOuverte: true,
  borneBasseOuverte: true,
};

/**
 * Les calques que la carte propose pour **cette** partie : les neuf de toujours,
 * et l'écart de pH juste après le pH quand la partie a son relevé d'arrivée.
 */
export function calquesDeLaCarte(station: StationInfo): readonly FicheDeCalque[] {
  if (!station.solALArrivee) return CALQUES;
  const apresLePh = CALQUES.findIndex((c) => c.id === "ph") + 1;
  return [...CALQUES.slice(0, apresLePh), CALQUE_ECART_PH, ...CALQUES.slice(apresLePh)];
}

export function ficheDuCalque(id: Calque): FicheDeCalque {
  const fiche = id === CALQUE_ECART_PH.id ? CALQUE_ECART_PH : CALQUES.find((c) => c.id === id);
  if (!fiche) throw new Error(`calque inconnu : ${id}`);
  return fiche;
}

/** La couleur d'une cellule sur un calque — celle que la carte peint. */
export function couleurDeLaCellule(
  fiche: FicheDeCalque,
  snapshot: Snapshot,
  station: StationInfo,
  i: number,
): Teinte {
  if (station.enEau?.[i]) return TEINTE_EAU_LIBRE;
  return fiche.teinte(partDuDegrade(fiche.lire(snapshot, station, i), fiche, station));
}

/** Ce que le calque vaut **sur toute** la parcelle : le plus bas, le plus haut, la moyenne. */
export function etendueDuCalque(
  fiche: FicheDeCalque,
  snapshot: Snapshot,
  station: StationInfo,
  cellules: number,
): { bas: number; haut: number; moyenne: number } | undefined {
  let bas = Number.POSITIVE_INFINITY;
  let haut = Number.NEGATIVE_INFINITY;
  let somme = 0;
  let comptees = 0;
  for (let i = 0; i < cellules; i++) {
    // L'eau libre n'a pas de sol : la compter tirerait toutes les étendues
    // vers l'eau et le pH d'une mare n'existe pas.
    if (station.enEau?.[i]) continue;
    const v = fiche.lire(snapshot, station, i);
    if (!Number.isFinite(v)) continue;
    if (v < bas) bas = v;
    if (v > haut) haut = v;
    somme += v;
    comptees++;
  }
  if (comptees === 0) return undefined;
  return { bas, haut, moyenne: somme / comptees };
}

/**
 * Ce que le calque valait sur toute la parcelle **à l'arrivée du joueur**
 * (#509), compté comme `etendueDuCalque` compte le présent — mêmes cellules,
 * même eau libre écartée —, pour que les deux moyennes se comparent. `undefined`
 * si le calque n'a pas de relevé ou si la partie n'en a pas.
 */
export function etendueALArrivee(
  fiche: FicheDeCalque,
  station: StationInfo,
  cellules: number,
): { bas: number; haut: number; moyenne: number } | undefined {
  const lire = fiche.aLArrivee;
  if (!lire) return undefined;
  let bas = Number.POSITIVE_INFINITY;
  let haut = Number.NEGATIVE_INFINITY;
  let somme = 0;
  let comptees = 0;
  for (let i = 0; i < cellules; i++) {
    if (station.enEau?.[i]) continue;
    const v = lire(station, i);
    if (v === undefined || !Number.isFinite(v)) continue;
    if (v < bas) bas = v;
    if (v > haut) haut = v;
    somme += v;
    comptees++;
  }
  if (comptees === 0) return undefined;
  return { bas, haut, moyenne: somme / comptees };
}
