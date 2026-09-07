/**
 * Le hors-parcelle : ce qu'on voit AUTOUR, pour que l'hectare cesse de flotter
 * (docs/interface-visuelle.md §5.8).
 *
 * **Le retour était : « une parcelle qui flotte en l'air, c'est bizarre ».** Il
 * a raison, et le défaut est plus grave qu'esthétique. Une parcelle posée sur
 * du vide se lit comme une maquette, pas comme un lieu : le joueur ne peut pas
 * situer son bois, et il ne comprend pas pourquoi le vent vient de l'ouest ou
 * pourquoi les chevreuils arrivent du nord. Or le moteur SAIT ce qu'il y a de
 * chaque côté — `state.bordures` porte un paysage par côté, et c'est de là que
 * viennent le gibier, les semis, les dépôts d'azote, le vent et les départs de
 * feu. Le dessiner, c'est rendre visible une donnée qui agit déjà.
 *
 * **Trois règles, et la deuxième est la plus importante.**
 *
 * 1. **Rien n'est inventé.** La couleur d'un côté vient des trois parts de son
 *    paysage — boisée, cultivée, urbanisée — et les masses qu'on y sème suivent
 *    ces mêmes parts. Un côté « plaine céréalière » (95 % cultivé) donne des
 *    bandes de culture ; un côté « massif forestier » (90 % boisé) donne une
 *    masse d'arbres continue. On ne choisit pas un joli fond : on affiche
 *    `partBoisee`.
 *
 * 2. **Ça ne doit PAS attirer l'œil**, et le joueur l'a demandé explicitement.
 *    Le décor est là pour asseoir la parcelle, pas pour la concurrencer. Trois
 *    moyens, tous physiques plutôt qu'arbitraires :
 *    - la **perspective aérienne** : plus c'est loin, plus ça se fond dans la
 *      brume (`attenuation`). C'est ce que fait l'atmosphère, et l'œil sait le
 *      lire comme de la distance ;
 *    - la **désaturation** : le décor perd une bonne part de sa couleur, la
 *      parcelle garde la sienne. Le regard va au saturé ;
 *    - le **contraste écrasé** : les masses du décor ne s'écartent que de peu
 *      de leur fond, là où dans la parcelle une touffe tranche.
 *    Ce qui reste net, c'est la LIMITE de la parcelle — et c'est voulu : le
 *    joueur doit savoir au pixel près où finit ce qui lui appartient.
 *
 * 3. **Le décor ne coûte rien par image.** Il est cuit comme le terrain, et
 *    plus grossièrement : il n'a ni saison fine, ni cellule, ni interaction.
 *
 * **Ce que le décor n'est pas** : une extension de la simulation. Aucune de ses
 * masses n'est un arbre au sens du moteur, aucune n'a d'âge ni de biomasse, et
 * rien de ce qui s'y passe ne rentre dans un bilan. C'est un fond, et il est
 * annoncé comme tel.
 *
 * Module **pur** : il dit quoi dessiner et où, en coordonnées de parcelle
 * (qui deviennent négatives ou supérieures au côté — c'est le principe). Le
 * tracé est dans `terrain.ts`, à la cuisson.
 */

import { getEspece } from "../../engine/especes";
import { ficheDe } from "../arbres/especes";
import { melange, type Teinte } from "../palette";

/**
 * Ce qu'on connaît d'un côté, sans dépendre du type `Paysage` du moteur.
 *
 * **Les parts viennent du moteur et il faut le dire, parce que j'ai affirmé le
 * contraire.** `GameState` porte un `paysageId` par CÔTÉ (`paysage.ts`,
 * `Bordures`), et chaque paysage déclare ses trois parts : le décor n'invente
 * donc pas son voisinage, il le lit. Ce qui était perdu en route, c'était les
 * ESSENCES — la réduction à trois nombres jetait les `semenciers`, et un bois
 * de pins de lande se dessinait comme une hêtraie. C'est le champ `especes`
 * ci-dessous, et c'est la même leçon que les houppiers du §4 : l'unité de
 * dessin doit porter l'identité de l'espèce, sinon le problème n'a fait que
 * monter d'un cran.
 */
export interface CoteDecor {
  /** part boisée ∈ [0,1] */
  boise: number;
  /** part cultivée ∈ [0,1] */
  cultive: number;
  /** part urbanisée ∈ [0,1] */
  urbain: number;
  /**
   * Ce qui pousse de ce côté-là, tel que le paysage du moteur le déclare
   * (`Paysage.semenciers`). Le poids est le `semisParAn` : ce n'est pas une
   * part de couvert, mais c'est le seul classement d'abondance que le moteur
   * donne, et il est bon — un paysage sème surtout ce qu'il porte le plus.
   *
   * Absent = on ne sait pas, et le décor reste sur sa teinte de bois générique
   * plutôt que de choisir une essence au hasard.
   */
  especes?: readonly { especeId: string; poids: number }[];
}

/** Les quatre côtés, dans le repère parcelle (+y nord, +x est). */
export interface DecorBordures {
  nord: CoteDecor;
  est: CoteDecor;
  sud: CoteDecor;
  ouest: CoteDecor;
}

/**
 * Distance au-delà de laquelle on ne sème plus de masses dans le décor.
 *
 * **Ce n'est PAS l'étendue du décor**, et j'ai mis deux essais à comprendre
 * pourquoi. J'ai d'abord dessiné une ceinture de soixante mètres, puis, la
 * trouvant envahissante, une de trente-quatre. Les deux captures montraient la
 * même chose : une parcelle posée sur une galette, avec du ciel tout autour —
 * c'est-à-dire exactement le plateau flottant qu'on voulait supprimer, avec un
 * liseré flou en plus.
 *
 * L'erreur était de raisonner en ceinture. Dans une vue isométrique inclinée à
 * trente degrés, **l'horizon est très loin hors de l'écran** : on ne voit pas
 * de ciel, on voit du sol jusqu'au bord du cadre. La nappe du décor couvre donc
 * tout le visible, sans limite d'étendue (voir `cuireMorceauDecor`), et ce
 * réglage-ci ne borne plus que le SEMIS des masses — au-delà, la brume les
 * aurait de toute façon effacées et les cuire ne servirait qu'à ralentir.
 */
