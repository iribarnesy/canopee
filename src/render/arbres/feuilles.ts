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
 * **Les tracés sont NORMALISÉS** : une feuille tient dans un rectangle de
 * longueur 1 (de la base au sommet, vers +y) et de largeur libre, centrée sur
 * l'axe. C'est la fiche qui donne sa longueur réelle en mètres, et le rendu qui
 * la met à l'échelle. Un tracé qui ne serait pas normalisé se remettrait à
 * l'échelle deux fois, et personne ne s'en apercevrait avant une capture.
 *
 * **Ce qu'on ne dessine pas** : la nervation, les dents une à une, le duvet du
 * revers. À la taille où une feuille s'affiche — quelques pixels au zoom de
 * travail, quelques dizaines au plus près — c'est la SILHOUETTE qui porte
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
  /** arrondie TRONQUÉE au sommet — aulne, et personne d'autre */
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
  /** composée : plusieurs folioles sur un même pétiole — frêne, sureau */
  | "composee"
  /** longue et étroite, dentée en scie — châtaignier, saule */
  | "lanceolee";

/**
 * Le contour d'une feuille, en tracé fermé.
 *
 * Les points vont du pétiole (en bas, y = 0) au sommet (y = 1) par la DROITE,
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
      // Aulne : arrondie et COUPÉE NET au sommet, souvent même échancrée. Une
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
      // n'en décrit qu'une ; c'est le semis qui les pose PAR DEUX.
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
      // Chêne : les LOBES, avec leurs sinus arrondis. C'est la feuille la plus
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
      // Frêne, sureau : le contour d'UNE foliole. C'est le semis qui les pose
      // par cinq ou sept le long d'un pétiole — une feuille composée dessinée
      // d'un seul tenant ne se distinguerait pas d'une feuille simple.
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
      // Noisetier : GRANDE, cordée — donc échancrée à la base, ce qui est son
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
 * Combien d'éléments un bouquet pose par « feuille » déclarée.
 *
 * Deux pour le pin : les aiguilles vont **par deux**, et c'est sa signature la
 * plus fiable en botanique de terrain. Un pour tout le reste.
 */
export function elementsParFeuille(forme: FormeFeuille): number {
  // Deux aiguilles par faisceau chez le pin sylvestre — sa signature la plus
  // fiable en botanique de terrain. Cinq folioles pour une feuille composée :
  // c'est le nombre qui fait lire « composée » sans qu'on ait à les compter.
  if (forme === "aiguille") return 2;
  if (forme === "composee") return 5;
  return 1;
}
