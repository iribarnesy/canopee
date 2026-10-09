/**
 * Le fourré bas : ronce, ajonc, genêt, callune — **dessinés par cellule
 * agrégée, pas par tige** (docs/interface-visuelle.md §5.4).
 *
 * **Le carreau est d'un mètre, et la masse se pose où sont ses tiges** (#361,
 * #356). Il faisait quatre mètres et la masse se posait en son **centre** : sur
 * une friche qui se ferme, un roncier par carreau, chacun au milieu du sien —
 * un quadrillage régulier, relevé au premier test humain, qui n'existait pas
 * dans le moteur (les tiges y naissent à des positions continues ; mesuré sur la
 * friche à trente ans, 2 599 tiges dont les parties décimales ne se répètent
 * pas). La masse se pose maintenant au **barycentre** de ses tiges, et le
 * carreau d'un mètre ne réunit que celles qui se touchent.
 *
 * Et elle **garde qui elle est** : les identifiants de ses tiges voyagent avec
 * elle. Une masse n'était l'arbre de personne, donc on ne pouvait ni cliquer
 * une ronce, ni savoir où elle était ; on clique maintenant un roncier, et ce
 * sont ses tiges qui sont sélectionnées.
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
 * moteur donne : la hauteur **moyenne** des tiges du carreau, et leur nombre — d'où
 * la densité. Aucune tige n'est inventée ni oubliée ; on change d'échelle, pas
 * de données.
 *
 * Module **pur** : il rend des masses en coordonnées de parcelle. Le tracé est
 * dans `arbres.ts`, à la cuisson des vignettes.
 */

/** Une tige de fourré, telle que la couche la reçoit. */
export interface TigeFourre {
  /** l'identifiant de la tige dans le moteur */
  id: number;
  especeId: string;
  x: number;
  y: number;
  z: number;
  heightM: number;
}

/** Une masse de fourré : ce qu'on dessine réellement. */
export interface MasseFourre {
  /** barycentre des tiges du carreau, en mètres */
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
  /** les identifiants des tiges, du plus petit au plus grand */
  ids: number[];
}

/**
 * Côté d'un carreau d'agrégation, en mètres.
 *
 * Un : on ne réunit que des tiges qui se touchent. À quatre mètres — « la
 * taille d'un roncier ordinaire » —, la masse d'un carreau à quatre tiges
 * éparses était un buisson posé au centre, et la friche se lisait en damier.
 */
export const COTE_MASSE_M = 1;

/**
 * Nombre de tiges par carreau au-delà duquel la densité sature.
 *
 * Deux tiges sur un mètre carré : le sol ne se voit plus au travers, et une
 * troisième ne change rien à l'image. Une tige seule se dessine à demi pleine.
 */
export const TIGES_PLEINES = 2;

/**
 * Regroupe les tiges d'un fourré en masses, une par carreau et par espèce.
 *
 * L'ordre de sortie est stable — carreau par carreau, espèce par espèce, du
 * plus lointain au plus proche selon `x + y` — parce que tout ce qui se dessine
 * dans cette vue est trié par la même clé et que deux tris différents finissent
 * toujours par se contredire.
 */
export function agreger(tiges: readonly TigeFourre[]): MasseFourre[] {
  const paniers = new Map<
    string,
    { especeId: string; somme: number; sx: number; sy: number; sz: number; ids: number[] }
  >();
  for (const t of tiges) {
    if (t.heightM <= 0) continue;
    const ix = Math.floor(t.x / COTE_MASSE_M);
    const iy = Math.floor(t.y / COTE_MASSE_M);
    const cle = `${ix}|${iy}|${t.especeId}`;
    const panier = paniers.get(cle);
    if (panier) {
      panier.somme += t.heightM;
      panier.sx += t.x;
      panier.sy += t.y;
      panier.sz += t.z;
      panier.ids.push(t.id);
    } else {
      paniers.set(cle, {
        especeId: t.especeId,
        somme: t.heightM,
        sx: t.x,
        sy: t.y,
        sz: t.z,
        ids: [t.id],
      });
    }
  }

  const sortie: MasseFourre[] = [];
  for (const panier of paniers.values()) {
    const n = panier.ids.length;
    sortie.push({
      x: panier.sx / n,
      y: panier.sy / n,
      z: panier.sz / n,
      especeId: panier.especeId,
      hauteurM: panier.somme / n,
      densite: Math.min(1, n / TIGES_PLEINES),
      tiges: n,
      ids: panier.ids.sort((a, b) => a - b),
    });
  }
  sortie.sort((a, b) => a.x + a.y - (b.x + b.y) || (a.ids[0] ?? 0) - (b.ids[0] ?? 0));
  return sortie;
}
