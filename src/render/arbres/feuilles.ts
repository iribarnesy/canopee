/**
 * Les feuilles, dessinées à la main en tracés écrits dans le code
 * (docs/interface-visuelle.md §4, couche 2 de la direction artistique).
 *
 * **C'est ce qui identifie une espèce.** Le squelette donne le port — et un
 * port se confond vite : quatre feuillus de futaie ont à peu près la même
 * ramure. Ce qui sépare un frêne d'un châtaignier, c'est la feuille composée
 * contre la longue feuille dentée en scie ; un platane d'un érable, la palmée
 * contre la palmée à sinus aigus. Le §4 le dit sans détour : « une feuille est
 * un tracé de dix à trente points : une heure de travail par espèce, pas une
 * journée, et zéro fichier binaire ».
 *
 * **Les tracés sont normalisés** : une feuille tient dans un rectangle de
 * longueur 1 (de la base au sommet, vers +y) et de largeur libre, centrée sur
 * l'axe. C'est la fiche qui donne sa longueur réelle en mètres, et le rendu qui
 * la met à l'échelle. Un tracé qui ne serait pas normalisé se remettrait à
 * l'échelle deux fois, et personne ne s'en apercevrait avant une capture.
 *
 * **Ce qu'on ne dessine pas** : la nervation, les dents une à une, le duvet du
 * revers. À la taille où une feuille s'affiche — quelques pixels au zoom de
 * travail, quelques dizaines au plus près — c'est la **silhouette** qui porte
 * l'information, et rien d'autre. Le lot L0 l'avait déjà établi pour les
 * houppiers ; ça vaut à l'échelle en dessous.
 *
 * Module **pur** : des tableaux de points, aucun canvas.
 */

/** Un point du contour d'une feuille, dans le repère normalisé. */
export interface PointFeuille {
  x: number;
  y: number;
}

/**
 * Les formes de feuille écrites à ce jour.
 *
 * Une par famille de port, plus ce qu'il fallait pour que les sept premières
 * fiches soient reconnaissables. La liste grandira avec le catalogue — c'est le
 * coût récurrent que le §9 annonce : « chaque essence ajoutée au moteur coûtera
 * désormais une demi-journée à une journée de dessin ».
 */
export type FormeFeuille =
  /** ovale luisante à bord ondulé — hêtre */
  | "ovale"
  /** triangulaire à long pétiole — bouleau */
  | "triangulaire"
  /** arrondie **tronquée** au sommet — aulne, et personne d'autre */
  | "tronquee"
  /** aiguille, par deux — pin sylvestre */
  | "aiguille"
  /** petite, coriace, à bord un peu enroulé — chêne-liège */
  | "coriace"
  /** ovale dentée de verger — pommier */
  | "dentee"
  /** grande feuille cordée, doublement dentée — noisetier */
  | "cordee"
  /** lobée à sinus arrondis — les chênes, et personne d'autre */
  | "lobee"
  /** composée : plusieurs folioles sur un même rachis — frêne, sureau, noyers */
  | "composee"
  /** longue et étroite, dentée en scie — châtaignier, saule */
  | "lanceolee";

/**
 * Le contour d'une feuille, en tracé fermé.
 *
 * Les points vont du pétiole (en bas, y = 0) au sommet (y = 1) par la **droite**,
 * puis reviennent par la gauche. Le tracé est donné explicitement des deux
 * côtés plutôt que miroité : une feuille parfaitement symétrique se voit, et
 * les asymétries sont ce qui donne à un dessin fait main son air de dessin.
 */
