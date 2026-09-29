/**
 * **Un chablis est par terre, et il doit se dessiner par terre** (#107).
 *
 * Le moteur garde un arbre versé dans sa liste l'année où son bois se récolte
 * encore, et il le marque `renverseSemaine` + `chuteRad`. Le rendu, lui, n'avait
 * que `chandelle` — qui veut dire « mort **debout** » — et dressait donc un
 * tronc vertical là où la parcelle a un arbre couché : *« ce n'était pas une
 * donnée manquante, c'était une donnée fausse »*.
 *
 * Ce que ces épreuves gardent : que la pose couchée soit la **fin de la chute**
 * et pas une seconde géométrie, et que la semaine de la rafale reste à la mise
 * en scène — sinon le seul instant où la tempête se voit serait escamoté.
 */

import { describe, expect, it } from "vitest";
import { type ArbreSource, arbresAPoser, type ContexteDePose } from "../../src/game/parcelle";
import { type Vue, vueInitiale } from "../../src/render/camera";
import {
  type ArbreAPoser,
  classeDe,
  cleClasse,
  PALIERS_CHANDELLE,
} from "../../src/render/couches/arbres";
import { chuteEnCours, troncCouche } from "../../src/render/temps/chute";

const COTE = 40;
const vue = (): Vue => vueInitiale(COTE, 900, 640, 0);

const tronc = (directionRad = 0) => ({ x: 20, y: 20, heightM: 15, directionRad });

describe("le tronc couché est la fin de la chute, pas une autre géométrie", () => {
  it("rend exactement ce que la chute rend à son dernier instant", () => {
    // Deux formules pour un même tronc dériveraient (§2.1), et celle-ci a une
    // subtilité qu'on ne veut pas réécrire : un arbre couché **vers**
    // l'objectif raccourcit au lieu de pivoter.
    for (const rad of [0, Math.PI / 3, Math.PI, -Math.PI / 2]) {
      expect(troncCouche(tronc(rad), vue())).toEqual(chuteEnCours(tronc(rad), 1, vue()));
    }
  });

  it("un tronc couché n'est plus debout : il est incliné ou raccourci", () => {
    const debout = chuteEnCours(tronc(), 0, vue());
    for (const rad of [0, Math.PI / 4, Math.PI / 2, Math.PI]) {
      const couche = troncCouche(tronc(rad), vue());
      const bouge =
        Math.abs(couche.rotationRad - debout.rotationRad) > 0.2 ||
        Math.abs(couche.hauteur - debout.hauteur) > 0.2;
      expect(bouge, `direction ${rad.toFixed(2)}`).toBe(true);
    }
  });
});

describe("qui se pose couché, et quand", () => {
  const ctx = (week: number): ContexteDePose => ({
    coteM: COTE,
    week,
    altitudesM: new Array(COTE * COTE).fill(0),
  });
  const chablis = (champs: Partial<ArbreSource> = {}): ArbreSource => ({
    id: 1,
    especeId: "fagus_sylvatica",
    x: 20,
    y: 20,
    heightM: 15,
    chandelle: true,
    renverseSemaine: 100,
    chuteRad: 1.2,
    ...champs,
  });

  it("un chablis versé la semaine d'avant est couché, dans le sens du moteur", () => {
    const [pose] = arbresAPoser([chablis()], ctx(101));
    expect(pose?.coucheRad).toBe(1.2);
  });

  it("la semaine de la rafale, il est encore debout : c'est l'ellipse qui le couche", () => {
    // La poser couchée d'entrée montrerait l'arbre par terre avant que le coup
    // de vent ne soit joué — c'est-à-dire escamoter la tempête, qui est
    // justement ce que le §6.6 demande qu'on voie.
    const [pose] = arbresAPoser([chablis()], ctx(100));
    expect(pose?.coucheRad).toBeUndefined();
  });

  it("une chandelle ordinaire reste debout : elle n'a pas été versée", () => {
    const [pose] = arbresAPoser(
      [chablis({ renverseSemaine: undefined, chuteRad: undefined })],
      ctx(101),
    );
    expect(pose?.coucheRad).toBeUndefined();
    expect(pose?.chandelle).toBe(true);
  });

  it("sans direction, on ne couche pas au hasard", () => {
    // `chuteRad` ne se déduit de rien — la pente orienterait une chandelle, pas
    // un chablis. Faute de sens, on laisse le tronc tel que l'instantané le
    // décrit plutôt que d'en inventer un.
    const [pose] = arbresAPoser([chablis({ chuteRad: undefined })], ctx(101));
    expect(pose?.coucheRad).toBeUndefined();
  });
});

