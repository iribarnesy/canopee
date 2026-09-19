/**
 * L'EMPRISE VISIBLE FACE AU RELIEF (#151).
 *
 * Retour de partie : sur un terrain en pente, en zoomant, des carrés de rendu
 * disparaissent. Le découpage par emprise visible est ce qui décide quels
 * morceaux de sol sont cuits et posés ; une cellule exclue à tort est un trou
 * à l'écran.
 *
 * **La propriété est simple à énoncer et suffit à tout** : si le centre d'une
 * cellule, à SON altitude, se projette dans le cadre, alors cette cellule doit
 * être dans l'emprise. Ces essais la vérifient par balayage exhaustif de la
 * parcelle plutôt que sur quelques cas choisis — un trou de rendu est par
 * nature un cas qu'on n'avait pas choisi.
 *
 * **Les altitudes sont des ÉCARTS autour de zéro**, mesuré sur les stations
 * livrées : de −2 à +2 m. Le relief pousse donc dans les DEUX sens, alors que
 * la hauteur d'un arbre ne pousse que vers le haut. C'est ce qui fait qu'une
 * marge appliquée d'un seul côté ne peut pas suffire.
 */

import { describe, expect, it } from "vitest";
import {
  celluleVisibles,
  type Vue,
  versEcranVue,
  vueInitiale,
  zoomer,
} from "../../src/render/camera";
import { amplitudeDuRelief } from "../../src/render/couches/terrain";

const COTE = 100;
const LARGEUR = 1600;
const HAUTEUR = 900;

/** Une vue zoomée sur un point de la parcelle — le cas où L0 place la rupture. */
function vueZoomee(crans: number, curseur = { sx: LARGEUR / 2, sy: HAUTEUR / 2 }): Vue {
  let v = vueInitiale(COTE, LARGEUR, HAUTEUR);
  for (let i = 0; i < crans; i++) v = zoomer(v, 1.18, curseur, 2);
  return v;
}

/**
 * Un relief en pente régulière, en écarts autour de zéro — la forme que
 * `altitudeParCellule` produit pour une station pentue.
 */
function pente(amplitudeM: number): (x: number, y: number) => number {
  return (x, y) => ((x + y) / (2 * COTE) - 0.5) * 2 * amplitudeM;
}

/** Les cellules dont le centre, à leur altitude, tombe dans le cadre. */
function cellulesAuCadre(v: Vue, altitude: (x: number, y: number) => number) {
  const dedans: { x: number; y: number }[] = [];
  for (let y = 0; y < COTE; y++) {
    for (let x = 0; x < COTE; x++) {
      const e = versEcranVue({ x: x + 0.5, y: y + 0.5, z: altitude(x, y) }, v);
      if (e.sx >= 0 && e.sx <= LARGEUR && e.sy >= 0 && e.sy <= HAUTEUR) dedans.push({ x, y });
    }
  }
  return dedans;
}

describe("aucune cellule visible n'est exclue de l'emprise", () => {
  for (const amplitude of [0, 1, 2, 5]) {
    for (const crans of [0, 6, 12]) {
      it(`pente de ±${amplitude} m, ${crans} crans de zoom`, () => {
        const v = vueZoomee(crans);
        const alt = pente(amplitude);
        // La marge que l'appelant doit annoncer : l'amplitude du relief, et
        // rien d'autre ici (pas d'arbres dans cet essai).
        const e = celluleVisibles(v, 0, amplitude);
        expect(e).toBeDefined();
        if (!e) return;
        const oubliees = cellulesAuCadre(v, alt).filter(
          (c) => c.x < e.x0 || c.x > e.x1 || c.y < e.y0 || c.y > e.y1,
        );
        expect(oubliees).toEqual([]);
      });
    }
  }

  /**
   * Le cas qui casse, et pourquoi il casse : un CREUX. Une cellule enfoncée se
   * projette plus BAS à l'écran, donc une cellule qui serait hors cadre par le
   * haut y rentre — et c'est du côté `x0`/`y0` de l'emprise, celui qui n'avait
   * qu'une cellule de marge.
   */
  it("un creux ramène dans le cadre des cellules qui en sortaient par le haut", () => {
    const v = vueZoomee(10);
    const creux = (x: number, y: number) => (x + y < COTE ? -4 : 0);
    const e = celluleVisibles(v, 0, 4);
    expect(e).toBeDefined();
    if (!e) return;
    const oubliees = cellulesAuCadre(v, creux).filter(
      (c) => c.x < e.x0 || c.x > e.x1 || c.y < e.y0 || c.y > e.y1,
    );
    expect(oubliees).toEqual([]);
  });

  /**
   * **La moitié du défaut était chez l'APPELANT**, et corriger la marge ne
   * servait à rien tant qu'on lui passait zéro : les quatre appels du terrain
   * demandaient l'emprise sans annoncer le moindre relief. Cet essai fixe
   * l'obligation — avec zéro le trou revient, avec l'amplitude il disparaît —
   * pour qu'un appelant qui l'oublierait de nouveau tombe ici.
   */
  it("l'appelant doit annoncer son relief : à zéro, le trou revient", () => {
    const v = vueZoomee(6);
    const alt = pente(5);
    const grille = Array.from({ length: COTE * COTE }, (_, i) =>
      alt(i % COTE, Math.floor(i / COTE)),
    );
    const visibles = cellulesAuCadre(v, alt);
    const dehors = (e: ReturnType<typeof celluleVisibles>) =>
      e ? visibles.filter((c) => c.x < e.x0 || c.x > e.x1 || c.y < e.y0 || c.y > e.y1).length : -1;

    expect(amplitudeDuRelief(grille)).toBeCloseTo(5, 1);
    expect(dehors(celluleVisibles(v, 0, 0))).toBeGreaterThan(0);
    expect(dehors(celluleVisibles(v, 0, amplitudeDuRelief(grille)))).toBe(0);
  });

  /**
   * L'autre bout : l'emprise ne doit pas se mettre à rendre la parcelle
   * entière pour autant, sinon on a réglé les trous en défaisant ce que L0
   * avait mesuré.
   */
  it("et l'emprise reste franchement restreinte au zoom rapproché", () => {
    const v = vueZoomee(12);
    const e = celluleVisibles(v, 20, 2);
    expect(e).toBeDefined();
    if (!e) return;
    const cellules = (e.x1 - e.x0 + 1) * (e.y1 - e.y0 + 1);
    expect(cellules).toBeLessThan(COTE * COTE * 0.5);
  });
});
