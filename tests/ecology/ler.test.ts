/**
 * LE LAND EQUIVALENT RATIO (issue #136, critère H21 ; docs/regles.md §7.5).
 *
 * Le chiffre de l'agroforesterie, et le dernier morceau de #136 : la culture
 * existait (C16, C18, H19, H20), le gradient sous les arbres existait (E13), et
 * il manquait la question que les deux préparaient — *est-ce que le mélange bat
 * la somme des parties ?*
 *
 * **C'EST UN DISPOSITIF, PAS UN AFFICHAGE**, et c'est ce qui fait la longueur
 * de ce fichier. Un LER a besoin de DEUX monocultures témoins, sur la même
 * station, sous le même climat, avec la même graine et la même conduite. Aucune
 * quantité mesurée sur la seule parcelle mixte ne les remplace, et `ler.ts`
 * explique pourquoi chacune des trois tentatives tentantes échoue.
 *
 * Les trois bras :
 *   A. agroforesterie — deux rangs de noyers, 13 m d'allée, blé dessous ;
 *   B. blé pur — même conduite, pas un arbre ;
 *   C. noyers purs — plantation forestière à sa propre densité, pas de blé.
 *
 * Cible de validation : le noyer-céréale de Restinclières dépasse **1,2**
 * (Dupraz & Capillon, INRAE Montpellier).
 */

import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyAction, type GameAction } from "../../src/engine/actions";
import {
  HERBACEES,
  INDEX_CULTURES,
  N_HERBACEES,
  partDuRendement,
} from "../../src/engine/herbacees";
import { ler, lerPartiel, production } from "../../src/engine/ler";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type GameState, plantAt } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";
import { volumeTigeM3 } from "../../src/engine/trees";

const FICHE = HERBACEES.find((h) => h.id === "triticum_aestivum");
if (!FICHE?.culture) throw new Error("fiche du blé manquante");
const BLE = FICHE.culture;
const WEATHER = syntheticYear(LIMON_RICHE.climat);

/** Carré de quarante mètres, et un rayon qui le couvre en entier. */
const COTE = 40;
const RAYON = 30;
const AIRE_HA = (COTE * COTE) / 10_000;
const CENTRE = COTE / 2;
const ANS = 60;
/** Azote minéral, au printemps, comme le blé de Broadbalk (#140). */
const DOSE_N = 192;

/**
 * Les deux rangs de l'agroforesterie : 13 m entre rangs — l'allée de
 * Restinclières —, 7 m sur le rang, soit 112 tiges/ha. La plantation
 * forestière témoin est à 6 × 6 m, soit 278 tiges/ha : le témoin d'un LER est
 * la monoculture à SA densité, pas la même densité sans culture.
 */
const RANGS_AGROFORESTERIE: [number, number][] = [];
for (const y of [13.5, 26.5]) for (let x = 3; x < COTE; x += 7) RANGS_AGROFORESTERIE.push([x, y]);
const PLANTATION_PURE: [number, number][] = [];
for (let y = 3; y < COTE; y += 6) for (let x = 3; x < COTE; x += 6) PLANTATION_PURE.push([x, y]);

/** Le grain mûr sur la parcelle, en tonnes — ce que la moissonneuse va emporter. */
function grainSurPiedT(state: GameState): number {
  let t = 0;
  const { cultureGrain, cultureGrainPotentiel } = state.soil;
  const nCells = COTE * COTE;
  for (const s of INDEX_CULTURES) {
    const culture = HERBACEES[s]?.culture;
    if (!culture) continue;
    for (let i = 0; i < nCells; i++) {
      const base = i * N_HERBACEES;
      const part = partDuRendement(
        cultureGrain[base + s] ?? 0,
        cultureGrainPotentiel[base + s] ?? 0,
      );
      // Un m² par cellule, et `rendementMaxTHa` est en tonnes par hectare.
      t += (part * culture.rendementMaxTHa) / 10_000;
    }
  }
  return t;
}

/**
 * Le calendrier d'éclaircie de la plantation témoin, en (année, tiges/ha visées).
 *
 * **Sans lui, le témoin n'en est pas un** : mesuré une première fois sans
 * éclaircie, les 49 noyers plantés étaient 187 à l'arrivée — les sujets mûrs
 * s'étaient ressemés et le « témoin forestier » était devenu un fourré. Une
 * plantation, ça se conduit : c'est la définition même de la monoculture à
 * laquelle un LER compare. Le bras agroforestier, lui, ne s'éclaircit pas —
 * un alignement se taille, il ne se dépressage pas —, et il n'en a pas besoin :
 * le labour annuel des allées supprime la régénération tout seul.
 */
