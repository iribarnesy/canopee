/**
 * **Le geai ne vient que là où le moteur dit qu'il a caché un gland** (#129).
 *
 * Ce qu'on défend : il ne visite que les semis des espèces que la fiche du
 * moteur dit disséminées par le geai ; il se pose **sur** le semis, pas à côté ;
 * il repart, et la visite finit ; et il n'y en a jamais assez pour faire un
 * vol d'étourneaux.
 */

import { describe, expect, it } from "vitest";
import { getEspece } from "../../src/engine/especes";
import type { NaissanceDeLaSemaine } from "../../src/engine/tick";
import { MAX_GEAIS, posesDesGeais, visitesDuGeai } from "../../src/render/faune/geai";

/** La lecture de la fiche, comme le jeu la fait. */
const parLeGeai = (id: string) => getEspece(id).regeneration.dissemination === "geai";

function semis(id: number, especeId: string, x: number, y: number): NaissanceDeLaSemaine {
  return { id, especeId, x, y, heightM: 0.05 };
}

describe("à quels semis", () => {
  it("seulement aux espèces que la fiche dit disséminées par le geai", () => {
    const v = visitesDuGeai(
      [semis(1, "quercus_pubescens", 30, 30), semis(2, "betula_pendula", 60, 60)],
      parLeGeai,
      100,
      0,
    );
    expect(v.map((x) => x.cle)).toEqual(["geai:1"]);
  });

  it("aucun geai une année sans gland levé", () => {
    expect(visitesDuGeai([semis(2, "betula_pendula", 60, 60)], parLeGeai, 100, 0)).toEqual([]);
  });

  it("jamais plus que le plafond, et jamais deux sur le même coin", () => {
    const beaucoup = Array.from({ length: 40 }, (_, i) =>
      semis(i, "quercus_pubescens", 5 + (i % 8) * 12, 5 + Math.floor(i / 8) * 12),
    );
    const v = visitesDuGeai(beaucoup, parLeGeai, 100, 0);
    expect(v).toHaveLength(MAX_GEAIS);
    for (const a of v) {
      for (const b of v) {
        if (a !== b)
          expect(Math.hypot(a.semis.x - b.semis.x, a.semis.y - b.semis.y)).toBeGreaterThanOrEqual(
            10,
          );
      }
    }
  });

  it("le même instantané donne les mêmes visites", () => {
    const n = [semis(3, "juglans_regia", 20, 70), semis(4, "corylus_avellana", 80, 20)];
    expect(visitesDuGeai(n, parLeGeai, 100, 500)).toEqual(
      visitesDuGeai([...n].reverse(), parLeGeai, 100, 500),
    );
  });
});

describe("la visite", () => {
  const [v] = visitesDuGeai([semis(1, "quercus_pubescens", 40, 55)], parLeGeai, 100, 1000);

  it("arrive, se pose sur le semis, fouille, et repart", () => {
    expect(v).toBeDefined();
    if (!v) return;
    const au = (t: number) => posesDesGeais([v], t)[0];
    expect(au(v.arriveeMs - 1)).toBeUndefined();
    expect(au(v.arriveeMs + 10)?.geste).toBe("vol");
    const pose = au((v.poseMs + v.repartMs) / 2);
    expect(pose?.hauteurM).toBe(0);
    expect(Math.hypot((pose?.x ?? 0) - 40, (pose?.y ?? 0) - 55)).toBeLessThan(0.5);
    const fouilles = new Set<string>();
    for (let t = v.poseMs; t < v.repartMs; t += 100) fouilles.add(au(t)?.geste ?? "");
    expect(fouilles.has("fouille")).toBe(true);
    expect(au(v.repartMs + 50)?.geste).toBe("vol");
    expect(au(v.finMs)).toBeUndefined();
  });

  it("ne saute jamais d'une image à l'autre", () => {
    if (!v) return;
    let avant: { x: number; y: number; hauteurM: number } | undefined;
    for (let t = v.arriveeMs; t < v.finMs; t += 50) {
      const p = posesDesGeais([v], t)[0];
      if (p && avant) {
        expect(Math.hypot(p.x - avant.x, p.y - avant.y, p.hauteurM - avant.hauteurM)).toBeLessThan(
          1,
        );
      }
      avant = p;
    }
  });
});
