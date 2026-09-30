/**
 * **Les chevreuils qui passent** (docs/interface-visuelle.md §5.10, lot L9 ;
 * #129).
 *
 * Le moteur a du gibier depuis longtemps, et il ne le montrait qu'en creux : une
 * flèche coupée, une écorce arrachée, une ligne dans le journal. Ce module met
 * l'animal lui-même sur la parcelle, et il ne décide de rien que le moteur n'ait
 * déjà dit.
 *
 * ── **combien** ─────────────────────────────────────────────────────────────
 *
 * Le moteur fait brouter et frotter une **densité** : `gibierParHa ×
 * pressionGibier` têtes par hectare (`tick.ts`, le produit qu'il passe à
 * `brouter` et à `frottisDeLaSemaine`). Multipliée par la surface où la bête
 * peut entrer, c'est le nombre de chevreuils présents **en moyenne** sur la
 * parcelle. Sur un hectare de bocage, c'est de l'ordre de 0,2 : un chevreuil un
 * cinquième du temps, et c'est ce qu'on montre — une bête qui passe de temps en
 * temps, pas un troupeau à demeure. La chasse fait baisser la pression, donc la
 * fréquence des visites ; une clôture retire sa surface.
 *
 * Chaque tête entière est une **place** occupée en permanence, la fraction
 * restante une place occupée cette part du temps. Le temps d'occupation est
 * celui qui passe à l'écran, pas celui du jeu : une présence moyenne est une
 * part du temps qu'on regarde.
 *
 * ── **où** ──────────────────────────────────────────────────────────────────
 *
 * Les **témoins** d'abord : les arbres que le moteur a broutés ou frottés ces
 * dernières semaines (`brouteSemaine`, `frotteSemaine`). Là, une bête est
 * réellement passée, et la montrer à ce pied-là est exactement ce que le moteur
 * a fait. Faute de témoin, le chevreuil broute l'**herbe** — le moteur en
 * prélève aussi (`herbeConsommee`) —, sur une cellule où il peut entrer.
 *
 * Il n'entre **jamais** dans une cellule close : le moteur respecte la clôture,
 * le chemin aussi. Une visite dont aucun chemin n'évite la clôture n'a pas lieu.
 *
 * ── **ce qui est de la mise en scène, et le dit** ───────────────────────────
 *
 * Les chemins, les durées de halte, l'allure et la présence minimale les
 * semaines où il y a des témoins sont des choix de rendu. Ils sont nommés et
 * réglables ici, et aucun ne change ce que la parcelle contient.
 *
 * Module **pur** : ni Pixi, ni DOM, ni `Math.random`. Tout tirage est un
 * hachage de la place et du rang de la visite.
 */

import { hacher } from "../hachage";

/** Un arbre, tel que le gibier a besoin de le connaître. */
export interface ArbreDuGibier {
  id: number;
  x: number;
  y: number;
  /** semaine du dernier abroutissement (moteur) */
  brouteSemaine?: number;
  /** semaine du dernier frottis (moteur) */
  frotteSemaine?: number;
}

/** Ce que les chevreuils ont besoin de savoir de la parcelle, cette semaine. */
export interface MondeDuGibier {
  coteM: number;
  /** semaine absolue de l'instantané */
  semaine: number;
  /** `gibierParHa × pressionGibier`, têtes par hectare — la densité du moteur */
  densiteParHa: number;
  /** cellules closes (≠ 0) — le gibier n'y entre pas */
  cloture: ArrayLike<number>;
  arbres: readonly ArbreDuGibier[];
  /** cellules où l'on n'envoie pas brouter (l'eau libre) ; absent = aucune */
  interdite?: (cellule: number) => boolean;
}

/**
 * Nombre maximal de chevreuils posés à la fois.
 *
 * Au-delà, une parcelle devient un enclos. La densité du moteur n'y arrive
 * qu'en poussant la pression au plafond sur une grande parcelle, et c'est la
 * seule borne de ce module qui retire quelque chose : elle est dite.
 */