export const MARGE_DECOR_M = 90;

/** Distance, en mètres, à laquelle la brume atteint son maximum. */
export const PORTEE_BRUME_M = 80;

/**
 * Ce que la brume peut manger au plus.
 *
 * **Elle ne va pas jusqu'au bout, et c'est la deuxième moitié de la correction
 * ci-dessus.** Un décor qui se dissout complètement redevient du ciel, donc du
 * vide, donc une parcelle qui flotte. Le lointain doit rester du SOL : plus
 * terne, plus froid, sans détail — mais du sol. Cinquante-cinq pour cent de
 * brume donnent exactement ça, une campagne d'arrière-plan qu'on ne regarde
 * pas et qui n'est pas un trou.
 */
export const BRUME_MAX = 0.55;

/** Ce vers quoi tout se fond au loin. Le fond du ciel de l'interface. */
export const BRUME: Teinte = { r: 168, g: 176, b: 174 };

/** Part de couleur que le décor perd d'emblée, avant même la brume. */
export const DESATURATION = 0.3;

/** Facteur de clarté du décor : il reste d'un ton en dessous de la parcelle. */
export const OMBRE_DU_DECOR = 0.88;

/**
 * Opacité de la COUCHE de décor, appliquée à la pose (`pixi/scene.ts`).
 *
 * **Le quatrième moyen de dire « ce n'est pas à vous »**, et le seul des
 * quatre qu'un joueur ne puisse pas confondre avec du terrain. Les trois
 * autres — la brume, la désaturation, le contraste écrasé — disent « c'est
 * loin » ; ils ne disent pas « c'est à quelqu'un d'autre ». Ce qu'il y a
 * derrière le décor est le fond de brume de l'interface : à 0,78, le
 * hors-parcelle se lit comme vu à travers quelque chose, et la limite de la
 * parcelle devient la frontière entre deux natures d'image et non seulement
 * entre deux teintes.
 *
 * Pas plus bas : en dessous d'environ 0,7 le décor redevient du ciel, et la
 * parcelle se remet à flotter sur une galette — le défaut que la brume avait
 * déjà coûté deux essais à corriger.
 */
export const OPACITE_DU_DECOR = 0.78;

/**
 * Ce que la brume a mangé, à `distance` mètres du bord de la parcelle.
 *
 * **La courbe compte, et le premier jet s'est trompé de sens.** J'avais pris
 * une racine, pour que l'atténuation morde tout de suite et que le décor ne
 * concurrence pas la parcelle. Résultat sur la capture : dès le premier mètre
 * le décor était à moitié dans la brume, et comme le ciel est de cette même
 * brume, il ne restait plus de sol autour de la parcelle mais une purée grise
 * sans horizon. Le plateau flottait toujours, avec du brouillard en plus.
 *
 * La bonne courbe est l'inverse : lente d'abord, rapide ensuite. Les premiers
 * mètres autour de la parcelle sont de la TERRE, franchement lisible comme
 * telle ; c'est le lointain qui se dissout. Ne pas attirer l'œil ne se joue pas
 * là — ça se joue sur la saturation et sur le contraste, qui, eux, valent
 * partout.
 */
export const PALIER_NET_M = 10;

export function attenuation(distanceM: number): number {
  // Les premiers mètres ne sont pas atténués du tout : c'est la ceinture de
  // terre qui pose la parcelle, et il faut qu'elle se lise comme de la terre.
  const utile = Math.max(0, distanceM - PALIER_NET_M);
  const t = Math.min(1, utile / Math.max(1, PORTEE_BRUME_M - PALIER_NET_M));
  return BRUME_MAX * t * t * (3 - 2 * t);
}

// ── Les couleurs des trois matières du décor ────────────────────────────────
// Prises volontairement dans la même famille que la palette du sol : le décor
// est le MÊME pays que la parcelle, pas une vignette collée derrière.

/** Une masse boisée vue de loin : sombre, bleutée, sans détail. */
export const BOIS: Teinte = { r: 74, g: 88, b: 66 };
/** Une culture : plus claire et plus jaune que l'herbe de la parcelle. */
export const CULTURE: Teinte = { r: 146, g: 142, b: 96 };
/**
 * Du bâti : gris chaud de tuile et d'enduit, jamais franchement coloré.
 *
 * Assombri depuis 138/128/118. Un mur enduit EST plus clair qu'un pré, c'est
 * vrai, mais sur la capture les bâtiments ressortaient en bulles pâles au
 * milieu d'une image par ailleurs sourde — donc le premier détail que l'œil
 * attrapait, exactement ce que le décor a consigne de ne pas faire.
 */
export const BATI: Teinte = { r: 116, g: 108, b: 99 };
/** Ce qui n'est ni bois, ni culture, ni bâti : de l'herbe rase quelconque. */
export const FOND: Teinte = { r: 112, g: 118, b: 88 };

/**
 * Couleur de fond d'un côté : ses trois parts, pondérées.
 *
 * Le reste — ce qui n'est ni boisé, ni cultivé, ni urbanisé — retombe sur du
 * fond herbeux, exactement comme la terre à nu du tapis est ce qui reste quand
 * l'herbe et la litière ne couvrent pas.
 */
export function teinteDuCote(cote: CoteDecor): Teinte {
  const b = Math.min(1, Math.max(0, cote.boise));
  const c = Math.min(1, Math.max(0, cote.cultive));
  const u = Math.min(1, Math.max(0, cote.urbain));
  const reste = Math.max(0, 1 - b - c - u);
  const total = b + c + u + reste || 1;
  return {
    r: (BOIS.r * b + CULTURE.r * c + BATI.r * u + FOND.r * reste) / total,
    g: (BOIS.g * b + CULTURE.g * c + BATI.g * u + FOND.g * reste) / total,
    b: (BOIS.b * b + CULTURE.b * c + BATI.b * u + FOND.b * reste) / total,
  };
}

