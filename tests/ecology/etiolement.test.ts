/**
 * L'étiolement (issue #97, critère E10) : à l'ombre, une tige FILE.
 *
 * Ce que le moteur faisait : la lumière entrait dans la loi du minimum, donc
 * elle rabotait la pousse totale ; le partage hauteur/diamètre ne portait que
 * sur le reste. Un arbre à l'ombre poussait moins des DEUX côtés à la fois, et
 * son élancement ne bougeait quasiment pas — il stagnait au lieu de filer.
 *
 * Ce que ce fichier vérifie, dans cet ordre :
 *   1. le bois se compte exactement, et rien n'est créé ni perdu au partage ;
 *   2. **pour un arbre que l'ombre ne limite pas, RIEN ne change** — c'est la
 *      garantie qui protège les hauteurs calées sur Jansen 1996 ;
 *   3. pour un arbre que l'ombre limite, la hauteur résiste et le diamètre
 *      encaisse ;
 *   4. l'élancement d'équilibre tombe du mécanisme, personne ne l'a choisi.
 */

import { describe, expect, it } from "vitest";
import { getEspece } from "../../src/engine/especes";
import {
  allocationDiametreCmParM,
  coutDuMetreEnBois,
  diametreAchetableCm,
  elancement,
  elancementLimite,
  hauteurStableM,
  type TreeEnvironment,
  type TreeState,
  tickTree,
  volumeTigeM3,
} from "../../src/engine/trees";

const HETRE = getEspece("fagus_sylvatica");

/** Un hêtre de perche, toutes conditions au large sauf la lumière. */
function tige(heightM: number, diametreCm: number): TreeState {
  return {
    id: 1,
    especeId: "fagus_sylvatica",
    x: 5,
    y: 5,
    ageWeeks: 20 * 52,
    heightM,
    diametreCm,
    stress: 0,
    alive: true,
    uptakeYearG: 0,
    fruitsKg: 0,
    fruitProgress: 0,
    bloomFrosted: false,
    rootDepthCm: 60,
    hauteurElagueeM: 0,
    pousseTendreM: 0,
    vigueur: 1,
    protege: false,
    recepages: 0,
    vigueurIndividuelle: 1,
  } as TreeState;
}

function milieu(light: number): TreeEnvironment {
  return {
    waterSatisfaction: 1,
    waterloggingRatio: 0,
    light,
    nitrogenSatisfaction: 1,
    phMean: 6.5,
    solPenetrableCm: 80,
    tMean: 18,
  };
}

/** Une semaine de croissance : ce que la tige gagne en hauteur et en diamètre. */
function semaine(t: TreeState, light: number) {
  const apres = tickTree(t, milieu(light)).tree;
  return {
    dH: apres.heightM - t.heightM,
    dD: apres.diametreCm - t.diametreCm,
    /** m³ de tige gagnés : la vraie mesure du bois produit */
    dV: volumeTigeM3(apres.diametreCm, apres.heightM) - volumeTigeM3(t.diametreCm, t.heightM),
  };
}

describe("le bois se compte, et le compte est exact", () => {
  it("le coût d'un mètre et le diamètre achetable sont réciproques", () => {
    // `bois = dH + 2 (H/D) dD` : si la tige dépense `dH × (coût − 1)` en
    // épaississement, elle doit racheter EXACTEMENT `dH × allocation`.
    for (const e of [20, 50, 80, 130]) {
      for (const a of [0.5, 1.25, 2, 2.5]) {
        const dH = 0.03;
        const reste = dH * (coutDuMetreEnBois(e, a) - 1);
        expect(diametreAchetableCm(reste, e)).toBeCloseTo(dH * a, 10);
      }
    }
  });

  it("une tige sans diamètre n'est pas infiniment élancée", () => {
    // Une tige dont le diamètre n'a pas été renseigné a un H/D infini. Sans
    // garde-fou, son bois ne rachèterait plus jamais un centimètre et elle
    // resterait un fil pour toujours. C'est le zéro dur, cherché d'avance.
    expect(diametreAchetableCm(1, Number.POSITIVE_INFINITY)).toBe(0);
    const t = tickTree(tige(0.3, 0), milieu(1)).tree;
    expect(t.diametreCm).toBeGreaterThan(0);
  });
});

describe("ce que l'ombre ne limite pas, elle ne touche pas", () => {
  it("en pleine lumière, le diamètre suit l'allocation au dernier chiffre près", () => {
    const t = tige(12, 30);
    const g = semaine(t, 1);
    expect(g.dH).toBeGreaterThan(0);
    expect(g.dD / g.dH).toBeCloseTo(allocationDiametreCmParM(1), 9);
  });

  it("et AU-DESSUS DE LA SATURATION de l'espèce non plus, même à mi-ombre", () => {
    // C'est la garantie qui compte pour les tables de production : le hêtre
    // sature à 0,35 de lumière, donc un dominant à 0,5 n'est pas limité par
    // l'ombre — son calcul doit redonner l'ancienne formule exactement.
    const t = tige(12, 30);
    expect(HETRE.lumiere.saturation).toBeLessThan(0.5);
    const g = semaine(t, 0.5);
    expect(g.dD / g.dH).toBeCloseTo(allocationDiametreCmParM(0.5), 9);
  });
});

