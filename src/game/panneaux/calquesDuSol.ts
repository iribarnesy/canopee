/**
 * Les CALQUES de la carte du sol : ce que chaque teinte veut dire, chiffré.
 *
 * La carte montrait six dégradés sans échelle ni bornes (#144) : sur le calque
 * pH, l'orangé disait « plus acide que le bleuté », et rien ne disait si on
 * était à 5,2 ou à 6,8 — alors que le chaulage annonce « +0,5 » et que la
 * station affiche un pH de départ chiffré. On chaulait sans savoir.
 *
 * **Une seule table, deux lecteurs.** La carte et sa légende lisent la MÊME
 * fiche : mêmes bornes, même teinte, même format. Écrire la légende à côté du
 * dessin aurait fait deux copies d'une règle, et le §2.1 dit ce qui leur
 * arrive — celle qu'on ne regarde pas dérive, et ici c'est la légende qui
 * mentirait, ce qui est pire qu'une absence de légende.
 *
 * **Rien n'est recalculé ici.** Chaque fiche va CHERCHER sa grandeur dans
 * l'instantané ou dans la station, telle que le moteur la donne ; le seul
 * calcul est la position dans le dégradé, qui est un fait d'affichage.
 */

import type { Snapshot, StationInfo } from "../protocol";

export type Calque = "eau" | "ph" | "azote" | "herbe" | "nappe" | "engorgement";

/** Une teinte HSL, telle que le canvas et le CSS l'attendent. */
export type Teinte = readonly [hue: number, saturation: number, luminosite: number];

export interface FicheDeCalque {
  id: Calque;
  /** Le nom sur le bouton : court, il y en a six sur une ligne. */
  libelle: string;
  /** Ce que le calque montre vraiment, en toutes lettres, pour la légende. */
  titre: string;
  /** L'unité des valeurs affichées — celle de `format`, pas celle du moteur. */
  unite: string;
  /**
   * Les deux bouts du dégradé, dans l'unité BRUTE du moteur.
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
   * La COURBE du dégradé, quand une échelle droite ne montre rien.
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
   * La borne haute est-elle un SEUIL et non un maximum ?
   *
   * Le cas de la nappe : à 3 m elle ne concerne plus aucune racine de la
   * parcelle, mais elle descend bien plus bas — mesuré à 6 m sur un limon
   * riche. La teinte s'y arrête, et la légende doit le dire (« ≥ 3 »), sinon
   * elle affirme un maximum qui n'existe pas.
   */
  borneHauteOuverte?: boolean;
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
 * L'eau LIBRE prime sur tous les calques : une mare n'a pas de pH lisible.
 * Sortie en constante pour que la légende montre exactement ce bleu-là.
 */
export const TEINTE_EAU_LIBRE: Teinte = [200, 55, 45];

/** Au delà de cette profondeur, la nappe ne concerne plus la parcelle, cm. */
const NAPPE_HORS_DE_PORTEE_CM = 300;

export const CALQUES: readonly FicheDeCalque[] = [
  {
    id: "eau",
    libelle: "Eau",
    titre: "Eau de l'horizon de surface",
    unite: "mm",
    // La réserve de l'HORIZON DE SURFACE, parce que `soilWater` ne rapporte
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
    teinte: (part) => [55, 30, 90 - 50 * part],
    // Une décimale sous 10 kg/ha : sur une lande, tout le calque vit là, et
    // arrondir à l'entier rendait « 0 » partout.
    format: (v) => (v * 10 < 10 ? (v * 10).toFixed(1) : (v * 10).toFixed(0)),
    sens: "du sol épuisé au sol riche",
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
    // La nappe de la station est FIXE, celle de l'instantané VIT : c'est la
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
    // Du beige au violet, parce que ce n'est PAS de l'eau disponible — c'est
    // de l'asphyxie.
    teinte: (part) => [280, 6 + 44 * part, 90 - 45 * part],
    format: (v) => (v * 100).toFixed(0),
    sens: "des racines au sec aux racines asphyxiées",
  },
];

export function ficheDuCalque(id: Calque): FicheDeCalque {
  const fiche = CALQUES.find((c) => c.id === id);
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

/** Ce que le calque vaut SUR TOUTE la parcelle : le plus bas, le plus haut, la moyenne. */
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
