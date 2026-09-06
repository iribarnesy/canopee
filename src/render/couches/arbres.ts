/**
 * La couche des arbres : du squelette à l'image posée
 * (docs/interface-visuelle.md §3 et §5.4).
 *
 * **La règle du lot L0 vaut ici plus qu'ailleurs : aucune primitive
 * vectorielle par image.** Un hectare de friche à l'an 30 porte 5 436 tiges ;
 * un feuillu de futaie fait mille segments de bois et autant de feuilles.
 * Dessiner ça par image, c'est dix millions de primitives — trois ordres de
 * grandeur au-dessus du budget. Les arbres sont donc **cuits en vignettes** et
 * posés comme des images, exactement comme le terrain.
 *
 * **Ce qui rend la cuisson payable, c'est le PARTAGE.** Une vignette n'est pas
 * cuite par arbre : elle est cuite par **classe** — une espèce, un palier de
 * hauteur, un stade, une saison, une variante. Cinq mille arbres d'une friche
 * se répartissent sur quelques dizaines de classes, et chacun pose une image
 * déjà prête. C'est ce qui fait passer le coût de « par arbre » à « par
 * classe », et c'est toute l'affaire.
 *
 * **Trois choses qu'on ne partage PAS**, parce que les partager se verrait :
 *
 * 1. **la hauteur**, quantifiée en paliers — sans quoi toute une plantation
 *    aurait la même taille au centimètre ;
 * 2. **la variante**, tirée de l'`id` de l'arbre — quatre squelettes différents
 *    par classe suffisent à casser la répétition, et c'est la seule chose que
 *    l'œil attrape dans un peuplement régulier ;
 * 3. **l'état de gestion** — un arbre élagué, trogné ou en cépée n'est pas
 *    l'arbre ordinaire de sa classe.
 *
 * **Le niveau de détail suit le zoom, et il faut qu'il le suive** : L0 a montré
 * que le point de rupture est le zoom RAPPROCHÉ, pas la parcelle entière. À
 * l'échelle de l'hectare, un arbre fait quinze pixels : y cuire mille segments
 * et trois cents feuilles serait payer un détail que personne ne voit. On cuit
 * donc la vignette à la taille où elle sera POSÉE, et le squelette se déroule
 * d'autant moins loin que cette taille est petite.
 *
 * Module **pur du DOM** au sens du dépôt : la fabrique de canvas est injectée,
 * comme pour le terrain, donc il se teste sans navigateur.
 */

import { ficheDe } from "../arbres/especes";
import { contourFeuille, elementsParFeuille } from "../arbres/feuilles";
import type { FicheGraphique } from "../arbres/fiche";
import { contraindre } from "../arbres/port";
import { engendrer, rayonAuPiedM, type Segment, type Sujet } from "../arbres/squelette";
import { type Vue, versEcranVue } from "../camera";
import { eclairer, melange, type Teinte, versCss } from "../palette";
import { METRE_VERTICAL_PX, profondeur, TUILE_LARGEUR_PX } from "../projection";

/** Ce que la couche a besoin de savoir d'un arbre. Un sous-ensemble strict du protocole. */
export interface ArbreAPoser {
  id: number;
  especeId: string;
  x: number;
  y: number;
  /** altitude du sol sous l'arbre, m */
  z: number;
  heightM: number;
  houppierRatio: number;
  hauteurElagueeM?: number;
  teteTrogneM?: number;
  chandelle?: boolean;
  /** part du feuillage accroché ∈ [0,1] — `partFoliaire` du moteur */
  partFoliaire: number;
  /** avancement de la sénescence ∈ [0,1] — `senescenceFoliaire` */
  senescence: number;
  /** vigueur ∈ [0,1] : un arbre qui végète a le houppier clairsemé */
  vigueur: number;
}

/**
 * Paliers de hauteur, en nombre de classes sur l'amplitude d'une espèce.
 *
 * Douze : au-delà, deux paliers voisins donnent la même image à un pixel près
 * et on cuit pour rien ; en dessous, une plantation régulière montre ses
 * marches.
 */
export const PALIERS_HAUTEUR = 12;

/**
 * Nombre de variantes de squelette par classe.
 *
 * Quatre. C'est peu, et c'est assez : dans un peuplement, ce que l'œil attrape
 * n'est pas la diversité des arbres mais la RÉPÉTITION à l'identique. Quatre
 * variantes la cassent ; huit coûteraient le double pour un gain nul.
 */
export const VARIANTES = 4;

/** Paliers de feuillage : c'est la saison, quantifiée pour le cache. */
export const PALIERS_FEUILLAGE = 6;

