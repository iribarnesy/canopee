/**
 * La vue de parcelle, montée pour de vrai.
 *
 * Ce n'est pas le jeu — l'écran de jeu viendra avec ses panneaux et ses
 * actions — mais c'est le composant du jeu, monté sur une scène du moteur, avec
 * ses gestes : on glisse, on zoome à la molette, on tourne aux flèches. C'est ce
 * qui permet de vérifier que le montage PixiJS tient, ce qu'aucune capture
 * d'aperçu ne peut dire.
 */

import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type { GesteTypeArbre, GesteTypeZone, GesteVisible } from "../engine/actions";
import { getEspece } from "../engine/especes";
import type { IndividuFaune } from "../engine/faune";
import {
  type ContextePhenologique,
  partFoliaireOmbrageanteDans,
  senescenceDans,
} from "../engine/phenologie";
import type {
  ChuteDeChandelle,
  FranchissementDeStade,
  MortDeLaSemaine,
  NaissanceDeLaSemaine,
} from "../engine/tick";
import type { CauseMort } from "../engine/trees";
import { type ArbreSource, arbresAPoser, donneesSolDe } from "../game/parcelle";
import { VueParcelle } from "../game/VueParcelle";
import { ficheDe } from "../render/arbres/especes";
import type { ArbreAPoser } from "../render/couches/arbres";
import type { DecorBordures } from "../render/couches/decor";
import type { DonneesSol } from "../render/couches/terrain";
import { type MondeDuGibier, Troupeau } from "../render/faune/chevreuils";
import { posesDesGeais, visitesDuGeai } from "../render/faune/geai";
import { type Essaim, essaimsDeLaNuee, pointsDeLaNuee } from "../render/faune/nuee";
import { type Derangement, type PoseDHabitant, Residents } from "../render/faune/residents";
import type { Compte } from "../render/pixi/scene";
import { brumeEnCours, cellulesAffleurantes } from "../render/temps/brume";
import {
  type Marqueur,
  marqueursDuJournal,
  OPACITE_HORS_SUJET,
  sujetsDuJournal,
} from "../render/temps/changements";
import { combiner, DEBOUT, type Deformation } from "../render/temps/chute";
import {
  type CrueDeLaSemaine,
  courantDeLaSemaine,
  lameDeLaCrue,
  monteeDeLaCrue,
  retraitDeLaCrue,
} from "../render/temps/crue";
import { type JournalDeSemaine, planAuRythmeNaturel } from "../render/temps/ellipse";
import { SANS_VENT } from "../render/temps/feu";
import { type CelluleGelee, cellulesGelees, givreEnCours } from "../render/temps/givre";
import {
  AUCUNE_TORCHE,
  chandellesTombees,
  chuteDeLaChandelle,
  chuteDeLaTige,
  crueEnCours,
  deformationDe,
  etatDuTorchage,
  etatMourantDe,
  feuEnCours,
  futsConsumes,
  futsConsumesATorcher,
  indexerLesChandellesTombees,
  indexerLesChutes,
  indexerLesCrues,
  indexerLesGestes,
  indexerLesMorts,
  indexerLesTorches,
  indexerLesVoiles,
  particulesDuFeu,
  poseDeLaMort,
  poseDeLaRafale,
  poseDuFutConsume,
  remodelageDe,
  tigesAbattues,
  trouverLaTempete,
  trouverLeFeu,
  voilesEnCours,
} from "../render/temps/lecteur";
import type { TempsQuIlFait } from "../render/temps/pluie";
import { especeSiConnue } from "./atlasDuBanc";

interface Scene {
  coteM: number;
  week: number;
  /** `Snapshot.faune` : qui habite la parcelle ; absent = faune éteinte (`APERCU_FAUNE=1`) */
  faune?: IndividuFaune[];
  /**
   * `StationInfo.ventExposition` : l'exposition au vent de la parcelle ∈ [0,1],
   * telle que les bordures la font (`paysage.ts`).
   *
   * **Absent des scènes cuites avant le 2026-09-10.** C'est l'amplitude de
   * l'inclinaison du panache d'un incendie ; à défaut, on prend le milieu de
   * l'échelle plutôt que d'incliner au hasard.
   */
  ventExposition?: number;
  /**
   * Le vent de la semaine, tel que la météo du moteur le porte
   * (`WeekWeather.ventVersRad`, `ventMoyMs`) plus ce que le **site** en reçoit
   * (`ventRecuParLeSite`, produit de la vitesse régionale et de l'abri).
   *
   * **Absent des scènes cuites avant le 2026-09-14.** C'est lui qui incline le
   * panache ; à défaut on ne penche pas — une colonne droite est la lecture
   * honnête de « on ne sait pas » (`SANS_VENT`).
   */
  vent?: { versRad: number; moyMs: number; recuMs: number };
  /**
   * Ce qui a changé depuis l'instantané précédent, tel que le moteur le
   * rapporte (`advanceWeek`), accumulé par le constructeur de scènes.
   *
   * **Absent des scènes cuites avant le 2026-09-09** : celles-là n'en portaient
   * pas, et le banc leur fabriquait un journal. Le repli existe donc encore,
   * mais il est réservé aux bancs de **mécanisme** (`?ellipse-tout`, `?mort=`) —
   * une scène qui porte son journal joue le vrai.
   */
  journal?: {
    morts: MortDeLaSemaine[];
    gestes: GesteVisible[];
    chutes: ChuteDeChandelle[];
    /** `Snapshot.naissances` : les semis installés, avec leur position */
    naissances?: NaissanceDeLaSemaine[];
    /** `Snapshot.franchissements` : les tiges qui ont changé de stade */
    franchissements?: FranchissementDeStade[];
    /**
     * Sur combien de semaines ce journal a été accumulé.
     *
     * Servait à reconnaître les recrues à leur `ageWeeks` ; depuis que le
     * moteur rapporte les naissances, il ne reste qu'un usage — reconnaître
     * les arbres que l'incendie a torchés à leur `brulEeSemaine`, faute que la
     * mort par le feu voyage avec l'incendie (issue #52).
     */
    semaines?: number;
    /**
     * L'incendie, si la scène en porte un (`APERCU_FEU=1`).
     *
     * En tableaux et non en `Int32Array` : JSON transforme les tableaux typés
     * en objets indexés, et le front y perdrait son ordre.
     */
    incendie?: {
      origine: number;
      brulees: number[];
      rangs: number[];
      charges?: number[];
      /**
       * `IncendieResult.victimes` : **qui** le feu a emporté, et non plus seulement
       * combien.
       *
       * **Absent des scènes cuites avant le 2026-09-14.** Celles-là obligent à
       * reconnaître les torchés à leur `brulEeSemaine`, une jointure fausse dès
       * qu'un arbre a brûlé lors d'un incendie **précédent** — il en garde la
       * semaine. Le repli existe donc encore, mais il n'est plus le chemin
       * normal.
       */
      victimes?: { id: number; hauteurAvantM: number; rejet: boolean }[];
      /**
       * `IncendieResult.chandellesConsumees` : les fûts morts que le front a
       * fait disparaître (#246).
       *
       * **Absent des scènes cuites avant le 2026-09-28**, comme `victimes`
       * l'était avant elles : une scène d'alors n'en porte pas, et le banc
       * n'en pose donc aucune — ce qui est exactement ce qu'elle montrait.
       */
      chandellesConsumees?: {
        id: number;
        x: number;
        y: number;
        especeId: string;
        hauteurM: number;
      }[];
    };
  };
  trees: {
    id: number;
    especeId: string;
    x: number;
    y: number;
    heightM: number;
    /** `ageWeeks` du protocole : c'est lui qui reconnaît une recrue */
    ageWeeks: number;
    chandelle: boolean;
    hauteurElagueeM?: number;
    teteTrogneM?: number;
    /** `baseHouppierM` du protocole : la base du houppier, m */
    baseHouppierM?: number;
    /** `floraison` du protocole : part de la couronne en fleur ∈ [0,1] */
    floraison?: number;
    vigueur?: number;
    /** `dommageHydraulique` du protocole : la cime sèche ∈ [0,1] */
    dommageHydraulique?: number;
    /** `brulEeSemaine` du protocole : présent = le feu l'a tué */
    brulEeSemaine?: number;
    /** `protege` du protocole : plant sous manchon */
    protege?: boolean;
    /** `recepages` du protocole : nombre d'étêtages subis */
    recepages?: number;
    /** `frotteSemaine` du protocole : présent = un brocard l'a frotté */
    frotteSemaine?: number;
    /** `derniereLeveeSemaine` du protocole : la semaine du dernier démasclage */
    derniereLeveeSemaine?: number;
    /** `brouteSemaine` du protocole : présent = un chevreuil l'a brouté */
    brouteSemaine?: number;
    /** `diametreTeteCm` du protocole : le renflement à dessiner, cm */
    diametreTeteCm?: number;
    /** `caviteTeteL` du protocole : le creux, en litres */
    caviteTeteL?: number;
    /** `fruitProgress` du protocole : avancement du fruit de l'année ∈ [0,1] */
    fruitProgress?: number;
    /** `fruitsKg` du protocole : les fruits mûrs qui attendent la récolte */
    fruitsKg?: number;
  }[];
  sol: {
    ruMm: number;
    enEau?: boolean[];
    debordementMm?: number[];
    /** `Snapshot.soilBoisAuSol` : bois mort couché, g C/m² */
    boisAuSol?: number[];
    /** `Snapshot.soilBoisEnTravers` : sa transversalité ∈ [0,1] */
    boisEnTravers?: number[];
    altitudesM: number[];
    waterMm: number[];
    herbeCouverture: number[];
    herbeBiomasse: number[];
    litiereCG: number[];
    lumiere?: number[];
    herbeHumidite?: number[];
    bordures?: DecorBordures;
    pheno?: ContextePhenologique;
  };
}

