/**
 * SÉRIALISER L'ÉTAT (issue #193).
 *
 * Une sauvegarde de Canopée est un JOURNAL, et charger une partie c'est la
 * REJOUER. Ça suppose que rejouer la même partie donne la même partie, et le
 * moteur ne tient pas cette promesse : ses bits ne sont pas portables d'une
 * version de moteur JS à l'autre (mesuré en marge de #186 — 3 806 937 118 sous
 * V8 12.4, 633 354 304 sous V8 13.6, sur le MÊME commit). Un joueur qui change
 * de navigateur perd sa parcelle, pas un chiffre après la virgule.
 *
 * Ce fichier tient l'exigence, et il n'y en a qu'une qui compte :
 *
 * > **une partie reprise depuis un bloc continue exactement comme la partie qui
 * > ne s'est jamais arrêtée.**
 *
 * Tout le reste — l'aller-retour exact, les refus — sert celle-là. Et les
 * comparaisons se font DANS LE MÊME PROCESSUS, jamais contre une valeur
 * épinglée : épingler une empreinte est exactement l'erreur que #193 raconte.
 */

import { describe, expect, it } from "vitest";
import { serieMeteoPour } from "../../src/data/meteo";
import { applyAction, type GameAction } from "../../src/engine/actions";
import { serieToWeeks } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { ecrireEtat, lireEtat, VERSION_FORMAT } from "../../src/engine/serialisation";
import {
  createGameState,
  type GameState,
  plantScattered,
  type Station,
} from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { stateHash, tick } from "../../src/engine/tick";

const COTE = 30;
const STATION: Station = { ...LIMON_RICHE.station, coteM: COTE, voisinage: [] };
const SERIE = serieMeteoPour(LIMON_RICHE.station.id);
if (!SERIE) throw new Error("série météo manquante");
const METEO = serieToWeeks(SERIE);

/** Une parcelle plantée, puis menée `ans` années avec quelques gestes. */
function partie(ans: number, depart?: GameState): GameState {
  let s =
    depart ??
    plantScattered(createGameState(STATION, rngStateFromSeed(9)), "quercus_pubescens", 40);
  const semaineDepart = s.week;
  const centre = COTE / 2;
  for (let i = 0; i < ans * 52; i++) {
    const week = semaineDepart + i;
    const geste = (a: GameAction) => {
      s = applyAction(s, a).state;
    };
    const w = week % 52;
    if (w === 8) geste({ type: "faucher", week, x: centre, y: centre, rayonM: 8 });
    if (w === 30 && week % (52 * 4) < 52) geste({ type: "labourer", week, x: 8, y: 8, rayonM: 5 });
    const m = METEO[week % METEO.length];
    if (!m) throw new Error("météo manquante");
    s = tick(s, m).state;
  }
  return s;
}

describe("l'état s'écrit et se relit à l'identique", () => {
  it("un aller-retour rend la même empreinte", () => {
    const avant = partie(3);
    const relu = lireEtat(ecrireEtat(avant), STATION);
    if (!relu) throw new Error("le bloc aurait dû se relire");
    expect(stateHash(relu)).toBe(stateHash(avant));
  }, 300_000);

  it("et il rend la même CHOSE, pas seulement la même empreinte", () => {
    // Une empreinte est un hachage : deux états différents pourraient en
    // théorie la partager. On compare donc aussi la structure, champ par champ,
    // et sur un état qui a vécu — des arbres morts, du bois au sol, une banque
    // de graines garnie, un tirage avancé.
    const avant = partie(3);
    const relu = lireEtat(ecrireEtat(avant), STATION);
    if (!relu) throw new Error("le bloc aurait dû se relire");
    const sansStation = ({ station: _s, ...reste }: GameState) => reste;
    expect(JSON.stringify(sansStation(relu))).toBe(JSON.stringify(sansStation(avant)));
    // Et la station est bien celle qu'on a FOURNIE, pas une copie rangée dans
    // le bloc : c'est une donnée de configuration, elle n'a rien à y faire.
    expect(relu.station).toBe(STATION);
  }, 300_000);

  it("les booléens restent des booléens, et les tableaux gardent leur longueur", () => {
    // `cloture` est le seul tableau de booléens du sol, et il passe par le même
    // float64 que le reste. Un `1` relu en `true` n'est pas un détail : la
    // clôture décide si le gibier entre.
    let avant = partie(1);
    avant = applyAction(avant, {
      type: "cloturer",
      week: avant.week,
      x: 12,
      y: 18,
      rayonM: 5,
    }).state;
    const closes = avant.soil.cloture.filter(Boolean).length;
    expect(closes).toBeGreaterThan(0);
    const relu = lireEtat(ecrireEtat(avant), STATION);
    if (!relu) throw new Error("le bloc aurait dû se relire");
    expect(relu.soil.cloture.filter(Boolean).length).toBe(closes);
    for (const v of relu.soil.cloture) expect(typeof v).toBe("boolean");
    expect(relu.soil.waterMm.length).toBe(avant.soil.waterMm.length);
  }, 300_000);
});