/**
 * Taille écran d'une FEUILLE, en pixels, à partir de laquelle on la dessine.
 *
 * **Le seuil porte sur la feuille, pas sur l'arbre**, et le premier jet s'était
 * trompé de grandeur. Il déclenchait le détail dès que la vignette faisait
 * quarante pixels de large — or à cette taille, une feuille de bouleau de cinq
 * centimètres mesure **six dixièmes de pixel**. On dessinait donc trois cents
 * contours invisibles par arbre, et les houppiers sortaient vides : la capture
 * montrait des poteaux télégraphiques. En dessous de ce seuil, le bouquet
 * devient une tache, ce qui est la seule chose lisible à cette échelle — même
 * arbitrage que le tapis du sol, un étage plus haut.
 */
export const FEUILLE_DES_PX = 2.5;

/**
 * Facteur de recouvrement des taches de feuillage.
 *
 * Des disques semés au hasard se chevauchent : la surface qu'ils couvrent est
 * toujours inférieure à la somme de leurs aires. Mais ici le chevauchement est
 * bien pire que pour un semis uniforme, parce que **les taches suivent les
 * rameaux** : elles s'alignent le long des branches et laissent du vide entre
 * elles. Le facteur théorique d'un semis au hasard — autour de 1,5 — donnait
 * donc des houppiers en grappes de raisin. Deux et quatre dixièmes compense ce
 * groupement ; c'est un chiffre mesuré sur la planche d'essences, pas une
 * constante de géométrie.
 */
export const RECOUVREMENT = 2.4;

/**
 * Nombre de sommets du contour d'une tache de feuillage.
 *
 * Sept : assez pour que le bord soit franchement irrégulier, assez peu pour que
 * la cuisson d'un houppier de mille rameaux reste du même ordre qu'avant.
 */
export const SOMMETS_TACHE = 7;

/**
 * Taille écran maximale d'une vignette cuite, en pixels.
 *
 * Au-delà, on cesse de grossir la vignette et on l'étire : un arbre qui occupe
 * tout l'écran n'a pas besoin d'être cuit à cette taille-là, et la mémoire d'un
 * atlas, elle, est bornée. **Une puissance de deux**, pour que le plafond ne
 * défasse pas la quantification qui le suit.
 *
 * **Deux cent cinquante-six, après un aller-retour instructif.** J'étais passé à
 * 512 parce qu'à 256 les feuilles d'un sujet vu de près ne dépassaient jamais
 * quatre pixels et que le seuil de détail ne se déclenchait pas. Mais ce seuil a
 * lui-même été revu depuis — à `LARGEUR_MIN_VISIBLE_M`, une feuille fait trois
 * pixels et rien n'y changera — et 512 coûte quatre fois plus de pixels à
 * cuire. Mesuré sur la vue Pixi : la cuisson des vignettes tenait la boucle
 * d'images à une dizaine par seconde, et l'atlas restait trois cents classes en
 * retard après la fin du zoom. L'étirement d'un facteur deux par le GPU ne se
 * voit pas ; l'attente, si.
 */
export const VIGNETTE_MAX_PX = 256;

/**
 * Budget de cuisson des vignettes, en pixels de vignette et par image.
 *
 * Trois cent mille : de quoi cuire une vignette pleine taille (256 × 384 × 1,5)
 * par image, ou une centaine de vignettes de trente-deux pixels. C'est la même
 * dépense dans les deux cas, ce qui est exactement ce qu'on veut d'un budget.
 */
export const BUDGET_CUISSON_PX = 300_000;

/** La classe d'un arbre : deux arbres de même classe partagent leur image. */
export interface Classe {
  especeId: string;
  palier: number;
  variante: number;
  feuillage: number;
  /** état de gestion, encodé : ni élagué ni trogné = 0 */
  gestion: number;
  /** taille de cuisson, en pixels de large */
  taillePx: number;
}

/** Quantifie une valeur ∈ [0,1] en `n` paliers, et rend l'indice. */
function palierDe(valeur: number, n: number): number {
  return Math.min(n - 1, Math.max(0, Math.floor(Math.min(1, Math.max(0, valeur)) * n)));
}

/**
 * La classe d'un arbre pour une vue donnée.
 *
 * **La clé du cache, donc le cœur du coût.** Tout ce qui y entre multiplie le
 * nombre d'images à cuire ; tout ce qui n'y entre pas devient invisible. Le
 * choix de ce qui entre est le vrai travail de ce module.
 */