/**
 * Les grilles du sol de la scène, dans la forme du terrain.
 *
 * Le corps de la conversion est partagé avec le jeu (`src/game/parcelle.ts`) :
 * ici il ne reste que le **rangement** — la scène cuite niche ses grilles sous
 * `sol`, l'instantané les porte à plat — et pas une règle.
 */
function donneesDe(scene: Scene): DonneesSol {
  return donneesSolDe({
    coteM: scene.coteM,
    ruMm: scene.sol.ruMm,
    altitudesM: scene.sol.altitudesM,
    waterMm: scene.sol.waterMm,
    herbe: scene.sol.herbeCouverture,
    herbeBiomasse: scene.sol.herbeBiomasse,
    litiereCG: scene.sol.litiereCG,
    ...(scene.sol.lumiere ? { lumiere: scene.sol.lumiere } : {}),
    ...(scene.sol.herbeHumidite ? { herbeHumidite: scene.sol.herbeHumidite } : {}),
    ...(scene.sol.enEau ? { enEau: scene.sol.enEau } : {}),
    // La lame vient d'une crue, et une scène cuite n'en porte pas : seule celle
    // que le banc fabrique (`?crue=montee`) en pose une. Le débit de la scène
    // fait le courant, pas une lame (#288).
    ...(crueDuBanc(scene).lame ? { lameMm: crueDuBanc(scene).lame } : {}),
    ...(scene.sol.boisAuSol ? { boisAuSol: scene.sol.boisAuSol } : {}),
    ...(scene.sol.boisEnTravers ? { boisEnTravers: scene.sol.boisEnTravers } : {}),
  });
}

/**
 * Où en est la lecture : l'horloge, ou l'avancement figé par `?ellipse=`.
 *
 * Partagée par les deux rappels — la déformation des arbres et le voile des
 * gestes — parce que deux horloges qui devraient être la même finissent par ne
 * plus l'être. La boucle tourne un peu plus longtemps que l'ellipse pour qu'on
 * voie l'état d'arrivée avant qu'elle ne reprenne.
 *
 * **La boucle se règle sur la durée du plan** depuis #163 : les actes prennent
 * maintenant leur durée propre, et une boucle calée sur un budget fixe aurait
 * rejoué le début avant la fin, ou attendu dans le vide.
 */
/**
 * Le troupeau du banc : un seul pour la page, comme dans le jeu il survit aux
 * instantanés.
 */
const troupeauDuBanc = new Troupeau();

/**
 * `?faune=0.5` : des chevreuils à cette densité, têtes par hectare (#129).
 *
 * Les scènes cuites ne portent ni la pression de gibier ni la clôture, donc le
 * banc les donne. `?faune-temoins=1` fait de chaque tige à portée de dent un
 * pied brouté cette semaine — ce que le moteur fait une semaine de printemps —,
 * `?faune-cloture=x0,y0,x1,y1` clôt un rectangle, et `?faune-t=40000` **fige**
 * l'horloge des bêtes à cet instant, pour qu'une capture tombe au milieu d'une
 * visite plutôt qu'au hasard.
 */
function mondeDuBanc(scene: Scene): { monde?: MondeDuGibier; figeMs?: number } {
  const q = new URLSearchParams(location.search);
  const brut = q.get("faune");
  if (brut === null) return {};
  const cote = scene.coteM;
  const cloture = new Uint8Array(cote * cote);
  const rect = q.get("faune-cloture")?.split(",").map(Number);
  if (rect && rect.length === 4) {
    const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = rect;
    for (let y = Math.max(0, y0); y < Math.min(cote, y1); y++) {
      for (let x = Math.max(0, x0); x < Math.min(cote, x1); x++) cloture[y * cote + x] = 1;
    }
  }
  const temoins = q.get("faune-temoins") === "1";
  const t = q.get("faune-t");
  return {
    monde: {
      coteM: cote,
      semaine: scene.week,
      densiteParHa: Number(brut),
      cloture,
      arbres: scene.trees
        .filter((a) => !a.chandelle)
        .map((a) =>
          temoins && a.heightM <= 1.5 && !a.protege ? { ...a, brouteSemaine: scene.week } : a,
        ),
    },
    ...(t === null ? {} : { figeMs: Number(t) }),
  };
}

let rechauffe = false;

/**
 * `?pluie=30&vent=8&vent-vers=0` : une semaine à tant de millimètres, sous un
 * vent reçu de tant de mètres par seconde qui souffle **vers** ce cap, en
 * degrés (0 = vers l'est) (#130). `?neige=8&manteau=12` : la part de neige de
 * la semaine et le manteau au sol, mm d'eau ; la neige compte dans la
 * précipitation, comme dans le moteur. Les scènes cuites ne portent pas la
 * météo ; le banc la donne.
 */
function tempsDuBanc(): TempsQuIlFait | undefined {
  const q = new URLSearchParams(location.search);
  if (!q.has("pluie") && !q.has("neige") && !q.has("manteau")) return undefined;
  const neigeMm = Number(q.get("neige") ?? "0");
  return {
    pluieMm: Math.max(neigeMm, Number(q.get("pluie") ?? "0")),
    neigeMm,
    manteauNeigeMm: Number(q.get("manteau") ?? "0"),
    vent: {
      versRad: (Number(q.get("vent-vers") ?? "0") * Math.PI) / 180,
      recuMs: Number(q.get("vent") ?? "0"),
    },
  };
}
const TEMPS_DU_BANC = tempsDuBanc();

