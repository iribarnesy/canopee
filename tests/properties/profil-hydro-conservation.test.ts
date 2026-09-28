/**
 * Conservation de l'eau au niveau du **profil** stratifié (docs/regles.md §16).
 *
 * Le bilan d'une cellule était testé (water-conservation.test.ts) mais pas
 * celui du profil à plusieurs horizons, et il fuyait : ce qu'un horizon ne
 * pouvait pas laisser descendre dans la semaine était simplement perdu. Sur
 * une pluie ordinaire ça ne se voyait pas ; sur un orage tombant sur un sol
 * saturé — ou sur l'eau arrivant d'un grand bassin d'amont — la moitié de
 * l'eau disparaissait du bilan au lieu de ruisseler.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type HorizonHydro, profilHydro } from "../../src/engine/water";

const horizonArb = fc.record({
  ruMm: fc.double({ min: 5, max: 150, noNaN: true }),
  porositeMm: fc.double({ min: 1, max: 60, noNaN: true }),
  conductiviteMm: fc.double({ min: 0.1, max: 2000, noNaN: true }),
  epaisseurCm: fc.double({ min: 5, max: 80, noNaN: true }),
});

const casArb = fc
  .record({
    horizons: fc.array(horizonArb, { minLength: 1, maxLength: 4 }),
    remplissage: fc.array(fc.double({ min: 0, max: 1, noNaN: true }), {
      minLength: 4,
      maxLength: 4,
    }),
    saturation: fc.array(fc.double({ min: 0, max: 1, noNaN: true }), {
      minLength: 4,
      maxLength: 4,
    }),
    // Jusqu'à 250 mm : un orage cévenol, ou l'apport d'un bassin d'amont.
    rainMm: fc.double({ min: 0, max: 250, noNaN: true }),
    evapDemandMm: fc.double({ min: 0, max: 30, noNaN: true }),
    nappeMm: fc.double({ min: 0, max: 25, noNaN: true }),
    drainageExterneMm: fc.double({ min: 0, max: 60, noNaN: true }),
    nappeProfondeurCm: fc.oneof(
      fc.constant(Number.POSITIVE_INFINITY),
      fc.double({ min: 0, max: 300, noNaN: true }),
    ),
  })
  .map((c) => ({
    ...c,
    eauMm: c.horizons.map((h, i) => h.ruMm * (c.remplissage[i] ?? 0)),
    excesMm: c.horizons.map((h, i) => h.porositeMm * (c.saturation[i] ?? 0)),
  }));

function stock(eauMm: readonly number[], excesMm: readonly number[]): number {
  return eauMm.reduce((s, v) => s + v, 0) + excesMm.reduce((s, v) => s + v, 0);
}

describe("bilan hydrique d'un profil stratifié", () => {
  it("pluie + nappe = évaporation + drainage + ruissellement + Δstock", () => {
    fc.assert(
      fc.property(casArb, (c) => {
        const avant = stock(c.eauMm, c.excesMm);
        const out = profilHydro(c as { horizons: HorizonHydro[] } & typeof c);
        const delta = stock(out.eauMm, out.excesMm) - avant;
        expect(out.evapMm + out.drainageMm + out.overflowMm + delta).toBeCloseTo(
          c.rainMm + out.nappeMm,
          6,
        );
      }),
      { numRuns: 3000 },
    );
  });

  it("aucun horizon ne dépasse sa capacité, aucun flux n'est négatif", () => {
    fc.assert(
      fc.property(casArb, (c) => {
        const out = profilHydro(c as { horizons: HorizonHydro[] } & typeof c);
        c.horizons.forEach((h, i) => {
          expect(out.eauMm[i] ?? 0).toBeGreaterThanOrEqual(-1e-9);
          expect(out.eauMm[i] ?? 0).toBeLessThanOrEqual(h.ruMm + 1e-6);
          expect(out.excesMm[i] ?? 0).toBeGreaterThanOrEqual(-1e-9);
          expect(out.excesMm[i] ?? 0).toBeLessThanOrEqual(h.porositeMm + 1e-6);
        });
        expect(out.overflowMm).toBeGreaterThanOrEqual(-1e-9);
        expect(out.drainageMm).toBeGreaterThanOrEqual(-1e-9);
        expect(out.evapMm).toBeGreaterThanOrEqual(-1e-9);
      }),
      { numRuns: 3000 },
    );
  });

  it("un orage sur sol saturé ruisselle en entier au lieu de disparaître", () => {
    const horizons: HorizonHydro[] = [
      { ruMm: 60, porositeMm: 30, conductiviteMm: 50, epaisseurCm: 30 },
      { ruMm: 90, porositeMm: 45, conductiviteMm: 30, epaisseurCm: 55 },
    ];
    const out = profilHydro({
      horizons,
      eauMm: [60, 90],
      excesMm: [30, 45],
      rainMm: 200,
      evapDemandMm: 0,
      nappeMm: 0,
      drainageExterneMm: 5,
    });
    // Sol plein : tout part en surface, à ce que l'exutoire évacue près.
    expect(out.overflowMm).toBeGreaterThan(190);
  });
});

describe("un fond mince ne bouche pas le profil (#263)", () => {
  const h = (ruMm: number, porositeMm: number, conductiviteMm: number): HorizonHydro =>
    ({ ruMm, porositeMm, conductiviteMm, epaisseurCm: 30 }) as HorizonHydro;

  /** Régime permanent d'un plateau à drainage libre qu'on arrose chaque semaine. */
  function regime(horizons: HorizonHydro[], pluieMm: number, semaines = 60) {
    let r = {
      eauMm: horizons.map(() => 0),
      excesMm: horizons.map(() => 0),
      evapMm: 0,
      drainageMm: 0,
      overflowMm: 0,
      nappeMm: 0,
      engorgementParHorizon: horizons.map(() => 0),
    };
    for (let s = 0; s < semaines; s++) {
      r = profilHydro(
        {
          horizons,
          eauMm: r.eauMm,
          excesMm: r.excesMm,
          rainMm: pluieMm,
          evapDemandMm: 0,
          nappeMm: 0,
          drainageExterneMm: Number.POSITIVE_INFINITY,
        },
        r,
      );
    }
    return r;
  }

  const SURFACE = h(70, 25, 120);
  const SOUS = h(69, 40, 120);

  it("cinq centimètres de sable sous un limon ne noient pas la surface", () => {
    // **le fait qui a ouvert l'issue**, et il était spectaculaire : glisser un
    // horizon de cinq centimètres — du sable, le matériau le plus filtrant du
    // catalogue — sous un plateau bien drainé engorgeait le profil **du haut en
    // bas** et tuait tous les hêtres en quarante ans. Cinq centimètres de sable
    // ne peuvent pas noyer un plateau.
    //
    // La cause n'était pas le sable : c'était que le ressuyage ne faisait
    // descendre l'eau que d'un horizon par semaine, et qu'un fond mince, une
    // fois plein, ne laissait plus de place à celui du dessus.
    const fondMince = h(7, 7, 1200);
    const avec = regime([SURFACE, SOUS, fondMince], 20);
    expect(avec.engorgementParHorizon[0] ?? 1).toBe(0);
  });

  it("et le profil s'écoule à ce que son fond CONDUIT, pas à ce qu'il contient", () => {
    // Le même profil, avec un fond mince et un fond épais **de même
    // conductivité** : à pluie égale, ils doivent évacuer la même chose. Avant
    // le correctif, le mince plafonnait aux sept millimètres qu'il détenait.
    const mince = regime([SURFACE, SOUS, h(7, 7, 1200)], 20);
    const epais = regime([SURFACE, SOUS, h(90, 130, 1200)], 20);
    expect(mince.drainageMm).toBeCloseTo(epais.drainageMm, 6);
  });

  it("un plateau à drainage libre ne garde pas d'eau gravitaire d'une semaine sur l'autre", () => {
    // **Et c'est là que la correction cesse d'être neutre, il faut le dire.**
    // Avant, l'horizon de fond des sept stations du dépôt vivait à 50-62 % de
    // saturation en permanence : ce qu'il recevait du dessus attendait la
    // semaine suivante pour sortir. Un plateau dont l'exutoire est libre revient
    // à la capacité au champ en quelques jours, pas en plusieurs semaines.
    for (const pluie of [20, 60]) {
      const r = regime([SURFACE, SOUS], pluie);
      for (const [i, e] of r.engorgementParHorizon.entries()) {
        expect(e, `horizon ${i}, pluie ${pluie} mm/sem`).toBe(0);
      }
    }
  });

  it("mais un exutoire fermé engorge toujours : le correctif ne débouche pas un fond de vallée", () => {
    // Le contrôle qui dit que la correction n'a pas simplement supprimé
    // l'engorgement. Ce qui retenait l'eau d'un fond de vallée n'est pas la
    // vidange interne, c'est l'exutoire — et lui n'a pas bougé.
    let r = {
      eauMm: [0, 0],
      excesMm: [0, 0],
      evapMm: 0,
      drainageMm: 0,
      overflowMm: 0,
      nappeMm: 0,
      engorgementParHorizon: [0, 0],
    };
    for (let s = 0; s < 60; s++) {
      r = profilHydro(
        {
          horizons: [SURFACE, SOUS],
          eauMm: r.eauMm,
          excesMm: r.excesMm,
          rainMm: 20,
          evapDemandMm: 0,
          nappeMm: 0,
          drainageExterneMm: 5,
        },
        r,
      );
    }
    expect(r.engorgementParHorizon[0] ?? 0).toBeGreaterThan(0.5);
  });
});
