/**
 * Le LECTEUR d'un plan d'ellipse : où en est-on, et qu'est-ce que ça fait à
 * chaque arbre (docs/interface-visuelle.md §5.11).
 *
 * `ellipse.ts` dit CE QU'IL FAUT MONTRER et dans quel ordre ; ce module dit
 * OÙ ON EN EST à un instant donné. La séparation n'est pas cosmétique : un plan
 * se construit une fois par ellipse, un lecteur est interrogé une fois par
 * arbre et par image. L'un peut se permettre de trier et de regrouper, l'autre
 * doit répondre en quelques opérations.
 *
 * **Deux décisions portent tout ce module, et elles ne sont pas évidentes.**
 *
 * 1. **Un arbre déjà tombé reste tombé.** Le premier réflexe est de rendre
 *    « debout » pour tout ce qui n'est pas l'acte en cours — et alors chaque
 *    arbre se relève dès que l'acte suivant démarre. Une ellipse serait une
 *    suite de choses qui se défont. Le lecteur cherche donc l'acte qui
 *    concerne un arbre, et si cet acte est PASSÉ, il rend son état FINAL.
 * 2. **Les sujets d'un acte ne bougent pas en même temps.** « Animer tous les
 *    arbres morts dans la semaine » ne veut pas dire les animer au même
 *    millième de seconde : trente-quatre arbres qui tombent en cadence font une
 *    chorégraphie, pas une forêt. Chacun part avec un décalage tiré de son
 *    identifiant — déterministe, comme tout le reste du rendu — dans la
 *    première moitié de son créneau.
 *
 * Module **pur** : aucune horloge à lui, aucun canvas. On lui donne le temps
 * écoulé, il rend des nombres.
 */

import { estGesteSurZone, type GesteSurZone } from "../../engine/actions";
import type { ChuteDeChandelle } from "../../engine/tick";
import type { CauseMort } from "../../engine/trees";
import type { Vue } from "../camera";
import { chuteEnCours, DEBOUT, type Deformation } from "./chute";
import type { Acte, PlanDEllipse } from "./ellipse";
import {
  type ArbreQuiSeTorche,
  avancementDuTorchage,
  chargeDuCiel,
  type FrontDIncendie,
  feuAuSol,
  flammesDeTorche,
  frontEnCours,
  type Particule,
  panacheDuFeu,
  TORCHES_MAX,
  teteDuFront,
  torchageEnCours,
  vivaciteDeLaTorche,
} from "./feu";
import { type ArbreVivant, type EtatMourant, mortAccomplie, mourirEnCours } from "./mort";
import { type CelluleVoilee, cellulesVoilees, rangsDuBalayage } from "./voile";

/**
 * Part du créneau d'un acte réservée à l'ÉCHELONNEMENT de ses sujets.
 *
 * La moitié : les derniers partent à mi-créneau et finissent avec lui. Plus
 * serré, l'acte se lit comme un seul mouvement ; plus étalé, les premiers sont
 * couchés depuis longtemps quand les derniers s'ébranlent.
 */
export const PART_ECHELONNEE = 0.5;

/** Où en est l'ellipse, et dans quel acte. */
export interface OuEnEst {
  /** l'acte en cours, s'il y en a un */
  acte?: Acte;
  /** avancement dans cet acte ∈ [0,1] */
  avancement: number;
  /** vrai quand le plan est joué jusqu'au bout */
  fini: boolean;
}

/** L'acte en cours à un instant donné, et son avancement. */
export function ouEnEst(plan: PlanDEllipse, ecouleMs: number): OuEnEst {
  if (ecouleMs >= plan.dureeMs) return { avancement: 1, fini: true };
  for (const acte of plan.actes) {
    if (ecouleMs < acte.debutMs) break;
    if (ecouleMs < acte.debutMs + acte.dureeMs) {
      return {
        acte,
        avancement: acte.dureeMs > 0 ? (ecouleMs - acte.debutMs) / acte.dureeMs : 1,
        fini: false,
      };
    }
  }
  return { avancement: 0, fini: false };
}

/**
 * Un plan INDEXÉ par arbre, prêt à être interrogé image après image.
 *
 * **Le premier jet cherchait linéairement, et il ne tenait pas.** `deformationDe`
 * parcourait les actes puis leurs sujets à chaque appel — or il est appelé une
 * fois par arbre et par image. Sur un banc à trois mille chutes, ça fait neuf
 * millions de comparaisons par image : la page ne finissait jamais de charger.
 * C'est exactement la « recherche linéaire par image » que le lot L0 proscrit,
 * et l'index est la réponse évidente une fois la question posée.
 *
 * On indexe UNE FOIS par ellipse — un plan ne change pas pendant qu'il se joue
 * — et on interroge par identifiant.
 */
