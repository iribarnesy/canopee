/**
 * LES PARTIES SAUVEGARDÉES : plusieurs, et lisibles (#147).
 *
 * Cas vécu : « changer des paramètres, lancer, sortir — et plus aucun moyen de
 * relire les paramètres de la partie précédente ». Il y avait une seule
 * sauvegarde, sous une seule clé, que la partie suivante écrasait au premier
 * autosave — trente secondes.
 *
 * **Rien de nouveau ne se stocke.** `SaveGame` portait déjà tout : station,
 * graine, météo, scénario, bordures, relief, eau, nappe, bassin,
 * vieillissement, année de départ, économie. Ce qui manquait était un RANGEMENT
 * — une liste au lieu d'un emplacement — et de quoi la relire.
 *
 * Ce module ne parle pas à React et ne connaît pas `window` : le stockage lui
 * est DONNÉ. C'est ce qui permet de l'éprouver avec un faux stockage, donc de
 * vérifier la migration sans navigateur.
 */

import { getEspece, STATIONS_V0 } from "../engine";
import { SCENARIOS } from "../engine/climat";
import { PAYSAGES } from "../engine/paysage";
import type { SaveGame } from "./protocol";

/** L'ancienne clé, celle de l'emplacement unique. */
export const CLE_ANCIENNE = "canopee-sauvegarde";
/** La clé de la liste. */
export const CLE_LISTE = "canopee-sauvegardes";

/**
 * Combien de parties on garde.
 *
 * Une sauvegarde porte le JOURNAL des actions, qui grossit avec la partie, et
 * `localStorage` tient dans quelques mégaoctets. Au-delà de huit, on laisse
 * tomber la plus ancienne — c'est le comportement qu'on attend d'une liste de
 * parties, et le silence en face d'un quota dépassé serait pire.
 */
export const PARTIES_GARDEES = 8;

export interface EntreeSauvegarde {
  /** identifiant stable de l'entrée ; l'autosave écrit toujours dans la sienne */
  id: string;
  /** ce que le joueur lit dans la liste */
  nom: string;
  /** date d'écriture, ms depuis l'époque */
  quand: number;
  save: SaveGame;
}

/** Le nom qu'on donne à une partie qu'on n'a pas nommée. */
export function nomParDefaut(save: SaveGame): string {
  const station = STATIONS_V0.find((s) => s.station.id === save.stationId);
  return `${station?.station.nom ?? save.stationId} · an ${Math.floor(save.weeks / 52) + 1}`;
}

/** Un identifiant d'entrée : la date suffit, on n'en crée pas deux par milliseconde. */
export function idNeuf(maintenant = Date.now()): string {
  return `p${maintenant.toString(36)}`;
}

/**
 * Ce qui est rangé, le plus RÉCEMMENT écrit d'abord.
 *
 * **La migration se fait ici**, à la lecture, et une seule fois : l'ancienne
 * clé devient la première entrée, puis disparaît. Une partie en cours sous
 * l'ancien format ne doit pas être perdue parce qu'on a changé de rangement —
 * c'est exactement ce que l'issue demande d'éviter.
 */
export function listerSauvegardes(stock: Storage): EntreeSauvegarde[] {
  const liste = lireListe(stock);
  const ancienne = lireAncienne(stock);
  if (!ancienne) return liste;
  // On ne migre pas deux fois : l'ancienne clé part une fois recopiée.
  const migree: EntreeSauvegarde = {
    id: idNeuf(0),
    nom: nomParDefaut(ancienne),
    quand: Date.now(),
    save: ancienne,
  };
  const suite = [migree, ...liste].slice(0, PARTIES_GARDEES);
  ecrireListe(stock, suite);
  try {
    stock.removeItem(CLE_ANCIENNE);
  } catch {
    /* stockage en lecture seule : la liste est écrite, c'est l'essentiel */
  }
  return suite;
}

/**
 * Écrire (ou réécrire) l'entrée d'une partie. L'entrée touchée remonte en tête,
 * parce que c'est celle qu'on vient de jouer.
 */
export function ecrireSauvegarde(
  stock: Storage,
  id: string,
  save: SaveGame,
  nom?: string,
): EntreeSauvegarde[] {
  const liste = listerSauvegardes(stock);
  const avant = liste.find((e) => e.id === id);
  const entree: EntreeSauvegarde = {
    id,
    nom: nom ?? avant?.nom ?? nomParDefaut(save),
    quand: Date.now(),
    save,
  };
  const suite = [entree, ...liste.filter((e) => e.id !== id)].slice(0, PARTIES_GARDEES);
  ecrireListe(stock, suite);
  return suite;
}

export function supprimerSauvegarde(stock: Storage, id: string): EntreeSauvegarde[] {
  const suite = listerSauvegardes(stock).filter((e) => e.id !== id);
  ecrireListe(stock, suite);
  return suite;
}

/** La partie la plus récemment écrite, s'il y en a une. */
export function derniereSauvegarde(stock: Storage): EntreeSauvegarde | undefined {
  return listerSauvegardes(stock)[0];
}

