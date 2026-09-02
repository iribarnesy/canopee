/**
 * Le gibier (critère G1, ch4-C). Ce qu'il doit produire :
 *  - une plantation appétente non protégée reste bloquée à hauteur de dent ;
 *  - la protéger la sauve, et c'est la dépense qui décide de la réussite ;
 *  - la sélectivité réoriente la composition sans qu'on l'ait codé ;
 *  - la pression vient du paysage, pas de la parcelle ;
 *  - rien ne disparaît : ce qui est mangé revient au sol en déjections.
 */

import { describe, expect, it } from "vitest";
import { serieMeteoPour } from "../../src/data/meteo";
import type { GameAction } from "../../src/engine/actions";
import { advanceWeek } from "../../src/engine/game";
import { aPorteeDeDent, brouter, HAUTEUR_BROUTAGE_M } from "../../src/engine/gibier";
import { serieToWeeks } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantAt, type Station } from "../../src/engine/state";
import { FRICHE_LIMON } from "../../src/engine/stations";
import type { TreeState } from "../../src/engine/trees";

const serie = serieMeteoPour("friche-limon");
if (!serie) throw new Error("série manquante");
const WEATHER = serieToWeeks(serie);

interface Resultat {
  vivants: number;
  hauteurMediane: number;
}

/** Plante une parcelle et la laisse vivre douze ans. */
function plantation(
  especeId: string,
  options: { protege: boolean; gibierParHa: number; nPlants?: number },
): Resultat {
  // Densité réaliste d'une plantation forestière : ~1 100 tiges/ha, soit un
  // plant tous les 3 m. C'est ce qui décide de tout : la production de rameaux
  // d'un jeune peuplement est très inférieure à l'appétit d'une harde.
  const cote = options.nPlants ?? 13;
  const station: Station = {
    ...FRICHE_LIMON.station,
    coteM: 40,
    voisinage: [],
    gibierParHa: options.gibierParHa,
  };
  let state = createGameState(station, rngStateFromSeed(5));
  const ids: number[] = [];
  for (let i = 0; i < cote * cote; i++) {
    state = plantAt(state, especeId, 2 + (i % cote) * 3, 2 + Math.floor(i / cote) * 3, 0.4);
    const dernier = state.trees[state.trees.length - 1];
    if (dernier) ids.push(dernier.id);
  }
  // Poser une protection prend une demi-heure : 169 plants, c'est plus de
  // quatre-vingts heures. On étale sur plusieurs semaines, comme sur le
  // terrain — sinon le plafond hebdomadaire en refuse la moitié en silence.
  const actions: GameAction[] = [];
  if (options.protege) {
    for (let debut = 0; debut < ids.length; debut += 100) {
      actions.push({
        type: "proteger",
        week: 1 + debut / 100,
        treeIds: ids.slice(debut, debut + 100),
      });
    }
  }
  for (let i = 0; i < 12 * 52; i++) {
    const w = WEATHER[i % WEATHER.length];
    if (!w) throw new Error("météo manquante");
    state = advanceWeek(state, w, actions).state;
  }
  const hauteurs = state.trees
    .filter((t) => t.alive && ids.includes(t.id))
    .map((t) => t.heightM)
    .sort((a, b) => a - b);
  return {
    vivants: hauteurs.length,
    hauteurMediane: hauteurs[Math.floor(hauteurs.length / 2)] ?? 0,
  };
}

describe("le piège à dents", () => {
  const noisetierProtege = plantation("corylus_avellana", { protege: true, gibierParHa: 0.4 });
  const noisetierNu = plantation("corylus_avellana", { protege: false, gibierParHa: 0.4 });

  it("sous forte pression, une plantation appétente non protégée reste sous la dent", () => {
    // 0,4 cervidé/ha : une densité forte mais réelle (Sologne, grands massifs
    // de plaine). Douze ans après, le noisetier n'a toujours pas sa flèche
    // hors d'atteinte.
    expect(noisetierNu.hauteurMediane).toBeLessThan(HAUTEUR_BROUTAGE_M);
  });

  it("protéger les plants sauve la plantation", () => {
    expect(noisetierProtege.hauteurMediane).toBeGreaterThan(2.5 * noisetierNu.hauteurMediane);
  });

  it("la protection ne sert à rien là où il n'y a pas de gibier", () => {
    const sansGibier = plantation("corylus_avellana", { protege: false, gibierParHa: 0 });
    expect(sansGibier.hauteurMediane).toBeGreaterThan(0.8 * noisetierProtege.hauteurMediane);
  });

  it("le dégât suit la densité du paysage, sans seuil arbitraire", () => {
    const hauteurs = [0.1, 0.3, 0.6].map(
      (d) => plantation("corylus_avellana", { protege: false, gibierParHa: d }).hauteurMediane,
    );
    // Réponse monotone : rien n'est déclenché par un palier, tout se joue en
    // kilos de matière sèche disputés.
    expect(hauteurs[0] ?? 0).toBeGreaterThan(hauteurs[1] ?? 0);
    expect(hauteurs[1] ?? 0).toBeGreaterThan(hauteurs[2] ?? 0);
  });
});

