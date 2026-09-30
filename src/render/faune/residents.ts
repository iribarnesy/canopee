/**
 * **Les habitants qui bougent** (docs/interface-visuelle.md §5.10, lot L9 ;
 * #129).
 *
 * Depuis #255, un gîte occupé se voit : un dôme posé sur l'arbre qui le porte.
 * Ce module fait sortir l'habitant du dôme. La mésange va d'un houppier à
 * l'autre et rentre à sa loge, le pic grimpe aux troncs et va chercher les
 * chandelles, la chevêche guette depuis son trou, la buse tourne au-dessus de
 * son aire, l'écureuil court d'un pied à l'autre.
 *
 * ── **qui, et combien** ─────────────────────────────────────────────────────
 *
 * Exactement ceux du moteur (`Snapshot.faune`), et rien d'autre. Chaque
 * entrée est ancrée à un arbre, et c'est autour de cet arbre que l'animal
 * vit. Le **nombre de corps** suit ce que l'entrée représente, champ que le
 * moteur déclare pour ça (`unite`) : un couple fait deux oiseaux, un individu
 * une bête. Une colonie de chauves-souris et une population de larves ne se
 * posent pas : les unes chassent de nuit — et le rendu n'a pas de nuit —, les
 * autres vivent **dans** le bois. Le loir non plus : il dort le jour, et la
 * moitié de l'année.
 *
 * Il n'y a **pas d'oiseau de passage**. Le moteur ne modélise que les nicheurs
 * installés ; un rouge-gorge de plus en hiver serait une bête que la parcelle
 * n'a pas. Ce qui manque est demandé au moteur (#296), pas dessiné ici.
 *
 * ── **ce qui est de la mise en scène, et le dit** ───────────────────────────
 *
 * Les allures, les rayons de promenade, les durées de halte et les vitesses
 * sont des choix de rendu, pris dans les guides de terrain et nommés ici. La
 * seule chose qu'ils ne font jamais, c'est déplacer un animal loin de l'arbre
 * que le moteur lui a donné.
 *
 * ── **le dérangement** ──────────────────────────────────────────────────────
 *
 * Un chantier du joueur à quelques dizaines de mètres fait fuir ce qui est
 * près : un oiseau s'envole, un écureuil file à sa hutte. Ils reviennent une
 * fois le bruit passé. C'est la réponse d'un animal à un **événement** du
 * moteur (le geste de la semaine), pas une règle nouvelle.
 *
 * Module **pur** : ni Pixi, ni DOM, ni `Math.random`.
 */

import type { GesteVisible } from "../../engine/actions";
import { especeFaune, type IndividuFaune, type UniteDeFaune } from "../../engine/faune";
import { hacher } from "../hachage";
import { hauteurDuGite } from "../temps/habitants";

/** Comment une espèce se déplace, dans le rendu. */
export type Allure = "sautille" | "grimpe" | "guette" | "plane" | "court";

/** La silhouette à cuire. */
export type Dessin =
  | "mesange_bleue"
  | "mesange_charbonniere"
  | "pic"
  | "cheveche"
  | "buse"
  | "ecureuil";

/** Ce que fait l'animal à un instant. */
export type Geste = "perche" | "vol" | "grimpe" | "plane" | "course";

/**
 * Ce que le rendu sait dessiner, par espèce du moteur.
 *
 * **Une fiche de dessin, comme celles des arbres** : la forme d'une mésange
 * n'est pas une donnée de simulation, mais elle ne doit pas être un `if` non
 * plus. Une espèce du moteur sans fiche ici ne se pose pas, et c'est voulu —
 * voir l'en-tête pour celles qui restent invisibles.
 *
 * `tailleM` est la longueur de l'oiseau du bec à la queue, ou de l'écureuil
 * queue comprise ; pour la buse, c'est le corps, les ailes s'y ajoutent.
 */
