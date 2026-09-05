/**
 * L'eau libre, tracée par son CONTOUR et non cellule par cellule
 * (docs/interface-visuelle.md §5.2).
 *
 * **Le retour était : « la mare est moche, c'est pas du tout beau d'avoir des
 * marches ».** Il a raison, et mon argument précédent était mal placé. J'avais
 * défendu le bord franc — une berge n'est pas un dégradé, un ruisseau de deux
 * mètres fondu dans un pavé disparaît — et c'est vrai. Mais « franc » et « en
 * escalier » ne sont pas la même chose : un bord franc peut suivre une diagonale.
 * En dessinant un losange par cellule d'eau, j'obtenais un bord franc ET un
 * escalier, alors que seul le premier était voulu.
 *
 * **La correction : des carrés marcheurs.** L'eau est traitée comme un champ —
 * une valeur par COIN de cellule, moyenne des cellules qui s'y touchent — et on
 * trace la ligne de niveau à un demi. Le contour coupe alors les cellules en
 * diagonale au lieu de les contourner à angle droit : une rive ronde redevient
 * ronde, et le bord reste net.
 *
 * Ce n'est pas plus inventé que l'interpolation des couleurs du sol : entre deux
 * cellules dont l'une est en eau et l'autre non, la rive passe quelque part, et
 * la placer au milieu est la seule lecture neutre. Le contour ne s'écarte jamais
 * de plus d'un demi-mètre de ce que le moteur déclare.
 *
 * Module **pur** : il rend des polygones en coordonnées de parcelle. Le tracé
 * est dans `terrain.ts`, à la cuisson.
 */

/** Valeur du champ au-delà de laquelle on est dans l'eau. */
export const SEUIL_RIVE = 0.5;

/**
 * Le champ d'eau, échantillonné aux COINS des cellules.
 *
 * Un coin vaut la moyenne des cellules qui le touchent : au milieu d'une mare
 * il vaut 1, au milieu de la terre 0, et sur la rive une valeur intermédiaire
 * qui dit de quel côté la ligne passe. Les coins de bord ne comptent que les
 * cellules qui existent, ce qui fait qu'une mare coupée par la limite de la
 * parcelle garde sa rive au bon endroit.
 */
export function champEau(
  enEau: readonly boolean[] | undefined,
  coteM: number,
  x0: number,
  y0: number,
  largeur: number,
  hauteur: number,
): Float32Array {
  const n = (largeur + 1) * (hauteur + 1);
  const champ = new Float32Array(n);
  if (!enEau) return champ;
  for (let j = 0; j <= hauteur; j++) {
    for (let i = 0; i <= largeur; i++) {
      let somme = 0;
      let compte = 0;
      for (const [dx, dy] of [
        [-1, -1],
        [0, -1],
        [-1, 0],
        [0, 0],
      ] as const) {
        const cx = x0 + i + dx;
        const cy = y0 + j + dy;
        if (cx < 0 || cy < 0 || cx >= coteM || cy >= coteM) continue;
        somme += enEau[cy * coteM + cx] ? 1 : 0;
        compte++;
      }
      champ[j * (largeur + 1) + i] = compte === 0 ? 0 : somme / compte;
    }
  }
  return champ;
}

/** Un point en coordonnées locales à la cellule, ∈ [0,1]². */
export interface PointLocal {
  u: number;
  v: number;
}

/** Interpole le long d'une arête : où la ligne de niveau la traverse. */
function surLArete(a: number, b: number, seuil: number): number {
  const ecart = b - a;
  if (Math.abs(ecart) < 1e-9) return 0.5;
  return Math.min(1, Math.max(0, (seuil - a) / ecart));
}

