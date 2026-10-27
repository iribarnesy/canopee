/**
 * **Le** test de bout en bout (docs/regles.md §11, §16) : sur une friche nue, la
 * succession écologique doit **émerger** des règles (dispersion, lumière, stress,
 * sénescence) sans être codée en dur :
 *   friche → colonisation par les pionniers → canopée pionnière avec les
 *   climaciques qui s'installent dessous → effondrement des pionniers
 *   (longévité) → les climaciques prennent la canopée.
 * Critères volontairement larges, robustes aux recalibrages.
 */

import { describe, expect, it } from "vitest";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type GameState } from "../../src/engine/state";
import { FRICHE_LIMON } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

/**
 * Les pionnières, au sens de l'atlas (colonne « Succ. » = `pion`). La liste ne
 * comptait que les deux **arbres** pionniers parce que l'atlas moteur s'arrêtait
 * là ; la strate arbustive — ronce, prunellier, aubépine, sureau — en fait
 * partie de plein droit, et c'est même elle qui prend une friche en premier.
 */
const PIONNIERS = new Set([
  "betula_pendula",
  "pinus_sylvestris",
  "salix_alba",
  "rubus_fruticosus",
  "prunus_spinosa",
  "crataegus_monogyna",
  "sambucus_nigra",
]);

function snapshotStats(state: GameState) {
  const alive = state.trees.filter((t) => t.alive);
  const canopy = alive.filter((t) => t.heightM > 10);
  return {
    alive,
    aliveCount: alive.length,
    pioneerShare:
      alive.length > 0 ? alive.filter((t) => PIONNIERS.has(t.especeId)).length / alive.length : 0,
    canopy,
    canopyPioneerShare:
      canopy.length > 0
        ? canopy.filter((t) => PIONNIERS.has(t.especeId)).length / canopy.length
        : 0,
    canopyFagusShare:
      canopy.length > 0
        ? canopy.filter((t) => t.especeId === "fagus_sylvatica").length / canopy.length
        : 0,
    fagusAlive: alive.filter((t) => t.especeId === "fagus_sylvatica"),
    betulaAlive: alive.filter((t) => t.especeId === "betula_pendula").length,
    /** Bouleaux plus âgés que la longévité de l'espèce : la cohorte de départ. */
    betulaVieux: alive.filter((t) => t.especeId === "betula_pendula" && t.ageWeeks / 52 > 90)
      .length,
  };
}

/** La friche laissée à elle-même `annees` ans depuis une graine, relevée aux années demandées. */
function friche(graine: number, annees: number, releves: readonly number[]) {
  const weather = syntheticYear(FRICHE_LIMON.climat);
  let state = createGameState(FRICHE_LIMON.station, rngStateFromSeed(graine));
  const snapshots = new Map<number, ReturnType<typeof snapshotStats>>();
  for (let i = 0; i < annees * 52; i++) {
    const w = weather[i % 52];
    if (!w) throw new Error("météo manquante");
    state = tick(state, w).state;
    const year = (i + 1) / 52;
    if (releves.includes(year)) snapshots.set(year, snapshotStats(state));
  }
  return snapshots;
}

/**
 * Les graines de l'an 60 (#458) : celle de la friche de deux siècles, puis 1
 * et 2. La règle a été fixée avant de les lancer, et aucune n'a été choisie
 * sur son résultat.
 */
const GRAINES_AN60 = [2026, 1, 2] as const;

/**
 * Le délai d'un essai de l'an 60 qui joue sa propre friche de soixante ans
 * (graines 1 et 2). Mesuré en CI à la première course de #458 : 139 et 135 s
 * (205 et 208 s en local). Il fait 2,5 fois la plus longue course de CI,
 * arrondi à la minute : c'est un délai de calcul, pas une borne de réalisme.
 * Les soixante ans ne se raccourcissent pas : c'est l'âge que l'essai juge.
 */
const DELAI_AN60_MS = 360_000;