describe("ce que l'ombre limite, elle redirige avant de le raboter", () => {
  const t = tige(12, 30);
  const plein = semaine(t, 1);
  const ombre = semaine(t, 0.08);

  it("la hauteur résiste là où l'ancienne loi du minimum l'aurait rabotée", () => {
    // L'ancienne formule donnait `pousse_pleine × f_lumière` en hauteur. La
    // nouvelle donne plus, sans jamais dépasser ce que l'arbre pourrait monter
    // si la lumière ne comptait pas — la hauteur dominante insensible à la
    // densité (Assmann 1970).
    const { compensation, saturation } = HETRE.lumiere;
    const fLum = (0.08 - compensation) / (saturation - compensation);
    expect(ombre.dH).toBeGreaterThan(1.5 * plein.dH * fLum);
    expect(ombre.dH).toBeLessThanOrEqual(plein.dH + 1e-12);
  });

  it("et c'est le DIAMÈTRE qui paie : le dernier servi", () => {
    // Le cambium ne reçoit que le résidu, et sous cette ombre-là le résidu est
    // NUL. Ce zéro n'est pas un défaut de forme : c'est le cerne manquant d'une
    // tige dominée, un fait de dendrochronologie ordinaire. Ce qui en fait un
    // zéro sûr est qu'il est BORNÉ — la tige finit par rencontrer son enveloppe
    // de flambage (essai suivant), et tout son bois repart alors au diamètre.
    expect(ombre.dD).toBe(0);
    expect(ombre.dH).toBeGreaterThan(0);
  });

  it("le bois total, lui, reste celui que la lumière permet", () => {
    // Le partage ne crée pas de matière : la tige à l'ombre fait bien moins de
    // bois que celle au large, elle le place seulement ailleurs.
    expect(ombre.dV).toBeLessThan(0.4 * plein.dV);
  });
});

describe("c'est le FLAMBAGE qui arrête la perche, et rien d'autre", () => {
  it("sans lui, la tige file sans fin — l'équilibre du partage est à H/D 295", () => {
    // Le partage a bien un point fixe : la tige cesse de s'élancer quand sa
    // croissance relative en diamètre rattrape celle en hauteur, soit à
    // `H/D = (3/f_lum − 1) × 50 / allocation`. Mesuré avant d'y croire : sous
    // cette ombre-là il vaut 295, et la tige y allait (H/D 166 en quarante
    // ans). C'est ce chiffre-là qui a rendu la mécanique NÉCESSAIRE, et cet
    // essai le garde écrit pour qu'on ne retire pas le plafond par distraction.
    const { compensation, saturation } = HETRE.lumiere;
    const fLum = (0.12 - compensation) / (saturation - compensation);
    const pointFixeDuPartage = ((3 / fLum - 1) * 50) / allocationDiametreCmParM(0.12);
    expect(pointFixeDuPartage).toBeGreaterThan(250);
  });

  it("la tige à l'ombre se pose SUR son enveloppe de flambage et y reste", () => {
    let t = tige(6, 12);
    for (let s = 0; s < 40 * 26; s++) t = tickTree(t, milieu(0.12)).tree;
    const obtenu = elancement(t.diametreCm, t.heightM);
    // Elle a bien filé — elle partait de H/D 50 — et elle s'est arrêtée là où
    // la mécanique le dit, pas où le partage l'aurait menée.
    expect(obtenu).toBeGreaterThan(80);
    expect(obtenu).toBeCloseTo(elancementLimite(t.diametreCm), 0);
    // À cinq millimètres près : la tige suit l'enveloppe d'une semaine sur
    // l'autre, elle ne s'en décolle pas.
    expect(t.heightM).toBeCloseTo(hauteurStableM(t.diametreCm), 1);
  });

  it("et elle continue de grandir, en s'épaississant le long de l'enveloppe", () => {
    // Le plafond n'est pas un couperet : une perche collée à son enveloppe
    // monte encore, mais elle doit payer le diamètre pour ça.
    let t = tige(6, 12);
    for (let s = 0; s < 40 * 26; s++) t = tickTree(t, milieu(0.12)).tree;
    const avant = { h: t.heightM, d: t.diametreCm };
    for (let s = 0; s < 10 * 26; s++) t = tickTree(t, milieu(0.12)).tree;
    expect(t.heightM).toBeGreaterThan(avant.h);
    expect(t.diametreCm).toBeGreaterThan(avant.d);
    // Et l'élancement REDESCEND : plus la tige grossit, moins elle a le droit
    // d'être élancée. C'est l'exposant 2/3 de Greenhill, pas un réglage.
    expect(elancement(t.diametreCm, t.heightM)).toBeLessThan(elancement(avant.d, avant.h) + 1e-9);
  });

  it("l'enveloppe ne gêne AUCUN arbre normalement conformé", () => {
    // Garde-fou : si elle mordait sur les sujets ordinaires, elle changerait
    // les hauteurs calées sur les tables au lieu de borner les perches.
    // Un hêtre de futaie (25 m, 50 cm), un dominant de peuplement (17 m, 36 cm),
    // un semis (0,3 m, 0,6 cm) : tous très en dessous.
    for (const [h, d] of [
      [25, 50],
      [17, 36],
      [2, 4],
      [0.3, 0.6],
    ] as const) {
      expect(elancement(d, h), `${h} m / ${d} cm`).toBeLessThan(elancementLimite(d));
    }
  });
});
