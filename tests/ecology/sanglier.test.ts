/**
 * Le sanglier (issue #73, critère G10).
 *
 * Le dernier grand absent du module biotique, et le seul herbivore qui puisse
 * **favoriser** la régénération. Deux effets de signe opposé, portés par le même
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
    // dérive d'une graine locale. Sur une parcelle **sans** arbres — donc sans
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
    const somme = (a: ArrayLike<number>) => {
      let t = 0;
      for (let i = 0; i < a.length; i++) t += a[i] ?? 0;
      return t;
    };
    expect(somme(avec.soil.humusCG)).not.toBeCloseTo(somme(sans.soil.humusCG), 3);
  });
});

/**
 * ─── **la glandée a déménagé** (issue #197) ──────────────────────────────────────
 *
 * Il y avait ici une section « ce qu'il en reste » qui vérifiait
 * `partGlandeeRestante` : une part de la glandée mangée en fonction de la seule
 * densité de sangliers. Elle a disparu avec la fonction, et pour une raison qui
 * n'est pas cosmétique — **le moteur ne produisait aucune glandée**, alors la
 * fonction en supposait une, et le 0,55 qu'elle portait supposait un hectare
 * portant vingt-cinq kilos de glands et une bête en avalant plus d'une tonne
 * par an.
 *
 * Le sanglier prélève désormais une **ration** en kilos sur une production réelle
 * (`glandee.ts`), et ce qui reste ici du même animal — le retournement, les
 * boutis, l'humus, le tassement cassé — n'a pas bougé d'un cheveu.
 * `tests/ecology/glandee.test.ts` tient la suite, y compris ce que la mesure a
 * coûté à la deuxième moitié de G10.
 */

/** Une chênaie mûre, quarante ans, à une densité de sanglier donnée. */
function chenaie(densite: number, ans: number, graine = 3) {
  const COTE = 24;
  const station: Station = {
    ...LIMON_RICHE.station,
    coteM: COTE,
    voisinage: [],
    ventExposition: 0,
    sanglierParHa: densite,
  };
  let s = createGameState(station, rngStateFromSeed(graine));
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
  const somme = (a: ArrayLike<number>) => {
    let t = 0;
    for (let i = 0; i < a.length; i++) t += a[i] ?? 0;
    return t;
  };
  return { recrues: vivants - plantes, vivants, humus: somme(s.soil.humusCG) };
}

// Trois graines, deux densités, et les six parties tournent **une** fois pour tout
// le fichier — une partie de quarante ans coûte une minute et demie, et chaque
// essai en dessous en lit les résultats plutôt que d'en relancer (`npm test`
// est déjà le poste le plus cher du dépôt).
const GRAINES = [3, 5, 7];
const MESURES = GRAINES.map((g) => ({
  graine: g,
  sans: chenaie(0, 40, g),
  forte: chenaie(0.5, 40, g),
}));

describe("en partie : le geai plante les chênes, le sanglier retourne le sol", () => {
  it("la chênaie se régénère, avec ou sans sanglier", () => {
    // Cet essai relevait 97 recrues sans sanglier, 60 à la densité de référence
    // et 22 à 0,15/ha, et c'est ce triplet qui portait la deuxième moitié de
    // G10. **Il tenait à un coefficient et non à une ration** : #197 l'a
    // remplacé par des kilos mangés sur des kilos produits, et l'écart d'un
    // bout à l'autre est tombé de 77 % à moins de 15 % — c'est-à-dire au bruit.
    // Ce que #199 a rendu n'est pas ce triplet : c'est un mécanisme (le boutis
    // arrache), et l'essai suivant le mesure.
    //
    // Ce qui se vérifie ici reste ce qui doit se vérifier d'abord : que la
    // chênaie se régénère, et qu'elle le fasse dans les deux cas. La glandée
    // elle-même est mesurée dans `glandee.test.ts`, qui l'a sous la main.
    for (const m of MESURES) {
      expect(m.sans.recrues).toBeGreaterThan(20);
      expect(m.forte.recrues).toBeGreaterThan(20);
    }
  });

  it("ce qu'il enfouit ne disparaît pas : l'humus y gagne", () => {
    // Un boutis est un **enfouissement**, pas une combustion. La litière passe au
    // pool lent, elle ne part pas en fumée — et ça se voit sur le stock.
    for (const m of MESURES) expect(m.forte.humus).toBeGreaterThan(m.sans.humus);
  });
});