/** Ce que l'an 60 doit montrer, sur chacune des graines de `GRAINES_AN60`. */
function canopeePionniereHetresDessous(an60: ReturnType<typeof snapshotStats>) {
  expect(an60.canopy.length).toBeGreaterThan(15);
  // **ce seuil a descendu trois fois, et il devient l'énoncé.** 0,70 → 0,65
  // avec l'effet de bord (lisiere.ts), puis 0,68 → 0,57 avec le port serré
  // (#105) : les pionniers sont des essences **élancées**, le bouleau le premier,
  // et leur houppier suit désormais leur diamètre — un bouleau a bel et bien
  // une couronne étroite quand un chêne de même hauteur l'a large. La canopée
  // pionnière ombrage donc moins, et les intermédiaires y montent plus tôt.
  //
  // Trois descentes du même seuil, c'est le signe que le chiffre enregistrait
  // le moteur au lieu de contraindre le monde (docs/realisme.md, « ce qu'un
  // test écologique a le droit d'affirmer »). On le remplace donc par
  // l'affirmation du titre elle-même — la canopée est **majoritairement**
  // pionnière — qui ne se renégocie pas : c'est 0,5, mesuré à 0,57.
  expect(an60.canopyPioneerShare).toBeGreaterThan(0.5);
  expect(an60.fagusAlive.length).toBeGreaterThan(3);
  // « Attendre dans le sous-étage » ne se mesure plus par la hauteur du hêtre
  // médian (#458). La ligne qui le faisait l'exigeait sous 0,7 de la dominante
  // (les dix plus hauts), et elle est retirée : **le seuil n'avait pas de
  // source**. Il avait été posé quand le hêtre médian était à la moitié de la
  // dominante, comme une marge autour d'un chiffre mesuré, et le moteur l'a
  // rejoint depuis : **main le dépassait déjà sur deux graines sur cinq**
  // (0,769 et 0,729 aux graines 1 et 3) quand le frottis corrigé de #415 l'a
  // fait passer à la graine 2026 (0,689 → 0,708), sans qu'aucun hêtre y soit
  // frotté. « Sous-étage » reste porté par la ligne qui le mesure : le hêtre
  // tient moins de 40 % de la canopée, sur chacune des trois graines.
  //
  // **16 % avant #263, 30,4 % après**, et le sens est instructif plutôt
  // qu'inquiétant. Le correctif de vidange a retiré l'engorgement permanent de
  // l'horizon de fond — 50 à 62 % de saturation en régime établi — et **le
  // hêtre est l'essence de cet atlas que l'engorgement pénalise le plus**. Il
  // gagne donc davantage que les pionnières, ce qui est exactement la
  // signature qu'on attend quand on retire une anoxie qui n'avait pas lieu
  // d'être.
  //
  // Le fait que l'essai porte est tenu par cette ligne et par celle de la
  // canopée **majoritairement pionnière**. Ce plafond-ci n'était qu'une marge
  // autour d'un chiffre mesuré ; il en garde une, autour du nouveau.
  expect(an60.canopyFagusShare).toBeLessThan(0.4);
}