export function contourFeuille(forme: FormeFeuille): readonly PointFeuille[] {
  switch (forme) {
    case "ovale":
      // Hêtre : ovale plein, plus large au tiers bas, bord ondulé.
      return [
        { x: 0, y: 0 },
        { x: 0.16, y: 0.14 },
        { x: 0.25, y: 0.34 },
        { x: 0.26, y: 0.56 },
        { x: 0.19, y: 0.79 },
        { x: 0.07, y: 0.94 },
        { x: 0, y: 1 },
        { x: -0.08, y: 0.93 },
        { x: -0.2, y: 0.77 },
        { x: -0.26, y: 0.55 },
        { x: -0.24, y: 0.33 },
        { x: -0.15, y: 0.13 },
      ];
    case "triangulaire":
      // Bouleau : petite, franchement triangulaire, base tronquée, pointe nette.
      return [
        { x: 0, y: 0 },
        { x: 0.13, y: 0.06 },
        { x: 0.3, y: 0.18 },
        { x: 0.27, y: 0.46 },
        { x: 0.16, y: 0.74 },
        { x: 0.04, y: 0.95 },
        { x: 0, y: 1 },
        { x: -0.05, y: 0.94 },
        { x: -0.17, y: 0.72 },
        { x: -0.28, y: 0.45 },
        { x: -0.31, y: 0.17 },
        { x: -0.14, y: 0.05 },
      ];
    case "tronquee":
      // Aulne : arrondie et **coupée net** au sommet, souvent même échancrée. Une
      // feuille qui a l'air d'avoir été taillée aux ciseaux — c'est le seul
      // feuillu de l'atlas dans ce cas, et ça se voit à dix mètres.
      return [
        { x: 0, y: 0 },
        { x: 0.18, y: 0.13 },
        { x: 0.31, y: 0.38 },
        { x: 0.33, y: 0.68 },
        { x: 0.26, y: 0.9 },
        { x: 0.1, y: 0.93 },
        { x: 0, y: 0.88 },
        { x: -0.11, y: 0.93 },
        { x: -0.27, y: 0.89 },
        { x: -0.33, y: 0.67 },
        { x: -0.3, y: 0.37 },
        { x: -0.17, y: 0.12 },
      ];
    case "aiguille":
      // Pin sylvestre : deux aiguilles vrillées, longues et fines. Le contour
      // n'en décrit qu'une ; c'est le semis qui les pose **par deux**.
      return [
        { x: 0, y: 0 },
        { x: 0.045, y: 0.12 },
        { x: 0.05, y: 0.6 },
        { x: 0.03, y: 0.92 },
        { x: 0, y: 1 },
        { x: -0.03, y: 0.92 },
        { x: -0.05, y: 0.6 },
        { x: -0.045, y: 0.12 },
      ];
    case "coriace":
      // Chêne-liège : petite, épaisse, bord légèrement révoluté — d'où les
      // rentrants doux plutôt que des dents.
      return [
        { x: 0, y: 0 },
        { x: 0.17, y: 0.12 },
        { x: 0.28, y: 0.3 },
        { x: 0.24, y: 0.5 },
        { x: 0.28, y: 0.68 },
        { x: 0.16, y: 0.9 },
        { x: 0, y: 1 },
        { x: -0.15, y: 0.89 },
        { x: -0.28, y: 0.67 },
        { x: -0.23, y: 0.49 },
        { x: -0.28, y: 0.29 },
        { x: -0.16, y: 0.11 },
      ];
    case "dentee":
      // Pommier : ovale, largement dentée, un peu plus étroite que le hêtre.
      return [
        { x: 0, y: 0 },
        { x: 0.14, y: 0.12 },
        { x: 0.23, y: 0.26 },
        { x: 0.19, y: 0.4 },
        { x: 0.24, y: 0.55 },
        { x: 0.18, y: 0.72 },
        { x: 0.1, y: 0.89 },
        { x: 0, y: 1 },
        { x: -0.11, y: 0.88 },
        { x: -0.19, y: 0.71 },
        { x: -0.24, y: 0.54 },
        { x: -0.18, y: 0.39 },
        { x: -0.23, y: 0.25 },
        { x: -0.13, y: 0.11 },
      ];
    case "lobee":
      // Chêne : les **lobes**, avec leurs sinus arrondis. C'est la feuille la plus
      // reconnaissable de la flore tempérée, et son contour est le seul du lot
      // qui ait besoin d'autant de points — les lobes sont l'information.
      return [
        { x: 0, y: 0 },
        { x: 0.1, y: 0.08 },
        { x: 0.24, y: 0.14 },
        { x: 0.13, y: 0.24 },
        { x: 0.28, y: 0.34 },
        { x: 0.15, y: 0.45 },
        { x: 0.29, y: 0.56 },
        { x: 0.14, y: 0.68 },
        { x: 0.22, y: 0.82 },
        { x: 0.09, y: 0.92 },
        { x: 0, y: 1 },
        { x: -0.1, y: 0.91 },
        { x: -0.23, y: 0.81 },
        { x: -0.15, y: 0.67 },
        { x: -0.3, y: 0.55 },
        { x: -0.16, y: 0.44 },
        { x: -0.29, y: 0.33 },
        { x: -0.14, y: 0.23 },
        { x: -0.25, y: 0.13 },
        { x: -0.11, y: 0.07 },
      ];
    case "composee":
      // Frêne, sureau, noyers : le contour d'**une** foliole. C'est
      // `polygonesDeFeuille` qui les pose par paires le long du rachis — une
      // feuille composée dessinée d'un seul tenant ne se distinguerait pas
      // d'une feuille simple.
      return [
        { x: 0, y: 0 },
        { x: 0.11, y: 0.16 },
        { x: 0.14, y: 0.5 },
        { x: 0.1, y: 0.82 },
        { x: 0, y: 1 },
        { x: -0.1, y: 0.81 },
        { x: -0.14, y: 0.49 },
        { x: -0.11, y: 0.15 },
      ];
    case "lanceolee":
      // Châtaignier, saule : longue, étroite, à dents aiguës régulières. Les
      // dents sont dans le contour — c'est ce qui la sépare d'une foliole.
      return [
        { x: 0, y: 0 },
        { x: 0.09, y: 0.1 },
        { x: 0.14, y: 0.24 },
        { x: 0.1, y: 0.34 },
        { x: 0.15, y: 0.46 },
        { x: 0.11, y: 0.58 },
        { x: 0.14, y: 0.72 },
        { x: 0.08, y: 0.88 },
        { x: 0, y: 1 },
        { x: -0.08, y: 0.87 },
        { x: -0.14, y: 0.71 },
        { x: -0.1, y: 0.57 },
        { x: -0.15, y: 0.45 },
        { x: -0.11, y: 0.33 },
        { x: -0.14, y: 0.23 },
        { x: -0.09, y: 0.09 },
      ];
    default:
      // Noisetier : **grande**, cordée — donc échancrée à la base, ce qui est son
      // signe le plus sûr — et doublement dentée.
      return [
        { x: 0.09, y: 0.06 },
        { x: 0.26, y: 0.16 },
        { x: 0.36, y: 0.36 },
        { x: 0.33, y: 0.58 },
        { x: 0.21, y: 0.82 },
        { x: 0.08, y: 0.96 },
        { x: 0, y: 1 },
        { x: -0.09, y: 0.95 },
        { x: -0.22, y: 0.81 },
        { x: -0.34, y: 0.57 },
        { x: -0.37, y: 0.35 },
        { x: -0.27, y: 0.15 },
        { x: -0.1, y: 0.05 },
        // L'échancrure : le tracé revient vers l'intérieur avant le pétiole.
        { x: 0, y: 0.12 },
      ];
  }
}