const ECLAIRCIES: [number, number][] = [
  [20, 400],
  [35, 200],
  [50, 120],
];

/** Volume de tige sur pied, m³. */
function surPiedM3(state: GameState): number {
  let v = 0;
  for (const t of state.trees) if (t.alive) v += volumeTigeM3(t.diametreCm, t.heightM);
  return v;
}

/** Un bras du dispositif : des arbres (ou pas), du blé (ou pas), soixante ans. */
function bras(
  arbres: readonly [number, number][],
  avecBle: boolean,
  options: { eclaircir?: boolean; graine?: number; sansLabour?: boolean } = {},
) {
  const graine = options.graine ?? 4;
  const station = { ...LIMON_RICHE.station, coteM: COTE, voisinage: [] };
  let state: GameState = createGameState(station, rngStateFromSeed(graine));
  for (const [x, y] of arbres) state = plantAt(state, "juglans_regia", x, y, 2);
  const plantes = new Set(state.trees.map((t) => t.id));
  const geste = (a: GameAction) => {
    state = applyAction(state, a).state;
  };
  const disque = { x: CENTRE, y: CENTRE, rayonM: RAYON };
  let grainT = 0;
  let boisRecolteM3 = 0;
  for (let an = 0; an < ANS; an++) {
    for (let w = 0; w < 52; w++) {
      const week = an * 52 + w;
      if (options.eclaircir && w === 0) {
        const cible = ECLAIRCIES.find(([a]) => a === an)?.[1];
        if (cible !== undefined) {
          const avant = surPiedM3(state);
          geste({
            type: "eclaircir",
            week,
            ...disque,
            densiteCibleParHa: cible,
            critere: "parLeBas",
            devenir: "vendre",
          });
          boisRecolteM3 += Math.max(0, avant - surPiedM3(state));
        }
      }
      if (avecBle) {
        if (w === BLE.semisWeek - 1)
          geste(
            options.sansLabour
              ? { type: "faucher", week, ...disque }
              : { type: "labourer", week, ...disque },
          );
        if (w === BLE.semisWeek)
          geste({ type: "semer", week, ...disque, cultureId: "triticum_aestivum" });
        if (w === 10)
          geste({ type: "fertiliser", week, ...disque, forme: "mineral", doseKgNHa: DOSE_N });
        if (w === BLE.recolteWeek) {
          grainT += grainSurPiedT(state);
          geste({ type: "moissonner", week, ...disque });
        }
      }
      const m = WEATHER[w];
      if (!m) throw new Error("météo manquante");
      state = tick(state, m).state;
    }
  }
  const noyers = state.trees.filter((t) => t.alive && t.especeId === "juglans_regia");
  const cohorte = state.trees.filter((t) => t.alive && plantes.has(t.id));
  const volCohorte = cohorte.reduce((a, t) => a + volumeTigeM3(t.diametreCm, t.heightM), 0);
  const autres = state.trees.filter((t) => t.alive && t.especeId !== "juglans_regia");
  return {
    autres: autres.length,
    // **Le bois du LER est celui de l'ESPÈCE CULTIVÉE**, pas celui de tout ce
    // qui pousse. Un LER compare deux productions : le grain d'un côté, le bois
    // d'œuvre de l'autre. Les semis spontanés d'autres essences qui s'installent
    // dans la plantation ne sont pas le produit, et les compter gonflerait le
    // témoin — donc écraserait le terme arbre du mélange, où le labour annuel
    // des allées les supprime. Mesuré avant cette règle : le témoin comptait
    // 15,0 m³ pour 6,7 m³ de noyers.
    production: production(noyers, AIRE_HA, ANS, grainT, boisRecolteM3),
    tiges: noyers.length,
    boisRecolteM3,
    /** Les arbres PLANTÉS, suivis par leur identité : le seul échantillon comparable d'un bras à l'autre. */
    cohorte: cohorte.length,
    volCohorte,
    dCohorte: cohorte.length ? cohorte.reduce((a, t) => a + t.diametreCm, 0) / cohorte.length : 0,
    hCohorte: cohorte.length ? cohorte.reduce((a, t) => a + t.heightM, 0) / cohorte.length : 0,
    dMoy: noyers.length ? noyers.reduce((a, t) => a + t.diametreCm, 0) / noyers.length : 0,
    hMoy: noyers.length ? noyers.reduce((a, t) => a + t.heightM, 0) / noyers.length : 0,
  };
}

