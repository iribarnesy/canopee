import { describe, expect, it } from "vitest";
import type { GesteSurZone } from "../../src/engine/actions";
import {
  cellulesVoilees,
  OPACITE_DU_VOILE,
  opaciteDuVoile,
  PART_QUI_S_ETALE,
  rangsDuBalayage,
  TEINTE_DU_GESTE,
} from "../../src/render/temps/voile";

const COTE = 40;

/** Un disque de cellules autour d'un centre, comme le moteur les livre. */
function disque(cx: number, cy: number, rayon: number): number[] {
  const cellules: number[] = [];
  for (let y = 0; y < COTE; y++) {
    for (let x = 0; x < COTE; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= rayon * rayon) cellules.push(y * COTE + x);
    }
  }
  return cellules;
}

const chaulage = (cellules: readonly number[]): GesteSurZone => ({ type: "chauler", cellules });

describe("opaciteDuVoile", () => {
  it("ne laisse RIEN à la fin de l'acte, à aucun rang", () => {
    // La propriété qui tient tout le module : ce qu'un geste change
    // durablement est dans la cuisson du terrain, donc le voile doit être
    // parti. S'il persistait, la même information serait dessinée deux fois.
    for (let r = 0; r <= 1.0001; r += 0.05) {
      expect(opaciteDuVoile(1, r)).toBe(0);
      expect(opaciteDuVoile(1.4, r)).toBe(0);
    }
  });

  it("ne montre rien avant le début", () => {
    for (let r = 0; r <= 1; r += 0.1) expect(opaciteDuVoile(0, r)).toBe(0);
    expect(opaciteDuVoile(-0.3, 0.5)).toBe(0);
  });

  it("allume le centre avant le bord", () => {
    // Le front part du centre de gravité : au tout début, seul le rang 0 est
    // touché. C'est ce qui distingue un travail qui progresse d'un fondu.
    const tot = 0.05;
    expect(opaciteDuVoile(tot, 0)).toBeGreaterThan(0);
    expect(opaciteDuVoile(tot, 1)).toBe(0);
  });

  it("s'allume franchement au passage du front et reste allumée", () => {
    // Le travail est fait, on doit le voir : une cellule ne s'éteint pas
    // derrière le front. Le premier jet l'éteignait, et la zone se lisait
    // comme une onde de choc au lieu d'une surface travaillée.
    const rang = 0.5;
    const arrivee = rang * PART_QUI_S_ETALE;
    expect(opaciteDuVoile(arrivee - 1e-4, rang)).toBe(0);
    expect(opaciteDuVoile(arrivee + 1e-4, rang)).toBeCloseTo(OPACITE_DU_VOILE, 4);
    // toujours allumée à pleine couverture
    expect(opaciteDuVoile(PART_QUI_S_ETALE, rang)).toBeCloseTo(OPACITE_DU_VOILE, 6);
  });

  it("couvre toute la zone à `PART_QUI_S_ETALE`, bord compris", () => {
    expect(opaciteDuVoile(PART_QUI_S_ETALE, 1)).toBeCloseTo(OPACITE_DU_VOILE, 6);
    expect(opaciteDuVoile(PART_QUI_S_ETALE - 0.05, 1)).toBe(0);
  });

  it("retombe ensemble sur la fin de l'acte", () => {
    // La poussière se dépose partout à la fois : deux rangs très différents
    // ont la même opacité pendant la retombée.
    const tard = PART_QUI_S_ETALE + (1 - PART_QUI_S_ETALE) / 2;
    expect(opaciteDuVoile(tard, 0.1)).toBeCloseTo(opaciteDuVoile(tard, 0.95), 6);
    expect(opaciteDuVoile(tard, 0.5)).toBeLessThan(OPACITE_DU_VOILE);
    expect(opaciteDuVoile(tard, 0.5)).toBeGreaterThan(0);
  });

  it("ne dépasse jamais l'opacité annoncée", () => {
    for (let a = 0; a <= 1; a += 0.01) {
      for (let r = 0; r <= 1; r += 0.05) {
        const o = opaciteDuVoile(a, r);
        expect(o).toBeGreaterThanOrEqual(0);
        expect(o).toBeLessThanOrEqual(OPACITE_DU_VOILE);
      }
    }
  });
});

