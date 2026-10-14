/**
 * **Le noyer hybride, contre ce qu'on sait de lui** (#213).
 *
 * L'hybride n'a pas de table de production et n'en aura pas : le fichier
 * écologique wallon porte, à sa ligne productivité comme à celle du commun,
 * « sans objet, sylviculture d'arbre ». Ce qui existe, ce sont des essais
 * datés et des ordres, et cet essai garde les uns et les autres :
 *
 *  1. **l'ordre avec le commun** : plus haut et plus gros, à dix et à vingt
 *     ans (Aletà et al. 2003, deux sites catalans ; MAA 2024 : en tests
 *     comparatifs, « toujours supérieures à celles des noyers communs ») ;
 *  2. **l'allée grossit plus que le plein** (Heim et al. 2023 à Restinclières ;
 *     Chifflot et al. 2006 : +26 à +65 % de diamètre sous culture
 *     intercalaire, davantage chez l'hybride) ;
 *  3. **Restinclières à dix-neuf ans**, en hauteur et en diamètre, à 20 % près
 *     (Heim et al. 2023) — rien n'y a été calé ;
 *  4. **le diamètre du réseau de Bade-Wurtemberg** entre cinq et dix ans : entre
 *     sa moyenne de stations et ses meilleures (Ehring et al. 2011).
 *
 * **Le dispositif** est celui de la campagne de #213 : limon riche, météo
 * synthétique, carré de 40 m sans voisinage ni gibier, plants de 2 m, la
 * parcelle fauchée chaque été pour tenir les semis spontanés sous un mètre.
 * L'allée est la géométrie du LER sans culture (deux rangs à 13,3 m, 5 m sur
 * le rang, 100 tiges/ha), le plein sa plantation témoin (6 × 6 m, 278
 * tiges/ha). Une graine ici ; la campagne en a tourné trois, et chaque
 * direction gardée ici y tenait sur les trois.
 */

import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/engine/actions";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantAt } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";
import { TOLERANCE_TENUE_A_LECART } from "./hauteurs-commun";

const COTE = 40;
const GRAINE = 4;
const JALONS = [5, 10, 19, 20];
const METEO = syntheticYear(LIMON_RICHE.climat);

type Geometrie = "allee" | "plein";

function positions(geometrie: Geometrie): [number, number][] {
  const p: [number, number][] = [];
  if (geometrie === "allee") {
    for (const y of [13.33, 26.67]) for (let x = 2; x < COTE; x += 5) p.push([x, y]);
  } else {
    for (let y = 3; y < COTE; y += 6) for (let x = 3; x < COTE; x += 6) p.push([x, y]);
  }
  return p;
}

const CACHE = new Map<string, Record<number, { h: number; d: number }>>();

/** Hauteur et diamètre moyens de la cohorte plantée, aux jalons. */
function cohorte(especeId: string, geometrie: Geometrie): Record<number, { h: number; d: number }> {
  const cle = `${especeId}|${geometrie}`;
  const deja = CACHE.get(cle);
  if (deja) return deja;
  const station = { ...LIMON_RICHE.station, coteM: COTE, gibierParHa: 0, voisinage: [] };
  let state = createGameState(station, rngStateFromSeed(GRAINE));
  for (const [x, y] of positions(geometrie)) state = plantAt(state, especeId, x, y, 2);
  const plantes = new Set(state.trees.map((t) => t.id));
  const mesure: Record<number, { h: number; d: number }> = {};
  const anMax = Math.max(...JALONS);
  for (let an = 0; an < anMax; an++) {
    for (let w = 0; w < 52; w++) {
      if (w === 25) {
        state = applyAction(state, {
          type: "faucher",
          week: an * 52 + w,
          x: COTE / 2,
          y: COTE / 2,
          rayonM: COTE,
        }).state;
      }
      const m = METEO[w];
      if (!m) throw new Error("météo manquante");
      state = tick(state, m).state;
    }
    if (!JALONS.includes(an + 1)) continue;
    const vivants = state.trees.filter((t) => t.alive && plantes.has(t.id));
    const n = Math.max(1, vivants.length);
    mesure[an + 1] = {
      h: vivants.reduce((s, t) => s + t.heightM, 0) / n,
      d: vivants.reduce((s, t) => s + t.diametreCm, 0) / n,
    };
  }
  CACHE.set(cle, mesure);
  return mesure;
}

function jalon(m: Record<number, { h: number; d: number }>, an: number) {
  const v = m[an];
  if (!v) throw new Error(`jalon ${an} ans non mesuré`);
  return v;
}