describe("l'indice lui-même, avant toute partie", () => {
  it("un terme est une SURFACE ÉQUIVALENTE, et un témoin nul ne vaut pas l'infini", () => {
    expect(lerPartiel(5, 10)).toBeCloseTo(0.5, 12);
    expect(lerPartiel(10, 10)).toBe(1);
    // Un dénominateur nul dit que la monoculture est impossible ici, donc que
    // la question du partage ne se pose pas — pas que le mélange est infiniment
    // meilleur.
    expect(lerPartiel(5, 0)).toBe(0);
    expect(lerPartiel(-3, 10)).toBe(0);
  });

  it("le mélange gagne quand la somme des deux parts dépasse un", () => {
    const mixte = { grainTHaAn: 3, boisM3HaAn: 4 };
    const bleP = { grainTHaAn: 5, boisM3HaAn: 0 };
    const boisP = { grainTHaAn: 0, boisM3HaAn: 8 };
    const r = ler(mixte, bleP, boisP);
    expect(r.culture).toBeCloseTo(0.6, 12);
    expect(r.arbre).toBeCloseTo(0.5, 12);
    expect(r.total).toBeCloseTo(1.1, 12);
    // Et il perd quand chacun rend moins que sa part de surface.
    expect(ler({ grainTHaAn: 2, boisM3HaAn: 2 }, bleP, boisP).total).toBeLessThan(1);
  });

  it("le bois compte la production, pas le stock : une coupe ne fait pas baisser le LER", () => {
    const debout = production([], 1, 10, 0, 0);
    const coupe = production([], 1, 10, 0, 50);
    expect(debout.boisM3HaAn).toBe(0);
    expect(coupe.boisM3HaAn).toBeCloseTo(5, 12);
  });
});