export const FICHES_DE_RENDU: Readonly<
  Record<string, { allure: Allure; dessin: Dessin; tailleM: number }>
> = {
  mesange_bleue: { allure: "sautille", dessin: "mesange_bleue", tailleM: 0.12 },
  mesange_charbonniere: { allure: "sautille", dessin: "mesange_charbonniere", tailleM: 0.14 },
  pic_epeiche: { allure: "grimpe", dessin: "pic", tailleM: 0.23 },
  chouette_cheveche: { allure: "guette", dessin: "cheveche", tailleM: 0.22 },
  buse_variable: { allure: "plane", dessin: "buse", tailleM: 0.52 },
  ecureuil_roux: { allure: "court", dessin: "ecureuil", tailleM: 0.42 },
};

/** Combien de corps pour une entrée du tableau du moteur. */
export function corpsDe(unite: UniteDeFaune): number {
  switch (unite) {
    case "couple":
      return 2;
    case "individu":
      return 1;
    default:
      return 0;
  }
}

/** Un arbre, tel que les habitants ont besoin de le connaître. */
export interface Perchoir {
  id: number;
  x: number;
  y: number;
  heightM: number;
  /** rayon du houppier / hauteur (moteur, `lumiere.houppierRatio`) */
  houppierRatio: number;
  baseHouppierM: number;
  chandelle?: boolean;
}

/** Un chantier du joueur : où, et quand on l'a appris. */
export interface Derangement {
  x: number;
  y: number;
  depuisMs: number;
}

export interface MondeDesHabitants {
  habitants: readonly IndividuFaune[];
  arbres: readonly Perchoir[];
  derangements?: readonly Derangement[];
}

/** Un habitant, prêt à poser. */
export interface PoseDHabitant {
  /** individu du moteur et rang du corps : ce qui le suit d'une image à l'autre */
  cle: string;
  dessin: Dessin;
  tailleM: number;
  x: number;
  y: number;
  /** hauteur au-dessus du sol, m */
  hauteurM: number;
  geste: Geste;
  capX: number;
  capY: number;
  /** image du battement ou de la foulée, 0 ou 1 */
  battement: 0 | 1;
  opacite: number;
  /** l'arbre où il est posé : il se dessine juste devant lui */
  surArbre?: number;
  /** assez haut pour passer au-dessus de tout ce qui pousse */
  enCiel?: boolean;
}

/** Rayon de promenade d'une mésange autour de sa loge, m. */
export const RAYON_SAUTILLE_M = 14;
/** Rayon où le pic va chercher ses troncs, m. */
export const RAYON_GRIMPE_M = 30;
/** Rayon où la chevêche descend chasser, m. */
export const RAYON_GUETTE_M = 8;
/** Rayon où l'écureuil court, m. */
export const RAYON_COURT_M = 12;
/** Rayon du cercle de la buse, m, et son altitude. */
export const CERCLE_BUSE_M = 22;
export const ALTITUDE_BUSE_M = 32;

/** Vitesses, m/s. */
const VOL_MS = 5;
const PLANE_MS = 7;
const COURSE_MS = 2.5;
const GRIMPE_MS = 0.9;
const MONTEE_DU_PIC_MS = 0.08;

/** Distance d'un chantier en deçà de laquelle un animal fuit, m. */
export const RAYON_DERANGEMENT_M = 25;
/** Temps d'absence après un dérangement, ms. */
export const FUITE_MS = 40_000;

/** Un point où l'animal se tient : au sol, sur un tronc, dans un houppier. */
interface Point3 {
  x: number;
  y: number;
  h: number;
  arbreId?: number;
}

/** Un morceau de la vie d'un corps : un trajet, ou une halte. */
interface Etape {
  debutMs: number;
  finMs: number;
  de: Point3;
  vers: Point3;
  geste: Geste;
  /** visible ? une bête rentrée dans sa loge ou partie ne l'est plus */
  cache?: boolean;
  /** apparaît ou disparaît en fondu sur cette étape */
  fondu?: "entree" | "sortie";
  /** amplitude d'arc du vol, m */
  arc?: number;
  enCiel?: boolean;
}

