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
 *  3. **l'écart à Restinclières**, déclaré et non calé : en hauteur, le moteur
 *     est loin dessous, et l'essai le garde en plafond comme en plancher ;
 *  4. **le diamètre du réseau de Bade-Wurtemberg** entre cinq et dix ans
 *     (Ehring et al. 2011 : 8,5 mm/an en moyenne de stations).
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
    // ans sur chaque graine. Moyennes en allée à vingt ans : 8,39 m et 19,9 cm
    // contre 6,09 m et 14,2 cm. Le rapport des diamètres (1,40) reste sous le
    // « environ double » d'Aletà, mesuré à six ans contre le **meilleur** des dix
    // noyers communs de l'essai : c'est l'ordre qui est gardé, pas l'ampleur.
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
    // La direction tient sur les trois graines, l'ampleur non : 1,05 à vingt
    // ans en moyenne, contre 1,52 à Restinclières (27,5 cm en allée, 18,1 en
    // témoin forestier, Heim 2023). La juglone des voisins en est la première
    // cause : elle bride les noyers autant en allée qu'en plein (voir le
    // dernier essai).
    const allee = jalon(cohorte("juglans_x_intermedia", "allee"), 20);
    const plein = jalon(cohorte("juglans_x_intermedia", "plein"), 20);
    expect(allee.d).toBeGreaterThan(plein.d);
  }, 300_000);

  it("reste loin sous Restinclières en hauteur — l'écart est déclaré, pas calé", () => {
    // Restinclières, NG23 planté en 1995 à 200 tiges/ha, éclairci à 100 en
    // 2004, allées de 13 m cultivées, mesuré en 2014 : 13,2 m et 27,5 cm (Heim
    // 2023). Le moteur, à
    // dix-neuf ans en allée, trois graines : 8,07 m (−39 %) et 19,1 cm (−30 %).
    //
    // **Ce qu'il manque est identifié** : chaque noyer est à cinq mètres de ses
    // voisins, donc dans leur juglone, et aucun noyer ne déclare de sensibilité
    // — la médiane s'applique et plafonne sa croissance à la moitié. Sans
    // elle, en mémoire et sur les mêmes graines, l'hybride fait 13,19 m et
    // 31,0 cm à dix-neuf ans. La sensibilité d'un noyer à la juglone de ses
    // congénères n'a pas de source dans le dépôt : c'est une décision à
    // prendre, pas un réglage à faire ici (#375).
    //
    // Le plafond tombe le jour où elle sera prise : il faudra alors refaire la
    // campagne et réécrire cette ligne. Le plancher dit que l'écart, lui, ne
    // doit pas se creuser.
    const h19 = jalon(cohorte("juglans_x_intermedia", "allee"), 19).h;
    expect(h19 / 13.2).toBeLessThan(0.8);
    expect(h19 / 13.2).toBeGreaterThan(0.5);
  }, 300_000);

  it("grossit au rythme moyen du réseau de Bade-Wurtemberg entre cinq et dix ans", () => {
    // Ehring 2011 : 8,5 mm/an de six à dix ans, moyenne de toutes les
    // variétés sur 55 placettes (14 mm sur les bonnes stations, plus de 17 sur
    // les meilleures). Le moteur : 8,0 mm/an en moyenne de trois graines. En
    // hauteur, le même réseau donne 78 cm/an et le moteur 32 : le diamètre
    // tombe juste quand la hauteur reste à moitié, et la même juglone en est
    // cause — sans elle, 15 mm/an et 61 cm/an.
    const m = cohorte("juglans_x_intermedia", "allee");
    const mmParAn = ((jalon(m, 10).d - jalon(m, 5).d) / 5) * 10;
    expect(mmParAn).toBeGreaterThan(0.75 * 8.5);
    expect(mmParAn).toBeLessThan(1.25 * 8.5);
  }, 300_000);
});
