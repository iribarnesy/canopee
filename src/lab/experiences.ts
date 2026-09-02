/**
 * Expériences du laboratoire : chaque mécanisme du moteur, montré plutôt que
 * raconté.
 *
 * Ce sont les mêmes situations que les tests écologiques, mais rendues
 * visibles : deux conduites comparées toutes choses égales par ailleurs, une
 * courbe chacune, et le chiffre qui en sort. Un test dit « ça passe » ; ici on
 * voit de combien, à partir de quand, et ce que ça coûte.
 *
 * Code pur (aucun accès DOM) : il tourne dans un worker.
 */

import { serieMeteoPour } from "../data/meteo";
import { applyAction, type GameAction } from "../engine/actions";
import { indiceBiodiversite } from "../engine/biodiversite";
import { T_HA_TO_G_M2 } from "../engine/carbon";
import { getScenario, meteoDerivee, normalesHebdo } from "../engine/climat";
import { ESPECES_V0 } from "../engine/especes";
import { advanceWeek } from "../engine/game";
import { partMecanisable } from "../engine/mecanisation";
import { serieToWeeks, type WeekWeather } from "../engine/meteo";
import { RELIEF_PLAT } from "../engine/relief";
import { rngStateFromSeed } from "../engine/rng";
import { horizon } from "../engine/soil";
import { createGameState, type GameState, plantAt, type Station } from "../engine/state";
import {
  FRICHE_LIMON,
  LANDE_SECHE,
  LIMON_RICHE,
  type STATIONS_V0,
  stationDepuisProfil,
} from "../engine/stations";
import { COULEUR_AUTRES, SPECIES_COLORS } from "../ui/couleurs";

export interface Serie {
  nom: string;
  couleur: string;
  /** une valeur par an */
  valeurs: number[];
}

export interface ResultatExperience {
  id: string;
  /** "courbe" = séries annuelles ; "barres" = une valeur par variante */
  forme: "courbe" | "barres";
  uniteY: string;
  series: Serie[];
  /** ce qu'il faut retenir, chiffres à l'appui */
  verdict: string;
}

/** Un réglage qu'on peut tourner avant de lancer une expérience. */
export interface Parametre {
  id: string;
  libelle: string;
  /** ce que ce réglage change, en une phrase */
  aide: string;
  min: number;
  max: number;
  pas: number;
  defaut: number;
  /** unité affichée à côté de la valeur */
  unite: string;
  /** libellés à la place des nombres (bascules, choix) */
  libellesValeurs?: readonly string[];
}

export type Reglages = Record<string, number>;

export interface Experience {
  id: string;
  titre: string;
  /** la question posée, en français */
  question: string;
  /** ce que le moteur est censé produire, et pourquoi */
  attendu: string;
  /** durée indicative du calcul */
  cout: "court" | "long";
  /** réglages exposés au joueur (absent = expérience figée) */
  parametres?: readonly Parametre[];
  executer: (reglages: Reglages) => ResultatExperience;
}

const VERT = "#3f7d3f";
const ROUGE = "#b5462f";
const BLEU = "#3d6ea8";

function meteo(stationId: string): WeekWeather[] {
  const serie = serieMeteoPour(stationId);
  if (!serie) throw new Error(`série manquante : ${stationId}`);
  return serieToWeeks(serie);
}

function station(base: (typeof STATIONS_V0)[number], patch: Partial<Station> = {}): Station {
  return { ...base.station, coteM: 40, voisinage: [], ...patch };
}

/** Hauteur médiane des arbres d'une espèce encore vivants. */
function hauteurMediane(state: GameState, especeId: string): number {
  const h = state.trees
    .filter((t) => t.alive && t.especeId === especeId)
    .map((t) => t.heightM)
    .sort((a, b) => a - b);
  return h.length === 0 ? 0 : (h[Math.floor(h.length / 2)] ?? 0);
}

function moyenne(a: readonly number[]): number {
  return a.length === 0 ? 0 : a.reduce((s, v) => s + v, 0) / a.length;
}