export type PlanIndexe = Map<number, { acte: Acte; chute: ChuteDeChandelle }>;

/** Indexe les chutes d'un plan par identifiant d'arbre. */
export function indexerLesChutes(plan: PlanDEllipse): PlanIndexe {
  const index: PlanIndexe = new Map();
  for (const acte of plan.actes) {
    if (acte.sujet.quoi !== "chute") continue;
    for (const chute of acte.sujet.chutes) index.set(chute.id, { acte, chute });
  }
  return index;
}

/**
 * Ce qu'il faut faire du sprite d'un arbre, à cet instant de cette ellipse.
 *
 * **Ne rend une déformation que pour ce qu'un panneau peut montrer**, c'est-à-
 * dire la chute. Les autres actes du plan — une mort de sécheresse qui jaunit
 * puis se défeuille, un élagage — passent par la CUISSON de la vignette et non
 * par la pose : ce sont des changements de couleur et de feuillage, que la
 * classe porte déjà. Le §5.11 sépare les deux exprès, et confondre les deux
 * canaux ferait recuire l'atlas pendant une animation.
 */
export function deformationDe(
  index: PlanIndexe,
  ecouleMs: number,
  idArbre: number,
  vue: Vue,
): Deformation {
  const trouve = index.get(idArbre);
  if (!trouve) return DEBOUT;
  const { acte, chute } = trouve;
  // **L'état final si l'acte est passé, et c'est la décision n° 1.** Sans
  // cette ligne, un arbre tombé se relève à l'acte suivant.
  if (ecouleMs >= acte.debutMs + acte.dureeMs) return chuteEnCours(chute, 1, vue);
  if (ecouleMs < acte.debutMs) return DEBOUT;
  const t = avancementDuSujet(acte, idArbre, ecouleMs);
  return t <= 0 ? DEBOUT : chuteEnCours(chute, t, vue);
}

/**
 * L'avancement d'UN sujet dans son acte, décalage compris.
 *
 * Le décalage vient de l'identifiant, donc il est stable d'une image à l'autre
 * et d'une partie à l'autre : rejouer la même ellipse doit donner la même
 * chorégraphie (§2.1, le rendu est déterministe).
 */
function avancementDuSujet(acte: Acte, idArbre: number, ecouleMs: number): number {
  const retard = acte.dureeMs * PART_ECHELONNEE * decalageDe(idArbre);
  const utile = acte.dureeMs * (1 - PART_ECHELONNEE);
  if (utile <= 0) return 1;
  return Math.min(1, (ecouleMs - acte.debutMs - retard) / utile);
}