function lireListe(stock: Storage): EntreeSauvegarde[] {
  try {
    const brut = stock.getItem(CLE_LISTE);
    if (!brut) return [];
    const lu = JSON.parse(brut) as EntreeSauvegarde[];
    if (!Array.isArray(lu)) return [];
    // On ne garde que ce qu'on sait relire : une entrée d'une version future,
    // ou tronquée par un quota dépassé, ne doit pas faire disparaître les
    // autres.
    return lu.filter((e) => e?.save?.version === 1 && typeof e.id === "string");
  } catch {
    return [];
  }
}

function lireAncienne(stock: Storage): SaveGame | undefined {
  try {
    const brut = stock.getItem(CLE_ANCIENNE);
    if (!brut) return undefined;
    const save = JSON.parse(brut) as SaveGame;
    return save?.version === 1 ? save : undefined;
  } catch {
    return undefined;
  }
}

function ecrireListe(stock: Storage, liste: readonly EntreeSauvegarde[]): void {
  try {
    stock.setItem(CLE_LISTE, JSON.stringify(liste));
  } catch {
    /* stockage plein ou indisponible : la partie continue sans autosave */
  }
}

/**
 * Les réglages d'une partie, en clair — ce que la fiche montre.
 *
 * Les libellés sont ceux de l'écran de réglages, et les valeurs viennent de la
 * sauvegarde seule : on ne redit pas ce que le moteur ferait de ces réglages,
 * on dit ce qui a été demandé.
 */
export function reglagesDeLaPartie(save: SaveGame): { quoi: string; valeur: string }[] {
  const station = STATIONS_V0.find((s) => s.station.id === save.stationId);
  const lignes: { quoi: string; valeur: string }[] = [
    { quoi: "Station", valeur: station?.station.nom ?? save.stationId },
    { quoi: "Année de départ", valeur: `${save.anneeDepart}` },
    // Les LIBELLÉS du moteur, pas les identifiants : « SSP5-8.5 » et non
    // « SSP585 », « Dans un bocage d'élevage » et non « bocage ». C'est ce que
    // l'issue demande — les mêmes mots que l'écran de réglages — et ces mots
    // ont déjà une source.
    { quoi: "Scénario climatique", valeur: nomDuScenario(save.scenario) },
    { quoi: "Météo", valeur: save.meteo === "reelle" ? "réelle (Météo-France)" : "synthétique" },
    { quoi: "Graine", valeur: `${save.seed}` },
  ];
  if (save.maturationAns) {
    lignes.push({ quoi: "Terrain vieilli", valeur: `${save.maturationAns} ans avant l'arrivée` });
  }
  if (save.bordures) {
    const cotes = [save.bordures.nord, save.bordures.est, save.bordures.sud, save.bordures.ouest];
    const memes = cotes.every((c) => c === cotes[0]);
    lignes.push({
      quoi: "Paysage",
      valeur: memes
        ? nomDuPaysage(cotes[0] ?? save.paysageId)
        : `N ${nomDuPaysage(cotes[0])} · E ${nomDuPaysage(cotes[1])} · S ${nomDuPaysage(cotes[2])} · O ${nomDuPaysage(cotes[3])}`,
    });
  } else {
    lignes.push({ quoi: "Paysage", valeur: nomDuPaysage(save.paysageId) });
  }
  if (save.relief) {
    lignes.push({
      quoi: "Relief",
      valeur: `${save.relief.altitudeM} m, pente ${save.relief.pentePct} %, exposition ${save.relief.expositionDeg}°${
        save.relief.altitudesM ? " (terrain modelé)" : ""
      }`,
    });
  }
  if (save.eau && save.eau.type !== "aucune")
    lignes.push({ quoi: "Eau libre", valeur: save.eau.type });
  if (save.nappeCm !== undefined) lignes.push({ quoi: "Nappe", valeur: `${save.nappeCm} cm` });
  if (save.partBassin) {
    lignes.push({ quoi: "Bassin semblable", valeur: `${Math.round(save.partBassin * 100)} %` });
  }
  if (save.economie === false) lignes.push({ quoi: "Économie", valeur: "désactivée" });
  lignes.push({
    quoi: "Avancement",
    valeur: `an ${Math.floor(save.weeks / 52) + 1}, ${save.actions.length} actions`,
  });
  return lignes;
}

/** Le nom d'un scénario climatique, ou son identifiant s'il a disparu du moteur. */
function nomDuScenario(id: string): string {
  return SCENARIOS.find((s) => s.id === id)?.nom ?? id;
}

/** Le nom d'un paysage, ou son identifiant. */
function nomDuPaysage(id: string | undefined): string {
  if (!id) return "—";
  return PAYSAGES.find((p) => p.id === id)?.nom ?? id;
}

/** Les essences plantées dans cette partie, pour reconnaître ce qu'on a fait. */
export function essencesPlantees(save: SaveGame): string[] {
  const vues = new Set<string>();
  for (const a of save.actions) {
    if (a.type === "planter") vues.add(a.especeId);
  }
  return [...vues].map((id) => getEspece(id).nom);
}
