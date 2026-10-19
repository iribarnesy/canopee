/**
 * **Les dates de l'état repartent avec le compteur** (#397).
 *
 * Une parcelle vieillie a vécu des années avant l'arrivée du joueur, et son
 * compteur de semaines repart de zéro à cette arrivée. Les dates que l'état
 * avait gardées de ces années — mort d'une chandelle, chablis, feu, frottis,
 * abroutissement, installation d'un habitant, début d'une crue — restaient
 * comptées depuis le début du vieillissement, et se lisaient dans le compte du
 * joueur : ses chandelles tenaient debout N ans de trop, et deux écrans le
 * contournaient chacun à sa façon.
 *
 * Trois choses sont vérifiées ici :
 *
 *  - chaque date est décalée du même nombre de semaines que le compteur, et
 *    rien d'autre ne bouge ;
 *  - **aucune n'est oubliée** : tout champ d'état dont le nom parle d'une
 *    semaine est soit décalé, soit déclaré ici comme n'étant pas une date, avec
 *    sa raison. Une date ajoutée demain sans être décalée fait échouer l'essai ;
 *  - une chandelle d'avant l'arrivée tient debout la durée que le moteur lui
 *    donne, comptée depuis sa mort, et pas un jour de plus.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getEspece } from "../../src/engine/especes";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import {
  createGameState,
  DATES_D_UN_ARBRE,
  type GameState,
  plantAt,
  remettreLeCompteurAZero,
} from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";
import { dureeChandelleSemaines, type TreeState } from "../../src/engine/trees";

const STATION = { ...LIMON_RICHE.station, coteM: 20, voisinage: [], gibierParHa: 0 };
const METEO = syntheticYear(LIMON_RICHE.climat);

/** Où vit chaque type d'état, et comment y aller dans un `GameState`. */
const TYPES: Record<string, { fichier: string; dans: (s: GameState) => object | undefined }> = {
  GameState: { fichier: "state.ts", dans: (s) => s },
  SoilState: { fichier: "state.ts", dans: (s) => s.soil },
  TreeState: { fichier: "trees.ts", dans: (s) => s.trees[0] },
  Carie: { fichier: "trees.ts", dans: (s) => s.trees[0]?.carie },
  EconomyState: { fichier: "actions.ts", dans: (s) => s.economy },
  CarbonState: { fichier: "carbon.ts", dans: (s) => s.carbon },
  IndividuFaune: { fichier: "faune.ts", dans: (s) => s.faune?.[0] },
  MemoireDeCrue: { fichier: "crue.ts", dans: (s) => s.crue },
};

/**
 * Les champs dont le nom parle d'une semaine et qui **ne sont pas** des dates.
 * Une date est une semaine du compte de la partie, que `week − date` change en
 * temps écoulé ; ceux-ci sont autre chose.
 */
const PAS_DES_DATES: Record<string, string> = {
  "GameState.week": "le compteur lui-même, que la remise à zéro remet à zéro",
  "GameState.semainesDeFroid": "une durée : les semaines de froid accumulées depuis l'automne",
  "EconomyState.hoursUsedWeek": "des heures de travail, celles de la semaine en cours",
  "TreeState.ageWeeks": "une durée : l'âge de l'arbre, qui avance d'une semaine à chaque tick",
  "MemoireDeCrue.semaines": "un compte : les semaines de la crue déjà rapportées",
};

/** Les champs de premier niveau d'une interface exportée, lus dans sa source. */
function champsDe(type: string, fichier: string): string[] {
  const source = readFileSync(new URL(`../../src/engine/${fichier}`, import.meta.url), "utf8");
  const corps = source.match(new RegExp(`export interface ${type} \\{([\\s\\S]*?)\\n\\}`))?.[1];
  if (!corps) throw new Error(`interface ${type} introuvable dans ${fichier}`);
  return [...corps.matchAll(/^ {2}(?:readonly )?(\w+)\??:/gm)].map((m) => m[1] ?? "");
}

/** Une parcelle à la semaine 1 000, avec un arbre, un habitant, une crue en cours. */
function etatALaSemaine1000(): GameState {
  const s = plantAt(createGameState(STATION, rngStateFromSeed(3)), "fagus_sylvatica", 5, 5, 8);
  const arbre = s.trees[0] as TreeState;
  return {
    ...s,
    week: 1000,
    trees: [{ ...arbre, carie: { rayonCm: 1, barriereCm: 2 } }],
    faune: [{ id: 1, especeId: "pic_epeiche", arbreId: arbre.id, x: 5, y: 5, depuisSemaine: 0 }],
    nextFauneId: 2,
    crue: {
      id: 990,
      semaines: 10,
      phase: "pic",
      emprise: 3,
      emprisePic: 4,
      cellules: [0, 1, 2],
      arrivees: [0, 1, 3],
    },
  };
}