/**
 * Poids de chaque côté en un point du décor.
 *
 * Un point plein nord vaut le côté nord ; un point dans le coin nord-est
 * mélange les deux, et c'est nécessaire — sans mélange, la diagonale d'un coin
 * afficherait une frontière nette entre forêt et champ, à un endroit où le
 * moteur ne dit rien de tel.
 *
 * Le poids d'un côté est la profondeur dont on a débordé de ce côté-là : un
 * point à trente mètres au nord et cinq à l'est est nord à 86 %.
 */
export function poidsDesCotes(
  x: number,
  y: number,
  coteM: number,
): { nord: number; est: number; sud: number; ouest: number } {
  const nord = Math.max(0, y - coteM);
  const sud = Math.max(0, -y);
  const est = Math.max(0, x - coteM);
  const ouest = Math.max(0, -x);
  const total = nord + sud + est + ouest;
  if (total <= 0) return { nord: 0.25, est: 0.25, sud: 0.25, ouest: 0.25 };
  return { nord: nord / total, est: est / total, sud: sud / total, ouest: ouest / total };
}

/** Distance au bord de la parcelle, en mètres. Nulle dedans. */
export function distanceAuBord(x: number, y: number, coteM: number): number {
  const dx = Math.max(0, Math.max(-x, x - coteM));
  const dy = Math.max(0, Math.max(-y, y - coteM));
  return Math.hypot(dx, dy);
}

/** Hachage entier → [0,1[, stable et sans allocation. Le même que le tapis. */
function hacher(a: number, b: number, sel: number): number {
  let h = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ sel) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/**
 * Variation lente de la nappe du décor : ±`AMPLITUDE_VARIATION` de clarté.
 *
 * La maille est large, pour que ça se lise comme du parcellaire et non comme du
 * bruit ; l'amplitude est faible, pour que ça reste sous le seuil du regard.
 */
export const MAILLE_VARIATION_M = 14;
export const AMPLITUDE_VARIATION = 0.07;

/**
 * Grumeau : une valeur lente ∈ [0,1] qui dit si le coin est boisé ou ouvert.
 *
 * **Sans elle, les bosquets sortaient en pois.** Tirer chaque case
 * indépendamment donne un semis de Poisson : à 35 % de boisé, on obtient des
 * dômes isolés, régulièrement espacés, tous de la même taille — un motif de
 * colonie bactérienne, et le premier chose que l'œil attrape sur la capture.
 *
 * Or un pays boisé ne se répartit pas au hasard : il y a des bois et il y a des
 * clairières, des hameaux et des champs vides. En modulant la probabilité par
 * une valeur lente, les cases boisées se GROUPENT, les dômes se recouvrent, et
 * on lit une masse avec une lisière — ce qu'est un bois. La part boisée
 * moyenne, elle, ne change pas : c'est la même donnée du moteur, répartie
 * comme elle l'est en vrai.
 *
 * Interpolée entre les nœuds d'une grille lâche, sinon les groupes auraient des
 * bords carrés.
 */
export const MAILLE_GRUMEAU_M = 26;
/** De combien le grumeau peut écarter la probabilité locale de la moyenne. */
export const FORCE_GRUMEAU = 0.85;

export function grumeau(x: number, y: number): number {
  // **Deux octaves, et la première version n'en avait qu'une.** Un bruit
  // bilinéaire sur une grille carrée garde ses extrema aux nœuds de cette
  // grille : dès qu'on le SEUILLE — et la canopée le seuille — le motif
  // s'aligne sur le réseau et le hors-parcelle sort en filet régulier, des
  // champs séparés par des bandes pâles à intervalles parfaitement égaux.
  //
  // J'ai d'abord accusé `variationDuDecor`, qui a des cases franches et une
  // maille voisine. Vérifié en l'éteignant : image identique au pixel. C'est
  // la troisième fois dans ce chantier qu'une explication convaincante est
  // fausse, et la troisième fois que la mesure coûte moins cher que le
  // raisonnement.
  //
  // La seconde octave, à une maille non multiple de la première et sur un
  // autre sel, casse l'alignement sans changer la moyenne.
  const large = bruitLisse(x, y, MAILLE_GRUMEAU_M, 0x4d2b);
  const fine = bruitLisse(x + 7.5, y - 3.5, MAILLE_GRUMEAU_M / 2.7, 0x91c5);
  return large * (1 - PART_SECONDE_OCTAVE) + fine * PART_SECONDE_OCTAVE;
}

/** Part de la seconde octave du grumeau. Assez pour casser le réseau. */
export const PART_SECONDE_OCTAVE = 0.38;

/**
 * Un bruit ∈ [0,1] continu, interpolé entre les nœuds d'une grille de `maille`.
 *
 * **Généralisé depuis `grumeau`, qui en était le seul usage.** La canopée en a
 * besoin à deux échelles — celle des peuplements et celle des cimes — et deux
 * copies de la même interpolation auraient dérivé. La continuité est ce qui
 * compte : un bruit par case donne des plateaux, et des plateaux voisins de
 * hauteurs différentes donnent un relief à FACETTES, ce qu'une capture a
 * montré tout de suite sur la canopée.
 */
export function bruitLisse(x: number, y: number, maille: number, sel: number): number {
  const u = x / maille;
  const v = y / maille;
  const i = Math.floor(u);
  const j = Math.floor(v);
  const doux = (t: number) => t * t * (3 - 2 * t);
  const su = doux(u - i);
  const sv = doux(v - j);
  const a = hacher(i, j, sel);
  const b = hacher(i + 1, j, sel);
  const c = hacher(i, j + 1, sel);
  const d = hacher(i + 1, j + 1, sel);
  return (a + (b - a) * su) * (1 - sv) + (c + (d - c) * su) * sv;
}