const SEL_ARBRE = 0x3a91;
const SEL_POINT = 0x5c07;
const SEL_HALTE = 0x61d3;
const SEL_CHOIX = 0x7b2f;

/**
 * Le choix d'un arbre, **stable** quand la liste change : celui dont le hachage
 * est le plus petit. Un arbre qui naît ou meurt ailleurs ne change pas le
 * choix, là où un indice dans la liste le ferait sauter.
 */
function choisir(arbres: readonly Perchoir[], a: number, b: number): Perchoir | undefined {
  let meilleur: Perchoir | undefined;
  let min = 2;
  for (const t of arbres) {
    const v = hacher(t.id, a * 131 + b, SEL_ARBRE);
    if (v < min) {
      min = v;
      meilleur = t;
    }
  }
  return meilleur;
}

/** Un point du houppier, du côté et à la hauteur que dit le hachage. */
function dansLeHouppier(t: Perchoir, a: number, b: number): Point3 {
  const angle = hacher(a, b, SEL_POINT) * Math.PI * 2;
  const rayon = t.houppierRatio * t.heightM * (0.45 + 0.4 * hacher(a, b, SEL_POINT + 1));
  const bas = Math.max(t.baseHouppierM, t.heightM * 0.3);
  const h = bas + (t.heightM - bas) * (0.35 + 0.55 * hacher(a, b, SEL_POINT + 2));
  return { x: t.x + Math.cos(angle) * rayon, y: t.y + Math.sin(angle) * rayon, h, arbreId: t.id };
}

function distance(a: Point3, b: Point3): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.h - a.h);
}

/** Tout ce qu'un corps a besoin de savoir pour planifier la suite. */
interface Contexte {
  gite: Point3;
  voisins: readonly Perchoir[];
  chandelles: readonly Perchoir[];
  graine: number;
}

/** Un saut : un vol vers un point, puis une halte. */
function sauter(de: Point3, vers: Point3, t: number, halteMs: number, arc: number): Etape[] {
  const vol = Math.min(3000, Math.max(400, (distance(de, vers) / VOL_MS) * 1000));
  return [
    { debutMs: t, finMs: t + vol, de, vers, geste: "vol", arc },
    { debutMs: t + vol, finMs: t + vol + halteMs, de: vers, vers, geste: "perche" },
  ];
}

/**
 * La suite de la vie d'un corps, à partir de `ici` : un lot d'étapes. C'est
 * l'allure qui décide, et le hachage de (graine, rang) qui choisit.
 */