/**
 * La part d'une cellule qui est sous l'eau, en polygone.
 *
 * Carrés marcheurs classiques, sur les quatre coins passés dans l'ordre
 * nord-ouest, nord-est, sud-ouest, sud-est (`u` vers l'est, `v` vers le sud).
 * Rend un tableau vide si la cellule est entièrement sèche, et le carré entier
 * si elle est entièrement noyée.
 *
 * Les deux cas ambigus — deux coins opposés dans l'eau — sont tranchés en
 * reliant les deux diagonales séparément, ce qui donne deux triangles plutôt
 * qu'un sablier. C'est le choix qui garde une rive continue.
 */
export function polygoneEau(
  no: number,
  ne: number,
  so: number,
  se: number,
  seuil = SEUIL_RIVE,
): PointLocal[][] {
  const code =
    (no >= seuil ? 8 : 0) | (ne >= seuil ? 4 : 0) | (se >= seuil ? 2 : 0) | (so >= seuil ? 1 : 0);
  if (code === 0) return [];
  if (code === 15) {
    return [
      [
        { u: 0, v: 0 },
        { u: 1, v: 0 },
        { u: 1, v: 1 },
        { u: 0, v: 1 },
      ],
    ];
  }
  // Les quatre points d'intersection possibles, un par arête.
  const haut: PointLocal = { u: surLArete(no, ne, seuil), v: 0 };
  const droite: PointLocal = { u: 1, v: surLArete(ne, se, seuil) };
  const bas: PointLocal = { u: surLArete(so, se, seuil), v: 1 };
  const gauche: PointLocal = { u: 0, v: surLArete(no, so, seuil) };
  const NO: PointLocal = { u: 0, v: 0 };
  const NE: PointLocal = { u: 1, v: 0 };
  const SE: PointLocal = { u: 1, v: 1 };
  const SO: PointLocal = { u: 0, v: 1 };

  switch (code) {
    case 1:
      return [[gauche, bas, SO]];
    case 2:
      return [[bas, droite, SE]];
    case 3:
      return [[gauche, droite, SE, SO]];
    case 4:
      return [[haut, NE, droite]];
    case 5:
      // Diagonale ambiguë : deux coins opposés, deux morceaux séparés.
      return [
        [haut, NE, droite],
        [gauche, bas, SO],
      ];
    case 6:
      return [[haut, NE, SE, bas]];
    case 7:
      return [[haut, NE, SE, SO, gauche]];
    case 8:
      return [[NO, haut, gauche]];
    case 9:
      return [[NO, haut, bas, SO]];
    case 10:
      return [
        [NO, haut, gauche],
        [bas, droite, SE],
      ];
    case 11:
      return [[NO, haut, droite, SE, SO]];
    case 12:
      return [[NO, NE, droite, gauche]];
    case 13:
      return [[NO, NE, droite, bas, SO]];
    default:
      return [[NO, NE, SE, bas, gauche]];
  }
}

/**
 * Toutes les parts noyées d'une emprise, en coordonnées de PARCELLE.
 *
 * Les polygones sont rendus cellule par cellule et non fusionnés : deux cellules
 * voisines partagent exactement leurs sommets de rive, donc les polygones se
 * touchent sans laisser de joint, et la fusion ne rapporterait qu'un peu de
 * temps de cuisson.
 */
export function polygonesEau(
  enEau: readonly boolean[] | undefined,
  coteM: number,
  x0: number,
  y0: number,
  largeur: number,
  hauteur: number,
): { x: number; y: number }[][] {
  if (!enEau) return [];
  const champ = champEau(enEau, coteM, x0, y0, largeur, hauteur);
  const pas = largeur + 1;
  const sortie: { x: number; y: number }[][] = [];
  for (let j = 0; j < hauteur; j++) {
    for (let i = 0; i < largeur; i++) {
      const no = champ[j * pas + i] ?? 0;
      const ne = champ[j * pas + i + 1] ?? 0;
      const so = champ[(j + 1) * pas + i] ?? 0;
      const se = champ[(j + 1) * pas + i + 1] ?? 0;
      for (const morceau of polygoneEau(no, ne, so, se)) {
        sortie.push(morceau.map((p) => ({ x: x0 + i + p.u, y: y0 + j + p.v })));
      }
    }
  }
  return sortie;
}