/**
 * Fait tourner une parcelle et relève une mesure à la fin de chaque année.
 */
function courbe(
  st: Station,
  weather: WeekWeather[],
  ans: number,
  preparer: (s: GameState) => GameState,
  actions: GameAction[],
  mesurer: (s: GameState, cumul: Cumuls) => number,
  scenarioId: "stable" | "ssp126" | "ssp245" | "ssp585" = "stable",
  anneeDepart = 2026,
): number[] {
  let state = preparer(createGameState(st, rngStateFromSeed(7)));
  const scenario = getScenario(scenarioId);
  const normales = normalesHebdo(weather);
  const cumul: Cumuls = { mortsParCause: {}, etpAnnee: 0, incendies: 0 };
  const valeurs: number[] = [];
  for (let i = 0; i < ans * 52; i++) {
    const base = weather[i % weather.length];
    if (!base) throw new Error("météo manquante");
    const w = meteoDerivee(base, i % 52, scenario, anneeDepart + Math.floor(i / 52), normales);
    const r = advanceWeek(state, w, actions);
    state = r.state;
    cumul.etpAnnee += r.fluxes.etpMm;
    if (r.incendie) cumul.incendies++;
    for (const m of r.morts) {
      cumul.mortsParCause[m.cause] = (cumul.mortsParCause[m.cause] ?? 0) + 1;
    }
    if ((i + 1) % 52 === 0) {
      valeurs.push(mesurer(state, cumul));
      cumul.etpAnnee = 0;
    }
  }
  return valeurs;
}

interface Cumuls {
  mortsParCause: Record<string, number>;
  etpAnnee: number;
  incendies: number;
}

/** Plante une grille régulière et renvoie les identifiants créés. */
function planterGrille(
  s: GameState,
  especeId: string | string[],
  cote: number,
  pas: number,
  hauteur = 0.4,
): { state: GameState; ids: number[] } {
  let state = s;
  const ids: number[] = [];
  const especes = Array.isArray(especeId) ? especeId : [especeId];
  for (let i = 0; i < cote * cote; i++) {
    const esp = especes[i % especes.length];
    if (!esp) continue;
    state = plantAt(state, esp, 2 + (i % cote) * pas, 2 + Math.floor(i / cote) * pas, hauteur);
    const dernier = state.trees[state.trees.length - 1];
    if (dernier) ids.push(dernier.id);
  }
  return { state, ids };
}

const dernier = (a: readonly number[]) => a[a.length - 1] ?? 0;
const premier = (a: readonly number[]) => a[0] ?? 0;
/** Hausse relative entre la première et la dernière année, en %. */
const hausse = (a: readonly number[]) =>
  (((dernier(a) - premier(a)) / Math.max(1e-9, premier(a))) * 100).toFixed(0);

/**
 * Bac à sable : une friche vierge, une pluie de semis de toutes les espèces,
 * et des réglages qu'on tourne pour voir qui gagne. C'est le moteur mis à nu —
 * rien n'est planté, rien n'est conduit, tout se joue entre le sol, le climat
 * et les tempéraments.
 */