function suite(allure: Allure, ctx: Contexte, ici: Point3, rang: number, t: number): Etape[] {
  const g = ctx.graine;
  const u = hacher(g, rang, SEL_CHOIX);
  const halte = (min: number, max: number) => min + hacher(g, rang, SEL_HALTE) * (max - min);
  switch (allure) {
    case "sautille": {
      // Une fois sur quatre, retour à la loge : on la voit entrer, et
      // l'oiseau reste dedans un moment.
      if (u < 0.25 || ctx.voisins.length === 0) {
        const [vol, perche] = sauter(ici, ctx.gite, t, 1200, 0.4) as [Etape, Etape];
        const dedans = {
          debutMs: perche.finMs,
          finMs: perche.finMs + halte(3000, 9000),
          de: ctx.gite,
          vers: ctx.gite,
          geste: "perche" as const,
          cache: true,
        };
        return [vol, perche, dedans];
      }
      const arbre = choisir(ctx.voisins, g, rang);
      if (!arbre) return [];
      return sauter(ici, dansLeHouppier(arbre, g, rang), t, halte(2500, 7000), 0.5);
    }
    case "grimpe": {
      // Le pic va chercher le bois mort : une halte sur deux sur une chandelle,
      // quand il y en a. C'est là qu'il trouve ses larves.
      const pool = ctx.chandelles.length > 0 && u < 0.55 ? ctx.chandelles : ctx.voisins;
      if (u > 0.85 || pool.length === 0) return sauter(ici, ctx.gite, t, halte(3000, 6000), 0.6);
      const arbre = choisir(pool, g, rang);
      if (!arbre) return [];
      const depart: Point3 = {
        x: arbre.x,
        y: arbre.y,
        h: arbre.heightM * (0.25 + 0.3 * hacher(g, rang, SEL_POINT)),
        arbreId: arbre.id,
      };
      const duree = halte(6000, 14000);
      // Il grimpe le long du fût pendant sa halte, sans dépasser la cime.
      const haut: Point3 = {
        ...depart,
        h: Math.min(arbre.heightM * 0.9, depart.h + (MONTEE_DU_PIC_MS * duree) / 1000),
      };
      const [vol] = sauter(ici, depart, t, 0, 0.8) as [Etape];
      return [
        vol,
        { debutMs: vol.finMs, finMs: vol.finMs + duree, de: depart, vers: haut, geste: "grimpe" },
      ];
    }
    case "guette": {
      // La chevêche guette de sa loge, et descend de temps en temps sur une
      // proie au sol, tout près.
      if (u < 0.3 && ici.arbreId !== undefined) {
        const angle = hacher(g, rang, SEL_POINT) * Math.PI * 2;
        const r = 2 + hacher(g, rang, SEL_POINT + 1) * (RAYON_GUETTE_M - 2);
        const sol: Point3 = {
          x: ctx.gite.x + Math.cos(angle) * r,
          y: ctx.gite.y + Math.sin(angle) * r,
          h: 0,
        };
        return sauter(ici, sol, t, halte(2500, 5000), 0.2);
      }
      return sauter(ici, ctx.gite, t, halte(15000, 35000), 0.3);
    }
    case "plane": {
      // La buse monte en spirale, tourne au-dessus de son aire, puis revient s'y
      // poser. Un tour de cercle dure une vingtaine de secondes.
      if (ici.h < ALTITUDE_BUSE_M / 2) {
        const angle = hacher(g, rang, SEL_POINT) * Math.PI * 2;
        const rayon = CERCLE_BUSE_M * (0.8 + 0.4 * hacher(g, rang, SEL_POINT + 1));
        const cercle: Point3 = {
          x: ctx.gite.x + Math.cos(angle) * rayon,
          y: ctx.gite.y + Math.sin(angle) * rayon,
          h: ALTITUDE_BUSE_M,
        };
        const montee = (distance(ici, cercle) / 3) * 1000;
        const tours = 2 + Math.floor(u * 4);
        const periode = ((2 * Math.PI * rayon) / PLANE_MS) * 1000;
        return [
          { debutMs: t, finMs: t + montee, de: ici, vers: cercle, geste: "vol", arc: 3 },
          {
            debutMs: t + montee,
            finMs: t + montee + tours * periode,
            de: { ...ctx.gite, h: ALTITUDE_BUSE_M },
            vers: { x: angle, y: rayon, h: ALTITUDE_BUSE_M },
            geste: "plane",
            enCiel: true,
          },
        ];
      }
      const descente = (distance(ici, ctx.gite) / 4) * 1000;
      return [
        { debutMs: t, finMs: t + descente, de: ici, vers: ctx.gite, geste: "vol", arc: 2 },
        {
          debutMs: t + descente,
          finMs: t + descente + halte(20000, 40000),
          de: ctx.gite,
          vers: ctx.gite,
          geste: "perche",
        },
      ];
    }
    case "court": {
      // L'écureuil descend de son arbre, court au pied d'un voisin, y monte.
      const arbre = choisir(ctx.voisins, g, rang);
      if (!arbre) return [];
      const vers = dansLeHouppier(arbre, g, rang);
      const etapes: Etape[] = [];
      let pos = ici;
      let tt = t;
      const aller = (cible: Point3, geste: Geste, vitesse: number) => {
        const d = (distance(pos, cible) / vitesse) * 1000;
        etapes.push({ debutMs: tt, finMs: tt + d, de: pos, vers: cible, geste });
        tt += d;
        pos = cible;
      };
      if (pos.h > 0.05) aller({ x: pos.x, y: pos.y, h: 0 }, "grimpe", GRIMPE_MS);
      aller({ x: arbre.x, y: arbre.y, h: 0, arbreId: arbre.id }, "course", COURSE_MS);
      aller({ ...vers, x: arbre.x, y: arbre.y }, "grimpe", GRIMPE_MS);
      etapes.push({
        debutMs: tt,
        finMs: tt + halte(4000, 10000),
        de: pos,
        vers: pos,
        geste: "perche",
      });
      return etapes;
    }
  }
}