describe("rangsDuBalayage", () => {
  it("met le centre du disque au rang 0 et son bord au rang 1", () => {
    const cellules = disque(20, 20, 8);
    const rangs = rangsDuBalayage(chaulage(cellules), COTE);
    // **Le rang minimal n'est pas zéro et ne peut pas l'être** : le centre de
    // gravité d'un disque pair tombe sur un coin de cellule, pas sur un
    // centre. La cellule la plus proche est donc à une demi-diagonale, et le
    // rang le dit une fois rapporté à la cellule la plus lointaine. On calcule
    // les deux ici plutôt que de desserrer la tolérance : une borne molle
    // aurait laissé passer un centre de gravité faux.
    let loin = 0;
    for (const c of cellules) {
      loin = Math.max(loin, Math.hypot((c % COTE) - 19.5, Math.floor(c / COTE) - 19.5));
    }
    expect(Math.min(...rangs)).toBeCloseTo(Math.hypot(0.5, 0.5) / loin, 6);
    expect(Math.max(...rangs)).toBeCloseTo(1, 6);
  });

  it("rend un tableau parallèle aux cellules, dans le même ordre", () => {
    const cellules = disque(20, 20, 5);
    const rangs = rangsDuBalayage(chaulage(cellules), COTE);
    expect(rangs.length).toBe(cellules.length);
    // La cellule la plus loin du centre de gravité doit porter le rang le plus
    // élevé : c'est ce parallélisme que le lecteur exploite sans réindexer.
    let pire = 0;
    let pireRang = -1;
    for (let i = 0; i < cellules.length; i++) {
      const c = cellules[i] ?? 0;
      const d = Math.hypot((c % COTE) - 20, Math.floor(c / COTE) - 20);
      if (d > pire) {
        pire = d;
        pireRang = rangs[i] ?? -1;
      }
    }
    expect(pireRang).toBeCloseTo(1, 6);
  });

  it("ne divise pas par zéro sur une cellule unique", () => {
    const rangs = rangsDuBalayage(chaulage([17 * COTE + 3]), COTE);
    expect(rangs.length).toBe(1);
    expect(Number.isFinite(rangs[0] ?? Number.NaN)).toBe(true);
    // Rien à balayer : la cellule s'allume dès le début de l'acte.
    expect(opaciteDuVoile(0.05, rangs[0] ?? 0)).toBeGreaterThan(0);
  });

  it("accepte un geste vide sans se plaindre", () => {
    expect(rangsDuBalayage(chaulage([]), COTE).length).toBe(0);
  });
});

describe("cellulesVoilees", () => {
  it("remplit la zone au lieu d'en éclairer un anneau", () => {
    const cellules = disque(20, 20, 15);
    const geste = chaulage(cellules);
    const rangs = rangsDuBalayage(geste, COTE);
    // à mi-étalement, le disque intérieur est couvert et le bord pas encore
    const milieu = cellulesVoilees(geste, rangs, PART_QUI_S_ETALE / 2);
    expect(milieu.length).toBeGreaterThan(cellules.length * 0.15);
    expect(milieu.length).toBeLessThan(cellules.length);
    // à pleine couverture, TOUTES les cellules nommées sont peintes
    expect(cellulesVoilees(geste, rangs, PART_QUI_S_ETALE).length).toBe(cellules.length);
  });

  it("balaie tout le disque au fil de l'acte", () => {
    // Chaque cellule doit être passée sous le front au moins une fois, sinon
    // le geste laisse des trous non montrés.
    const cellules = disque(20, 20, 10);
    const geste = chaulage(cellules);
    const rangs = rangsDuBalayage(geste, COTE);
    const vues = new Set<number>();
    for (const c of cellulesVoilees(geste, rangs, PART_QUI_S_ETALE)) vues.add(c.cellule);
    expect(vues.size).toBe(cellules.length);
  });

  it("porte la teinte du geste et rien d'autre", () => {
    const geste: GesteSurZone = { type: "labourer", cellules: disque(20, 20, 4) };
    const rangs = rangsDuBalayage(geste, COTE);
    const painted = cellulesVoilees(geste, rangs, 0.4);
    expect(painted.length).toBeGreaterThan(0);
    for (const c of painted) expect(c.teinte).toEqual(TEINTE_DU_GESTE.labourer);
  });

  it("rend un tableau vide à la fin, quel que soit le geste", () => {
    for (const type of Object.keys(TEINTE_DU_GESTE) as (keyof typeof TEINTE_DU_GESTE)[]) {
      const geste: GesteSurZone = { type, cellules: disque(20, 20, 6) };
      const rangs = rangsDuBalayage(geste, COTE);
      expect(cellulesVoilees(geste, rangs, 1).length).toBe(0);
      expect(cellulesVoilees(geste, rangs, 0).length).toBe(0);
    }
  });

  it("ne sort jamais d'une cellule que le moteur n'a pas nommée", () => {
    // Le rendu n'invente pas de cellule travaillée : c'est la règle n° 1 du
    // §0, et c'est vérifiable ici sans détour.
    const cellules = disque(12, 30, 7);
    const geste = chaulage(cellules);
    const rangs = rangsDuBalayage(geste, COTE);
    const permises = new Set(cellules);
    for (let a = 0; a <= 1; a += 0.02) {
      for (const c of cellulesVoilees(geste, rangs, a)) {
        expect(permises.has(c.cellule)).toBe(true);
      }
    }
  });
});