export function variationDuDecor(x: number, y: number): number {
  const ix = Math.floor(x / MAILLE_VARIATION_M);
  const iy = Math.floor(y / MAILLE_VARIATION_M);
  return 1 + (hacher(ix, iy, 0x1c9d) - 0.5) * 2 * AMPLITUDE_VARIATION;
}

/**
 * La couleur du décor en un point, brume et désaturation comprises.
 *
 * C'est ici que se joue la règle « ça ne doit pas attirer l'œil ». La teinte du
 * paysage est d'abord tirée vers son propre gris, puis vers la brume selon la
 * distance : au bord de la parcelle on devine ce qu'il y a, à quarante mètres
 * il ne reste qu'un ton.
 *
 * Une variation lente s'y ajoute (`variationDuDecor`) : sans elle, la nappe est
 * un aplat parfaitement uni sur lequel les masses se détachent comme des taches
 * — la capture donnait une culture de laboratoire plutôt qu'une campagne.
 */
export function couleurDecor(bordures: DecorBordures, x: number, y: number, coteM: number): Teinte {
  const w = poidsDesCotes(x, y, coteM);
  const n = teinteDuCote(bordures.nord);
  const e = teinteDuCote(bordures.est);
  const s = teinteDuCote(bordures.sud);
  const o = teinteDuCote(bordures.ouest);
  const brut: Teinte = {
    r: n.r * w.nord + e.r * w.est + s.r * w.sud + o.r * w.ouest,
    g: n.g * w.nord + e.g * w.est + s.g * w.sud + o.g * w.ouest,
    b: n.b * w.nord + e.b * w.est + s.b * w.sud + o.b * w.ouest,
  };
  // Désaturation : on tire vers le gris de MÊME clarté, ce qui enlève la
  // couleur sans changer la valeur — sinon le décor s'éclaircirait ou
  // s'assombrirait selon sa teinte, et la parcelle ne serait plus posée dessus.
  const gris = (brut.r + brut.g + brut.b) / 3;
  const terne = melange(brut, { r: gris, g: gris, b: gris }, DESATURATION);
  // Un ton en dessous de la parcelle : le hors-parcelle n'est pas la lumière
  // du joueur. C'est le troisième levier de la règle 2, et le moins coûteux —
  // il ne mange ni la lisibilité du sol ni sa couleur.
  const clarte = OMBRE_DU_DECOR * variationDuDecor(x, y);
  const enRetrait = { r: terne.r * clarte, g: terne.g * clarte, b: terne.b * clarte };
  return melange(enRetrait, BRUME, attenuation(distanceAuBord(x, y, coteM)));
}

/**
 * Ce qu'une masse du décor représente.
 *
 * `culture` reste dans le type parce que `couleurMasse` sait la peindre et
 * qu'une future bande de sillons s'en servira ; en revanche `masseDeLaCase`
 * n'en sème plus — voir la note qui s'y trouve.
 */
/**
 * Ce qu'une masse de décor peut être — c'est-à-dire un objet posé sur le sol.
 *
 * `bois` et `culture` y restent parce que `couleurMasse` sait les peindre et
 * que la canopée s'en sert ; mais `masseDeLaCase` n'en sème plus aucune des
 * deux. Une culture est une surface, un bois est une surface — seul un
 * bâtiment se compte.
 */
export type Masse = "bois" | "culture" | "bati";

export interface MasseDecor {
  x: number;
  y: number;
  masse: Masse;
  /** rayon au sol, en mètres */
  rayonM: number;
  /** hauteur apparente, en mètres */
  hauteurM: number;
}

/**
 * Côté d'une case de semis de masses, en mètres. Une masse par case au plus.
 *
 * Ramené de huit à six : à huit, un côté boisé à 90 % donnait encore des dômes
 * SÉPARÉS, et un bois qui se compte en boules n'est pas un bois. À six, ils se
 * recouvrent et forment une masse continue, ce qui est la lecture juste — de
 * loin, une forêt n'a pas d'arbres, elle a une lisière et une surface.
 */
export const MAILLE_MASSE_M = 6;

/**
 * Part de sa hauteur maximale qu'atteint un bosquet de décor.
 *
 * **Ce sont les deux seuls nombres inventés de la taille d'une masse**, et ils
 * disent une chose que le moteur ne dit pas : un boisement voisin n'est ni un
 * semis ni un peuplement à maturité. Le reste — quelle essence, et jusqu'où
 * elle monte — vient de `Paysage.semenciers` et de `hauteurMaxM`. Le premier
 * jet tirait la hauteur d'un `6 + hasard * 10` qui ne venait de rien, et
 * dessinait donc la même chose autour d'une lande et autour d'une hêtraie.
 */
export const PART_DE_MATURITE = { min: 0.45, max: 0.85 };

/**
 * La plus haute masse de décor possible, m.
 *
 * **Exportée pour que la découpe du décor puisse en tenir compte**, et
 * vérifiée à l'endroit qui la produit : un morceau dont le sol passe au-dessus
 * du bord de l'écran garde ses masses dans le cadre — puisqu'une masse se
 * dessine vers le haut depuis son pied. Sans cette borne, la découpe rognait
 * une bande de décor en haut de l'image.
 *
 * Le plus haut des deux dessins qui montent : la levée d'une canopée
 * (`LEVEE_LA_PLUS_HAUTE_M`, plus son ondulation de cimes) et un bâtiment
 * (6,5 m au plus). Le contrôle dans `masseDeLaCase` garantit qu'ils ne
 * dérivent pas sans que la découpe le sache.
 */
export const MASSE_LA_PLUS_HAUTE_M = 9;

/**
 * La part BOISÉE et la part BÂTIE à un point du décor, atténuation comprise.
 *
 * Extraite parce que deux dessins en ont besoin et qu'il ne doit y en avoir
 * qu'une formule : la canopée (une surface continue) et les bâtiments (des
 * objets dénombrables). Le premier jet la recopiait dans `masseDeLaCase`.
 *
 * Rend 0 dans la parcelle : ce n'est pas du décor.
 */