/** Où est le corps pendant une étape, et vers où il regarde. */
function dansLEtape(e: Etape, t: number): { p: Point3; capX: number; capY: number } {
  const k = Math.min(1, Math.max(0, (t - e.debutMs) / Math.max(1, e.finMs - e.debutMs)));
  if (e.geste === "plane") {
    // Le cercle : `vers` porte l'angle de départ et le rayon.
    const centre = e.de;
    const rayon = e.vers.y;
    const angle = e.vers.x + ((t - e.debutMs) / 1000) * (PLANE_MS / rayon);
    return {
      p: {
        x: centre.x + Math.cos(angle) * rayon,
        y: centre.y + Math.sin(angle) * rayon,
        // Une houle de deux mètres : la buse monte et descend dans son
        // ascendance. Nulle au départ, pour que l'entrée dans le cercle ne saute pas.
        h: e.vers.h + Math.sin((angle - e.vers.x) * 0.5) * 2,
      },
      capX: -Math.sin(angle),
      capY: Math.cos(angle),
    };
  }
  const dx = e.vers.x - e.de.x;
  const dy = e.vers.y - e.de.y;
  const d = Math.hypot(dx, dy);
  const h = e.de.h + (e.vers.h - e.de.h) * k + (e.arc ?? 0) * Math.sin(Math.PI * k);
  const p: Point3 = { x: e.de.x + dx * k, y: e.de.y + dy * k, h };
  const arbre = k < 1 ? (e.geste === "vol" ? undefined : e.de.arbreId) : e.vers.arbreId;
  if (arbre !== undefined) p.arbreId = arbre;
  return d > 0.01 ? { p, capX: dx / d, capY: dy / d } : { p, capX: 1, capY: 0 };
}

interface Corps {
  cle: string;
  individuId: number;
  etapes: Etape[];
  rang: number;
  /** les dérangements déjà vécus, pour ne pas fuir deux fois du même */
  vus: Set<Derangement>;
  /** le dernier cap, gardé pendant une halte pour que la bête ne se retourne pas */
  capX: number;
  capY: number;
}

/**
 * Au-delà de ce retard, un corps ne rejoue pas ce qu'on n'a pas regardé : il
 * reprend à l'instant présent, là où il est.
 */
const RATTRAPAGE_MAX_MS = 2 * 60_000;

/**
 * Les résidents : la vie de chaque corps, planifiée au fil du temps et jamais
 * recalculée en arrière — la même raison que le troupeau des chevreuils.
 */
export class Residents {
  private readonly corps = new Map<string, Corps>();

  /**
   * Ce qui se déduit du monde — le gîte, les voisins, les chandelles de chaque
   * habitant —, gardé tant que les habitants et les arbres sont les mêmes
   * objets. Ils changent une fois par instantané ; la boucle d'images relit
   * soixante fois par seconde.
   */
  private lu?: {
    habitants: MondeDesHabitants["habitants"];
    arbres: MondeDesHabitants["arbres"];
    vies: {
      individuId: number;
      fiche: (typeof FICHES_DE_RENDU)[string];
      corps: number;
      ctx: Omit<Contexte, "graine">;
    }[];
  };