describe("le noyer hybride contre ses références (#213)", () => {
  it("passe devant le commun, en hauteur comme en diamètre", () => {
    // Campagne, trois graines, allée et plein : l'hybride devant à 10, 20 et 30
    // ans sur chaque graine. Moyennes en allée à vingt ans : 13,72 m et 32,0 cm
    // contre 9,58 m et 22,9 cm (#375, #377 ; 8,39 et 6,09 m quand les deux
    // noyers subissaient leur juglone). Le rapport des diamètres (1,40) reste
    // sous le « environ double » d'Aletà, mesuré à six ans contre le **meilleur**
    // des dix noyers communs de l'essai : c'est l'ordre qui est gardé, pas
    // l'ampleur.
    const hybride = cohorte("juglans_x_intermedia", "allee");
    const commun = cohorte("juglans_regia", "allee");
    for (const an of [10, 20]) {
      const h = jalon(hybride, an);
      const c = jalon(commun, an);
      expect(h.h, `hauteur à ${an} ans`).toBeGreaterThan(c.h);
      expect(h.d, `diamètre à ${an} ans`).toBeGreaterThan(c.d);
    }
  }, 300_000);

  it("grossit davantage en allée qu'en plein", () => {
    // La direction tient sur les trois graines : 1,18 à vingt ans en moyenne,
    // contre 1,52 à Restinclières (27,5 cm en allée, 18,1 en témoin forestier,
    // Heim 2023), où le témoin avait en plus ses aulnes et une nappe plus haute,
    // que les auteurs soupçonnent d'engorger son sol l'hiver. Elle valait 1,05
    // tant que les noyers subissaient la
    // juglone de leurs voisins : elle les bridait autant en allée qu'en plein,
    // et l'espacement ne jouait plus (#375).
    const allee = jalon(cohorte("juglans_x_intermedia", "allee"), 20);
    const plein = jalon(cohorte("juglans_x_intermedia", "plein"), 20);
    expect(allee.d).toBeGreaterThan(plein.d);
  }, 300_000);

  it("tient Restinclières à dix-neuf ans, en hauteur et en diamètre, à 20 % près", () => {
    // Restinclières, NG23 planté en 1995 à 200 tiges/ha, éclairci à 100 en
    // 2004, allées de 13 m cultivées, mesuré en 2014 : 13,2 m et 27,5 cm (Heim
    // 2023). Le moteur, à dix-neuf ans en allée, trois graines : 13,19 m
    // (−0,1 %) et 31,0 cm (+13 %).
    //
    // **Cet essai gardait l'écart, en plafond, et il est tombé comme il
    // l'annonçait** (#375). Le moteur était à 8,07 m et 19,1 cm : chaque noyer
    // subissait la juglone de ses voisins à la sensibilité médiane, faute d'en
    // déclarer une, et sa croissance plafonnait à la moitié. Les noyers tiennent
    // leur juglone sous forme non toxique et la détoxiquent quand elle revient
    // dans leurs racines (Rietveld 1983, Coder 2017) : leur sensibilité vaut 0,
    // et aucun nombre de croissance n'a bougé pour obtenir cet accord.
    //
    // **La tolérance** est celle que le banc des hauteurs tient à vingt ans, l'âge
    // qui n'a servi à aucun calage (`TOLERANCE_TENUE_A_LECART`). Et la station
    // n'est pas la même : un fluviosol profond à nappe sous climat
    // méditerranéen, contre un limon d'un mètre sous un climat du nord. Un
    // accord à 20 % est ce qu'on peut demander à cette comparaison, pas mieux.
    const m = jalon(cohorte("juglans_x_intermedia", "allee"), 19);
    expect(Math.abs(m.h / 13.2 - 1), `hauteur ${m.h.toFixed(2)} m`).toBeLessThan(
      TOLERANCE_TENUE_A_LECART,
    );
    expect(Math.abs(m.d / 27.5 - 1), `diamètre ${m.d.toFixed(1)} cm`).toBeLessThan(
      TOLERANCE_TENUE_A_LECART,
    );
  }, 300_000);

  it("grossit entre cinq et dix ans comme une bonne station du réseau de Bade-Wurtemberg", () => {
    // Ehring 2011, 55 placettes de jeunes hybrides : 8,5 mm/an de six à dix ans
    // en moyenne de stations, 14 mm sur les stations au-dessus de la moyenne,
    // plus de 17 sur les meilleures. Le moteur : 15,2 mm/an, trois graines.
    //
    // **Réécrit, et c'est signalé** (#375). L'essai bornait le moteur à ±25 % de
    // la moyenne du réseau, et il y tombait — 8,0 mm/an — parce que la juglone
    // des voisins divisait sa croissance par deux. Elle levée, il pousse comme
    // une bonne station, et c'en est une : le limon riche coche chacune des
    // conditions que le CNPF pose au noyer (sol profond et sain, texture
    // équilibrée, pH proche de la neutralité, très bonne réserve en eau), quand
    // la moyenne du réseau compte des placettes de pH 4 à 5, où la croissance
    // est nettement plus faible.
    // Les deux bornes viennent du même réseau : au-dessus de sa moyenne, sous
    // ses meilleures stations.
    //
    // En hauteur, le même réseau donne 78 cm/an et le moteur 61 : 22 % dessous,
    // ce que cet essai n'affirme pas et que la fiche dit.
    const m = cohorte("juglans_x_intermedia", "allee");
    const mmParAn = ((jalon(m, 10).d - jalon(m, 5).d) / 5) * 10;
    expect(mmParAn).toBeGreaterThan(8.5);
    expect(mmParAn).toBeLessThan(17);
  }, 300_000);
});
