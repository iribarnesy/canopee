/**
 * La palette du sol : de ce que le moteur sait d'une cellule à sa couleur
 * (docs/interface-visuelle.md §4).
 *
 * **Le problème que ce module résout, et il est le premier de la liste.** La
 * pointe technique du lot L0 dessinait le sol en huit niveaux de brun, tirés de
 * l'humidité seule : une carte de debug, pas un sol de forêt. Sur la capture,
 * cinq mille tiges poussaient sur du sable. Or le moteur sait beaucoup mieux
 * que ça — il tient la couverture herbacée, la biomasse sur pied, la litière et
 * l'humidité par cellule. Une friche est verte parce que `soilHerbe` y est haut,
 * pas parce qu'on décide de la peindre en vert.
 *
 * **Trois couches qui se superposent**, dans cet ordre, et chacune vient d'une
 * grandeur qui voyage :
 *
 * 1. le **sol nu** : sa teinte suit l'humidité — une terre mouillée est sombre,
 *    une terre sèche pâlit. C'est vrai de tous les sols et c'est le seul indice
 *    visuel de l'eau qu'on ait sans dessiner de l'eau ;
 * 2. l'**herbe** : `soilHerbe` dit quelle part de la cellule elle couvre,
 *    `soilHerbeBiomasse` dans quel état elle est. Les deux ne disent pas la même
 *    chose et c'est tout l'intérêt — le foin sur pied de juillet est jaune et
 *    abondant là où la couverture a déjà chuté ;
 * 3. la **litière** : le tapis de feuilles de novembre, le paillage d'un broyat
 *    frais. Elle passe PAR-DESSUS l'herbe et la masque quand elle est épaisse.
 *
 * **La saison décale l'ensemble**, à partir de la semaine de l'année — pas de la
 * phénologie. `Snapshot.pheno` est un calendrier par ESPÈCE, fait pour colorer
 * un houppier ; le sol, lui, n'a pas d'espèce. `week % 52` est exact, gratuit,
 * et suffit.
 *
 * **Tout est quantifié.** Une cellule dont l'humidité bouge d'un centième ne
 * doit pas invalider le morceau de terrain qui la contient, sinon on recuit
 * dix mille tuiles par semaine et le jeu rame à ×512 (§3). D'où `NIVEAUX` : les
 * grandeurs continues sont ramenées à huit paliers AVANT de devenir des
 * couleurs, et deux semaines qui tombent dans le même palier donnent la même
 * image — donc aucun travail.
 *
 * Module **pur** : pas de canvas, pas de DOM, aucun état.
 */

/** Paliers de quantification d'une grandeur continue du sol (§3). */
export const NIVEAUX = 8;

/**
 * Ramène une grandeur ∈ [0,1] à un entier de palier ∈ [0, NIVEAUX−1].
 *
 * C'est la seule chose qui empêche le cache de morceaux de ne servir à rien.
 * Le palier, et non la valeur, est ce qui entre dans la signature d'un morceau.
 */
export function palier(valeur: number, niveaux = NIVEAUX): number {
  const borne = Math.min(1, Math.max(0, valeur));
  return Math.min(niveaux - 1, Math.floor(borne * niveaux));
}

/** Ramène un palier au milieu de sa tranche, pour interpoler une couleur. */
export function valeurDuPalier(p: number, niveaux = NIVEAUX): number {
  return (p + 0.5) / niveaux;
}

export interface Teinte {
  r: number;
  g: number;
  b: number;
}

export function versCss(t: Teinte): string {
  return `rgb(${Math.round(t.r)} ${Math.round(t.g)} ${Math.round(t.b)})`;
}

/** Entier 0xRRGGBB, la forme que Pixi attend. */
export function versEntier(t: Teinte): number {
  return (
    (Math.round(Math.min(255, Math.max(0, t.r))) << 16) |
    (Math.round(Math.min(255, Math.max(0, t.g))) << 8) |
    Math.round(Math.min(255, Math.max(0, t.b)))
  );
}

/** Mélange linéaire : `part` = 0 rend `a`, 1 rend `b`. */
export function melange(a: Teinte, b: Teinte, part: number): Teinte {
  const t = Math.min(1, Math.max(0, part));
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}