/** Largeur maximale d'une feuille, rapportée à sa longueur. */
export function largeurRelative(forme: FormeFeuille): number {
  let max = 0;
  for (const p of contourFeuille(forme)) max = Math.max(max, Math.abs(p.x));
  return max * 2;
}

/**
 * Nombre de folioles d'une feuille composée quand la fiche ne le dit pas.
 *
 * Cinq : c'est le nombre qui fait lire « composée » sans qu'on ait à les
 * compter. Une fiche qui en a besoin d'autres le déclare
 * (`Feuillage.folioles`) — le noyer hybride, dont la feuille se reconnaît
 * justement à son compte, et le frêne, qui en porte neuf à treize.
 */
export const FOLIOLES_PAR_DEFAUT = 5;

/** Où se pose une foliole sur le rachis, dans le repère normalisé de la feuille. */
export interface PoseFoliole {
  /** hauteur du point d'attache sur le rachis ∈ ]0,1[ */
  y: number;
  /** inclinaison sur le rachis, en radians : 0 dans son prolongement, positive vers la droite */
  angle: number;
  /** longueur de la foliole, en part de la longueur de la feuille */
  longueur: number;
}

/**
 * Les folioles d'une feuille composée **imparipennée** : des paires opposées le
 * long du rachis, et une terminale qui le prolonge.
 *
 * **Le semis d'origine les posait côte à côte**, décalées en largeur comme les
 * deux aiguilles d'un faisceau de pin : cinq folioles de la longueur de la
 * feuille entière, alignées en peigne. Ça se lisait « composée » à cinq, et ça
 * ne pouvait plus rien dire au-delà — quinze folioles en rang auraient fait une
 * feuille trois fois plus large que longue. Le noyer hybride, qui se reconnaît
 * à ses onze à vingt-trois folioles contre cinq à neuf chez le commun,
 * demandait une vraie feuille pennée.
 *
 * **Le compte règle la taille.** Le rachis est de longueur fixe — c'est la feuille
 * entière, dont la fiche donne la longueur réelle — donc plus il porte de
 * paires, plus elles sont serrées et petites : une feuille à dix-sept folioles
 * est une plume, une feuille à cinq une main.
 *
 * **La terminale est la plus grande**, et les paires grandissent de la base vers
 * le sommet. C'est le dessin des noyers — la terminale « très marquée » de
 * l'hybride (CNPF 2023), la plus grande aussi chez le commun — et il ne trahit
 * ni le frêne ni le sureau, qui ont aussi une terminale nette. Ce que ce semis
 * ne sait pas faire : régler, espèce par espèce, de **combien** elle domine.
 *
 * Un compte pair est arrondi à l'impair supérieur : toutes les feuilles composées
 * de l'atlas sont imparipennées.
 */