/**
 * **Une chandelle a un âge, et il se voit** (#107, la seconde moitié).
 *
 * Le moteur donne la semaine de la mort et la durée qu'un fût de cette essence
 * tient debout ; le rendu lit les deux et n'en choisit aucune. Ce dont il
 * décide est ce que ça fait à l'image — un bois mort blanchit et perd son menu
 * bois —, et il faut que ça se voie : une chandelle de l'année et une chandelle
 * à bout ne peuvent pas partager la même vignette.
 */
describe("l'âge de la chandelle", () => {
  const ctx = (week: number): ContexteDePose => ({
    coteM: COTE,
    week,
    altitudesM: new Array(COTE * COTE).fill(0),
  });
  const morte = (mortSemaine: number, champs: Partial<ArbreSource> = {}): ArbreSource => ({
    id: 2,
    especeId: "fagus_sylvatica",
    x: 20,
    y: 20,
    heightM: 15,
    chandelle: true,
    mortSemaine,
    ...champs,
  });

  it("zéro la semaine de la mort, et il monte avec les années", () => {
    const neuve = arbresAPoser([morte(100)], ctx(100))[0]?.ageChandelle;
    const vieille = arbresAPoser([morte(100)], ctx(100 + 52 * 10))[0]?.ageChandelle;
    expect(neuve).toBe(0);
    expect(vieille ?? 0).toBeGreaterThan(neuve ?? 1);
  });

  it("il se compte sur la durée du moteur, essence par essence", () => {
    // Le hêtre est un bois lourd, le bouleau un bois léger : à même nombre
    // d'années debout, le bouleau est **plus** avancé sur sa propre durée. Le
    // rendu ne choisit pas ce rapport, il lit `dureeChandelleSemaines`.
    const ans = 100 + 52 * 8;
    const hetre = arbresAPoser([morte(100)], ctx(ans))[0]?.ageChandelle ?? 0;
    const bouleau =
      arbresAPoser([morte(100, { especeId: "betula_pendula" })], ctx(ans))[0]?.ageChandelle ?? 0;
    expect(bouleau).toBeGreaterThan(hetre);
  });

  it("il ne dépasse pas un, même sur une chandelle qui s'attarde", () => {
    expect(arbresAPoser([morte(100)], ctx(100 + 52 * 200))[0]?.ageChandelle).toBe(1);
  });

  it("un chablis n'en a pas : il est par terre, sa durée n'est pas celle-là", () => {
    const pose = arbresAPoser(
      [morte(100, { renverseSemaine: 100, chuteRad: 0.5 })],
      ctx(100 + 52),
    )[0];
    expect(pose?.ageChandelle).toBeUndefined();
    expect(pose?.coucheRad).toBe(0.5);
  });

  it("un arbre vivant n'en a pas non plus", () => {
    expect(
      arbresAPoser([morte(100, { chandelle: false, mortSemaine: undefined })], ctx(200))[0]
        ?.ageChandelle,
    ).toBeUndefined();
  });
});

describe("la vignette d'une chandelle change avec son âge", () => {
  const vueDuBanc = (): Vue => vueInitiale(COTE, 900, 640, 0);
  const chandelleDe = (ageChandelle: number): ArbreAPoser => ({
    id: 3,
    especeId: "fagus_sylvatica",
    x: 20,
    y: 20,
    z: 0,
    heightM: 15,
    houppierRatio: 0.45,
    baseHouppierM: 4,
    partFoliaire: 0,
    senescence: 0,
    vigueur: 0,
    chandelle: true,
    ageChandelle,
  });

  it("une chandelle de l'année et une chandelle à bout ne partagent pas la même image", () => {
    const jeune = cleClasse(classeDe(chandelleDe(0), 30, vueDuBanc()));
    const vieille = cleClasse(classeDe(chandelleDe(1), 30, vueDuBanc()));
    expect(jeune).not.toBe(vieille);
  });

  it("mais l'âge ne multiplie rien sur un arbre vivant", () => {
    const vivant = { ...chandelleDe(0), chandelle: false, partFoliaire: 1, vigueur: 1 };
    expect(cleClasse(classeDe(vivant, 30, vueDuBanc()))).toBe(
      cleClasse(classeDe({ ...vivant, ageChandelle: 0.9 }, 30, vueDuBanc())),
    );
  });

  it("trois paliers et pas un de plus : une vignette de plus se paie", () => {
    const cles = new Set(
      [0, 0.2, 0.4, 0.6, 0.8, 1].map((a) => cleClasse(classeDe(chandelleDe(a), 30, vueDuBanc()))),
    );
    expect(cles.size).toBe(PALIERS_CHANDELLE);
  });
});
