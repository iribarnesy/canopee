/**
 * **La taille du bassin amont se voit** (#150, seconde moitié).
 *
 * Un bassin de 5 % et un de 100 % donnaient exactement le même paysage : la
 * grandeur existait dans la partie — c'est un curseur de l'écran de départ —
 * et n'arrivait pas jusqu'au décor.
 *
 * **Ce qui se dessine est une crête**, et c'est une lecture, pas une vérité.
 * Le moteur donne une surface amont et rien d'autre ; une surface ne dit pas
 * une forme. On la lit comme une bande de la largeur de la parcelle, ce qui
 * donne une distance en amont au-delà de laquelle le sol cesse de monter.
 * L'arbitrage a été demandé sur l'issue avant d'écrire la moindre ligne.
 *
 * Ces épreuves tiennent la lecture : la distance, le plateau au-delà, l'aval
 * qu'on ne touche pas, et surtout le cas zéro — une parcelle sans amont est
 * une parcelle de crête, et elle doit en avoir l'air.
 */

import { describe, expect, it } from "vitest";
import { altitudeParCellule } from "../../src/engine/relief";
import {
  altitudeDecor,
  altitudeMoyenneParcelle,
  distanceDeLaCrete,
  penteMoyenne,
} from "../../src/render/couches/decor";

const COTE = 100;
const PENTE_PCT = 6;

/**
 * Un versant exposé au sud : l'altitude croît avec `y`, donc **l'amont est du
 * côté des grands `y`** — vérifié, pas supposé, par l'épreuve qui suit.
 */
function terrain(pentePct = PENTE_PCT) {
  return altitudeParCellule(
    { altitudeM: 100, pentePct, expositionDeg: 180, forme: "plan", bassinAmontHa: 0 },
    { widthM: COTE, heightM: COTE },
  );
}

function decor(bassinAmontHa?: number, pentePct = PENTE_PCT) {
  const alt = terrain(pentePct);
  const moyenne = altitudeMoyenneParcelle(alt, COTE);
  const pente = penteMoyenne(alt, COTE);
  return (x: number, y: number) => altitudeDecor(alt, COTE, moyenne, x, y, pente, bassinAmontHa);
}

describe("la distance de la crête", () => {
  it("est la surface amont étalée sur la largeur de la parcelle", () => {
    // Cinq hectares versant sur cent mètres de côté : cinq cents mètres.
    expect(distanceDeLaCrete(5, 100)).toBe(500);
    expect(distanceDeLaCrete(0.5, 100)).toBe(50);
    // Même surface, parcelle deux fois plus étroite : deux fois plus long.
    expect(distanceDeLaCrete(5, 50)).toBe(1000);
  });

  it("est nulle quand rien ne verse d'en haut", () => {
    expect(distanceDeLaCrete(0, 100)).toBe(0);
  });

  it("grandit avec le bassin, sans exception", () => {
    let precedente = -1;
    for (const ha of [0, 0.3, 0.5, 1, 6, 20]) {
      const d = distanceDeLaCrete(ha, COTE);
      expect(d).toBeGreaterThan(precedente);
      precedente = d;
    }
  });
});

