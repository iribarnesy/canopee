/**
 * **Fertiliser une zone** (#435) : les trois formes que le moteur sait épandre,
 * ce qu'on en dit au joueur, et la ligne que le journal écrit.
 *
 * Le geste existe dans le moteur depuis #140 — l'ammonitrate et le fumier,
 * dosés en kg N/ha — et la potasse l'a rejoint avec #395, dosée en kg K₂O/ha.
 * **Aucun bouton ne l'appelait**, et le journal n'en écrivait rien : le
 * protocole acceptait déjà l'action, et `prevoir` y répondait, mais un joueur
 * ne pouvait ni nourrir un blé ni rendre au sol le potassium que le grain
 * emporte.
 *
 * **Rien de ce qui décide n'est écrit ici.** Les doses maximales, les prix et le
 * potassium du fumier sont les constantes du moteur, importées et non
 * recopiées : le jour où le moteur recalibre un prix ou un plafond, le panneau
 * le suit sans qu'on y touche. Ce module ne choisit que ce que le moteur ne
 * choisit pas — le nom qu'on donne à chaque forme, la dose qu'on propose
 * d'abord, et la phrase du journal.
 */

import {
  AZOTE_MINERAL_EUR_KG,
  DOSE_AZOTE_MAX_KG_HA,
  DOSE_POTASSE_MAX_KG_HA,
  FUMIER_CN_RATIO,
  FUMIER_EUR_KG_N,
  FUMIER_K_SUR_N,
  type GameAction,
  POTASSE_EUR_KG_K2O,
} from "../engine/actions";
import type { Zone } from "../engine/zone";
import { surface } from "./bilan";
import type { ActionSansSemaine } from "./protocol";

/** L'action du moteur, telle qu'elle voyage. */
type ActionFertiliser = Extract<GameAction, { type: "fertiliser" }>;

/** Les trois formes du moteur : `mineral`, `fumier`, `potasse`. */
export type FormeEngrais = ActionFertiliser["forme"];

/** Ce que le joueur lit d'une forme, et la dose qu'on lui propose d'abord. */
export interface FicheEngrais {
  forme: FormeEngrais;
  /** le nom sur le bouton et en tête de la ligne du journal */
  nom: string;
  icone: string;
  /**
   * L'unité de la dose, **celle du moteur** : l'azote en kg N/ha pour que
   * l'ammonitrate et le fumier se comparent (#140), la potasse en kg K₂O/ha
   * comme la dosent le Comifer et les enquêtes Agreste (#395).
   */
  unite: "kg N/ha" | "kg K₂O/ha";
  /** ce qu'on paie par kilo de la même unité, €/kg — la constante du moteur */
  prixEurKg: number;
  /**
   * Au-delà, le moteur refuse : « ce n'est plus fertiliser ». La borne du
   * curseur **est** cette constante, pour qu'on ne puisse pas demander ce qui
   * sera refusé.
   */
  doseMax: number;
  /** la dose proposée la première fois, dans `unite` — sourcée au cas par cas */
  doseParDefaut: number;
  /**
   * Ce que la forme fait au sol, pour le panneau : son prix, puis ce que le
   * moteur en fait (`applyFertiliser`). C'est tout l'arbitrage du geste, et le
   * joueur doit le lire **avant** de cliquer.
   */
  explication: string;
}

/**
 * Un nombre du moteur, à la française et sans zéro inutile : « 1,5 », « 0,9 ».
 * Deux décimales au plus, pour qu'un prix recalibré au centime se lise juste.
 */
const fr = (v: number) => v.toLocaleString("fr-FR", { maximumFractionDigits: 2 });

export const ENGRAIS: Readonly<Record<FormeEngrais, FicheEngrais>> = {
  mineral: {
    forme: "mineral",
    nom: "Ammonitrate",
    icone: "🧪",
    unite: "kg N/ha",
    prixEurKg: AZOTE_MINERAL_EUR_KG,
    doseMax: DOSE_AZOTE_MAX_KG_HA,
    // **96 kg N/ha, le palier du milieu de Broadbalk** (0, 48, 96, 144 et
    // 192 kg N/ha) : c'est l'échelle contre laquelle le moteur juge sa courbe
    // de réponse du blé (`tests/ecology/fertilisation.test.ts`, critère C18
    // de `docs/realisme.md`), et la parcelle qui y rend 6 t/ha de grain.
    doseParDefaut: 96,
    explication: `${fr(AZOTE_MINERAL_EUR_KG)} €/kg N. L'azote arrive dans le pool minéral : disponible tout de suite, et lessivable tout de suite — posé avant l'hiver, il part avec le drainage.`,
  },
  fumier: {
    forme: "fumier",
    nom: "Fumier",
    icone: "🐄",
    unite: "kg N/ha",
    prixEurKg: FUMIER_EUR_KG_N,
    doseMax: DOSE_AZOTE_MAX_KG_HA,
    // **170 kg N/ha, le plafond de la directive nitrates** pour l'azote
    // organique en zone vulnérable, et la dose que le moteur prend lui-même en
    // exemple pour le potassium du fumier (`FUMIER_K_SUR_N` : 170 kg N/ha
    // apportent 221 kg K/ha) et pour son plafond (`DOSE_AZOTE_MAX_KG_HA`).
    doseParDefaut: 170,
    explication: `${fr(FUMIER_EUR_KG_N)} €/kg N. Il entre dans la litière avec son C/N de ${FUMIER_CN_RATIO} : son azote se libère sur des années, et il construit de l'humus au passage. Il apporte aussi son potassium, ${fr(FUMIER_K_SUR_N)} kg K par kg N.`,
  },
  potasse: {
    forme: "potasse",
    nom: "Potasse",
    icone: "🧂",
    unite: "kg K₂O/ha",
    prixEurKg: POTASSE_EUR_KG_K2O,
    doseMax: DOSE_POTASSE_MAX_KG_HA,
    // **48 kg K₂O/ha, la dose moyenne des blés tendres qui reçoivent de la
    // potasse** (Agreste, enquête Pratiques culturales en grandes cultures
    // 2017), celle que le moteur cite sous `DOSE_POTASSE_MAX_KG_HA`. La dose
    // d'entretien du Comifer, qu'il cite au même endroit, est voisine : une
    // cinquantaine de kilos pour un blé de 9 t.
    doseParDefaut: 48,
    explication: `${fr(POTASSE_EUR_KG_K2O)} €/kg K₂O, du chlorure de potassium. Il entre dans le potassium échangeable : c'est ce qui rend au sol ce que le grain emporte — sans lui, la réserve du sol paie seule.`,
  },
};