/** Éclaircit (facteur > 1) ou assombrit (< 1) sans dériver en teinte. */
export function eclairer(t: Teinte, facteur: number): Teinte {
  return { r: t.r * facteur, g: t.g * facteur, b: t.b * facteur };
}

// ── Les ancres de la palette ────────────────────────────────────────────────
// Choisies pour deux contraintes, dont l'une vient d'une capture : le sol NE
// PEUT PAS être clair, sinon le fût blanc du bouleau disparaît dessus (L0, §4).
// Toutes ces valeurs restent donc dans les tons moyens à sombres.

/** Terre sèche : ressuyée, elle pâlit et tire vers l'ocre gris. */
const SOL_SEC: Teinte = { r: 124, g: 110, b: 84 };
/**
 * Terre mouillée : elle fonce, c'est l'indice le plus lisible de l'eau.
 *
 * L'écart avec la terre sèche est volontairement MODÉRÉ. Le premier jet allait
 * de 150 à 74 en clarté, soit un rapport deux, et le résultat était un motif de
 * camouflage : l'humidité varie d'une cellule à l'autre, et un contraste fort
 * sur une grandeur bruitée fait du bruit, pas du relief.
 */
const SOL_MOUILLE: Teinte = { r: 92, g: 76, b: 58 };

/** Herbe de printemps : vert franc, un peu bleuté, la pousse tendre. */
const HERBE_PRINTEMPS: Teinte = { r: 106, g: 140, b: 72 };
/** Herbe d'été mûre : elle jaunit sur pied avant même de manquer d'eau. */
const HERBE_ETE: Teinte = { r: 138, g: 148, b: 78 };
/** Foin sec : la biomasse reste, la chlorophylle est partie. */
const HERBE_PAILLE: Teinte = { r: 178, g: 160, b: 104 };
/** Herbe d'hiver : elle ne meurt pas sous nos latitudes, elle se ternit. */
const HERBE_HIVER: Teinte = { r: 104, g: 116, b: 88 };

/**
 * Litière de feuilles : brun-roux chaud, la couleur de novembre en forêt.
 *
 * Volontairement PROCHE en clarté du sol et de l'herbe. Le premier jet la
 * mettait à 124/92/58, franchement plus sombre et plus rouge : combinée à une
 * terre sèche pâle et à une herbe verte, elle donnait trois familles de tons à
 * égalité, et le sol lisait comme un motif de camouflage. Un sol de forêt est
 * une seule famille de tons avec des variations — pas trois couleurs qui se
 * disputent la même valeur.
 */
const LITIERE: Teinte = { r: 116, g: 94, b: 62 };

/**
 * Litière au-delà de laquelle le tapis est jugé plein, gC/m².
 *
 * **600, et le premier chiffre était faux d'un facteur quatre.** J'avais retenu
 * 150 en raisonnant sur UNE chute de feuilles annuelle (~3 t de matière sèche
 * par hectare). Mesuré sur une friche à l'an 30, la litière fait 180 gC/m² en
 * MOYENNE et monte à 3 100 sous les fourrés : le stock accumulé n'est pas la
 * chute d'une année. À 150, presque chaque cellule saturait, et le sol sortait
 * uniformément brun — l'erreur se voyait comme un défaut de palette alors
 * qu'elle était dans l'échelle.
 *
 * C'est un plafond VISUEL : au-delà on ne voit plus le sol, ce qui est vrai
 * d'un tapis de feuilles épais *(à calibrer sur des mesures de litière)*.
 */
export const LITIERE_PLEINE_CG = 600;

/**
 * Avancement de l'année ∈ [0,1[ : 0 au 1ᵉʳ janvier, 0,5 début juillet.
 *
 * La semaine 0 du moteur est bien début janvier — `contextePhenologique` place
 * le solstice d'été en semaine 25 et le début de sénescence en semaine 40.
 */
export function phaseAnnuelle(semaineAnnee: number): number {
  return (((semaineAnnee % 52) + 52) % 52) / 52;
}