export const MAX_CHEVREUILS = 6;

/**
 * Depuis combien de semaines un arbre brouté ou frotté reste un **témoin**.
 *
 * Deux : l'instantané arrive après la semaine qui l'a produit, et une semaine
 * de marge rattrape ce décalage sans promener la bête sur des dégâts d'il y a
 * un mois.
 */
export const TEMOIN_SEMAINES = 2;

/**
 * Présence minimale de la première place, les semaines où il y a des témoins.
 *
 * **Un choix de mise en scène, pas une donnée.** Le moteur a brouté : une bête
 * est venue, et à 0,2 de présence on regarderait souvent la parcelle abîmée
 * sans jamais voir qui l'a fait. La moitié du temps suffit à ce qu'on la voie.
 */
export const PRESENCE_TEMOIN = 0.5;

/** Allure d'un chevreuil qui chemine sans être inquiété, m/s. */
export const VITESSE_MARCHE_MS = 1.1;

/** Longueur d'une foulée, m : ce qui fait alterner les deux images de la marche. */
export const FOULEE_M = 0.5;

/** Temps d'apparition et de disparition, au bord de la parcelle, ms. */
export const FONDU_MS = 1200;

/** Durée d'une halte, ms : de quoi brouter, lever la tête, brouter encore. */
export const HALTE_MIN_MS = 9000;
export const HALTE_MAX_MS = 16000;

/** Nombre maximal de haltes dans une visite. */
export const HALTES_MAX = 3;

/** Distance maximale entre deux haltes d'une même visite, m. */
export const PAS_ENTRE_HALTES_M = 8;

/** Part des visites de broutage faites par un brocard plutôt qu'une chevrette. */
export const PART_DE_BROCARDS = 0.4;

/** Écart entre la bête et le pied qu'elle broute ou frotte, m. */
const RECUL_AU_PIED_M = 0.55;

/** Pas d'échantillonnage d'un chemin, pour y chercher une clôture, m. */
const PAS_DE_CHEMIN_M = 0.5;

const SEL_PHASE = 0x51f0;
const SEL_CIBLE = 0x2a17;
const SEL_BORD = 0x6c33;
const SEL_HALTE = 0x7e05;
const SEL_SEXE = 0x13b9;
const SEL_PAUSE = 0x4d21;

/** Ce que fait la bête à un instant. */
export type Attitude = "marche" | "broute" | "guette" | "frotte";

/** Un chevreuil, prêt à poser. */
export interface PoseDuChevreuil {
  /** la place qu'il occupe : c'est elle qui le suit d'une image à l'autre */
  place: number;
  x: number;
  y: number;
  attitude: Attitude;
  /** direction du regard, dans le plan de la parcelle (unitaire) */
  capX: number;
  capY: number;
  /** image de la marche, 0 ou 1 */
  pas: 0 | 1;
  opacite: number;
  brocard: boolean;
}

interface Point {
  x: number;
  y: number;
}

/** Un morceau de visite : un trajet, ou une halte. */
export type Etape =
  | { sorte: "marche"; de: Point; vers: Point; debutMs: number; finMs: number }
  | {
      sorte: "halte";
      au: Point;
      /** ce vers quoi la bête regarde : le pied, ou l'herbe devant elle */
      cap: Point;
      geste: "broute" | "frotte";
      debutMs: number;
      finMs: number;
      /** sel propre à la halte : c'est lui qui rythme broute et guette */
      sel: number;
      arbreId?: number;
    };

/** Une visite : l'entrée, les haltes, la sortie. */
export interface Visite {
  place: number;
  rang: number;
  debutMs: number;
  finMs: number;
  brocard: boolean;
  etapes: readonly Etape[];
}

/**
 * La part du temps où chaque place est occupée.
 *
 * `floor(n)` places pleines, puis une place à la part restante. Les semaines à
 * témoins, la première place ne descend pas sous `PRESENCE_TEMOIN`.
 */