/**
 * `?gel=-5` : la nuit la plus froide de la semaine, °C, et `?brume=1` : la nappe
 * affleure dans les creux (#130). Les scènes cuites ne portent ni la météo ni
 * la nappe ; le banc prend pour creux le dixième le plus bas de la parcelle, ce
 * qui est l'endroit où le moteur la fait affleurer.
 */
let matinDuBanc: { gelees: CelluleGelee[]; affleurantes: number[] } | undefined;
function voilesDuMatin(scene: Scene, ecouleMs: number) {
  const q = new URLSearchParams(location.search);
  if (!q.has("gel") && !q.has("brume")) return { givre: [], brume: [] };
  if (!matinDuBanc) {
    const n = scene.coteM * scene.coteM;
    const lumiere = scene.sol.lumiere ?? new Array<number>(n).fill(1);
    const altitudes = scene.sol.altitudesM;
    const seuil = [...altitudes].sort((a, b) => a - b)[Math.floor(altitudes.length * 0.1)] ?? 0;
    matinDuBanc = {
      gelees: q.has("gel") ? cellulesGelees(Number(q.get("gel")), lumiere) : [],
      affleurantes: q.has("brume")
        ? cellulesAffleurantes(altitudes.map((z) => (z <= seuil ? 0 : 300)))
        : [],
    };
  }
  return {
    givre: givreEnCours(matinDuBanc.gelees, ecouleMs),
    brume: brumeEnCours(
      matinDuBanc.affleurantes,
      scene.coteM,
      TEMPS_DU_BANC?.vent.recuMs ?? 0,
      ecouleMs,
    ),
  };
}

/**
 * `?nuee=0.6` : une pullulation à cette pression, en tache de quinze mètres au
 * centre de la parcelle, un jour à 20 °C (#129). Les scènes cuites ne portent
 * ni la grille des ravageurs ni la température ; le banc les donne, comme il
 * donne la densité de gibier.
 */
/**
 * `?crue=montee` ou `?crue=retrait` : une crue fabriquée sur le quart le plus bas
 * de la parcelle, rangée du plus bas au plus haut comme le moteur range une
 * emprise (#127). La montée pose la lame et fait courir l'arrivée de l'eau ; le
 * retrait la fait partir. Les scènes cuites ne portent pas l'événement.
 */
let crueFabriquee: { cote: number; passages: CrueDeLaSemaine[]; lame?: Float32Array } | undefined;
function crueDuBanc(scene: Scene): { passages: CrueDeLaSemaine[]; lame?: Float32Array } {
  const quoi = new URLSearchParams(location.search).get("crue");
  if (quoi !== "montee" && quoi !== "retrait") return { passages: [] };
  if (crueFabriquee?.cote === scene.coteM) return crueFabriquee;
  const altitudes = scene.sol.altitudesM;
  const parAltitude = altitudes
    .map((z, i) => ({ z, i }))
    .sort((a, b) => a.z - b.z || a.i - b.i)
    .slice(0, Math.floor(altitudes.length / 4))
    .map((c) => c.i);
  const evenement = {
    id: 0,
    semaine: 0,
    phase: "montée" as const,
    monteeM: 0,
    cellules: Int32Array.from(parAltitude),
    rangs: new Int32Array(parAltitude.length),
    lamesMm: Float32Array.from(parAltitude, (_, k) => 160 * (1 - k / parAltitude.length)),
    victimes: [],
    emprisePic: parAltitude.length,
  };
  const n = scene.coteM * scene.coteM;
  const montee = monteeDeLaCrue(evenement);
  const retrait = retraitDeLaCrue(parAltitude, altitudes);
  crueFabriquee =
    quoi === "montee"
      ? {
          cote: scene.coteM,
          passages: montee ? [montee] : [],
          ...(lameDeLaCrue(evenement, n) ? { lame: lameDeLaCrue(evenement, n) } : {}),
        }
      : { cote: scene.coteM, passages: retrait ? [retrait] : [] };
  return crueFabriquee;
}

let essaimsDuBanc: { cote: number; pression: number; essaims: Essaim[] } | undefined;
function nueeDuBanc(scene: Scene, maintenantMs: number) {
  const pression = Number(new URLSearchParams(location.search).get("nuee") ?? "0");
  if (!(pression > 0)) return [];
  if (essaimsDuBanc?.cote !== scene.coteM || essaimsDuBanc.pression !== pression) {
    const c = scene.coteM;
    const grille = new Float32Array(c * c);
    for (let i = 0; i < c * c; i++) {
      const d = Math.hypot((i % c) + 0.5 - c / 2, Math.floor(i / c) + 0.5 - c / 2);
      grille[i] = d < 15 ? pression * (1 - (d / 15) ** 2 * 0.5) : 0.02;
    }
    essaimsDuBanc = { cote: c, pression, essaims: essaimsDeLaNuee(grille, c, 20) };
  }
  return pointsDeLaNuee(essaimsDuBanc.essaims, maintenantMs);
}

/** Les habitants du banc : un seul objet pour la page, comme dans le jeu. */
const residentsDuBanc = new Residents();
let residentsRechauffes = false;

/**
 * Les habitants d'une scène qui en porte (`APERCU_FAUNE=1`), à cet instant.
 *
 * `?residents-t=90000` **fige** leur horloge — rejouée depuis zéro une fois,
 * pour la même raison que le troupeau — et `?derange=x,y,t` pose un chantier
 * au point (x, y) à l'instant t, pour juger la fuite.
 */
function residentsDuBancA(
  scene: Scene,
  arbres: readonly ArbreAPoser[],
  maintenantMs: number,
): readonly PoseDHabitant[] {
  const geais = geaisDuBanc(scene, maintenantMs);
  if (!scene.faune) return geais;
  const q = new URLSearchParams(location.search);
  const d = q.get("derange")?.split(",").map(Number);
  const derangements: Derangement[] =
    d && d.length === 3 ? [{ x: d[0] ?? 0, y: d[1] ?? 0, depuisMs: d[2] ?? 0 }] : [];
  const monde = { habitants: scene.faune, arbres, derangements };
  const fige = q.get("residents-t");
  if (fige === null) return [...residentsDuBanc.poses(monde, maintenantMs), ...geais];
  const t = Number(fige);
  if (!residentsRechauffes) {
    for (let u = 0; u < t; u += 100) residentsDuBanc.poses(monde, u);
    residentsRechauffes = true;
  }
  return [...residentsDuBanc.poses(monde, t), ...geais];
}

/**
 * `?geai=3` : trois semis de chêne pubescent levés cette semaine, aux coins
 * les plus ouverts de la scène — ce que le moteur fait des glands que le geai
 * a cachés. `?geai-t=<ms>` fige l'instant, et la visite recommence toutes les
 * vingt secondes sinon, pour qu'on la voie passer.
 */
function geaisDuBanc(scene: Scene, maintenantMs: number): PoseDHabitant[] {
  const q = new URLSearchParams(location.search);
  const n = Number(q.get("geai") ?? "0");
  if (!(n > 0)) return [];
  const naissances = Array.from({ length: n }, (_, i) => ({
    id: 900_000 + i,
    especeId: "quercus_pubescens",
    x: scene.coteM * (0.3 + 0.2 * i),
    y: scene.coteM * (0.55 - 0.1 * i),
    heightM: 0.05,
  }));
  const visites = visitesDuGeai(naissances, () => true, scene.coteM, 0);
  const brut = q.get("geai-t");
  const t = brut === null ? maintenantMs % 20_000 : Number(brut);
  return posesDesGeais(visites, t);
}

