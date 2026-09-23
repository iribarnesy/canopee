/**
 * POURQUOI UNE PRAIRIE DE FAUCHE RESTE UNE PRAIRIE (issue #184).
 *
 * Elle ne reste pas ouverte parce que l'herbe y gagnerait — sur une friche à
 * limon, l'herbe perd, et `succession.test.ts` le montre sur deux siècles. Elle
 * reste ouverte **parce qu'on la fauche**, et que le rotor ne trie pas entre un
 * brin d'herbe et un semis ligneux de la même taille.
 *
 * Le moteur ne le savait pas. Il savait qu'un labour détruit ce qui n'a pas
 * encore de tronc (`LABOUR_HAUTEUR_DETRUITE_M`) ; la fauche, elle, ne touchait
 * que le tapis, et une prairie entretenue s'y boisait sous l'outil qui est
 * justement là pour l'en empêcher. C'est le dispositif du LER (#136, #184) qui
 * l'a rendu visible : ses bandes épargnées le long des rangs se reboisaient
 * toutes seules, dix-huit semis spontanés de noyer, 5,6 % du terme arbre.
 *
 * **LE DISPOSITIF EST UN CONTRÔLE APPARIÉ** : même station, même graine, même
 * météo, trente ans, et une seule chose qui change — le passage de la
 * faucheuse. Chaque bras est le témoin de l'autre, ce qui est la seule façon de
 * savoir que c'est bien la fauche qui fait la différence et non la station.
 */

import { describe, expect, it } from "vitest";
import { applyAction, FAUCHE_HAUTEUR_TIGE_FAUCHABLE_M } from "../../src/engine/actions";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type GameState, plantAt } from "../../src/engine/state";
import { FRICHE_LIMON, LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

const ANS = 30;
/** Une fauche par an, en été, comme un foin. */
const SEMAINE_FAUCHE = 25;
const WEATHER = syntheticYear(FRICHE_LIMON.climat);
const COTE = FRICHE_LIMON.station.coteM;

function bras(fauchee: boolean) {
  let state: GameState = createGameState(FRICHE_LIMON.station, rngStateFromSeed(2026));
  for (let an = 0; an < ANS; an++) {
    for (let w = 0; w < 52; w++) {
      const week = an * 52 + w;
      if (fauchee && w === SEMAINE_FAUCHE) {
        state = applyAction(state, {
          type: "faucher",
          week,
          x: COTE / 2,
          y: COTE / 2,
          rayonM: COTE,
        }).state;
      }
      const m = WEATHER[w];
      if (!m) throw new Error("météo manquante");
      state = tick(state, m).state;
    }
  }
  const vivants = state.trees.filter((t) => t.alive);
  let couverture = 0;
  for (let i = 0; i < COTE * COTE; i++) couverture += state.soil.herbeCouverture[i] ?? 0;
  return {
    tiges: vivants.length,
    hautes: vivants.filter((t) => t.heightM > 10).length,
    plusHauteM: vivants.reduce((a, t) => Math.max(a, t.heightM), 0),
    couverture: couverture / (COTE * COTE),
  };
}

describe("la fauche arrête la succession", () => {
  const libre = bras(false);
  const fauchee = bras(true);

  it("la friche laissée à elle-même se boise, et haut", () => {
    // Le témoin. Sans lui, « la prairie fauchée n'a pas d'arbres » ne dit rien :
    // c'est peut-être la station qui n'en porte pas.
    expect(libre.tiges).toBeGreaterThan(100);
    expect(libre.hautes).toBeGreaterThan(10);
    // Trente ans de bouleau, mesuré à 20,6 m. Seuil large : ce qui compte ici
    // est qu'une CANOPÉE se soit fermée, pas sa hauteur exacte.
    expect(libre.plusHauteM).toBeGreaterThan(12);
  });

  it("la même friche fauchée une fois l'an ne porte pas un arbre", () => {
    // **ZÉRO, ET C'EST L'ÉNONCÉ**, pas une photographie qu'on relèvera : une
    // prairie de fauche n'a pas d'arbres, c'est ce qui en fait une prairie. Le
    // jour où un semis y survivrait, ce serait qu'il aurait dépassé le mètre en
    // une saison — et cet essai doit le dire, pas l'absorber.
    expect(fauchee.tiges).toBe(0);
  });

  it("et elle garde un tapis plus fourni que sous le bois", () => {
    // La conséquence qu'on n'a pas demandée, et qui vient seule : l'herbe ne
    // souffre pas de la faucheuse, elle souffre de l'ombre. Le bras fauché
    // finit à 0,95 de couverture contre 0,54 sous la canopée du bras libre.
    expect(fauchee.couverture).toBeGreaterThan(libre.couverture + 0.2);
  });
});

describe("ce que le rotor ne prend pas", () => {
  /** Un bras court : on plante, on fauche une fois, on regarde. */
  function fauchePlant(hauteurM: number, proteger: boolean) {
    const station = { ...LIMON_RICHE.station, coteM: 20, voisinage: [] };
    let state: GameState = createGameState(station, rngStateFromSeed(7));
    state = plantAt(state, "fagus_sylvatica", 10, 10, hauteurM);
    const id = state.trees[0]?.id;
    if (id === undefined) throw new Error("plant manquant");
    if (proteger) state = applyAction(state, { type: "proteger", week: 0, treeIds: [id] }).state;
    state = applyAction(state, {
      type: "faucher",
      week: 1,
      x: 10,
      y: 10,
      rayonM: 5,
    }).state;
    return state.trees.find((t) => t.id === id);
  }

  it("un semis nu dans la zone y passe, et il est nommé", () => {
    const plant = fauchePlant(0.4, false);
    expect(plant?.alive).toBe(false);
    expect(plant?.causeMort).toBe("fauche");
  });

  it("une tige au-dessus de la capacité de coupe reste debout", () => {
    expect(fauchePlant(FAUCHE_HAUTEUR_TIGE_FAUCHABLE_M + 0.1, false)?.alive).toBe(true);
  });

  it("un manchon la sauve, et c'est la moitié de sa raison d'être", () => {
    // Protéger puis faucher entre : c'est la conduite d'un alignement planté,
    // et sans cette exception le moteur la rendrait impossible.
    expect(fauchePlant(0.4, true)?.alive).toBe(true);
  });
});
