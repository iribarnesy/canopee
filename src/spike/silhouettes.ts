/**
 * LOT L0 — prototype jetable : le générateur de silhouettes par branchement.
 *
 * Il sert à trancher la décision D4 (« une essence = une silhouette
 * reconnaissable ») en la mettant à l'épreuve plutôt qu'en en parlant : est-ce
 * qu'un squelette généré, paramétré par sept nombres et une feuille dessinée à
 * la main, produit un bouleau qu'on distingue d'un chêne ? Et à quel prix en
 * millisecondes de cuisson ?
 *
 * Ce n'est PAS le générateur définitif. Il valide le principe et mesure le
 * coût ; le vrai vivra dans `render/atlas/` avec ses fiches par espèce.
 *
 * Aucun `Math.random` : la variation d'un arbre à l'autre vient de son `id`,
 * via un générateur seedé. Deux parties de même graine doivent donner la même
 * image (docs/interface-visuelle.md §8).
 */

/** Ce qui distingue un port d'un autre. Sept nombres et un tracé. */
export interface FicheGraphique {
  nom: string;
  /** demi-angle d'ouverture entre deux filles, degrés */
  angleBranchementDeg: number;
  /** longueur d'une fille / longueur de sa mère */
  ratioLongueur: number;
  /** ce que l'axe central garde pour lui : 1 = monopode strict, 0 = fourche */
  dominanceApicale: number;
  /** épaisseur au pied / longueur totale */
  conicite: number;
  /** tortuosité : dérive angulaire aléatoire (seedée) par segment, degrés */
  tortuositeDeg: number;
  /** profondeur de récursion : combien d'ordres de ramification */
  ordres: number;
  /** part de la hauteur sans branche (le fût) */
  futRelatif: number;
  ecorce: string;
  /** feuillage : clair (lumière) et sombre (ombre propre) */
  feuillage: [string, string];
  /** le tracé qui IDENTIFIE l'espèce, dessiné dans un carré de 1 × 1 */
  feuille: (ctx: CanvasRenderingContext2D) => void;
  /** taille d'une feuille, en fraction de la hauteur de l'arbre */
  tailleFeuille: number;
  /** persistant : garde son feuillage l'hiver */
  sempervirent?: boolean;
  /**
   * Port ÉTAGÉ : un axe droit et des verticilles de branches horizontales,
   * au lieu d'une fourche. C'est la géométrie des conifères, et elle ne
   * s'obtient pas en réglant les angles d'un port fourchu.
   */
  verticille?: boolean;
}

/** PRNG minuscule et seedé (mulberry32) : la variation sans le hasard. */
function alea(graine: number): () => number {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Les tracés de feuille : c'est là que se joue la reconnaissance ──────────

/** Bouleau : petit triangle denté, plus large que long. */
function feuilleBouleau(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  ctx.moveTo(0.5, 0);
  ctx.lineTo(0.9, 0.35);
  ctx.lineTo(0.75, 0.55);
  ctx.lineTo(0.85, 0.7);
  ctx.lineTo(0.5, 1);
  ctx.lineTo(0.15, 0.7);
  ctx.lineTo(0.25, 0.55);
  ctx.lineTo(0.1, 0.35);
  ctx.closePath();
  ctx.fill();
}

/** Chêne : lobes profonds et arrondis, la feuille la plus identifiable. */
function feuilleChene(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  ctx.moveTo(0.5, 0);
  for (const [dx, dy] of [
    [0.82, 0.12],
    [0.62, 0.3],
    [0.9, 0.42],
    [0.6, 0.58],
    [0.85, 0.72],
    [0.55, 0.86],
    [0.5, 1],
    [0.45, 0.86],
    [0.15, 0.72],
    [0.4, 0.58],
    [0.1, 0.42],
    [0.38, 0.3],
    [0.18, 0.12],
  ] as const) {
    ctx.lineTo(dx, dy);
  }
  ctx.closePath();
  ctx.fill();
}

/** Pin : deux aiguilles longues, en V — la signature du sylvestre. */
function aiguillesPin(ctx: CanvasRenderingContext2D) {
  ctx.lineWidth = 0.09;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0.5, 1);
  ctx.lineTo(0.28, 0);
  ctx.moveTo(0.5, 1);
  ctx.lineTo(0.72, 0);
  ctx.stroke();
}