/**
 * Couleur de l'herbe à une saison donnée, pour une biomasse donnée.
 *
 * Deux commandes, et il faut les deux : la SAISON dit vers quoi la teinte tire,
 * la BIOMASSE dit si l'herbe est verte ou couchée en foin. Une prairie rase de
 * juillet est verte, un foin de juillet est jaune — même semaine, même station.
 */
export function couleurHerbe(semaineAnnee: number, biomasse: number): Teinte {
  const phase = phaseAnnuelle(semaineAnnee);
  // Un cycle simple : hiver → printemps → été → hiver, calé sur les repères que
  // le moteur utilise déjà (solstice en semaine 25, sénescence en semaine 40).
  let saisonniere: Teinte;
  if (phase < 0.15)
    saisonniere = HERBE_HIVER; // janvier–février
  else if (phase < 0.35) saisonniere = melange(HERBE_HIVER, HERBE_PRINTEMPS, (phase - 0.15) / 0.2);
  else if (phase < 0.55) saisonniere = melange(HERBE_PRINTEMPS, HERBE_ETE, (phase - 0.35) / 0.2);
  else if (phase < 0.8) saisonniere = melange(HERBE_ETE, HERBE_HIVER, (phase - 0.55) / 0.25);
  else saisonniere = HERBE_HIVER;
  // La biomasse tire vers le foin : c'est la matière sur pied qui a séché, et
  // elle se voit surtout quand il y en a beaucoup.
  const foin = Math.min(1, Math.max(0, biomasse)) ** 2;
  return melange(saisonniere, HERBE_PAILLE, 0.55 * foin);
}

/** Ce que le rendu lit d'une cellule pour la colorer. Tout vient de l'instantané. */
export interface CelluleSol {
  /** remplissage de la réserve utile ∈ [0,1] : `soilWater / ruMm` */
  humidite: number;
  /** couverture herbacée ∈ [0,1] : `soilHerbe` */
  herbe: number;
  /** biomasse herbacée ∈ [0,1] : `soilHerbeBiomasse` */
  herbeBiomasse: number;
  /** litière au sol, gC/m² : `soilLitiereCG` */
  litiereCG: number;
}

/** La même cellule, réduite à ses paliers. C'est ce qui entre dans le cache. */
export interface CelluleQuantifiee {
  humidite: number;
  herbe: number;
  herbeBiomasse: number;
  litiere: number;
}

export function quantifier(c: CelluleSol): CelluleQuantifiee {
  return {
    humidite: palier(c.humidite),
    herbe: palier(c.herbe),
    herbeBiomasse: palier(c.herbeBiomasse),
    litiere: palier(c.litiereCG / LITIERE_PLEINE_CG),
  };
}

/**
 * La couleur d'une cellule de sol, à partir de ses paliers et de la semaine.
 *
 * Prend la cellule QUANTIFIÉE et non la brute, exprès : c'est la garantie que
 * deux semaines qui ne changent pas de palier donnent exactement la même
 * couleur, donc que le cache de morceaux (§3) fonctionne. Passer la valeur
 * continue ici rendrait le cache inutile sans qu'on s'en aperçoive.
 */
export function couleurSol(q: CelluleQuantifiee, semaineAnnee: number): Teinte {
  const humidite = valeurDuPalier(q.humidite);
  const nu = melange(SOL_SEC, SOL_MOUILLE, humidite);

  const couverture = valeurDuPalier(q.herbe);
  const herbe = couleurHerbe(semaineAnnee, valeurDuPalier(q.herbeBiomasse));
  // La couverture n'est pas une opacité linéaire : une cellule à moitié
  // couverte lit déjà comme de l'herbe, parce que les touffes se voient de
  // loin et que la terre entre elles est à l'ombre. Le facteur est généreux
  // pour que l'herbe DOMINE la lecture — c'est elle qui donne à une friche sa
  // couleur, et une palette où trois familles de tons pèsent pareil ne lit pas.
  const avecHerbe = melange(nu, herbe, Math.min(1, 0.25 + couverture * 1.15));

  // La litière passe par-dessus tout : elle tombe SUR l'herbe. Jamais
  // complètement opaque, même à saturation — un tapis de feuilles laisse
  // toujours passer des touffes, et un brun plein tue la lecture du sol.
  const tapis = valeurDuPalier(q.litiere);
  return melange(avecHerbe, LITIERE, 0.45 * tapis);
}