describe("une partie reprise continue comme une partie qui ne s'est pas arrêtée", () => {
  it("dix ans, puis dix ans, valent vingt ans d'affilée", () => {
    // **L'EXIGENCE DU LOT, ET LA SEULE QUI COMPTE POUR UN JOUEUR.** Tout le
    // reste de ce fichier ne sert qu'à celle-là.
    //
    // Comparé dans le même processus, et pas contre une empreinte épinglée :
    // une valeur absolue n'est pas portable d'une version de V8 à l'autre, et
    // c'est précisément le défaut que ce lot répare (#193).
    const droit = partie(20);

    const moitie = partie(10);
    const relu = lireEtat(ecrireEtat(moitie), STATION);
    if (!relu) throw new Error("le bloc aurait dû se relire");
    const repris = partie(10, relu);

    expect(stateHash(repris)).toBe(stateHash(droit));
    expect(repris.week).toBe(droit.week);
    expect(repris.trees.length).toBe(droit.trees.length);
  }, 900_000);
});

describe("ce qu'on ne sait pas lire, on le refuse", () => {
  // Rendre `undefined` est un RÉSULTAT, pas un échec à cacher : le journal
  // existe pour ça, et l'appelant rejoue. Un bloc relu de travers serait bien
  // pire qu'un rejeu — d'où un refus à chaque fois qu'on n'est pas certain.
  const bloc = () => ecrireEtat(partie(1));

  it("un bloc qui n'en est pas un", () => {
    expect(lireEtat(new Uint8Array(0), STATION)).toBeUndefined();
    expect(lireEtat(new Uint8Array(64), STATION)).toBeUndefined();
    expect(lireEtat(new TextEncoder().encode("bonjour, ceci n'est pas un état"), STATION)).toBe(
      undefined,
    );
  }, 300_000);

  it("une version de format inconnue", () => {
    const b = bloc();
    new DataView(b.buffer).setUint16(8, VERSION_FORMAT + 1);
    expect(lireEtat(b, STATION)).toBeUndefined();
  }, 300_000);

  it("un bloc tronqué", () => {
    const b = bloc();
    expect(lireEtat(b.subarray(0, b.length - 8), STATION)).toBeUndefined();
    expect(lireEtat(b.subarray(0, 40), STATION)).toBeUndefined();
  }, 300_000);

  it("une parcelle d'une autre taille", () => {
    // Le cas qui arrive pour de vrai : on relit le bloc d'une partie sur la
    // station d'une autre. Les grilles n'ont pas la même longueur, et
    // reconstruire un sol de la mauvaise taille donnerait un moteur qui lit à
    // côté pendant des années sans le dire.
    const autre: Station = { ...STATION, coteM: COTE * 2 };
    expect(lireEtat(bloc(), autre)).toBeUndefined();
  }, 300_000);

  it("et un en-tête qui annonce des champs que ce moteur n'a plus", () => {
    // Le cas de la montée de version : le sol a gagné ou perdu un tableau
    // depuis. On le simule en retirant une grille de la liste déclarée.
    const avant = partie(1);
    const b = ecrireEtat(avant);
    const vue = new DataView(b.buffer);
    // L'en-tête commence à 14 : huit octets de magie, deux de version, quatre
    // de longueur.
    const longueur = vue.getUint32(10);
    const entete = JSON.parse(new TextDecoder().decode(b.subarray(14, 14 + longueur))) as {
      grilles: unknown[];
    };
    entete.grilles.pop();
    const neuf = new TextEncoder().encode(JSON.stringify(entete));
    // On réécrit un bloc de même disposition, avec l'en-tête amputé.
    const truque = new Uint8Array(b.length);
    truque.set(b.subarray(0, 14));
    new DataView(truque.buffer).setUint32(10, neuf.length);
    truque.set(neuf, 14);
    expect(lireEtat(truque, STATION)).toBeUndefined();
  }, 300_000);
});
