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
    /**
     * Satisfaction en dessous de laquelle l'arbre puise dans ses réserves et
     * risque la mort (« pousse / s'épanouit / SURVIT », ch3-C). Découplé du
     * confort : le hêtre pousse mal dès que l'eau manque mais son semis
     * (pivot) survit ; l'aulne meurt vite hors sol frais.
     */
    seuilStressSecheresse: number;
    /** engorgement toléré ∈ [0,1] (waterloggingRatio sans dégât) */
    toleranceEngorgement: number;
  };
  /**
   * Gamme de pH tolérée [min, max] (atlas, nuancier acidiphile→calcicole).
   * Bordure douce de ±0,7 : au-delà, chlorose puis mort (bio-indication).
   */
  ph: [number, number];
  lumiere: {
    /**
     * Point de compensation ∈ [0,1] : part de la pleine lumière en dessous de
     * laquelle l'arbre vit sur ses réserves et meurt (ch3-B). Sciaphile ≈ 0,03,
     * héliophile ≈ 0,2-0,3.
     */
    compensation: number;
    /** saturation ∈ [0,1] : lumière au-delà de laquelle la croissance plafonne */
    saturation: number;
    /**
     * Indice foliaire DE LA COURONNE (Beer-Lambert) : ombre d'une couronne
     * traversée seule. ≈ LAI de peuplement / chevauchement typique (~2) —
     * un point sous 2-3 couronnes retrouve le LAI de peuplement.
     */
    lai: number;
    /** rayon du houppier / hauteur */
    houppierRatio: number;
    /** true = perd ses feuilles (n'ombrage plus l'hiver) */
    caduc: boolean;
  };
  racines: {
    /**
     * Profondeur d'enracinement d'un sujet adulte, cm, si le sol le permet.
     * Un pivot (chêne, pin) descend chercher l'eau profonde ; un système
     * traçant (épicéa, bouleau) reste en surface. C'est ce contraste qui rend
     * la complémentarité agroforestière possible (critère E7).
     */
    profondeurMaxCm: number;
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
  regeneration: {
    /** âge de première fructification, années */
    maturiteAns: number;
    /** longévité : la sénescence démarre vers 0,85 × cette valeur, années */
    longeviteAns: number;
    /** mode de dissémination (ch4-C) : noyau de dispersion des semis */
    dissemination: "vent" | "oiseaux" | "gravite";
    /** établissements potentiels par adulte et par an (APRÈS l'entonnoir de mortalité, ch4-B) */
    semisParAn: number;
  };
  litiere: {
    /** rapport C/N de la litière : bas = minéralisation rapide (ch2-B) */
    cnRatio: number;
  };
  economie: {
    /** prix d'un jeune plant, € *(à calibrer sur les pépinières forestières)* */
    prixPlantEur: number;
  };
  bois: {
    /** densité du bois sec, t/m³ (infradensité, pour la biomasse et le carbone) */
    densite: number;
    /**
     * Prix du m³ de BOIS D'ŒUVRE de cette essence, € — sans commune mesure
     * avec le bois de chauffage, mais il faut une bille droite et sans nœuds
     * (donc de l'élagage) et un diamètre suffisant.
     */
    prixOeuvreEurM3: number;
    /** rejette de souche après recépage (taillis, trogne — ch5-A) */
    rejetteDeSouche: boolean;
  };
  feu: {
    /**
     * Inflammabilité ∈ [0,1] : ce que l'espèce apporte comme combustible.
     * Les résineux et les landes brûlent comme des torches ; les feuillus
     * frais bien moins.
     */
    inflammabilite: number;
    /**
     * Résistance de l'écorce ∈ [0,1] : chance de survivre au passage du feu
     * pour un sujet adulte. Le liège est LA réponse évolutive à l'incendie.
     */
    resistanceEcorce: number;
    /** rejette de souche après un feu (châtaignier, arbousier, chêne-liège) */
    rejetteApresFeu: boolean;
  };
  /** production fruitière (docs/regles.md §7.2) — absent pour les essences forestières */
  fruits?: {
    /** floraison : cumul de degrés-jours base 5 °C depuis le 1er janvier */
    floraisonDJ: number;
    /** tMin qui détruit les fleurs pendant la floraison, °C (gel tardif) */
    gelFatalC: number;
    /** semaine de récolte (0-51) */
    recolteWeek: number;
    /** semaines de fraîcheur après la récolte avant que les fruits soient perdus */
    fenetreRecolteWeeks: number;
    /** semaines de croissance du fruit entre floraison et récolte (normalisation) */
    croissanceSem: number;
    /** rendement d'un adulte en pleine forme, kg/an */
    rendementMaxKg: number;
    prixEurKg: number;
    /** temps de cueillette, h/kg (pommes rapides, noisettes lentes) *(à calibrer)* */
    recolteHKg: number;
    /** auto-fertile ? sinon il faut un congénère mature à moins de 30 m (§7.5) */
    autofertile: boolean;
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
    eau: { seuilConfortSecheresse: 0.85, seuilStressSecheresse: 0.65, toleranceEngorgement: 1 },
    ph: [4.5, 7.5],
    // Atlas : héliophile pionnier.
    lumiere: { compensation: 0.2, saturation: 0.7, lai: 2, houppierRatio: 0.3, caduc: true },
    racines: { profondeurMaxCm: 90 }, // traçant de berge, l'eau est en surface
    tBaseCroissanceC: 6,
    // Atlas : eutrophe, mais fixateur (Frankia) → indifférent au N du sol.
    azote: { demandeRelative: 0.8, fixateur: true },
    regeneration: { maturiteAns: 12, longeviteAns: 100, dissemination: "vent", semisParAn: 4 },
    // Litière tendre, très riche en N (C/N ~15) : l'aulne améliore son sol (ch2-B).
    litiere: { cnRatio: 15 },
    economie: { prixPlantEur: 2 },
    bois: { densite: 0.45, prixOeuvreEurM3: 90, rejetteDeSouche: true },
    feu: { inflammabilite: 0.25, resistanceEcorce: 0.15, rejetteApresFeu: true },
    sources: [ATLAS],
  },
  {
    id: "fagus_sylvatica",
    nom: "Hêtre",
    nomLatin: "Fagus sylvatica",
    hauteurMaxM: 35,
    pousseMaxMAn: 0.45,
    // Atlas : mésophile, « aime le frais, sensible à la sécheresse ».
    eau: { seuilConfortSecheresse: 0.85, seuilStressSecheresse: 0.25, toleranceEngorgement: 0.1 },
    ph: [4.5, 8],
    // Atlas : sciaphile climacique — un semis survit à ~1-2 % de lumière (ch3-B),
    // couronne très opaque.
    lumiere: { compensation: 0.01, saturation: 0.35, lai: 3.5, houppierRatio: 0.35, caduc: true },
    racines: { profondeurMaxCm: 110 }, // racines étalées, peu pivotantes — d'où sa sensibilité à la sécheresse
    tBaseCroissanceC: 6,
    azote: { demandeRelative: 0.7, fixateur: false },
    regeneration: { maturiteAns: 40, longeviteAns: 300, dissemination: "gravite", semisParAn: 3 },
    // Litière coriace, lente (C/N ~50) — la voie fongique (ch2-B).
    litiere: { cnRatio: 50 },
    economie: { prixPlantEur: 3 },
    bois: { densite: 0.68, prixOeuvreEurM3: 180, rejetteDeSouche: false },
    feu: { inflammabilite: 0.3, resistanceEcorce: 0.15, rejetteApresFeu: false },
    sources: [ATLAS],
  },
  {
    id: "quercus_pubescens",
    nom: "Chêne pubescent",
    nomLatin: "Quercus pubescens",
    hauteurMaxM: 20,
    pousseMaxMAn: 0.35,
    // Atlas : xérophile, thermophile ; craint les sols engorgés.
    eau: { seuilConfortSecheresse: 0.35, seuilStressSecheresse: 0.1, toleranceEngorgement: 0.05 },
    ph: [5.5, 8.5],
    // Atlas : héliophile, couronne claire de coteau sec.
    lumiere: { compensation: 0.15, saturation: 0.6, lai: 1.5, houppierRatio: 0.3, caduc: true },
    racines: { profondeurMaxCm: 250 }, // pivot puissant : il va chercher l'eau profonde des coteaux secs
    tBaseCroissanceC: 8,
    azote: { demandeRelative: 0.5, fixateur: false },
    regeneration: { maturiteAns: 30, longeviteAns: 400, dissemination: "oiseaux", semisParAn: 2 },
    litiere: { cnRatio: 40 },
    economie: { prixPlantEur: 3 },
    bois: { densite: 0.75, prixOeuvreEurM3: 220, rejetteDeSouche: true },
    feu: { inflammabilite: 0.45, resistanceEcorce: 0.5, rejetteApresFeu: true },
    sources: [ATLAS],
  },
  {
    id: "pinus_sylvestris",
    nom: "Pin sylvestre",
    nomLatin: "Pinus sylvestris",
    hauteurMaxM: 30,
    pousseMaxMAn: 0.5,
    // Atlas : xérophile, oligotrophe, « rustique, large amplitude ».
    eau: { seuilConfortSecheresse: 0.3, seuilStressSecheresse: 0.1, toleranceEngorgement: 0.2 },
    ph: [4, 7.5],
    // Atlas : très héliophile ; houppier clair, persistant (ombrage toute l'année).
    lumiere: { compensation: 0.25, saturation: 0.7, lai: 1.2, houppierRatio: 0.25, caduc: false },
    racines: { profondeurMaxCm: 200 }, // pivot, d'où sa résistance sur sols filtrants
    tBaseCroissanceC: 5,
    azote: { demandeRelative: 0.25, fixateur: false },
    regeneration: { maturiteAns: 15, longeviteAns: 250, dissemination: "vent", semisParAn: 3 },
    // Aiguilles à C/N ~60 : minéralisation lente et acidifiante (ch2-B).
    litiere: { cnRatio: 60 },
    economie: { prixPlantEur: 1.5 },
    bois: { densite: 0.45, prixOeuvreEurM3: 110, rejetteDeSouche: false },
    feu: { inflammabilite: 0.9, resistanceEcorce: 0.35, rejetteApresFeu: false },
    sources: [ATLAS],
  },
  {
    id: "betula_pendula",
    nom: "Bouleau verruqueux",
    nomLatin: "Betula pendula",
    hauteurMaxM: 25,
    pousseMaxMAn: 0.9,
    // Atlas : pionnier colonisateur, oligotrophe, plutôt frais.
    eau: { seuilConfortSecheresse: 0.6, seuilStressSecheresse: 0.25, toleranceEngorgement: 0.4 },
    ph: [3.8, 7.5],
    // Atlas : très héliophile ; ombre légère (couronne aérée) — le bon parasol de nurse.
    lumiere: { compensation: 0.25, saturation: 0.75, lai: 1.3, houppierRatio: 0.3, caduc: true },
    racines: { profondeurMaxCm: 100 }, // traçant superficiel de pionnier
    tBaseCroissanceC: 5,
    azote: { demandeRelative: 0.35, fixateur: false },
    regeneration: { maturiteAns: 10, longeviteAns: 90, dissemination: "vent", semisParAn: 6 },
    litiere: { cnRatio: 25 },
    economie: { prixPlantEur: 1.5 },
    bois: { densite: 0.55, prixOeuvreEurM3: 120, rejetteDeSouche: true },
    feu: { inflammabilite: 0.5, resistanceEcorce: 0.1, rejetteApresFeu: true },
    sources: [ATLAS],
  },
  {
    id: "malus_domestica",
    nom: "Pommier",
    nomLatin: "Malus domestica",
    hauteurMaxM: 8,
    pousseMaxMAn: 0.5,
    // Atlas : « fruitier clé » ; mésophile de plaine.
    eau: { seuilConfortSecheresse: 0.7, seuilStressSecheresse: 0.3, toleranceEngorgement: 0.15 },
    ph: [5.5, 8],
    lumiere: { compensation: 0.2, saturation: 0.7, lai: 2, houppierRatio: 0.45, caduc: true },
    racines: { profondeurMaxCm: 120 }, // fruitier greffé, enracinement moyen
    tBaseCroissanceC: 6,
    azote: { demandeRelative: 0.6, fixateur: false },
    // Cultivar greffé : pas de régénération naturelle fidèle.
    regeneration: { maturiteAns: 6, longeviteAns: 80, dissemination: "gravite", semisParAn: 0 },
    litiere: { cnRatio: 30 },
    economie: { prixPlantEur: 12 },
    bois: { densite: 0.6, prixOeuvreEurM3: 150, rejetteDeSouche: false },
    fruits: {
      floraisonDJ: 200, // fin avril — après la plupart des gels
      gelFatalC: -2,
      recolteWeek: 38,
      fenetreRecolteWeeks: 3,
      croissanceSem: 14,
      rendementMaxKg: 80,
      prixEurKg: 1.2,
      recolteHKg: 0.02,
      autofertile: false, // la plupart des variétés : il faut un pollinisateur (décision §15)
    },
    feu: { inflammabilite: 0.35, resistanceEcorce: 0.15, rejetteApresFeu: false },
    sources: [ATLAS],
  },
  {
    id: "prunus_armeniaca",
    nom: "Abricotier",
    nomLatin: "Prunus armeniaca",
    hauteurMaxM: 6,
    pousseMaxMAn: 0.5,
    // Atlas : « gel des fleurs = risque ; sec » — xérophile, floraison très précoce.
    eau: { seuilConfortSecheresse: 0.4, seuilStressSecheresse: 0.15, toleranceEngorgement: 0.05 },
    ph: [6, 8.5],
    lumiere: { compensation: 0.25, saturation: 0.75, lai: 1.8, houppierRatio: 0.45, caduc: true },
    racines: { profondeurMaxCm: 180 }, // pivot des sols secs et chauds
    tBaseCroissanceC: 8,
    azote: { demandeRelative: 0.5, fixateur: false },
    regeneration: { maturiteAns: 4, longeviteAns: 60, dissemination: "gravite", semisParAn: 0 },
    litiere: { cnRatio: 30 },
    economie: { prixPlantEur: 14 },
    bois: { densite: 0.6, prixOeuvreEurM3: 150, rejetteDeSouche: false },
    fruits: {
      floraisonDJ: 60, // fin février-mars : LE pari du gel tardif (atlas)
      gelFatalC: -1.5,
      recolteWeek: 27,
      fenetreRecolteWeeks: 2,
      croissanceSem: 12,
      rendementMaxKg: 40,
      prixEurKg: 3,
      recolteHKg: 0.04,
      autofertile: true,
    },
    feu: { inflammabilite: 0.35, resistanceEcorce: 0.15, rejetteApresFeu: false },
    sources: [ATLAS],
  },
  {
    id: "corylus_avellana",
    nom: "Noisetier",
    nomLatin: "Corylus avellana",
    hauteurMaxM: 8,
    pousseMaxMAn: 0.6,
    // Atlas : demi-ombre, cépée — l'arbuste des sous-étages agroforestiers.
    eau: { seuilConfortSecheresse: 0.6, seuilStressSecheresse: 0.25, toleranceEngorgement: 0.3 },
    ph: [5, 8],
    lumiere: { compensation: 0.05, saturation: 0.4, lai: 2.5, houppierRatio: 0.5, caduc: true },
    racines: { profondeurMaxCm: 90 }, // cépée à racines traçantes
    tBaseCroissanceC: 5,
    azote: { demandeRelative: 0.4, fixateur: false },
    regeneration: { maturiteAns: 5, longeviteAns: 80, dissemination: "oiseaux", semisParAn: 1 },
    litiere: { cnRatio: 25 },
    economie: { prixPlantEur: 8 },
    bois: { densite: 0.62, prixOeuvreEurM3: 70, rejetteDeSouche: true },
    fruits: {
      floraisonDJ: 15, // chatons d'hiver (janv.-fév.), pollinisation par le vent
      gelFatalC: -8, // les chatons encaissent le froid — pas de pari climatique
      recolteWeek: 36,
      fenetreRecolteWeeks: 3,
      croissanceSem: 16,
      rendementMaxKg: 8,
      prixEurKg: 4,
      recolteHKg: 0.15,
      autofertile: false, // auto-incompatible : il faut un voisin
    },
    feu: { inflammabilite: 0.4, resistanceEcorce: 0.1, rejetteApresFeu: true },
    sources: [ATLAS],
  },
  {
    id: "ulex_europaeus",
    nom: "Ajonc d'Europe",
    nomLatin: "Ulex europaeus",
    hauteurMaxM: 2.5,
    pousseMaxMAn: 0.45,
    // Atlas : « épineux, landes acides », façade atlantique — LA nurse de lande.
    eau: { seuilConfortSecheresse: 0.3, seuilStressSecheresse: 0.08, toleranceEngorgement: 0.15 },
    ph: [3.5, 6.5],
    // Rameaux épineux persistants : il ombrage et brise le vent toute l'année.
    lumiere: { compensation: 0.25, saturation: 0.75, lai: 2.2, houppierRatio: 0.55, caduc: false },
    racines: { profondeurMaxCm: 140 }, // pivot de fabacée : il prospecte plus bas que sa taille ne le suggère
    tBaseCroissanceC: 5,
    // Fabacée fixatrice (Rhizobium) : elle enrichit le sable qu'elle colonise.
    azote: { demandeRelative: 0.5, fixateur: true },
    regeneration: { maturiteAns: 3, longeviteAns: 25, dissemination: "gravite", semisParAn: 5 },
    litiere: { cnRatio: 25 },
    economie: { prixPlantEur: 3 },
    bois: { densite: 0.6, prixOeuvreEurM3: 40, rejetteDeSouche: true },
    feu: { inflammabilite: 0.98, resistanceEcorce: 0.0, rejetteApresFeu: true },
    sources: [ATLAS],
  },
  {
    id: "cytisus_scoparius",
    nom: "Genêt à balais",
    nomLatin: "Cytisus scoparius",
    hauteurMaxM: 2.5,
    pousseMaxMAn: 0.5,
    // Atlas : « landes acides, améliore le sol » — l'autre pionnière fixatrice.
    eau: { seuilConfortSecheresse: 0.35, seuilStressSecheresse: 0.1, toleranceEngorgement: 0.1 },
    ph: [4, 7],
    lumiere: { compensation: 0.25, saturation: 0.75, lai: 1.6, houppierRatio: 0.45, caduc: false },
    racines: { profondeurMaxCm: 130 }, // pivot de fabacée
    tBaseCroissanceC: 5,
    azote: { demandeRelative: 0.5, fixateur: true },
    regeneration: { maturiteAns: 3, longeviteAns: 20, dissemination: "gravite", semisParAn: 4 },
    litiere: { cnRatio: 22 },
    economie: { prixPlantEur: 2.5 },
    bois: { densite: 0.55, prixOeuvreEurM3: 40, rejetteDeSouche: true },
    feu: { inflammabilite: 0.95, resistanceEcorce: 0.0, rejetteApresFeu: true },
    sources: [ATLAS],
  },
  {
    id: "calluna_vulgaris",
    nom: "Callune",
    nomLatin: "Calluna vulgaris",
    hauteurMaxM: 0.6,
    pousseMaxMAn: 0.12,
    // Atlas : « lande acide pauvre, bio-indicatrice acidité » — couvre-sol.
    eau: { seuilConfortSecheresse: 0.3, seuilStressSecheresse: 0.08, toleranceEngorgement: 0.2 },
    ph: [3.5, 6],
    lumiere: { compensation: 0.22, saturation: 0.7, lai: 2, houppierRatio: 0.6, caduc: false },
    racines: { profondeurMaxCm: 40 }, // sous-arbrisseau à racines fines superficielles
    tBaseCroissanceC: 5,
    azote: { demandeRelative: 0.15, fixateur: false },
    regeneration: { maturiteAns: 3, longeviteAns: 30, dissemination: "vent", semisParAn: 6 },
    // Litière éricacée : lente et acidifiante (voie fongique, ch2-B).
    litiere: { cnRatio: 45 },
    economie: { prixPlantEur: 2 },
    bois: { densite: 0.6, prixOeuvreEurM3: 30, rejetteDeSouche: true },
    feu: { inflammabilite: 0.95, resistanceEcorce: 0.0, rejetteApresFeu: true },
    sources: [ATLAS],
  },
  {
    id: "castanea_sativa",
    nom: "Châtaignier",
    nomLatin: "Castanea sativa",
    hauteurMaxM: 30,
    pousseMaxMAn: 0.65,
    // Atlas : mésoxérophile, **acidiphile (calcifuge)** — l'arbre à valoriser
    // sur la lande, mais qui a besoin d'être abrité pour s'installer.
    eau: { seuilConfortSecheresse: 0.55, seuilStressSecheresse: 0.22, toleranceEngorgement: 0.05 },
    ph: [4, 6.5],
    lumiere: { compensation: 0.08, saturation: 0.5, lai: 3.2, houppierRatio: 0.38, caduc: true },
    racines: { profondeurMaxCm: 180 }, // pivot, mais qui redoute l'asphyxie
    tBaseCroissanceC: 7,
    azote: { demandeRelative: 0.45, fixateur: false },
    regeneration: { maturiteAns: 20, longeviteAns: 300, dissemination: "gravite", semisParAn: 2 },
    litiere: { cnRatio: 45 },
    economie: { prixPlantEur: 4 },
    bois: { densite: 0.6, prixOeuvreEurM3: 200, rejetteDeSouche: true },
    fruits: {
      floraisonDJ: 750, // juin : bien après les gels tardifs
      gelFatalC: -2,
      recolteWeek: 41,
      fenetreRecolteWeeks: 3,
      croissanceSem: 14,
      rendementMaxKg: 35,
      prixEurKg: 3,
      recolteHKg: 0.08, // ramassage au sol
      autofertile: false, // auto-stérile : il lui faut un congénère
    },
    feu: { inflammabilite: 0.4, resistanceEcorce: 0.3, rejetteApresFeu: true },
    sources: [ATLAS],
  },
  {
    id: "quercus_suber",
    nom: "Chêne-liège",
    nomLatin: "Quercus suber",
    hauteurMaxM: 20,
    pousseMaxMAn: 0.3,
    // Atlas : xérophile, **silice/acide**, sempervirent, résiste au feu.
    eau: { seuilConfortSecheresse: 0.35, seuilStressSecheresse: 0.12, toleranceEngorgement: 0.25 },
    // Atlas : « silice/acide » — calcifuge strict des sables siliceux.
    ph: [3.8, 6.8],
    // Semi-héliophile : contrairement au pin, ses jeunes supportent le couvert
    // — c'est ainsi qu'une subéraie s'installe SOUS la pinède et prend le
    // relais, le pin ne se régénérant pas sous sa propre ombre.
    lumiere: { compensation: 0.07, saturation: 0.5, lai: 2.8, houppierRatio: 0.42, caduc: false },
    racines: { profondeurMaxCm: 250 }, // pivot profond des sables méditerranéens
    // Thermophile, mais chez lui sur la façade atlantique douce.
    tBaseCroissanceC: 7,
    azote: { demandeRelative: 0.4, fixateur: false },
    regeneration: { maturiteAns: 25, longeviteAns: 250, dissemination: "oiseaux", semisParAn: 2 },
    litiere: { cnRatio: 50 },
    economie: { prixPlantEur: 5 },
    bois: { densite: 0.7, prixOeuvreEurM3: 160, rejetteDeSouche: true },
    feu: { inflammabilite: 0.5, resistanceEcorce: 0.95, rejetteApresFeu: true },
    sources: [ATLAS],
  },
  {
    id: "arbutus_unedo",
    nom: "Arbousier",
    nomLatin: "Arbutus unedo",
    hauteurMaxM: 5,
    pousseMaxMAn: 0.25,
    // Atlas : « méditerranéen, acidiphile, rejette après feu », mycorhize éricoïde.
    eau: { seuilConfortSecheresse: 0.35, seuilStressSecheresse: 0.12, toleranceEngorgement: 0.05 },
    ph: [4, 6.5],
    lumiere: { compensation: 0.12, saturation: 0.6, lai: 2.4, houppierRatio: 0.45, caduc: false },
    racines: { profondeurMaxCm: 150 }, // racines profondes, adaptation méditerranéenne
    tBaseCroissanceC: 8,
    azote: { demandeRelative: 0.3, fixateur: false },
    regeneration: { maturiteAns: 5, longeviteAns: 100, dissemination: "oiseaux", semisParAn: 2 },
    litiere: { cnRatio: 45 },
    economie: { prixPlantEur: 9 },
    bois: { densite: 0.7, prixOeuvreEurM3: 90, rejetteDeSouche: true },
    fruits: {
      floraisonDJ: 1150, // fleurit en automne (atlas : ressource des pollinisateurs)
      gelFatalC: -4,
      recolteWeek: 46,
      fenetreRecolteWeeks: 3,
      croissanceSem: 10,
      rendementMaxKg: 12,
      prixEurKg: 5,
      recolteHKg: 0.1,
      autofertile: true,
    },
    feu: { inflammabilite: 0.7, resistanceEcorce: 0.35, rejetteApresFeu: true },
    sources: [ATLAS],
  },
];

export function getEspece(id: string): EspeceV0 {
  const espece = ESPECES_V0.find((e) => e.id === id);
  if (!espece) throw new Error(`espèce inconnue : ${id}`);
  return espece;
}