export function couvertureDuDecor(
  bordures: DecorBordures,
  x: number,
  y: number,
  coteM: number,
): { boise: number; bati: number } {
  const distance = distanceAuBord(x, y, coteM);
  if (distance <= 0) return { boise: 0, bati: 0 };
  const w = poidsDesCotes(x, y, coteM);
  const part = (f: (c: CoteDecor) => number): number =>
    f(bordures.nord) * w.nord +
    f(bordures.est) * w.est +
    f(bordures.sud) * w.sud +
    f(bordures.ouest) * w.ouest;
  const reste = 1 - attenuation(distance);
  // Le grumeau groupe : il ne change pas la part moyenne, seulement où elle
  // tombe. Un pays boisé a des bois et des clairières, pas un semis régulier.
  const groupe = 1 + (grumeau(x, y) - 0.5) * 2 * FORCE_GRUMEAU;
  return {
    boise: Math.min(1, Math.max(0, part((c) => c.boise) * groupe)) * reste,
    bati: Math.min(1, Math.max(0, part((c) => c.urbain) * groupe)) * reste,
  };
}

/**
 * Côté du peuplement : sur quelle étendue le décor garde la même essence.
 *
 * La maille du grumeau, et pour la même raison : c'est elle qui décide où sont
 * les bois. Tirer l'essence plus finement donnerait une canopée bariolée
 * cellule par cellule — du bruit de couleur, pas des peuplements.
 */
export const MAILLE_PEUPLEMENT_M = 26;

/**
 * La CANOPÉE à un point du décor : sa couverture, sa hauteur, son essence.
 *
 * **C'est l'unité de dessin juste du hors-parcelle boisé, et il a fallu cinq
 * essais pour y venir.** Le §0 de ce fichier le disait pourtant depuis le
 * début : « de loin, une forêt n'a pas d'arbres, elle a une lisière et une
 * surface. » Le dessin, lui, en faisait des BOSQUETS dénombrables, et aucun
 * réglage ne pouvait corriger ça :
 *
 * 1. rayon 2–5 m, hauteur inventée (`6 + hasard × 10`) : des ovales isolés
 *    d'un seul aplat — des TACHES, et c'est le défaut signalé par le
 *    commanditaire ;
 * 2. rayon = 0,38 × hauteur, hauteur de l'essence : des boules de vingt mètres
 *    à peine recouvrantes — un ÉBOULIS DE GALETS, pire, puisque des objets de
 *    la taille d'un arbre du joueur réclament son attention ;
 * 3. retour au rayon d'une cime avec la hauteur de l'essence : des QUILLES, un
 *    hêtre de trente mètres tenant dans quatre mètres de large ;
 * 4. rayon dérivé d'un aplatissement voulu : des NÉNUPHARS qui se chevauchent,
 *    encore dénombrables un par un ;
 * 5. modelé presque supprimé pour qu'ils ne ressortent plus : les taches du
 *    départ, en plus large.
 *
 * Les cinq échouent de la même façon parce qu'ils partagent la même erreur —
 * un bois dessiné comme une collection d'objets. Une SURFACE n'a pas ce
 * problème : elle n'a pas de contour à compter, elle a une altitude et un
 * bord. C'est la même leçon que le bois mort au sol, qui a demandé six essais
 * avant qu'on cesse de dessiner des tas et qu'on trace une ligne.
 *
 * La hauteur est celle de l'essence du peuplement (`hauteurMaxM`, moteur) et
 * elle s'annule à la lisière avec la couverture : le bord d'un bois est donc
 * une PENTE et non un mur, ce qui est ce qu'on voit d'une lisière.
 */
export function canopee(
  bordures: DecorBordures,
  x: number,
  y: number,
  coteM: number,
): { couverture: number; hauteurM: number; especeId?: string } {
  const couverture = couvertureDuDecor(bordures, x, y, coteM).boise;
  if (couverture <= 0) return { couverture: 0, hauteurM: 0 };
  // **L'ESSENCE est celle du peuplement, la HAUTEUR est continue**, et cette
  // dissymétrie est une correction. Tirer les deux par peuplement donnait à
  // chaque maille de vingt-six mètres son propre plateau d'altitude, et les
  // quads qui enjambaient deux peuplements formaient des rampes : le décor
  // sortait en FACETTES, un paysage de cristal. Une lisière de couleur entre
  // deux peuplements est juste — deux essences voisines ne se mélangent pas —
  // mais une marche d'altitude ne l'est pas.
  const px = Math.floor(x / MAILLE_PEUPLEMENT_M);
  const py = Math.floor(y / MAILLE_PEUPLEMENT_M);
  const especeId = especeDuBois(bordures, x, y, coteM, hacher(px, py, 0x1f7b));
  const hauteurMax = especeId ? getEspece(especeId)?.hauteurMaxM : undefined;
  const maturite =
    PART_DE_MATURITE.min +
    bruitLisse(x, y, MAILLE_PEUPLEMENT_M, 0x8ac1) * (PART_DE_MATURITE.max - PART_DE_MATURITE.min);
  const pleine = hauteurMax !== undefined ? hauteurMax * maturite : HAUTEUR_BOIS_ANONYME_M;
  // La bosse des cimes : c'est elle qui fait qu'une canopée n'est pas un
  // plateau. À l'échelle d'un houppier, donc de la dizaine de mètres — plus
  // fin, on retomberait sur des arbres qu'on peut compter, ce que cinq essais
  // ont déjà montré être la mauvaise unité.
  const bosse = 1 + (bruitLisse(x, y, MAILLE_DES_CIMES_M, 0x63a7) - 0.5) * 2 * AMPLITUDE_DES_CIMES;
  return {
    couverture,
    // **La levée est PLAFONNÉE, et c'est la dernière correction de la série.**
    // Dessinée à sa hauteur vraie, une canopée de trente mètres présente au
    // bord du bois une jupe de cent dix pixels d'un seul ton : la capture
    // sortait en FACETTES de cristal, un paysage de plaques. Le remède n'est
    // pas de texturer ce mur — c'est du décor, il ne mérite pas ce travail —
    // mais de ne pas le dresser. Un bois voisin se lit très bien comme une
    // surface un peu SOULEVÉE, grainée, de la couleur de son essence ; sa
    // hauteur vraie n'apporte rien au joueur et coûte un mur autour de sa
    // parcelle, ce qui est l'exact contraire de « rester hors du focus ».
    //
    // Ce qui survit du plafonnement, c'est l'ORDRE : une haie d'épine noire se
    // soulève de trois mètres, un massif de hêtres du maximum. Et la couleur,
    // elle, reste celle de l'essence — c'est là qu'est la cohérence avec le
    // paysage choisi, pas dans l'altitude.
    hauteurM: Math.min(pleine, LEVEE_LA_PLUS_HAUTE_M) * couverture * bosse,
    ...(especeId ? { especeId } : {}),
  };
}