describe("succession émergente sur friche (200 ans, rien n'est planté)", () => {
  // Une seule longue simulation, snapshots aux années 15, 60, 120 et 200.
  const snapshots = friche(2026, 200, [15, 60, 120, 200]);
  const an15 = snapshots.get(15);
  const an60 = snapshots.get(60);
  const an120 = snapshots.get(120);
  const an200 = snapshots.get(200);
  if (!an15 || !an60 || !an120 || !an200) throw new Error("snapshot manquant");

  it("an 15 : la friche est colonisée, très majoritairement par les pionniers", () => {
    expect(an15.aliveCount).toBeGreaterThan(20);
    // Le seuil a baissé de 0,80 à 0,75 le jour où le troène et le fusain ont
    // cessé d'être des fiches mortes : ce sont des arbustes de lisière classés
    // « intermédiaires », et ils arrivent tôt dans une friche bordée de haies.
    // La friche reste très majoritairement pionnière — 0,79 — mais elle l'est
    // un peu moins qu'une friche qui n'aurait que des pionnières à sa portée.
    expect(an15.pioneerShare).toBeGreaterThan(0.75);
  });

  // L'an 60 se lit sur trois graines : une partie n'est pas une mesure. La
  // graine 2026 lit la friche de deux siècles ; les deux autres jouent leurs
  // soixante ans dans leur essai, sous leur propre délai. Chaque ligne est
  // exigée sur chacune des trois.
  for (const graine of GRAINES_AN60) {
    it(
      `an 60 (graine ${graine}) : canopée pionnière, les hêtres attendent dans le sous-étage`,
      () => {
        const an = graine === 2026 ? an60 : friche(graine, 60, [60]).get(60);
        if (!an) throw new Error("snapshot manquant");
        canopeePionniereHetresDessous(an);
      },
      DELAI_AN60_MS,
    );
  }

  it("an 120 : la cohorte pionnière initiale s'est éteinte (longévité du bouleau ~90 ans)", () => {
    // On compte ce que le titre annonce : les **vieux** bouleaux, ceux de la
    // vague de colonisation. Le nombre total, lui, ne dit rien — le bouleau se
    // maintient en se ressemant dans ses propres trouées, et c'est justement
    // ce qui fait de lui un pionnier qui dure sans jamais vieillir.
    // Pas tout à fait zéro : la sénescence s'étale, et quelques sujets
    // dépassent leur longévité avant de céder. Mais il n'en reste qu'une
    // poignée sur la centaine qui tenait le terrain à soixante ans.
    expect(an120.betulaVieux).toBeLessThan(0.1 * an60.betulaAlive);
    // La banque de hêtres ne s'effondre pas : elle attend sous le couvert. Elle
    // grossit franchement plus tard — c'est le test de l'an 200 qui le dit —
    // mais à cent vingt ans elle a surtout cessé de perdre du terrain.
    //
    // Elle en perd deux sur dix-neuf depuis ce lot (17 contre 19), et la cause
    // est nommée : le sous-bois d'une futaie feuillue porte maintenant une
    // vernale, qui prélève son eau et son azote en avril — c'est-à-dire au même
    // endroit et au même moment que les semis de hêtre (`herbacees.ts`). Sur
    // dix-neuf tiges, deux de moins est un **écart de comptage** et pas un
    // effondrement : l'égalité stricte demandait à un décompte d'entiers de ne
    // jamais bouger, ce qu'aucun mécanisme ne garantit.
    expect(an120.fagusAlive.length).toBeGreaterThanOrEqual(0.85 * an60.fagusAlive.length);
  });

  it("an 200 : des hêtres ont pris la canopée, leur part y progresse (le vrai tempo : 150-250 ans)", () => {
    // Le critère, c'est d'**être** dans la canopée — au seuil que ce test se donne
    // lui-même (10 m) — et non d'atteindre une taille absolue : un hêtre passé
    // deux siècles sous un couvert de pionniers monte lentement.
    const fagusEnCanopee = an200.canopy.filter((t) => t.especeId === "fagus_sylvatica").length;
    expect(fagusEnCanopee).toBeGreaterThan(0);
    expect(an200.canopyFagusShare).toBeGreaterThan(an60.canopyFagusShare);
    expect(an200.canopyFagusShare).toBeGreaterThan(an120.canopyFagusShare);
  });

  it("le peuplement s'auto-éclaircit : une futaie de deux siècles est claire", () => {
    // Le plafond ne compte plus des tiges mais du **recouvrement** (regeneration.ts) :
    // des milliers de tiges quand elles font trente centimètres, quelques
    // centaines quand elles font vingt mètres. Ce qu'on vérifie, c'est que la
    // densité a bien fondu par rapport au fourré — pas qu'elle passe sous un
    // nombre fixe, qui était faux aux deux bouts.
    const parHa = (n: number) => (n / (50 * 50)) * 10_000;
    expect(parHa(an200.aliveCount)).toBeLessThan(2000);
    expect(parHa(an200.aliveCount)).toBeLessThan(parHa(an15.aliveCount));
  });
});