describe("la sélectivité réoriente la composition", () => {
  it("à pression égale, le pin s'en sort là où le noisetier est bloqué", () => {
    const pin = plantation("pinus_sylvestris", { protege: false, gibierParHa: 0.4 });
    const noisetier = plantation("corylus_avellana", { protege: false, gibierParHa: 0.4 });
    // Rien n'est codé « le pin échappe au gibier » : c'est son appétence de
    // 0,2 contre 0,9 qui produit l'écart.
    expect(pin.hauteurMediane).toBeGreaterThan(2 * noisetier.hauteurMediane);
  });

  it("une pression forte fait plus de dégâts qu'une pression faible", () => {
    const faible = plantation("quercus_pubescens", { protege: false, gibierParHa: 0.03 });
    const forte = plantation("quercus_pubescens", { protege: false, gibierParHa: 0.4 });
    expect(forte.hauteurMediane).toBeLessThan(0.7 * faible.hauteurMediane);
  });
});

describe("mécanique du broutage", () => {
  function jeune(id: number, especeId: string, heightM: number, pousse: number): TreeState {
    return {
      id,
      especeId,
      x: 5.5,
      y: 5.5,
      ageWeeks: 200,
      heightM,
      stress: 0,
      alive: true,
      uptakeYearG: 0,
      fruitsKg: 0,
      fruitProgress: 0,
      bloomFrosted: false,
      rootDepthCm: 40,
      hauteurElagueeM: 0,
      recepages: 0,
      pousseTendreM: pousse,
      protege: false,
    };
  }

  const coteM = 20;
  const herbe = new Array(coteM * coteM).fill(0.5);
  const couvert = new Array(coteM * coteM).fill(0);

  it("un arbre sorti de hauteur de dent n'est plus concerné", () => {
    expect(aPorteeDeDent(jeune(1, "corylus_avellana", 0.8, 0.3))).toBe(true);
    expect(aPorteeDeDent(jeune(1, "corylus_avellana", 3, 0.3))).toBe(false);
    expect(aPorteeDeDent({ ...jeune(1, "corylus_avellana", 0.8, 0.3), protege: true })).toBe(false);
  });

  it("le gibier mange davantage l'espèce la plus appétente", () => {
    const arbres = [jeune(1, "corylus_avellana", 1, 0.3), jeune(2, "pinus_sylvestris", 1, 0.3)];
    const r = brouter(arbres, herbe, couvert, coteM, 0.5, 1);
    const noisetier = r.parArbre.get(1)?.pousseMangeeM ?? 0;
    const pin = r.parArbre.get(2)?.pousseMangeeM ?? 0;
    expect(noisetier).toBeGreaterThan(3 * pin);
  });

  it("sans gibier dans le paysage, rien n'est prélevé", () => {
    const r = brouter([jeune(1, "corylus_avellana", 1, 0.3)], herbe, couvert, coteM, 0, 1);
    expect(r.preleveKg).toBe(0);
    expect(r.parArbre.size).toBe(0);
  });

  it("le nombre protège : un plant isolé est bien plus broutÉ qu'un plant noyé dans la masse", () => {
    // Effet de dilution. La ration du gibier est bornée par son appétit ; plus
    // il y a de tiges à se partager le même appétit, moins chacune trinque.
    // C'est pour ça qu'une régénération dense passe là où quelques plants
    // dispersés se font massacrer — et ça n'a rien été codé pour, ça tombe de
    // la réponse fonctionnelle.
    const dense = brouter(
      Array.from({ length: 40 }, (_, i) => ({
        ...jeune(i + 1, "corylus_avellana", 1, 0.3),
        x: 1 + (i % 8) * 2,
        y: 1 + Math.floor(i / 8) * 2,
      })),
      herbe,
      couvert,
      coteM,
      0.5,
      1,
    );
    const rare = brouter([jeune(1, "corylus_avellana", 1, 0.3)], herbe, couvert, coteM, 0.5, 1);
    const parPlantDense = dense.parArbre.get(1)?.pousseMangeeM ?? 0;
    const parPlantRare = rare.parArbre.get(1)?.pousseMangeeM ?? 0;
    expect(parPlantRare).toBeGreaterThan(3 * parPlantDense);
    // …mais au total, c'est bien le fourré dense qui nourrit le plus de monde.
    expect(dense.preleveKg).toBeGreaterThan(rare.preleveKg);
  });
});