/**
 * Les bêtes du banc à cet instant — ou à l'instant figé.
 *
 * Le troupeau se lit **dans l'ordre** du temps : une horloge figée d'emblée à
 * quarante secondes ne verrait jamais la première visite commencer. On rejoue
 * donc une fois le chemin depuis zéro, et l'image figée est celle d'une
 * partie qu'on aurait regardée jusque-là.
 */
function posesDuBanc(monde: MondeDuGibier, figeMs: number | undefined, maintenantMs: number) {
  if (figeMs === undefined) return troupeauDuBanc.poses(monde, maintenantMs);
  if (!rechauffe) {
    for (let t = 0; t < figeMs; t += 200) troupeauDuBanc.poses(monde, t);
    rechauffe = true;
  }
  return troupeauDuBanc.poses(monde, figeMs);
}

/**
 * `?vitrine=residents` : une clairière où l'on voit chaque habitant (#129).
 *
 * Dans une friche de soixante ans, les houppiers cachent les oiseaux — c'est
 * juste, et c'est ce qui empêche de juger leur dessin. La vitrine pose, sur la
 * scène demandée (une pelouse de préférence), **trois vrais arbres** du moteur
 * pris dans `faune-s28` — deux grands et une chandelle — et un habitant de
 * chaque espèce qu'on dessine. C'est une mise en scène de banc, et elle ne sert
 * qu'à ça.
 */
async function vitrineDesResidents(base: Scene): Promise<Scene> {
  const source: Scene = await (await fetch("/apercu/scenes/faune-s28.json")).json();
  const grands = source.trees
    .filter((t) => !t.chandelle && t.heightM > 11 && t.heightM < 18)
    .slice(0, 2);
  const chandelle = source.trees.find((t) => t.chandelle && t.heightM > 6);
  const [a, b] = grands;
  if (!a || !b || !chandelle) return base;
  const ici = (t: Scene["trees"][number], x: number, y: number) => ({ ...t, x, y });
  const arbres = [ici(a, 44, 50), ici(b, 54, 47), ici(chandelle, 50, 57)];
  const sur = (id: number, especeId: string, t: Scene["trees"][number]): IndividuFaune => ({
    id,
    especeId,
    arbreId: t.id,
    x: t.x,
    y: t.y,
    depuisSemaine: 0,
  });
  const [ta, tb] = arbres as [Scene["trees"][number], Scene["trees"][number]];
  return {
    ...base,
    trees: arbres,
    faune: [
      sur(1, "mesange_bleue", ta),
      sur(2, "mesange_charbonniere", tb),
      sur(3, "pic_epeiche", tb),
      sur(4, "buse_variable", ta),
      sur(5, "ecureuil_roux", ta),
      sur(6, "chouette_cheveche", tb),
    ],
  };
}

function ouLire(maintenantMs: number, fige: number | undefined, dureeMs: number): number {
  return fige === undefined ? maintenantMs % Math.max(1, dureeMs * 1.6) : fige * dureeMs;
}