/** Un décalage ∈ [0,1[ tiré d'un identifiant. Le même hachage que le reste. */
function decalageDe(id: number): number {
  let h = Math.imul(id | 0, 0x27d4eb2d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

/**
 * Les gestes de ZONE d'un plan, avec leur balayage déjà calculé.
 *
 * Même raison que l'index des chutes, et une raison de plus : le rang d'une
 * cellule dans le balayage demande un centre de gravité et une distance par
 * cellule. Le faire par image sur une fauche d'un hectare coûterait dix mille
 * racines carrées soixante fois par seconde, pour un résultat qui ne change
 * pas — un plan ne bouge pas pendant qu'il se joue.
 */
export interface VoileIndexe {
  acte: Acte;
  geste: GesteSurZone;
  rangs: Float32Array;
}

/**
 * Indexe les voiles d'un plan. `coteM` est le côté de la parcelle, celui qui
 * décode les indices de cellule du moteur.
 *
 * **Les gestes sur ARBRES ne sont pas ici, et c'est délibéré.** Un broutage et
 * un frottis sont des marques d'écorce que la classe de vignette porte déjà :
 * les animer à la pose dessinerait la même information deux fois. Une coupe,
 * un étêtage, un recépage font tomber quelque chose, et le protocole ne dit
 * pas encore QUOI — voir l'issue ouverte pour ça et la note du §5.11.
 */
export function indexerLesVoiles(plan: PlanDEllipse, coteM: number): VoileIndexe[] {
  const voiles: VoileIndexe[] = [];
  for (const acte of plan.actes) {
    if (acte.sujet.quoi !== "geste") continue;
    const geste = acte.sujet.geste;
    if (!estGesteSurZone(geste)) continue;
    voiles.push({ acte, geste, rangs: rangsDuBalayage(geste, coteM) });
  }
  return voiles;
}

/**
 * Les cellules à voiler à cet instant, tous actes confondus.
 *
 * Rend un tableau vide dès que plus aucun front n'est en cours, ce qui est
 * l'état ordinaire : un plan de dix actes n'en a qu'un d'ouvert à la fois, et
 * les gestes de zone y sont rares. L'appelant peut donc poser zéro sprite sans
 * rien tester lui-même.
 */
export function voilesEnCours(voiles: readonly VoileIndexe[], ecouleMs: number): CelluleVoilee[] {
  let sorties: CelluleVoilee[] = [];
  for (const { acte, geste, rangs } of voiles) {
    if (ecouleMs < acte.debutMs || ecouleMs >= acte.debutMs + acte.dureeMs) continue;
    const avancement = acte.dureeMs > 0 ? (ecouleMs - acte.debutMs) / acte.dureeMs : 1;
    const ici = cellulesVoilees(geste, rangs, avancement);
    // Presque toujours un seul acte ouvert : on évite la concaténation quand
    // il n'y a rien à concaténer.
    sorties = sorties.length === 0 ? ici : sorties.concat(ici);
  }
  return sorties;
}

/**
 * Les MORTS d'un plan, indexées par arbre.
 *
 * Même raison que les chutes : une fois par ellipse, pas une fois par arbre et
 * par image. Une mort porte sa cause, et c'est la cause qui décide de la mise
 * en scène (`mort.ts`).
 */
export type MortsIndexees = Map<number, { acte: Acte; cause: CauseMort }>;

/** Indexe les morts d'un plan par identifiant d'arbre. */
export function indexerLesMorts(plan: PlanDEllipse): MortsIndexees {
  const index: MortsIndexees = new Map();
  for (const acte of plan.actes) {
    if (acte.sujet.quoi !== "mort") continue;
    for (const m of acte.sujet.morts) index.set(m.id, { acte, cause: acte.sujet.cause });
  }
  return index;
}

/**
 * Ce qu'il faut faire de l'arbre `idArbre` s'il est en train de mourir.
 *
 * Rend `undefined` quand il ne meurt pas dans cette ellipse — l'immense
 * majorité —, ce qui laisse l'appelant poser l'arbre tel que l'instantané le
 * donne, sans copie ni allocation.
 *
 * **La même décision que pour les chutes** : une mort passée reste accomplie.
 * Sans ça, un arbre mort au premier acte reverdirait au second, et l'ellipse
 * serait une suite de choses qui se défont.
 */
export function etatMourantDe(
  index: MortsIndexees,
  ecouleMs: number,
  idArbre: number,
  vivant: ArbreVivant,
): EtatMourant | undefined {
  const trouve = index.get(idArbre);
  if (!trouve) return undefined;
  const { acte, cause } = trouve;
  if (ecouleMs >= acte.debutMs + acte.dureeMs) return mortAccomplie(cause, vivant);
  if (ecouleMs < acte.debutMs) return undefined;
  const t = avancementDuSujet(acte, idArbre, ecouleMs);
  return t <= 0 ? undefined : mourirEnCours(cause, vivant, t);
}

/**
 * La part POSE d'une mort : ce qui rapetisse et ce qui s'effface.
 *
 * Séparée de `etatMourantDe` parce que les deux canaux n'ont pas le même
 * client : la classe part à la cuisson avant la pose, la déformation part à la
 * pose. Et parce que celle-ci ne demande PAS l'état vivant de l'arbre — un
 * effacement ne dépend que du temps —, ce qui permet à la boucle d'images de
 * l'appeler sans rien reconstruire.
 */
export function poseDeLaMort(index: MortsIndexees, ecouleMs: number, idArbre: number): Deformation {
  const trouve = index.get(idArbre);
  if (!trouve) return DEBOUT;
  const { acte, cause } = trouve;
  const fini = ecouleMs >= acte.debutMs + acte.dureeMs;
  if (!fini && ecouleMs < acte.debutMs) return DEBOUT;
  const t = fini ? 1 : avancementDuSujet(acte, idArbre, ecouleMs);
  if (t <= 0) return DEBOUT;
  // L'état vivant ne sert qu'aux grandeurs de classe ; les zéros suffisent ici.
  const e = mourirEnCours(cause, VIVANT_NEUTRE, t);
  return { rotationRad: 0, hauteur: e.hauteur, opacite: e.opacite };
}

/**
 * Un arbre vivant « neutre », pour les calculs qui n'en dépendent pas.
 *
 * `mourirEnCours` prend l'état de départ pour interpoler le feuillage ; la
 * hauteur et l'opacité, elles, n'en dépendent pas. Passer un état bidon est
 * donc sûr ICI et nulle part ailleurs — d'où la constante nommée, plutôt qu'un
 * objet anonyme qu'on finirait par recopier là où il ferait un faux.
 */
const VIVANT_NEUTRE: ArbreVivant = {
  partFoliaire: 0,
  senescence: 0,
  vigueur: 0,
  dommageHydraulique: 0,
};

/**
 * L'incendie d'un plan, s'il y en a un, avec son acte.
 *
 * Un seul : `planDEllipse` en fait un acte unique, et le worker ne garde que
 * le dernier incendie d'un lot d'instantanés (`worker.ts`) — deux incendies
 * dans la même semaine sont un cas que le moteur a déjà tranché.
 */
export function trouverLeFeu(plan: PlanDEllipse): IncendieTrouve | undefined {
  for (const acte of plan.actes) {
    if (acte.sujet.quoi !== "feu") continue;
    return {
      acte,
      // **L'ORIGINE compte autant que les rangs**, et pas seulement pour cadrer
      // la caméra : c'est elle qui donne le sens dans lequel le panache
      // penche, faute d'une direction de vent dans le moteur (`feu.ts`).
      origine: acte.sujet.origine,
      feu: { brulees: acte.sujet.brulees, rangs: acte.sujet.rangs },
    };
  }
  return undefined;
}

/** Un incendie du plan, avec son acte et son origine. */
export interface IncendieTrouve {
  acte: Acte;
  origine: number;
  feu: FrontDIncendie;
}

/**
 * Où en est l'acte d'un incendie, entre 0 et 1.
 *
 * **Après l'acte, la cendre RESTE**, à la différence du voile d'un geste : un
 * sol brûlé est un état, pas un passage. L'instantané d'après le dira dans ses
 * grilles — l'herbe a disparu — mais tant que l'ellipse joue, c'est ce calque
 * qui le porte, et l'éteindre ferait reverdir la parcelle.
 *
 * Rend `undefined` avant le départ du feu, ce qui laisse la parcelle intacte.
 */
function avancementDuFeu(trouve: IncendieTrouve, ecouleMs: number): number | undefined {
  const { acte } = trouve;
  if (ecouleMs < acte.debutMs) return undefined;
  if (ecouleMs >= acte.debutMs + acte.dureeMs) return 1;
  return (ecouleMs - acte.debutMs) / Math.max(1, acte.dureeMs);
}

/**
 * Les cellules du front à cet instant.
 *
 * Rendues sous la même forme que le voile d'un geste de zone, et posées par la
 * même couche : une flamme au sol et un nuage de chaux ne sont pas la même
 * chose, mais ils se dessinent de la même façon.
 */
export function feuEnCours(trouve: IncendieTrouve | undefined, ecouleMs: number): CelluleVoilee[] {
  if (!trouve) return [];
  const a = avancementDuFeu(trouve, ecouleMs);
  return a === undefined ? [] : frontEnCours(trouve.feu, a);
}

/**
 * Les PARTICULES du feu à cet instant : la lueur, les flammes, le panache et
 * les braises.
 *
 * Rendues en un seul tableau, et c'est la couche de pose qui les répartit entre
 * ses deux conteneurs — ce qui brûle au sol passe sous les arbres, ce qui monte
 * passe par-dessus. L'appelant n'a donc qu'un canal à brancher.
 *
 * **L'horloge de phase est celle de l'ELLIPSE et non celle du navigateur.**
 * C'est ce qui fait qu'une lecture figée (`?ellipse=0.7`) l'est vraiment,
 * jusqu'au battement des flammes, et qu'une capture est reproductible.
 *
 * `exposition` est le `ventExposition` de la station (`StationInfo`) : un
 * scalaire ∈ [0,1] qui donne l'AMPLITUDE de l'inclinaison du panache. Le sens,
 * lui, vient de l'origine de l'incendie, faute d'une direction de vent dans le
 * moteur — la convention est décrite dans `feu.ts`.
 */
export function particulesDuFeu(
  trouve: IncendieTrouve | undefined,
  ecouleMs: number,
  coteM: number,
  exposition: number,
  torches: TorchesIndexees = AUCUNE_TORCHE,
): IncendieAPoser {
  if (!trouve) return RIEN_NE_BRULE;
  const a = avancementDuFeu(trouve, ecouleMs);
  if (a === undefined) return RIEN_NE_BRULE;
  return {
    particules: [
      ...feuAuSol(trouve.feu, a, ecouleMs, coteM),
      // Les couronnes qui flambent passent par la MÊME liste que le feu au sol,
      // donc par la même couche : une torche est derrière les arbres qui sont
      // devant elle et devant ceux qui sont derrière, ce que le tri par
      // ordonnée d'écran donne gratuitement.
      ...flammesDesTorches(torches, ecouleMs),
      ...panacheDuFeu(trouve.feu, a, ecouleMs, coteM, trouve.origine, exposition),
    ],
    ciel: chargeDuCiel(trouve.feu, a),
  };
}

/**
 * Ce qu'un incendie donne à poser : des particules, et une charge de ciel.
 *
 * **Les deux ensemble et non deux canaux**, parce que c'est un seul phénomène
 * et une seule lecture d'horloge. Le ciel n'est pas une particule — il n'a pas
 * de place dans le monde, il couvre l'image entière — mais il vient du même
 * front au même instant, et l'appelant n'a pas à le demander séparément.
 */
export interface IncendieAPoser {
  particules: readonly Particule[];
  /** de combien le ciel est orangé, ∈ [0,1] ; 0 = rien ne brûle */
  ciel: number;
}

/** Le repos : ni particule, ni ciel. Partagé, donc sans allocation par image. */
export const RIEN_NE_BRULE: IncendieAPoser = { particules: [], ciel: 0 };

/**
 * Un arbre que l'incendie de ce journal a tué, tel que l'appelant le connaît.
 *
 * **L'état d'AVANT le feu est passé par l'appelant, et c'est le point délicat
 * de tout le torchage.** L'instantané décrit l'arbre APRÈS l'incendie : un
 * tronc charbonné, sans feuilles. Une mise en scène qui partirait de là
 * n'aurait rien à animer — elle interpolerait de « sans feuilles » vers « sans
 * feuilles ».
 *
 * Ce que le rendu reconstruit n'est pourtant pas une invention : c'est ce que
 * le MOTEUR dit d'un arbre de cette espèce, de cette hauteur, à cette semaine
 * de l'année — `partFoliaireOmbrageanteDans` et `senescenceDans` le calculent
 * depuis le contexte phénologique que l'instantané porte. Le rendu ne fabrique
 * donc que l'entre-deux, comme pour toutes les autres morts.
 *
 * **Et c'est un défaut que le §6.3 avait aussi, sans qu'on l'ait vu** : un
 * arbre que le journal déclare mort cette semaine est DÉJÀ une chandelle dans
 * l'instantané, donc les onze mises en scène de mort partaient elles aussi d'un
 * feuillage nul. Elles ne montraient rien. Le banc ne l'avait pas attrapé
 * parce qu'il choisit exprès des arbres vivants (`?mort=<cause>`).
 */
export interface ArbreATorcher {
  id: number;
  x: number;
  y: number;
  hauteurM: number;
  baseHouppierM: number;
  rayonHouppierM: number;
  /** ce que le moteur dit de cet arbre AVANT que le feu passe */
  avantLeFeu: ArbreVivant;
}

/** Les arbres que le front torche, indexés par identifiant. */
export interface TorchesIndexees {
  acte?: Acte;
  front?: FrontDIncendie;
  arbres: Map<number, { torche: ArbreQuiSeTorche; avantLeFeu: ArbreVivant }>;
}

/** Rien ne brûle : l'index vide, partagé — donc sans allocation par image. */
export const AUCUNE_TORCHE: TorchesIndexees = { arbres: new Map() };

/**
 * Indexe les arbres que l'incendie torche, avec le RANG du front sur chacun.
 *
 * Une fois par ellipse et non une fois par image : c'est une jointure entre le
 * front (des milliers de cellules) et les arbres tués (des milliers aussi), et
 * la refaire soixante fois par seconde coûterait plus que tout le reste de la
 * pose.
 *
 * Un candidat dont la cellule n'a PAS brûlé est écarté sans bruit. Ça ne
 * devrait pas arriver — le moteur ne tue par le feu que dans les cellules
 * brûlées — mais un instantané qui décrirait un arbre brûlé hors du front est
 * un instantané dont on ne peut rien tirer, et le placer quelque part serait
 * pire que de l'ignorer.
 */
export function indexerLesTorches(
  trouve: IncendieTrouve | undefined,
  candidats: readonly ArbreATorcher[],
  coteM: number,
): TorchesIndexees {
  if (!trouve || candidats.length === 0) return AUCUNE_TORCHE;
  const rangDe = new Map<number, number>();
  const n = Math.min(trouve.feu.brulees.length, trouve.feu.rangs.length);
  for (let i = 0; i < n; i++) rangDe.set(trouve.feu.brulees[i] ?? 0, trouve.feu.rangs[i] ?? 0);
  const arbres = new Map<number, { torche: ArbreQuiSeTorche; avantLeFeu: ArbreVivant }>();
  for (const a of candidats) {
    const cellule =
      Math.min(coteM - 1, Math.max(0, Math.floor(a.y))) * coteM +
      Math.min(coteM - 1, Math.max(0, Math.floor(a.x)));
    const rang = rangDe.get(cellule);
    if (rang === undefined) continue;
    arbres.set(a.id, {
      avantLeFeu: a.avantLeFeu,
      torche: {
        id: a.id,
        x: a.x,
        y: a.y,
        cellule,
        hauteurM: a.hauteurM,
        baseHouppierM: a.baseHouppierM,
        rayonHouppierM: a.rayonHouppierM,
        rang,
      },
    });
  }
  return { acte: trouve.acte, front: trouve.feu, arbres };
}

/** Où en est le front, en rangs, à cet instant de l'ellipse. */
function teteALInstant(index: TorchesIndexees, ecouleMs: number): number | undefined {
  const { acte, front } = index;
  if (!acte || !front) return undefined;
  if (ecouleMs < acte.debutMs) return undefined;
  const a =
    ecouleMs >= acte.debutMs + acte.dureeMs
      ? 1
      : (ecouleMs - acte.debutMs) / Math.max(1, acte.dureeMs);
  return teteDuFront(front, a);
}

/**
 * Ce qu'il faut faire de l'arbre `idArbre` si le front est en train de le
 * torcher.
 *
 * Rend `undefined` quand il ne brûle pas dans cette ellipse — l'immense
 * majorité — et AUSSI avant que le front l'atteigne : jusque-là, il doit se
 * dessiner tel que l'appelant l'a préparé, c'est-à-dire vivant.
 *
 * **Après l'acte, le torchage reste accompli**, comme une mort : sans ça, un
 * arbre brûlé au premier acte reverdirait au second.
 */
export function etatDuTorchage(
  index: TorchesIndexees,
  ecouleMs: number,
  idArbre: number,
): EtatMourant | undefined {
  const trouve = index.arbres.get(idArbre);
  if (!trouve) return undefined;
  const tete = teteALInstant(index, ecouleMs);
  if (tete === undefined) return undefined;
  const u = avancementDuTorchage(tete, trouve.torche.rang);
  return u === undefined ? undefined : torchageEnCours(trouve.avantLeFeu, u);
}

/**
 * Les flammes et les braises de toutes les couronnes qui flambent à cet
 * instant.
 *
 * Échantillonnées à pas régulier sous `TORCHES_MAX` : la friche de démonstration
 * perd deux mille sept cent cinquante et une tiges dans le même incendie, et un
 * feu qui traverse un peuplement dense en embraserait plus qu'on ne peut poser.
 * Le pas balaie l'ensemble au lieu d'en garder le début, sinon les torches
 * visibles seraient toutes du même côté du front.
 */
export function flammesDesTorches(index: TorchesIndexees, ecouleMs: number): Particule[] {
  const tete = teteALInstant(index, ecouleMs);
  if (tete === undefined || index.arbres.size === 0) return [];
  const enFeu: { torche: ArbreQuiSeTorche; u: number }[] = [];
  for (const { torche } of index.arbres.values()) {
    const u = avancementDuTorchage(tete, torche.rang);
    if (u === undefined || vivaciteDeLaTorche(u) <= 0) continue;
    enFeu.push({ torche, u });
  }
  if (enFeu.length === 0) return [];
  const pas = Math.max(1, Math.ceil(enFeu.length / TORCHES_MAX));
  const sorties: Particule[] = [];
  for (let i = 0; i < enFeu.length; i += pas) {
    const t = enFeu[i];
    if (t) sorties.push(...flammesDeTorche(t.torche, t.u, ecouleMs));
  }
  return sorties;
}
