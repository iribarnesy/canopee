import { describe, expect, it } from "vitest";
import { champEau, polygoneEau, polygonesEau, SEUIL_RIVE } from "../../src/render/couches/eau";

/** Une mare ronde de rayon `r`, centrée sur la parcelle. */
function mare(coteM: number, r: number): boolean[] {
  const c = coteM / 2;
  return Array.from({ length: coteM * coteM }, (_, i) => {
    const x = (i % coteM) + 0.5;
    const y = Math.floor(i / coteM) + 0.5;
    return Math.hypot(x - c, y - c) <= r;
  });
}

/** Aire d'un polygone, en mètres carrés. */
function aire(p: { x: number; y: number }[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    if (!a || !b) continue;
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

describe("le champ d'eau aux coins", () => {
  it("vaut un au cœur de l'eau et zéro au sec", () => {
    const coteM = 20;
    const champ = champEau(mare(coteM, 6), coteM, 0, 0, coteM, coteM);
    const pas = coteM + 1;
    expect(champ[10 * pas + 10]).toBe(1);
    expect(champ[1 * pas + 1]).toBe(0);
  });

  it("prend une valeur intermédiaire sur la rive", () => {
    // Une seule cellule en eau : ses quatre coins voient un quart d'eau.
    const coteM = 4;
    const enEau = Array.from({ length: 16 }, (_, i) => i === 5);
    const champ = champEau(enEau, coteM, 0, 0, coteM, coteM);
    expect(champ[1 * 5 + 1]).toBeCloseTo(0.25);
    expect(champ[2 * 5 + 2]).toBeCloseTo(0.25);
  });

  it("ne compte que les cellules qui existent, au bord de la parcelle", () => {
    // Coin nord-ouest en eau : le coin (0,0) ne touche qu'une cellule, la sienne.
    const coteM = 4;
    const enEau = Array.from({ length: 16 }, (_, i) => i === 0);
    const champ = champEau(enEau, coteM, 0, 0, coteM, coteM);
    expect(champ[0]).toBe(1);
  });

  it("est vide sans grille d'eau", () => {
    const champ = champEau(undefined, 4, 0, 0, 4, 4);
    expect([...champ].every((v) => v === 0)).toBe(true);
  });
});

describe("les carrés marcheurs", () => {
  it("ne rendent rien sur une cellule sèche", () => {
    expect(polygoneEau(0, 0, 0, 0)).toHaveLength(0);
  });

  it("rendent le carré entier sur une cellule noyée", () => {
    const p = polygoneEau(1, 1, 1, 1);
    expect(p).toHaveLength(1);
    expect(p[0]).toHaveLength(4);
  });

  it("coupent en DIAGONALE quand un seul coin est mouillé", () => {
    // C'est tout l'objet du module : sans ça, la rive fait des marches.
    const p = polygoneEau(1, 0, 0, 0);
    expect(p).toHaveLength(1);
    const triangle = p[0];
    expect(triangle).toHaveLength(3);
    // Le triangle touche le coin nord-ouest et deux arêtes, pas trois coins.
    expect(triangle?.some((q) => q.u === 0 && q.v === 0)).toBe(true);
  });

  it("placent la rive là où le champ franchit le seuil, pas au milieu", () => {
    // Coin nord-ouest à 1, nord-est à 0 : la rive coupe l'arête haute au seuil.
    const p = polygoneEau(1, 0, 0, 0);
    const haut = p[0]?.find((q) => q.v === 0 && q.u > 0);
    expect(haut?.u).toBeCloseTo(SEUIL_RIVE);
  });

  it("tranchent le cas ambigu en deux morceaux séparés, pas en sablier", () => {
    const p = polygoneEau(1, 0, 0, 1);
    expect(p).toHaveLength(2);
  });

  it("couvrent les seize cas sans exception", () => {
    for (let code = 0; code < 16; code++) {
      const no = code & 8 ? 1 : 0;
      const ne = code & 4 ? 1 : 0;
      const se = code & 2 ? 1 : 0;
      const so = code & 1 ? 1 : 0;
      const p = polygoneEau(no, ne, so, se);
      if (code === 0) expect(p).toHaveLength(0);
      else expect(p.length).toBeGreaterThan(0);
      for (const morceau of p) expect(morceau.length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("le contour d'une mare", () => {
  const coteM = 40;
  const r = 12;

  it("approche l'aire du disque à mieux que cinq pour cent", () => {
    const polys = polygonesEau(mare(coteM, r), coteM, 0, 0, coteM, coteM);
    const total = polys.reduce((s, p) => s + aire(p), 0);
    const attendu = Math.PI * r * r;
    expect(Math.abs(total - attendu) / attendu).toBeLessThan(0.05);
  });

  it("ne s'écarte jamais de plus d'un mètre de ce que le moteur déclare", () => {
    // La promesse du module : le contour interpole, il n'invente pas de rive.
    const enEau = mare(coteM, r);
    const polys = polygonesEau(enEau, coteM, 0, 0, coteM, coteM);
    for (const p of polys) {
      for (const q of p) {
        const d = Math.hypot(q.x - coteM / 2, q.y - coteM / 2);
        expect(d).toBeLessThan(r + 1.5);
      }
    }
  });

  it("produit une rive OBLIQUE et non en escalier", () => {
    // Le défaut signalé : « la mare est moche, c'est pas beau d'avoir des
    // marches ». Une rive en escalier n'aurait que des sommets sur la grille
    // entière ; une rive oblique a des sommets à l'intérieur des arêtes.
    const polys = polygonesEau(mare(coteM, r), coteM, 0, 0, coteM, coteM);
    const obliques = polys.flat().filter((q) => !Number.isInteger(q.x) || !Number.isInteger(q.y));
    expect(obliques.length).toBeGreaterThan(20);
  });

  it("ne rend rien sans grille d'eau", () => {
    expect(polygonesEau(undefined, coteM, 0, 0, coteM, coteM)).toHaveLength(0);
  });
});
