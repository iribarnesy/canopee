/**
 * Le fourré bas : ronce, ajonc, genêt, callune — **dessinés par cellule
 * agrégée, pas par tige** (docs/interface-visuelle.md §5.4).
 *
 * **C'est la huitième famille de port, et la seule qui ne passe pas par le
 * générateur d'arbres.** Le §5.4 le pose sans détour : ces espèces sont
 * « dessinées par cellule agrégée ». Trois raisons, et la première suffirait :
 *
 * 1. **Ce ne sont pas des arbres.** Une ronce n'a ni fût, ni houppier, ni
 *    flèche : c'est un enchevêtrement de tiges arquées qui se marcottent. Lui
 *    appliquer un squelette à branchement récursif donne un petit arbre, ce qui
 *    est faux et se voit.
 * 2. **Elles sont innombrables.** Sur la friche de l'an 30, la ronce est
 *    l'espèce la plus abondante du peuplement — plusieurs milliers de tiges à
 *    elle seule. Une vignette par tige, c'est le budget entier dépensé pour du
 *    sous-étage.
 * 3. **Personne ne compte les ronces.** Ce qu'un joueur lit, c'est « ce coin
 *    est embroussaillé » — une surface, pas des individus. Agréger n'est donc
 *    pas une approximation faute de mieux : c'est la bonne unité de lecture.
 *
 * **Ce qui est agrégé, et ce qui ne l'est pas.** On regroupe les tiges d'une
 * même espèce par carreau de `COTE_MASSE_M`, et la masse en retient ce que le
 * moteur donne : la hauteur MOYENNE des tiges du carreau, et leur nombre — d'où
 * la densité. Aucune tige n'est inventée ni oubliée ; on change d'échelle, pas
 * de données.
 *
 * Module **pur** : il rend des masses en coordonnées de parcelle. Le tracé est
 * dans `arbres.ts`, à la cuisson des vignettes.
 */

/** Une tige de fourré, telle que la couche la reçoit. */
export interface TigeFourre {
  especeId: string;
  x: number;
  y: number;
  z: number;
  heightM: number;
}

/** Une masse de fourré : ce qu'on dessine réellement. */
export interface MasseFourre {
  /** centre du carreau, en mètres */
  x: number;
  y: number;
  z: number;
  especeId: string;
  /** hauteur moyenne des tiges du carreau, m */
  hauteurM: number;
  /**
   * Densité ∈ [0,1] : le nombre de tiges rapporté à ce qui sature un carreau.
   *
   * Ce n'est pas un taux de recouvrement calculé par le moteur — il n'en
   * produit pas pour les ligneux — mais un comptage, et il se lit comme tel :
   * deux tiges de ronce sur un carreau font une touffe, trente font un roncier.
   */
  densite: number;
  /** nombre de tiges agrégées, pour qui veut la grandeur brute */
  tiges: number;
}

/**
 * Côté d'un carreau d'agrégation, en mètres.
 *
 * Quatre : la taille d'un roncier ordinaire, et l'échelle à laquelle un joueur
 * décide de débroussailler. Plus fin, on redessine des individus ; plus large,
 * une trouée dans un fourré disparaît.
 */
export const COTE_MASSE_M = 4;

/**
 * Nombre de tiges par carreau au-delà duquel la densité sature.
 *
 * Douze tiges sur seize mètres carrés : à ce compte-là, le sol ne se voit plus,
 * et une treizième ne change rien à l'image.
 */
export const TIGES_PLEINES = 12;

/**
 * Regroupe les tiges d'un fourré en masses, une par carreau et par espèce.
 *
 * L'ordre de sortie est stable — carreau par carreau, espèce par espèce, du
 * plus lointain au plus proche selon `x + y` — parce que tout ce qui se dessine
 * dans cette vue est trié par la même clé et que deux tris différents finissent
 * toujours par se contredire.
 */
export function agreger(tiges: readonly TigeFourre[]): MasseFourre[] {
  const paniers = new Map<string, { somme: number; sommeZ: number; n: number }>();
  for (const t of tiges) {
    if (t.heightM <= 0) continue;
    const ix = Math.floor(t.x / COTE_MASSE_M);
    const iy = Math.floor(t.y / COTE_MASSE_M);
    const cle = `${ix}|${iy}|${t.especeId}`;
    const panier = paniers.get(cle);
    if (panier) {
      panier.somme += t.heightM;
      panier.sommeZ += t.z;
      panier.n++;
    } else {
      paniers.set(cle, { somme: t.heightM, sommeZ: t.z, n: 1 });
    }
  }

  const sortie: MasseFourre[] = [];
  for (const [cle, panier] of paniers) {
    const [sx, sy, especeId] = cle.split("|");
    const ix = Number(sx);
    const iy = Number(sy);
    if (!Number.isFinite(ix) || !Number.isFinite(iy) || !especeId) continue;
    sortie.push({
      x: ix * COTE_MASSE_M + COTE_MASSE_M / 2,
      y: iy * COTE_MASSE_M + COTE_MASSE_M / 2,
      z: panier.sommeZ / panier.n,
      especeId,
      hauteurM: panier.somme / panier.n,
      densite: Math.min(1, panier.n / TIGES_PLEINES),
      tiges: panier.n,
    });
  }
  sortie.sort((a, b) => a.x + a.y - (b.x + b.y));
  return sortie;
}