/**
 * De combien une canopée se soulève au plus, m.
 *
 * Sept mètres : assez pour que la lisière porte une ombre lisible et que le
 * bois ne soit pas un aplat, pas assez pour dresser un mur. C'est aussi ce qui
 * borne `MASSE_LA_PLUS_HAUTE_M`, donc la marge de découpe du décor.
 */
export const LEVEE_LA_PLUS_HAUTE_M = 7;

/**
 * De combien chaque morceau de décor déborde pour dessiner la canopée, m.
 *
 * Une canopée soulevée de `h` mètres se projette à l'écran là où le SOL de
 * (x + h, y + h) se projette — un mètre de levée vaut un mètre sur chaque axe,
 * puisque `METRE_VERTICAL_PX` et `TUILE_HAUTEUR_PX` sont égaux. Un morceau doit
 * donc redessiner la canopée jusqu'à une levée maximale au-delà de ses bords,
 * sinon sa nappe opaque efface celle de son voisin et le hors-parcelle sort en
 * grillage. Les quatre côtés, parce que la caméra tourne.
 */
export const DEBORD_CANOPEE_M = 9;

/** Échelle de la bosse des cimes sur la canopée, m. */
export const MAILLE_DES_CIMES_M = 11;
/** De combien les cimes font onduler la canopée, en part de sa hauteur. */
export const AMPLITUDE_DES_CIMES = 0.16;

/** Hauteur d'un bois dont le paysage ne déclare aucune essence, m. */
export const HAUTEUR_BOIS_ANONYME_M = 9;

/**
 * En dessous de quoi on ne dessine pas de canopée, m.
 *
 * Une canopée d'un demi-mètre n'est pas un bois, c'est du bruit sur la nappe :
 * elle coûterait deux tracés par quad pour un demi-pixel d'écart. Le seuil
 * n'efface aucun bois — il efface la frange où la couverture tend vers zéro,
 * et la teinte de la nappe y dit déjà « c'est un peu boisé par ici ».
 */
export const CANOPEE_LA_PLUS_BASSE_M = 1.5;

/**
 * Contraste de la canopée avec la nappe sur laquelle elle se pose.
 *
 * Plus bas que celui des masses (0,44) : une canopée couvre de GRANDES
 * surfaces, là où un bâtiment est un point. À contraste égal, le hors-parcelle
 * boisé deviendrait la chose la plus visible de l'image — l'inverse de ce que
 * le décor doit faire.
 */
export const CONTRASTE_CANOPEE = 0.34;

/** Facteur de clarté du sous-bois : la face verticale d'une lisière. */
export const SOUS_BOIS = 0.72;

/**
 * Part du grain du sol reprise par la canopée.
 *
 * Plus marquée que celle de la nappe (0,6) : une surface parfaitement lisse
 * se lit comme du plastique, et c'est ce grain-là qui fait lire du feuillage
 * sans qu'on puisse compter les arbres — c'est-à-dire ce que les cinq essais
 * en bosquets cherchaient à obtenir par la silhouette.
 */
export const GRAIN_CANOPEE = 1.4;

/**
 * Les masses d'une case du décor : au plus une, tirée selon les parts du côté.
 *
 * Une case et une masse : c'est ce qui garantit qu'elles ne se recouvrent pas
 * en tas et qu'elles restent dénombrables sans trier. Leur taille et leur
 * position dans la case sortent du hachage, donc rien ne bouge d'une image à
 * l'autre — la règle est la même que pour le tapis, et pour la même raison.
 *
 * La densité décroît avec la distance : au fond, la brume aurait de toute façon
 * effacé les masses, autant ne pas les cuire.
 */
export function masseDeLaCase(
  bordures: DecorBordures,
  ix: number,
  iy: number,
  coteM: number,
): MasseDecor | undefined {
  const x = ix * MAILLE_MASSE_M + MAILLE_MASSE_M / 2;
  const y = iy * MAILLE_MASSE_M + MAILLE_MASSE_M / 2;
  const { bati } = couvertureDuDecor(bordures, x, y, coteM);
  // Le tirage décide s'il y a un bâtiment ici, ce qui donne exactement la part
  // urbaine que le paysage annonce.
  //
  // **Ni bois ni culture, et les deux ont la même raison.** Une culture n'a pas
  // de volume — un champ est une surface, et `teinteDuCote` le dit déjà ; le
  // premier jet en semait, et elles sortaient en barres pâles comme des
  // rayures. Un BOIS non plus n'est pas un objet : il a une lisière et une
  // surface, et cinq essais à le dessiner en bosquets dénombrables ont fini par
  // le démontrer (voir `canopee`). Ne reste dans les masses que ce qui est
  // vraiment un objet posé sur le sol, et qui se compte : un bâtiment.
  if (hacher(ix, iy, 0x2f11) >= bati) return undefined;

  const grand = hacher(ix + 7, iy + 3, 0x8ac1);
  const jx = hacher(ix, iy + 11, 0x51d3);
  const jy = hacher(ix + 5, iy, 0x77b9);
  const hauteurM = 3.5 + grand * 3;
  const rayonM = 2 + grand * 1.5;
  // `MASSE_LA_PLUS_HAUTE_M` borne les deux dessins hauts du décor — les
  // bâtiments et la canopée ; l'y confronter ici évite qu'ils dérivent sans que
  // la découpe le sache.
  if (hauteurM > MASSE_LA_PLUS_HAUTE_M) throw new Error("masse plus haute que la borne");
  return {
    x: x + (jx - 0.5) * MAILLE_MASSE_M * 0.6,
    y: y + (jy - 0.5) * MAILLE_MASSE_M * 0.6,
    masse: "bati",
    rayonM,
    hauteurM,
  };
}

