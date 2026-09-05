/**
 * Le grain du sol.
 *
 * Deux propriétés seulement comptent vraiment ici, et aucune n'est esthétique :
 * le grain est **déterministe** — sinon une capture n'est pas reproductible et
 * un bug de rendu ne se rejoue pas (§8) — et il **ne dit rien** de l'état du
 * sol : il module la clarté de quelques pour cent, pas l'information. Un grain
 * qui deviendrait lisible comme une donnée serait un mensonge sur ce que le
 * moteur calcule.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  AMPLITUDE_GRAIN,
  amplitudeGrain,
  facteurGrain,
  GRAIN_DES_PX,
  GRAIN_PLEIN_PX,
  grain,
  MAILLE_FINE_M,
  MAILLE_LARGE_M,
} from "../../src/render/grain";

describe("le grain est déterministe", () => {
  it("rend exactement la même valeur au même endroit, toujours", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -50, max: 200, noNaN: true }),
        fc.double({ min: -50, max: 200, noNaN: true }),
        (x, y) => {
          expect(grain(x, y)).toBe(grain(x, y));
        },
      ),
    );
  });

  it("est attaché à la PARCELLE : il ne dépend ni du zoom ni de l'orientation", () => {
    // C'est ce qui l'empêche de scintiller quand on tourne autour de la
    // parcelle — le grain est dans le terrain, pas dans l'image.
    const a = grain(12.3, 45.6);
    expect(grain(12.3, 45.6)).toBe(a);
    // La signature ne prend aucune caméra : si elle en prenait une, ce test ne
    // compilerait plus, et c'est le but.
    expect(grain.length).toBe(2);
  });
});

describe("le grain ne dit rien", () => {
  it("reste borné, donc ne peut pas être lu comme une information", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1000, max: 1000, noNaN: true }),
        fc.double({ min: -1000, max: 1000, noNaN: true }),
        (x, y) => {
          const g = grain(x, y);
          expect(g).toBeGreaterThanOrEqual(-1);
          expect(g).toBeLessThanOrEqual(1);
        },
      ),
    );
  });

  it("est centré : il n'éclaircit ni n'assombrit le sol en moyenne", () => {
    // Un grain décentré déplacerait la palette entière, et la couleur ne
    // dirait plus ce que le moteur calcule.
    let somme = 0;
    let n = 0;
    for (let y = 0; y < 40; y += 0.17) {
      for (let x = 0; x < 40; x += 0.17) {
        somme += grain(x, y);
        n++;
      }
    }
    expect(Math.abs(somme / n)).toBeLessThan(0.02);
  });

  it("le facteur de clarté reste dans ±6 %, quoi qu'il arrive", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 500, noNaN: true }),
        fc.double({ min: 0, max: 500, noNaN: true }),
        fc.double({ min: 0, max: 400, noNaN: true }),
        (x, y, px) => {
          const f = facteurGrain(x, y, px);
          expect(f).toBeGreaterThanOrEqual(1 - AMPLITUDE_GRAIN);
          expect(f).toBeLessThanOrEqual(1 + AMPLITUDE_GRAIN);
        },
      ),
    );
  });
});

describe("le grain varie dans l'espace, en douceur", () => {
  it("deux points éloignés diffèrent — sinon ce n'est pas du grain", () => {
    const valeurs = new Set<number>();
    for (let i = 0; i < 60; i++) valeurs.add(grain(i * 1.3, i * 2.7));
    expect(valeurs.size).toBeGreaterThan(50);
  });

  it("deux points TRÈS proches se ressemblent : pas de bruit blanc", () => {
    // Un bruit non lissé ferait des carrés durs à la maille, ce qui
    // reproduirait la mosaïque qu'on vient de supprimer.
    for (let i = 0; i < 200; i++) {
      const x = i * 0.73;
      const y = i * 1.11;
      expect(Math.abs(grain(x, y) - grain(x + 0.01, y + 0.01))).toBeLessThan(0.1);
    }
  });

  it("ses deux mailles sont bien distinctes, fine et large", () => {
    expect(MAILLE_FINE_M).toBeLessThan(MAILLE_LARGE_M);
    // À la maille fine, deux points séparés d'une demi-maille doivent
    // franchement différer quelque part sur la parcelle.
    let ecartMax = 0;
    for (let i = 0; i < 300; i++) {
      const x = i * 0.31;
      ecartMax = Math.max(ecartMax, Math.abs(grain(x, 7) - grain(x + MAILLE_FINE_M / 2, 7)));
    }
    expect(ecartMax).toBeGreaterThan(0.15);
  });
});

describe("l'amplitude suit le zoom", () => {
  it("est nulle de loin : de près c'est de la matière, de loin ce serait du bruit", () => {
    expect(amplitudeGrain(4)).toBe(0);
    expect(amplitudeGrain(GRAIN_DES_PX)).toBe(0);
    expect(facteurGrain(3, 7, 8)).toBe(1);
  });

  it("est pleine de près, et ne dépasse jamais", () => {
    expect(amplitudeGrain(GRAIN_PLEIN_PX)).toBeCloseTo(AMPLITUDE_GRAIN, 12);
    expect(amplitudeGrain(10000)).toBeCloseTo(AMPLITUDE_GRAIN, 12);
  });

  it("monte sans saut entre les deux — un palier se verrait au zoom", () => {
    let precedent = 0;
    for (let px = GRAIN_DES_PX; px <= GRAIN_PLEIN_PX; px += 0.5) {
      const a = amplitudeGrain(px);
      expect(a).toBeGreaterThanOrEqual(precedent - 1e-12);
      expect(a - precedent).toBeLessThan(0.004);
      precedent = a;
    }
  });
});