describe("remettre le compteur à zéro (#397)", () => {
  it("décale chaque date du même nombre de semaines que le compteur", () => {
    const avant = etatALaSemaine1000();
    const arbre = avant.trees[0] as TreeState;
    const dates = Object.fromEntries(DATES_D_UN_ARBRE.map((champ, k) => [champ, 600 + k]));
    const sansDate = { ...arbre, id: 2 };
    const etat: GameState = {
      ...avant,
      trees: [{ ...arbre, ...dates }, sansDate],
      economy: { ...avant.economy, saisonniersFinSemaine: [1010] },
    };
    const apres = remettreLeCompteurAZero(etat);
    expect(apres.week).toBe(0);
    for (const [k, champ] of DATES_D_UN_ARBRE.entries()) {
      expect(apres.trees[0]?.[champ], champ).toBe(600 + k - 1000);
    }
    expect(apres.faune?.[0]?.depuisSemaine).toBe(-1000);
    // L'identifiant d'une crue est la semaine où elle a commencé : c'est une
    // date, même si son nom ne le dit pas, et `useCrue` en déduit la semaine de
    // jeu (`id + semaine`).
    expect(apres.crue?.id).toBe(-10);
    expect(apres.crue?.semaines).toBe(10);
    expect(apres.economy.saisonniersFinSemaine).toEqual([10]);
    // Rien d'autre ne bouge : un arbre sans date est le même objet, sans champ
    // `undefined` ajouté (le JSON de la sauvegarde ne les garde pas, et une
    // empreinte qui les compterait déclarerait différentes deux parties égales).
    expect(apres.trees[1]).toBe(sansDate);
    expect(apres.soil).toBe(etat.soil);
    expect(apres.rng).toBe(etat.rng);
    // Et une partie qui n'a pas vieilli n'est pas touchée.
    const neuve = createGameState(STATION, rngStateFromSeed(3));
    expect(remettreLeCompteurAZero(neuve)).toBe(neuve);
  });

  it("n'oublie aucune date : tout champ d'état nommé d'après une semaine est décalé", () => {
    const etat = etatALaSemaine1000();
    const lus: string[] = [];
    for (const [type, { fichier, dans }] of Object.entries(TYPES)) {
      for (const champ of champsDe(type, fichier)) {
        if (!/semaine|week/i.test(champ)) continue;
        const nom = `${type}.${champ}`;
        lus.push(nom);
        if (PAS_DES_DATES[nom]) continue;
        const objet = dans(etat) as Record<string, unknown> | undefined;
        if (!objet) throw new Error(`${type} absent de l'état d'essai`);
        objet[champ] = Array.isArray(objet[champ]) ? [600] : 600;
      }
    }
    const apres = remettreLeCompteurAZero(etat);
    for (const nom of lus) {
      if (PAS_DES_DATES[nom]) continue;
      const [type, champ] = nom.split(".") as [string, string];
      const objet = TYPES[type]?.dans(apres) as Record<string, unknown> | undefined;
      const valeur = objet?.[champ];
      expect(
        Array.isArray(valeur) ? valeur[0] : valeur,
        `${nom} n'est pas décalé avec le compteur. Une date ? l'ajouter à ` +
          "`remettreLeCompteurAZero` (state.ts). Autre chose ? le dire dans PAS_DES_DATES.",
      ).toBe(-400);
    }
    // La prémisse : la lecture des sources trouve bien les dates connues, et
    // chaque exception désigne un champ qui existe encore.
    for (const champ of DATES_D_UN_ARBRE) expect(lus).toContain(`TreeState.${champ}`);
    expect(lus).toContain("IndividuFaune.depuisSemaine");
    expect(lus).toContain("EconomyState.saisonniersFinSemaine");
    for (const nom of Object.keys(PAS_DES_DATES)) expect(lus).toContain(nom);
  });

  it("une chandelle d'avant l'arrivée tient debout la durée que le moteur lui donne, pas plus", () => {
    // Un saule mort à la semaine 200, sur une parcelle qui en est à la 300ᵉ :
    // il lui reste `durée − 100` semaines debout. Le compteur repart de zéro.
    const espece = getEspece("salix_alba");
    const duree = dureeChandelleSemaines(espece);
    const neuve = createGameState(STATION, rngStateFromSeed(3));
    const plante = plantAt(neuve, "salix_alba", 10, 10, 8);
    const mort: TreeState = {
      ...(plante.trees[0] as TreeState),
      alive: false,
      causeMort: "secheresse",
      mortSemaine: 200,
    };
    let s = remettreLeCompteurAZero({ ...plante, week: 300, trees: [mort] });
    expect(s.trees[0]?.mortSemaine).toBe(-100);
    // Il est encore debout la semaine qui précède sa chute…
    while (s.week < duree - 100) s = tick(s, METEO[s.week % 52] as never).state;
    expect(s.trees.map((t) => t.id)).toEqual([mort.id]);
    // …et il tombe la semaine où il a tenu exactement sa durée.
    const chute = tick(s, METEO[s.week % 52] as never);
    expect(chute.chutes.map((c) => c.id)).toEqual([mort.id]);
    expect(chute.state.trees).toHaveLength(0);
  });
});