export function presencesDuGibier(
  densiteParHa: number,
  surfaceOuverteHa: number,
  temoins: boolean,
): number[] {
  const attendus = Math.max(0, densiteParHa) * Math.max(0, surfaceOuverteHa);
  const places: number[] = [];
  for (let k = 0; k < MAX_CHEVREUILS && attendus - k > 0; k++) {
    places.push(Math.min(1, attendus - k));
  }
  if (temoins && surfaceOuverteHa > 0) {
    places[0] = Math.max(places[0] ?? 0, PRESENCE_TEMOIN);
  }
  return places;
}

/** La surface où le gibier peut entrer, ha. */
export function surfaceOuverteHa(monde: Pick<MondeDuGibier, "coteM" | "cloture">): number {
  const n = monde.coteM * monde.coteM;
  let ouvertes = 0;
  for (let i = 0; i < n; i++) if (!monde.cloture[i]) ouvertes++;
  return ouvertes / 10_000;
}

/**
 * Les arbres broutés ou frottés ces dernières semaines, hors clôture.
 *
 * Chaque témoin ne garde que les gestes **récents** : un pied frotté il y a
 * trois ans et brouté cette semaine est un témoin de broutage, pas de frottis.
 */
export function temoinsDuGibier(monde: MondeDuGibier): ArbreDuGibier[] {
  const recent = (s: number | undefined): s is number =>
    s !== undefined && monde.semaine >= s && monde.semaine - s <= TEMOIN_SEMAINES;
  const temoins: ArbreDuGibier[] = [];
  for (const a of monde.arbres) {
    const broute = recent(a.brouteSemaine);
    const frotte = recent(a.frotteSemaine);
    if (!(broute || frotte) || !ouverte(monde, a.x, a.y)) continue;
    temoins.push({
      id: a.id,
      x: a.x,
      y: a.y,
      ...(broute ? { brouteSemaine: a.brouteSemaine } : {}),
      ...(frotte ? { frotteSemaine: a.frotteSemaine } : {}),
    });
  }
  return temoins;
}

function cellule(monde: Pick<MondeDuGibier, "coteM">, x: number, y: number): number {
  const c = monde.coteM;
  const ix = Math.min(c - 1, Math.max(0, Math.floor(x)));
  const iy = Math.min(c - 1, Math.max(0, Math.floor(y)));
  return iy * c + ix;
}

function ouverte(monde: Pick<MondeDuGibier, "coteM" | "cloture">, x: number, y: number): boolean {
  return !monde.cloture[cellule(monde, x, y)];
}

/** Le chemin reste-t-il hors des cellules closes ? */
export function cheminLibre(
  monde: Pick<MondeDuGibier, "coteM" | "cloture">,
  de: Point,
  vers: Point,
): boolean {
  const d = Math.hypot(vers.x - de.x, vers.y - de.y);
  const n = Math.max(1, Math.ceil(d / PAS_DE_CHEMIN_M));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (!ouverte(monde, de.x + (vers.x - de.x) * t, de.y + (vers.y - de.y) * t)) return false;
  }
  return true;
}

/**
 * Les quatre points d'entrée possibles pour atteindre `cible`, du plus proche
 * au plus lointain : la bête sort du bois par le bord le plus court.
 */
function entrees(coteM: number, cible: Point, alea: number): Point[] {
  const bord = 0.3;
  const glisse = (v: number) =>
    Math.min(coteM - bord, Math.max(bord, v + (alea - 0.5) * Math.min(16, coteM * 0.3)));
  const candidats = [
    { d: cible.x, p: { x: bord, y: glisse(cible.y) } },
    { d: coteM - cible.x, p: { x: coteM - bord, y: glisse(cible.y) } },
    { d: cible.y, p: { x: glisse(cible.x), y: bord } },
    { d: coteM - cible.y, p: { x: glisse(cible.x), y: coteM - bord } },
  ];
  return candidats.sort((a, b) => a.d - b.d).map((c) => c.p);
}

