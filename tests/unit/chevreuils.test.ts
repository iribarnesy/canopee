/**
 * **Le chevreuil qu'on voit est celui que le moteur fait brouter** (#129).
 *
 * Trois promesses tiennent le module, et ce sont elles qu'on défend :
 *
 * - **combien** : la présence moyenne suit la densité du moteur et la surface où
 *   la bête peut entrer — la chasse la fait baisser, la clôture aussi ;
 * - **où** : jamais dans une cellule close, et au pied des arbres que le moteur
 *   a réellement broutés ou frottés quand il y en a ;
 * - **tenue** : une visite commencée ne saute pas quand l'instantané change.
 */

import { describe, expect, it } from "vitest";
import {
  boisDuBrocard,
  cheminLibre,
  MAX_CHEVREUILS,
  type MondeDuGibier,
  PRESENCE_TEMOIN,
  pelageDEte,
  planifierLaVisite,
  poseDansLaVisite,
  presencesDuGibier,
  surfaceOuverteHa,
  TEMOIN_SEMAINES,
  Troupeau,
  temoinsDuGibier,
} from "../../src/render/faune/chevreuils";

const COTE = 100;

function monde(partiel: Partial<MondeDuGibier> = {}): MondeDuGibier {
  return {
    coteM: COTE,
    semaine: 520,
    densiteParHa: 0.2,
    cloture: new Uint8Array(COTE * COTE),
    arbres: [],
    ...partiel,
  };
}

/** Clôt un rectangle de cellules [x0,x1[ × [y0,y1[. */
function clore(x0: number, y0: number, x1: number, y1: number): Uint8Array {
  const c = new Uint8Array(COTE * COTE);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) c[y * COTE + x] = 1;
  return c;
}

/** Les points où passe la visite, échantillonnés. */
function trace(m: MondeDuGibier, place: number, rang: number) {
  const v = planifierLaVisite(m, place, rang, 0);
  const points: { x: number; y: number }[] = [];
  if (!v) return { v, points };
  for (let t = v.debutMs; t < v.finMs; t += 100) {
    const p = poseDansLaVisite(v, t);
    if (p) points.push(p);
  }
  return { v, points };
}

describe("combien de chevreuils", () => {
  it("la présence moyenne est la densité du moteur fois la surface", () => {
    // 0,2 tête par hectare sur un hectare : une place, occupée un cinquième du temps.
    expect(presencesDuGibier(0.2, 1, false)).toEqual([0.2]);
    // 2,5 têtes : deux places pleines et une à moitié.
    expect(presencesDuGibier(0.5, 5, false)).toEqual([1, 1, 0.5]);
  });

  it("sans densité, personne", () => {
    expect(presencesDuGibier(0, 1, false)).toEqual([]);
  });

  it("la chasse fait baisser la présence, dans la même proportion", () => {
    const avant = presencesDuGibier(0.3 * 1, 1, false)[0] ?? 0;
    const apres = presencesDuGibier(0.3 * 0.25, 1, false)[0] ?? 0;
    expect(apres).toBeCloseTo(avant * 0.25, 10);
  });

  it("jamais plus que le plafond, et il est dit", () => {
    expect(presencesDuGibier(50, 10, false)).toHaveLength(MAX_CHEVREUILS);
  });

  it("une clôture retire sa surface", () => {
    const moitie = monde({ cloture: clore(0, 0, 100, 50) });
    expect(surfaceOuverteHa(moitie)).toBeCloseTo(0.5, 10);
    expect(surfaceOuverteHa(monde())).toBeCloseTo(1, 10);
  });

  it("les semaines à témoins, on voit au moins la bête qui les a faits", () => {
    expect(presencesDuGibier(0.05, 1, true)[0]).toBe(PRESENCE_TEMOIN);
    // Mais jamais sur une parcelle entièrement close.
    expect(presencesDuGibier(0.05, 0, true)).toEqual([]);
  });
});