export const FICHES: Record<string, FicheGraphique> = {
  betula_pendula: {
    nom: "Bouleau verruqueux",
    angleBranchementDeg: 30,
    ratioLongueur: 0.78,
    dominanceApicale: 0.62,
    conicite: 0.022,
    tortuositeDeg: 5,
    ordres: 6,
    futRelatif: 0.3,
    // L'écorce blanche à lenticelles : le trait le plus reconnaissable du lot.
    ecorce: "#e8e4dc",
    feuillage: ["#8fbf6a", "#5f8f45"],
    feuille: feuilleBouleau,
    tailleFeuille: 0.028,
  },
  quercus_pubescens: {
    nom: "Chêne pubescent",
    angleBranchementDeg: 42,
    ratioLongueur: 0.68,
    dominanceApicale: 0.35,
    conicite: 0.045,
    tortuositeDeg: 16,
    ordres: 5,
    futRelatif: 0.22,
    ecorce: "#6b5a48",
    feuillage: ["#79a052", "#4c6b38"],
    feuille: feuilleChene,
    tailleFeuille: 0.05,
  },
  pinus_sylvestris: {
    nom: "Pin sylvestre",
    angleBranchementDeg: 72,
    ratioLongueur: 0.6,
    dominanceApicale: 0.95,
    conicite: 0.03,
    tortuositeDeg: 3,
    ordres: 5,
    futRelatif: 0.45,
    // Le fût orangé dans sa partie haute : la signature du sylvestre.
    ecorce: "#b4703c",
    feuillage: ["#6d8a5c", "#3f5740"],
    feuille: aiguillesPin,
    tailleFeuille: 0.045,
    sempervirent: true,
    verticille: true,
  },
};

export interface OptionsSilhouette {
  /** hauteur de l'arbre à l'écran, px */
  hauteurPx: number;
  /** graine : l'`id` de l'arbre, pour que sa forme lui soit propre */
  graine: number;
  /** part du feuillage déployé ∈ [0,1] — 0 = silhouette d'hiver */
  feuillaison: number;
  /** avancement du jaunissement ∈ [0,1] (phenologie.ts) */
  senescence: number;
  /** hauteur de fût élaguée, en fraction de la hauteur */
  elagage?: number;
}

interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  epaisseur: number;
  /** rameau terminal : c'est là que le feuillage s'accroche */
  terminal: boolean;
  /** angle du rameau, pour orienter les feuilles */
  angle: number;
  /** rang du rameau ∈ [0,1] : sert à étaler le déploiement et la chute */
  rang: number;
}

/**
 * Construit le SQUELETTE, en géométrie pure et sans dessiner.
 *
 * Deux raisons de séparer : on peut mesurer l'encombrement réel avant de
 * dimensionner le bitmap (première version : les arbres étaient coupés en
 * haut), et on sait quels rameaux sont terminaux — les feuilles s'accrochent à
 * TOUT rameau qui ne se ramifie plus, quelle qu'en soit la raison. La première
 * version ne les posait qu'au dernier ORDRE de récursion : comme les branches
 * deviennent courtes avant d'y arriver, le bouleau sortait quasiment nu.
 */
function squelette(fiche: FicheGraphique, o: OptionsSilhouette): Segment[] {
  const rnd = alea(o.graine * 2654435761 + 17);
  const H = o.hauteurPx;
  const segments: Segment[] = [];
  const futRelatif = Math.max(fiche.futRelatif, o.elagage ?? 0);
  const ouverture = (fiche.angleBranchementDeg * Math.PI) / 180;
  const longueurMinimale = Math.max(1.5, H * 0.035);

  function pousser(
    x: number,
    y: number,
    angle: number,
    longueur: number,
    ordre: number,
    epaisseur: number,
  ) {
    const derive = ((rnd() - 0.5) * fiche.tortuositeDeg * Math.PI) / 180;
    const a = angle + derive;
    const x2 = x + Math.sin(a) * longueur;
    const y2 = y - Math.cos(a) * longueur;
    const stop = longueur < longueurMinimale || ordre >= fiche.ordres;
    segments.push({
      x1: x,
      y1: y,
      x2,
      y2,
      epaisseur: Math.max(0.5, epaisseur),
      terminal: stop,
      angle: a,
      rang: rnd(),
    });
    if (stop) return;

    if (fiche.verticille) {
      // Port ÉTAGÉ (pin) : un axe qui continue tout droit, et un verticille de
      // branches presque horizontales autour de lui. C'est ce qui donne les
      // étages, puis le plateau du vieux sujet — et ça ne s'obtient pas avec
      // une fourche dichotomique.
      pousser(x2, y2, a, longueur * 0.86, ordre + 1, epaisseur * 0.8);
      // Les étages s'écourtent vers le sommet : c'est ce qui fait le cône du
      // jeune pin, puis le plateau du vieux sujet. Sans cette décroissance
      // explicite, le branchement seul donne une boule.
      const versLeHaut = ordre / fiche.ordres;
      const longueurEtage = longueur * fiche.ratioLongueur * (1.35 - versLeHaut);
      for (const cote of [1, -1] as const) {
        const inclinaison = ouverture * (0.85 + 0.25 * rnd());
        pousser(x2, y2, a + inclinaison * cote, longueurEtage, ordre + 1, epaisseur * 0.42);
      }
      return;
    }

    const d = fiche.dominanceApicale;
    const cote = rnd() < 0.5 ? 1 : -1;
    // L'axe qui continue : d'autant plus droit que la dominance est forte.
    pousser(
      x2,
      y2,
      a + ouverture * (1 - d) * cote * 0.6,
      longueur * (0.7 + 0.3 * d),
      ordre + 1,
      epaisseur * 0.74,
    );
    // Sa sœur latérale.
    pousser(
      x2,
      y2,
      a - ouverture * cote,
      longueur * fiche.ratioLongueur,
      ordre + 1,
      epaisseur * 0.58,
    );
    // Un port fourchu en lance une troisième : c'est ce qui remplit le
    // houppier globuleux du chêne là où le bouleau garde sa flèche.
    if (d < 0.75) {
      pousser(
        x2,
        y2,
        a + ouverture * 1.25 * cote,
        longueur * fiche.ratioLongueur * 0.8,
        ordre + 1,
        epaisseur * 0.46,
      );
    }
  }

  const longueurFut = H * futRelatif;
  segments.push({
    x1: 0,
    y1: 0,
    x2: 0,
    y2: -longueurFut,
    epaisseur: Math.max(1, H * fiche.conicite),
    terminal: false,
    angle: 0,
    rang: 0,
  });
  pousser(0, -longueurFut, 0, H * (1 - futRelatif) * 0.4, 1, H * fiche.conicite * 0.85);
  return segments;
}