/** Un point du bord, pour repartir : n'importe lequel des quatre. */
function sorties(coteM: number, a: number, b: number): Point[] {
  const bord = 0.3;
  const le = (t: number) => bord + t * (coteM - 2 * bord);
  const tous = [
    { x: bord, y: le(b) },
    { x: coteM - bord, y: le(b) },
    { x: le(b), y: bord },
    { x: le(b), y: coteM - bord },
  ];
  const premier = Math.floor(a * 4);
  return [0, 1, 2, 3].map((k) => tous[(premier + k) % 4] as Point);
}

/** Le point où la bête se tient pour brouter un pied, venant de `depuis`. */
function auPied(pied: Point, depuis: Point): Point {
  const dx = depuis.x - pied.x;
  const dy = depuis.y - pied.y;
  const d = Math.hypot(dx, dy) || 1;
  return { x: pied.x + (dx / d) * RECUL_AU_PIED_M, y: pied.y + (dy / d) * RECUL_AU_PIED_M };
}

interface Halte {
  pied: Point;
  geste: "broute" | "frotte";
  arbreId?: number;
}

/** Les haltes d'une visite : des témoins voisins, ou de l'herbe. */
function haltesDeLaVisite(
  monde: MondeDuGibier,
  temoins: readonly ArbreDuGibier[],
  place: number,
  rang: number,
  frottis: boolean,
): Halte[] {
  const combien = 1 + Math.floor(hacher(place, rang, SEL_HALTE) * HALTES_MAX);
  if (temoins.length > 0) {
    // Un frottis se fait au pied frotté, un broutage au pied brouté : la halte
    // montre le geste que le moteur a fait à **cet** arbre.
    const garde = temoins.filter((a) =>
      frottis ? a.frotteSemaine !== undefined : a.brouteSemaine !== undefined,
    );
    const pool = garde.length > 0 ? garde : temoins;
    const premier = pool[Math.floor(hacher(place, rang, SEL_CIBLE) * pool.length)];
    if (!premier) return [];
    const haltes: Halte[] = [];
    const pris = new Set<number>();
    let courant: ArbreDuGibier = premier;
    for (let k = 0; k < combien; k++) {
      pris.add(courant.id);
      const frotte = frottis && courant.frotteSemaine !== undefined;
      haltes.push({
        pied: { x: courant.x, y: courant.y },
        geste: frotte ? "frotte" : "broute",
        arbreId: courant.id,
      });
      // Le témoin suivant est un voisin : une bête broute de proche en proche,
      // elle ne traverse pas la parcelle entre deux bouchées.
      let suivant: ArbreDuGibier | undefined;
      let meilleur = PAS_ENTRE_HALTES_M;
      for (const a of pool) {
        if (pris.has(a.id)) continue;
        const d = Math.hypot(a.x - courant.x, a.y - courant.y);
        if (d < meilleur && d > 0.6) {
          meilleur = d;
          suivant = a;
        }
      }
      if (!suivant) break;
      courant = suivant;
    }
    return haltes;
  }
  const c = monde.coteM;
  const haltes: Halte[] = [];
  for (let essai = 0; essai < 16 && haltes.length < combien; essai++) {
    const precedente = haltes[haltes.length - 1];
    const u = hacher(place * 31 + essai, rang, SEL_CIBLE);
    const v = hacher(place * 31 + essai, rang, SEL_CIBLE + 1);
    const pied = precedente
      ? {
          x: Math.min(c - 0.5, Math.max(0.5, precedente.pied.x + (u - 0.5) * PAS_ENTRE_HALTES_M)),
          y: Math.min(c - 0.5, Math.max(0.5, precedente.pied.y + (v - 0.5) * PAS_ENTRE_HALTES_M)),
        }
      : { x: 0.5 + u * (c - 1), y: 0.5 + v * (c - 1) };
    if (!ouverte(monde, pied.x, pied.y)) continue;
    if (monde.interdite?.(cellule(monde, pied.x, pied.y))) continue;
    haltes.push({ pied, geste: "broute" });
  }
  return haltes;
}

/**
 * La visite de rang `rang` sur la place `place`, qui commence à `debutMs` — ou
 * rien, si aucun chemin n'évite la clôture.
 */