describe("les témoins", () => {
  const arbres = [
    { id: 1, x: 10, y: 10, brouteSemaine: 520 },
    { id: 2, x: 20, y: 10, brouteSemaine: 520 - TEMOIN_SEMAINES - 1 },
    { id: 3, x: 30, y: 10, frotteSemaine: 519 },
    { id: 4, x: 40, y: 10 },
    { id: 5, x: 50, y: 10, brouteSemaine: 520, frotteSemaine: 300 },
  ];

  it("ne retient que les gestes récents", () => {
    const t = temoinsDuGibier(monde({ arbres }));
    expect(t.map((a) => a.id)).toEqual([1, 3, 5]);
    // Le frottis d'il y a quatre ans ne fait pas de l'arbre 5 un témoin de frottis.
    expect(t.find((a) => a.id === 5)?.frotteSemaine).toBeUndefined();
  });

  it("un arbre derrière la clôture n'est pas un témoin", () => {
    const t = temoinsDuGibier(monde({ arbres, cloture: clore(0, 0, 15, 15) }));
    expect(t.map((a) => a.id)).not.toContain(1);
  });

  it("la visite s'arrête au pied d'un arbre brouté", () => {
    const m = monde({ arbres: [{ id: 7, x: 60, y: 42, brouteSemaine: 520 }] });
    const v = planifierLaVisite(m, 0, 0, 0);
    const halte = v?.etapes.find((e) => e.sorte === "halte");
    expect(halte?.sorte === "halte" && halte.arbreId).toBe(7);
    if (halte?.sorte === "halte") {
      expect(Math.hypot(halte.au.x - 60, halte.au.y - 42)).toBeLessThan(1);
    }
  });

  it("un frottis se montre par un brocard, au pied frotté", () => {
    const m = monde({ arbres: [{ id: 8, x: 30, y: 70, frotteSemaine: 520 }] });
    let vu = false;
    for (let rang = 0; rang < 20 && !vu; rang++) {
      const v = planifierLaVisite(m, 0, rang, 0);
      const halte = v?.etapes.find((e) => e.sorte === "halte" && e.geste === "frotte");
      if (halte) {
        expect(v?.brocard).toBe(true);
        vu = true;
      }
    }
    expect(vu).toBe(true);
  });
});

describe("la clôture", () => {
  it("aucun point d'aucune visite ne tombe dans une cellule close", () => {
    const cloture = clore(20, 20, 80, 80);
    const m = monde({ cloture });
    for (let rang = 0; rang < 30; rang++) {
      const { points } = trace(m, rang % 3, rang);
      for (const p of points) {
        const i = Math.floor(p.y) * COTE + Math.floor(p.x);
        expect(cloture[i], `rang ${rang} (${p.x.toFixed(1)}, ${p.y.toFixed(1)})`).toBe(0);
      }
    }
  });

  it("un enclos fermé au bord : aucune visite n'a lieu", () => {
    // Un anneau clos d'un mètre tout autour : il n'y a pas d'entrée.
    const cloture = new Uint8Array(COTE * COTE);
    for (let i = 0; i < COTE; i++) {
      cloture[i] = 1;
      cloture[(COTE - 1) * COTE + i] = 1;
      cloture[i * COTE] = 1;
      cloture[i * COTE + COTE - 1] = 1;
    }
    const m = monde({ cloture });
    for (let rang = 0; rang < 10; rang++) expect(planifierLaVisite(m, 0, rang, 0)).toBeUndefined();
  });

  it("le test de chemin voit une clôture en travers", () => {
    const m = monde({ cloture: clore(50, 0, 51, 100) });
    expect(cheminLibre(m, { x: 10, y: 10 }, { x: 90, y: 10 })).toBe(false);
    expect(cheminLibre(m, { x: 10, y: 10 }, { x: 40, y: 90 })).toBe(true);
  });
});

