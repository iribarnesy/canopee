import { describe, expect, it } from "vitest";
import {
  BRINS_PAR_M2,
  brinsDeLaCellule,
  clarteDuMotif,
  densiteTapis,
  motifDuTirage,
  TAPIS_DES_PX,
  TAPIS_PLEIN_PX,
} from "../../src/render/couches/tapis";
import { NIVEAUX, palier, quantifier } from "../../src/render/palette";

const cellule = (herbe: number, litiere: number) => ({
  humidite: palier(0.5),
  herbe: palier(herbe),
  herbeBiomasse: palier(0.5),
  litiere: palier(litiere),
  lumiere: palier(1),
});

describe("la densité du tapis suit le zoom", () => {
  it("est nulle de loin : un brin y ferait moins d'un pixel", () => {
    expect(densiteTapis(8)).toBe(0);
    expect(densiteTapis(TAPIS_DES_PX)).toBe(0);
  });

  it("est pleine de près", () => {
    expect(densiteTapis(TAPIS_PLEIN_PX)).toBe(1);
    expect(densiteTapis(200)).toBe(1);
  });

  it("monte sans saut entre les deux", () => {
    let precedent = -1;
    for (let px = 0; px <= 120; px += 2) {
      const d = densiteTapis(px);
      expect(d).toBeGreaterThanOrEqual(precedent);
      precedent = d;
    }
  });
});

describe("les trois motifs viennent des grandeurs du moteur", () => {
  /** Part d'un motif sur un balayage régulier des tirages. */
  const part = (c: Parameters<typeof motifDuTirage>[0], motif: string): number => {
    let n = 0;
    for (let i = 0; i < 400; i++) if (motifDuTirage(c, i / 400) === motif) n++;
    return n / 400;
  };

  // Note : les paliers ne saturent jamais tout à fait — `valeurDuPalier` rend
  // le MILIEU d'une tranche, donc le palier le plus haut vaut 15/16 et le plus
  // bas 1/16. Un tapis n'est donc jamais d'un seul motif, et c'est juste : une
  // pelouse a toujours sa plaque pelée.
  it("une cellule couverte d'herbe et sans litière est très majoritairement en touffes", () => {
    expect(part(cellule(1, 0), "touffe")).toBeGreaterThan(0.85);
    expect(part(cellule(1, 0), "feuille")).toBeLessThan(0.1);
  });

  it("une cellule enfouie sous la litière est très majoritairement en feuilles", () => {
    expect(part(cellule(1, 1), "feuille")).toBeGreaterThan(0.9);
    expect(part(cellule(1, 1), "touffe")).toBeLessThan(0.1);
  });

  it("une cellule rase et sans litière montre surtout sa terre", () => {
    expect(part(cellule(0, 0), "terre")).toBeGreaterThan(0.85);
  });

  it("la part de terre décroît quand la couverture monte", () => {
    const partTerre = (herbe: number) => {
      let n = 0;
      for (let i = 0; i < 200; i++) if (motifDuTirage(cellule(herbe, 0), i / 200) === "terre") n++;
      return n / 200;
    };
    expect(partTerre(0)).toBeGreaterThan(partTerre(0.5));
    expect(partTerre(0.5)).toBeGreaterThan(partTerre(1));
  });
});

describe("le semis des brins", () => {
  it("est déterministe : la même cellule rend toujours les mêmes brins", () => {
    const c = cellule(0.7, 0.2);
    expect(brinsDeLaCellule(12, 34, c, 1)).toEqual(brinsDeLaCellule(12, 34, c, 1));
  });

  it("ne sème rien quand la densité est nulle", () => {
    expect(brinsDeLaCellule(1, 1, cellule(1, 0), 0)).toHaveLength(0);
  });

  it("sème le compte annoncé à densité pleine", () => {
    expect(brinsDeLaCellule(1, 1, cellule(1, 0), 1)).toHaveLength(BRINS_PAR_M2);
  });

  it("garde chaque brin DANS sa cellule", () => {
    for (const brin of brinsDeLaCellule(7, 9, cellule(0.8, 0.1), 1)) {
      expect(brin.x).toBeGreaterThanOrEqual(7);
      expect(brin.x).toBeLessThan(8);
      expect(brin.y).toBeGreaterThanOrEqual(9);
      expect(brin.y).toBeLessThan(10);
    }
  });

  it("deux cellules voisines ne portent pas le même semis", () => {
    const c = cellule(0.8, 0.1);
    const a = brinsDeLaCellule(5, 5, c, 1).map((b) => `${b.x},${b.y}`);
    const b = brinsDeLaCellule(6, 5, c, 1).map((q) => `${q.x - 1},${q.y}`);
    expect(a).not.toEqual(b);
  });

  it("rend les brins dans l'ordre du peintre", () => {
    const brins = brinsDeLaCellule(3, 4, cellule(0.9, 0.3), 1);
    for (let i = 1; i < brins.length; i++) {
      const avant = brins[i - 1];
      const apres = brins[i];
      if (!avant || !apres) continue;
      expect(avant.x + avant.y).toBeLessThanOrEqual(apres.x + apres.y);
    }
  });

  it("varie les tailles, sinon le tapis serait un pochoir", () => {
    const tailles = new Set(brinsDeLaCellule(2, 2, cellule(1, 0), 1).map((b) => b.taille));
    expect(tailles.size).toBeGreaterThan(1);
  });
});