/**
 * Dessine un arbre dans le contexte donné, base au point (0, 0), montant vers
 * les y négatifs.
 */
export function dessinerArbre(
  ctx: CanvasRenderingContext2D,
  fiche: FicheGraphique,
  o: OptionsSilhouette,
): Segment[] {
  const segments = squelette(fiche, o);
  const H = o.hauteurPx;

  ctx.lineCap = "round";
  ctx.strokeStyle = fiche.ecorce;
  for (const s of segments) {
    ctx.lineWidth = s.epaisseur;
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
  }

  const part = fiche.sempervirent ? 1 : o.feuillaison;
  if (part <= 0.01) return segments;
  const taille = Math.max(1.8, H * fiche.tailleFeuille);
  const rnd = alea(o.graine * 40503 + 7);
  for (const s of segments) {
    if (!s.terminal || s.rang > part) continue;
    // Un BOUQUET par rameau, pas une feuille : c'est ce qui fait une masse
    // foliaire au lieu d'une brindille décorée. Le nombre suit la taille de
    // feuille — beaucoup de petites pour le bouleau, peu de grandes pour le
    // chêne.
    const n = Math.max(2, Math.round(0.22 / fiche.tailleFeuille));
    for (let i = 0; i < n; i++) {
      const t = rnd();
      const long = 0.15 + 0.85 * rnd();
      const px = s.x1 + (s.x2 - s.x1) * long + (rnd() - 0.5) * taille * 1.1;
      const py = s.y1 + (s.y2 - s.y1) * long + (rnd() - 0.5) * taille * 1.1;
      const sombre = t < 0.45;
      const base = fiche.feuillage[sombre ? 1 : 0];
      ctx.fillStyle =
        o.senescence > 0 ? melange(base, "#c8912f", o.senescence * (0.6 + 0.4 * t)) : base;
      ctx.strokeStyle = ctx.fillStyle;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(s.angle + (t - 0.5) * 1.4);
      ctx.scale(taille, taille);
      ctx.translate(-0.5, -0.5);
      fiche.feuille(ctx);
      ctx.restore();
    }
  }
  return segments;
}

/** Interpolation de deux couleurs `#rrggbb`. */
function melange(a: string, b: string, t: number): string {
  const p = (s: string, i: number) => Number.parseInt(s.slice(1 + i * 2, 3 + i * 2), 16);
  const c = [0, 1, 2].map((i) => Math.round(p(a, i) * (1 - t) + p(b, i) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Cuit une silhouette dans un bitmap, et rend le temps que ça a pris.
 *
 * Le bitmap est dimensionné sur l'encombrement RÉEL du squelette, marge de
 * feuillage comprise : sinon l'arbre sort du cadre par le haut, ce qui est
 * exactement ce qui arrivait à la première version.
 */
export function cuireSilhouette(
  fiche: FicheGraphique,
  o: OptionsSilhouette,
): { bitmap: HTMLCanvasElement; msCuisson: number } {
  const t0 = performance.now();
  const mesure = squelette(fiche, o);
  const marge = Math.max(3, o.hauteurPx * fiche.tailleFeuille * 2.2);
  let minX = 0;
  let maxX = 0;
  let minY = 0;
  for (const s of mesure) {
    minX = Math.min(minX, s.x1, s.x2);
    maxX = Math.max(maxX, s.x1, s.x2);
    minY = Math.min(minY, s.y1, s.y2);
  }
  const c = document.createElement("canvas");
  c.width = Math.max(4, Math.ceil(maxX - minX + 2 * marge));
  c.height = Math.max(4, Math.ceil(-minY + 2 * marge));
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("pas de contexte 2d");
  ctx.translate(-minX + marge, c.height - marge);
  dessinerArbre(ctx, fiche, o);
  return { bitmap: c, msCuisson: performance.now() - t0 };
}