  poses(monde: MondeDesHabitants, tMs: number): PoseDHabitant[] {
    if (this.lu?.habitants !== monde.habitants || this.lu.arbres !== monde.arbres) {
      this.lu = { habitants: monde.habitants, arbres: monde.arbres, vies: lireLeMonde(monde) };
    }
    const sorties: PoseDHabitant[] = [];
    const vivants = new Set<string>();
    for (const vie of this.lu.vies) {
      for (let k = 0; k < vie.corps; k++) {
        const cle = `${vie.individuId}:${k}`;
        vivants.add(cle);
        const ctx: Contexte = { ...vie.ctx, graine: vie.individuId * 7 + k };
        const pose = this.poseDuCorps(
          cle,
          vie.individuId,
          vie.fiche,
          ctx,
          monde.derangements ?? [],
          tMs,
        );
        if (pose) sorties.push(pose);
      }
    }
    // Un habitant parti — le moteur l'a retiré — ne laisse pas son corps.
    for (const cle of this.corps.keys()) if (!vivants.has(cle)) this.corps.delete(cle);
    return sorties;
  }

  private poseDuCorps(
    cle: string,
    individuId: number,
    fiche: { allure: Allure; dessin: Dessin; tailleM: number },
    ctx: Contexte,
    derangements: readonly Derangement[],
    tMs: number,
  ): PoseDHabitant | undefined {
    let c = this.corps.get(cle);
    if (!c) {
      // Première image : la bête est à sa loge, et commence sa journée à une
      // phase à elle.
      const decalage = hacher(ctx.graine, 0, SEL_HALTE + 9) * 6000;
      c = {
        cle,
        individuId,
        etapes: [
          {
            debutMs: tMs - 1,
            finMs: tMs + decalage,
            de: ctx.gite,
            vers: ctx.gite,
            geste: "perche",
          },
        ],
        rang: 0,
        vus: new Set(),
        capX: 1,
        capY: 0,
      };
      this.corps.set(cle, c);
    }

    // Le dérangement : s'il vient d'arriver près de la bête, elle part.
    for (const d of derangements) {
      if (c.vus.has(d) || tMs < d.depuisMs || tMs > d.depuisMs + FUITE_MS) continue;
      c.vus.add(d);
      const ici = this.ou(c, tMs)?.p ?? ctx.gite;
      if (Math.hypot(ici.x - d.x, ici.y - d.y) > RAYON_DERANGEMENT_M) continue;
      c.etapes = fuir(fiche.allure, ctx, ici, d, tMs);
    }

    // Planifier ce qui manque, dans l'ordre du temps.
    let derniere = c.etapes[c.etapes.length - 1];
    if (derniere && tMs - derniere.finMs > RATTRAPAGE_MAX_MS) {
      const la = dansLEtape(derniere, derniere.finMs).p;
      c.etapes = [{ debutMs: tMs - 1, finMs: tMs, de: la, vers: la, geste: "perche" }];
      derniere = c.etapes[0];
    }
    let garde = 0;
    while (derniere && derniere.finMs <= tMs && garde++ < 64) {
      c.rang++;
      // On repart d'où l'étape a **laissé** la bête, pas de son `vers` : sur un
      // cercle de buse, `vers` porte l'angle et le rayon, pas une position.
      const la = dansLEtape(derniere, derniere.finMs).p;
      const suivantes = suite(fiche.allure, ctx, la, c.rang, derniere.finMs);
      if (suivantes.length === 0) {
        suivantes.push({
          debutMs: derniere.finMs,
          finMs: derniere.finMs + 5000,
          de: la,
          vers: la,
          geste: "perche",
        });
      }
      c.etapes = suivantes;
      derniere = suivantes[suivantes.length - 1];
    }

    const ou = this.ou(c, tMs);
    if (!ou || ou.etape.cache) return undefined;
    const e = ou.etape;
    if (e.geste !== "perche") {
      c.capX = ou.capX;
      c.capY = ou.capY;
    } else if (e.vers.arbreId !== undefined && e.vers.h > 0) {
      // Perché, il regarde tantôt d'un côté, tantôt de l'autre : c'est ce qui
      // fait un oiseau vivant plutôt qu'une figurine.
      const tour = Math.floor((tMs - e.debutMs) / 1600);
      c.capX = hacher(ctx.graine, c.rang * 17 + tour, SEL_POINT + 5) < 0.5 ? 1 : -1;
      c.capY = 0;
    }
    let opacite = 1;
    if (e.fondu === "sortie") opacite = Math.max(0, (e.finMs - tMs) / (e.finMs - e.debutMs));
    if (e.fondu === "entree") opacite = Math.min(1, (tMs - e.debutMs) / (e.finMs - e.debutMs));
    const periode = e.geste === "course" ? 140 : 90;
    return {
      cle,
      dessin: fiche.dessin,
      tailleM: fiche.tailleM,
      x: ou.p.x,
      y: ou.p.y,
      hauteurM: Math.max(0, ou.p.h),
      geste: e.geste,
      capX: c.capX,
      capY: c.capY,
      battement: (Math.floor(tMs / periode) % 2) as 0 | 1,
      opacite,
      ...(ou.p.arbreId !== undefined && e.geste !== "vol" ? { surArbre: ou.p.arbreId } : {}),
      ...(e.enCiel || ou.p.h > 15 ? { enCiel: true } : {}),
    };
  }