function Demo(): React.ReactElement {
  const [scene, setScene] = useState<Scene>();
  const [compte, setCompte] = useState<Compte>();

  useEffect(() => {
    const nom = new URLSearchParams(location.search).get("scene") ?? "friche-s28";
    const vitrine = new URLSearchParams(location.search).get("vitrine") === "residents";
    void fetch(`/apercu/scenes/${nom}.json`)
      .then((r) => r.json())
      .then(async (s: Scene) => setScene(vitrine ? await vitrineDesResidents(s) : s));
  }, []);

  useEffect(() => {
    const etat = document.getElementById("etat");
    if (etat) etat.textContent = scene ? "" : "chargement de la scène…";
  }, [scene]);

  // **L'ellipse, branchée de bout en bout** : un journal de changements, un
  // plan, un lecteur, une déformation à la pose. C'est le chemin que le jeu
  // suivra ; seule l'origine du journal est postiche ici.
  //
  // Postiche parce que les scènes du banc sont un **instantané** : elles ne
  // portent aucun journal. On en fabrique donc un — les chandelles de la scène
  // qui ne sont pas du fourré, tombant chacune dans une direction tirée de son
  // identifiant. Le jour où le worker livrera `Snapshot.chutes` à la vue, ces
  // deux champs inventés (la direction, la masse) laisseront place à ceux du
  // message, qui les porte déjà — et rien d'autre ne changera.
  //
  // **Le fourré est écarté et il faut le savoir** : `separerLeFourre` agrège
  // les ronces par carreau, elles perdent leur identité, donc rien ne peut les
  // animer une par une. Sur une friche à trente ans, 1 874 des 1 918
  // chandelles sont des ronces — ce qui tombe, ce sont les quelques dizaines
  // d'arbres restants.
  //
  // `?ellipse-tout=1` fait tomber **tous** les arbres et non les seules
  // chandelles. **Ce n'est pas une scène, c'est un banc de mécanisme, et il
  // fallait le construire** : les quelques dizaines de chandelles non-fourré
  // d'un hectare font quelques pixels au zoom de parcelle, et il n'y en a
  // aucune dans le cadre au zoom rapproché. J'ai cherché le mouvement dans une
  // quinzaine de captures avant d'admettre que le sujet manquait, pas le
  // mécanisme.
  //
  // **Le tout avant le retour anticipé**, et pas après : des `useMemo` placés
  // sous un `if (!scene) return` s'exécutent en nombre variable d'un rendu à
  // l'autre, et React refuse — « Rendered more hooks than during the previous
  // render ». La page ne chargeait plus du tout.
  const ellipse = useMemo(() => {
    const params = new URLSearchParams(location.search);
    // Ce que la scène dit de l'eau passée cette semaine-là : la même grandeur
    // que `Snapshot.soilDebordementMm`, un débit, qui fait le **courant**. La
    // montée et le retrait d'une crue viennent du banc (`?crue=`).
    const courant = courantDeLaSemaine(scene?.sol.debordementMm, scene?.sol.altitudesM ?? []);
    const eaux: CrueDeLaSemaine[] = [
      ...(courant ? [courant] : []),
      ...(scene ? crueDuBanc(scene).passages : []),
    ];
    const crueDeLaScene = eaux.length > 0 ? eaux : undefined;
    const tout = params.get("ellipse-tout") === "1";
    // `?mort=secheresse` fait mourir de cette cause **tous** les arbres vivants —
    // banc de mécanisme, comme `ellipse-tout`. C'est le seul moyen de juger les
    // onze mises en scène : une semaine ordinaire en produit deux ou trois, sur
    // des arbres de dix pixels.
    const cause = params.get("mort") as CauseMort | null;
    // `?geste-arbres=receper` force lui aussi un sujet que la scène n'a pas :
    // il appartient donc aux bancs de **mécanisme**, et court-circuite le journal
    // réel comme les deux autres.
    const surArbres = params.get("geste-arbres") as GesteTypeArbre | null;
    // `?tempete=1` fabrique une rafale, pour la même raison que les trois
    // bancs au-dessus : une tempête est un événement rare, et l'attendre au
    // hasard d'une partie n'est pas une façon de juger un acte. La part qui
    // verse se règle (`?tempete-part=0.3`), le cap aussi (`?tempete-vers`).
    const rafale = params.get("tempete");
    // **Le journal réel quand la scène en porte un**, et c'est le seul cas
    // normal. Les deux bancs de mécanisme le remplacent exprès — ils fabriquent
    // un sujet que la scène n'a pas — et c'est pour ça qu'ils portent un nom
    // qui dit qu'ils forcent quelque chose.
    const reel = scene?.journal;
    if (reel && !tout && !cause && !surArbres && !rafale) {
      // L'incendie rejoint le journal sous la forme que le plan attend. Les
      // trois nombres que `IncendieResult` porte en plus — cellules brûlées,
      // arbres tués, carbone — ne servent qu'au fil d'actualité.
      // `incendie` est retiré du reste **avant** le mélange : la forme sérialisée
      // et la forme du protocole ne sont pas la même, et les répandre toutes
      // les deux donnerait une union des deux.
      const { incendie: incendieBrut, ...reste } = reel;
      const journalReel: JournalDeSemaine = {
        ...reste,
        // **La crue de la semaine** (#127) : la scène porte le débordement par
        // cellule, exactement comme l'instantané du jeu, et l'onde se joue
        // donc ici aussi. Sans cette ligne, le banc verrait la lame d'eau
        // cuite dans le terrain et jamais l'eau passer — l'écart banc/jeu qui
        // avait laissé #246 invisible.
        ...(crueDeLaScene ? { crues: crueDeLaScene } : {}),
        ...(incendieBrut
          ? {
              incendie: {
                origine: incendieBrut.origine,
                brulees: Int32Array.from(incendieBrut.brulees),
                rangs: Int32Array.from(incendieBrut.rangs),
                charges: Float32Array.from(incendieBrut.charges ?? []),
                cellulesBrulees: incendieBrut.brulees.length,
                arbresTues: incendieBrut.victimes?.length ?? 0,
                rejets: (incendieBrut.victimes ?? []).filter((v) => v.rejet).length,
                victimes: incendieBrut.victimes ?? [],
                // **Les chandelles que le front consume** (#246). Le banc n'en
                // posait aucune, et il le disait en commentaire — « le jour où
                // il en posera, elles se diraient ici ». C'est ce jour-là : la
                // scène les porte depuis que son générateur les relève, avec la
                // règle du moteur.
                chandellesConsumees: incendieBrut.chandellesConsumees ?? [],
                carboneTHa: 0,
              },
            }
          : {}),
      };
      // **Au rythme naturel, comme le jeu à l'arrêt (#163).** Le banc jugeait
      // des actes comprimés dans un budget de 2 500 ms partagé, alors que le
      // jeu, à la vitesse où l'on regarde, leur donne maintenant leur durée
      // propre. Un banc qui ne joue pas ce que le jeu joue ne juge rien.
      const plan = planAuRythmeNaturel([journalReel]);
      const ou = new Map((scene?.trees ?? []).map((t) => [t.id, { x: t.x, y: t.y }]));
      // `?calque=0` éteint tout, pour comparer ; `?calque=marqueurs` garde les
      // repères sans estomper, ce qui isole ce que chaque mécanisme apporte.
      const quoi = params.get("calque") ?? "estompe";
      // **Les arbres que l'incendie a torchés, nommés par l'incendie lui-même.**
      // Le moteur les rapporte maintenant (`IncendieResult.victimes`) la semaine
      // où il brûle, et c'était tout le problème : une mort par le feu
      // n'apparaît dans `morts` qu'un an plus tard, une semaine sans incendie,
      // si bien que le feu et ses victimes ne pouvaient jamais figurer dans le
      // même journal. Le rendu les reconnaissait donc à leur `brulEeSemaine` —
      // ce qui marchait, sauf pour un arbre brûlé lors d'un incendie **précédent**,
      // qui garde la sienne.
      //
      // Le repli sur `brulEeSemaine` ne sert plus qu'aux scènes cuites avant
      // que le champ n'existe.
      const semaines = reel.semaines ?? 0;
      const saison = scene?.sol.pheno;
      const nommees = journalReel.incendie?.victimes;
      const torchees =
        nommees && nommees.length > 0
          ? (() => {
              const ids = new Set(nommees.map((v) => v.id));
              return (scene?.trees ?? []).filter((t) => ids.has(t.id));
            })()
          : (scene?.trees ?? []).filter(
              (t) =>
                t.brulEeSemaine !== undefined &&
                (scene?.week ?? 0) - t.brulEeSemaine < Math.max(1, semaines),
            );
      // **Et les fûts que le front consume** (#246) : mêmes fonctions que le jeu,
      // pas une seconde écriture — le banc est là pour juger ce que le jeu fait.
      const consumes = futsConsumes(journalReel.incendie);
      const torches = indexerLesTorches(
        trouverLeFeu(plan),
        [
          ...futsConsumesATorcher(journalReel.incendie),
          ...torchees.map((t) => {
            const espece = getEspece(t.especeId);
            const ratio = espece?.lumiere.houppierRatio ?? 0.4;
            return {
              id: t.id,
              x: t.x,
              y: t.y,
              hauteurM: t.heightM,
              baseHouppierM: t.baseHouppierM ?? 0,
              // Le rayon du houppier, de la même fiche que le dessin de l'arbre.
              rayonHouppierM: Math.max(0.3, t.heightM * ratio * 0.5),
              // **Ce qu'il était avant le feu**, calculé par la phénologie du
              // moteur et non deviné : `partFoliaireOmbrageanteDans` dit ce que
              // cette espèce porte à cette semaine de l'année. Sans ça, la mise
              // en scène partirait du tronc charbonné que l'instantané décrit et
              // n'aurait rien à animer.
              avantLeFeu: {
                partFoliaire: espece && saison ? partFoliaireOmbrageanteDans(espece, saison) : 1,
                senescence: espece && saison ? senescenceDans(espece, saison) : 0,
                vigueur: 1,
                dommageHydraulique: 0,
              },
            };
          }),
        ],
        scene?.coteM ?? 1,
      );
      const tous = marqueursDuJournal(journalReel, (id) => ou.get(id), scene?.coteM ?? 1);
      // **L'estompe et les marqueurs, et la mesure a tranché contre mon premier
      // choix.** J'avais mis l'estompe seule par défaut, en pensant qu'elle
      // remplaçait les repères. Elle rend trouvable ce qui est clair ou coloré,
      // et échoue sur ce qui est sombre ou minuscule : une chandelle nue parmi
      // du feuillage éteint reste invisible, un semis fait deux pixels. Les
      // deux se complètent au lieu de se remplacer.
      const calque =
        quoi === "0"
          ? { marqueurs: [] as Marqueur[], omis: 0 }
          : { marqueurs: tous.marqueurs, omis: tous.omis };
      const sujets = quoi === "0" ? new Set<number>() : sujetsDuJournal(journalReel);
      return {
        index: indexerLesChutes(plan),
        voiles: indexerLesVoiles(plan, scene?.coteM ?? 1),
        crues: indexerLesCrues(plan),
        morts: indexerLesMorts(plan),
        feu: trouverLeFeu(plan),
        tempete: undefined as ReturnType<typeof trouverLaTempete>,
        torches,
        marqueurs: calque.marqueurs,
        omis: calque.omis,
        naissances: (reel.naissances ?? []).length,
        sujets,
        estompe: quoi !== "0" && quoi !== "marqueurs" && sujets.size > 0,
        dureeMs: plan.dureeMs,
        gestes: indexerLesGestes(plan),
        // Une scène qui porte un **vrai** journal a déjà été cuite après coup : ses
        // chandelles tombées n'y sont plus, et il n'y a donc rien à en retirer.
        // Il y a bien quelque chose à reposer, en revanche (#163).
        chandelles: [...chandellesTombees(plan), ...consumes],
        indexChandelles: indexerLesChandellesTombees(plan),
        apres: new Map<number, { heightM: number; baseHouppierM: number }>(),
        partis: new Set<number>(),
      };
    }
    // Les arbres assez hauts pour verser : sous cinq mètres une tige plie et
    // se relève, elle ne casse pas (`HAUTEUR_SOUPLE_M`, tempete.ts).
    const versables = (scene?.trees ?? []).filter(
      (t) => t.heightM > 5 && !t.chandelle && !ficheDe(t.especeId)?.fourre,
    );
    const partVersee = Number(params.get("tempete-part") ?? "0.25");
    const journal: JournalDeSemaine = {
      // **La crue vient de la scène et non du banc** (#127) : elle n'est pas
      // fabriquée comme la rafale ou les morts ci-dessous, elle est là dès que
      // la scène porte de l'eau refusée. Une scène sans journal — la plupart —
      // passe par ici, et c'est le seul chemin où elle pouvait se perdre.
      ...(crueDeLaScene ? { crues: crueDeLaScene } : {}),
      ...(rafale
        ? {
            tempete: {
              rafaleMs: Number(params.get("tempete-force") ?? "33.3"),
              versRad: Number(params.get("tempete-vers") ?? "0.785"),
              arbresCasses: 0,
              arbresEbranches: 0,
              arbresVerses: 0,
              volumeM3: 0,
              victimes: versables
                .filter((_, i) => i % Math.max(1, Math.round(1 / partVersee)) === 0)
                .map((t) => ({ id: t.id, hauteurM: t.heightM })),
            },
          }
        : {}),
      ...(cause
        ? {
            morts: (scene?.trees ?? [])
              .filter((t) => t.heightM > 0 && !t.chandelle && !ficheDe(t.especeId)?.fourre)
              .map((t) => ({
                id: t.id,
                x: t.x,
                y: t.y,
                especeId: t.especeId,
                cause,
                heightM: t.heightM,
              })),
          }
        : {}),
      chutes: (scene?.trees ?? [])
        .filter(
          (t) =>
            t.heightM > 0 &&
            (tout ? true : t.chandelle) &&
            !ficheDe(t.especeId)?.fourre &&
            // Une ellipse qui montre une mort ne doit pas faire tomber le même
            // arbre en même temps : deux actes sur un sujet se composent, et on
            // ne verrait ni l'un ni l'autre. Même raison pour la rafale, qui
            // couche déjà les siens.
            !cause &&
            !rafale,
        )
        .map((t) => ({
          id: t.id,
          x: t.x,
          y: t.y,
          especeId: t.especeId,
          heightM: t.heightM,
          directionRad: ((t.id % 360) * Math.PI) / 180,
          masseKgC: 0,
          empreinte: [],
        })),
    };
    // Indexé **une fois** : le rappel de déformation est appelé une fois par arbre
    // et par image, et une recherche linéaire à cet endroit-là ne tient pas —
    // trois mille chutes en donnaient neuf millions de comparaisons par image,
    // et la page ne finissait jamais de charger.
    // `?geste=chauler&geste-rayon=18` ajoute un geste de zone **postiche**, au
    // centre de la parcelle. Postiche pour la même raison que les chutes — un
    // instantané ne porte pas de journal — mais la maille est celle du moteur :
    // des indices `y * coteM + x`, ceux que `applyChauler` rend vraiment.
    const quel = params.get("geste");
    if (quel && scene) {
      const rayon = Number(params.get("geste-rayon") ?? 18);
      const c = scene.coteM / 2;
      const cellules: number[] = [];
      for (let y = 0; y < scene.coteM; y++) {
        for (let x = 0; x < scene.coteM; x++) {
          if ((x + 0.5 - c) ** 2 + (y + 0.5 - c) ** 2 <= rayon * rayon) {
            cellules.push(y * scene.coteM + x);
          }
        }
      }
      journal.gestes = [{ type: quel as GesteTypeZone, cellules }];
    }
    // **`?geste-arbres=receper` : le banc des cinq gestes sur arbres** (§6.2).
    //
    // Banc de mécanisme au même titre que `?mort=` et `?ellipse-tout=1`, et
    // pour la même raison, mesurée en jouant : trois cépées recépées dans une
    // friche de quatre mille bouleaux ne se voient pas. Ce qu'on vient juger
    // ici, c'est le **dessin** du geste, et il lui faut un sujet visible — donc les
    // plus grosses tiges de la scène, et beaucoup.
    //
    // Le banc fabrique l'`ArbreRetire` **et** applique l'après à la scène, comme le
    // moteur le fait : sans ça, un arbre coupé resterait debout à côté de son
    // fantôme et on en verrait deux.
    let apres = new Map<number, { heightM: number; baseHouppierM: number }>();
    let partis = new Set<number>();
    if (surArbres && scene) {
      const combien = Number(params.get("geste-combien") ?? 60);
      const sujets = (scene.trees ?? [])
        .filter((t) => !t.chandelle && t.heightM > 1 && !ficheDe(t.especeId)?.fourre)
        .sort((a, b) => b.heightM - a.heightM)
        .slice(0, combien);
      const retire = sujets.map((t) => {
        const baseAvant = t.baseHouppierM ?? t.heightM * 0.3;
        // Ce que chaque geste laisse debout, tel que le moteur le définit.
        const reste =
          surArbres === "elaguer"
            ? t.heightM
            : surArbres === "trogner"
              ? Math.max(1.5, t.heightM * 0.25)
              : surArbres === "receper"
                ? 0.3
                : 0;
        const baseApres =
          surArbres === "elaguer" ? Math.min(t.heightM * 0.6, baseAvant + 4) : reste;
        return {
          id: t.id,
          x: t.x,
          y: t.y,
          especeId: t.especeId,
          diametreCm: 30,
          hauteurAvantM: t.heightM,
          hauteurApresM: reste,
          baseHouppierAvantM: baseAvant,
          baseHouppierApresM: baseApres,
          // Faux sans condition : le banc ne met en scène que des tiges
          // VIVANTES (`!t.chandelle` au filtre, trois lignes plus haut). Pour
          // voir une chandelle se coucher sèche (#235), il faudrait lever ce
          // filtre — c'est une décision de banc, pas de moteur.
          mortAvantLeGeste: false,
          // Absente pour l'élagage et l'étêtage : « la charpente est démontée
          // sur place, le moteur n'y voit pas une direction unique ».
          ...(surArbres === "elaguer" || surArbres === "trogner"
            ? {}
            : { directionRad: ((t.id % 360) * Math.PI) / 180 }),
        };
      });
      journal.gestes = [{ type: surArbres, ids: retire.map((r) => r.id), retire }];
      apres = new Map(
        retire
          .filter((r) => r.hauteurApresM > 0)
          .map((r) => [r.id, { heightM: r.hauteurApresM, baseHouppierM: r.baseHouppierApresM }]),
      );
      partis = new Set(retire.filter((r) => r.hauteurApresM <= 0).map((r) => r.id));
    }
    const plan = planAuRythmeNaturel([journal]);
    // **Le banc doit tenir la prémisse du moteur, et il ne la tenait pas
    // (#163).** Une chandelle qui s'abat quitte `state.trees` dans le tick même
    // où sa chute est rapportée — mesuré, 423 fois sur 423. Le banc, lui,
    // fabriquait sa chute en laissant l'arbre dans la scène : il prouvait donc
    // la mécanique de chute sur une situation que le jeu ne rencontre jamais,
    // et c'est exactement pour ça que le défaut a survécu à toutes les
    // captures. On retire donc ce qui tombe, comme le moteur le retire, et
    // c'est `chandellesTombees` qui le repose.
    for (const chute of journal.chutes ?? []) partis.add(chute.id);
    // La **durée** du plan et non le budget : un plan vide dure zéro, et c'est ce
    // zéro-là qu'il faut porter pour que `?ellipse=` ne prétende pas figer une
    // ellipse qui n'existe pas.
    const ouEtQuelleHauteur = new Map(
      (scene?.trees ?? []).map((t) => [t.id, { x: t.x, y: t.y, heightM: t.heightM }]),
    );
    return {
      index: indexerLesChutes(plan),
      crues: indexerLesCrues(plan),
      voiles: indexerLesVoiles(plan, scene?.coteM ?? 1),
      morts: indexerLesMorts(plan),
      feu: trouverLeFeu(plan),
      tempete: trouverLaTempete(plan, (id) => ouEtQuelleHauteur.get(id)),
      torches: AUCUNE_TORCHE,
      marqueurs: [] as Marqueur[],
      omis: 0,
      naissances: 0,
      sujets: new Set<number>(),
      estompe: false,
      dureeMs: plan.dureeMs,
      gestes: indexerLesGestes(plan),
      chandelles: chandellesTombees(plan),
      indexChandelles: indexerLesChandellesTombees(plan),
      apres,
      partis,
    };
  }, [scene]);

  useEffect(() => {
    const boite = document.getElementById("compte");
    if (!boite) return;
    boite.textContent = compte
      ? [
          `sprites   ${compte.spritesPoses}`,
          `pose      ${compte.msPose.toFixed(2)} ms`,
          `cuisson   ${compte.msCuisson.toFixed(2)} ms`,
          `sol cuit  ${compte.morceauxCuits}`,
          `décor     ${compte.decorCuit}`,
          `classes   ${compte.classesCuites}`,
          `sol att. ${compte.solEnRetard}`,
          `décor a. ${compte.decorEnRetard}`,
          `arbres a. ${compte.arbresEnRetard}`,
        ].join("\n")
      : "";
  }, [compte]);

  useEffect(() => {
    const etat = document.getElementById("etat");
    if (!etat || !scene) return;
    // Le calque et ce qu'il a renoncé à montrer : sans ce chiffre à l'écran,
    // un calque vide et un calque débordé se ressemblent.
    etat.textContent = `${ellipse.estompe ? "estompe" : "marqueurs"} : ${
      ellipse.sujets.size
    } sujets nets, ${ellipse.naissances} naissances, ${ellipse.marqueurs.length} repères${
      ellipse.omis > 0 ? `, ${ellipse.omis} changements non pointés` : ""
    }${ellipse.feu ? ` — INCENDIE de ${ellipse.feu.feu.brulees.length} cellules` : ""}`;
  }, [ellipse, scene]);

  if (!scene) return <div />;
  const pheno = scene.sol.pheno;
  // Le même adaptateur que le jeu (`src/game/parcelle.ts`). Le banc ne
  // fabrique donc plus sa propre traduction : c'est précisément parce qu'il en
  // avait une à lui que `floraison`, `fruitProgress` et `fruitsKg` s'y
  // perdaient en route, déclarés dans la scène et posés nulle part.
  // La scène telle que le geste l'a laissée : ce qui est parti n'est plus là,
  // ce qui reste debout porte son état d'**après**. C'est le rôle du moteur dans
  // une vraie partie, et le banc doit le tenir — sans quoi un arbre coupé
  // resterait debout à côté de son fantôme.
  const restants =
    ellipse.partis.size === 0 && ellipse.apres.size === 0
      ? scene.trees
      : scene.trees
          .filter((t) => !ellipse.partis.has(t.id))
          .map((t) => {
            const a = ellipse.apres.get(t.id);
            return a ? { ...t, heightM: a.heightM, baseHouppierM: a.baseHouppierM } : t;
          });
  /**
   * `?chablis-part=0.2` : la parcelle **la semaine d'après** une rafale (#107).
   *
   * Un chablis versé reste dans la liste des arbres l'année où son bois se
   * récolte encore, couché. C'est un état qu'aucune autre commande du banc ne
   * montre : `?tempete=1` joue la rafale, et l'acte fini, l'ellipse est finie
   * aussi. Or c'est bien cet état-là qui était faux — un tronc dressé là où le
   * moteur a un arbre par terre.
   *
   * Un banc de **mécanisme**, comme `?mort=` ou `?tempete=` : mesuré sur
   * soixante ans de limon riche, un épisode de chablis en tout, donc l'attendre
   * au hasard d'une partie n'est pas une façon de juger une pose.
   */
  const partCouchee = Number(new URLSearchParams(location.search).get("chablis-part") ?? "0");
  const capDuChablis = Number(new URLSearchParams(location.search).get("chablis-vers") ?? "0.785");
  const debout: ArbreSource[] =
    partCouchee > 0
      ? restants.map((t, i) =>
          t.heightM > 5 && !t.chandelle && i % Math.max(1, Math.round(1 / partCouchee)) === 0
            ? {
                ...t,
                // Versé : mort sur-le-champ pour le moteur, et couché depuis la
                // semaine d'avant — celle de la rafale.
                chandelle: true,
                renverseSemaine: scene.week - 1,
                chuteRad: capDuChablis,
              }
            : t,
        )
      : restants;
  /**
   * `?chandelle-ans=25` : vieillit **toutes** les chandelles de la scène (#107).
   *
   * Les scènes cuites avant ce lot ne portent pas `mortSemaine` — elles ont
   * donc des chandelles de l'année, quel que soit leur âge réel. Ce réglage
   * donne le même âge à toutes, ce qui est exactement ce qu'il faut pour juger
   * les trois paliers côte à côte : gris frais, gris blanchi, squelette
   * ébranché. Une scène régénérée, elle, porte l'âge de chacune.
   */
  const ansDeChandelle = Number(new URLSearchParams(location.search).get("chandelle-ans") ?? "-1");
  /**
   * `?chandelle-tout=1` : et alors **tout** ce qui est assez haut est une
   * chandelle de cet âge-là.
   *
   * Les chandelles d'une scène ordinaire sont surtout des arbustes de fourré,
   * que le rendu agrège — mesuré sur `pelouse-arbres-s28` : 2 057 chandelles,
   * presque toutes de l'aubépine et du prunellier. On n'y voit donc pas ce
   * qu'un fût sec devient. Celui-ci fait une futaie de chandelles, ce qui est le
   * seul moyen de juger les trois paliers côte à côte.
   */
  const toutEnChandelle = new URLSearchParams(location.search).get("chandelle-tout") === "1";
  const vieillis: ArbreSource[] =
    ansDeChandelle >= 0
      ? debout.map((t) =>
          t.chandelle || (toutEnChandelle && t.heightM > 5)
            ? {
                ...t,
                chandelle: true,
                mortSemaine: scene.week - Math.round(ansDeChandelle * 52),
              }
            : t,
        )
      : debout;
  const arbres: ArbreAPoser[] = arbresAPoser(
    [...vieillis, ...tigesAbattues(ellipse.gestes), ...ellipse.chandelles],
    {
      coteM: scene.coteM,
      week: scene.week,
      altitudesM: scene.sol.altitudesM,
      ...(pheno ? { pheno } : {}),
      seTorche: (id) => ellipse.torches.arbres.has(id),
    },
  );

  // `?ellipse=0.4` **fige** la lecture à cet avancement, et c'est ce qui rend la
  // démonstration jugeable : une animation qui tourne à une image par seconde
  // sur un conteneur sans carte graphique n'est pas observable autrement.
  const brut = new URLSearchParams(location.search).get("ellipse");
  const fige = brut === null ? undefined : Math.min(1, Math.max(0, Number(brut)));

  const gibier = mondeDuBanc(scene);
  // `?choisir=12,40` : ces arbres sont choisis, et leur halo se voit. C'est ce
  // qui permet de juger le halo là où il se trompait — parmi les masses de
  // fourré, dont les sprites s'intercalent entre ceux des arbres (#129).
  const choisis = new Set(
    (new URLSearchParams(location.search).get("choisir") ?? "")
      .split(",")
      .filter((x) => x !== "")
      .map(Number),
  );
  // `?faune-cadrer=1`, avec une horloge figée : la vue se centre sur la
  // première bête, ce qui est la seule façon de la trouver dans une friche.
  const premiereBete =
    gibier.monde &&
    gibier.figeMs !== undefined &&
    new URLSearchParams(location.search).get("faune-cadrer") === "1"
      ? posesDuBanc(gibier.monde, gibier.figeMs, 0)[0]
      : undefined;

  // `?residents-cadrer=pic_epeiche`, avec une horloge figée : la vue se centre
  // sur cette bête-là. Elle est en l'air : on vise le point du sol qui tombe
  // sous elle **à l'écran** — reculer de `h` sur les deux axes remonte l'image
  // de `h` mètres verticaux à l'orientation du banc.
  const especeCadree = new URLSearchParams(location.search).get("residents-cadrer");
  const individuCadre = especeCadree
    ? scene.faune?.find((f) => f.especeId === especeCadree)
    : undefined;
  const beteCadree =
    individuCadre && new URLSearchParams(location.search).get("residents-t") !== null
      ? residentsDuBancA(scene, arbres, 0).find((p) => p.cle.startsWith(`${individuCadre.id}:`))
      : undefined;
  const giteCadre = beteCadree
    ? { x: beteCadree.x - beteCadree.hauteurM, y: beteCadree.y - beteCadree.hauteurM }
    : individuCadre;

  return (
    <VueParcelle
      sol={donneesDe(scene)}
      semaineAnnee={scene.week % 52}
      arbres={arbres}
      {...(scene.sol.bordures ? { bordures: scene.sol.bordures } : {})}
      hauteurMaxDe={(especeId) => especeSiConnue(especeId)?.hauteurMaxM ?? 20}
      ombreDe={(a) => a.partFoliaire}
      surCompte={setCompte}
      marqueurs={ellipse.marqueurs}
      {...(choisis.size > 0 ? { surbrillance: choisis } : {})}
      {...(TEMPS_DU_BANC ? { temps: TEMPS_DU_BANC } : {})}
      brume={(maintenantMs) =>
        voilesDuMatin(scene, ouLire(maintenantMs, fige, ellipse.dureeMs)).brume
      }
      {...(new URLSearchParams(location.search).has("nuee")
        ? { nuee: (maintenantMs: number) => nueeDuBanc(scene, maintenantMs) }
        : {})}
      {...(scene.faune || new URLSearchParams(location.search).has("geai")
        ? { residents: (maintenantMs: number) => residentsDuBancA(scene, arbres, maintenantMs) }
        : {})}
      {...(gibier.monde
        ? {
            faune: (maintenantMs: number) =>
              gibier.monde ? posesDuBanc(gibier.monde, gibier.figeMs, maintenantMs) : [],
          }
        : {})}
      deformer={(id, maintenantMs, vue) => {
        const ou = ouLire(maintenantMs, fige, ellipse.dureeMs);
        // Les deux canaux de pose se **composent** : franchir dix ans, c'est voir
        // un arbre mourir puis tomber, et `DEBOUT` est neutre pour cette
        // composition — on peut donc appeler les deux sans se demander lequel
        // a lieu.
        // L'estompe est une **troisième** déformation, et elle se compose comme les
        // deux autres : ce qui n'est pas sujet du journal s'efface.
        const estompe: Deformation =
          ellipse.estompe && !ellipse.sujets.has(id)
            ? { rotationRad: 0, hauteur: 1, opacite: OPACITE_HORS_SUJET }
            : DEBOUT;
        // Un fût reposé n'est pas un arbre de l'instantané : identifiant
        // négatif. Un geste l'a couché (§6.2), ou c'est une chandelle qui
        // s'abat (#163) ; l'index qui ne le connaît pas rend `DEBOUT`.
        if (id < 0) {
          return combiner(
            combiner(
              chuteDeLaTige(ellipse.gestes, ou, id, vue),
              chuteDeLaChandelle(ellipse.indexChandelles, ou, id, vue),
            ),
            // Un fût consumé ne tombe pas : il s'efface en flambant (#246).
            poseDuFutConsume(ellipse.torches, ou, id),
          );
        }
        return combiner(
          combiner(
            combiner(
              deformationDe(ellipse.index, ou, id, vue),
              poseDeLaMort(ellipse.morts, ou, id),
            ),
            poseDeLaRafale(ellipse.tempete, ou, id, vue),
          ),
          estompe,
        );
      }}
      remodeler={(id, maintenantMs) =>
        remodelageDe(ellipse.gestes, ouLire(maintenantMs, fige, ellipse.dureeMs), id)
      }
      mourant={(id, maintenantMs, vivant) => {
        const ou = ouLire(maintenantMs, fige, ellipse.dureeMs);
        // Les deux mises en scène ne se croisent jamais sur un même arbre — le
        // moteur ne rapporte pas une mort par le feu et le torchage ne touche
        // que les brûlés — mais l'ordre est écrit quand même : c'est l'incendie
        // qui décide de ce qu'il a tué.
        return (
          etatDuTorchage(ellipse.torches, ou, id) ?? etatMourantDe(ellipse.morts, ou, id, vivant)
        );
      }}
      voiler={(maintenantMs) => {
        const ou = ouLire(maintenantMs, fige, ellipse.dureeMs);
        // Le front d'incendie et le voile d'un geste passent par la **même**
        // couche : deux choses différentes qui se dessinent pareil.
        return [
          ...voilesDuMatin(scene, ou).givre,
          ...voilesEnCours(ellipse.voiles, ou),
          ...feuEnCours(ellipse.feu, ou),
          ...crueEnCours(ellipse.crues, ou, scene.week % 52),
        ];
      }}
      feu={(maintenantMs) =>
        particulesDuFeu(
          ellipse.feu,
          ouLire(maintenantMs, fige, ellipse.dureeMs),
          scene.coteM,
          scene.vent ?? SANS_VENT,
          ellipse.torches,
        )
      }
      // **Cadrer le départ de l'incendie** (§6.4). Le moteur met déjà le jeu en
      // pause dessus (`autopause`), donc la vue a le droit d'y aller — et c'est
      // le seul événement du jeu qui le mérite, parce que c'est le seul qui
      // puisse tout changer en une semaine.
      {...(ellipse.feu
        ? {
            cadrerSur: {
              x: (ellipse.feu.origine % scene.coteM) + 0.5,
              y: Math.floor(ellipse.feu.origine / scene.coteM) + 0.5,
            },
          }
        : premiereBete
          ? { cadrerSur: { x: premiereBete.x, y: premiereBete.y } }
          : giteCadre
            ? { cadrerSur: { x: giteCadre.x, y: giteCadre.y } }
            : {})}
    />
  );
}

const racine = document.getElementById("racine");
if (racine) createRoot(racine).render(<Demo />);