const BAC_A_SABLE: Experience = {
  id: "bac-a-sable",
  titre: "Bac à sable — régénération naturelle",
  question: "Qui s'installe, sur quel terrain, et sous quel climat ?",
  attendu:
    "Toutes les espèces reçoivent la même pluie de semis. Ce qui décide, ce sont leurs tempéraments face au sol et au climat qu'on a réglés — et le gibier, qui trie par appétence. Aucune espèce n'est favorisée par le code.",
  cout: "long",
  parametres: [
    {
      id: "ans",
      libelle: "Durée",
      aide: "La succession met des décennies : à 30 ans on voit les pionnières, à 150 ans le climax.",
      min: 30,
      max: 150,
      pas: 10,
      defaut: 80,
      unite: "ans",
    },
    {
      id: "gibier",
      libelle: "Gibier",
      aide: "Densité de cervidés du paysage. Au-delà de ~0,35/ha, les essences appétentes ne sortent plus de la hauteur de dent.",
      min: 0,
      max: 0.6,
      pas: 0.05,
      defaut: 0.15,
      unite: "cervidés/ha",
    },
    {
      id: "profondeur",
      libelle: "Profondeur de sol",
      aide: "Épaisseur exploitable par les racines. Un sol profond avantage les pivots, un sol maigre les frugales.",
      min: 25,
      max: 200,
      pas: 5,
      defaut: 90,
      unite: "cm",
    },
    {
      id: "argile",
      libelle: "Texture",
      aide: "De sableuse (0) à argileuse (100) : ça décide de la réserve utile ET du drainage.",
      min: 0,
      max: 100,
      pas: 5,
      defaut: 40,
      unite: "% fin",
    },
    {
      id: "ph",
      libelle: "pH du sol",
      aide: "Il exclut les espèces hors de leur gamme, et freine la vie du sol quand il est acide.",
      min: 4,
      max: 8,
      pas: 0.1,
      defaut: 6,
      unite: "",
    },
    {
      id: "mo",
      libelle: "Matière organique",
      aide: "Le capital de départ : azote à minéraliser et eau retenue.",
      min: 0.5,
      max: 8,
      pas: 0.5,
      defaut: 3,
      unite: "%",
    },
    {
      id: "latitude",
      libelle: "Latitude",
      aide: "Position sur le globe : elle fixe le rayonnement, donc l'évapotranspiration. Du Roussillon (42°) à la Flandre (51°).",
      min: 42,
      max: 51,
      pas: 0.5,
      defaut: 47,
      unite: "°N",
    },
    {
      id: "meteo",
      libelle: "Climat local",
      aide: "La série d'observations rejouée : océanique landais, ligérien, ou nord.",
      min: 0,
      max: 2,
      pas: 1,
      defaut: 1,
      unite: "",
      libellesValeurs: ["Mont-de-Marsan", "Tours", "Abbeville"],
    },
    {
      id: "scenario",
      libelle: "Trajectoire climatique",
      aide: "Le climat dérive-t-il pendant la partie ?",
      min: 0,
      max: 3,
      pas: 1,
      defaut: 0,
      unite: "",
      libellesValeurs: ["Climat figé", "SSP1-2.6", "SSP2-4.5", "SSP5-8.5"],
    },
  ],
  executer: (r) => {
    const ans = Math.round(r.ans ?? 80);
    const argile = (r.argile ?? 40) / 100;
    const profondeur = r.profondeur ?? 90;
    const ph = r.ph ?? 6;
    const mo = r.mo ?? 3;
    // Un profil à deux horizons : un horizon de surface humifère, puis le
    // reste. La MO décroît avec la profondeur, comme partout.
    const surfaceCm = Math.min(30, profondeur);
    const texture = { sable: 1 - argile, limon: argile * 0.6, argile: argile * 0.4 };
    const profil = [
      horizon(surfaceCm, texture, { moPct: mo, ph }),
      ...(profondeur > surfaceCm
        ? [horizon(profondeur - surfaceCm, texture, { moPct: mo * 0.3, ph })]
        : []),
    ];
    const meteoIds = ["lande-seche", "limon-riche", "friche-limon"] as const;
    const meteoId = meteoIds[Math.round(r.meteo ?? 1)] ?? "limon-riche";
    const scenarios = ["stable", "ssp126", "ssp245", "ssp585"] as const;
    const scenarioId = scenarios[Math.round(r.scenario ?? 0)] ?? "stable";

    const st = stationDepuisProfil({
      id: "bac-a-sable",
      nom: "Bac à sable",
      coteM: 50,
      latitudeDeg: r.latitude ?? 47,
      profil,
      paysageId: "bocage",
      relief: RELIEF_PLAT,
      initialMineralNKgHa: 20,
      remonteeNappeMmSemaine: 0,
      drainageExterneMmSemaine: 40,
      herbeInitiale: 0.6,
    });

    const w = meteo(meteoId);
    const scenario = getScenario(scenarioId);
    const normales = normalesHebdo(w);
    let state = createGameState(st, rngStateFromSeed(7));
    const parAn: Record<string, number[]> = {};
    for (const e of ESPECES_V0) parAn[e.id] = [];
    for (let i = 0; i < ans * 52; i++) {
      const base = w[i % w.length];
      if (!base) throw new Error("météo manquante");
      state = advanceWeek(
        state,
        meteoDerivee(base, i % 52, scenario, 2026 + Math.floor(i / 52), normales),
        [],
      ).state;
      if ((i + 1) % 52 === 0) {
        for (const e of ESPECES_V0) {
          parAn[e.id]?.push(state.trees.filter((t) => t.alive && t.especeId === e.id).length);
        }
      }
    }

    // Au plus six espèces nommées : au-delà, une légende devient un jeu de
    // devinettes. Le reste est replié dans « autres ».
    // On nomme les six qui ont compté À UN MOMENT, pas seulement à la fin :
    // sinon les pionnières, qui dominent puis s'effacent, disparaissent dans
    // « autres » et la succession devient illisible.
    const classees = ESPECES_V0.map((e) => ({
      espece: e,
      valeurs: parAn[e.id] ?? [],
      fin: dernier(parAn[e.id] ?? []),
      sommet: Math.max(0, ...(parAn[e.id] ?? [])),
    })).sort((a, b) => b.sommet - a.sommet);
    const nommees = classees.filter((c) => c.sommet > 0).slice(0, 6);
    const autres = classees.filter((c) => !nommees.includes(c));
    const series: Serie[] = nommees.map((c) => ({
      nom: c.espece.nom,
      couleur: SPECIES_COLORS[c.espece.id] ?? COULEUR_AUTRES,
      valeurs: c.valeurs,
    }));
    if (autres.some((c) => c.fin > 0)) {
      series.push({
        nom: "autres",
        couleur: COULEUR_AUTRES,
        valeurs: Array.from({ length: ans }, (_, i) =>
          autres.reduce((s, c) => s + (c.valeurs[i] ?? 0), 0),
        ),
      });
    }
    const total = classees.reduce((s, c) => s + c.fin, 0);
    const podium = [...classees]
      .sort((a, b) => b.fin - a.fin)
      .filter((c) => c.fin > 0)
      .slice(0, 3)
      .map((c) => `${c.espece.nom} (${c.fin})`)
      .join(", ");
    const disparues = classees.filter((c) => c.fin === 0).length;
    return {
      id: "bac-a-sable",
      forme: "courbe",
      uniteY: "individus vivants",
      series,
      verdict: `Après ${ans} ans : ${total} tiges vivantes. En tête : ${podium || "personne"}. ${disparues} espèce${disparues > 1 ? "s n'ont" : " n'a"} pas tenu. Changez un réglage à la fois pour voir ce qui décide.`,
    };
  },
};

