/**
 * Le sanglier (issue #73, critère G10).
 *
 * Le dernier grand absent du module biotique, et le seul herbivore qui puisse
 * FAVORISER la régénération. Deux effets de signe opposé, portés par le même
 * animal et par des traits que l'atlas déclarait déjà : il mange ce qui tombe
 * et reste (les graines lourdes), il ouvre un lit de germination pour ce qui
 * arrive par le vent.
 *
 * Ce que ce fichier vérifie : la fréquence et la saison du retournement, le
 * fait qu'aucun tirage ne quitte le flux local, les deux effets opposés sur la
 * régénération, et qu'aucun des deux ne devient un couperet.
 */

import { describe, expect, it } from "vitest";
import { serieMeteoPour } from "../../src/data/meteo";
import { serieToWeeks } from "../../src/engine/meteo";
import { sanglierParHa } from "../../src/engine/paysage";
import { rngStateFromSeed } from "../../src/engine/rng";
import {
  attraitCellule,
  DENSITE_REFERENCE_PAR_HA,
  effortSemaine,
  PART_RETOURNEE_PAR_AN,
  poidsSaisonnier,
} from "../../src/engine/sanglier";
import { createGameState, type GameState, plantAt, type Station } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

const SERIE = serieMeteoPour("limon-riche");
if (!SERIE) throw new Error("série manquante");
const METEO = serieToWeeks(SERIE);

describe("combien il retourne, et quand", () => {
  it("cinq pour cent de la parcelle par an à la densité de référence", () => {
    // Le chiffre du lot : 0,2 à 0,7 %/an en prairie, 7 à 11 %/an en forêt
    // (Californie, Monte argentin). Cinq pour cent place une parcelle boisée
    // dans le bas de la fourchette forestière.
    let somme = 0;
    for (let w = 0; w < 52; w++) somme += effortSemaine(DENSITE_REFERENCE_PAR_HA, w);
    expect(somme).toBeCloseTo(PART_RETOURNEE_PAR_AN, 6);
  });

  it("l'effort suit la densité, et il est nul sans sanglier", () => {
    expect(effortSemaine(0, 10)).toBe(0);
    expect(effortSemaine(2 * DENSITE_REFERENCE_PAR_HA, 10)).toBeCloseTo(
      2 * effortSemaine(DENSITE_REFERENCE_PAR_HA, 10),
      9,
    );
  });

  it("c'est une activité d'automne et d'hiver, pas d'été", () => {
    // Les suivis s'accordent : marquée de la mi-automne au printemps.
    expect(poidsSaisonnier(45)).toBeGreaterThan(poidsSaisonnier(25));
    expect(poidsSaisonnier(5)).toBeGreaterThan(poidsSaisonnier(25));
    // Mais jamais nulle : un sanglier fouille toute l'année, moins fort.
    expect(poidsSaisonnier(25)).toBeGreaterThan(0.3);
  });

  it("un sol sec ne se retourne pas, quelle que soit la glandée dessus", () => {
    const sec = attraitCellule({ mast: 1, couvert: 1, humidite: 0 });
    const humide = attraitCellule({ mast: 1, couvert: 1, humidite: 1 });
    expect(sec).toBe(0);
    expect(humide).toBeGreaterThan(0);
    // Et la glandée attire, à humidité égale.
    expect(attraitCellule({ mast: 1, couvert: 0.5, humidite: 1 })).toBeGreaterThan(
      attraitCellule({ mast: 0, couvert: 0.5, humidite: 1 }),
    );
  });

  it("le paysage décide de la densité, et le maïs compte autant que le bois", () => {
    const foret = sanglierParHa({ partBoisee: 1, partCultivee: 0, partUrbaine: 0 } as never);
    const bocage = sanglierParHa({ partBoisee: 0.5, partCultivee: 0.5, partUrbaine: 0 } as never);
    const ville = sanglierParHa({ partBoisee: 0.2, partCultivee: 0, partUrbaine: 0.8 } as never);
    expect(bocage).toBeGreaterThan(0);
    expect(foret).toBeGreaterThan(0);
    expect(ville).toBeLessThan(foret);
    // Ordre de grandeur français : quelques bêtes aux cent hectares.
    expect(foret).toBeLessThan(0.2);
  });
});

