/**
 * Fiches espèces V0 — 5 essences pour valider la croissance en loi du minimum.
 * Paramètres dérivés de l'atlas (`Notes/atlas-especes/Espèces - référence.md`,
 * nuanciers eau/trophie/lumière) ; les valeurs numériques sont des ordres de
 * grandeur **à calibrer** (Flore forestière française, IFN). Format complet en
 * V1 (docs/regles.md §6), migration vers data/ + Zod à ce moment-là.
 */

export interface EspeceV0 {
  id: string;
  nom: string;
  nomLatin: string;
  /** hauteur adulte plafond, m */
  hauteurMaxM: number;
  /** pousse annuelle max en conditions optimales (jeune arbre), m/an */
  pousseMaxMAn: number;
  eau: {
    /**
     * Confort hydrique : satisfaction (ETR/ETP) en dessous de laquelle la
     * croissance ralentit. Bas = tolérant à la sécheresse (xérophile).
     */
    seuilConfortSecheresse: number;
    /** engorgement toléré ∈ [0,1] (waterloggingRatio sans dégât) */
    toleranceEngorgement: number;
  };
  lumiere: {
    /**
     * Point de compensation ∈ [0,1] : part de la pleine lumière en dessous de
     * laquelle l'arbre vit sur ses réserves et meurt (ch3-B). Sciaphile ≈ 0,03,
     * héliophile ≈ 0,2-0,3.
     */
    compensation: number;
    /** saturation ∈ [0,1] : lumière au-delà de laquelle la croissance plafonne */
    saturation: number;
    /** indice foliaire de la couronne (Beer-Lambert) : dense = ombre portée forte */
    lai: number;
    /** rayon du houppier / hauteur */
    houppierRatio: number;
    /** true = perd ses feuilles (n'ombrage plus l'hiver) */
    caduc: boolean;
  };
  /** °C moyenne hebdo de démarrage de la croissance (proxy du tempérament thermique) */
  tBaseCroissanceC: number;
  azote: {
    /**
     * Exigence ∈ [0,1] : besoin en N par unité de taille.
     * Oligotrophe ≈ 0,25 · eutrophe ≈ 1 (atlas, gradient trophie).
     */
    demandeRelative: number;
    /** fixateur d'azote (Rhizobium/Frankia) : quasi insensible au manque de N du sol */
    fixateur: boolean;
  };
  sources: string[];
}

const ATLAS = "atlas Espèces - référence (nuanciers eau/trophie/lumière)";

export const ESPECES_V0: readonly EspeceV0[] = [
  {
    id: "alnus_glutinosa",
    nom: "Aulne glutineux",
    nomLatin: "Alnus glutinosa",
    hauteurMaxM: 25,
    pousseMaxMAn: 0.8,
    // Atlas : « très hygrophile (tolère l'engorgement) », berges — vit en marais
    // mais souffre vite en sol sec (seuil de confort élevé).
    eau: { seuilConfortSecheresse: 0.85, toleranceEngorgement: 1 },
    // Atlas : héliophile pionnier.
    lumiere: { compensation: 0.2, saturation: 0.7, lai: 3.5, houppierRatio: 0.3, caduc: true },
    tBaseCroissanceC: 6,
    // Atlas : eutrophe, mais fixateur (Frankia) → indifférent au N du sol.
    azote: { demandeRelative: 0.8, fixateur: true },
    sources: [ATLAS],
  },
  {
    id: "fagus_sylvatica",
    nom: "Hêtre",
    nomLatin: "Fagus sylvatica",
    hauteurMaxM: 35,
    pousseMaxMAn: 0.45,
    // Atlas : mésophile, « aime le frais, sensible à la sécheresse ».
    eau: { seuilConfortSecheresse: 0.85, toleranceEngorgement: 0.1 },
    // Atlas : sciaphile climacique — un semis survit à ~1-2 % de lumière (ch3-B),
    // couronne très opaque.
    lumiere: { compensation: 0.01, saturation: 0.35, lai: 6, houppierRatio: 0.35, caduc: true },
    tBaseCroissanceC: 6,
    azote: { demandeRelative: 0.7, fixateur: false },
    sources: [ATLAS],
  },
  {
    id: "quercus_pubescens",
    nom: "Chêne pubescent",
    nomLatin: "Quercus pubescens",
    hauteurMaxM: 20,
    pousseMaxMAn: 0.35,
    // Atlas : xérophile, thermophile ; craint les sols engorgés.
    eau: { seuilConfortSecheresse: 0.35, toleranceEngorgement: 0.05 },
    // Atlas : héliophile, couronne claire de coteau sec.
    lumiere: { compensation: 0.15, saturation: 0.6, lai: 2.5, houppierRatio: 0.3, caduc: true },
    tBaseCroissanceC: 8,
    azote: { demandeRelative: 0.5, fixateur: false },
    sources: [ATLAS],
  },
  {
    id: "pinus_sylvestris",
    nom: "Pin sylvestre",
    nomLatin: "Pinus sylvestris",
    hauteurMaxM: 30,
    pousseMaxMAn: 0.5,
    // Atlas : xérophile, oligotrophe, « rustique, large amplitude ».
    eau: { seuilConfortSecheresse: 0.3, toleranceEngorgement: 0.2 },
    // Atlas : très héliophile ; houppier clair, persistant (ombrage toute l'année).
    lumiere: { compensation: 0.25, saturation: 0.7, lai: 2, houppierRatio: 0.25, caduc: false },
    tBaseCroissanceC: 5,
    azote: { demandeRelative: 0.25, fixateur: false },
    sources: [ATLAS],
  },
  {
    id: "betula_pendula",
    nom: "Bouleau verruqueux",
    nomLatin: "Betula pendula",
    hauteurMaxM: 25,
    pousseMaxMAn: 0.9,
    // Atlas : pionnier colonisateur, oligotrophe, plutôt frais.
    eau: { seuilConfortSecheresse: 0.6, toleranceEngorgement: 0.4 },
    // Atlas : très héliophile ; ombre légère (couronne aérée) — le bon parasol de nurse.
    lumiere: { compensation: 0.25, saturation: 0.75, lai: 2.5, houppierRatio: 0.3, caduc: true },
    tBaseCroissanceC: 5,
    azote: { demandeRelative: 0.35, fixateur: false },
    sources: [ATLAS],
  },
];

export function getEspece(id: string): EspeceV0 {
  const espece = ESPECES_V0.find((e) => e.id === id);
  if (!espece) throw new Error(`espèce inconnue : ${id}`);
  return espece;
}
