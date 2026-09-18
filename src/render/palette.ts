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

import { facteurEauHerbacee, HERBACEES, type HerbaceeV0 } from "../engine/herbacees";

/**
 * L'herbacée dont le tapis porte le seuil d'eau.
 *
 * **Le dactyle, et ce n'est pas un choix du rendu.** Jusqu'au lot des
 * herbacées, la strate n'était qu'un taux de couverture et son facteur d'eau
 * vivait dans `couvertureMax` ; ce lot l'a remplacée par une fiche par espèce,
 * et son message dit laquelle porte l'héritage : « le tapis d'avant ce lot
 * était un dactyle qui s'ignorait, ses seuils sont repris tels quels de
 * `herbe.ts` ». Lire le seuil chez lui rend donc EXACTEMENT ce que le rendu
 * lisait avant — vérifié : l'ancienne `couvertureMax(1, x)` valait
 * `min(1, x / 0,35)`, et c'est le `seuilConfort` du dactyle.
 *
 * **Ce qui manque pour faire mieux**, et qui n'est pas au rendu de l'inventer :
 * l'instantané ne dit pas QUELLE espèce tient la cellule. Il porte une
 * couverture et une humidité, pas le partage de l'emprise. Le jour où il le
 * portera, la satisfaction se lira espèce par espèce — une anémone souffre à
 * 0,5 quand une molinie tient à 0,35, et la même cellule ne jaunit pas au même
 * moment selon qui l'occupe.
 */
const HERBACEE_DU_TAPIS = HERBACEES.find((h) => h.id === "dactylis_glomerata") ?? HERBACEES[0];

/**
 * La teinte de chaque herbacée, en pleine saison et bien nourrie.
 *
 * **C'est une décision de DESSIN, et c'est pour ça qu'elle est ici** : le
 * moteur ne dit pas de quelle couleur est une plante, et il n'a pas à le dire.
 * Mais elle n'est pas arbitraire pour autant — chacune se justifie de ce que la
 * fiche du moteur porte déjà, ou du nom même de l'espèce :
 *
 * - **Dactyle aggloméré** — `senescenceAutomnale: false`, `partPersistante: 1` :
 *   une touffe qui passe l'hiver verte. Le vert franc et un peu terne d'une
 *   graminée de prairie grossière, la couleur de référence du tapis jusqu'ici.
 * - **Molinie bleue** — *Molinia caerulea* : son épithète EST sa couleur. Un
 *   vert bleuté en saison, et `partPersistante: 0,25` avec
 *   `senescenceAutomnale: true` dit le reste — l'hiver, il ne reste que la
 *   touradon sèche, que le canal du foin et celui de la soif portent déjà.
 * - **Anémone des bois** — géophyte vernale (`finDJ: 500`,
 *   `partPersistante: 0`) d'ombre profonde (`compensation: 0,02`) : le vert
 *   tendre et clair d'un feuillage de sous-bois printanier, qui n'a jamais
 *   connu le plein soleil.
 *
 * Une espèce absente de cette table prend le vert du tapis : l'atlas
 * grandira, et une herbacée sans teinte doit se dessiner quand même plutôt que
 * de trouer le sol.
 */
const TEINTE_HERBACEE: Readonly<Record<string, Teinte>> = {
  dactylis_glomerata: { r: 106, g: 140, b: 72 },
  molinia_caerulea: { r: 96, g: 138, b: 104 },
  anemone_nemorosa: { r: 132, g: 166, b: 96 },
};

/** Les fiches par identifiant, résolues une fois. */
const FICHE_PAR_ID = new Map(HERBACEES.map((h) => [h.id, h]));

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

/**
 * Ramène un palier à une PART ∈ [0,1] qui atteint vraiment ses deux bouts.
 *
 * **À ne pas confondre avec `valeurDuPalier`, et la confusion se voyait.**
 * Celle-là rend le MILIEU d'une tranche, ce qui est juste pour interpoler une
 * couleur : entre deux teintes, la valeur représentative d'une bande est son
 * centre. Mais elle ne rend jamais ni 0 ni 1 — une grandeur nulle ressort à
 * une demi-tranche, une grandeur pleine à une demi-tranche du sommet.
 *
 * Pour une couleur, l'écart est invisible. Pour des MARQUES — des objets qu'on
 * sème ou qu'on ne sème pas — il ne l'est pas du tout : une pelouse annoncée à
 * 100 % de couverture gardait des plaques de terre nue, et une cellule sans la
 * moindre litière était semée de feuilles mortes. Les deux se voyaient sur le
 * banc de pelouse, et aucune ne venait de la donnée : elles venaient de la
 * façon de la lire. Une feuille est là ou n'est pas là ; il n'y a pas de demi-
 * tranche de feuille.
 */