export function disposerFolioles(folioles: number): readonly PoseFoliole[] {
  const paires = Math.max(1, Math.ceil((Math.round(folioles) - 1) / 2));
  // La terminale prend ce que les paires lui laissent : un gros tiers de la
  // feuille à cinq folioles, un petit quart à dix-sept.
  const terminale = 0.16 + 0.7 / (paires + 1);
  const attacheTerminale = 1 - terminale;
  // La première paire laisse le pétiole nu, un peu plus long quand les paires
  // sont peu nombreuses ; la dernière s'arrête juste sous la terminale.
  const basse = 0.12 + 0.16 / paires;
  const haute = attacheTerminale - 0.05;
  const poses: PoseFoliole[] = [];
  for (let k = 0; k < paires; k++) {
    const t = paires > 1 ? k / (paires - 1) : 1;
    // De la base au sommet : plus longues, et plus couchées sur le rachis — mais
    // jamais autant que la terminale, qui reste la plus grande.
    const longueur = terminale * (0.65 + 0.15 * t);
    const angle = ((64 - 18 * t) * Math.PI) / 180;
    const y = basse + (haute - basse) * t;
    poses.push({ y, angle, longueur }, { y, angle: -angle, longueur });
  }
  poses.push({ y: attacheTerminale, angle: 0, longueur: terminale });
  return poses;
}

/**
 * Les contours d'**une feuille déclarée**, posés à leur place et prêts à tracer :
 * un seul pour une feuille simple, deux aiguilles pour le pin, et pour une
 * feuille composée son rachis plus chacune de ses folioles.
 *
 * Même repère que `contourFeuille` : pétiole à l'origine, sommet vers +y, la
 * longueur de la feuille vaut 1. Le rendu les remplit **d'un seul tenant**, une
 * feuille étant un objet et non quinze.
 */
export function polygonesDeFeuille(
  forme: FormeFeuille,
  folioles: number = FOLIOLES_PAR_DEFAUT,
): readonly (readonly PointFeuille[])[] {
  const contour = contourFeuille(forme);
  // Deux aiguilles par faisceau chez le pin sylvestre — sa signature la plus
  // fiable en botanique de terrain.
  if (forme === "aiguille") {
    return [-0.11, 0.11].map((dx) => contour.map((p) => ({ x: p.x + dx, y: p.y })));
  }
  if (forme !== "composee") return [contour];
  const poses = disposerFolioles(folioles);
  const sommet = poses[poses.length - 1]?.y ?? 0.7;
  // Le rachis : un trait, qui ne se voit qu'à la loupe — à l'échelle du jeu, ce
  // sont les folioles qui portent la silhouette.
  const rachis: PointFeuille[] = [
    { x: -0.008, y: 0 },
    { x: 0.008, y: 0 },
    { x: 0.006, y: sommet },
    { x: -0.006, y: sommet },
  ];
  const posees = poses.map((f) => {
    const c = Math.cos(f.angle);
    const s = Math.sin(f.angle);
    return contour.map((p) => {
      const x = p.x * f.longueur;
      const y = p.y * f.longueur;
      return { x: x * c + y * s, y: f.y - x * s + y * c };
    });
  });
  return [rachis, ...posees];
}