export function planifierLaVisite(
  monde: MondeDuGibier,
  place: number,
  rang: number,
  debutMs: number,
  temoins: readonly ArbreDuGibier[] = temoinsDuGibier(monde),
): Visite | undefined {
  const c = monde.coteM;
  if (c <= 1) return undefined;
  // Un frottis est l'affaire d'un brocard. Les semaines où le moteur en a fait,
  // une visite sur deux vient le montrer.
  const frottes = temoins.some((a) => a.frotteSemaine !== undefined);
  const frottis = frottes && hacher(place, rang, SEL_SEXE + 7) < 0.5;
  const brocard = frottis || hacher(place, rang, SEL_SEXE) < PART_DE_BROCARDS;

  const haltes = haltesDeLaVisite(monde, temoins, place, rang, frottis);
  const premiere = haltes[0];
  if (!premiere) return undefined;

  // L'entrée : le bord le plus proche dont le chemin évite la clôture.
  let entree: Point | undefined;
  let premierArret: Point | undefined;
  for (const e of entrees(c, premiere.pied, hacher(place, rang, SEL_BORD))) {
    const arret = premiere.arbreId === undefined ? premiere.pied : auPied(premiere.pied, e);
    if (ouverte(monde, e.x, e.y) && cheminLibre(monde, e, arret)) {
      entree = e;
      premierArret = arret;
      break;
    }
  }
  if (!entree || !premierArret) return undefined;

  const etapes: Etape[] = [];
  let t = debutMs;
  let ici = entree;
  const marcher = (vers: Point) => {
    const d = Math.hypot(vers.x - ici.x, vers.y - ici.y);
    const duree = (d / VITESSE_MARCHE_MS) * 1000;
    etapes.push({ sorte: "marche", de: ici, vers, debutMs: t, finMs: t + duree });
    t += duree;
    ici = vers;
  };

  for (let k = 0; k < haltes.length; k++) {
    const h = haltes[k] as Halte;
    const arret = k === 0 ? premierArret : h.arbreId === undefined ? h.pied : auPied(h.pied, ici);
    // Une halte suivante que la clôture sépare de la précédente est sautée :
    // la bête ne passe pas par-dessus.
    if (k > 0 && !cheminLibre(monde, ici, arret)) continue;
    const venue = ici;
    marcher(arret);
    const duree =
      HALTE_MIN_MS + hacher(place * 7 + k, rang, SEL_HALTE + 1) * (HALTE_MAX_MS - HALTE_MIN_MS);
    // Au pied, la bête regarde l'arbre ; dans l'herbe, elle regarde devant
    // elle, dans le sens où elle marchait.
    const cap =
      h.arbreId === undefined
        ? { x: arret.x + (arret.x - venue.x), y: arret.y + (arret.y - venue.y) }
        : h.pied;
    etapes.push({
      sorte: "halte",
      au: arret,
      cap,
      geste: h.geste,
      debutMs: t,
      finMs: t + duree,
      sel: Math.floor(hacher(place, rang * 5 + k, SEL_HALTE + 2) * 0xffff),
      ...(h.arbreId === undefined ? {} : { arbreId: h.arbreId }),
    });
    t += duree;
  }

  // La sortie : un bord au hasard, dont le chemin évite la clôture ; faute de
  // mieux, elle repart par où elle est venue.
  let sortie: Point = entree;
  for (const s of sorties(
    c,
    hacher(place, rang, SEL_BORD + 1),
    hacher(place, rang, SEL_BORD + 2),
  )) {
    if (ouverte(monde, s.x, s.y) && cheminLibre(monde, ici, s)) {
      sortie = s;
      break;
    }
  }
  if (!cheminLibre(monde, ici, sortie)) return undefined;
  marcher(sortie);

  return { place, rang, debutMs, finMs: t, brocard, etapes };
}

/**
 * Broute ou guette : le rythme d'une halte de broutage.
 *
 * La tête basse la plupart du temps, levée par moments — c'est ce qui fait
 * lire un chevreuil plutôt qu'un mouton. Les cycles varient d'une halte à
 * l'autre par leur sel.
 */