export function classeDe(arbre: ArbreAPoser, hauteurMaxM: number, vue: Vue): Classe {
  const zoom = vue.cam.zoom;
  // La place que l'arbre occupera à l'écran : c'est ELLE qui décide de la
  // finesse à cuire. Un arbre de quinze pixels ne mérite pas mille segments —
  // c'est le point de rupture que L0 a mesuré, et il est au zoom rapproché.
  const largeurPx = Math.min(
    VIGNETTE_MAX_PX,
    Math.max(4, arbre.heightM * METRE_VERTICAL_PX * zoom * 1.2),
  );
  // La taille de cuisson est elle-même quantifiée en puissances de deux : un
  // zoom continu ne doit pas recuire l'atlas entier à chaque cran de molette.
  // Le plafond s'applique AVANT l'arrondi, sinon il le défait : 320 pixels
  // plafonnés après arrondi ne sont plus une puissance de deux, et la promesse
  // « le zoom ne recuit pas tout » s'évanouit au zoom maximal.
  const taillePx = 2 ** Math.ceil(Math.log2(Math.min(VIGNETTE_MAX_PX, largeurPx)));
  const gestion =
    (arbre.chandelle ? 1 : 0) |
    (arbre.teteTrogneM ? 2 : 0) |
    ((arbre.hauteurElagueeM ?? 0) > 0.5 ? 4 : 0);
  return {
    especeId: arbre.especeId,
    palier: palierDe(arbre.heightM / Math.max(0.1, hauteurMaxM), PALIERS_HAUTEUR),
    variante: arbre.id % VARIANTES,
    // La sénescence entre dans la clé en même temps que la part foliaire : un
    // houppier plein et doré et un houppier plein et vert ne sont pas la même
    // image, et c'est précisément ce décalage qui fait octobre.
    feuillage:
      palierDe(arbre.partFoliaire, PALIERS_FEUILLAGE) * PALIERS_FEUILLAGE +
      palierDe(arbre.senescence, PALIERS_FEUILLAGE),
    gestion,
    taillePx,
  };
}

/** La clé de cache d'une classe. */
export function cleClasse(c: Classe): string {
  return `${c.especeId}|${c.palier}|${c.variante}|${c.feuillage}|${c.gestion}|${c.taillePx}`;
}

/** Une vignette cuite, et où poser son pied. */
export interface Vignette {
  image: HTMLCanvasElement;
  /** décalage du PIED de l'arbre dans l'image, en pixels */
  piedX: number;
  piedY: number;
}

/**
 * La fiche de repli, quand une espèce n'a pas encore la sienne.
 *
 * §5.4 : « une essence sans fiche prend le port de sa famille en attendant la
 * sienne », et la vue tourne. Ce repli est cette promesse tenue — un feuillu
 * ordinaire, ni faux ni reconnaissable.
 */
export const FICHE_GENERIQUE: FicheGraphique = {
  especeId: "*",
  port: "boule",
  branchement: {
    angleDeg: 45,
    divergenceDeg: 137,
    ratioLongueur: 0.7,
    dominance: 0.42,
    branchesParNoeud: 3,
    conicite: 0.84,
    tortuosite: 0.26,
  },
  feuillage: { forme: "ovale", feuillesParBouquet: 4, longueurFeuilleM: 0.07, densite: 0.7 },
  couleurs: {
    printemps: { r: 128, g: 164, b: 84 },
    ete: { r: 82, g: 116, b: 62 },
    automne: { r: 168, g: 140, b: 68 },
  },
  ecorce: { r: 112, g: 98, b: 82 },
  references: ["port de famille, en attendant la fiche de l'espèce (§5.4)"],
};

/** La couleur du feuillage, saison comprise. */
export function couleurFeuillage(fiche: FicheGraphique, senescence: number): Teinte {
  const c = fiche.couleurs;
  const s = Math.min(1, Math.max(0, senescence));
  // La sénescence tire l'été vers l'automne. Le printemps, lui, n'est pas ici :
  // il se lit sur la part foliaire qui monte, pas sur le jaunissement.
  return melange(c.ete, c.automne, s);
}

/** Hachage entier → [0,1[. Le même que partout ailleurs dans le rendu. */
function hacher(a: number, b: number, sel: number): number {
  let h = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ sel) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/**
 * Cuit la vignette d'une classe.
 *
 * L'arbre est dessiné **de face**, pas en projection isométrique, et c'est
 * volontaire : un arbre est vertical, sa silhouette ne change pas quand la
 * caméra tourne autour de lui. Ce qui tourne, c'est sa PLACE au sol, et ça,
 * c'est l'affaire de `posesDesArbres`. Dessiner le houppier en isométrie
 * l'aplatirait à l'horizontale, ce qui est faux pour tout ce qui est debout.
 */