/**
 * Le port du **bouquet** : de combien il s'allonge le long du rameau, et de combien
 * son bord est découpé.
 *
 * **La grandeur qui manquait, et elle manquait à l'échelle où l'on joue.** Le
 * §4 pose que l'unité de dessin est le bouquet et non la feuille — « dessine
 * l'objet que l'œil perçoit à cette distance ». Il était pourtant le **seul**
 * élément du houppier sans caractère d'espèce : chaque essence recevait le même
 * disque déchiqueté, et seules la couleur et la densité les séparaient. Sur la
 * planche des trois sujets vus de près, un hêtre et un bouleau portaient
 * exactement le même objet, et le pin sylvestre — dont le code croyait dessiner
 * une brosse — sortait en boules rondes.
 *
 * **Rien de nouveau n'est déclaré pour autant.** Le port d'un bouquet est une
 * **conséquence** de la feuille qui le compose, et la fiche déclare déjà sa forme :
 * cinq folioles sur un pétiole font une fronde allongée et profondément
 * échancrée, une rosette de feuilles ovales fait une boule pleine à bord doux,
 * des aiguilles font une brosse dans l'axe du rameau. On lit donc la
 * conséquence au lieu d'ajouter une déclaration qui pourrait la contredire.
 *
 * `allongement` est le rapport de l'axe du rameau à l'axe transverse ; le
 * dessin conserve l'**aire**, sans quoi allonger un bouquet changerait la
 * couverture du houppier et donc sa transparence — un effet qu'on n'a pas
 * demandé. `decoupe` est l'amplitude du bord, de 0 (lisse) à 1 (lacéré).
 */
export function portDuBouquet(
  forme: FormeFeuille,
  folioles: number = FOLIOLES_PAR_DEFAUT,
): {
  allongement: number;
  decoupe: number;
} {
  switch (forme) {
    // Une brosse, et de loin la plus allongée : les aiguilles garnissent le
    // rameau sur toute sa longueur au lieu de s'assembler à son bout. C'est ce
    // qui dit « conifère » à l'œil, plus encore que le port étagé.
    case "aiguille":
      return { allongement: 3.2, decoupe: 0.75 };
    // Une fronde : les folioles s'échelonnent sur le pétiole, le bouquet
    // s'étire et son bord est percé entre elles. Frêne, sureau, noyers.
    //
    // **Et le compte de folioles s'y lit encore**, ce qui est la même règle
    // appliquée un cran plus loin : des folioles plus nombreuses font une feuille
    // plus longue, en plume, donc une fronde plus étirée. C'est ce qui sépare de
    // loin le bouquet du noyer hybride de celui du commun, bien en dessous du
    // seuil où l'on dessine une feuille. À cinq folioles rien ne bouge, et la
    // brosse du pin reste la plus allongée de toutes.
    //
    // La découpe, elle, ne suit pas : un bord plus finement percé demanderait
    // plus de sommets, pas moins d'amplitude. Essayée, l'amplitude réduite
    // donnait des fuseaux lisses — une feuille de saule, pas une fronde.
    case "composee": {
      const enPlus = Math.max(0, folioles - FOLIOLES_PAR_DEFAUT);
      return { allongement: Math.min(2.6, 2.1 + 0.04 * enPlus), decoupe: 0.85 };
    }
    // Longue et étroite : le bouquet suit. Châtaignier, saule.
    case "lanceolee":
      return { allongement: 1.7, decoupe: 0.6 };
    // Les lobes se lisent sur le **bord** du bouquet, pas sur chaque feuille : un
    // houppier de chêne est bosselé là où celui d'un hêtre est lisse.
    case "lobee":
      return { allongement: 1.15, decoupe: 0.72 };
    // Grande feuille cordée : un bouquet large, à bord franchement dentelé.
    case "cordee":
      return { allongement: 1.2, decoupe: 0.5 };
    // Petites feuilles lâches et pendantes : à peine allongé, bord irrégulier.
    case "triangulaire":
      return { allongement: 1.3, decoupe: 0.55 };
    case "dentee":
      return { allongement: 1.05, decoupe: 0.42 };
    // La rosette pleine à bord doux : hêtre, aulne, chêne-liège. C'est le cas
    // qui était appliqué à tout le monde.
    default:
      return { allongement: 1, decoupe: 0.3 };
  }
}