describe("la visite", () => {
  const m = monde();

  it("entre par un bord, et en ressort par un bord", () => {
    const { points } = trace(m, 0, 3);
    const auBord = (p: { x: number; y: number }) =>
      Math.min(p.x, p.y, COTE - p.x, COTE - p.y) < 1.5;
    expect(auBord(points[0] as { x: number; y: number })).toBe(true);
    expect(auBord(points[points.length - 1] as { x: number; y: number })).toBe(true);
  });

  it("apparaît et disparaît en fondu, jamais d'un coup", () => {
    const v = planifierLaVisite(m, 0, 1, 0);
    expect(v).toBeDefined();
    if (!v) return;
    expect(poseDansLaVisite(v, v.debutMs)?.opacite).toBe(0);
    expect(poseDansLaVisite(v, v.debutMs + 50)?.opacite ?? 1).toBeLessThan(0.1);
    expect(poseDansLaVisite(v, v.finMs - 50)?.opacite ?? 1).toBeLessThan(0.1);
    expect(poseDansLaVisite(v, v.finMs)).toBeUndefined();
  });

  it("broute et lève la tête pendant une halte", () => {
    const v = planifierLaVisite(m, 0, 2, 0);
    const halte = v?.etapes.find((e) => e.sorte === "halte");
    expect(halte).toBeDefined();
    if (!v || !halte) return;
    const vues = new Set<string>();
    for (let t = halte.debutMs; t < halte.finMs; t += 200) {
      vues.add(poseDansLaVisite(v, t)?.attitude ?? "");
    }
    expect(vues.has("broute")).toBe(true);
    expect(vues.has("guette")).toBe(true);
  });

  it("est la même d'un appel à l'autre : rien n'est tiré au hasard", () => {
    expect(planifierLaVisite(m, 1, 4, 1000)).toEqual(planifierLaVisite(m, 1, 4, 1000));
  });
});

describe("le troupeau", () => {
  it("la part du temps où l'on voit un chevreuil suit la présence", () => {
    const m = monde({ densiteParHa: 0.3 });
    const troupeau = new Troupeau();
    let vus = 0;
    let n = 0;
    for (let t = 0; t < 4 * 3600_000; t += 1000) {
      if (troupeau.poses(m, t).length > 0) vus++;
      n++;
    }
    // Les fondus comptent comme présence : on tolère une marge.
    expect(vus / n).toBeGreaterThan(0.2);
    expect(vus / n).toBeLessThan(0.4);
  });

  it("une visite commencée ne saute pas quand l'instantané change", () => {
    const avant = monde({ densiteParHa: 3 });
    const troupeau = new Troupeau();
    let t = 0;
    let poses = troupeau.poses(avant, t);
    while (poses.length === 0 && t < 600_000) {
      t += 500;
      poses = troupeau.poses(avant, t);
    }
    const p = poses[0];
    expect(p).toBeDefined();
    // Un instantané nouveau : un témoin est apparu à l'autre bout.
    const apres = monde({
      densiteParHa: 3,
      arbres: [{ id: 9, x: 95, y: 95, brouteSemaine: 520 }],
    });
    const suite = troupeau.poses(apres, t + 16).find((q) => q.place === p?.place);
    expect(suite).toBeDefined();
    expect(Math.hypot((suite?.x ?? 0) - (p?.x ?? 0), (suite?.y ?? 0) - (p?.y ?? 0))).toBeLessThan(
      0.1,
    );
  });

  it("une semaine de broutage raccourcit l'attente sur-le-champ", () => {
    // Le défaut du premier jet : la pause était figée à la présence de janvier
    // (un septième du temps), et en mai la bête n'arrivait toujours pas.
    const troupeau = new Troupeau();
    const hiver = monde({ densiteParHa: 0.136 });
    for (let t = 0; t < 10_000; t += 1000) troupeau.poses(hiver, t);
    const printemps = monde({
      densiteParHa: 0.136,
      arbres: [{ id: 3, x: 50, y: 50, brouteSemaine: 520 }],
    });
    let arrivee: number | undefined;
    for (let t = 10_000; t < 10_000 + 120_000 && arrivee === undefined; t += 500) {
      if (troupeau.poses(printemps, t).length > 0) arrivee = t;
    }
    expect(arrivee).toBeDefined();
  });

  it("sans densité, le troupeau est vide", () => {
    const troupeau = new Troupeau();
    for (let t = 0; t < 600_000; t += 5000) {
      expect(troupeau.poses(monde({ densiteParHa: 0 }), t)).toEqual([]);
    }
  });
});

describe("la saison sur la bête", () => {
  it("roux l'été, gris l'hiver", () => {
    expect(pelageDEte(28)).toBe(true);
    expect(pelageDEte(2)).toBe(false);
  });

  it("le brocard a ses bois au printemps, quand le moteur le fait frotter", () => {
    for (let s = 12; s <= 24; s++) expect(boisDuBrocard(s)).toBe(true);
    expect(boisDuBrocard(46)).toBe(false);
  });
});
