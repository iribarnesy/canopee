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
    /**
     * Part du feuillage gardée en plein hiver ∈ [0,1], pour les
     * SEMI-PERSISTANTS. Entre le caduc qui se dénude et le sempervirent qui ne
     * bouge pas, il y a le troène : il garde une partie de ses feuilles quand
     * l'hiver est doux et les perd quand il est rude. Absente, l'espèce suit
     * son `caduc` — tout ou rien.
     */
    retentionHivernale?: number;
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
    /**
     * Mode de dissémination (ch4-C) : le noyau de dispersion des semis.
     *  - `vent` : noyau exponentiel autour du parent (bouleau, frêne, pin) ;
     *  - `oiseaux` : n'importe où, avec les fientes (arbouse, sureau) ;
     *  - `gravite` : sous la couronne, à peine au-delà (faînes) ;
     *  - `geai` : les GROSSES graines. Un geai enterre des milliers de glands
     *    par automne, jusqu'à un kilomètre, et il les cache **en terrain
     *    découvert** parce qu'il doit les retrouver. C'est la raison pour
     *    laquelle les chênes colonisent les friches et se régénèrent mal sous
     *    leur propre couvert (ch4-C).
     */
    dissemination: "vent" | "oiseaux" | "gravite" | "geai";
    /** établissements potentiels par adulte et par an (APRÈS l'entonnoir de mortalité, ch4-B) */
    semisParAn: number;
  };
  litiere: {
    /** rapport C/N de la litière : bas = minéralisation rapide (ch2-B) */
    cnRatio: number;
  };
  /**
   * Calendrier foliaire (phenologie.ts). L'ORDRE de débourrement est un fait
   * de terrain massif : le bouleau part début avril quand le frêne attend la
   * mi-mai, et c'est ce décalage qui décide de qui profite de la lumière
   * d'avril sous un couvert encore nu.
   */
  phenologie: {
    /**
     * Cumul de degrés-jours base 5 °C depuis le 1ᵉʳ janvier au débourrement.
     * Calé sur les DATES observées dans le nord de la France, mesurées avec
     * notre propre série météo *(à calibrer espèce par espèce)*.
     */
    debourrementDJ: number;
    /**
     * Durée du jour minimale, heures. Sans cette porte, la chaleur seule
     * ferait débourrer le Sud-Ouest six semaines avant le Nord — l'écart réel
     * est de deux à trois. Le hêtre, le chêne et l'épicéa y sont notoirement
     * les plus sensibles.
     */
    seuilJourH: number;
    /**
     * Semaines de froid (0-10 °C) nécessaires pour lever la dormance. Le hêtre
     * et le tilleul en réclament beaucoup, le bouleau et le chêne peu — c'est
     * ce qui décide de qui souffrira d'un hiver doux *(à calibrer)*.
     */
    besoinFroidSemaines: number;
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
  /**
   * Production qu'on prélève SANS abattre l'arbre et qui repousse : le liège
   * du chêne-liège, la sève, la résine. C'est ce qui fait vivre une subéraie
   * pendant des siècles sans jamais la couper.
   */
  ecorce?: {
    nom: string;
    /** années entre deux levées (le liège met ~10 ans à se reformer) */
    rotationAns: number;
    /** âge minimal du premier démasclage */
    premierAge: number;
    /** rendement d'un arbre adulte à chaque levée, kg */
    rendementKg: number;
    prixEurKg: number;
    /** temps de levée, h/kg */
    recolteHKg: number;
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
  /**
   * Exigence minérale, en multiple du seuil de carence forestier (pk.ts).
   *
   * Un arbre forestier mycorhizé, qui retransloque son phosphore avant la
   * chute des feuilles et recycle sur place, vit sur des teneurs qui
   * condamneraient une culture : c'est la référence, à 1. Un fruitier cultivé,
   * dont on exporte la récolte chaque année et qu'on a sélectionné pour le
   * rendement, en demande deux à trois fois plus. Une céréale ou un maraîchage
   * seraient à dix ou vingt — c'est par ce nombre, et pas par un cas
   * particulier dans le moteur, que les cultures s'ajouteront le jour venu.
   */
  exigenceMinerale: number;
  /**
   * Type de mycorhize (mycorhizes.ts) : il décide de QUEL réseau l'espèce
   * profite, et lequel elle entretient. Les trois types ne se remplacent pas.
   */
  mycorhize: "ecto" | "arbusculaire" | "ericoide";
  ravageurs: {
    /**
     * Sensibilité ∈ [0,1] aux ravageurs et maladies : ce qu'une essence risque
     * quand elle est plantée pure et qu'elle s'affaiblit. Les résineux en
     * peuplement pur (scolytes, processionnaire) et les fruitiers cultivés
     * (carpocapse, tavelure, moniliose) sont en haut de l'échelle ; les ligneux
     * bas de la lande, en bas.
     */
    sensibilite: number;
    /**
     * Hôte HIVERNAL : la plante héberge les ravageurs pendant l'hiver et les
     * relâche au printemps sur ses voisines. Le fusain d'Europe est l'hôte
     * d'hiver du puceron noir. Ce n'est pas un défaut de l'espèce — c'est un
     * chaînon de son cycle, et le connaître change la façon de composer une
     * haie (ravageurs.ts).
     */
    hoteHivernal?: boolean;
  };
  gibier: {
    /**
     * Appétence ∈ [0,1] pour les cervidés : à quel point les rameaux de
     * l'année sont recherchés. Le chevreuil est un « cueilleur » sélectif —
     * il vide un noisetier ou un chêne avant de toucher au pin, et c'est
     * cette sélectivité qui réoriente la composition d'une régénération
     * (ch4-C). Les épineux et les feuillages coriaces s'en tirent mieux.
     */
    appetence: number;
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
    // L'aulne est des premiers, avec le bouleau : début avril.
    phenologie: { debourrementDJ: 90, seuilJourH: 11.0, besoinFroidSemaines: 9 },
    economie: { prixPlantEur: 2 },
    bois: { densite: 0.45, prixOeuvreEurM3: 90, rejetteDeSouche: true },
    // brouté sans être recherché
    // phytophthora de l'aulne : réel, et mortel sur les berges
    // double symbiose : Frankia pour l'azote, ectomycorhizes pour le reste
    exigenceMinerale: 1,
    mycorhize: "ecto",
    ravageurs: { sensibilite: 0.55 },
    gibier: { appetence: 0.4 },
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
    // Le hêtre attend : dix à vingt jours après le chêne dans l'ouest, et il est parmi les plus photopériodiques.
    phenologie: { debourrementDJ: 240, seuilJourH: 13.0, besoinFroidSemaines: 16 },
    economie: { prixPlantEur: 3 },
    bois: { densite: 0.68, prixOeuvreEurM3: 180, rejetteDeSouche: false },
    // peu appété, mais consommé l'hiver faute de mieux
    // peu attaqué tant qu'il n'a pas soif
    exigenceMinerale: 1,
    mycorhize: "ecto",
    ravageurs: { sensibilite: 0.35 },
    gibier: { appetence: 0.35 },
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
    regeneration: { maturiteAns: 30, longeviteAns: 400, dissemination: "geai", semisParAn: 2 },
    litiere: { cnRatio: 40 },
    // Le chêne débourre fin avril, et il est photopériodique.
    phenologie: { debourrementDJ: 190, seuilJourH: 12.5, besoinFroidSemaines: 9 },
    economie: { prixPlantEur: 3 },
    bois: { densite: 0.75, prixOeuvreEurM3: 220, rejetteDeSouche: true },
    // les chênes sont en tête des listes d'appétence
    // défoliateurs (bombyx, tordeuse) sur les chênes
    exigenceMinerale: 1,
    mycorhize: "ecto",
    ravageurs: { sensibilite: 0.5 },
    gibier: { appetence: 0.75 },
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
    // Sempervirent : ces valeurs ne servent pas, mais le champ reste renseigné.
    phenologie: { debourrementDJ: 150, seuilJourH: 11.0, besoinFroidSemaines: 10 },
    economie: { prixPlantEur: 1.5 },
    bois: { densite: 0.45, prixOeuvreEurM3: 110, rejetteDeSouche: false },
    // résineux dédaigné (il subit surtout les frottis, v2)
    // scolytes et processionnaire : le cas d'école du résineux pur
    exigenceMinerale: 1,
    mycorhize: "ecto",
    ravageurs: { sensibilite: 0.75 },
    gibier: { appetence: 0.2 },
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
    // Le bouleau ouvre le bal, début avril — c'est le pionnier jusque dans son calendrier.
    phenologie: { debourrementDJ: 85, seuilJourH: 10.8, besoinFroidSemaines: 8 },
    economie: { prixPlantEur: 1.5 },
    bois: { densite: 0.55, prixOeuvreEurM3: 120, rejetteDeSouche: true },
    // rameaux tendres, brouté en pionnier
    // pionnier peu sujet
    exigenceMinerale: 1,
    mycorhize: "ecto",
    ravageurs: { sensibilite: 0.3 },
    gibier: { appetence: 0.5 },
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
    // Fruitier de plaine : feuillaison après la floraison, mi-avril.
    phenologie: { debourrementDJ: 150, seuilJourH: 11.5, besoinFroidSemaines: 13 },
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
    // un verger non protégé est un garde-manger
    // carpocapse et tavelure : un verger sans auxiliaires se traite
    exigenceMinerale: 2.5,
    mycorhize: "arbusculaire",
    ravageurs: { sensibilite: 0.85 },
    gibier: { appetence: 0.85 },
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
    // L'abricotier part très tôt, et c'est bien là son problème : le gel le rattrape.
    phenologie: { debourrementDJ: 110, seuilJourH: 11.2, besoinFroidSemaines: 10 },
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
    // fruitier très appété
    // moniliose
    exigenceMinerale: 2.5,
    mycorhize: "arbusculaire",
    ravageurs: { sensibilite: 0.8 },
    gibier: { appetence: 0.8 },
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
    // La noisette est lourde, nourrissante et convoitée : mulots, écureuils,
    // geais et balanin en prélèvent l'essentiel, et un noisetier ne place pas
    // un descendant par an. On reste donc bien en dessous de 1 — le taux est
    // un nombre d'établissements POTENTIELS, après l'entonnoir de mortalité
    // graine→semis, et cet entonnoir est ici très étroit *(à calibrer)*.
    regeneration: { maturiteAns: 5, longeviteAns: 80, dissemination: "geai", semisParAn: 0.4 },
    litiere: { cnRatio: 25 },
    // Le noisetier est précoce — il fleurit même en plein hiver.
    phenologie: { debourrementDJ: 95, seuilJourH: 11.0, besoinFroidSemaines: 8 },
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
    // l'essence préférée du chevreuil
    // balanin des noisettes
    // l'hôte de la truffe
    exigenceMinerale: 1.6,
    mycorhize: "ecto",
    ravageurs: { sensibilite: 0.45 },
    gibier: { appetence: 0.9 },
    feu: { inflammabilite: 0.4, resistanceEcorce: 0.1, rejetteApresFeu: true },
    sources: [ATLAS],
  },
  {
    id: "prunus_spinosa",
    nom: "Prunellier",
    nomLatin: "Prunus spinosa",
    hauteurMaxM: 4,
    pousseMaxMAn: 0.4,
    // Atlas : arbuste pionnier, « drageonne, nurse », haies — Europe entière.
    eau: { seuilConfortSecheresse: 0.5, seuilStressSecheresse: 0.18, toleranceEngorgement: 0.15 },
    ph: [5.5, 8.5],
    lumiere: { compensation: 0.12, saturation: 0.7, lai: 2.2, houppierRatio: 0.6, caduc: true },
    racines: { profondeurMaxCm: 100 },
    tBaseCroissanceC: 5,
    azote: { demandeRelative: 0.5, fixateur: false },
    // Drupes emportées par les oiseaux, mais la vraie conquête se fait par
    // DRAGEONS : le fourré avance en tache. Faute de savoir modéliser le
    // drageonnement, on compense par un taux de semis généreux *(à calibrer)*.
    regeneration: { maturiteAns: 5, longeviteAns: 50, dissemination: "oiseaux", semisParAn: 1.2 },
    litiere: { cnRatio: 28 },
    // L'épine noire fleurit avant de feuiller, dès mars.
    phenologie: { debourrementDJ: 115, seuilJourH: 11.3, besoinFroidSemaines: 10 },
    economie: { prixPlantEur: 4 },
    bois: { densite: 0.75, prixOeuvreEurM3: 0, rejetteDeSouche: true },
    fruits: {
      floraisonDJ: 60, // fleurit AVANT les feuilles, dès mars : exposé au gel
      gelFatalC: -3,
      recolteWeek: 42, // après les premières gelées, qui les rendent mangeables
      fenetreRecolteWeeks: 4,
      croissanceSem: 20,
      rendementMaxKg: 4,
      prixEurKg: 2,
      recolteHKg: 0.3, // épineux : la cueillette est lente
      autofertile: true,
    },
    // Épineux serré : le gibier l'évite, et ce qu'il protège pousse dedans.
    exigenceMinerale: 1.5,
    mycorhize: "arbusculaire",
    ravageurs: { sensibilite: 0.4 },
    gibier: { appetence: 0.3 },
    feu: { inflammabilite: 0.45, resistanceEcorce: 0.15, rejetteApresFeu: true },
    sources: [ATLAS],
  },
  {
    id: "crataegus_monogyna",
    nom: "Aubépine",
    nomLatin: "Crataegus monogyna",
    hauteurMaxM: 8,
    pousseMaxMAn: 0.3,
    // Atlas : « nurse épineuse », pionnière, très commune.
    eau: { seuilConfortSecheresse: 0.55, seuilStressSecheresse: 0.2, toleranceEngorgement: 0.2 },
    ph: [5.5, 8.5],
    lumiere: { compensation: 0.1, saturation: 0.65, lai: 2.5, houppierRatio: 0.55, caduc: true },
    racines: { profondeurMaxCm: 130 },
    tBaseCroissanceC: 5,
    azote: { demandeRelative: 0.5, fixateur: false },
    // Cenelles avalées par les grives : elles ressortent n'importe où.
    regeneration: { maturiteAns: 8, longeviteAns: 200, dissemination: "oiseaux", semisParAn: 0.9 },
    litiere: { cnRatio: 26 },
    // L'aubépine suit l'épine noire de quelques semaines.
    phenologie: { debourrementDJ: 135, seuilJourH: 11.5, besoinFroidSemaines: 12 },
    economie: { prixPlantEur: 4 },
    bois: { densite: 0.8, prixOeuvreEurM3: 0, rejetteDeSouche: true },
    // Épines longues : c'est l'abri sous lequel un chêne passe ses dix
    // premières années sans se faire brouter.
    exigenceMinerale: 1.8,
    mycorhize: "arbusculaire",
    ravageurs: { sensibilite: 0.5 },
    gibier: { appetence: 0.25 },
    feu: { inflammabilite: 0.4, resistanceEcorce: 0.2, rejetteApresFeu: true },
    sources: [ATLAS],
  },
  {
    id: "rubus_fruticosus",
    nom: "Ronce",
    nomLatin: "Rubus fruticosus",
    hauteurMaxM: 2.5,
    pousseMaxMAn: 1.4, // la plus rapide de l'atlas : elle prend une friche en trois ans
    // Atlas : « nurse (fruticée) », pionnière, cosmopolite tempéré.
    eau: { seuilConfortSecheresse: 0.6, seuilStressSecheresse: 0.25, toleranceEngorgement: 0.25 },
    ph: [4.5, 8],
    // Demi-ombre tolérée : elle tient sous un couvert clair, ce qui lui permet
    // d'attendre la trouée.
    lumiere: { compensation: 0.06, saturation: 0.5, lai: 3, houppierRatio: 0.8, caduc: true },
    racines: { profondeurMaxCm: 60 },
    tBaseCroissanceC: 5,
    azote: { demandeRelative: 0.7, fixateur: false },
    // Les mûres sont mangées par tout ce qui vole : c'est LE colonisateur.
    regeneration: { maturiteAns: 2, longeviteAns: 15, dissemination: "oiseaux", semisParAn: 2 },
    litiere: { cnRatio: 24 },
    // La ronce ne perd qu'une partie de son feuillage : elle repart tôt.
    phenologie: { debourrementDJ: 120, seuilJourH: 11.3, besoinFroidSemaines: 8 },
    economie: { prixPlantEur: 2 },
    bois: { densite: 0.5, prixOeuvreEurM3: 0, rejetteDeSouche: true },
    fruits: {
      floraisonDJ: 900, // juin : hors d'atteinte des gels
      gelFatalC: -1,
      recolteWeek: 34,
      fenetreRecolteWeeks: 5,
      croissanceSem: 8,
      rendementMaxKg: 3,
      prixEurKg: 4,
      recolteHKg: 0.4, // ronces : on y laisse du sang et du temps
      autofertile: true,
    },
    exigenceMinerale: 1.6,
    mycorhize: "arbusculaire",
    ravageurs: { sensibilite: 0.3 },
    gibier: { appetence: 0.45 },
    feu: { inflammabilite: 0.5, resistanceEcorce: 0.05, rejetteApresFeu: true },
    sources: [ATLAS],
  },
  {
    id: "sambucus_nigra",
    nom: "Sureau noir",
    nomLatin: "Sambucus nigra",
    hauteurMaxM: 7,
    pousseMaxMAn: 0.9,
    // Atlas : « nitrophile, pousse vite », pionnier, très commun.
    eau: { seuilConfortSecheresse: 0.7, seuilStressSecheresse: 0.3, toleranceEngorgement: 0.3 },
    ph: [5.5, 8],
    lumiere: { compensation: 0.1, saturation: 0.55, lai: 2.5, houppierRatio: 0.6, caduc: true },
    racines: { profondeurMaxCm: 80 },
    tBaseCroissanceC: 6,
    // NITROPHILE : il ne pousse que là où l'azote abonde — lisières fumées,
    // tas de fumier, pieds de haie. C'est un indicateur, pas un passe-partout.
    azote: { demandeRelative: 1, fixateur: false },
    regeneration: { maturiteAns: 4, longeviteAns: 40, dissemination: "oiseaux", semisParAn: 1.5 },
    litiere: { cnRatio: 20 },
    // Le sureau est l'un des tout premiers à verdir dans les haies.
    phenologie: { debourrementDJ: 105, seuilJourH: 11.2, besoinFroidSemaines: 8 }, // litière tendre, azotée : elle se minéralise vite
    economie: { prixPlantEur: 5 },
    bois: { densite: 0.5, prixOeuvreEurM3: 0, rejetteDeSouche: true },
    fruits: {
      floraisonDJ: 700, // juin
      gelFatalC: -1,
      recolteWeek: 36,
      fenetreRecolteWeeks: 3,
      croissanceSem: 10,
      rendementMaxKg: 8,
      prixEurKg: 3,
      recolteHKg: 0.12,
      autofertile: true,
    },
    exigenceMinerale: 2.5,
    mycorhize: "arbusculaire",
    ravageurs: { sensibilite: 0.35 },
    gibier: { appetence: 0.2 }, // feuillage rebutant : le chevreuil s'en détourne
    feu: { inflammabilite: 0.35, resistanceEcorce: 0.1, rejetteApresFeu: true },
    sources: [ATLAS],
  },
  {
    id: "carpinus_betulus",
    nom: "Charme",
    nomLatin: "Carpinus betulus",
    hauteurMaxM: 25,
    pousseMaxMAn: 0.4,
    // Atlas : sciaphile climacique, « haies ». Il comblait un vrai trou — le
    // hêtre était la seule essence d'ombre du moteur, et une forêt n'a jamais
    // un seul candidat au sous-étage.
    eau: { seuilConfortSecheresse: 0.7, seuilStressSecheresse: 0.3, toleranceEngorgement: 0.35 },
    ph: [4.5, 8],
    lumiere: { compensation: 0.03, saturation: 0.4, lai: 3.5, houppierRatio: 0.35, caduc: true },
    racines: { profondeurMaxCm: 110 },
    tBaseCroissanceC: 5,
    azote: { demandeRelative: 0.6, fixateur: false },
    regeneration: { maturiteAns: 20, longeviteAns: 150, dissemination: "vent", semisParAn: 2 },
    litiere: { cnRatio: 28 },
    // Le charme débourre tôt, avant le hêtre et le chêne.
    phenologie: { debourrementDJ: 130, seuilJourH: 11.5, besoinFroidSemaines: 12 },
    economie: { prixPlantEur: 3 },
    // Bois très dur : c'est LE bois de chauffage, et le taillis de charme
    // repart indéfiniment — d'où sa place dans toutes les haies plessées.
    bois: { densite: 0.8, prixOeuvreEurM3: 90, rejetteDeSouche: true },
    exigenceMinerale: 2,
    mycorhize: "ecto",
    ravageurs: { sensibilite: 0.3 },
    gibier: { appetence: 0.55 },
    feu: { inflammabilite: 0.3, resistanceEcorce: 0.15, rejetteApresFeu: true },
    sources: [ATLAS],
  },
  {
    id: "ilex_aquifolium",
    nom: "Houx",
    nomLatin: "Ilex aquifolium",
    hauteurMaxM: 8,
    pousseMaxMAn: 0.15, // l'un des plus lents de l'atlas
    // Atlas : « persistant », sciaphile climacique. C'est le seul couvert
    // PERMANENT de sous-bois : en janvier, sous une hêtraie nue, c'est lui qui
    // abrite et nourrit.
    eau: { seuilConfortSecheresse: 0.75, seuilStressSecheresse: 0.3, toleranceEngorgement: 0.2 },
    ph: [4, 7],
    lumiere: { compensation: 0.02, saturation: 0.35, lai: 3, houppierRatio: 0.4, caduc: false },
    racines: { profondeurMaxCm: 80 },
    tBaseCroissanceC: 5,
    azote: { demandeRelative: 0.4, fixateur: false },
    regeneration: { maturiteAns: 15, longeviteAns: 200, dissemination: "oiseaux", semisParAn: 1.5 },
    litiere: { cnRatio: 35 }, // feuille coriace et cireuse : elle met des années
    phenologie: { debourrementDJ: 200, seuilJourH: 11.5, besoinFroidSemaines: 8 },
    economie: { prixPlantEur: 7 },
    bois: { densite: 0.8, prixOeuvreEurM3: 0, rejetteDeSouche: true },
    exigenceMinerale: 1.2,
    mycorhize: "arbusculaire",
    ravageurs: { sensibilite: 0.2 },
    // Piquant, mais le chevreuil s'y met quand même en hiver, faute de mieux.
    gibier: { appetence: 0.3 },
    feu: { inflammabilite: 0.35, resistanceEcorce: 0.15, rejetteApresFeu: true },
    sources: [ATLAS],
  },
  {
    id: "salix_alba",
    nom: "Saule blanc",
    nomLatin: "Salix alba",
    hauteurMaxM: 20,
    pousseMaxMAn: 1.2,
    // Atlas : « bouture facile, pH indifférent », bords d'eau, pionnier. Avec
    // l'aulne, c'est l'essence des ripisylves — et la seule qui accepte d'avoir
    // les pieds dans l'eau presque en permanence.
    eau: { seuilConfortSecheresse: 0.85, seuilStressSecheresse: 0.6, toleranceEngorgement: 0.95 },
    ph: [4.5, 8],
    lumiere: { compensation: 0.18, saturation: 0.8, lai: 2, houppierRatio: 0.45, caduc: true },
    racines: { profondeurMaxCm: 120 },
    tBaseCroissanceC: 5,
    azote: { demandeRelative: 0.8, fixateur: false },
    // Graines plumeuses, emportées loin par le vent — mais qui ne germent que
    // sur limon frais et nu, ce que le moteur traduit par sa soif.
    regeneration: { maturiteAns: 5, longeviteAns: 60, dissemination: "vent", semisParAn: 4 },
    litiere: { cnRatio: 22 },
    // Il débourre parmi les tout premiers, avec le bouleau.
    phenologie: { debourrementDJ: 80, seuilJourH: 10.8, besoinFroidSemaines: 7 },
    economie: { prixPlantEur: 3 }, // une bouture suffit
    bois: { densite: 0.4, prixOeuvreEurM3: 60, rejetteDeSouche: true },
    exigenceMinerale: 2,
    // L'atlas le donne à double mycorhization ; le moteur ne connaît qu'un
    // réseau par espèce, on retient l'ectomycorhize.
    mycorhize: "ecto",
    ravageurs: { sensibilite: 0.5 },
    gibier: { appetence: 0.6 },
    feu: { inflammabilite: 0.3, resistanceEcorce: 0.1, rejetteApresFeu: true },
    sources: [ATLAS],
  },
  {
    id: "cornus_mas",
    nom: "Cornouiller mâle",
    nomLatin: "Cornus mas",
    hauteurMaxM: 6,
    pousseMaxMAn: 0.25,
    // Atlas : « calcicole, floraison précoce ». Il fleurit en février, avant
    // tout le monde — c'est la première ressource de l'année pour les
    // pollinisateurs, et cela compte dans l'indice de biodiversité.
    eau: { seuilConfortSecheresse: 0.45, seuilStressSecheresse: 0.15, toleranceEngorgement: 0.1 },
    ph: [6, 8.5],
    lumiere: { compensation: 0.06, saturation: 0.5, lai: 2.5, houppierRatio: 0.5, caduc: true },
    racines: { profondeurMaxCm: 100 },
    tBaseCroissanceC: 5,
    azote: { demandeRelative: 0.5, fixateur: false },
    regeneration: { maturiteAns: 6, longeviteAns: 100, dissemination: "oiseaux", semisParAn: 1 },
    litiere: { cnRatio: 25 },
    phenologie: { debourrementDJ: 110, seuilJourH: 11.3, besoinFroidSemaines: 11 },
    economie: { prixPlantEur: 6 },
    bois: { densite: 0.9, prixOeuvreEurM3: 0, rejetteDeSouche: true }, // le bois le plus dur d'Europe
    fruits: {
      floraisonDJ: 25, // février, sur bois nu : c'est sa signature
      gelFatalC: -4, // et il l'encaisse, sans quoi il n'existerait pas
      recolteWeek: 34,
      fenetreRecolteWeeks: 3,
      croissanceSem: 20,
      rendementMaxKg: 6,
      prixEurKg: 3,
      recolteHKg: 0.15,
      autofertile: false,
    },
    exigenceMinerale: 1.8,
    mycorhize: "arbusculaire",
    ravageurs: { sensibilite: 0.25 },
    gibier: { appetence: 0.35 },
    feu: { inflammabilite: 0.35, resistanceEcorce: 0.2, rejetteApresFeu: true },
    sources: [ATLAS],
  },
  {
    id: "euonymus_europaeus",
    nom: "Fusain d'Europe",
    nomLatin: "Euonymus europaeus",
    hauteurMaxM: 6,
    pousseMaxMAn: 0.35,
    // Atlas : arbuste de haie et de lisière, neutro-calcicole, à demi-ombre.
    // Il ne domine jamais rien : il occupe l'ourlet, sous les grands, là où le
    // couvert s'entrouvre.
    eau: { seuilConfortSecheresse: 0.65, seuilStressSecheresse: 0.25, toleranceEngorgement: 0.3 },
    ph: [5.5, 8.5],
    lumiere: { compensation: 0.05, saturation: 0.5, lai: 2.5, houppierRatio: 0.55, caduc: true },
    racines: { profondeurMaxCm: 100 },
    tBaseCroissanceC: 5,
    azote: { demandeRelative: 0.6, fixateur: false },
    // Capsules roses à arilles orange : les rouges-gorges et les fauvettes les
    // emportent — la graine ressort n'importe où, comme celle de l'aubépine.
    regeneration: { maturiteAns: 6, longeviteAns: 80, dissemination: "oiseaux", semisParAn: 0.9 },
    litiere: { cnRatio: 24 },
    // Il verdit tôt, avant les grands arbres de la haie.
    phenologie: { debourrementDJ: 115, seuilJourH: 11.2, besoinFroidSemaines: 10 },
    economie: { prixPlantEur: 4 },
    // Bois blanc, dur et fin : celui dont on fait les fusains à dessin — mais
    // rien qui se vende au m³.
    bois: { densite: 0.7, prixOeuvreEurM3: 0, rejetteDeSouche: true },
    exigenceMinerale: 1.8,
    mycorhize: "arbusculaire",
    // C'est l'hôte d'HIVER du puceron noir (Aphis fabae) : il l'héberge d'une
    // saison à l'autre, et un fusain fatigué se couvre d'oïdium.
    ravageurs: { sensibilite: 0.55 },
    // Toute la plante est toxique — ce qui ne dissuade pas complètement le
    // chevreuil, mais il a mieux à faire dans la même haie.
    gibier: { appetence: 0.2 },
    feu: { inflammabilite: 0.3, resistanceEcorce: 0.1, rejetteApresFeu: true },
    // Fruits toxiques : rien à récolter (pas de bloc `fruits`).
    sources: [ATLAS],
  },
  {
    id: "ligustrum_vulgare",
    nom: "Troène commun",
    nomLatin: "Ligustrum vulgare",
    hauteurMaxM: 5,
    pousseMaxMAn: 0.4,
    // Atlas : « calcicole, supporte la taille → haies ». C'est l'arbuste des
    // ourlets calcaires secs : là où le fusain demande de la fraîcheur, lui
    // tient le coteau.
    eau: { seuilConfortSecheresse: 0.5, seuilStressSecheresse: 0.15, toleranceEngorgement: 0.15 },
    ph: [6, 8.5],
    lumiere: { compensation: 0.05, saturation: 0.55, lai: 3, houppierRatio: 0.5, caduc: true },
    racines: { profondeurMaxCm: 90 },
    tBaseCroissanceC: 5,
    azote: { demandeRelative: 0.5, fixateur: false },
    // Baies noires en grappes dressées, avalées par les grives tout l'hiver.
    regeneration: { maturiteAns: 5, longeviteAns: 60, dissemination: "oiseaux", semisParAn: 1.2 },
    litiere: { cnRatio: 25 },
    // Semi-persistant : il garde ses feuilles jusqu'aux vraies gelées et
    // repart parmi les premiers. Le moteur ne connaît que caduc/persistant —
    // on le compte caduc, mais il débourre très tôt.
    phenologie: { debourrementDJ: 100, seuilJourH: 11.0, besoinFroidSemaines: 7 },
    economie: { prixPlantEur: 3 },
    bois: { densite: 0.75, prixOeuvreEurM3: 0, rejetteDeSouche: true },
    exigenceMinerale: 1.5,
    mycorhize: "arbusculaire",
    ravageurs: { sensibilite: 0.3 },
    // Un feuillage encore vert en décembre, à hauteur de museau : c'est
    // exactement ce que le chevreuil cherche quand tout le reste est nu.
    gibier: { appetence: 0.5 },
    feu: { inflammabilite: 0.35, resistanceEcorce: 0.1, rejetteApresFeu: true },
    // Baies toxiques : rien à récolter (pas de bloc `fruits`).
    sources: [ATLAS],
  },
  {
    id: "euonymus_europaeus",
    nom: "Fusain d'Europe",
    nomLatin: "Euonymus europaeus",
    hauteurMaxM: 6,
    pousseMaxMAn: 0.3,
    // Atlas : arbuste de demi-ombre à ombre, haies et lisières, surtout sur
    // calcaire. Ses capsules roses à quatre lobes et ses arilles orange sont
    // toxiques — et son bois donne les fusains à dessin.
    eau: { seuilConfortSecheresse: 0.6, seuilStressSecheresse: 0.25, toleranceEngorgement: 0.2 },
    ph: [5.5, 8.5],
    lumiere: { compensation: 0.05, saturation: 0.45, lai: 2.2, houppierRatio: 0.5, caduc: true },
    racines: { profondeurMaxCm: 90 },
    tBaseCroissanceC: 5,
    azote: { demandeRelative: 0.5, fixateur: false },
    regeneration: { maturiteAns: 6, longeviteAns: 80, dissemination: "oiseaux", semisParAn: 1 },
    litiere: { cnRatio: 26 },
    phenologie: { debourrementDJ: 125, seuilJourH: 11.4, besoinFroidSemaines: 10 },
    economie: { prixPlantEur: 5 },
    bois: { densite: 0.7, prixOeuvreEurM3: 0, rejetteDeSouche: true },
    exigenceMinerale: 1.7,
    mycorhize: "arbusculaire",
    // Hôte d'HIVER du puceron noir : il l'héberge à la mauvaise saison et le
    // relâche au printemps sur ses voisines. C'est ce qui en fait un arbuste à
    // placer en connaissance de cause dans une haie.
    ravageurs: { sensibilite: 0.45, hoteHivernal: true },
    gibier: { appetence: 0.4 },
    feu: { inflammabilite: 0.35, resistanceEcorce: 0.15, rejetteApresFeu: true },
    sources: [ATLAS],
  },
  {
    id: "ligustrum_vulgare",
    nom: "Troène commun",
    nomLatin: "Ligustrum vulgare",
    hauteurMaxM: 5,
    pousseMaxMAn: 0.35,
    // Atlas : « semi-persistant ; calcicole ; très mellifère (juin) ; supporte
    // la taille → haies ». Ourlets et lisières, surtout sur calcaire.
    eau: { seuilConfortSecheresse: 0.5, seuilStressSecheresse: 0.2, toleranceEngorgement: 0.2 },
    ph: [6, 8.5],
    // SEMI-PERSISTANT : il ne se dénude jamais tout à fait. C'est le seul de
    // l'atlas dans ce cas, et c'est ce qui lui vaut sa place dans les haies —
    // il abrite encore en février (phenologie.ts).
    lumiere: {
      compensation: 0.05,
      saturation: 0.5,
      lai: 2.4,
      houppierRatio: 0.5,
      caduc: true,
      retentionHivernale: 0.45,
    },
    racines: { profondeurMaxCm: 90 },
    tBaseCroissanceC: 5,
    azote: { demandeRelative: 0.5, fixateur: false },
    regeneration: { maturiteAns: 5, longeviteAns: 70, dissemination: "oiseaux", semisParAn: 1.5 },
    litiere: { cnRatio: 27 },
    phenologie: { debourrementDJ: 120, seuilJourH: 11.4, besoinFroidSemaines: 9 },
    economie: { prixPlantEur: 4 },
    bois: { densite: 0.75, prixOeuvreEurM3: 0, rejetteDeSouche: true },
    fruits: {
      // Très mellifère en juin : ses fleurs comptent dans l'étalement des
      // floraisons, même si ses baies sont toxiques et ne se récoltent pas.
      floraisonDJ: 800,
      gelFatalC: -1,
      recolteWeek: 40,
      fenetreRecolteWeeks: 2,
      croissanceSem: 12,
      rendementMaxKg: 0,
      prixEurKg: 0,
      recolteHKg: 0,
      autofertile: true,
    },
    exigenceMinerale: 1.6,
    mycorhize: "arbusculaire",
    ravageurs: { sensibilite: 0.3 },
    gibier: { appetence: 0.35 },
    feu: { inflammabilite: 0.4, resistanceEcorce: 0.15, rejetteApresFeu: true },
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
    // Sempervirent : valeurs sans effet.
    phenologie: { debourrementDJ: 100, seuilJourH: 11.0, besoinFroidSemaines: 6 },
    economie: { prixPlantEur: 3 },
    bois: { densite: 0.6, prixOeuvreEurM3: 40, rejetteDeSouche: true },
    // épines dissuasives, mais brouté en hiver sur la lande
    // rien ne s'y attaque vraiment
    exigenceMinerale: 1,
    mycorhize: "arbusculaire",
    ravageurs: { sensibilite: 0.15 },
    gibier: { appetence: 0.25 },
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
    // Sempervirent : valeurs sans effet.
    phenologie: { debourrementDJ: 100, seuilJourH: 11.0, besoinFroidSemaines: 6 },
    economie: { prixPlantEur: 2.5 },
    bois: { densite: 0.55, prixOeuvreEurM3: 40, rejetteDeSouche: true },
    // genêt appété, sans épines
    exigenceMinerale: 1,
    mycorhize: "arbusculaire",
    ravageurs: { sensibilite: 0.2 },
    gibier: { appetence: 0.55 },
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
    // Sempervirent : valeurs sans effet.
    phenologie: { debourrementDJ: 100, seuilJourH: 11.0, besoinFroidSemaines: 6 },
    economie: { prixPlantEur: 2 },
    bois: { densite: 0.6, prixOeuvreEurM3: 30, rejetteDeSouche: true },
    // consommée l'hiver quand il n'y a rien d'autre
    // le type des landes : il va chercher l'azote organique des sols acides
    exigenceMinerale: 1,
    mycorhize: "ericoide",
    ravageurs: { sensibilite: 0.15 },
    gibier: { appetence: 0.35 },
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
    regeneration: { maturiteAns: 20, longeviteAns: 300, dissemination: "geai", semisParAn: 2 },
    litiere: { cnRatio: 45 },
    // Le châtaignier est tardif : mi-mai. *(Des observations de terrain le donnent parfois plus précoce que le chêne ; on suit ici la vue forestière courante.)*
    phenologie: { debourrementDJ: 300, seuilJourH: 12.5, besoinFroidSemaines: 12 },
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
    // rejets très broutés
    // chancre et cynips
    exigenceMinerale: 1,
    mycorhize: "ecto",
    ravageurs: { sensibilite: 0.7 },
    gibier: { appetence: 0.5 },
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
    regeneration: { maturiteAns: 25, longeviteAns: 250, dissemination: "geai", semisParAn: 2 },
    litiere: { cnRatio: 50 },
    // Sempervirent : valeurs sans effet.
    phenologie: { debourrementDJ: 150, seuilJourH: 11.5, besoinFroidSemaines: 6 },
    economie: { prixPlantEur: 5 },
    bois: { densite: 0.7, prixOeuvreEurM3: 160, rejetteDeSouche: true },
    // Le liège se lève tous les ~10 ans SANS abattre l'arbre : une subéraie
    // produit pendant un siècle et demi. C'est la vraie raison de la planter,
    // bien plus que son bois.
    ecorce: {
      nom: "liège",
      rotationAns: 10,
      premierAge: 25,
      rendementKg: 45,
      prixEurKg: 1.8,
      recolteHKg: 0.05,
    },
    // Cette même écorce isole si bien que l'arbre traverse l'incendie et
    // repart (atlas : « écorce = liège → résiste au feu »).
    // appété, mais feuillage coriace
    exigenceMinerale: 1,
    mycorhize: "ecto",
    ravageurs: { sensibilite: 0.35 },
    gibier: { appetence: 0.6 },
    feu: { inflammabilite: 0.5, resistanceEcorce: 0.95, rejetteApresFeu: true },
    sources: [ATLAS],
  },
  {
    id: "fraxinus_excelsior",
    nom: "Frêne commun",
    nomLatin: "Fraxinus excelsior",
    hauteurMaxM: 35,
    pousseMaxMAn: 0.7,
    // Atlas : mésophile à hygrocline, il aime les sols frais et riches et
    // souffre vite en sol sec — c'est LE frêne des fonds de vallée et des
    // haies bocagères.
    eau: { seuilConfortSecheresse: 0.8, seuilStressSecheresse: 0.45, toleranceEngorgement: 0.5 },
    ph: [5, 8],
    // Demi-héliophile : il s'installe en lisière et dans les trouées, pas sous
    // couvert fermé.
    lumiere: { compensation: 0.06, saturation: 0.6, lai: 2.5, houppierRatio: 0.35, caduc: true },
    racines: { profondeurMaxCm: 120 },
    tBaseCroissanceC: 6,
    // Exigeant : c'est un arbre de sol riche, il paie cher les sols pauvres.
    azote: { demandeRelative: 0.9, fixateur: false },
    regeneration: { maturiteAns: 25, longeviteAns: 200, dissemination: "vent", semisParAn: 5 },
    // Litière tendre et riche (C/N ~25) : le frêne améliore son sol, c'est une
    // des raisons de sa place dans les haies.
    litiere: { cnRatio: 25 },
    // Le frêne est le dernier des grands feuillus à sortir, mi-mai passée.
    phenologie: { debourrementDJ: 310, seuilJourH: 12.5, besoinFroidSemaines: 12 },
    economie: { prixPlantEur: 3 },
    // Bois d'œuvre de premier ordre (manches, sport, ébénisterie) et rejet
    // vigoureux : c'est l'arbre à trogne par excellence.
    bois: { densite: 0.68, prixOeuvreEurM3: 200, rejetteDeSouche: true },
    feu: { inflammabilite: 0.25, resistanceEcorce: 0.15, rejetteApresFeu: true },
    // Très appété : un jeune frêne non protégé n'a aucune chance.
    gibier: { appetence: 0.8 },
    exigenceMinerale: 1,
    mycorhize: "arbusculaire",
    // La chalarose (Hymenoscyphus fraxineus) frappe l'espèce depuis 2008 :
    // c'est l'essence la plus menacée de France.
    ravageurs: { sensibilite: 0.9 },
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
    // Sempervirent : valeurs sans effet.
    phenologie: { debourrementDJ: 120, seuilJourH: 11.0, besoinFroidSemaines: 5 },
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
    // feuillage sclérophylle peu recherché
    exigenceMinerale: 1,
    mycorhize: "ericoide",
    ravageurs: { sensibilite: 0.2 },
    gibier: { appetence: 0.3 },
    feu: { inflammabilite: 0.7, resistanceEcorce: 0.35, rejetteApresFeu: true },
    sources: [ATLAS],
  },
];

export function getEspece(id: string): EspeceV0 {
  const espece = ESPECES_V0.find((e) => e.id === id);
  if (!espece) throw new Error(`espèce inconnue : ${id}`);
  return espece;
}