  private ou(c: Corps, tMs: number) {
    for (const e of c.etapes) {
      if (tMs >= e.debutMs && tMs < e.finMs) return { etape: e, ...dansLEtape(e, tMs) };
    }
    const e = c.etapes[c.etapes.length - 1];
    return e ? { etape: e, ...dansLEtape(e, e.finMs) } : undefined;
  }
}

/** Chaque habitant visible, avec son gîte et les arbres autour. */
function lireLeMonde(monde: MondeDesHabitants) {
  const parId = new Map(monde.arbres.map((a) => [a.id, a]));
  const vies = [];
  for (const individu of monde.habitants) {
    const fiche = FICHES_DE_RENDU[individu.especeId];
    const espece = especeFaune(individu.especeId);
    const arbre = parId.get(individu.arbreId);
    if (!fiche || !espece || !arbre) continue;
    const corps = corpsDe(espece.unite);
    if (corps === 0) continue;
    const gite: Point3 = {
      x: individu.x,
      y: individu.y,
      h: hauteurDuGite(espece.hauteurGiteMinM, arbre.heightM),
      arbreId: arbre.id,
    };
    const rayon =
      fiche.allure === "grimpe"
        ? RAYON_GRIMPE_M
        : fiche.allure === "court"
          ? RAYON_COURT_M
          : RAYON_SAUTILLE_M;
    const proche = (a: Perchoir) => Math.hypot(a.x - gite.x, a.y - gite.y) <= rayon;
    const voisins = monde.arbres.filter(
      (a) => !a.chandelle && a.heightM >= (fiche.allure === "grimpe" ? 5 : 2) && proche(a),
    );
    const chandelles =
      fiche.allure === "grimpe"
        ? monde.arbres.filter((a) => a.chandelle && a.heightM >= 3 && proche(a))
        : [];
    vies.push({ individuId: individu.id, fiche, corps, ctx: { gite, voisins, chandelles } });
  }
  return vies;
}

/**
 * La fuite : l'oiseau s'envole loin du chantier et disparaît, l'écureuil file
 * à sa hutte et s'y cache ; tous reviennent quand le bruit est passé.
 */