describe("l'amont monte puis s'arrête", () => {
  it("l'amont est bien du côté des grands y sur un versant sud", () => {
    // Le contrôle qui rend lisibles tous les essais suivants : sans lui, une
    // épreuve qui teste l'aval en croyant tester l'amont passerait.
    const z = decor();
    expect(z(50, COTE + 100)).toBeGreaterThan(z(50, -100));
  });

  it("monte à la pente de la parcelle tant qu'on est en deçà de la crête", () => {
    // 6 ha sur 100 m : crête à 600 m. À 200 m on monte encore librement.
    const z = decor(6);
    const libre = decor();
    expect(z(50, COTE + 200)).toBeCloseTo(libre(50, COTE + 200), 10);
  });

  it("cesse de monter au-delà de la crête", () => {
    // 1 ha sur 100 m : crête à 100 m en amont.
    const z = decor(1);
    const sommet = z(50, COTE + 100);
    expect(z(50, COTE + 300)).toBeCloseTo(sommet, 10);
    expect(z(50, COTE + 2000)).toBeCloseTo(sommet, 10);
    // Et le sommet est bien la pente appliquée sur cent mètres.
    const base = z(50, COTE);
    expect(sommet - base).toBeCloseTo((PENTE_PCT / 100) * 100, 6);
  });

  it("un grand bassin fait monter plus haut qu'un petit, au même endroit", () => {
    const loin = COTE + 400;
    const petit = decor(0.5)(50, loin);
    const moyen = decor(2)(50, loin);
    const grand = decor(20)(50, loin);
    expect(moyen).toBeGreaterThan(petit);
    expect(grand).toBeGreaterThan(moyen);
  });
});

describe("ce qu'on ne touche pas", () => {
  it("l'aval descend comme avant, quel que soit le bassin", () => {
    // Personne ne dit où le pays s'arrête de descendre : une crête en aval
    // serait une affirmation, et une affirmation sans source.
    const libre = decor();
    for (const ha of [0, 0.5, 6, 100]) {
      const z = decor(ha);
      for (const y of [-20, -200, -1000]) {
        expect(z(50, y), `${ha} ha, y=${y}`).toBeCloseTo(libre(50, y), 10);
      }
    }
  });

  it("sans bassin connu, le décor est exactement celui d'avant", () => {
    // Le banc d'aperçu ne transporte pas la grandeur : il doit rendre ce qu'il
    // rendait, et non une plaine surgie d'un `undefined` mal lu.
    const libre = decor(undefined);
    const alt = terrain();
    const moyenne = altitudeMoyenneParcelle(alt, COTE);
    const pente = penteMoyenne(alt, COTE);
    for (const y of [-300, -50, 50, COTE + 50, COTE + 300]) {
      expect(libre(50, y)).toBeCloseTo(altitudeDecor(alt, COTE, moyenne, 50, y, pente), 12);
    }
  });

  it("l'intérieur de la parcelle reste celui du moteur", () => {
    // Le décor ne dessine pas la parcelle, mais la fonction accepte des points
    // dedans : le débordement y est nul, donc rien à plafonner.
    const alt = terrain();
    const moyenne = altitudeMoyenneParcelle(alt, COTE);
    const pente = penteMoyenne(alt, COTE);
    for (const ha of [0, 6]) {
      for (const [x, y] of [
        [10, 10],
        [50, 50],
        [90, 90],
      ] as const) {
        expect(altitudeDecor(alt, COTE, moyenne, x, y, pente, ha)).toBeCloseTo(
          altitudeDecor(alt, COTE, moyenne, x, y, pente),
          12,
        );
      }
    }
  });
});

describe("la parcelle de crête", () => {
  it("sans amont du tout, le haut est plat et le bas descend", () => {
    // C'est la lande sèche livrée : `bassinAmontHa` à zéro. Rien ne verse
    // chez elle parce qu'elle est au sommet, et c'est ce qu'on doit voir.
    const z = decor(0);
    const bord = z(50, COTE);
    expect(z(50, COTE + 50)).toBeCloseTo(bord, 10);
    expect(z(50, COTE + 500)).toBeCloseTo(bord, 10);
    expect(z(50, -50)).toBeLessThan(bord - 1);
  });

  it("et sur une station plate, le bassin ne fabrique aucun relief", () => {
    // Une crête n'a de sens que sur une pente : à plat, plafonner zéro par
    // zéro ne doit rien produire.
    const plat = decor(0, 0);
    const grand = decor(50, 0);
    for (const y of [-200, COTE + 200]) {
      expect(plat(50, y)).toBeCloseTo(grand(50, y), 10);
    }
  });
});