export function cuireVignette(
  classe: Classe,
  hauteurM: number,
  houppierRatio: number,
  fabriquer: (largeur: number, hauteur: number) => HTMLCanvasElement,
  gestionM?: { hauteurElagueeM?: number; teteTrogneM?: number },
): Vignette {
  const fiche = ficheDe(classe.especeId) ?? FICHE_GENERIQUE;
  const largeur = Math.max(4, Math.round(classe.taillePx));
  // Un arbre est plus haut que large : la vignette lui laisse la place.
  const hauteur = Math.max(6, Math.round(classe.taillePx * 1.5));
  const image = fabriquer(largeur, hauteur);
  const ctx = image.getContext("2d");
  if (!ctx) throw new Error("contexte 2d indisponible");

  const piedX = largeur / 2;
  const piedY = hauteur - 1;
  // Combien de pixels vaut un mètre dans cette vignette.
  const echelle = (hauteur - 2) / Math.max(0.1, hauteurM);

  const sujet: Sujet = {
    id: classe.variante * 7919 + classe.palier * 31,
    hauteurM,
    houppierRatio,
    ...(gestionM?.hauteurElagueeM ? { hauteurElagueeM: gestionM.hauteurElagueeM } : {}),
    ...(gestionM?.teteTrogneM ? { teteTrogneM: gestionM.teteTrogneM } : {}),
    ...(fiche.brinsDeCepee ? { brins: fiche.brinsDeCepee } : {}),
  };
  // **Le squelette est plafonné par la TAILLE de la vignette.** À quinze
  // pixels, mille segments seraient mille traits d'un tiers de pixel : on paie
  // un détail que personne ne voit, et c'est exactement le piège que L0 a
  // mesuré. Le budget croît avec la surface de la vignette.
  const budget = Math.max(12, Math.round(classe.taillePx * classe.taillePx * 0.035));
  const brut = engendrer(sujet, fiche.branchement, budget);
  const houppier = brut.filter((s) => s.ordre >= 1);
  const base = houppier.length > 0 ? Math.min(...houppier.map((s) => s.depart.y)) : 0;
  const sommet = houppier.length > 0 ? Math.max(...houppier.map((s) => s.arrivee.y)) : hauteurM;
  const segments = contraindre(brut, fiche.port, base, sommet, houppierRatio * hauteurM);

  const versPx = (p: { x: number; y: number }) => ({
    sx: piedX + p.x * echelle,
    sy: piedY - p.y * echelle,
  });

  // ── Le bois ───────────────────────────────────────────────────────────
  // Du plus gros au plus fin : les charpentières passent sous les rameaux, ce
  // qui évite les jointures visibles sans avoir à les calculer.
  const parEpaisseur = [...segments].sort((a, b) => b.rayonDepartM - a.rayonDepartM);
  for (const s of parEpaisseur) {
    const a = versPx(s.depart);
    const b2 = versPx(s.arrivee);
    const epaisseur = Math.max(0.6, s.rayonDepartM * 2 * echelle);
    // L'écorce du haut, quand l'espèce en a une : c'est la signature du pin
    // sylvestre, et elle se lit sur la partie haute du fût et les charpentières.
    // L'écorce haute ne vaut que pour le BOIS PORTEUR : le fût et les
    // charpentières. Appliquée aux brindilles, elle semait des filaments orange
    // dans tout le houppier — à l'échelle de la parcelle, un pin sylvestre
    // ressortait en moustaches vives au milieu des verts, ce qui est l'inverse
    // de sa signature. La partie orangée d'un pin, c'est son tronc haut.
    const haut =
      fiche.ecorceHaute &&
      s.depart.y > hauteurM * 0.45 &&
      s.rayonDepartM > rayonAuPiedM(hauteurM) * 0.28;
    // **Les RAMEAUX ne sont pas de la couleur du fût**, et le bouleau l'a montré
    // sans appel : peindre en blanc les brindilles d'un houppier donne un arbre
    // mort en plein été, la ramure crevant le feuillage. C'est aussi faux en
    // botanique — l'écorce blanche du bouleau est celle du tronc et des grosses
    // branches ; ses rameaux de l'année sont brun-rouge sombre. On assombrit
    // donc l'écorce à mesure que le bois s'affine.
    const finesse = Math.min(1, s.rayonDepartM / Math.max(1e-6, rayonAuPiedM(hauteurM) * 0.35));
    const base = haut && fiche.ecorceHaute ? fiche.ecorceHaute : fiche.ecorce;
    ctx.strokeStyle = versCss(eclairer(base, 0.55 + 0.45 * finesse));
    ctx.lineWidth = epaisseur;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b2.sx, b2.sy);
    ctx.stroke();
  }

  // ── Le feuillage ──────────────────────────────────────────────────────
  const partFoliaire = Math.floor(classe.feuillage / PALIERS_FEUILLAGE) / (PALIERS_FEUILLAGE - 1);
  const senescence = (classe.feuillage % PALIERS_FEUILLAGE) / (PALIERS_FEUILLAGE - 1);
  if (partFoliaire > 0.02) {
    const teinte = couleurFeuillage(fiche, senescence);
    dessinerFeuillage(ctx, segments, fiche, teinte, partFoliaire, echelle, versPx, classe);
  }

  return { image, piedX, piedY };
}

/**
 * Pose les feuilles sur les rameaux terminaux.
 *
 * **Un BOUQUET par rameau, pas une feuille**, et sur TOUT rameau terminal :
 * les deux règles viennent de L0, et chacune corrigeait un défaut visible —
 * une brindille décorée dans un cas, un arbre nu dans l'autre.
 *
 * En dessous d'une certaine taille écran, les feuilles individuelles cessent
 * d'être dessinées et le bouquet devient une tache : à quinze pixels de haut,
 * un arbre n'a pas de feuilles, il a une masse. C'est le même arbitrage que le
 * tapis du sol, à un autre étage.
 */