/** Les formes dans l'ordre des boutons : l'azote d'abord, comme le moteur les a appris. */
export const FORMES_ENGRAIS: readonly FormeEngrais[] = ["mineral", "fumier", "potasse"];

/**
 * La plus petite dose que le curseur propose, dans l'unité de la forme. Le
 * moteur refuse une dose nulle, et un kilo à l'hectare est le pas du curseur :
 * ce n'est pas une règle, c'est une graduation.
 */
export const DOSE_MIN = 1;

/**
 * Une dose ramenée dans ce que le moteur accepte pour cette forme : au moins
 * `DOSE_MIN`, au plus son plafond. Le réglage passe par ici, et le curseur
 * porte les mêmes bornes — on ne peut donc pas armer un geste qui serait
 * refusé pour sa dose.
 */
export function bornerLaDose(forme: FormeEngrais, dose: number): number {
  const max = ENGRAIS[forme].doseMax;
  if (!Number.isFinite(dose)) return ENGRAIS[forme].doseParDefaut;
  return Math.min(max, Math.max(DOSE_MIN, Math.round(dose)));
}

/**
 * L'action à envoyer, avec la dose dans **le champ de sa forme** : `doseKgK2OHa`
 * pour la potasse, `doseKgNHa` pour les deux autres. Le moteur les distingue
 * par le type, et une potasse envoyée en `doseKgNHa` serait une dose nulle.
 */
export function actionDeFertilisation(
  forme: FormeEngrais,
  dose: number,
  zone: Zone,
): ActionSansSemaine {
  return forme === "potasse"
    ? { type: "fertiliser", ...zone, forme, doseKgK2OHa: dose }
    : { type: "fertiliser", ...zone, forme, doseKgNHa: dose };
}

/** La dose d'une action de fertilisation, quelle que soit sa forme. */
export function doseDeLAction(action: ActionFertiliser): number {
  return action.forme === "potasse" ? action.doseKgK2OHa : action.doseKgNHa;
}

/**
 * Ce que chaque forme fait au sol, en quelques mots pour la fin de la ligne du
 * journal. Ce sont les phrases du moteur (`actions.ts`, `applyFertiliser`),
 * pas une interprétation : l'ammonitrate entre dans le pool minéral que le
 * drainage emporte, le fumier dans la litière qui se minéralise sur des années
 * — son potassium, déjà soluble, entre tout de suite —, la potasse dans le
 * potassium échangeable.
 */
const CE_QUE_CA_FAIT: Record<FormeEngrais, string> = {
  mineral: "l'azote est disponible tout de suite, et lessivable",
  fumier: "son azote viendra sur des années, son potassium tout de suite",
  potasse: "le potassium entre dans l'échangeable",
};

/**
 * Un montant tel qu'on le lit : au centime sous dix euros, à l'euro au-delà.
 *
 * Le reste du journal arrondit à l'euro, et ici ça ne suffit pas : une
 * potasse à 48 kg K₂O/ha sur le disque de trois mètres coûte douze centimes,
 * et « 0 € » dirait le geste gratuit.
 */
export function eurosLus(eur: number): string {
  const v = Math.abs(eur);
  return v < 10
    ? `${v.toFixed(2).replace(".", ",")} €`
    : `${Math.round(v).toLocaleString("fr-FR")} €`;
}

/**
 * La ligne du journal : « Potasse : 48 kg K₂O/ha sur 201 m², 0,87 € — le
 * potassium entre dans l'échangeable ».
 *
 * `m2` est la surface **que le moteur a fertilisée** — ses cellules d'un mètre
 * carré, comptées par sa propre fonction (`cellulesDeLaZone`) — et `coutEur`
 * ce que la trésorerie a perdu : la phrase ne refait aucun calcul du geste,
 * elle dit ce qui a eu lieu.
 */
export function direLaFertilisation(
  forme: FormeEngrais,
  dose: number,
  m2: number,
  coutEur: number,
): string {
  const fiche = ENGRAIS[forme];
  return `${fiche.nom} : ${Math.round(dose)} ${fiche.unite} sur ${surface(m2)}, ${eurosLus(coutEur)} — ${CE_QUE_CA_FAIT[forme]}`;
}