describe("le dispositif à trois bras, soixante ans", () => {
  /**
   * CE QUE LE DISPOSITIF A DÛ APPRENDRE, ET DANS L'ORDRE OÙ IL L'A APPRIS.
   * Quatre relevés, trois causes écartées, une retenue.
   *
   * 1. LE TÉMOIN FORESTIER N'EN ÉTAIT PAS UN. 49 noyers plantés, **187** à
   *    l'arrivée : les sujets mûrs s'étaient ressemés et le « témoin » était un
   *    fourré. Une plantation, ça se conduit — d'où `ECLAIRCIES`.
   *
   * 2. IL COMPTAIT LE BOIS DES ESSENCES SPONTANÉES : 15,0 m³ là où les noyers
   *    n'en faisaient que 6,7. Un LER compare des PRODUITS, donc seul le bois
   *    de l'espèce cultivée compte.
   *
   * 3. J'AI ACCUSÉ LA CROISSANCE DU NOYER, ET C'ÉTAIT FAUX. Sa fiche est
   *    marquée « NON calé sur table », les moyennes semblaient l'accabler
   *    (d 19,6 en allée contre 20,2 en plantation, h 8,3 contre 9,2) — et
   *    **comparer des moyennes de distributions asymétriques ne dit rien**. En
   *    volume l'écart était de 2,5, pas de 1,2. Le seul échantillon comparable
   *    est la COHORTE PLANTÉE, suivie par ses identités :
   *
   *      allée, blé + labour      d=19,6  h= 8,3   0,130 m³/arbre
   *      mêmes rangs, sans blé    d=32,3  h=13,4   0,565 m³/arbre
   *      plantation 6×6           d=30,0  h=13,7   0,498 m³/arbre
   *
   *    Le noyer du moteur atteint donc 32 cm à soixante ans, et il DÉPASSE
   *    celui de la plantation — le fait attendu d'un arbre plus espacé.
   *
   * 4. CE QUI RESTE : cultiver l'allée coûte **77 % du volume des arbres**, et
   *    le dispositif laboure jusqu'au pied des rangs, ce qu'aucun agroforestier
   *    ne fait — une allée réelle garde une bande enherbée d'un à deux mètres.
   *    Les actions du moteur prennent toutes un DISQUE, et un disque ne pave
   *    pas une allée en laissant des bandes. Éprouvé : en remplaçant le labour
   *    par une fauche, les noyers retrouvent exactement leurs 0,565 m³ — mais
   *    **le blé ne lève plus du tout** (0,000 t/ha), parce que semer dans un
   *    tapis fermé est refusé (H20). Dans ce moteur, on ne cultive pas sans
   *    labourer, donc on ne sait pas encore ménager le pied des arbres (#184).
   *
   * Le LER sort à 1,20 — la cible de Restinclières — mais avec une composition
   * renversée, culture 1,10 et arbre 0,10 là où la littérature donne ~0,7 et
   * ~0,5. Le total est juste pour la mauvaise raison : H21 reste 🟡.
   */
  it("le mélange bat la somme des parties", () => {
    const agro = bras(RANGS_AGROFORESTERIE, true);
    const rangsSansBle = bras(RANGS_AGROFORESTERIE, false);
    const blePur = bras([], true);
    const boisPur = bras(PLANTATION_PURE, false, { eclaircir: true });
    const r = ler(agro.production, blePur.production, boisPur.production);
    // Les deux témoins doivent exister, sans quoi l'indice ne veut rien dire.
    expect(blePur.production.grainTHaAn).toBeGreaterThan(0);
    expect(boisPur.production.boisM3HaAn).toBeGreaterThan(0);
    writeFileSync(
      "/tmp/claude-0/-home-user-canopee/92894e8d-7260-55b6-b840-4a9e76cdcbd4/scratchpad/ler.txt",
      [
        `agro    grain ${agro.production.grainTHaAn.toFixed(3)} t/ha/an  bois ${agro.production.boisM3HaAn.toFixed(3)} m3/ha/an  tiges ${agro.tiges}  autres ${agro.autres}`,
        `blé pur grain ${blePur.production.grainTHaAn.toFixed(3)}  bois ${blePur.production.boisM3HaAn.toFixed(3)}  tiges ${blePur.tiges}`,
        `bois pur grain ${boisPur.production.grainTHaAn.toFixed(3)}  bois ${boisPur.production.boisM3HaAn.toFixed(3)}  tiges ${boisPur.tiges}  autres ${boisPur.autres}  éclairci ${boisPur.boisRecolteM3.toFixed(2)} m3`,
        `LER culture ${r.culture.toFixed(3)}  arbre ${r.arbre.toFixed(3)}  TOTAL ${r.total.toFixed(3)}`,
        `DIAG noyers  agro d=${agro.dMoy.toFixed(1)} h=${agro.hMoy.toFixed(1)} n=${agro.tiges}` +
          ` | mêmes rangs SANS blé d=${rangsSansBle.dMoy.toFixed(1)} h=${rangsSansBle.hMoy.toFixed(1)} n=${rangsSansBle.tiges} bois=${rangsSansBle.production.boisM3HaAn.toFixed(3)}` +
          ` | plantation d=${boisPur.dMoy.toFixed(1)} h=${boisPur.hMoy.toFixed(1)} n=${boisPur.tiges}`,
        "COHORTE PLANTÉE (mêmes identités, seul échantillon comparable) :",
        ...[
          ["agro (blé + labour)", agro],
          ["mêmes rangs, sans blé", rangsSansBle],
          ["plantation 6x6", boisPur],
        ].map(
          ([nom, b]) =>
            `  ${String(nom).padEnd(24)} n=${(b as typeof agro).cohorte} d=${(b as typeof agro).dCohorte.toFixed(1)} h=${(b as typeof agro).hCohorte.toFixed(1)} vol=${(b as typeof agro).volCohorte.toFixed(2)} m3 soit ${((b as typeof agro).volCohorte / Math.max(1, (b as typeof agro).cohorte)).toFixed(3)} m3/arbre`,
        ),
      ].join("\n"),
    );
    expect(agro.tiges).toBeGreaterThan(0);
    // Le témoin forestier doit être CONDUIT, sans quoi il n'en est pas un :
    // sans éclaircie il finissait à 187 tiges pour 49 plantées.
    expect(boisPur.tiges).toBeLessThan(PLANTATION_PURE.length * 1.5);
    // Et les noyers d'allée, suivis par leur identité, PAIENT la culture. C'est
    // le constat qui tient H21 à 🟡 : l'écart est réel, son ampleur ne l'est
    // sans doute pas, et le dispositif ne sait pas ménager le pied des rangs.
    expect(agro.volCohorte / agro.cohorte).toBeLessThan(
      0.5 * (rangsSansBle.volCohorte / rangsSansBle.cohorte),
    );
    expect(r.total).toBeGreaterThan(1);
  }, 900_000);
});
