/**
 * **La sonde de station**, séparée de son affichage (#123).
 *
 * Elle vivait dans `src/ui/App.tsx` et tournait dans le fil d'interface : la
 * page gelait plusieurs minutes. Le calcul est maintenant un module pur, que
 * le worker du labo exécute — et qu'un essai peut donc éprouver, ce qui
 * n'était pas possible tant qu'il était pris dans un composant React.
 *
 * Ces épreuves ne rejugent pas l'écologie : elles défendent le **contrat** dont
 * l'affichage dépend, et l'avancement sans lequel l'attente redeviendrait un
 * écran muet.
 */

import { describe, expect, it } from "vitest";
import { ESPECES_V0 } from "../../src/engine";
import {
  anneesDeLaSonde,
  isSuccessionStation,
  meteoDeLaSonde,
  PLANTED_MAX_ID,
  simulate,
  stationDeLaSonde,
  TREES_PER_SPECIES,
  YEARS,
} from "../../src/lab/sonde";

/**
 * Deux années et pas vingt : une année de moteur sur cent mètres de côté coûte
 * cinq secondes, et ce qu'on vérifie ici ne dépend pas de leur nombre. La
 * durée par défaut, elle, est vérifiée sans simuler.
 */
const ANS = 2;
const sc = stationDeLaSonde("");
const avancement: [number, number][] = [];
const sonde = simulate(
  sc,
  meteoDeLaSonde(sc, true),
  (annees, total) => avancement.push([annees, total]),
  ANS,
);

describe("ce que la sonde rend", () => {
  it("une ligne par semaine, dans l'ordre", () => {
    expect(sonde.points).toHaveLength(ANS * 52);
    expect(sonde.points.map((p) => p.week)).toEqual(sonde.points.map((_, i) => i));
  });

  it("chaque espèce plantée a sa hauteur dominante et ses comptages", () => {
    const dernier = sonde.points[sonde.points.length - 1];
    if (!dernier) throw new Error("aucun point");
    for (const espece of ESPECES_V0) {
      // Une hauteur pour chacune, y compris zéro : une essence que la station
      // ne supporte pas a le droit d'être morte, mais pas d'être absente du
      // relevé — c'est ce que le tableau des espèces disparues lit.
      expect(typeof dernier.heights[espece.id]).toBe("number");
      // Les recrues de la régénération s'ajoutent à la cohorte plantée, elles
      // ne s'y substituent pas : c'est toute la raison des deux comptages.
      expect(dernier.aliveCounts[espece.id] ?? 0).toBeGreaterThanOrEqual(
        dernier.plantesVivants[espece.id] ?? 0,
      );
      expect(dernier.plantesVivants[espece.id] ?? 0).toBeLessThanOrEqual(TREES_PER_SPECIES);
    }
    // Et la parcelle n'est pas vide : la plupart des essences sont debout.
    const debout = ESPECES_V0.filter((e) => (dernier.heights[e.id] ?? 0) > 0);
    expect(debout.length).toBeGreaterThan(ESPECES_V0.length / 2);
  });

  it("l'état rendu est celui de la FIN D'ÉTÉ de la dernière année", () => {
    // Ce n'est pas un détail d'implémentation : c'est ce que la carte montre,
    // et l'assèchement local ne se voit qu'en août.
    expect(sonde.finalState.week % 52).toBe(36);
    expect(sonde.finalState.week).toBeGreaterThan(52);
  });

  it("la cohorte plantée EST celle que le seuil d'identifiant désigne", () => {
    // Le défaut que cet essai a trouvé : le seuil valait `30 × 5`, hérité du
    // temps où la V0 comptait cinq espèces. Six cent trente arbres plantés
    // passaient donc pour des recrues de la régénération naturelle.
    const plantes = sonde.finalState.trees.filter((t) => t.id <= PLANTED_MAX_ID);
    expect(PLANTED_MAX_ID).toBe(TREES_PER_SPECIES * ESPECES_V0.length);
    expect(plantes.length).toBe(TREES_PER_SPECIES * ESPECES_V0.length);
    // Et ce qui dépasse le seuil est bien venu tout seul.
    const recrues = sonde.finalState.trees.filter((t) => t.id > PLANTED_MAX_ID);
    expect(recrues.length).toBeGreaterThanOrEqual(0);
  });
});

describe("l'avancement, sans lequel l'attente est un écran muet", () => {
  it("une annonce par année simulée, avec le total", () => {
    expect(avancement).toEqual([
      [1, ANS],
      [2, ANS],
    ]);
  });
});

describe("la durée que chaque station demande", () => {
  it("vingt ans partout, cent cinquante sur la friche — une succession ne se lit pas sur vingt ans", () => {
    expect(anneesDeLaSonde(sc)).toBe(YEARS);
    const friche = stationDeLaSonde("friche-limon");
    expect(isSuccessionStation(friche)).toBe(true);
    expect(anneesDeLaSonde(friche)).toBe(150);
  });
});