function rythmeDeLaHalte(sel: number, depuisMs: number): "broute" | "guette" {
  const cycle = 4200 + (sel % 1800);
  const guet = 1300 + ((sel >> 4) % 700);
  return depuisMs % cycle < cycle - guet ? "broute" : "guette";
}

/** La bête à l'instant `tMs` de sa visite — ou rien, hors de la visite. */
export function poseDansLaVisite(visite: Visite, tMs: number): PoseDuChevreuil | undefined {
  if (tMs < visite.debutMs || tMs >= visite.finMs) return undefined;
  const opacite = Math.min(1, (tMs - visite.debutMs) / FONDU_MS, (visite.finMs - tMs) / FONDU_MS);
  for (const e of visite.etapes) {
    if (tMs < e.debutMs || tMs >= e.finMs) continue;
    if (e.sorte === "marche") {
      const t = (tMs - e.debutMs) / Math.max(1, e.finMs - e.debutMs);
      const dx = e.vers.x - e.de.x;
      const dy = e.vers.y - e.de.y;
      const d = Math.hypot(dx, dy) || 1;
      const parcouru = t * d;
      return {
        place: visite.place,
        x: e.de.x + dx * t,
        y: e.de.y + dy * t,
        attitude: "marche",
        capX: dx / d,
        capY: dy / d,
        pas: (Math.floor(parcouru / FOULEE_M) % 2) as 0 | 1,
        opacite,
        brocard: visite.brocard,
      };
    }
    const dx = e.cap.x - e.au.x;
    const dy = e.cap.y - e.au.y;
    const d = Math.hypot(dx, dy) || 1;
    const depuis = tMs - e.debutMs;
    // Un frottis commence et finit tête levée : la bête arrive, regarde, frotte.
    const attitude =
      e.geste === "frotte"
        ? depuis < 1500 || e.finMs - tMs < 1200
          ? "guette"
          : "frotte"
        : rythmeDeLaHalte(e.sel, depuis);
    return {
      place: visite.place,
      x: e.au.x,
      y: e.au.y,
      attitude,
      capX: dx / d,
      capY: dy / d,
      pas: 0,
      opacite,
      brocard: visite.brocard,
    };
  }
  return undefined;
}

/**
 * Au-delà de ce retard, une place ne rejoue pas les visites qu'on n'a pas
 * regardées : elle reprend à l'instant présent. Un onglet resté caché une
 * heure ne doit pas planifier soixante visites d'un coup.
 */
const RATTRAPAGE_MAX_MS = 5 * 60_000;

/** Durée typique d'une visite, ms : la base des pauses entre deux visites. */
export const VISITE_TYPE_MS = 60_000;

interface EtatDeLaPlace {
  rang: number;
  /** la visite en cours, figée dès qu'elle est planifiée */
  visite?: Visite;
  /** fin de la visite précédente, ms */
  finMs: number;
  /** durée de la visite précédente, ms : la pause s'y proportionne */
  dureeMs: number;
}

/**
 * Le troupeau : ce qui fait que les visites **tiennent** d'une image à l'autre.
 *
 * Une visite est planifiée une fois, sur l'état de la parcelle à ce moment-là,
 * puis figée jusqu'à sa fin : l'instantané suivant peut changer les témoins ou
 * la clôture, la bête qui marche ne saute pas pour autant d'un bord à l'autre.
 *
 * **La pause, elle, n'est jamais figée.** L'échéance de la visite suivante se
 * relit à chaque image avec la présence **courante** : une battue qui fait
 * tomber la pression allonge l'attente sur-le-champ, une semaine de broutage
 * la raccourcit. Le premier jet la calculait à la fin de la visite, et une
 * partie ouverte en janvier — un chevreuil un septième du temps — attendait
 * encore neuf minutes en mai, pendant que le moteur broutait soixante tiges.
 */