/**
 * Quelle essence pousse ici, tirée des `semenciers` des côtés qui portent.
 *
 * Les quatre côtés sont mélangés au prorata de leur poids géométrique — le
 * même `poidsDesCotes` qui décide déjà des parts — puis du `semisParAn` de
 * chaque essence. Un coin nord-est reçoit donc les essences du nord et de
 * l'est, ce qui est la lecture juste d'un angle de parcelle.
 *
 * Rend `undefined` quand aucun côté ne déclare d'essence : le décor reste
 * alors sur son bois générique, et c'est mieux que de tirer une essence que le
 * paysage ne porte pas.
 */
export function especeDuBois(
  bordures: DecorBordures,
  x: number,
  y: number,
  coteM: number,
  tirage: number,
): string | undefined {
  const w = poidsDesCotes(x, y, coteM);
  const poids = new Map<string, number>();
  let total = 0;
  for (const [cote, part] of [
    [bordures.nord, w.nord],
    [bordures.est, w.est],
    [bordures.sud, w.sud],
    [bordures.ouest, w.ouest],
  ] as const) {
    if (part <= 0) continue;
    for (const e of cote.especes ?? []) {
      const p = e.poids * part;
      poids.set(e.especeId, (poids.get(e.especeId) ?? 0) + p);
      total += p;
    }
  }
  if (total <= 0) return undefined;
  let reste = tirage * total;
  for (const [especeId, p] of poids) {
    reste -= p;
    if (reste <= 0) return especeId;
  }
  // Les arrondis flottants peuvent laisser un reste positif d'un cheveu.
  return [...poids.keys()].at(-1);
}

/**
 * Toutes les masses d'une emprise du décor, dans l'ordre du peintre.
 *
 * L'emprise est donnée en mètres de parcelle et peut être négative — c'est
 * justement le dehors qu'on cuit.
 */
export function massesDuDecor(
  bordures: DecorBordures,
  coteM: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): MasseDecor[] {
  const i0 = Math.floor(x0 / MAILLE_MASSE_M);
  const i1 = Math.ceil(x1 / MAILLE_MASSE_M);
  const j0 = Math.floor(y0 / MAILLE_MASSE_M);
  const j1 = Math.ceil(y1 / MAILLE_MASSE_M);
  const sortie: MasseDecor[] = [];
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const m = masseDeLaCase(bordures, i, j, coteM);
      if (m) sortie.push(m);
    }
  }
  sortie.sort((a, b) => a.x + a.y - (b.x + b.y));
  return sortie;
}

/**
 * Couleur d'une masse : sa matière, mais rapprochée du fond sur lequel elle se
 * pose.
 *
 * **C'est le contraste écrasé de la règle 2.** Une masse boisée peinte à sa
 * vraie valeur ferait une tache noire à côté d'une parcelle en friche claire,
 * et l'œil irait droit dessus. On la ramène donc vers le fond du décor, d'autant
 * plus qu'elle est loin.
 *
 * Le premier jet gardait 55 % de la matière SANS lui appliquer le retrait de
 * clarté du décor : la capture montrait une nappe sourde CONSTELLÉE de taches
 * plus claires, un motif de peau de vache, aussi accrocheur que ce qu'on
 * voulait éviter. En faisant passer la masse par la même chaîne que la nappe,
 * la moitié suffit — et elle dit ce qu'elle doit dire, « c'est boisé de ce
 * côté-là », sans qu'on puisse compter les bosquets.
 */
export function couleurMasse(
  masse: Masse,
  fond: Teinte,
  distanceM: number,
  contraste = 0.44,
  especeId?: string,
): Teinte {
  // **La matière d'un bois est celle de son essence, quand on la connaît.**
  // `BOIS` reste le repli d'un bois anonyme ; mais un massif de pins n'a pas la
  // couleur d'une hêtraie, et le paysage du moteur dit lequel est là. La fiche
  // graphique porte déjà cette teinte pour les arbres de la parcelle : la
  // reprendre ici, c'est une source de vérité et non deux.
  const propre = especeId ? ficheDe(especeId)?.couleurs.ete : undefined;
  const matiere = propre ?? (masse === "bois" ? BOIS : masse === "bati" ? BATI : CULTURE);
  const gris = (matiere.r + matiere.g + matiere.b) / 3;
  const terne = melange(matiere, { r: gris, g: gris, b: gris }, DESATURATION);
  // La masse passe par la MÊME chaîne que la nappe — désaturation, retrait
  // d'un ton, brume — sinon elle dérive par rapport au fond sur lequel elle se
  // pose : un fond assombri sous une masse qui ne l'est pas donnait des dômes
  // qui s'éclaircissaient à mesure qu'on éteignait le décor.
  const sombre = {
    r: terne.r * OMBRE_DU_DECOR,
    g: terne.g * OMBRE_DU_DECOR,
    b: terne.b * OMBRE_DU_DECOR,
  };
  const noyee = melange(sombre, BRUME, attenuation(distanceM));
  return melange(fond, noyee, contraste);
}