const MYCORHIZES: Experience = {
  id: "mycorhizes",
  titre: "Planter dans un labour",
  question: "Pourquoi un plant démarre-t-il mieux dans un vieux sol forestier ?",
  attendu:
    "Le réseau mycorhizien met des années à se tisser et un labour n'en laisse que 5 %. On regarde ici deux choses : le réseau lui-même, et si les plants en pâtissent réellement.",
  cout: "court",
  executer: () => {
    const st = station(LIMON_RICHE, { coteM: 30, gibierParHa: 0 });
    const w = meteo("limon-riche");
    const moyenne = (a: readonly number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    const planter = (s: GameState) => planterGrille(s, "betula_pendula", 5, 5, 0.5).state;
    // Même parcelle, même graine, mêmes plants : seul le labour préalable
    // change. On laboure une semaine avant de planter, comme on le ferait.
    const laboure = (s: GameState) =>
      planter(applyAction(s, { type: "labourer", week: 0, x: 15, y: 15, rayonM: 14 }).state);
    const reseau = (s: GameState) => moyenne(s.soil.mycorhizes.ecto) * 100;
    // Hauteur DOMINANTE, pas médiane : au bout de quinze ans les semis naturels
    // arrivent en masse et écraseraient la médiane, ce qui se lisait comme un
    // effondrement de la plantation alors qu'aucun plant ne mourait.
    const hauteur = (s: GameState) =>
      Math.max(
        0,
        ...s.trees.filter((t) => t.alive && t.especeId === "betula_pendula").map((t) => t.heightM),
      );
    return {
      id: "mycorhizes",
      forme: "courbe",
      uniteY: "réseau ectomycorhizien (%) — et hauteur dominante des plants (m, ×10)",
      series: [
        {
          nom: "sol non travaillé : réseau",
          couleur: VERT,
          valeurs: courbe(st, w, 25, planter, [], reseau),
        },
        {
          nom: "après labour : réseau",
          couleur: ROUGE,
          valeurs: courbe(st, w, 25, laboure, [], reseau),
        },
        {
          nom: "sol non travaillé : hauteur ×10",
          couleur: "#7fb069",
          valeurs: courbe(st, w, 25, planter, [], (s) => hauteur(s) * 10),
        },
        {
          nom: "après labour : hauteur ×10",
          couleur: "#d99b7c",
          valeurs: courbe(st, w, 25, laboure, [], (s) => hauteur(s) * 10),
        },
      ],
      verdict:
        "Le labour tranche les hyphes : le réseau repart de presque rien et met plus de dix ans à revenir. En revanche — et c'est un résultat, pas un oubli — la HAUTEUR des plants s'en ressent à peine sur ces limons : le coup de fouet azoté du labour compense à peu près la perte du réseau, et l'azote n'est de toute façon pas ce qui limite le plus ici. Le service mycorhizien ne prendra sa vraie valeur qu'avec le cycle du phosphore, qui est l'élément que les hyphes vont vraiment chercher.",
    };
  },
};

export const EXPERIENCES: readonly Experience[] = [
  BAC_A_SABLE,
  MYCORHIZES,
  {
    id: "gibier",
    titre: "Le gibier",
    question: "Faut-il vraiment payer un manchon pour chaque plant ?",
    attendu:
      "Là où le paysage porte du gibier, un plant appétent qui perd sa flèche chaque printemps n'échappe jamais à la hauteur de dent. Le manchon coûte 8 € et une demi-heure ; ne pas le poser coûte la plantation.",
    cout: "court",
    executer: () => {
      const st = station(FRICHE_LIMON, { gibierParHa: 0.4 });
      const w = meteo("friche-limon");
      const preparer = (s: GameState) => planterGrille(s, "corylus_avellana", 13, 3).state;
      // Les plants sont numérotés dans l'ordre de plantation. Poser 169
      // manchons demande 84 heures : on étale sur deux semaines, sinon le
      // plafond hebdomadaire en refuse la moitié.
      const tous = Array.from({ length: 169 }, (_, i) => i + 1);
      const protections: GameAction[] = [
        { type: "proteger", week: 1, treeIds: tous.slice(0, 100) },
        { type: "proteger", week: 2, treeIds: tous.slice(100) },
      ];
      const mesurer = (s: GameState) => hauteurMediane(s, "corylus_avellana");
      const nu = courbe(st, w, 15, preparer, [], mesurer);
      const protege = courbe(st, w, 15, preparer, protections, mesurer);
      return {
        id: "gibier",
        forme: "courbe",
        uniteY: "hauteur médiane (m)",
        series: [
          { nom: "protégé (manchon)", couleur: VERT, valeurs: protege },
          { nom: "non protégé", couleur: ROUGE, valeurs: nu },
        ],
        verdict: `À 0,4 cervidé/ha, quinze ans après : ${dernier(protege).toFixed(1)} m protégé contre ${dernier(nu).toFixed(1)} m nu. Le seuil de dent est à 1,5 m — en dessous, le plant ne sortira jamais tout seul.`,
      };
    },
  },
  {
    id: "ravageurs",
    titre: "Ravageurs et auxiliaires",
    question: "Un peuplement mélangé se défend-il vraiment mieux ?",
    attendu:
      "Les auxiliaires ont besoin d'essences variées, de strates et de bois mort pour tenir toute l'année. Là où ils tiennent, une pullulation n'atteint jamais son plein régime — et ce sont les arbres qui végètent, pas les vigoureux, qui la nourrissent.",
    cout: "long",
    executer: () => {
      const st = station(LIMON_RICHE, { gibierParHa: 0 });
      const w = meteo("limon-riche");
      const mesurer = (_s: GameState, c: Cumuls) => c.mortsParCause.ravageurs ?? 0;
      const pur = courbe(
        st,
        w,
        40,
        (s) => planterGrille(s, "alnus_glutinosa", 12, 3, 0.5).state,
        [],
        mesurer,
      );
      const mixte = courbe(
        st,
        w,
        40,
        (s) =>
          planterGrille(
            s,
            ["alnus_glutinosa", "quercus_pubescens", "betula_pendula", "fagus_sylvatica"],
            12,
            3,
            0.5,
          ).state,
        [],
        mesurer,
      );
      return {
        id: "ravageurs",
        forme: "courbe",
        uniteY: "arbres tués par les ravageurs (cumul)",
        series: [
          { nom: "aulnaie pure", couleur: ROUGE, valeurs: pur },
          { nom: "mélange de 4 essences", couleur: VERT, valeurs: mixte },
        ],
        verdict: `Même densité, même station, même météo : ${dernier(pur).toFixed(0)} arbres tués en peuplement pur contre ${dernier(mixte).toFixed(0)} en mélange. Rien n'est codé pour ça — c'est l'habitat des auxiliaires qui change.`,
      };
    },
  },
  {
    id: "climat",
    titre: "La dérive climatique",
    question: "Le réchauffement se voit-il à l'échelle d'une vie de forêt ?",
    attendu:
      "Sous SSP5-8.5, l'évapotranspiration monte franchement et le hêtre, qui « aime le frais », se met à mourir de soif là où il ne mourait jamais. À noter : même « figée », la série d'observations 1964-2023 contient déjà du réchauffement.",
    cout: "long",
    executer: () => {
      const st = station(LIMON_RICHE, { gibierParHa: 0 });
      const w = meteo("limon-riche");
      const preparer = (s: GameState) =>
        planterGrille(s, ["fagus_sylvatica", "quercus_pubescens"], 11, 3.4, 0.5).state;
      const mesurer = (_s: GameState, c: Cumuls) => c.etpAnnee;
      const fige = courbe(st, w, 60, preparer, [], mesurer, "stable", 2026);
      const chaud = courbe(st, w, 60, preparer, [], mesurer, "ssp585", 2026);
      const soif = (sc: "stable" | "ssp585") =>
        dernier(
          courbe(st, w, 60, preparer, [], (_s, c) => c.mortsParCause.secheresse ?? 0, sc, 2026),
        );
      return {
        id: "climat",
        forme: "courbe",
        uniteY: "ETP annuelle (mm)",
        series: [
          { nom: "climat figé (observations)", couleur: BLEU, valeurs: fige },
          { nom: "SSP5-8.5", couleur: ROUGE, valeurs: chaud },
        ],
        verdict: `De 2026 à 2086 : +${hausse(chaud)} % d'ETP sous SSP5-8.5 contre +${hausse(fige)} % à climat figé. Morts de sécheresse sur la période : ${soif("ssp585")} contre ${soif("stable")}.`,
      };
    },
  },
  {
    id: "sol",
    titre: "Le labour",
    question: "Qu'est-ce qu'on brûle vraiment en retournant un sol ?",
    attendu:
      "Chaque passage libère d'un coup l'azote de 5 % de l'humus — le « coup de fouet » qui a fait la réputation de la charrue. Mais l'humus met des décennies à revenir : au bout d'un quart de siècle, le sol labouré rend MOINS d'azote que celui qu'on a laissé vivre.",
    cout: "court",
    executer: () => {
      // Une friche : laissée tranquille, elle se recolonise et construit du
      // sol ; labourée chaque année, elle reste nue. C'est la comparaison qui
      // a du sens — un témoin nu s'appauvrirait lui aussi.
      const st = station(FRICHE_LIMON, {
        coteM: 30,
        gibierParHa: 0,
        voisinage: FRICHE_LIMON.station.voisinage,
      });
      const w = meteo("friche-limon");
      const zone = { x: 15, y: 15, rayonM: 12 };
      const chaque: GameAction[] = [];
      for (let an = 0; an < 30; an++)
        chaque.push({ type: "labourer", week: an * 52 + 10, ...zone });
      const humus = (s: GameState) => moyenne(s.soil.humusCG) / T_HA_TO_G_M2;
      const laboure = courbe(st, w, 30, (s) => s, chaque, humus);
      const tranquille = courbe(st, w, 30, (s) => s, [], humus);
      return {
        id: "sol",
        forme: "courbe",
        uniteY: "humus (t C/ha)",
        series: [
          { nom: "labouré chaque année", couleur: ROUGE, valeurs: laboure },
          { nom: "sol laissé vivre", couleur: VERT, valeurs: tranquille },
        ],
        verdict: `Trente ans plus tard : ${dernier(laboure).toFixed(0)} t C/ha contre ${dernier(tranquille).toFixed(0)}. Et comme l'humus EST le stock d'azote du sol, ce capital perdu, c'est de la fertilité perdue. À noter : les deux courbes descendent au début — une jeune végétation qui s'installe ne rend pas encore au sol ce qu'il minéralise ; c'est l'ÉCART entre les deux qui est l'effet du labour.`,
      };
    },
  },
  {
    id: "mecanisation",
    titre: "Aligner ou disperser",
    question: "Pourquoi l'agroforesterie moderne plante-t-elle en rangs ?",
    attendu:
      "Un engin a besoin d'un passage. La part de la parcelle qu'il atteint se déduit de la position des arbres — aucune parcelle n'est déclarée mécanisable.",
    cout: "court",
    executer: () => {
      const st = station(LIMON_RICHE, { gibierParHa: 0 });
      const grille = (positions: { x: number; y: number }[]) => {
        let s = createGameState(st, rngStateFromSeed(1));
        for (const p of positions) s = plantAt(s, "quercus_pubescens", p.x, p.y, 3);
        return partMecanisable(s.trees, 20, 20, 15) * 100;
      };
      const rangs: { x: number; y: number }[] = [];
      for (let r = 0; r < 8; r++) {
        for (let i = 0; i < 20; i++) rangs.push({ x: 3 + r * 4.5, y: 2 + i * 2 });
      }
      const serres: { x: number; y: number }[] = [];
      for (let a = 0; a < 20; a++) {
        for (let b = 0; b < 20; b++) serres.push({ x: 2 + a * 1.8, y: 2 + b * 1.8 });
      }
      let graine = 12345;
      const suivant = () => {
        graine = (graine * 1103515245 + 12345) % 2147483648;
        return graine / 2147483648;
      };
      const disperses = Array.from({ length: 160 }, () => ({
        x: 2 + suivant() * 36,
        y: 2 + suivant() * 36,
      }));
      return {
        id: "mecanisation",
        forme: "barres",
        uniteY: "part de la zone accessible à l'engin (%)",
        series: [
          { nom: "rangs à 4,5 m", couleur: VERT, valeurs: [grille(rangs)] },
          { nom: "dispersé", couleur: ROUGE, valeurs: [grille(disperses)] },
          { nom: "rangs serrés à 1,8 m", couleur: ROUGE, valeurs: [grille(serres)] },
          { nom: "parcelle nue", couleur: BLEU, valeurs: [grille([])] },
        ],
        verdict:
          "Même nombre de tiges dans les trois premiers cas. La fauche passe d'environ 17 h/ha sur des rangs à 55 h/ha en dispersé — et la machine, elle, se paie ~120 €/ha.",
      };
    },
  },
  {
    id: "herbe",
    titre: "La concurrence de l'herbe",
    question: "Dégager les plants, ça change quoi — et où ?",
    attendu:
      "La strate herbacée dispute l'eau et l'azote de l'horizon de surface. Sur un sol pauvre, c'est décisif ; sur un limon profond, presque pas — la concurrence pèse d'autant plus que le sol est maigre.",
    cout: "court",
    executer: () => {
      const fauches = (): GameAction[] => {
        const a: GameAction[] = [];
        for (let an = 0; an < 12; an++) {
          for (const decalage of [18, 26, 34]) {
            a.push({ type: "faucher", week: an * 52 + decalage, x: 20, y: 20, rayonM: 2.5 });
          }
        }
        return a;
      };
      const run = (
        base: (typeof STATIONS_V0)[number],
        meteoId: string,
        especeId: string,
        actions: GameAction[],
      ) =>
        courbe(
          station(base, { gibierParHa: 0 }),
          meteo(meteoId),
          12,
          (s) => plantAt(s, especeId, 20, 20, 0.3),
          actions,
          (s) => hauteurMediane(s, especeId),
        );
      const landeFauche = run(LANDE_SECHE, "lande-seche", "pinus_sylvestris", fauches());
      const landeNon = run(LANDE_SECHE, "lande-seche", "pinus_sylvestris", []);
      const limonFauche = run(LIMON_RICHE, "limon-riche", "betula_pendula", fauches());
      const limonNon = run(LIMON_RICHE, "limon-riche", "betula_pendula", []);
      const gain = (a: number[], b: number[]) =>
        ((dernier(a) / Math.max(0.01, dernier(b)) - 1) * 100).toFixed(0);
      return {
        id: "herbe",
        forme: "courbe",
        uniteY: "hauteur du plant (m)",
        series: [
          { nom: "lande, fauché", couleur: VERT, valeurs: landeFauche },
          { nom: "lande, non fauché", couleur: ROUGE, valeurs: landeNon },
          { nom: "limon riche, fauché", couleur: "#7fb069", valeurs: limonFauche },
          { nom: "limon riche, non fauché", couleur: "#d99b7c", valeurs: limonNon },
        ],
        verdict: `Douze ans : +${gain(landeFauche, landeNon)} % sur la lande pauvre, +${gain(limonFauche, limonNon)} % sur le limon riche. Le même geste, deux mondes.`,
      };
    },
  },
  {
    id: "biodiversite",
    titre: "Ce que vaut la diversité",
    question: "Une pinède et un mélange, ça se mesure comment ?",
    attendu:
      "Richesse d'essences, équitabilité, strates, bois mort, couvert permanent : l'indice classe des situations. Il ne remplace pas un inventaire, mais il dit ce que le seul volume de bois ne dit pas.",
    cout: "court",
    executer: () => {
      const st = station(LANDE_SECHE, { gibierParHa: 0 });
      const w = meteo("lande-seche");
      const note = (s: GameState) =>
        indiceBiodiversite(s.trees, s.carbon.deadWoodKgC, (st.coteM * st.coteM) / 10_000).note;
      const pinede = courbe(
        st,
        w,
        40,
        (s) => planterGrille(s, "pinus_sylvestris", 10, 4, 0.4).state,
        [],
        note,
      );
      const melange = courbe(
        st,
        w,
        40,
        (s) =>
          planterGrille(
            s,
            ["pinus_sylvestris", "quercus_suber", "arbutus_unedo", "ulex_europaeus"],
            10,
            4,
            0.4,
          ).state,
        [],
        note,
      );
      return {
        id: "biodiversite",
        forme: "courbe",
        uniteY: "indice de biodiversité (/100)",
        series: [
          { nom: "pinède pure", couleur: ROUGE, valeurs: pinede },
          { nom: "mélange landais", couleur: VERT, valeurs: melange },
        ],
        verdict: `Quarante ans : ${dernier(pinede).toFixed(0)}/100 contre ${dernier(melange).toFixed(0)}/100. L'écart vient surtout de l'équitabilité et des strates — une essence à 95 %, c'est un désert même à richesse élevée.`,
      };
    },
  },
];