export class Troupeau {
  private readonly places: EtatDeLaPlace[] = [];
  /**
   * Ce qui se déduit du monde, gardé tant que le monde est le même objet : il
   * change une fois par instantané, et la boucle d'images le relit soixante
   * fois par seconde.
   */
  private lu?: { monde: MondeDuGibier; temoins: ArbreDuGibier[]; presences: number[] };

  poses(monde: MondeDuGibier, tMs: number): PoseDuChevreuil[] {
    if (this.lu?.monde !== monde) {
      const temoins = temoinsDuGibier(monde);
      const presences = presencesDuGibier(
        monde.densiteParHa,
        surfaceOuverteHa(monde),
        temoins.length > 0,
      );
      this.lu = { monde, temoins, presences };
    }
    const { temoins, presences } = this.lu;
    const sorties: PoseDuChevreuil[] = [];
    for (let place = 0; place < MAX_CHEVREUILS; place++) {
      const presence = presences[place] ?? 0;
      let etat = this.places[place];
      if (!etat) {
        // Première fois : comme si une visite fictive, plus ou moins longue
        // selon la place, venait de finir. Deux chevreuils n'entrent donc pas
        // ensemble à la première image.
        etat = { rang: 0, finMs: tMs, dureeMs: VISITE_TYPE_MS * hacher(place, 0, SEL_PHASE) };
        this.places[place] = etat;
      }
      if (etat.visite && tMs >= etat.visite.finMs) {
        etat.finMs = etat.visite.finMs;
        etat.dureeMs = etat.visite.finMs - etat.visite.debutMs;
        etat.visite = undefined;
        etat.rang++;
      }
      if (!etat.visite) {
        if (presence <= 0) continue;
        let echeance = etat.finMs + pauseApres(etat.dureeMs, presence, place, etat.rang);
        if (tMs < echeance) continue;
        // Un onglet resté caché ne rattrape pas ce qu'on n'a pas regardé.
        if (tMs - echeance > RATTRAPAGE_MAX_MS) echeance = tMs;
        const visite = planifierLaVisite(monde, place, etat.rang, echeance, temoins);
        if (!visite || visite.finMs <= tMs) {
          // Pas de chemin, ou une visite déjà finie : on essaie plus tard.
          etat.finMs = Math.max(tMs, visite?.finMs ?? tMs);
          etat.dureeMs = VISITE_TYPE_MS / 4;
          etat.rang++;
          continue;
        }
        etat.visite = visite;
      }
      const pose = poseDansLaVisite(etat.visite, tMs);
      if (pose) sorties.push(pose);
    }
    return sorties;
  }
}

/**
 * La pause après une visite de `dureeMs`, pour que la place soit occupée la
 * part `presence` du temps : `durée × (1/p − 1)`, à ±50 % près pour que les
 * passages ne tombent pas comme un métronome.
 */
export function pauseApres(dureeMs: number, presence: number, place: number, rang: number): number {
  if (presence >= 1) return 0;
  const moyenne = dureeMs * (1 / Math.max(1e-3, presence) - 1);
  return moyenne * (0.5 + hacher(place, rang, SEL_PAUSE));
}

/**
 * Le pelage de la saison : roux d'été, gris-brun d'hiver.
 *
 * Le chevreuil mue deux fois l'an — vers la fin mai vers le roux, vers la fin
 * septembre vers le gris. Ce sont des dates de naturaliste, pas une donnée du
 * moteur, qui ne suit pas le pelage.
 */
export function pelageDEte(semaineAnnee: number): boolean {
  return semaineAnnee >= 21 && semaineAnnee < 39;
}

/**
 * Le brocard porte-t-il ses bois ?
 *
 * Il les perd en novembre et les refait sous velours pendant l'hiver ; c'est
 * au printemps, bois durcis, qu'il frotte — la fenêtre même où le moteur fait
 * ses frottis (`FROTTIS_SEMAINES`).
 */
export function boisDuBrocard(semaineAnnee: number): boolean {
  return !(semaineAnnee >= 44 && semaineAnnee < 50);
}
