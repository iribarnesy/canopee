/**
 * Fiches espèces V0 — 5 essences pour valider la croissance en loi du minimum.
 * Paramètres dérivés de l'atlas (`Notes/atlas-especes/Espèces - référence.md`,
 * nuanciers eau/trophie/lumière) ; les valeurs numériques sont des ordres de
 * grandeur **à calibrer** (Flore forestière française, IFN). Format complet en
 * V1 (docs/regles.md §6), migration vers data/ + Zod à ce moment-là.
 */

import type { Semences } from "./glandee";

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
   * Amplitude de pH où l'atlas signale l'espèce [min, max] (nuancier
   * acidiphile→calcicole).
   *
   * C'EST UNE AMPLITUDE DE PRÉSENCE, PAS UN PLATEAU DE VIGUEUR. L'espèce y est
   * pleine en son milieu et réduite au cinquième à ses bornes, où elle est
   * rare et mal en point sans être morte — c'est `soil.ts:facteurGammePh` qui
   * porte la forme, et elle est unimodale. Lire ces deux nombres comme des
   * murs a déjà coûté : le moteur tuait à coup sûr au pH exact qu'il annonçait
   * tolérable.
   */
  ph: [number, number];
  lumiere: {
    /**
     * Point de compensation ∈ [0,1] : part de la pleine lumière en dessous de
     * laquelle l'arbre cesse de croître et vit sur ses réserves (ch3-B).
     * Sciaphile ≈ 0,03, héliophile ≈ 0,2-0,3.
     *
     * CE N'EST PAS LE SEUIL DE MORT, et la nuance a déjà trompé deux
     * commentaires. La croissance s'annule à `compensation` (`fLum`) ; le
     * STRESS, lui, ne monte qu'à `2 × STRESS_ONSET × compensation`, soit 0,9
     * fois celui-ci (`fLumSurvival`, trees.ts). Entre les deux, l'arbre ne
     * pousse plus et ne meurt pas — c'est le semis qui patiente sous couvert,
     * et c'est voulu.
     *
     * Conséquence à connaître : le hêtre (0,01) a un seuil de stress de 0,0090,
     * SOUS le plancher de lumière du moteur (0,0111). Il ne peut donc jamais
     * mourir d'ombre (#65, `lumiere.test.ts`).
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
    /**
     * MARCESCENCE : part du feuillage gardée sur l'arbre après la sénescence,
     * MORTE ∈ [0,1]. Le charme et le jeune chêne gardent leurs feuilles brunes
     * jusqu'à ce que les bourgeons les poussent au printemps. Ce n'est ni de la
     * persistance — ces feuilles ne photosynthétisent plus — ni de la caducité
     * ordinaire : elles ombragent encore tout l'hiver (phenologie.ts).
     */
    marcescence?: number;
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
  /**
   * ALLÉLOPATHIE : ce que l'espèce libère pour empêcher les autres de pousser
   * chez elle. Le seul cas de l'atlas est le noyer et sa juglone, qui inhibe la
   * germination et la croissance dans un rayon de quinze à vingt mètres.
   *
   * Le mécanisme n'a rien d'anecdotique pour ce jeu : il rend le choix des
   * VOISINS décisif là où, ailleurs, seule la lumière compte.
   */
  allelopathie?: { porteeM: number };
  /**
   * Sensibilité à l'allélopathie ∈ [0,1] : 0 = indifférent, 1 = inhibé de plein
   * fouet.
   *
   * La littérature de terrain ne donne que des LISTES — le pommier, le pin et
   * le bouleau souffrent, les graminées et beaucoup de vivaces ne bronchent
   * pas. Faute de mesure espèce par espèce, les fiches où l'on ne sait pas
   * portent la valeur médiane par défaut, et c'est écrit *(à calibrer)*.
   */
  sensibiliteAllelopathie?: number;
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
    /**
     * DRAGEONNEMENT : la conquête par la racine, pour les espèces qui en font.
     *
     * Un drageon n'est pas un semis. Il naît sur une racine traçante, à
     * quelques mètres du pied au plus, et il reste RELIÉ à sa mère le temps de
     * s'installer. Deux conséquences, et ce sont les deux qui comptent : la
     * tache avance par son BORD au lieu d'essaimer au loin, et le drageon
     * n'a pas besoin de trouver sa lumière tout seul — il pousse sous le
     * couvert de sa propre espèce, là où aucune graine ne lèverait.
     *
     * C'est ce qui fait du prunellier un problème de gestion dans une haie : le
     * fourré ne se contente pas de tenir sa place, il avance dans le champ.
     */
    drageonne?: {
      /** distance maximale entre la mère et son drageon, m */
      porteeM: number;
      /** drageons qui s'installent par pied mature et par an */
      parAn: number;
    };
    /**
     * BANQUE DE GRAINES du sol, pour les espèces qui en font une. Absente pour
     * la plupart : un gland ou une faîne est une graine RÉCALCITRANTE, elle ne
     * survit pas à un hiver sec et ne fait aucune mémoire du passé.
     *
     * Les légumineuses à tégument dur, elles, en font une qui dure des
     * décennies — et le feu la réveille. C'est ce qui fait qu'une lande brûlée
     * revient en lande : l'ajonc ne recolonise pas depuis le voisinage, il
     * remonte du sol sur place.
     */
    banqueGraines?: {
      /**
       * Durée pendant laquelle une graine reste viable dans le sol, années.
       * L'ajonc tient 25 à 30 ans dans les six premiers centimètres.
       */
      persistanceAns: number;
      /**
       * Part de la banque qui lève APRÈS UN PASSAGE DE FEU ∈ [0,1]. Le feu
       * scarifie le tégument sans détruire la banque : le sol isole assez pour
       * que même un feu intense laisse intactes les graines enfouies, et c'est
       * la chaleur reçue qui lève leur dormance.
       */
      leveeParLeFeu: number;
      /**
       * Part qui lève une année ordinaire, sans feu. Faible par construction —
       * une graine à tégument dur ne germe pas toute seule, c'est tout son
       * intérêt.
       */
      leveeSpontanee: number;
    };
  };
  litiere: {
    /** rapport C/N de la litière : bas = minéralisation rapide (ch2-B) */
    cnRatio: number;
    /**
     * Calcium de la litière, mg/g de matière sèche — le trait qui décide si
     * une essence ACIDIFIE le sol qu'elle occupe ou l'entretient (`bases.ts`).
     *
     * Ce n'est pas un « pouvoir acidifiant » abstrait : c'est une grandeur
     * qu'on mesure et qu'on publie, et la chaîne causale qui en découle a été
     * mesurée aussi (Reich et al. 2005, jardin commun de quatorze essences en
     * Pologne centrale, trente ans : la teneur en calcium de la litière varie
     * du simple au quadruple entre essences, et c'est elle qui explique le pH
     * du sol, le calcium échangeable, le taux de saturation, la vitesse de
     * dégradation du plancher forestier et les vers de terre).
     *
     * Le tableau de `bases.ts` dit d'où vient chaque valeur. Attention : « un
     * résineux acidifie » n'est PAS ce que disent les mesures — la litière
     * d'épicéa contient deux fois plus de calcium que celle du pin sylvestre.
     */
    calciumMgG: number;
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
    /**
     * INFRADENSITÉ du bois : masse anhydre rapportée au volume VERT, t/m³.
     * C'est la grandeur que demande la biomasse — et non la densité à 12 %
     * d'humidité, celle du commerce et des tables de menuiserie, que ce champ
     * a portée jusqu'à #68 tout en se décrivant déjà comme une infradensité.
     *
     * Deux lecteurs, et ils veulent la même chose : `treeAboveCarbonKg`
     * (carbon.ts) en a besoin telle quelle, `dureeChandelleSemaines`
     * (trees.ts) n'y lit qu'un proxy de dureté — les deux grandeurs classent
     * les essences dans le même ordre. Le prix, lui, se compte au m³
     * (`prixOeuvreEurM3`) et ne lit pas ce champ.
     *
     * Chaque valeur couverte par une source la cite dans le `sources` de sa
     * fiche ; celles qu'aucune des deux ne couvre le disent en commentaire et
     * restent à leur valeur d'avant, faute de mieux.
     */
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
  /**
   * FLEURIR N'EST PAS FRUCTIFIER, et les confondre fabriquait des trous dans
   * le calendrier (issue #70, critères G4 et J6).
   *
   * La date de floraison vivait dans le bloc `fruits`, réservé aux essences
   * dont on récolte quelque chose. Or l'ajonc fleurit de décembre à juin et la
   * callune en août : ce couple-là nourrit les abeilles d'une lande atlantique
   * toute l'année, et le moteur n'en savait rien parce qu'on n'en récolte rien.
   * Le saule est la ressource de février, l'aubépine celle de mai — mêmes
   * absences, même cause. La floraison a donc son bloc, indépendant.
   *
   * **Absent veut dire « ne fleurit pas au calendrier du moteur »**, ce qui est
   * le cas des anémophiles dont on ne récolte rien : un hêtre, un chêne, un
   * frêne. Une espèce qui porte `fruits` porte forcément ce bloc — c'est la
   * même fleur qui devient le fruit, et `fiches.test.ts` le vérifie.
   */
  floraison?: {
    /** ouverture : cumul de degrés-jours base 5 °C depuis le 1er janvier */
    debutDJ: number;
    /**
     * Largeur de la fenêtre, en degrés-jours. Un verger passe en deux
     * semaines ; un ajonc tient six mois. C'est la grandeur qui sépare une
     * ressource ponctuelle d'une ressource de fond.
     */
    dureeDJ: number;
    /**
     * Ce que la floraison OFFRE aux pollinisateurs ∈ [0,1], à pleine couronne.
     *
     * **Zéro pour une anémophile**, et c'est le contenu du champ : le noisetier
     * et le noyer fleurissent abondamment, leur pollen part au vent, et aucun
     * insecte ne se déplace pour eux. Les compter comme une ressource — ce que
     * `indiceBiodiversite` faisait — donnait des floraisons étalées à une
     * noiseraie qui ne nourrit personne.
     */
    nectar: number;
  };
  /** production fruitière (docs/regles.md §7.2) — absent pour les essences forestières */
  fruits?: {
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
  /**
   * PRODUCTION DE SEMENCES — et ce n'est PAS le bloc `fruits` (issue #197).
   *
   * Un chêne ne donne rien à vendre et il nourrit tout un massif. Le bloc
   * `fruits` au-dessus décrit une récolte : un prix, une fenêtre de cueillette,
   * des semaines de fraîcheur. Celui-ci décrit ce qui TOMBE, ce qui se mange au
   * sol et ce qui lève au printemps. Les deux notions partagent un mot et rien
   * d'autre, et un châtaignier porte les deux blocs sans contradiction — on
   * ramasse une partie de ses châtaignes, le reste nourrit les sangliers.
   *
   * **Absent veut dire « graine légère »** : le bouleau, le frêne ou le saule
   * sèment abondamment, mais personne ne se nourrit d'une samare et une samare
   * ne survit pas à l'hiver au sol. Le champ est donc aussi le trait de TAILLE
   * DE GRAINE que `regeneration.ts` réclamait à la fin de son paragraphe sur le
   * sanglier : la faîne du hêtre, classée `gravite`, est mangée comme un gland,
   * et c'est ce bloc qui le dit — pas son mode de dissémination.
   *
   * Voir `glandee.ts`, qui en tire une production annuelle irrégulière.
   */
  semences?: Semences;
  sources: string[];
}

const ATLAS = "atlas Espèces - référence (nuanciers eau/trophie/lumière)";

/**
 * SOURCES DE CROISSANCE EN HAUTEUR. L'atlas n'en contient AUCUNE : il ne donne
 * que des traits écologiques. Chaque `pousseMaxMAn` a donc été soit posé à la
 * main pendant le développement, soit confronté à une des références
 * ci-dessous. Une fiche qui ne cite aucune de ces constantes porte une vitesse
 * qui reste inventée, et son commentaire le dit.
 */
const JANSEN_1996 =
  "Jansen, Sevenster & Faber 1996, Opbrengsttabellen voor belangrijke boomsoorten in Nederland (Pays-Bas) — hauteur dominante, classe médiane";
const LOCKOW_2009 =
  "Lockow & Lockow 2009, Ertragstafel Hainbuche, Eberswalder Forstliche Schriftenreihe 41 (Brandebourg, Allemagne)";
const LEMAIRE_2005 =
  "Lemaire 2005 (SUF-IDF), faisceau de courbes des taillis de châtaignier, publié par le CRPF Île-de-France–Centre 2013 (France)";
const SANCHEZ_2010 =
  "Sánchez-González, Stiti, Chaar & Cañellas 2010, Dynamic dominant height growth model for cork oak, Forest Systems 19(3) (Espagne, Tunisie)";
const GRUBB_1999 =
  "Grubb, Kollmann & Lee 1999, Plant Biology 1:226-234, essai en jardin de onze ligneux européens (sud de l'Angleterre), via les Biological Flora";
const WILLOUGHBY_2007 =
  "Willoughby et al. 2007, Forestry 80:531-553, plantations des Midlands, via Thomas, El-Barghathi & Polwart 2011 (Angleterre)";
const HARMER_2004 =
  "Harmer 2004, Restoration of Neglected Hazel Coppice, Forestry Commission FCIN56 (Hampshire, Angleterre) — REJETS de cépée";
const PETERKEN_1967 =
  "Peterken & Lloyd 1967, Biological Flora: Ilex aquifolium (Grande-Bretagne), cité par la fiche BSBI Fermanagh";
const ATKINSON_2002 =
  "Atkinson & Atkinson 2002, Biological Flora: Sambucus nigra (Angleterre) — mesure de Gilbert 1991 sur gravats";
const THOMAS_2025 =
  "Thomas et al. 2025, Biological Flora: Cytisus scoparius, J. Ecology 113 (mesures de Waloff & Richards 1977, Londres)";
const HORNOY_2011 =
  "Hornoy, Tarayre, Hervé, Gigord & Atlan 2011, PLOS ONE 6:e26275, jardin commun d'ajoncs près de Rennes (Bretagne)";
const SCHELLENBERG_2021 =
  "Schellenberg & Bergmeier 2021, The Calluna life cycle concept revisited (nord-est de l'Allemagne) ; classes de hauteur JNCC 2009 (Royaume-Uni)";
const STREUOBST_DE =
  "Bannier, Erziehung muss sein (Westphalie) et LfL Bayern 2022, Streuobstwiesen des Alpenvorlands — pré-vergers haute tige, dire d'expert et mesures";
const RHS =
  "Royal Horticultural Society, fiches d'espèces (Royaume-Uni) — base horticole, pas une mesure de terrain";
const ASENSIO_2008 =
  "Asensio, Casaleiro & Montalvo 2008, Aptitudes de madroño para reforestación en Galicia, Cuadernos SECF 28 (Galice, Espagne) — première année de plantation seulement";
const PEPINIERES_DE =
  "catalogues de pépiniéristes et bases horticoles allemands (Garten von Ehren, Baumschule Horstmann, NaturaDB) — ordre de grandeur commercial, pas une mesure";

/**
 * SOURCES D'INFRADENSITÉ (`bois.densite`, #68). Deux, et dans cet ordre : la
 * table française d'abord, la base mondiale pour ce qu'elle ne couvre pas.
 * Aucune des deux ne descend jusqu'aux sous-arbrisseaux de lande et de haie —
 * ceux-là gardent leur valeur d'avant, et leur fiche le dit.
 *
 * Les deux se recoupent là où elles se rencontrent. Des huit espèces que
 * l'IGN couvre ici, sept sont aussi au GWDD, et les valeurs s'accordent à
 * moins de 0,09 t/m³ près — aulne 0,42 / 0,42 ; noisetier 0,52 / 0,52 ;
 * châtaignier 0,47 / 0,46 ; frêne 0,56 / 0,57 ; hêtre 0,55 / 0,585 ;
 * chêne-liège 0,70 / 0,77 ; charme 0,61 / 0,69 (le pire écart). Les chênes
 * de l'IGN qui ne sont pas dans le référentiel concordent aussi (pédonculé
 * 0,54 / 0,575 ; rouvre 0,58 / 0,57). C'est ce recoupement qui les valide
 * l'une par l'autre — aucune des deux n'a été retenue sur sa seule parole.
 */
const IGN_DUPOUEY_2002 =
  "IGN d'après Dupouey 2002 (note non publiée), infradensités des essences françaises de taillis, tMS/m³ — table reproduite en annexe 3 de CNPF 2020, Méthode conversion de taillis en futaie sur souches v2 (label bas-carbone), et utilisée par l'inventaire national des GES";
const GWDD_2009 =
  "Zanne, Lopez-Gonzalez, Coomes, Ilic, Jansen, Lewis, Miller, Swenson, Wiemann & Chave 2009, Global Wood Density Database, Dryad doi:10.5061/dryad.234 (exemplaire consulté : miroir Zenodo 13322441) — « oven dry mass/fresh volume », moyenne des mesures de l'espèce";

export const ESPECES_V0: readonly EspeceV0[] = [
  {
    id: "alnus_glutinosa",
    nom: "Aulne glutineux",
    nomLatin: "Alnus glutinosa",
    hauteurMaxM: 25,
    // Non calé, et VALIDÉ pour autant : 17,6 m simulés à quarante ans contre
    // 18,0 m dans la table néerlandaise (zwarte els, GK 6). C'est une vraie
    // vérification, puisque personne n'a touché ce chiffre pour l'obtenir.
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
    litiere: { cnRatio: 15, calciumMgG: 12 },
    // L'aulne est des premiers, avec le bouleau : début avril.
    phenologie: { debourrementDJ: 90, seuilJourH: 11.0, besoinFroidSemaines: 9 },
    economie: { prixPlantEur: 2 },
    // Infradensité : IGN/Dupouey, « Grands aulnes ».
    bois: { densite: 0.42, prixOeuvreEurM3: 90, rejetteDeSouche: true },
    // brouté sans être recherché
    // phytophthora de l'aulne : réel, et mortel sur les berges
    // double symbiose : Frankia pour l'azote, ectomycorhizes pour le reste
    exigenceMinerale: 1,
    mycorhize: "ecto",
    ravageurs: { sensibilite: 0.55 },
    gibier: { appetence: 0.4 },
    feu: { inflammabilite: 0.25, resistanceEcorce: 0.15, rejetteApresFeu: true },
    sources: [ATLAS, JANSEN_1996, IGN_DUPOUEY_2002],
  },
  {
    id: "fagus_sylvatica",
    nom: "Hêtre",
    nomLatin: "Fagus sylvatica",
    hauteurMaxM: 35,
    // Calé sur la table : 0,45 donnait 11,5 m à quarante ans contre 16,0 dans
    // Jansen 1996 (hêtre, classe médiane). La hauteur suit ce plafond presque
    // linéairement — le hêtre était bridé par son paramètre, pas par sa
    // station : de 750 à 1100 mm de pluie il ne gagnait que 40 cm en quarante
    // ans. Voir `hauteurs.test.ts`.
    //
    // Redérivé de 0,65 à 0,57 quand le frein d'extraction de l'azote est passé
    // d'une rampe linéaire à une saturation de Michaelis-Menten (nitrogen.ts) :
    // le hêtre étant la seule essence calée sur la table, c'est la seule dont
    // le plafond devait suivre.
    pousseMaxMAn: 0.57,
    // Atlas : mésophile, « aime le frais, sensible à la sécheresse ».
    eau: { seuilConfortSecheresse: 0.85, seuilStressSecheresse: 0.25, toleranceEngorgement: 0.1 },
    // pH, littérature : Leuschner et al. 2006 (Ann. For. Sci.), 50 peuplements d'Europe centrale : extrêmes MESURÉS pH(H2O) 3,2-7,3 ; PFAF donne 3,5-8,5.
    ph: [3.5, 8],
    // Atlas : sciaphile climacique — un semis survit à ~1-2 % de lumière (ch3-B),
    // couronne très opaque.
    // Marcescent seulement jeune ou taillé, d'où une valeur nettement plus
    // basse que celle du charme : le moteur n'a qu'un trait par espèce, pas un
    // trait par âge *(à calibrer)*.
    lumiere: {
      compensation: 0.01,
      saturation: 0.35,
      lai: 3.5,
      houppierRatio: 0.35,
      caduc: true,
      marcescence: 0.35,
    },
    racines: { profondeurMaxCm: 110 }, // racines étalées, peu pivotantes — d'où sa sensibilité à la sécheresse
    tBaseCroissanceC: 6,
    azote: { demandeRelative: 0.7, fixateur: false },
    regeneration: { maturiteAns: 40, longeviteAns: 300, dissemination: "gravite", semisParAn: 3 },
    // Litière coriace, lente (C/N ~50) — la voie fongique (ch2-B).
    litiere: { cnRatio: 50, calciumMgG: 7.5 },
    // Le hêtre attend : dix à vingt jours après le chêne dans l'ouest, et il est parmi les plus photopériodiques.
    phenologie: { debourrementDJ: 240, seuilJourH: 13.0, besoinFroidSemaines: 16 },
    economie: { prixPlantEur: 3 },
    // Infradensité : IGN/Dupouey, « Hêtre ». C'est l'essence par laquelle le
    // défaut s'est vu : 0,68 était la densité à 12 % d'humidité (#68).
    bois: { densite: 0.55, prixOeuvreEurM3: 180, rejetteDeSouche: false },
    // peu appété, mais consommé l'hiver faute de mieux
    // peu attaqué tant qu'il n'a pas soif
    exigenceMinerale: 1,
    mycorhize: "ecto",
    ravageurs: { sensibilite: 0.35 },
    gibier: { appetence: 0.35 },
    feu: { inflammabilite: 0.3, resistanceEcorce: 0.15, rejetteApresFeu: false },
    /**
     * La faînée. Les relevés de hêtraies tempérées donnent quelques centaines
     * de kilos de faînes à l'hectare en moyenne pluriannuelle, et plus de mille
     * les années pleines *(à confirmer)*. Le hêtre est l'espèce européenne dont
     * la fructification est la plus IRRÉGULIÈRE — d'où la période longue et le
     * facteur élevé : une année pleine porte ici quinze fois une année creuse.
     */
    semences: { kgParM2HouppierAn: 0.025, periodeAns: 6, facteurAnneePleine: 4.5 },
    sources: [ATLAS, JANSEN_1996, IGN_DUPOUEY_2002],
  },
  {
    id: "quercus_pubescens",
    nom: "Chêne pubescent",
    nomLatin: "Quercus pubescens",
    hauteurMaxM: 20,
    // **INVENTÉ, et il le reste** *(à calibrer)*. Il n'existe aucune table de
    // production du chêne pubescent en climat tempéré océanique : la seule
    // recensée par le CNPF (2025) est roumaine, les autres sont croates,
    // provençales ou valaisannes — d'autres climats. La pratique française
    // l'assimile au chêne sessile en sachant que cela le SURESTIME ; on reste
    // donc sous les 15,4 m à quarante ans de la table néerlandaise de chêne.
    pousseMaxMAn: 0.35,
    // Atlas : xérophile, thermophile ; craint les sols engorgés.
    eau: { seuilConfortSecheresse: 0.35, seuilStressSecheresse: 0.1, toleranceEngorgement: 0.05 },
    ph: [5.5, 8.5],
    // Atlas : héliophile, couronne claire de coteau sec.
    // Marcescent, surtout jeune : le trait est ici une moyenne sur la vie de
    // l'arbre, plus basse que ce qu'on observe sur un taillis *(à calibrer)*.
    lumiere: {
      compensation: 0.15,
      saturation: 0.6,
      lai: 1.5,
      houppierRatio: 0.3,
      caduc: true,
      marcescence: 0.5,
    },
    racines: { profondeurMaxCm: 250 }, // pivot puissant : il va chercher l'eau profonde des coteaux secs
    tBaseCroissanceC: 8,
    azote: { demandeRelative: 0.5, fixateur: false },
    regeneration: { maturiteAns: 30, longeviteAns: 400, dissemination: "geai", semisParAn: 2 },
    litiere: { cnRatio: 40, calciumMgG: 6 },
    // Le chêne débourre fin avril, et il est photopériodique.
    phenologie: { debourrementDJ: 190, seuilJourH: 12.5, besoinFroidSemaines: 9 },
    economie: { prixPlantEur: 3 },
    // Infradensité : IGN/Dupouey, « Chêne pubescent ».
    bois: { densite: 0.65, prixOeuvreEurM3: 220, rejetteDeSouche: true },
    // les chênes sont en tête des listes d'appétence
    // défoliateurs (bombyx, tordeuse) sur les chênes
    exigenceMinerale: 1,
    mycorhize: "ecto",
    ravageurs: { sensibilite: 0.5 },
    gibier: { appetence: 0.75 },
    feu: { inflammabilite: 0.45, resistanceEcorce: 0.5, rejetteApresFeu: true },
    /**
     * La glandée, le cas de référence du lot. Une chênaie produit couramment
     * quelques centaines de kilos de glands à l'hectare en moyenne, et plus
     * d'une tonne les années pleines *(à confirmer sur une série longue)* ; la
     * masting revient tous les deux à sept ans, d'où la période de quatre.
     * Avec ce facteur, une année pleine porte vingt fois une année creuse, ce
     * qui est la fourchette basse du « dix à cinquante fois » observé.
     */
    semences: { kgParM2HouppierAn: 0.04, periodeAns: 4, facteurAnneePleine: 3.5 },
    sources: [ATLAS, IGN_DUPOUEY_2002],
  },
  {
    id: "pinus_sylvestris",
    nom: "Pin sylvestre",
    nomLatin: "Pinus sylvestris",
    hauteurMaxM: 30,
    // Non calé, et validé : 16,4 m simulés à quarante ans contre 15,5 m dans
    // la table néerlandaise (groveden, GK 8).
    pousseMaxMAn: 0.5,
    // Atlas : xérophile, oligotrophe, « rustique, large amplitude ».
    eau: { seuilConfortSecheresse: 0.3, seuilStressSecheresse: 0.1, toleranceEngorgement: 0.2 },
    // pH : LAISSÉ TEL QUEL, et la raison mérite d'être lue. L'USFS Silvics
    // donne « 4,0 à 7,0, optimum 4,5-6,0, chlorose au-delà de 6,5 » ; d'autres
    // fiches donnent « tolère l'alcalin jusqu'à 7,5 ». Les deux sont
    // compatibles — une préférence n'est pas une borne — et la seconde est
    // celle qui était déjà là.
    //
    // Trancher pour 7,0 a été ESSAYÉ et mesuré : le pin tombe alors à 0,05 de
    // vigueur sur sa station de référence (limon riche, pH 7,0) et sa table de
    // production s'effondre. En le déplaçant sur une station qu'il habite
    // vraiment, on découvre autre chose : limon acide profond 19,5 m (+26 %),
    // lande sableuse 6,5 m (-58 %) contre 15,5 m tabulés. AUCUNE STATION DU
    // DÉPÔT NE VAUT UNE CLASSE MÉDIANE POUR UN PIN — la convention « le limon
    // riche vaut la médiane » a été taillée pour des feuillus mésophiles, pas
    // pour un pionnier dont le site médian est un sable. C'est ce manque-là
    // qu'il faut traiter, pas cette borne.
    ph: [4, 7.5],
    // Atlas : très héliophile ; houppier clair, persistant (ombrage toute l'année).
    lumiere: { compensation: 0.25, saturation: 0.7, lai: 1.2, houppierRatio: 0.25, caduc: false },
    racines: { profondeurMaxCm: 200 }, // pivot, d'où sa résistance sur sols filtrants
    // Les pins figurent parmi les sensibles documentés.
    sensibiliteAllelopathie: 0.9,
    tBaseCroissanceC: 5,
    azote: { demandeRelative: 0.25, fixateur: false },
    regeneration: { maturiteAns: 15, longeviteAns: 250, dissemination: "vent", semisParAn: 3 },
    // Aiguilles à C/N ~60 : minéralisation lente et acidifiante (ch2-B).
    litiere: { cnRatio: 60, calciumMgG: 3.8 },
    // Sempervirent : ces valeurs ne servent pas, mais le champ reste renseigné.
    phenologie: { debourrementDJ: 150, seuilJourH: 11.0, besoinFroidSemaines: 10 },
    economie: { prixPlantEur: 1.5 },
    // Infradensité : GWDD, moyenne de cinq mesures (0,370 à 0,422). La table
    // française ne liste que des feuillus de taillis.
    bois: { densite: 0.4, prixOeuvreEurM3: 110, rejetteDeSouche: false },
    // résineux dédaigné (il subit surtout les frottis, v2)
    // scolytes et processionnaire : le cas d'école du résineux pur
    exigenceMinerale: 1,
    mycorhize: "ecto",
    ravageurs: { sensibilite: 0.75 },
    gibier: { appetence: 0.2 },
    feu: { inflammabilite: 0.9, resistanceEcorce: 0.35, rejetteApresFeu: false },
    sources: [ATLAS, JANSEN_1996, GWDD_2009],
  },
  {
    id: "betula_pendula",
    nom: "Bouleau verruqueux",
    nomLatin: "Betula pendula",
    hauteurMaxM: 25,
    // ESTIMÉ SANS TABLE, PUIS CONFIRMÉ PAR UNE TABLE TROUVÉE APRÈS COUP —
    // c'est la seule validation hors échantillon du fichier.
    //
    // 0,9 m/an a été posé comme « estimation honnête pour un bouleau de plaine
    // française », faute de référence transposable : la seule table du corpus
    // était Braastad 1967, norvégienne donc boréale (8,6 m à vingt ans), et la
    // transposer à un bocage à 11,5 °C aurait été une erreur de catégorie.
    // Ce refus tient toujours.
    //
    // La table qui manquait existe (#185) : Lockow 1996, *Ertragstafel für die
    // Sandbirke*, Eberswalde, pour le nord-est allemand — plaine tempérée,
    // même auteur et même région que la table de charme déjà employée, donc
    // même décote de géographie (subcontinentale sèche). Classe médiane des
    // cinq, HO100 = 24 m : 12,2 m à vingt ans, 20,0 m à quarante.
    //
    // Mesuré contre elle sur le banc des hauteurs : 13,3 m à vingt ans (+9 %)
    // et 19,6 m à quarante (−2 %). **Personne n'a touché à ce nombre pour
    // obtenir ce résultat** — il était écrit avant que la table soit trouvée.
    pousseMaxMAn: 0.9,
    // Atlas : pionnier colonisateur, oligotrophe, plutôt frais.
    eau: { seuilConfortSecheresse: 0.6, seuilStressSecheresse: 0.25, toleranceEngorgement: 0.4 },
    // pH : LAISSÉ TEL QUEL, et c'est une correction de ma propre correction.
    // J'avais resserré la borne haute à 7,0 sur « PFAF : préfère sous 6,5 » —
    // mais la même fiche dit aussi qu'il pousse en sols « basiques (légèrement
    // alcalins) ». Poser la mort à 7,0 contredisait la seconde moitié de la
    // source. Une préférence n'est pas une borne.
    ph: [3.8, 7.5],
    // Atlas : très héliophile ; ombre légère (couronne aérée) — le bon parasol de nurse.
    lumiere: { compensation: 0.25, saturation: 0.75, lai: 1.3, houppierRatio: 0.3, caduc: true },
    racines: { profondeurMaxCm: 100 }, // traçant superficiel de pionnier
    // Le bouleau aussi, et il partage avec le pin d'être un pionnier de lumière — la juglone s'ajoute à l'ombre.
    sensibiliteAllelopathie: 0.9,
    tBaseCroissanceC: 5,
    azote: { demandeRelative: 0.35, fixateur: false },
    regeneration: { maturiteAns: 10, longeviteAns: 90, dissemination: "vent", semisParAn: 6 },
    litiere: { cnRatio: 25, calciumMgG: 9 },
    // Le bouleau ouvre le bal, début avril — c'est le pionnier jusque dans son calendrier.
    phenologie: { debourrementDJ: 85, seuilJourH: 10.8, besoinFroidSemaines: 8 },
    economie: { prixPlantEur: 1.5 },
    // Infradensité : GWDD, moyenne de deux mesures (0,500 et 0,525).
    bois: { densite: 0.51, prixOeuvreEurM3: 120, rejetteDeSouche: true },
    // rameaux tendres, brouté en pionnier
    // pionnier peu sujet
    exigenceMinerale: 1,
    mycorhize: "ecto",
    ravageurs: { sensibilite: 0.3 },
    gibier: { appetence: 0.5 },
    feu: { inflammabilite: 0.5, resistanceEcorce: 0.1, rejetteApresFeu: true },
    sources: [ATLAS, GWDD_2009],
  },
  {
    id: "juglans_regia",
    nom: "Noyer commun",
    nomLatin: "Juglans regia",
    hauteurMaxM: 25,
    // NON calé sur table : aucune table de production française de noyer n'a
    // été trouvée. Ordre de grandeur d'un noyer de plein champ conduit pour le
    // bois *(à confirmer)*.
    pousseMaxMAn: 0.5,
    // Atlas : héliophile, mésoxérophile, EUTROPHE — il exige le riche, et c'est
    // ce qui limite l'agroforesterie au noyer aux bonnes terres.
    eau: { seuilConfortSecheresse: 0.6, seuilStressSecheresse: 0.25, toleranceEngorgement: 0.1 },
    // Il fuit l'acide : c'est un arbre de sols neutres à calcaires.
    // pH, littérature : PFAF et World Agroforestry : tolère 5,1-8,3, préfère 6,6-7,5 ; la chaux libre ne le limite pas.
    ph: [5, 8.3],
    lumiere: { compensation: 0.2, saturation: 0.75, lai: 2.6, houppierRatio: 0.5, caduc: true },
    racines: { profondeurMaxCm: 160 }, // pivot profond
    tBaseCroissanceC: 8,
    azote: { demandeRelative: 0.9, fixateur: false },
    // Les noix sont cachées par les corvidés, comme les glands : le même noyau
    // de dispersion, en terrain découvert où l'oiseau les retrouvera.
    regeneration: { maturiteAns: 12, longeviteAns: 150, dissemination: "geai", semisParAn: 0.5 },
    litiere: { cnRatio: 35, calciumMgG: 14 },
    // LE plus tardif de l'atlas, et ce n'est pas un détail : c'est ce qui lui
    // permet d'échapper aux gels d'avril, et ce qui rend l'agroforesterie au
    // noyer possible — la culture intercalaire pousse avant que l'ombre arrive.
    phenologie: { debourrementDJ: 290, seuilJourH: 13.5, besoinFroidSemaines: 14 },
    economie: { prixPlantEur: 15 },
    // Bois précieux : le noyer se vend à la bille, plusieurs fois le chêne.
    // Infradensité : GWDD, moyenne de trois mesures (0,533 à 0,591).
    bois: { densite: 0.56, prixOeuvreEurM3: 600, rejetteDeSouche: false },
    // Anémophile : le noyer lâche son pollen au vent, comme le noisetier. Il
    // fleurit après avoir feuillé, donc tard *(atlas)*.
    floraison: { debutDJ: 320, dureeDJ: 100, nectar: 0 },
    fruits: {
      gelFatalC: -1,
      recolteWeek: 40,
      fenetreRecolteWeeks: 3,
      croissanceSem: 16,
      rendementMaxKg: 40,
      prixEurKg: 3.5,
      recolteHKg: 0.03,
      autofertile: false,
    },
    /**
     * ALLÉLOPATHIE. Le noyer libère de la juglone par ses racines et sa
     * litière, et elle inhibe la germination et la croissance de nombreuses
     * espèces dans un rayon de QUINZE À VINGT MÈTRES autour de l'arbre. C'est
     * la contrainte classique de l'agroforesterie au noyer, et la première
     * chose qu'on apprend en plantant un verger à côté.
     */
    allelopathie: { porteeM: 17.5 },
    exigenceMinerale: 2.5,
    mycorhize: "arbusculaire",
    ravageurs: { sensibilite: 0.4 },
    gibier: { appetence: 0.4 },
    feu: { inflammabilite: 0.35, resistanceEcorce: 0.2, rejetteApresFeu: false },
    /**
     * Le noyer ALTERNE — une année chargée, une année creuse — et c'est un fait
     * de verger avant d'être un fait de forêt *(à confirmer)*.
     */
    semences: { kgParM2HouppierAn: 0.06, periodeAns: 2, facteurAnneePleine: 1.4 },
    sources: [ATLAS, GWDD_2009],
  },
  {
    id: "malus_domestica",
    nom: "Pommier",
    nomLatin: "Malus domestica",
    hauteurMaxM: 8,
    // Ordre de grandeur COHÉRENT avec le pré-verger allemand, pas calé dessus
    // *(à confirmer)* : un plein vent sur franc plafonne à 6-8 m (chambre
    // d'agriculture de Rhénanie-du-Nord-Westphalie), et 60 arbres de 10 à 70
    // ans d'un pré-verger bavarois mesurent 7,5 m en moyenne — le moteur en
    // fait 7,6 à quarante ans, donc un peu vite mais dans la fourchette
    // mesurée (3,8 à 12,6 m). La pousse annuelle des rameaux d'un jeune arbre
    // formé (60 cm à 1 m) n'est PAS un gain de hauteur : on ne s'en sert pas.
    pousseMaxMAn: 0.5,
    // Atlas : « fruitier clé » ; mésophile de plaine.
    eau: { seuilConfortSecheresse: 0.7, seuilStressSecheresse: 0.3, toleranceEngorgement: 0.15 },
    // pH, littérature : ICL et PFAF : optimum 6-7, tolère dès 5,0, carences en fer au-delà de 8 (source horticole).
    ph: [5, 7.5],
    lumiere: { compensation: 0.2, saturation: 0.7, lai: 2, houppierRatio: 0.45, caduc: true },
    racines: { profondeurMaxCm: 120 }, // fruitier greffé, enracinement moyen
    // Le pommier est en tête de toutes les listes de sensibles à la juglone : ne pas planter de verger sous un noyer est le conseil le plus répété.
    sensibiliteAllelopathie: 1,
    tBaseCroissanceC: 6,
    azote: { demandeRelative: 0.6, fixateur: false },
    // Cultivar greffé : pas de régénération naturelle fidèle.
    regeneration: { maturiteAns: 6, longeviteAns: 80, dissemination: "gravite", semisParAn: 0 },
    litiere: { cnRatio: 30, calciumMgG: 13 },
    // Fruitier de plaine : feuillaison après la floraison, mi-avril.
    phenologie: { debourrementDJ: 150, seuilJourH: 11.5, besoinFroidSemaines: 13 },
    economie: { prixPlantEur: 12 },
    // Infradensité NON SOURCÉE : le pommier cultivé est absent des deux sources,
    // et le pommier sauvage (Malus sylvestris, 0,60 au GWDD) est une AUTRE espèce.
    // Valeur laissée en l'état plutôt qu'empruntée (#68).
    bois: { densite: 0.6, prixOeuvreEurM3: 150, rejetteDeSouche: false },
    // Fin avril, après la plupart des gels. Le pommier est l'entomophile de
    // manuel : il ne noue presque rien sans insectes, et son nectar est
    // abondant *(atlas)*.
    floraison: { debutDJ: 200, dureeDJ: 100, nectar: 0.9 },
    fruits: {
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
    sources: [ATLAS, STREUOBST_DE],
  },
  {
    id: "prunus_armeniaca",
    nom: "Abricotier",
    nomLatin: "Prunus armeniaca",
    hauteurMaxM: 6,
    // Aucune pousse annuelle mesurée en climat océanique — l'abricotier de
    // plein champ est méridional, et les données françaises viennent du Gard
    // ou de la Drôme *(à confirmer)*. Le seul couple hauteur/âge en climat
    // conforme est horticole : 4 à 8 m atteints en 10 à 20 ans (RHS), ce que
    // le moteur fait (3,6 m à dix ans, 5,0 m à vingt).
    pousseMaxMAn: 0.5,
    // Atlas : « gel des fleurs = risque ; sec » — xérophile, floraison très précoce.
    eau: { seuilConfortSecheresse: 0.4, seuilStressSecheresse: 0.15, toleranceEngorgement: 0.05 },
    // pH, littérature : PFAF et Garden Oracle : 6,0-7,8, optimum 6,7-7,5 (source horticole).
    ph: [6, 7.8],
    lumiere: { compensation: 0.25, saturation: 0.75, lai: 1.8, houppierRatio: 0.45, caduc: true },
    racines: { profondeurMaxCm: 180 }, // pivot des sols secs et chauds
    tBaseCroissanceC: 8,
    azote: { demandeRelative: 0.5, fixateur: false },
    regeneration: { maturiteAns: 4, longeviteAns: 60, dissemination: "gravite", semisParAn: 0 },
    litiere: { cnRatio: 30, calciumMgG: 13 },
    // L'abricotier part très tôt, et c'est bien là son problème : le gel le rattrape.
    phenologie: { debourrementDJ: 110, seuilJourH: 11.2, besoinFroidSemaines: 10 },
    economie: { prixPlantEur: 14 },
    // Infradensité : GWDD, mesure UNIQUE (0,675, Asie du Sud-Est) — sourcée, mais
    // sur un seul échantillon, et hors d'Europe.
    bois: { densite: 0.68, prixOeuvreEurM3: 150, rejetteDeSouche: false },
    // Fin février-mars : LE pari du gel tardif (atlas). Très mellifère, et
    // d'autant plus précieux que rien d'autre n'est ouvert à cette date.
    floraison: { debutDJ: 60, dureeDJ: 80, nectar: 0.9 },
    fruits: {
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
    sources: [ATLAS, RHS, GWDD_2009],
  },
  {
    id: "corylus_avellana",
    nom: "Noisetier",
    nomLatin: "Corylus avellana",
    hauteurMaxM: 8,
    // Calé sur RIEN, mais confronté : le moteur fait 2,5 m à quatre ans et
    // 3,0 m à cinq, ce qui est exactement la REPOUSSE DE CÉPÉE mesurée en
    // taillis anglais (1,5-1,75 m la première année puis ~50 cm/an, Harmer
    // 2004 ; 2,4-2,8 m à la 4ᵉ année, Buckley 1992). Or une souche établie
    // part plus vite qu'un semis, et le moteur ne sait pas faire la
    // différence — sa forme de croissance dépend de la TAILLE, pas de l'âge
    // (trees.ts). Le noisetier du jeu est donc un noisetier de taillis, ce
    // qui est son emploi réel en haie *(à confirmer)*.
    pousseMaxMAn: 0.6,
    // Atlas : demi-ombre, cépée — l'arbuste des sous-étages agroforestiers.
    eau: { seuilConfortSecheresse: 0.6, seuilStressSecheresse: 0.25, toleranceEngorgement: 0.3 },
    // pH, littérature : Hicks 2022, Biological Flora : calcaires pH 7-8, dépôts sur craie 4-5, ET sols très acides sous 4.
    ph: [4, 8],
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
    litiere: { cnRatio: 25, calciumMgG: 13 },
    // Le noisetier est précoce — il fleurit même en plein hiver.
    phenologie: { debourrementDJ: 95, seuilJourH: 11.0, besoinFroidSemaines: 8 },
    economie: { prixPlantEur: 8 },
    // Infradensité : IGN/Dupouey, « Noisetier ».
    bois: { densite: 0.52, prixOeuvreEurM3: 70, rejetteDeSouche: true },
    // Chatons d'hiver (janv.-fév.), pollinisation par LE VENT : abondants et
    // sans nectar. Les abeilles y prélèvent du pollen les jours doux, mais on
    // ne compte pas une noiseraie comme une ressource florale.
    floraison: { debutDJ: 15, dureeDJ: 150, nectar: 0 },
    fruits: {
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
    /**
     * La noisette : petite couronne, mais dense et fructifiant tôt. Le chiffre
     * est pris bien sous les rendements d'une noiseraie conduite, qui ne dit
     * rien d'un noisetier de haie *(à calibrer)*.
     */
    semences: { kgParM2HouppierAn: 0.08, periodeAns: 2, facteurAnneePleine: 1.5 },
    sources: [ATLAS, HARMER_2004, IGN_DUPOUEY_2002],
  },
  {
    id: "prunus_spinosa",
    nom: "Prunellier",
    nomLatin: "Prunus spinosa",
    hauteurMaxM: 4,
    // **INVENTÉ, et il le reste** *(à calibrer)*. Aucune mesure de croissance
    // du prunellier n'a été trouvée en climat océanique : pas de Biological
    // Flora, rien dans la littérature de haies. La seule contrainte publiée
    // est ORDINALE — Grubb range le prunellier dans le groupe « à croissance
    // rapide », devant l'aubépine, ce que le moteur respecte (37 cm/an contre
    // 29 sur les trois premières années).
    pousseMaxMAn: 0.4,
    // Atlas : arbuste pionnier, « drageonne, nurse », haies — Europe entière.
    eau: { seuilConfortSecheresse: 0.5, seuilStressSecheresse: 0.18, toleranceEngorgement: 0.15 },
    ph: [5.5, 8.5],
    lumiere: { compensation: 0.12, saturation: 0.7, lai: 2.2, houppierRatio: 0.6, caduc: true },
    racines: { profondeurMaxCm: 100 },
    tBaseCroissanceC: 5,
    azote: { demandeRelative: 0.5, fixateur: false },
    // Drupes emportées par les oiseaux, mais la vraie conquête se fait par
    // DRAGEONS : le fourré avance en tache, d'un mètre par an environ, et c'est
    // ce qui en fait un problème de gestion dans une haie. On modélisait ce
    // mécanisme en gonflant le taux de semis ; il est maintenant modélisé pour
    // ce qu'il est, et le semis revient à une valeur d'oiseaux ordinaire.
    regeneration: {
      maturiteAns: 5,
      longeviteAns: 50,
      dissemination: "oiseaux",
      semisParAn: 0.4,
      drageonne: { porteeM: 2.5, parAn: 0.8 },
    },
    litiere: { cnRatio: 28, calciumMgG: 11 },
    // L'épine noire fleurit avant de feuiller, dès mars.
    phenologie: { debourrementDJ: 115, seuilJourH: 11.3, besoinFroidSemaines: 10 },
    economie: { prixPlantEur: 4 },
    // Infradensité NON SOURCÉE : absente des deux sources. Valeur d'avant #68,
    // donc vraisemblablement une densité à 12 % d'humidité, donc surestimée.
    bois: { densite: 0.75, prixOeuvreEurM3: 0, rejetteDeSouche: true },
    // Il fleurit AVANT les feuilles, dès mars : exposé au gel, et c'est la
    // première nappe blanche des haies — une ressource majeure de sortie
    // d'hiver.
    floraison: { debutDJ: 60, dureeDJ: 100, nectar: 0.8 },
    fruits: {
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
    sources: [ATLAS, GRUBB_1999],
  },
  {
    id: "crataegus_monogyna",
    nom: "Aubépine",
    nomLatin: "Crataegus monogyna",
    // Mai, après les feuilles : l'aubépine est LA nappe blanche de mai, et le
    // calendrier en avait un trou — entre le pommier (fin avril) et la ronce
    // (juin), le moteur ne connaissait que le noyer, qui est anémophile.
    floraison: { debutDJ: 450, dureeDJ: 150, nectar: 0.9 },
    hauteurMaxM: 8,
    // ENCADRÉ par deux mesures anglaises, non calé sur l'une d'elles : 37
    // cm/an sur douze ans en jardin (Grubb 1999, via la Biological Flora du
    // genre) et ~28 cm/an sur cinq ans en plantation forestière (Willoughby
    // 2007). Le moteur donne 29 cm/an sur douze ans : dans la bande, à son
    // bord bas. On n'a pas déplacé la valeur pour aller chercher le milieu —
    // ce serait caler sur une moyenne de deux protocoles différents.
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
    litiere: { cnRatio: 26, calciumMgG: 13 },
    // L'aubépine suit l'épine noire de quelques semaines.
    phenologie: { debourrementDJ: 135, seuilJourH: 11.5, besoinFroidSemaines: 12 },
    economie: { prixPlantEur: 4 },
    // Infradensité NON SOURCÉE : le GWDD ne porte que « Crataegus oxyacantha »,
    // nom historiquement ambigu entre C. laevigata et C. monogyna — on ne s'en
    // sert pas. Valeur d'avant #68, donc vraisemblablement surestimée.
    bois: { densite: 0.8, prixOeuvreEurM3: 0, rejetteDeSouche: true },
    // Épines longues : c'est l'abri sous lequel un chêne passe ses dix
    // premières années sans se faire brouter.
    exigenceMinerale: 1.8,
    mycorhize: "arbusculaire",
    ravageurs: { sensibilite: 0.5 },
    gibier: { appetence: 0.25 },
    feu: { inflammabilite: 0.4, resistanceEcorce: 0.2, rejetteApresFeu: true },
    sources: [ATLAS, GRUBB_1999, WILLOUGHBY_2007],
  },
  {
    id: "rubus_fruticosus",
    nom: "Ronce",
    nomLatin: "Rubus fruticosus",
    hauteurMaxM: 2.5,
    // La plus rapide de l'atlas : elle prend une friche en trois ans. Aucune
    // mesure scientifique de hauteur de roncier n'a été trouvée ; les bases
    // horticoles allemandes donnent 50 à 250 cm/an pour une hauteur finale de
    // 1 à 3 m *(à confirmer)*. Le piège, signalé par la littérature : un
    // turion s'allonge de 3 à 6 m par saison mais s'arque et se marcotte —
    // l'allongement N'EST PAS un gain de hauteur, et la roncière plafonne
    // bas. Le moteur plafonne à 2,5 m atteints en trois ans : c'est la bonne
    // lecture.
    pousseMaxMAn: 1.4,
    // Atlas : « nurse (fruticée) », pionnière, cosmopolite tempéré.
    eau: { seuilConfortSecheresse: 0.6, seuilStressSecheresse: 0.25, toleranceEngorgement: 0.25 },
    // pH, littérature : BSBI (Fermanagh) : LA PLUS FRÉQUENTE à pH 3,5-5,0, et tolère jusqu'au très alcalin.
    ph: [3.5, 8],
    // Demi-ombre tolérée : elle tient sous un couvert clair, ce qui lui permet
    // d'attendre la trouée.
    lumiere: { compensation: 0.06, saturation: 0.5, lai: 3, houppierRatio: 0.8, caduc: true },
    racines: { profondeurMaxCm: 60 },
    tBaseCroissanceC: 5,
    azote: { demandeRelative: 0.7, fixateur: false },
    // Les mûres sont mangées par tout ce qui vole : c'est LE colonisateur.
    regeneration: {
      maturiteAns: 2,
      longeviteAns: 15,
      dissemination: "oiseaux",
      semisParAn: 2,
      // La ronce sème par les oiseaux et garde une réserve au sol : c'est ce qui la fait surgir dans une trouée où personne ne l'avait vue.
      banqueGraines: {
        persistanceAns: 15,
        leveeParLeFeu: 0.2,
        leveeSpontanee: 0.1,
      },
    },
    litiere: { cnRatio: 24, calciumMgG: 10 },
    // La ronce ne perd qu'une partie de son feuillage : elle repart tôt.
    phenologie: { debourrementDJ: 120, seuilJourH: 11.3, besoinFroidSemaines: 8 },
    economie: { prixPlantEur: 2 },
    // Infradensité NON SOURCÉE : absente des deux sources, comme tous les
    // sous-arbrisseaux. Valeur d'avant #68.
    bois: { densite: 0.5, prixOeuvreEurM3: 0, rejetteDeSouche: true },
    // Juin, hors d'atteinte des gels, et elle s'étale : la ronce fleurit et
    // refleurit sur des semaines. C'est le pilier de la ressource d'été.
    floraison: { debutDJ: 900, dureeDJ: 500, nectar: 0.9 },
    fruits: {
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
    sources: [ATLAS, PEPINIERES_DE],
  },
  {
    id: "sambucus_nigra",
    nom: "Sureau noir",
    nomLatin: "Sambucus nigra",
    hauteurMaxM: 7,
    // La seule mesure publiée est un PLANCHER : 37 cm/an sur gravats de
    // brique en friche urbaine (Gilbert 1991, via la Biological Flora). Le
    // moteur en fait 58 à 64 sur un limon riche, soit 1,6 fois plus sur un
    // sol qui n'a rien à voir — plausible pour un nitrophile réputé vif, mais
    // ce n'est pas une validation *(à confirmer : il manque une mesure sur
    // sol fertile)*.
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
    litiere: { cnRatio: 20, calciumMgG: 15 },
    // Le sureau est l'un des tout premiers à verdir dans les haies.
    phenologie: { debourrementDJ: 105, seuilJourH: 11.2, besoinFroidSemaines: 8 }, // litière tendre, azotée : elle se minéralise vite
    economie: { prixPlantEur: 5 },
    // Infradensité NON SOURCÉE : le GWDD n'a que des sureaux d'Amérique (0,43 à
    // 0,46) ; on ne prête pas leur valeur au nôtre. Valeur d'avant #68.
    bois: { densite: 0.5, prixOeuvreEurM3: 0, rejetteDeSouche: true },
    // Juin. Ombelles très visitées, surtout par les diptères — nectar plus
    // discret que celui d'une rosacée *(à calibrer)*.
    floraison: { debutDJ: 700, dureeDJ: 150, nectar: 0.5 },
    fruits: {
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
    sources: [ATLAS, ATKINSON_2002],
  },
  {
    id: "carpinus_betulus",
    nom: "Charme",
    nomLatin: "Carpinus betulus",
    hauteurMaxM: 25,
    // 0,40 → 0,53, CALÉ sur la première table de production du charme jamais
    // publiée (Lockow & Lockow 2009) : 16,3 m de hauteur dominante à quarante
    // ans en bonité médiane (HO100 = 25 m, gamme 18→31 m). Avant elle, le
    // charme se taxait par analogie avec le hêtre — c'est dire le vide.
    //
    // La géographie est à décoter, et on le dit : la table vient du
    // Brandebourg, plaine subcontinentale plus sèche que le bocage. Le
    // recoupement dans la bonne zone est l'équivalence que le CNPF (2025)
    // recommande pour le charme français, les tables NÉERLANDAISES de chêne :
    // 15,4 m à quarante ans, 6 % sous la table allemande. Le moteur était à
    // 13,4 m, sous les deux — c'est ça qui justifie de le monter, pas le
    // choix d'une source contre l'autre. Voir `hauteurs.test.ts`.
    pousseMaxMAn: 0.53,
    // Atlas : sciaphile climacique, « haies ». Il comblait un vrai trou — le
    // hêtre était la seule essence d'ombre du moteur, et une forêt n'a jamais
    // un seul candidat au sous-étage.
    eau: { seuilConfortSecheresse: 0.7, seuilStressSecheresse: 0.3, toleranceEngorgement: 0.35 },
    ph: [4.5, 8],
    // MARCESCENT type : c'est lui qu'on voit roux en janvier dans les haies, et
    // c'est ce qui fait du charme un brise-vent d'hiver quand le hêtre voisin
    // est nu *(à calibrer)*.
    lumiere: {
      compensation: 0.03,
      saturation: 0.4,
      lai: 3.5,
      houppierRatio: 0.35,
      caduc: true,
      marcescence: 0.7,
    },
    racines: { profondeurMaxCm: 110 },
    tBaseCroissanceC: 5,
    azote: { demandeRelative: 0.6, fixateur: false },
    regeneration: { maturiteAns: 20, longeviteAns: 150, dissemination: "vent", semisParAn: 2 },
    litiere: { cnRatio: 28, calciumMgG: 11 },
    // Le charme débourre tôt, avant le hêtre et le chêne.
    phenologie: { debourrementDJ: 130, seuilJourH: 11.5, besoinFroidSemaines: 12 },
    economie: { prixPlantEur: 3 },
    // Bois très dur : c'est LE bois de chauffage, et le taillis de charme
    // repart indéfiniment — d'où sa place dans toutes les haies plessées.
    // Infradensité : IGN/Dupouey, « Charme ». Il reste parmi les plus denses des
    // feuillus français, mais 0,80 était sa densité du commerce.
    bois: { densite: 0.61, prixOeuvreEurM3: 90, rejetteDeSouche: true },
    exigenceMinerale: 2,
    mycorhize: "ecto",
    ravageurs: { sensibilite: 0.3 },
    gibier: { appetence: 0.55 },
    feu: { inflammabilite: 0.3, resistanceEcorce: 0.15, rejetteApresFeu: true },
    sources: [ATLAS, LOCKOW_2009, IGN_DUPOUEY_2002],
  },
  {
    id: "ilex_aquifolium",
    nom: "Houx",
    nomLatin: "Ilex aquifolium",
    // Mai-juin, discret mais bien visité ; le houx est dioïque et dépend
    // entièrement des insectes pour nouer *(atlas)*.
    floraison: { debutDJ: 520, dureeDJ: 150, nectar: 0.6 },
    hauteurMaxM: 8,
    // L'un des plus lents de l'atlas, et la lenteur est confirmée : un houx
    // « bien éclairé » fait 1,5 à 3,0 m entre huit et quinze ans (Peterken &
    // Lloyd 1967, relayé par la fiche BSBI), le moteur 2,0 m à dix ans — dans
    // la bande, sans avoir été calé dessus. Ce que le moteur ne rend pas :
    // la source décrit une courbe en trois temps (1 cm/an les cinq premières
    // années, puis une poussée à plus de 50 cm/an, puis 2 cm/an après trente
    // ans) là où la sigmoïde du moteur est plus douce *(à confirmer)*.
    pousseMaxMAn: 0.15,
    // Atlas : « persistant », sciaphile climacique. C'est le seul couvert
    // PERMANENT de sous-bois : en janvier, sous une hêtraie nue, c'est lui qui
    // abrite et nourrit.
    eau: { seuilConfortSecheresse: 0.75, seuilStressSecheresse: 0.3, toleranceEngorgement: 0.2 },
    // pH, littérature : Peterken & Lloyd 1967, Biological Flora : « presque indifférent au pH », de l'acide au riche en calcaire.
    ph: [4, 8],
    lumiere: { compensation: 0.02, saturation: 0.35, lai: 3, houppierRatio: 0.4, caduc: false },
    racines: { profondeurMaxCm: 80 },
    tBaseCroissanceC: 5,
    azote: { demandeRelative: 0.4, fixateur: false },
    regeneration: { maturiteAns: 15, longeviteAns: 200, dissemination: "oiseaux", semisParAn: 1.5 },
    litiere: { cnRatio: 35, calciumMgG: 7 }, // feuille coriace et cireuse : elle met des années
    phenologie: { debourrementDJ: 200, seuilJourH: 11.5, besoinFroidSemaines: 8 },
    economie: { prixPlantEur: 7 },
    // Infradensité : GWDD, mesure unique (0,65).
    bois: { densite: 0.65, prixOeuvreEurM3: 0, rejetteDeSouche: true },
    exigenceMinerale: 1.2,
    mycorhize: "arbusculaire",
    ravageurs: { sensibilite: 0.2 },
    // Piquant, mais le chevreuil s'y met quand même en hiver, faute de mieux.
    gibier: { appetence: 0.3 },
    feu: { inflammabilite: 0.35, resistanceEcorce: 0.15, rejetteApresFeu: true },
    sources: [ATLAS, PETERKEN_1967, GWDD_2009],
  },
  {
    id: "salix_alba",
    nom: "Saule blanc",
    nomLatin: "Salix alba",
    // Février-mars, sur bois nu. Le saule est la ressource de SORTIE D'HIVER
    // par excellence : c'est de son pollen que les colonies repartent, et
    // aucune autre essence de cette taille n'ouvre aussi tôt. Il n'a pas de
    // bloc `fruits` — on ne récolte rien d'un saule blanc — et c'est
    // exactement pour cette raison qu'il était absent du calendrier.
    floraison: { debutDJ: 30, dureeDJ: 150, nectar: 0.8 },
    hauteurMaxM: 20,
    // **INVENTÉ, et il le reste** *(à calibrer)*. Il n'existe aucune table de
    // production du saule blanc de plein vent : ce qui existe est de
    // l'osiériculture, du têtard ou du clone à courte rotation. Jansen 1996
    // prescrit de le taxer comme un PEUPLIER cv. Robusta, dont la table donne
    // 24,7 m à vingt ans — manifestement trop rapide pour un saule, et une
    // hauteur moyenne, pas dominante. Le moteur en fait 13,0 : plus lent que
    // le peuplier, ce qui est la seule chose qu'on puisse défendre ici.
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
    litiere: { cnRatio: 22, calciumMgG: 12 },
    // Il débourre parmi les tout premiers, avec le bouleau.
    phenologie: { debourrementDJ: 80, seuilJourH: 10.8, besoinFroidSemaines: 7 },
    economie: { prixPlantEur: 3 }, // une bouture suffit
    // Infradensité : GWDD, mesure UNIQUE (0,284, Europe) — la plus basse du
    // référentiel, et basse même pour un saule (les autres Salix du GWDD vont de
    // 0,32 à 0,53). Sourcée, mais sur un seul échantillon.
    bois: { densite: 0.28, prixOeuvreEurM3: 60, rejetteDeSouche: true },
    exigenceMinerale: 2,
    // L'atlas le donne à double mycorhization ; le moteur ne connaît qu'un
    // réseau par espèce, on retient l'ectomycorhize.
    mycorhize: "ecto",
    ravageurs: { sensibilite: 0.5 },
    gibier: { appetence: 0.6 },
    feu: { inflammabilite: 0.3, resistanceEcorce: 0.1, rejetteApresFeu: true },
    sources: [ATLAS, GWDD_2009],
  },
  {
    id: "cornus_mas",
    nom: "Cornouiller mâle",
    nomLatin: "Cornus mas",
    hauteurMaxM: 6,
    // Aucune mesure scientifique trouvée. Les seules valeurs en climat
    // océanique sont des catalogues de pépiniéristes allemands : 10-30 cm/an
    // *(à confirmer — c'est du commerce, pas de la mesure)*. Le moteur en
    // fait 24 à 26, dans le haut de cette fourchette, et respecte le seul
    // fait sur lequel toutes les sources s'accordent : le cornouiller mâle
    // est trois à cinq fois plus lent que le noisetier.
    pousseMaxMAn: 0.25,
    // Atlas : « calcicole, floraison précoce ». Il fleurit en février, avant
    // tout le monde — c'est la première ressource de l'année pour les
    // pollinisateurs, et cela compte dans l'indice de biodiversité.
    eau: { seuilConfortSecheresse: 0.45, seuilStressSecheresse: 0.15, toleranceEngorgement: 0.1 },
    // pH, littérature : PFAF : 5,0-8,0, préfère 5,5-7,5, pousse en très alcalin.
    ph: [5, 8.5],
    lumiere: { compensation: 0.06, saturation: 0.5, lai: 2.5, houppierRatio: 0.5, caduc: true },
    racines: { profondeurMaxCm: 100 },
    tBaseCroissanceC: 5,
    azote: { demandeRelative: 0.5, fixateur: false },
    regeneration: { maturiteAns: 6, longeviteAns: 100, dissemination: "oiseaux", semisParAn: 1 },
    litiere: { cnRatio: 25, calciumMgG: 14 },
    phenologie: { debourrementDJ: 110, seuilJourH: 11.3, besoinFroidSemaines: 11 },
    economie: { prixPlantEur: 6 },
    // Infradensité NON SOURCÉE : le cornouiller mâle est absent des deux sources
    // (le GWDD n'a que le sanguin, 0,68). Valeur d'avant #68, et c'est désormais
    // la plus haute du référentiel, donc la plus suspecte.
    bois: { densite: 0.9, prixOeuvreEurM3: 0, rejetteDeSouche: true }, // le bois le plus dur d'Europe
    // Février, sur bois nu : c'est sa signature, et c'est ce qui en fait une
    // des toutes premières ressources de l'année.
    floraison: { debutDJ: 25, dureeDJ: 120, nectar: 0.7 },
    fruits: {
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
    sources: [ATLAS, PEPINIERES_DE],
  },
  {
    id: "euonymus_europaeus",
    nom: "Fusain d'Europe",
    nomLatin: "Euonymus europaeus",
    // Mai-juin. Fleurs verdâtres et minuscules, mais nectarifères et très
    // fréquentées par les diptères et les petits hyménoptères *(à calibrer)*.
    floraison: { debutDJ: 480, dureeDJ: 150, nectar: 0.4 },
    hauteurMaxM: 6,
    // Confronté, non calé : +135,9 cm en cinq ans sur limon de marne
    // calcaire dans les Midlands (Willoughby 2007, via la Biological Flora),
    // soit 27 cm/an, contre 29 pour le moteur. La même source donne 7 cm/an
    // sur un substrat dégradé — un rapport de quatre entre stations, que le
    // moteur doit rendre par ses facteurs, pas par sa fiche.
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
    litiere: { cnRatio: 26, calciumMgG: 14 },
    phenologie: { debourrementDJ: 125, seuilJourH: 11.4, besoinFroidSemaines: 10 },
    economie: { prixPlantEur: 5 },
    // Infradensité : GWDD, mesure unique (0,603, Europe).
    bois: { densite: 0.6, prixOeuvreEurM3: 0, rejetteDeSouche: true },
    exigenceMinerale: 1.7,
    mycorhize: "arbusculaire",
    // Hôte d'HIVER du puceron noir : il l'héberge à la mauvaise saison et le
    // relâche au printemps sur ses voisines. C'est ce qui en fait un arbuste à
    // placer en connaissance de cause dans une haie.
    ravageurs: { sensibilite: 0.45, hoteHivernal: true },
    gibier: { appetence: 0.4 },
    feu: { inflammabilite: 0.35, resistanceEcorce: 0.15, rejetteApresFeu: true },
    sources: [ATLAS, WILLOUGHBY_2007, GWDD_2009],
  },
  {
    id: "ligustrum_vulgare",
    nom: "Troène commun",
    nomLatin: "Ligustrum vulgare",
    hauteurMaxM: 5,
    // Presque rien : pas de Biological Flora pour le troène, et le seul point
    // publié est 104 cm de haut à deux ans en jardin (Grubb 1999) — mesure
    // qui inclut la croissance en pépinière avant repiquage, donc inutilisable
    // comme taux *(à calibrer)*. Ce qu'on en garde est ordinal : le troène est
    // dans le groupe « à croissance rapide » de cet essai, devant le fusain,
    // ce que le moteur respecte.
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
    litiere: { cnRatio: 27, calciumMgG: 12 },
    phenologie: { debourrementDJ: 120, seuilJourH: 11.4, besoinFroidSemaines: 9 },
    economie: { prixPlantEur: 4 },
    // Infradensité : GWDD, mesure unique (0,805, Europe). Elle MONTE — preuve
    // qu'un facteur global appliqué aux anciennes valeurs aurait eu tort ici.
    bois: { densite: 0.81, prixOeuvreEurM3: 0, rejetteDeSouche: true },
    // Juin-juillet, très odorant et très visité.
    floraison: { debutDJ: 800, dureeDJ: 200, nectar: 0.8 },
    fruits: {
      // Très mellifère en juin : ses fleurs comptent dans l'étalement des
      // floraisons, même si ses baies sont toxiques et ne se récoltent pas.
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
    sources: [ATLAS, GRUBB_1999, GWDD_2009],
  },
  {
    id: "ulex_europaeus",
    nom: "Ajonc d'Europe",
    nomLatin: "Ulex europaeus",
    // **Il fleurit presque toute l'année**, avec un pic de mars à juin et des
    // fleurs éparses dès décembre. C'est la ressource de FOND d'une lande
    // atlantique, celle qui tient la soudure quand rien d'autre n'est ouvert.
    // Une fenêtre large plutôt qu'un pic : c'est la grandeur `dureeDJ` qui
    // porte la différence *(à calibrer — les sources donnent une saison, pas
    // un cumul)*.
    floraison: { debutDJ: 20, dureeDJ: 1100, nectar: 0.7 },
    hauteurMaxM: 2.5,
    // Confronté à la meilleure géographie possible, sans être calé dessus :
    // des ajoncs bretons et écossais semés en jardin commun près de Rennes
    // font 110 à 130 cm à deux ans (Hornoy 2011 — valeur lue sur la figure,
    // le texte ne donne que des écarts relatifs). Le moteur en fait 118. Les
    // catalogues britanniques (15-30 cm/an) et les rejets après brûlage
    // dirigé en Galice (57 cm à trois ans) sont bien plus lents : ce sont
    // d'autres régimes, taille commerciale et lande brûlée.
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
    regeneration: {
      maturiteAns: 3,
      longeviteAns: 25,
      dissemination: "gravite",
      semisParAn: 5,
      // L'ajonc est LE cas d'école. Sa banque atteint 500 à 2 000 graines/m² sous une lande installée, et jusqu'à des dizaines de milliers ; les graines tiennent 25 à 30 ans dans les six premiers centimètres du sol, et le feu les scarifie sans les détruire — le sol isole assez pour ça. C'est la raison pour laquelle une lande brûlée revient en lande.
      banqueGraines: {
        persistanceAns: 28,
        leveeParLeFeu: 0.45,
        leveeSpontanee: 0.03,
      },
    },
    litiere: { cnRatio: 25, calciumMgG: 4.5 },
    // Sempervirent : valeurs sans effet.
    phenologie: { debourrementDJ: 100, seuilJourH: 11.0, besoinFroidSemaines: 6 },
    economie: { prixPlantEur: 3 },
    // Infradensité NON SOURCÉE : aucun Ulex au GWDD, et la table française ne
    // descend pas jusqu'à la lande. Valeur d'avant #68.
    bois: { densite: 0.6, prixOeuvreEurM3: 40, rejetteDeSouche: true },
    // épines dissuasives, mais brouté en hiver sur la lande
    // rien ne s'y attaque vraiment
    exigenceMinerale: 1,
    mycorhize: "arbusculaire",
    ravageurs: { sensibilite: 0.15 },
    gibier: { appetence: 0.25 },
    feu: { inflammabilite: 0.98, resistanceEcorce: 0.0, rejetteApresFeu: true },
    sources: [ATLAS, HORNOY_2011],
  },
  {
    id: "cytisus_scoparius",
    nom: "Genêt à balais",
    nomLatin: "Cytisus scoparius",
    // Mai-juin, franc et court. Fabacée à fleurs sans nectar ou presque : le
    // genêt se visite pour son POLLEN, que les bourdons libèrent en forçant la
    // carène *(à calibrer)*.
    floraison: { debutDJ: 500, dureeDJ: 200, nectar: 0.5 },
    hauteurMaxM: 2.5,
    // La confrontation la plus nette de tout l'atlas arbustif, et elle tombe
    // juste sans qu'on ait rien touché : à Londres, un genêt fait ~160 cm à
    // trois ans puis ~220 cm à huit (Waloff & Richards 1977, via la
    // Biological Flora 2025) ; le moteur fait 156 et 220. Attention en
    // relisant la source : son autre chiffre (80 cm à 24 mois, 210 cm à 63)
    // est attribué à la Grande-Bretagne mais vient de placettes catalanes et
    // cévenoles — deux climats, encore une fois.
    pousseMaxMAn: 0.5,
    // Atlas : « landes acides, améliore le sol » — l'autre pionnière fixatrice.
    eau: { seuilConfortSecheresse: 0.35, seuilStressSecheresse: 0.1, toleranceEngorgement: 0.1 },
    ph: [4, 7],
    lumiere: { compensation: 0.25, saturation: 0.75, lai: 1.6, houppierRatio: 0.45, caduc: false },
    racines: { profondeurMaxCm: 130 }, // pivot de fabacée
    tBaseCroissanceC: 5,
    azote: { demandeRelative: 0.5, fixateur: true },
    regeneration: {
      maturiteAns: 3,
      longeviteAns: 20,
      dissemination: "gravite",
      semisParAn: 4,
      // Même famille, même tégument dur, même stratégie : le genêt attend sous terre que quelque chose ouvre le milieu.
      banqueGraines: {
        persistanceAns: 20,
        leveeParLeFeu: 0.4,
        leveeSpontanee: 0.04,
      },
    },
    litiere: { cnRatio: 22, calciumMgG: 5 },
    // Sempervirent : valeurs sans effet.
    phenologie: { debourrementDJ: 100, seuilJourH: 11.0, besoinFroidSemaines: 6 },
    economie: { prixPlantEur: 2.5 },
    // Infradensité NON SOURCÉE : aucun Cytisus au GWDD. Valeur d'avant #68.
    bois: { densite: 0.55, prixOeuvreEurM3: 40, rejetteDeSouche: true },
    // genêt appété, sans épines
    exigenceMinerale: 1,
    mycorhize: "arbusculaire",
    ravageurs: { sensibilite: 0.2 },
    gibier: { appetence: 0.55 },
    feu: { inflammabilite: 0.95, resistanceEcorce: 0.0, rejetteApresFeu: true },
    sources: [ATLAS, THOMAS_2025],
  },
  {
    id: "calluna_vulgaris",
    nom: "Callune",
    nomLatin: "Calluna vulgaris",
    // Août-septembre. **C'est la dernière grande miellée de l'année** sur les
    // landes — le miel de bruyère existe pour cette raison — et elle tombe
    // dans la seconde soudure, quand la ronce est passée et que rien de
    // ligneux n'a pris le relais.
    floraison: { debutDJ: 1400, dureeDJ: 350, nectar: 1 },
    hauteurMaxM: 0.6,
    // Cohérent avec la mesure, à une réserve de méthode près. Les landes du
    // nord-est de l'Allemagne donnent ~10 cm/an d'allongement de pousse
    // (Schellenberg 2021, 11 cm/an en Écosse), et les guides britanniques une
    // hauteur de couvert qui va de moins de 10-15 cm en phase pionnière à
    // 50-60 cm à maturité, vers vingt ans. Le moteur gagne 6 cm/an les
    // premières années et plafonne à 0,60 m vers vingt ans : la bonne
    // trajectoire. MAIS il fait naître tous ses semis à 30 cm (`regeneration.ts`),
    // si bien que la callune du jeu SAUTE sa phase pionnière — ce n'est pas
    // la fiche qui est en cause, c'est une hauteur de semis unique pour un
    // atlas qui va du sous-arbrisseau au chêne *(à confirmer)*.
    pousseMaxMAn: 0.12,
    // Atlas : « lande acide pauvre, bio-indicatrice acidité » — couvre-sol.
    eau: { seuilConfortSecheresse: 0.3, seuilStressSecheresse: 0.08, toleranceEngorgement: 0.2 },
    ph: [3.5, 6],
    lumiere: { compensation: 0.22, saturation: 0.7, lai: 2, houppierRatio: 0.6, caduc: false },
    racines: { profondeurMaxCm: 40 }, // sous-arbrisseau à racines fines superficielles
    tBaseCroissanceC: 5,
    azote: { demandeRelative: 0.15, fixateur: false },
    regeneration: {
      maturiteAns: 3,
      longeviteAns: 30,
      dissemination: "vent",
      semisParAn: 6,
      // La callune fait une banque très durable, mais sa levée doit moins au feu qu'à l'ouverture du milieu : elle germe surtout parce que la lumière revient *(à confirmer : moins documenté que l'ajonc)*.
      banqueGraines: {
        persistanceAns: 30,
        leveeParLeFeu: 0.25,
        leveeSpontanee: 0.06,
      },
    },
    // Litière éricacée : lente et acidifiante (voie fongique, ch2-B).
    litiere: { cnRatio: 45, calciumMgG: 3.5 },
    // Sempervirent : valeurs sans effet.
    phenologie: { debourrementDJ: 100, seuilJourH: 11.0, besoinFroidSemaines: 6 },
    economie: { prixPlantEur: 2 },
    // Infradensité NON SOURCÉE : ni Calluna ni Erica au GWDD. Valeur d'avant #68.
    bois: { densite: 0.6, prixOeuvreEurM3: 30, rejetteDeSouche: true },
    // consommée l'hiver quand il n'y a rien d'autre
    // le type des landes : il va chercher l'azote organique des sols acides
    exigenceMinerale: 1,
    mycorhize: "ericoide",
    ravageurs: { sensibilite: 0.15 },
    gibier: { appetence: 0.35 },
    feu: { inflammabilite: 0.95, resistanceEcorce: 0.0, rejetteApresFeu: true },
    sources: [ATLAS, SCHELLENBERG_2021],
  },
  {
    id: "castanea_sativa",
    nom: "Châtaignier",
    nomLatin: "Castanea sativa",
    hauteurMaxM: 30,
    // Non calé, et il tombe juste : 19,0 m simulés à quarante ans contre
    // ~18,7 m au faisceau de courbes des taillis français (Lemaire 2005, publié
    // par le CRPF Île-de-France–Centre). Deux réserves honnêtes — les seules
    // valeurs ÉCRITES de ce faisceau sont les hauteurs dominantes à 25 ans
    // (21 / 18,5 / 16 / 13,5 / 11 / 8,5 m des classes 1 à 6), celles à
    // quarante ans se lisent sur le graphique *(à confirmer)* ; et ce sont des
    // courbes de TAILLIS, où un rejet de souche devance un semis en jeunesse.
    // C'est bien ce qu'on mesure : 13,0 m simulés à 25 ans contre 14,75 m à
    // la médiane du faisceau. Le calcifuge se mesure sur limon ACIDE : sur le
    // limon riche à pH 7, il meurt de chlorose (`hauteurs.test.ts`).
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
    litiere: { cnRatio: 45, calciumMgG: 6 },
    // Le châtaignier est tardif : mi-mai. *(Des observations de terrain le donnent parfois plus précoce que le chêne ; on suit ici la vue forestière courante.)*
    phenologie: { debourrementDJ: 300, seuilJourH: 12.5, besoinFroidSemaines: 12 },
    economie: { prixPlantEur: 4 },
    // Infradensité : IGN/Dupouey, « Châtaignier » — l'essence de taillis par
    // excellence, et la table est faite pour les taillis.
    bois: { densite: 0.47, prixOeuvreEurM3: 200, rejetteDeSouche: true },
    // Juin, bien après les gels tardifs. Le châtaignier est une miellée de
    // référence, et il tient longtemps ouvert.
    floraison: { debutDJ: 750, dureeDJ: 250, nectar: 1 },
    fruits: {
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
    /**
     * Le châtaignier porte les DEUX blocs, et c'est la démonstration que ce ne
     * sont pas les mêmes : on récolte une partie de ses châtaignes (`fruits`),
     * le reste tombe et nourrit. Production nettement plus lourde et plus
     * régulière que celle d'un chêne *(à calibrer : les rendements publiés sont
     * ceux de vergers greffés, pas de taillis)*.
     */
    semences: { kgParM2HouppierAn: 0.08, periodeAns: 2, facteurAnneePleine: 1.4 },
    sources: [ATLAS, LEMAIRE_2005, IGN_DUPOUEY_2002],
  },
  {
    id: "quercus_suber",
    nom: "Chêne-liège",
    nomLatin: "Quercus suber",
    hauteurMaxM: 20,
    // **NON VÉRIFIABLE ICI, et donc toujours à calibrer.** Les données
    // existent — le modèle de hauteur dominante espagnol et tunisien
    // (Sánchez-González 2010) donne 5,0 m à quarante ans en classe médiane
    // pour des suberaies naturelles denses, quand les jeunes plantations
    // portugaises tournent plutôt vers 11 m — mais le moteur n'a aucune
    // station méditerranéenne où les confronter : le comparer sur un limon du
    // Nord serait comparer deux climats. Le rapport de deux entre suberaie
    // spontanée et plantation soignée dit assez qu'aucune de ces valeurs
    // n'est « la » vitesse de l'essence.
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
    litiere: { cnRatio: 50, calciumMgG: 6 },
    // Sempervirent : valeurs sans effet.
    phenologie: { debourrementDJ: 150, seuilJourH: 11.5, besoinFroidSemaines: 6 },
    economie: { prixPlantEur: 5 },
    // Infradensité : IGN/Dupouey, « Chêne-liège ». La valeur ne bouge pas — elle
    // était juste par chance, elle est maintenant sourcée.
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
    /**
     * Le chêne-liège est le chêne le plus RÉGULIER, et ce n'est pas un détail
     * de fiche : la montado ibérique engraisse ses porcs sur sa glandée chaque
     * automne, ce qu'aucun élevage ne pourrait faire avec une production une
     * année sur quatre *(à confirmer)*.
     */
    semences: { kgParM2HouppierAn: 0.05, periodeAns: 3, facteurAnneePleine: 2.5 },
    sources: [ATLAS, SANCHEZ_2010, IGN_DUPOUEY_2002],
  },
  {
    id: "fraxinus_excelsior",
    nom: "Frêne commun",
    nomLatin: "Fraxinus excelsior",
    hauteurMaxM: 35,
    // Non calé, et validé : 16,8 m simulés à quarante ans contre 16,5 m dans
    // la table néerlandaise (es, GK 6).
    pousseMaxMAn: 0.7,
    // Atlas : mésophile à hygrocline, il aime les sols frais et riches et
    // souffre vite en sol sec — c'est LE frêne des fonds de vallée et des
    // haies bocagères.
    eau: { seuilConfortSecheresse: 0.8, seuilStressSecheresse: 0.45, toleranceEngorgement: 0.5 },
    // pH, littérature : Thomas 2016, Biological Flora : ABSENT sous pH 4,2 en surface, tolère 4,5, préfère base-riche au-dessus de 5,5.
    ph: [4.2, 8],
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
    litiere: { cnRatio: 25, calciumMgG: 16 },
    // Le frêne est le dernier des grands feuillus à sortir, mi-mai passée.
    phenologie: { debourrementDJ: 310, seuilJourH: 12.5, besoinFroidSemaines: 12 },
    economie: { prixPlantEur: 3 },
    // Bois d'œuvre de premier ordre (manches, sport, ébénisterie) et rejet
    // vigoureux : c'est l'arbre à trogne par excellence.
    // Infradensité : IGN/Dupouey, « Frênes ».
    bois: { densite: 0.56, prixOeuvreEurM3: 200, rejetteDeSouche: true },
    feu: { inflammabilite: 0.25, resistanceEcorce: 0.15, rejetteApresFeu: true },
    // Très appété : un jeune frêne non protégé n'a aucune chance.
    gibier: { appetence: 0.8 },
    exigenceMinerale: 1,
    mycorhize: "arbusculaire",
    // La chalarose (Hymenoscyphus fraxineus) frappe l'espèce depuis 2008 :
    // c'est l'essence la plus menacée de France.
    ravageurs: { sensibilite: 0.9 },
    sources: [ATLAS, JANSEN_1996, IGN_DUPOUEY_2002],
  },
  {
    id: "arbutus_unedo",
    nom: "Arbousier",
    nomLatin: "Arbutus unedo",
    hauteurMaxM: 5,
    // Aucune courbe hauteur-âge n'existe pour l'arbousier, nulle part. Le
    // seul appui est une plantation de restauration en Galice (nord de
    // l'Espagne, donc océanique) : 29 à 42 cm la première année dans les
    // secteurs secs, plus de 85 cm dans un talweg à nappe. Le moteur fait 25
    // cm/an les premières années, au bas de cette fourchette *(à confirmer)*.
    // Les taillis catalans d'après incendie (1,55 m à quinze ans) sont bien
    // plus lents, mais ce sont des rejets serrés que la concurrence bride.
    pousseMaxMAn: 0.25,
    // Atlas : « méditerranéen, acidiphile, rejette après feu », mycorhize éricoïde.
    eau: { seuilConfortSecheresse: 0.35, seuilStressSecheresse: 0.12, toleranceEngorgement: 0.05 },
    // pH, littérature : van den Berk et World Agroforestry : de 5,0 (grès acide) à 7,8 (limon calcaire) ; tolérance à l'alcalin rare chez une éricacée.
    ph: [4, 7.8],
    lumiere: { compensation: 0.12, saturation: 0.6, lai: 2.4, houppierRatio: 0.45, caduc: false },
    racines: { profondeurMaxCm: 150 }, // racines profondes, adaptation méditerranéenne
    tBaseCroissanceC: 8,
    azote: { demandeRelative: 0.3, fixateur: false },
    regeneration: { maturiteAns: 5, longeviteAns: 100, dissemination: "oiseaux", semisParAn: 2 },
    litiere: { cnRatio: 45, calciumMgG: 5.5 },
    // Sempervirent : valeurs sans effet.
    phenologie: { debourrementDJ: 120, seuilJourH: 11.0, besoinFroidSemaines: 5 },
    economie: { prixPlantEur: 9 },
    // Infradensité : GWDD, mesure unique (0,65).
    bois: { densite: 0.65, prixOeuvreEurM3: 90, rejetteDeSouche: true },
    // Il fleurit en AUTOMNE, en même temps qu'il mûrit les fruits de l'an
    // passé (atlas : ressource des pollinisateurs). C'est la dernière table
    // de l'année, et elle n'a pas de concurrente.
    floraison: { debutDJ: 1150, dureeDJ: 300, nectar: 0.9 },
    fruits: {
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
    sources: [ATLAS, ASENSIO_2008, GWDD_2009],
  },
];

export function getEspece(id: string): EspeceV0 {
  const espece = ESPECES_V0.find((e) => e.id === id);
  if (!espece) throw new Error(`espèce inconnue : ${id}`);
  return espece;
}
