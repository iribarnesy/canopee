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

import { melange, type Teinte } from "../palette";

/** Ce qu'on connaît d'un côté, sans dépendre du type `Paysage` du moteur. */
export interface CoteDecor {
  /** part boisée ∈ [0,1] */
  boise: number;
  /** part cultivée ∈ [0,1] */
  cultive: number;
  /** part urbanisée ∈ [0,1] */
  urbain: number;
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
  const u = x / MAILLE_GRUMEAU_M;
  const v = y / MAILLE_GRUMEAU_M;
  const i = Math.floor(u);
  const j = Math.floor(v);
  const fu = u - i;
  const fv = v - j;
  const doux = (t: number) => t * t * (3 - 2 * t);
  const su = doux(fu);
  const sv = doux(fv);
  const a = hacher(i, j, 0x4d2b);
  const b = hacher(i + 1, j, 0x4d2b);
  const c = hacher(i, j + 1, 0x4d2b);
  const d = hacher(i + 1, j + 1, 0x4d2b);
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
  const distance = distanceAuBord(x, y, coteM);
  if (distance <= 0) return undefined; // dans la parcelle : ce n'est pas du décor
  const w = poidsDesCotes(x, y, coteM);
  const part = (f: (c: CoteDecor) => number): number =>
    f(bordures.nord) * w.nord +
    f(bordures.est) * w.est +
    f(bordures.sud) * w.sud +
    f(bordures.ouest) * w.ouest;
  const boise = part((c) => c.boise);
  const urbain = part((c) => c.urbain);

  const reste = 1 - attenuation(distance);
  const tirage = hacher(ix, iy, 0x2f11);
  // Le grumeau groupe les masses au lieu de les éparpiller ; il ne change pas
  // combien il y en a, seulement où elles tombent.
  const groupe = 1 + (grumeau(x, y) - 0.5) * 2 * FORCE_GRUMEAU;
  const boiseIci = Math.min(1, Math.max(0, boise * groupe));
  const urbainIci = Math.min(1, Math.max(0, urbain * groupe));
  // Le tirage décide À LA FOIS s'il y a une masse et laquelle : une case reste
  // vide quand elle tombe au-delà de la somme des parts, ce qui donne
  // exactement la couverture que le paysage annonce.
  // **Pas de masse pour les cultures, et c'est une correction.** Le premier jet
  // en semait, écrasées et claires : sur la capture, elles sortaient en barres
  // pâles éparpillées, comme des rayures. Une culture n'a pas de volume — un
  // champ est une surface, et sa couleur le dit déjà dans `teinteDuCote`. Seul
  // ce qui DÉPASSE du sol mérite une masse : un bosquet, un bâtiment.
  const seuilBois = boiseIci * reste;
  const seuilBati = seuilBois + urbainIci * reste;
  let masse: Masse;
  if (tirage < seuilBois) masse = "bois";
  else if (tirage < seuilBati) masse = "bati";
  else return undefined;

  const grand = hacher(ix + 7, iy + 3, 0x8ac1);
  const jx = hacher(ix, iy + 11, 0x51d3);
  const jy = hacher(ix + 5, iy, 0x77b9);
  const rayonM = masse === "bois" ? 2 + grand * 3 : 2 + grand * 1.5;
  const hauteurM = masse === "bois" ? 6 + grand * 10 : 3.5 + grand * 3;
  return {
    x: x + (jx - 0.5) * MAILLE_MASSE_M * 0.6,
    y: y + (jy - 0.5) * MAILLE_MASSE_M * 0.6,
    masse,
    rayonM,
    hauteurM,
  };
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
): Teinte {
  const matiere = masse === "bois" ? BOIS : masse === "bati" ? BATI : CULTURE;
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