export function partDuPalier(p: number, niveaux = NIVEAUX): number {
  if (niveaux <= 1) return 1;
  return Math.min(1, Math.max(0, p / (niveaux - 1)));
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
/**
 * Herbe d'été : un vert franc, et non le kaki d'avant.
 *
 * **Ce ton portait deux choses à la fois, et c'est ce qui ratait la pelouse.**
 * Il valait `138 148 78` — un olive déjà jauni — au motif que « l'herbe jaunit
 * sur pied avant même de manquer d'eau ». C'est vrai d'un PRÉ DE FAUCHE laissé
 * monter en graine ; ce n'est pas vrai d'un gazon ras et alimenté en eau, qui
 * reste vert tout l'été. Or le jaunissement sur pied a déjà son paramètre —
 * `HERBE_PAILLE`, commandé par la biomasse — si bien que le kaki le comptait
 * deux fois et qu'aucune combinaison de grandeurs ne rendait un vert de
 * pelouse : à couverture pleine et zoom rapproché, la capture montrait un tapis
 * kaki uniforme là où le retour demandait « une pelouse ».
 *
 * Le ton d'été redevient donc le vert de l'herbe QUI VA BIEN, et les deux
 * façons de la dégrader — monter en foin, griller de soif — sont dites chacune
 * par sa grandeur.
 */
const HERBE_ETE: Teinte = { r: 94, g: 132, b: 66 };

/**
 * Herbe GRILLÉE par la soif : rase, et brûlée jusqu'au collet.
 *
 * À ne pas confondre avec la paille, qui est de la matière sur pied ayant mûri
 * — haute, blonde, debout. Une pelouse qui grille reste rase et vire au brun
 * terne : c'est la couleur d'un gazon d'août sans arrosage.
 *
 * **La couleur est un choix de dessin ; le MOMENT où on l'applique ne l'est
 * pas.** C'est toute la différence avec la première tentative, qui décrétait
 * ici un seuil de réserve utile — voir `satisfactionEnEau`.
 */
const HERBE_GRILLEE: Teinte = { r: 142, g: 122, b: 78 };

/**
 * Foin sec : la biomasse reste, la chlorophylle est partie.
 *
 * Ramené de 178/160/104 à 164/152/104. Le foin est bien plus clair que l'herbe
 * verte, c'est vrai, mais la biomasse sur pied est une grandeur TRÈS
 * contrastée d'une cellule à l'autre — sous un fourré rien, dans une trouée
 * tout — et un écart de quarante niveaux de clarté sur une grandeur pareille
 * ressort en filaments pâles qui se lisent comme du lichen plutôt que comme un
 * pré. Même leçon que pour `SOL_MOUILLE`, et même remède : le contraste doit
 * être proportionné au BRUIT de la grandeur, pas à l'écart réel des matières.
 */
const HERBE_PAILLE: Teinte = { r: 164, g: 152, b: 104 };
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
 * Couleur de l'herbe à une saison donnée, pour une biomasse et une sécheresse
 * données.
 *
 * Deux commandes : la SAISON dit vers quoi la teinte tire, la BIOMASSE dit si
 * l'herbe est verte ou couchée en foin. Une prairie rase de juillet est verte,
 * un foin de juillet est blond — même semaine, même station.
 *
 * **Il en faudrait une troisième, et ce n'est PAS au rendu de la fabriquer.**
 * « Là où elle sèche on devrait voir une pelouse sèche » : c'est juste, et le
 * moteur sait déjà le dire — `herbe.ts` porte `humiditeVecue`, l'humidité de
 * l'horizon de SURFACE lissée sur environ six semaines, avec la justification
 * exacte du phénomène en commentaire (« un tapis ne jaunit pas en une semaine
 * sèche : il puise dans ses talles avant de griller — compter trois à quatre
 * semaines »). Cette grandeur n'est simplement pas dans l'instantané.
 *
 * J'avais commencé par la fabriquer ici, en décrétant un seuil de grillage sur
 * la réserve utile. C'était faux trois fois, et la troisième est la seule qui
 * compte :
 *
 * - faux de VALEUR — le moteur travaille à 0,35 de l'eau de surface, pas 0,42
 *   de la réserve du profil ;
 * - faux de GRANDEUR — le profil entier au lieu de l'horizon de surface, et
 *   sans inertie, alors que l'inertie est précisément ce qui fait qu'une herbe
 *   ne jaunit pas en une semaine ;
 * - faux de PRINCIPE — un seuil qui décide qu'une herbe souffre est une
 *   affirmation de MODÈLE. Le rendu n'en fait aucune. Et une teinte inventée
 *   pour compenser une donnée absente rend le manque permanent : plus personne
 *   ne voit qu'il manque quelque chose, puisque l'écran montre quelque chose.
 *
 * Le manque est donc porté par une issue moteur, pas par une constante ici. En
 * attendant, la sécheresse se lit par ce que le moteur donne DÉJÀ et que ce
 * module lit : la couverture recule — `couvertureMax` la rabat quand l'eau de
 * surface manque — donc le sol nu réapparaît entre les touffes.
 */
export function couleurHerbe(
  semaineAnnee: number,
  biomasse: number,
  herbeHumidite = 1,
  tapis?: MelangeDuTapis,
): Teinte {
  const phase = phaseAnnuelle(semaineAnnee);
  // **L'identité de l'espèce porte les deux verts, la saison porte l'écart.**
  // Le ton d'été est celui de printemps assombri du rapport EXACT que portent
  // les deux verts de référence : la saison décale donc pareil pour toutes les
  // espèces, et seule l'identité change. Sans ça, il aurait fallu deux teintes
  // par fiche, dont la seconde n'aurait rien dit de plus.
  const printemps = teinteDuTapis(tapis);
  const ete = {
    r: (printemps.r * HERBE_ETE.r) / HERBE_PRINTEMPS.r,
    g: (printemps.g * HERBE_ETE.g) / HERBE_PRINTEMPS.g,
    b: (printemps.b * HERBE_ETE.b) / HERBE_PRINTEMPS.b,
  };
  // Un cycle simple : hiver → printemps → été → hiver, calé sur les repères que
  // le moteur utilise déjà (solstice en semaine 25, sénescence en semaine 40).
  let saisonniere: Teinte;
  if (phase < 0.15)
    saisonniere = HERBE_HIVER; // janvier–février
  else if (phase < 0.35) saisonniere = melange(HERBE_HIVER, printemps, (phase - 0.15) / 0.2);
  else if (phase < 0.55) saisonniere = melange(printemps, ete, (phase - 0.35) / 0.2);
  else if (phase < 0.8) saisonniere = melange(ete, HERBE_HIVER, (phase - 0.55) / 0.25);
  else saisonniere = HERBE_HIVER;
  // La biomasse tire vers le foin : c'est la matière sur pied qui a séché, et
  // elle se voit surtout quand il y en a beaucoup.
  const foin = Math.min(1, Math.max(0, biomasse)) ** 2;
  const surPied = melange(saisonniere, HERBE_PAILLE, 0.55 * foin);
  // Puis la soif, par-dessus : elle grille ce qui reste, foin comme gazon. Un
  // pré déjà blond qui grille ne blondit pas davantage, il brunit.
  // **Le seuil de soif est celui des espèces PRÉSENTES**, pondéré par leur
  // emprise. Il était lu chez le dactyle pour toutes les cellules — exact tant
  // que le tapis était un dactyle qui s'ignorait, et il le reste pour la
  // molinie, dont la courbe est identique au millième. C'est l'anémone qui
  // s'en écarte : jusqu'à 0,257 de satisfaction, dans la bande d'humidité
  // 0,1–0,4 — les cellules d'ombre assez sèches, précisément là où elle vit.
  const soif = 1 - satisfactionEnEau(herbeHumidite, tapis);
  return melange(surPied, HERBE_GRILLEE, SOIF_LA_PLUS_BRUNE * soif);
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
  /**
   * Humidité VÉCUE par le tapis herbacé ∈ [0,1] : `soilHerbeHumidite`.
   *
   * Le remplissage de l'horizon de SURFACE, lissé sur ~6 semaines. Ce n'est ni
   * `soilWater` — la réserve du profil entier, instantanée — ni la couverture :
   * c'est la grandeur sur laquelle le moteur décide lui-même si une cellule
   * peut porter de l'herbe.
   *
   * **L'inertie compte autant que la valeur.** Un tapis ne jaunit pas en une
   * semaine sèche et ne reverdit pas sur une averse ; branchée sur l'humidité
   * instantanée, la couleur du gazon clignoterait à chaque pluie — ce que ce
   * lissage existe pour éviter, côté moteur comme côté écran.
   *
   * Absente = pas de tapis connu, on n'affirme aucune soif.
   */
  herbeHumidite?: number;
  /**
   * Qui occupe la cellule, et pour quelle part : `Snapshot.soilHerbeEmprises`
   * ramené en [0,1], dans l'ordre de `Snapshot.herbesIds`.
   *
   * Absent = on ne sait pas qui tient le terrain, et le tapis retombe sur
   * l'espèce de référence — ce qu'il faisait pour TOUTES les cellules avant ce
   * lot.
   */
  tapis?: MelangeDuTapis;
  /**
   * Lumière relative arrivant au sol ∈ [0,1] : `soilLumiere`.
   *
   * **C'est la grandeur qui manquait pour que ça ressemble à une forêt**, et
   * elle existait depuis le début : `computeGroundLight` la calcule à chaque
   * tick, le protocole la transporte, et le rendu ne la lisait pas. Sans elle,
   * le sol d'une futaie fermée est aussi clair que celui d'une clairière — et
   * l'ombre portée ne pouvait pas y suppléer, puisqu'elle SATURE à l'opacité
   * d'un seul arbre (`OPACITE_OMBRE`, voulu, pour éviter les puits d'encre).
   * Un couvert fermé ne pouvait donc jamais assombrir le sol de plus d'un tiers.
   *
   * Les deux mécanismes ne disent pas la même chose et se complètent : la tache
   * portée donne l'ombre DIRECTIONNELLE d'un houppier sur du sol dégagé, celle
   * qu'on lit pour savoir où le soleil tombe ; la lumière au sol donne
   * l'ambiance SOUS le couvert, celle qui décide de ce qui germe. La seconde
   * est de loin la plus fonctionnelle des deux — c'est elle qui commande
   * `couvertureMax` pour l'herbe et la régénération.
   *
   * Absent = pas de couvert connu, le sol est en pleine lumière.
   */
  lumiere?: number;
}

/** La même cellule, réduite à ses paliers. C'est ce qui entre dans le cache. */
export interface CelluleQuantifiee {
  humidite: number;
  herbe: number;
  herbeBiomasse: number;
  litiere: number;
  lumiere: number;
  herbeHumidite: number;
  /**
   * Qui tient la cellule — mêmes identifiants, emprises en PALIERS.
   *
   * Quantifié comme tout le reste : c'est le palier et non la valeur qui entre
   * dans la signature d'un morceau, sinon un centième d'emprise invaliderait
   * le cache de cuisson à chaque semaine.
   */
  tapis?: MelangeDuTapis;
}

export function quantifier(c: CelluleSol): CelluleQuantifiee {
  return {
    humidite: palier(c.humidite),
    herbe: palier(c.herbe),
    herbeBiomasse: palier(c.herbeBiomasse),
    litiere: palier(c.litiereCG / LITIERE_PLEINE_CG),
    lumiere: palier(c.lumiere ?? 1),
    herbeHumidite: palier(c.herbeHumidite ?? 1),
    ...(c.tapis ? { tapis: { ids: c.tapis.ids, parts: c.tapis.parts.map((p) => palier(p)) } } : {}),
  };
}

/**
 * De combien l'herbe assoiffée tire vers le brun, au pire.
 *
 * Un choix de dessin, comme `OPACITE_OMBRE` ou `COUVERT_LE_PLUS_SOMBRE` : il
 * répond à « une cellule dont le moteur dit que l'herbe manque d'eau, je la
 * peins comment ? ». Il ne répond PAS à « à partir de quand manque-t-elle
 * d'eau ? » — cette question-là appartient au moteur, et c'est celle que
 * j'avais répondue à sa place la première fois.
 */
export const SOIF_LA_PLUS_BRUNE = 0.72;

/**
 * Ce que vaut l'eau vécue par le tapis, en satisfaction ∈ [0,1].
 *
 * **La valeur vient du MOTEUR, par sa propre fonction.** `facteurEauHerbacee`
 * dit ce qu'une herbacée voit de son confort en eau ; on l'appelle au lieu de
 * recopier son seuil — recopier serait la seconde façon de se tromper, celle
 * que le §2.1 nomme : deux copies d'une règle dérivent, et personne ne le voit.
 * C'est d'ailleurs ce qui vient d'arriver dans l'autre sens : le moteur a
 * remplacé `couvertureMax` par une fiche par espèce, et le rendu ne l'a su
 * qu'en refusant de compiler — ce qui est la bonne façon de l'apprendre.
 *
 * **La première tentative faisait pire.** Elle décrétait ici un seuil sur la
 * réserve utile : faux de valeur (0,42 contre 0,35), faux de grandeur (le
 * profil entier au lieu de l'horizon de surface, et sans l'inertie qui est le
 * cœur du phénomène), et surtout faux de nature — un seuil qui décide qu'une
 * herbe souffre est une affirmation de modèle. Le manque est parti en issue, le
 * moteur y a répondu, et le rendu se contente maintenant de lire.
 */
export function satisfactionEnEau(herbeHumidite: number, tapis?: MelangeDuTapis): number {
  const h = Math.min(1, Math.max(0, herbeHumidite));
  const parts = partsUtiles(tapis);
  if (!parts) return HERBACEE_DU_TAPIS ? facteurEauHerbacee(HERBACEE_DU_TAPIS, h) : 1;
  let somme = 0;
  let poids = 0;
  for (const { fiche, part } of parts) {
    somme += facteurEauHerbacee(fiche, h) * part;
    poids += part;
  }
  return poids > 0 ? somme / poids : 1;
}

/**
 * Qui occupe la cellule, et pour quelle part.
 *
 * Le MÉLANGE et non la dominante, et c'est mesuré : l'identité de la dominante
 * bascule d'avril à juillet sur près de quarante pour cent des cellules — le
 * dactyle régresse à la sécheresse pendant que l'anémone, dormante, ne perd
 * rien. Un indice unique ferait donc sauter la teinte ET le seuil d'eau d'une
 * saison à l'autre, alors que le mélange ne bouge presque pas.
 */
export interface MelangeDuTapis {
  /** les identifiants d'espèce, dans l'ordre de `parts` (`Snapshot.herbesIds`) */
  ids: readonly string[];
  /** l'emprise de chacune ∈ [0,1] */
  parts: readonly number[];
}

/** Les espèces présentes, appariées à leur fiche. `undefined` si on ne sait rien. */
function partsUtiles(
  tapis?: MelangeDuTapis,
): readonly { fiche: HerbaceeV0; part: number }[] | undefined {
  if (!tapis || tapis.ids.length === 0) return undefined;
  const utiles: { fiche: HerbaceeV0; part: number }[] = [];
  for (let i = 0; i < tapis.ids.length; i++) {
    const part = tapis.parts[i] ?? 0;
    if (part <= 0) continue;
    const fiche = FICHE_PAR_ID.get(tapis.ids[i] ?? "");
    if (fiche) utiles.push({ fiche, part });
  }
  // Une cellule sans herbe du tout : on retombe sur le tapis de référence
  // plutôt que de rendre une couleur neutre qui ne veut rien dire.
  return utiles.length > 0 ? utiles : undefined;
}

/**
 * La teinte de pleine saison du tapis, mélangée à l'emprise de chaque espèce.
 *
 * Pondérée par l'emprise et non par une dominante : une cellule où le dactyle
 * tient 0,6 et l'anémone 0,4 n'est ni l'un ni l'autre, et c'est justement ce
 * qu'un indice unique ne saurait pas dire.
 */
function teinteDuTapis(tapis?: MelangeDuTapis): Teinte {
  const parts = partsUtiles(tapis);
  if (!parts) return HERBE_PRINTEMPS;
  let r = 0;
  let g = 0;
  let b = 0;
  let poids = 0;
  for (const { fiche, part } of parts) {
    const t = TEINTE_HERBACEE[fiche.id] ?? HERBE_PRINTEMPS;
    r += t.r * part;
    g += t.g * part;
    b += t.b * part;
    poids += part;
  }
  if (poids <= 0) return HERBE_PRINTEMPS;
  return { r: r / poids, g: g / poids, b: b / poids };
}

/**
 * Le sol le plus sombre qu'un couvert fermé puisse donner, en facteur de clarté.
 *
 * **Pas zéro, et pour la même raison que l'ombre portée n'est pas noire** : le
 * sous-bois d'une hêtraie fermée reçoit ~1 % de la lumière du jour
 * (`MAX_EXTINCTION`), mais l'œil, lui, s'y adapte — un sous-bois n'est pas noir
 * pour qui s'y trouve, il est sombre et vert. Rendre la physique au pied de la
 * lettre donnerait un trou d'encre au milieu de la parcelle, et on ne verrait
 * plus rien de ce qui s'y passe : ni les semis, ni le bois au sol, ni les
 * marques d'action. 0,52 est un choix de dessin, assumé comme tel.
 *
 * **Et c'est bien un choix de DESSIN, pas un seuil de modèle** — la distinction
 * vient de coûter une faute ailleurs dans ce fichier, elle vaut donc d'être
 * dite. Ce nombre répond à « une cellule dont le moteur dit qu'elle reçoit 2 %
 * de lumière, je la peins comment ? ». Il ne répond pas à « à partir de quand
 * une cellule est-elle à l'ombre ? » — cette question-là est tranchée par
 * `computeGroundLight`, et le rendu n'a pas d'avis. La fonction est monotone et
 * vaut 1 en pleine lumière : elle ne peut donc pas assombrir une cellule que le
 * moteur dit éclairée, ni éclaircir une cellule qu'il dit sombre.
 */
export const COUVERT_LE_PLUS_SOMBRE = 0.52;

/**
 * Facteur de clarté du sol pour une lumière au sol donnée.
 *
 * La racine et non la valeur brute : l'extinction du couvert est exponentielle
 * (`exp(-k·LAI)`), si bien que la moitié de l'échelle est écrasée sous 0,2 et
 * qu'un rendu linéaire ferait un saut brutal entre « clairière » et « noir ».
 * L'œil, lui, répond à peu près à la racine de l'éclairement — c'est la même
 * raison qui fait qu'on encode les images en gamma.
 */
export function ombreDuCouvert(lumiere: number): number {
  const l = Math.min(1, Math.max(0, lumiere));
  return COUVERT_LE_PLUS_SOMBRE + (1 - COUVERT_LE_PLUS_SOMBRE) * Math.sqrt(l);
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
  // La soif se lit sur la réserve utile, et elle ne commence pas à sec : une
  // herbe tient tant que le sol garde de quoi transpirer, puis grille vite. Le
  // seuil est le même ordre de grandeur que les `seuilStressSecheresse` des
  // fiches d'espèces *(à calibrer)*.
  const herbe = couleurHerbe(
    semaineAnnee,
    valeurDuPalier(q.herbeBiomasse),
    valeurDuPalier(q.herbeHumidite),
    // **`partDuPalier` et non `valeurDuPalier`**, et ce module dit déjà
    // pourquoi quelques lignes plus haut : une emprise est une PRÉSENCE, pas
    // une couleur à interpoler. Avec le milieu de tranche, une espèce absente
    // ressortait à une demi-tranche — sur une lande tenue à 100 % par la
    // molinie, les deux autres pesaient encore douze pour cent du mélange et
    // délavaient sa teinte. C'est exactement le défaut que le commentaire de
    // `partDuPalier` raconte pour les marques, et je l'ai refait pour les
    // espèces.
    q.tapis ? { ids: q.tapis.ids, parts: q.tapis.parts.map((p) => partDuPalier(p)) } : undefined,
  );
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
  const matiere = melange(avecHerbe, LITIERE, 0.45 * tapis);

  // Puis l'OMBRE DU COUVERT, qui n'est pas une matière mais une lumière : elle
  // ne mélange pas une couleur, elle assombrit celle qui est là. C'est ce qui
  // fait qu'un sous-bois fermé est sombre et qu'une trouée est claire, et c'est
  // le premier signal qui dit « forêt » plutôt que « objets posés sur un pré ».
  return eclairer(matiere, ombreDuCouvert(valeurDuPalier(q.lumiere)));
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
  let h =
    (((q.humidite * NIVEAUX + q.herbe) * NIVEAUX + q.herbeBiomasse) * NIVEAUX + q.litiere) *
      NIVEAUX +
    q.lumiere;
  // **`herbeHumidite` manquait, et `couleurSol` la lit.** Une cellule dont la
  // seule chose à changer était la soif du tapis gardait donc sa signature :
  // le morceau n'était pas recuit, et l'herbe ne grillait pas à l'écran tant
  // qu'autre chose ne bougeait pas. Le tapis entre par la même porte, et pour
  // la même raison — c'est lui qui décide maintenant de la teinte.
  h = h * NIVEAUX + q.herbeHumidite;
  // **Les parts seulement, pas les identifiants** : la liste d'espèces est une
  // propriété de la PARCELLE et non de la cellule — l'instantané en envoie une
  // seule, et toutes les cellules la partagent. Hacher trois chaînes par
  // cellule et par image pour une valeur constante serait payer cher un
  // renseignement qu'on a déjà. C'est `signatureMorceau` qui la prend en
  // compte, une fois par morceau.
  for (const part of q.tapis?.parts ?? []) h = h * NIVEAUX + part;
  return h;
}