/**
 * Altitude de la lisière, lissée LE LONG du bord et non en travers.
 *
 * Sans lissage, le décor hérite du bruit de relief cellule par cellule de la
 * parcelle : échantillonné tous les quatre mètres, ce bruit se lit en terrasses,
 * et le décor se striait de longs traits réguliers.
 *
 * Mais lisser dans les deux directions casserait la continuité : sur un versant
 * à 10 %, une moyenne sur ±5 m ramène la lisière neuf centimètres en dessous de
 * la cellule du bord, et il apparaît une MARCHE tout autour de la parcelle —
 * précisément le plateau flottant qu'on cherche à supprimer.
 *
 * On ne lisse donc que dans la direction où l'on n'a pas débordé : au nord de
 * la parcelle, on moyenne le long de la rangée nord, jamais en travers. La
 * valeur au contact reste exactement celle du bord, et seul le bruit latéral
 * disparaît. Dans un coin, les deux directions ont débordé : il n'y a plus qu'à
 * prendre la cellule du coin.
 */
export const LISSAGE_LISIERE_M = 5;

function lisiereLissee(altitudesM: readonly number[], coteM: number, x: number, y: number): number {
  const bx = Math.min(coteM - 1, Math.max(0, Math.floor(x)));
  const by = Math.min(coteM - 1, Math.max(0, Math.floor(y)));
  const deborde = (v: number): boolean => v < 0 || v >= coteM;
  const libreX = !deborde(x);
  const libreY = !deborde(y);
  if (!libreX && !libreY) return altitudesM[by * coteM + bx] ?? 0;
  let somme = 0;
  let n = 0;
  for (let d = -LISSAGE_LISIERE_M; d <= LISSAGE_LISIERE_M; d++) {
    const cx = libreX ? Math.min(coteM - 1, Math.max(0, bx + d)) : bx;
    const cy = libreY ? Math.min(coteM - 1, Math.max(0, by + d)) : by;
    somme += altitudesM[cy * coteM + cx] ?? 0;
    n++;
  }
  return n === 0 ? 0 : somme / n;
}

/**
 * Pente moyenne de la parcelle, en mètres par mètre : (dz/dx, dz/dy).
 *
 * Ajustée par moindres carrés sur un échantillon régulier — autrement dit le
 * plan qui approche le mieux le terrain. C'est la seule chose que le moteur
 * permette de dire du dehors : si la parcelle descend vers le sud à 12 %, le
 * pays autour descend vers le sud à 12 %.
 */
export function penteMoyenne(altitudesM: readonly number[], coteM: number): [number, number] {
  const pas = Math.max(1, Math.floor(coteM / 24));
  let n = 0;
  let sx = 0;
  let sy = 0;
  let sz = 0;
  let sxx = 0;
  let syy = 0;
  let sxz = 0;
  let syz = 0;
  for (let y = 0; y < coteM; y += pas) {
    for (let x = 0; x < coteM; x += pas) {
      const z = altitudesM[y * coteM + x] ?? 0;
      n++;
      sx += x;
      sy += y;
      sz += z;
      sxx += x * x;
      syy += y * y;
      sxz += x * z;
      syz += y * z;
    }
  }
  if (n === 0) return [0, 0];
  // Les deux axes sont indépendants sur une grille régulière : pas de terme
  // croisé à inverser, deux régressions simples suffisent.
  const varX = sxx - (sx * sx) / n;
  const varY = syy - (sy * sy) / n;
  const covX = sxz - (sx * sz) / n;
  const covY = syz - (sy * sz) / n;
  return [varX === 0 ? 0 : covX / varX, varY === 0 ? 0 : covY / varY];
}

/**
 * Altitude du décor en un point hors parcelle.
 *
 * **C'est ce qui empêche le plateau de flotter, et il n'y a rien à inventer.**
 * Le moteur ne connaît d'altitudes que dans la parcelle. Au bord, on prolonge
 * donc la valeur de la lisière — la continuité est exacte, sans marche. Au-delà,
 * on continue selon la PENTE MOYENNE de la parcelle.
 *
 * **Prolonger la pente, et non retomber vers la moyenne.** Le premier jet
 * faisait l'inverse, en se disant qu'on ne sait rien du lointain et qu'une
 * plaine ne prétend rien. La capture a montré ce que ça donne sur un versant à
 * 12 % : une cuvette concentrique tout autour de la parcelle, en terrasses, un
 * gâteau de mariage. Or « ne rien prétendre » n'existe pas ici — poser une
 * plaine autour d'un versant est une affirmation, et une affirmation fausse.
 * Prolonger la pente est la lecture neutre : le pays continue comme il est.
 */
export function altitudeDecor(
  altitudesM: readonly number[],
  coteM: number,
  moyenneM: number,
  x: number,
  y: number,
  pente?: [number, number],
): number {
  const lisiere = lisiereLissee(altitudesM, coteM, x, y);
  const [dzdx, dzdy] = pente ?? penteMoyenne(altitudesM, coteM);
  // Le débordement, c'est-à-dire de combien on est sorti de la parcelle.
  const dx = x < 0 ? x : x > coteM ? x - coteM : 0;
  const dy = y < 0 ? y : y > coteM ? y - coteM : 0;
  // `moyenneM` reste dans la signature : c'est le repli quand la parcelle est
  // trop petite pour qu'une pente ait un sens.
  const base = Number.isFinite(lisiere) ? lisiere : moyenneM;
  return base + dzdx * dx + dzdy * dy;
}

/** Altitude moyenne de la parcelle. Le niveau du pays autour. */
export function altitudeMoyenneParcelle(altitudesM: readonly number[], coteM: number): number {
  let somme = 0;
  let n = 0;
  const pas = Math.max(1, Math.floor(coteM / 24));
  for (let y = 0; y < coteM; y += pas) {
    for (let x = 0; x < coteM; x += pas) {
      somme += altitudesM[y * coteM + x] ?? 0;
      n++;
    }
  }
  return n === 0 ? 0 : somme / n;
}