function dessinerFeuillage(
  ctx: CanvasRenderingContext2D,
  segments: readonly Segment[],
  fiche: FicheGraphique,
  teinte: Teinte,
  partFoliaire: number,
  echelle: number,
  versPx: (p: { x: number; y: number }) => { sx: number; sy: number },
  classe: Classe,
): void {
  const terminaux = segments.filter((s) => s.terminal);
  const contour = contourFeuille(fiche.feuillage.forme);
  const parFeuille = elementsParFeuille(fiche.feuillage.forme);
  const tailleFeuillePx = fiche.feuillage.longueurFeuilleM * echelle;
  const detaille = tailleFeuillePx >= FEUILLE_DES_PX;
  const aiguilles = fiche.feuillage.forme === "aiguille";

  // **Le rayon d'une tache se déduit de la SURFACE à couvrir, pas de la taille
  // d'une feuille**, et c'est la deuxième moitié de la correction du houppier
  // vide. Une tache dimensionnée sur la feuille faisait 1,3 pixel : cent
  // soixante-dix taches de ce calibre couvraient la moitié du houppier, et
  // l'arbre restait transparent quel que soit son feuillage.
  //
  // Ce qu'on veut est simple à énoncer : le feuillage couvre la part `densite`
  // de la surface projetée du houppier. On mesure donc cette surface, on la
  // divise par le nombre de taches, et on en tire le rayon. Le facteur de
  // recouvrement compense le chevauchement des disques, qui couvrent toujours
  // moins que la somme de leurs aires.
  let x0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  for (const s of terminaux) {
    const p = versPx(s.arrivee);
    x0 = Math.min(x0, p.sx);
    x1 = Math.max(x1, p.sx);
    y0 = Math.min(y0, p.sy);
    y1 = Math.max(y1, p.sy);
  }
  const aireHouppier = (Math.PI / 4) * Math.max(1, x1 - x0) * Math.max(1, y1 - y0);
  const taches = Math.max(1, terminaux.length * fiche.feuillage.densite * partFoliaire);
  // La densité de la fiche dit la TRANSPARENCE relative d'un houppier — un
  // bouleau à 0,45 laisse voir le ciel, un hêtre à 0,92 non. Prise telle quelle
  // comme taux de couverture, elle donnait des arbres nus : à 45 % de surface
  // couverte, les rameaux blancs d'un bouleau dominent et l'arbre se lit comme
  // un squelette d'hiver. On la remonte donc dans une plage où même le plus
  // transparent des houppiers reste un houppier.
  const couverture = 0.55 + 0.45 * fiche.feuillage.densite;
  const rayonTache = Math.max(
    0.8,
    Math.sqrt((aireHouppier * couverture * RECOUVREMENT) / (Math.PI * taches)),
  );

  let i = 0;
  for (const s of terminaux) {
    i++;
    // La densité de l'espèce ET la part foliaire de la saison décident si ce
    // rameau porte un bouquet. Le tirage est déterministe.
    if (hacher(i, classe.palier, 0x77c1) > fiche.feuillage.densite * partFoliaire) continue;
    const bout = versPx(s.arrivee);
    // La direction du rameau, à l'écran : c'est elle qui oriente une brosse
    // d'aiguilles. Un feuillu n'en a pas besoin, ses bouquets sont ronds.
    const pied = versPx(s.depart);
    const dx = bout.sx - pied.sx;
    const dy = bout.sy - pied.sy;
    const norme = Math.hypot(dx, dy) || 1;
    // **La masse est TOUJOURS posée, et les feuilles viennent dessus.** C'est la
    // formulation exacte du §4 : « vu de loin ça fait une masse ; vu de près on
    // distingue les feuilles ». Le premier jet en faisait une alternative — ou
    // la masse, ou les feuilles — et le résultat était un houppier criblé de
    // taches vertes de trois pixels à travers lequel on voyait toute la ramure :
    // un arbre mort en plein été. Une feuille dessinée ne remplace pas le volume
    // du bouquet auquel elle appartient, elle s'y ajoute.
    //
    // Un peu de modelé au tirage : ça donne du volume à une masse d'aplats sans
    // coûter une passe de plus.
    ctx.fillStyle = versCss(eclairer(teinte, 0.9 + 0.2 * hacher(i, 3, 0x4411)));
    // Des taches toutes du même calibre se lisent comme une grappe de raisin :
    // on les fait varier du simple au double, ce qui suffit à ce que l'œil y
    // voie une masse.
    const calibre = rayonTache * (0.72 + 0.72 * hacher(i * 7, classe.variante, 0x611d));
    // **Un contour DÉCHIQUETÉ, pas une ellipse.** Une ellipse est une bulle, et
    // un houppier fait de bulles se lit comme du brocoli — c'est ce que la
    // capture montrait au zoom rapproché. Un bord irrégulier ne coûte que
    // quelques sommets de plus et rend au feuillage sa silhouette dentelée,
    // même quand une feuille fait trois pixels et qu'on ne peut pas la dessiner.
    if (aiguilles) {
      // **Une BROSSE, pas une boule.** Un conifère ne porte pas de bouquets
      // ronds : ses aiguilles garnissent le rameau sur toute sa longueur, en
      // brosse allongée dans son axe. Dessiné en taches rondes comme un
      // feuillu, le pin sylvestre sortait — c'est le mot du retour — comme
      // « un feuillu avec des blobs verts », et sa famille entière avec lui.
      // Le port étagé ne suffit pas : ce qui dit « conifère » à l'œil, c'est la
      // texture du feuillage autant que la forme de l'arbre.
      const longueur = Math.max(calibre * 1.4, norme * 0.62);
      const epaisseur = calibre * 0.62;
      const mx = (bout.sx + pied.sx) / 2;
      const my = (bout.sy + pied.sy) / 2;
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(Math.atan2(dy, dx));
      ctx.beginPath();
      // Un fuseau à bords irréguliers : les aiguilles dépassent.
      for (let n = 0; n < SOMMETS_TACHE * 2; n++) {
        const t = n / (SOMMETS_TACHE * 2);
        const a = t * Math.PI * 2;
        const jitter = 0.7 + 0.6 * hacher(i * 37 + n, classe.palier, 0x5c3d);
        ctx.lineTo(Math.cos(a) * longueur * 0.5, Math.sin(a) * epaisseur * jitter);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else {
      // **Un contour DÉCHIQUETÉ, pas une ellipse.** Une ellipse est une bulle,
      // et un houppier fait de bulles se lit comme du brocoli — c'est ce que la
      // capture montrait au zoom rapproché. Un bord irrégulier ne coûte que
      // quelques sommets de plus et rend au feuillage sa silhouette dentelée,
      // même quand une feuille fait trois pixels et qu'on ne peut pas la
      // dessiner.
      ctx.beginPath();
      for (let n = 0; n < SOMMETS_TACHE; n++) {
        const a = (n / SOMMETS_TACHE) * Math.PI * 2;
        const r = calibre * (0.72 + 0.5 * hacher(i * 31 + n, classe.palier, 0x22a7));
        const px = bout.sx + Math.cos(a) * r;
        const py = bout.sy + Math.sin(a) * r * 0.82;
        if (n === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }
    if (!detaille) continue;
    for (let k = 0; k < fiche.feuillage.feuillesParBouquet; k++) {
      const a1 = hacher(i * 131 + k, classe.variante, 0x1d3b);
      const a2 = hacher(i, k * 17 + classe.palier, 0x9e21);
      // Les feuilles d'un bouquet s'écartent autour du bout du rameau.
      // Une aiguille se pose LE LONG du rameau, une feuille autour de son bout.
      const angle = aiguilles ? Math.atan2(dy, dx) + (a1 - 0.5) * 0.9 : a1 * Math.PI * 2;
      const rayon = tailleFeuillePx * 0.55 * a2;
      const cx = aiguilles
        ? pied.sx + dx * a2 + Math.cos(angle + Math.PI / 2) * rayon * 0.6
        : bout.sx + Math.cos(angle) * rayon;
      const cy = aiguilles
        ? pied.sy + dy * a2 + Math.sin(angle + Math.PI / 2) * rayon * 0.6
        : bout.sy + Math.sin(angle) * rayon * 0.7;
      // Une feuille plus claire quand elle est au-dessus, plus sombre dessous :
      // c'est la seule modulation qui donne du volume à une masse d'aplats.
      const clarte = 0.86 + 0.28 * (1 - (cy - bout.sy) / (tailleFeuillePx + 1e-6) / 2);
      ctx.fillStyle = versCss(eclairer(teinte, Math.min(1.18, Math.max(0.78, clarte))));
      // **Une aiguille est ORIENTÉE, une feuille non.** Les contours sont
      // normalisés pointe en haut ; les laisser tels quels donnait une brosse
      // de pin dont toutes les aiguilles montaient à la verticale, quel que
      // soit l'angle du rameau qui les porte. Une feuille tombée peut être de
      // travers, une aiguille de pin sort du rameau.
      ctx.save();
      ctx.translate(cx, cy);
      if (aiguilles) ctx.rotate(angle + Math.PI / 2);
      for (let e = 0; e < parFeuille; e++) {
        // Les aiguilles vont PAR DEUX : c'est la signature du pin sylvestre.
        const ecart = parFeuille > 1 ? (e - 0.5) * 0.22 : 0;
        ctx.beginPath();
        contour.forEach((p, n) => {
          const px = (p.x + ecart) * tailleFeuillePx;
          const py = -p.y * tailleFeuillePx;
          if (n === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }
}

/** Un arbre placé à l'écran, prêt à être posé. */
export interface PoseArbre {
  arbre: ArbreAPoser;
  classe: Classe;
  sx: number;
  sy: number;
  profondeur: number;
}

/**
 * Où poser chaque arbre, dans l'**ordre du peintre**.
 *
 * La même clé que le terrain — `x + y` dans le repère de la caméra — et c'est
 * délibéré : le relief à l'échelle vraie (D3) impose d'entrelacer sol et arbres
 * dans un seul ordre, sinon une butte au premier plan ne masque pas le pied des
 * arbres derrière elle. Rendre les deux listes triées par la même grandeur est
 * ce qui rendra l'entrelacement possible sans rien réécrire.
 */
export function posesDesArbres(
  arbres: readonly ArbreAPoser[],
  hauteurMaxParEspece: (especeId: string) => number,
  vue: Vue,
): PoseArbre[] {
  // **On ne pose que ce qui est visible**, et le lot L0 l'avait annoncé : « le
  // point de rupture est le zoom rapproché, pas la parcelle entière, donc le
  // rendu doit découper par emprise visible ». Sans ce filtre, une friche de
  // cinq mille six cents tiges posait cinq mille six cents sprites par image et
  // demandait à l'atlas cinq cents classes de vignette — alors qu'au zoom
  // rapproché, une trentaine d'arbres sont à l'écran. Mesuré sur la vue Pixi :
  // l'atlas restait cinq cents classes en retard, et il cuisait des arbres que
  // personne ne regardait pendant que le sol attendait son tour.
  //
  // La marge de `celluleVisibles` compte la hauteur : un arbre dont le pied est
  // sous le bord inférieur peut avoir sa cime à l'écran.
  const sortie: PoseArbre[] = [];
  for (const arbre of arbres) {
    if (arbre.heightM <= 0) continue;
    const e = versEcranVue({ x: arbre.x, y: arbre.y, z: arbre.z }, vue);
    // **Le test se fait à l'ÉCRAN, arbre par arbre**, et non sur l'emprise des
    // cellules. Le premier jet réutilisait `celluleVisibles`, dont la marge vaut
    // deux fois la hauteur du plus grand sujet — cinquante mètres pour un chêne
    // de vingt-cinq, soit la moitié de la parcelle. Pour du terrain cette marge
    // ne coûte que quelques cellules cuites pour rien ; pour des arbres, elle
    // laissait passer un millier de sujets au zoom rapproché et l'atlas restait
    // quatre cents classes en retard.
    //
    // Un arbre est visible si son fût, sa cime ou son houppier touchent le
    // cadre. La hauteur ne compte que vers le HAUT — un arbre dont le pied est
    // sous le bord inférieur peut avoir sa cime à l'écran — et la largeur du
    // houppier des deux côtés.
    const hauteurPx = arbre.heightM * METRE_VERTICAL_PX * vue.cam.zoom;
    const demiLargeurPx = arbre.houppierRatio * arbre.heightM * TUILE_LARGEUR_PX * vue.cam.zoom;
    if (
      e.sx + demiLargeurPx < 0 ||
      e.sx - demiLargeurPx > vue.largeurPx ||
      e.sy < -8 ||
      e.sy - hauteurPx > vue.hauteurPx
    ) {
      continue;
    }
    sortie.push({
      arbre,
      classe: classeDe(arbre, hauteurMaxParEspece(arbre.especeId), vue),
      sx: e.sx,
      sy: e.sy,
      profondeur: profondeur(arbre.x, arbre.y, vue.cam),
    });
  }
  sortie.sort((a, b) => a.profondeur - b.profondeur);
  return sortie;
}

/**
 * L'atlas : il tient les vignettes cuites et n'en cuit une qu'une fois.
 *
 * `cuire` est borné par un budget, comme le terrain : au premier affichage
 * d'une parcelle, des dizaines de classes sont à cuire d'un coup, et les cuire
 * toutes ferait le gel de trois secondes que L0 a mesuré. Un arbre dont la
 * classe n'est pas prête est posé dans la classe la plus proche déjà cuite —
 * il est un peu trop grand ou un peu trop petit pendant une image ou deux, ce
 * qui ne se voit pas, alors qu'une saccade se voit.
 */
export class AtlasArbres {
  private readonly vignettes = new Map<string, Vignette>();
  private aCuire: { classe: Classe; hauteurM: number; houppierRatio: number }[] = [];

  constructor(
    private readonly fabriquer: (largeur: number, hauteur: number) => HTMLCanvasElement,
  ) {}

  /** Dresse la liste des classes manquantes pour les poses données. */
  public rafraichir(poses: readonly PoseArbre[]): number {
    const vues = new Map<string, { classe: Classe; hauteurM: number; houppierRatio: number }>();
    for (const p of poses) {
      const cle = cleClasse(p.classe);
      if (this.vignettes.has(cle) || vues.has(cle)) continue;
      vues.set(cle, {
        classe: p.classe,
        hauteurM: p.arbre.heightM,
        houppierRatio: p.arbre.houppierRatio,
      });
    }
    this.aCuire = [...vues.values()];
    return this.aCuire.length;
  }

  /**
   * Cuit ce qui tient dans un budget de PIXELS. Rend le nombre de classes
   * réellement cuites.
   *
   * **Le budget compte des pixels et non des vignettes**, et c'est ce qui le
   * rend juste aux deux bouts du zoom. Une vignette de seize pixels et une de
   * deux cent cinquante-six ne coûtent pas la même chose — un facteur deux cent
   * cinquante-six en surface — et un budget « six vignettes par image » signifie
   * donc deux choses opposées selon l'échelle. Mesuré : à la parcelle entière,
   * quatre cent quarante classes minuscules restaient en attente alors qu'on
   * aurait pu toutes les cuire en trois images ; au zoom rapproché, six
   * vignettes pleine taille tenaient la boucle à une dizaine d'images par
   * seconde. Le même nombre, deux erreurs contraires.
   */
  public cuire(
    budgetPx = BUDGET_CUISSON_PX,
    gestion?: (c: Classe) => { hauteurElagueeM?: number; teteTrogneM?: number },
  ): number {
    let faits = 0;
    let depense = 0;
    while (depense < budgetPx) {
      const suivant = this.aCuire.shift();
      if (!suivant) break;
      const cle = cleClasse(suivant.classe);
      if (this.vignettes.has(cle)) continue;
      // La surface de la vignette, à laquelle le coût de cuisson est
      // proportionnel — le squelette lui-même est plafonné par elle.
      depense += suivant.classe.taillePx * suivant.classe.taillePx * 1.5;
      this.vignettes.set(
        cle,
        cuireVignette(
          suivant.classe,
          suivant.hauteurM,
          suivant.houppierRatio,
          this.fabriquer,
          gestion?.(suivant.classe),
        ),
      );
      faits++;
    }
    return faits;
  }

  /** La vignette d'une classe, si elle est prête. */
  public vignette(classe: Classe): Vignette | undefined {
    return this.vignettes.get(cleClasse(classe));
  }

  /** Combien de classes attendent d'être cuites. */
  public get enRetard(): number {
    return this.aCuire.length;
  }

  /** Combien de vignettes l'atlas tient. C'est la grandeur à surveiller. */
  public get taille(): number {
    return this.vignettes.size;
  }

  public vider(): void {
    this.vignettes.clear();
    this.aCuire = [];
  }
}

/**
 * La taille à laquelle POSER une vignette, en pixels.
 *
 * **À ne pas confondre avec `classe.taillePx`, et c'est un piège qui s'est
 * refermé.** `taillePx` est la RÉSOLUTION de cuisson, quantifiée en puissances
 * de deux pour que le cache serve ; la taille de pose est la place réelle que
 * l'arbre occupe à l'écran. Le premier jet collait la vignette à sa résolution :
 * les arbres sortaient trois fois trop grands, et la capture montrait une
 * futaie de mâts blancs plus hauts que la parcelle n'est large.
 *
 * La hauteur d'un mètre à l'écran est `METRE_VERTICAL_PX × zoom`, et la largeur
 * d'un mètre horizontal vaut `TUILE_LARGEUR_PX / 2 × zoom` — les deux sont
 * égales par construction de la projection dimétrique 2:1 (décision D2 : « un
 * cube unité a une hauteur écran égale à la demi-largeur de tuile »). L'échelle
 * est donc uniforme, et une vignette se pose sans déformation.
 */
export function tailleDePose(
  hauteurM: number,
  vignette: Vignette,
  vue: Vue,
): { largeur: number; hauteur: number } {
  const hauteur = Math.max(1, hauteurM * METRE_VERTICAL_PX * vue.cam.zoom);
  const largeur = Math.max(
    1,
    (vignette.image.width / Math.max(1, vignette.image.height)) * hauteur,
  );
  return { largeur, hauteur };
}

/**
 * Où poser le pied de la vignette dans l'image, une fois mise à l'échelle.
 *
 * Le pied n'est pas au centre : il est en bas, au milieu de la largeur. Rendre
 * ce décalage à part évite que chaque appelant refasse la même règle de trois.
 */
export function ancrageDePose(
  vignette: Vignette,
  taille: { largeur: number; hauteur: number },
): { dx: number; dy: number } {
  const k = taille.hauteur / Math.max(1, vignette.image.height);
  return {
    dx: vignette.piedX * (taille.largeur / Math.max(1, vignette.image.width)),
    dy: vignette.piedY * k,
  };
}