describe("aucun tirage ne quitte le flux local", () => {
  it("une parcelle avec sangliers tire exactement comme une parcelle sans", () => {
    // La précaution du lot des tempêtes : le choix des cellules retournées
    // dérive d'une graine locale. Sur une parcelle SANS arbres — donc sans
    // recrutement pour diverger — les deux flux doivent rester identiques au
    // bit près, alors que l'un retourne du sol et l'autre non.
    const base: Station = { ...LIMON_RICHE.station, coteM: 10, voisinage: [] };
    let avec: GameState = createGameState({ ...base, sanglierParHa: 0.2 }, rngStateFromSeed(7));
    let sans: GameState = createGameState({ ...base, sanglierParHa: 0 }, rngStateFromSeed(7));
    for (let i = 0; i < 60; i++) {
      const w = METEO[i % METEO.length];
      if (!w) throw new Error("météo manquante");
      avec = tick(avec, w).state;
      sans = tick(sans, w).state;
    }
    expect(avec.rng).toEqual(sans.rng);
    // Et pourtant le sanglier a bien travaillé : la litière a bougé.
    const somme = (a: readonly number[]) => a.reduce((x, y) => x + y, 0);
    expect(somme(avec.soil.humusCG)).not.toBeCloseTo(somme(sans.soil.humusCG), 3);
  });
});

/**
 * ─── LA GLANDÉE A DÉMÉNAGÉ (issue #197) ──────────────────────────────────────
 *
 * Il y avait ici une section « ce qu'il en reste » qui vérifiait
 * `partGlandeeRestante` : une part de la glandée mangée en fonction de la seule
 * densité de sangliers. Elle a disparu avec la fonction, et pour une raison qui
 * n'est pas cosmétique — **le moteur ne produisait aucune glandée**, alors la
 * fonction en supposait une, et le 0,55 qu'elle portait supposait un hectare
 * portant vingt-cinq kilos de glands et une bête en avalant plus d'une tonne
 * par an.
 *
 * Le sanglier prélève désormais une RATION en kilos sur une production réelle
 * (`glandee.ts`), et ce qui reste ici du même animal — le retournement, les
 * boutis, l'humus, le tassement cassé — n'a pas bougé d'un cheveu.
 * `tests/ecology/glandee.test.ts` tient la suite, y compris ce que la mesure a
 * coûté à la deuxième moitié de G10.
 */

/** Une chênaie mûre, quarante ans, à une densité de sanglier donnée. */
function chenaie(densite: number, ans: number) {
  const COTE = 24;
  const station: Station = {
    ...LIMON_RICHE.station,
    coteM: COTE,
    voisinage: [],
    ventExposition: 0,
    sanglierParHa: densite,
  };
  let s = createGameState(station, rngStateFromSeed(3));
  for (let y = 3; y < COTE; y += 6) {
    for (let x = 3; x < COTE; x += 6) s = plantAt(s, "quercus_pubescens", x, y, 12);
  }
  const plantes = s.trees.length;
  for (let i = 0; i < ans * 52; i++) {
    const w = METEO[i % METEO.length];
    if (!w) throw new Error("météo manquante");
    s = tick(s, w).state;
  }
  const vivants = s.trees.filter((t) => t.alive).length;
  const somme = (a: readonly number[]) => a.reduce((x, y) => x + y, 0);
  return { recrues: vivants - plantes, vivants, humus: somme(s.soil.humusCG) };
}

describe("en partie : le geai plante les chênes, le sanglier retourne le sol", () => {
  it("la chênaie se régénère, et le sanglier n'y change plus grand-chose", () => {
    // Cet essai relevait 97 recrues sans sanglier, 60 à la densité de référence
    // et 22 à 0,15/ha, et c'est ce triplet qui portait la deuxième moitié de
    // G10. **Il tenait à un coefficient et non à une ration** : #197 l'a
    // remplacé par des kilos mangés sur des kilos produits, et l'écart d'un
    // bout à l'autre est tombé de 77 % à moins de 15 % — c'est-à-dire au bruit.
    //
    // Ce qui se vérifie ici est donc le contraire de ce qui s'y vérifiait : que
    // la chênaie se régénère, et qu'elle le fasse sanglier ou non. La mesure
    // complète et ce qu'elle coûte sont dans `glandee.test.ts`, qui a la
    // glandée sous la main — ce que ce fichier n'a pas.
    const sans = chenaie(0, 40);
    const beaucoup = chenaie(0.15, 40);
    expect(sans.recrues).toBeGreaterThan(20);
    expect(beaucoup.recrues).toBeGreaterThan(20);
  });

  it("ce qu'il enfouit ne disparaît pas : l'humus y gagne", () => {
    // Un boutis est un ENFOUISSEMENT, pas une combustion. La litière passe au
    // pool lent, elle ne part pas en fumée — et ça se voit sur le stock.
    const sans = chenaie(0, 40);
    const beaucoup = chenaie(0.15, 40);
    expect(beaucoup.humus).toBeGreaterThan(sans.humus);
  });
});