describe("le boutis arrache ce qui a levé (#199)", () => {
  it("à forte densité, la régénération du chêne recule nettement — sur toutes les graines", () => {
    // **le mécanisme qui manquait, et il manquait parce qu'un autre était faux.**
    //
    // Le sanglier a deux prises sur une chênaie et le moteur n'en comptait
    // qu'une et demie : il mange la glandée (#197, ancré, et **petit** — à 0,15
    // bête/ha, quatre cents kilos par bête font soixante kilos de glands à
    // l'hectare contre une glandée qui se compte en centaines), il ouvre un lit
    // de germination pour les petites graines, et **il détruit ce qui a déjà
    // levé**, ce que rien ne disait. Un sanglier ne peut pas manger une
    // glandée ; il peut labourer les semis qui en sortent.
    //
    // Le boutis descend à dix centimètres (`PROFONDEUR_BOUTIS_CM`) : ce qui part
    // avec la motte est le plant dont les racines n'ont pas quitté cet horizon,
    // soit, à la coupure des protocoles d'inventaire, celui qui n'a pas atteint
    // cinquante centimètres. Rien de nouveau dans l'atlas, rien de nouveau dans
    // l'état, aucun tirage de plus — la cellule retournée est déjà tirée, et ce
    // qu'elle porte n'est pas affaire de chance.
    //
    // Mesuré, chênaie de quarante ans, recrues (cinq graines × trois densités) :
    //
    //     graine      0 sanglier/ha    0,15    0,5
    //        3             68           62      45
    //        5             95           77      61
    //        7             86           72      47
    //       11            102           82      55
    //       13             99           89      65
    //     moyenne        90,0         76,4    54,6
    //
    // **Décroissant sur cinq graines sur cinq**, ce qu'aucun tirage ne donne
    // par hasard : −15 % à 0,15/ha, −39 % à 0,5. Le fichier n'en rejoue que
    // trois et que les deux bouts, parce qu'une partie de quarante ans coûte
    // une minute et demie et que le milieu est déjà dit par le tableau.
    //
    // **et l'arithmétique tombe d'accord avec la simulation**, ce qui est le
    // meilleur contrôle qu'on puisse avoir sur un mécanisme de ce genre. À 0,5
    // sanglier/ha, le moteur retourne 20 % de la parcelle par an (2 % à la
    // densité de référence de 0,05, proportionnel). Un semis de chêne naît à
    // trente centimètres et met environ deux ans à passer cinquante : son
    // risque cumulé est 1 − 0,8² = 36 %. Mesuré : 39 %. Le mécanisme ne fait
    // rien d'autre que ce que son énoncé annonce.
    //
    // Ce que l'essai n'affirme **pas**, et c'est délibéré : il ne rend pas le
    // triplet d'avant (97 / 60 / 22). Celui-là venait d'un coefficient calé sur
    // le moteur, et la cible d'un lot n'est jamais l'ancien nombre.
    for (const m of MESURES) {
      expect(m.forte.recrues).toBeLessThan(0.8 * m.sans.recrues);
    }
  });

  it("et il ne les fait pas disparaître : à forte densité la chênaie tient encore debout", () => {
    // Un mécanisme qui supprime tout n'est pas un mécanisme, c'est un couperet.
    // La plus basse des trois graines rend encore 45 recrues sur 68.
    for (const m of MESURES) {
      expect(m.forte.recrues).toBeGreaterThan(0.4 * m.sans.recrues);
    }
  });
});