function fuir(allure: Allure, ctx: Contexte, ici: Point3, d: Derangement, t: number): Etape[] {
  const fin = d.depuisMs + FUITE_MS;
  if (allure === "court") {
    const pied: Point3 = { x: ctx.gite.x, y: ctx.gite.y, h: 0, arbreId: ctx.gite.arbreId };
    const course = (distance(ici, pied) / (COURSE_MS * 1.6)) * 1000;
    const montee = (ctx.gite.h / GRIMPE_MS) * 1000;
    return [
      { debutMs: t, finMs: t + course, de: ici, vers: pied, geste: "course" },
      {
        debutMs: t + course,
        finMs: t + course + montee,
        de: pied,
        vers: ctx.gite,
        geste: "grimpe",
      },
      {
        debutMs: t + course + montee,
        finMs: Math.max(fin, t + course + montee + 1),
        de: ctx.gite,
        vers: ctx.gite,
        geste: "perche",
        cache: true,
      },
    ];
  }
  const dx = ici.x - d.x;
  const dy = ici.y - d.y;
  const n = Math.hypot(dx, dy) || 1;
  const loin: Point3 = { x: ici.x + (dx / n) * 30, y: ici.y + (dy / n) * 30, h: ici.h + 10 };
  const vol = (distance(ici, loin) / (VOL_MS * 1.8)) * 1000;
  const retour = (distance(loin, ctx.gite) / VOL_MS) * 1000;
  return [
    { debutMs: t, finMs: t + vol, de: ici, vers: loin, geste: "vol", fondu: "sortie", arc: 1 },
    {
      debutMs: t + vol,
      finMs: Math.max(fin, t + vol + 1),
      de: loin,
      vers: loin,
      geste: "vol",
      cache: true,
    },
    {
      debutMs: Math.max(fin, t + vol + 1),
      finMs: Math.max(fin, t + vol + 1) + retour,
      de: loin,
      vers: ctx.gite,
      geste: "vol",
      fondu: "entree",
      arc: 1,
    },
  ];
}

/** Deux dérangements plus proches que ça n'en font qu'un, m. */
const ECART_DES_DERANGEMENTS_M = 15;

/**
 * Les dérangements d'un journal : où le joueur a travaillé.
 *
 * Tout geste compte, sauf ceux dont le gibier est l'auteur (`brouter`,
 * `frotter`) : un chevreuil qui broute ne fait pas fuir la mésange. Un
 * chantier d'un hectare nomme des milliers d'arbres ; on n'en garde que des
 * points espacés, chacun portant son rayon de fuite, ce qui couvre la même
 * surface sans mille entrées.
 */
export function derangementsDuJournal(
  gestes: readonly GesteVisible[],
  positionDe: (id: number) => { x: number; y: number } | undefined,
  coteM: number,
  depuisMs: number,
): Derangement[] {
  const points: { x: number; y: number }[] = [];
  for (const g of gestes) {
    if (g.type === "brouter" || g.type === "frotter") continue;
    if ("cellules" in g) {
      for (const c of g.cellules)
        points.push({ x: (c % coteM) + 0.5, y: Math.floor(c / coteM) + 0.5 });
    } else {
      // Un arbre coupé a quitté l'instantané : sa position voyage dans `retire`.
      const retires = new Map((g.retire ?? []).map((r) => [r.id, r]));
      for (const id of g.ids) {
        const p = retires.get(id) ?? positionDe(id);
        if (p) points.push({ x: p.x, y: p.y });
      }
    }
  }
  const garde: Derangement[] = [];
  for (const p of points) {
    if (garde.some((d) => Math.hypot(d.x - p.x, d.y - p.y) < ECART_DES_DERANGEMENTS_M)) continue;
    garde.push({ x: p.x, y: p.y, depuisMs });
  }
  return garde;
}