// ── L'eau libre ─────────────────────────────────────────────────────────────
// Elle n'est PAS une couche du sol comme les autres : l'herbe et la litière se
// fondent l'une dans l'autre, une berge non. Un ruisseau de deux mètres de large
// interpolé sur un pavé disparaîtrait purement et simplement. L'eau se dessine
// donc à la cellule, par-dessus le sol, avec un bord franc.

/** Eau libre en été : verte, chargée, réfléchissant un ciel clair. */
const EAU_ETE: Teinte = { r: 74, g: 106, b: 104 };
/** Eau libre en hiver : plus froide, plus grise, moins d'algues. */
const EAU_HIVER: Teinte = { r: 84, g: 100, b: 116 };

/**
 * Débordement en dessous duquel on ne dessine RIEN, mm.
 *
 * **Le seuil manquait, et son absence peignait la parcelle entière en bleu.**
 * `soilDebordementMm` n'est pas une hauteur d'eau : c'est un FLUX hebdomadaire,
 * ce qui n'a pas pu rentrer dans le sol, ruissellement amont compris. Mesuré
 * sur une friche un janvier pluvieux : 93 mm à la médiane et 1 350 mm au point
 * bas — la parcelle entière « déborde » chaque semaine humide, et un rendu sans
 * seuil en concluait qu'elle était inondée. Le protocole dit à quoi cette grille
 * sert : « la crue, la lame d'eau, la ravine », c'est-à-dire des ÉVÉNEMENTS.
 *
 * 5 mm : cinq litres au mètre carré en une semaine, de quoi voir briller le sol
 * *(à calibrer)*.
 */
export const DEBORDEMENT_VISIBLE_MM = 5;

/**
 * Débordement au-delà duquel la lame d'eau est jugée pleine, mm.
 *
 * 120 mm : l'ordre de grandeur d'un talweg qui collecte son bassin sur une
 * semaine de pluie. Au-delà on ne voit plus le sol dessous *(à calibrer)*.
 */
export const DEBORDEMENT_PLEIN_MM = 120;

/** La couleur de l'eau libre à une saison donnée. */
export function couleurEau(semaineAnnee: number): Teinte {
  const phase = phaseAnnuelle(semaineAnnee);
  // Un cycle doux : l'eau suit la saison sans la précéder.
  const ete = Math.max(0, Math.sin((phase - 0.15) * Math.PI * 2 * 0.5 + Math.PI * 0.0));
  return melange(EAU_HIVER, EAU_ETE, Math.min(1, Math.max(0, ete)));
}

/**
 * La couleur d'une cellule inondée : le sol vu à travers une lame d'eau.
 *
 * Ce n'est pas de l'eau libre — c'est du sol noyé, et ça doit se lire comme tel.
 * D'où le mélange avec la couleur du sol plutôt qu'un aplat : on voit encore la
 * litière sous vingt millimètres d'eau, et c'est ce qui distingue une flaque
 * d'un étang.
 */
export function couleurInondee(sol: Teinte, debordementMm: number, semaineAnnee: number): Teinte {
  if (debordementMm < DEBORDEMENT_VISIBLE_MM) return sol;
  const part = Math.min(
    1,
    (debordementMm - DEBORDEMENT_VISIBLE_MM) / (DEBORDEMENT_PLEIN_MM - DEBORDEMENT_VISIBLE_MM),
  );
  return melange(sol, couleurEau(semaineAnnee), 0.75 * part);
}

/** Une cellule mérite-t-elle d'être dessinée comme mouillée ? */
export function estInondee(debordementMm: number): boolean {
  return debordementMm >= DEBORDEMENT_VISIBLE_MM;
}

/**
 * Signature d'une cellule quantifiée : deux cellules de même signature
 * donneront le même pixel. C'est la clé du cache, et elle doit être un ENTIER —
 * une chaîne coûterait une allocation par cellule et par semaine.
 */
export function signatureCellule(q: CelluleQuantifiee): number {
  return ((q.humidite * NIVEAUX + q.herbe) * NIVEAUX + q.herbeBiomasse) * NIVEAUX + q.litiere;
}