describe("les trois matières se distinguent par leur clarté", () => {
  it("une touffe accroche la lumière, une plaque de terre l'absorbe", () => {
    expect(clarteDuMotif("touffe")).toBeGreaterThan(1);
    expect(clarteDuMotif("terre")).toBeLessThan(clarteDuMotif("feuille"));
    expect(clarteDuMotif("feuille")).toBeLessThan(clarteDuMotif("touffe"));
  });

  it("reste dans des écarts modérés : c'est de la matière, pas du contraste", () => {
    for (const motif of ["touffe", "feuille", "terre"] as const) {
      expect(Math.abs(clarteDuMotif(motif) - 1)).toBeLessThan(0.25);
    }
  });
});

describe("les paliers ne perdent pas le lien avec le moteur", () => {
  it("chaque palier d'herbe donne une part de touffes différente", () => {
    const parts = new Set<number>();
    for (let p = 0; p < NIVEAUX; p++) {
      let n = 0;
      const c = { humidite: 0, herbe: p, herbeBiomasse: 0, litiere: 0, lumiere: palier(1) };
      for (let i = 0; i < 500; i++) if (motifDuTirage(c, i / 500) === "touffe") n++;
      parts.add(n);
    }
    expect(parts.size).toBe(NIVEAUX);
  });
});

describe("la nuance : deux marques voisines ne sont pas identiques", () => {
  it("varie d'un brin à l'autre", () => {
    const nuances = new Set(brinsDeLaCellule(4, 6, cellule(0.8, 0.3), 1).map((b) => b.nuance));
    expect(nuances.size).toBeGreaterThan(1);
  });

  it("reste discrète : c'est une nuance, pas un contraste", () => {
    for (const brin of brinsDeLaCellule(4, 6, cellule(0.8, 0.3), 1)) {
      expect(Math.abs(brin.nuance - 1)).toBeLessThan(0.1);
    }
  });
});

describe("les bouts de l'échelle, là où le retour a buté", () => {
  /** Les motifs semés sur une cellule, pour un échantillon de tirages. */
  function motifs(herbe: number, litiere: number): Set<string> {
    const q = quantifier({ humidite: 0.5, herbe, herbeBiomasse: 0.3, litiereCG: litiere });
    const vus = new Set<string>();
    for (let i = 0; i < 400; i++) vus.add(motifDuTirage(q, i / 400));
    return vus;
  }

  it("**une couverture pleine ne montre AUCUNE terre nue**", () => {
    // Le critère est celui du retour, mot pour mot : « avec une densité de
    // 100 % on devrait voir une pelouse quand on zoome ». Ça n'était pas le
    // cas, et la donnée n'y était pour rien — c'était la lecture des paliers.
    // `valeurDuPalier` rend le MILIEU d'une bande, donc une couverture de 100 %
    // ressortait autour de 0,94 et les 6 % restants tombaient en terre à nu :
    // des plaques sombres semées régulièrement sur un gazon annoncé plein.
    expect(motifs(1, 0)).not.toContain("terre");
  });

  it("**une litière nulle ne sème AUCUNE feuille**", () => {
    // Le même défaut par l'autre bout, et il se voyait tout autant : une
    // pelouse sans un gramme de litière était constellée de feuilles mortes,
    // parce que le palier du bas ne vaut pas zéro non plus.
    expect(motifs(1, 0)).not.toContain("feuille");
    expect(motifs(0.5, 0)).not.toContain("feuille");
  });

  it("le sol nu reste possible quand il n'y a vraiment rien", () => {
    // La correction ne doit pas supprimer la terre à nu — elle doit la
    // réserver aux cellules qui la méritent. Sans herbe ni litière, il n'y a
    // rien d'autre à montrer.
    expect(motifs(0, 0)).toEqual(new Set(["terre"]));
  });
});
