/**
 * Le calendrier des fleurs (issue #70, critères G4 et J6).
 *
 * Le moteur savait qu'un arbre fleurit — il en tirait un gel tardif et un
 * fruit. Il ne savait pas que cette fleur **nourrit** quelqu'un, ni que ce
 * quelqu'un doit manger le reste de l'année pour être là le jour venu.
 *
 * Ce que ce fichier vérifie :
 *   1. le trait, et ce qu'il dit de neuf — le nectar, la durée ;
 *   2. que l'étalement cesse de compter les anémophiles et voit la strate basse ;
 *   3. **le témoin du lot** : à haie **égale**, un calendrier étalé nourrit et un
 *      calendrier groupé ne nourrit pas.
 */

import { describe, expect, it } from "vitest";
import { indiceBiodiversite } from "../../src/engine/biodiversite";
import { getEspece } from "../../src/engine/especes";
import { HERBACEES, N_HERBACEES } from "../../src/engine/herbacees";
import { syntheticYear } from "../../src/engine/meteo";
import { partFloraison } from "../../src/engine/phenologie";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type GameState, plantAt } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";
import type { TreeState } from "../../src/engine/trees";

describe("le trait : fleurir n'est pas nourrir", () => {
  it("le noisetier et le noyer fleurissent et n'offrent RIEN", () => {
    // C'est le contenu du champ, et il n'était nulle part : leur pollen part au
    // vent. `indiceBiodiversite` les comptait comme une ressource, si bien
    // qu'une noiseraie affichait des floraisons étalées sans nourrir personne.
    for (const id of ["corylus_avellana", "juglans_regia"]) {
      const f = getEspece(id).floraison;
      expect(f, id).toBeDefined();
      expect(f?.nectar, id).toBe(0);
    }
    // Et les deux graminées de la strate basse sont dans le même cas : elles
    // ne déclarent pas de floraison du tout.
    for (const id of ["dactylis_glomerata", "molinia_caerulea"]) {
      expect(HERBACEES.find((h) => h.id === id)?.floraison, id).toBeUndefined();
    }
    expect(HERBACEES.find((h) => h.id === "anemone_nemorosa")?.floraison?.nectar).toBeGreaterThan(
      0,
    );
  });

  it("fleurir SANS fructifier est désormais possible, et c'était le verrou", () => {
    // Sept espèces nourrissent les pollinisateurs et ne donnent rien à
    // récolter : tant que la date vivait dans le bloc `fruits`, elles étaient
    // invisibles au calendrier. L'ajonc et la callune sont le cas d'école — à
    // elles deux elles nourrissent une lande atlantique presque toute l'année.
    for (const id of ["ulex_europaeus", "calluna_vulgaris", "salix_alba", "crataegus_monogyna"]) {
      const e = getEspece(id);
      expect(e.fruits, id).toBeUndefined();
      expect(e.floraison?.nectar, id).toBeGreaterThan(0);
    }
  });

  it("la DURÉE sépare une ressource ponctuelle d'une ressource de fond", () => {
    const ajonc = getEspece("ulex_europaeus").floraison;
    const abricotier = getEspece("prunus_armeniaca").floraison;
    if (!ajonc || !abricotier) throw new Error("fiche manquante");
    // Un ajonc tient plus de dix fois plus longtemps qu'un abricotier, et c'est
    // ce que l'ancienne constante unique de 100 °C·j ne savait pas dire.
    expect(ajonc.dureeDJ).toBeGreaterThan(10 * abricotier.dureeDJ);
    // Un mois après son ouverture, l'abricotier est fané et l'ajonc est ouvert.
    const unMoisApres = 120;
    expect(
      partFloraison(abricotier.debutDJ, abricotier.debutDJ + unMoisApres, abricotier.dureeDJ),
    ).toBe(0);
    expect(
      partFloraison(ajonc.debutDJ, ajonc.debutDJ + unMoisApres, ajonc.dureeDJ),
    ).toBeGreaterThan(0.3);
  });
});

describe("l'étalement des floraisons cesse d'être un décompte d'espèces", () => {
  const peuplement = (ids: readonly string[]): TreeState[] =>
    ids.map((especeId, i) => ({
      ...({
        id: i + 1,
        especeId,
        x: 5 + i * 3,
        y: 5,
        heightM: 8,
        diametreCm: 16,
        alive: true,
        ageWeeks: 40 * 52,
      } as unknown as TreeState),
    }));

  it("une noiseraie n'étale RIEN, et elle marquait un quart avant ce lot", () => {
    // 0,25 exactement : une espèce, une tranche de 250 °C·j, divisé par quatre.
    // Le nectar du noisetier est nul, donc le calendrier est vide.
    const noiseraie = indiceBiodiversite(peuplement(Array(8).fill("corylus_avellana")), 0, 0.1);
    expect(noiseraie.floraisonsEtalees).toBe(0);
  });

  it("une haie étalée nourrit plus qu'une haie qui fleurit d'un coup", () => {
    // Même nombre de tiges, même surface de houppier : seul le calendrier
    // change. C'est l'énoncé de J6 réduit à l'indice.
    const etale = indiceBiodiversite(
      peuplement(["prunus_spinosa", "crataegus_monogyna", "rubus_fruticosus", "arbutus_unedo"]),
      0,
      0.1,
    );
    const groupe = indiceBiodiversite(peuplement(Array(4).fill("crataegus_monogyna")), 0, 0.1);
    // Mesuré 0,064 contre 0,036, soit 1,79 ×. Et l'écart est **obtenu malgré une**
    // **dilution** : dans la haie étalée chaque espèce ne tient qu'un quart de la
    // surface de houppier, contre la totalité pour l'aubépine de la haie
    // groupée. Une saison couverte à quatre espèces diluées bat donc une
    // espèce pure concentrée sur cinq semaines — ce qui est exactement ce que
    // « sans rupture » veut dire. Seuil à 1,5, avec la marge que ça laisse.
    expect(etale.floraisonsEtalees).toBeGreaterThan(1.5 * groupe.floraisonsEtalees);
  });

  it("la strate basse entre dans l'indice, et c'est elle qui tient mars", () => {
    // Les mêmes arbres, avec et sans tapis de vernale. L'anémone fleurit avant
    // tout le monde : c'est la soudure de printemps, et l'indice l'ignorait.
    const arbres = peuplement(["castanea_sativa", "castanea_sativa"]);
    const emprise = new Array<number>(N_HERBACEES).fill(0);
    const iAnemone = HERBACEES.findIndex((h) => h.id === "anemone_nemorosa");
    emprise[iAnemone] = 0.5;
    const sansTapis = indiceBiodiversite(arbres, 0, 0.1, undefined, undefined);
    const avecTapis = indiceBiodiversite(arbres, 0, 0.1, undefined, emprise);
    expect(avecTapis.floraisonsEtalees).toBeGreaterThan(sansTapis.floraisonsEtalees);
  });
});

describe("le témoin du lot : c'est le CALENDRIER qui nourrit, pas les voisins", () => {
  it("à haie égale, l'étalement paie et le groupement ne paie pas", () => {
    // Neuf pommiers, deux haies rigoureusement comparables — même nombre de
    // tiges, mêmes espèces mellifères, même couvert, même habitat. L'une
    // fleurit de février à l'automne, l'autre toute en mai.
    const COTE = 40;
    const ANS = 15;
    const ETALE = ["prunus_spinosa", "crataegus_monogyna", "rubus_fruticosus", "arbutus_unedo"];
    const GROUPE = Array(4).fill("crataegus_monogyna");

    const partie = (haie: readonly string[]) => {
      const station = { ...LIMON_RICHE.station, coteM: COTE, voisinage: [] };
      const weather = syntheticYear(LIMON_RICHE.climat);
      let state: GameState = createGameState(station, rngStateFromSeed(4));
      for (let x = 12; x <= 28; x += 8) {
        for (let y = 12; y <= 28; y += 8) state = plantAt(state, "malus_domestica", x, y, 3);
      }
      let k = 0;
      for (const y of [4, 36]) {
        for (let x = 4; x < COTE - 3; x += 3) {
          const id = haie[k % haie.length];
          if (!id) throw new Error("haie");
          state = plantAt(state, id, x, y, 3);
          k++;
        }
      }
      for (let w = 0; w < ANS * 52; w++) {
        const m = weather[w % weather.length];
        if (!m) throw new Error("météo manquante");
        state = tick(state, m).state;
      }
      let recolte = 0;
      for (let w = 0; w < 52; w++) {
        const m = weather[w % weather.length];
        if (!m) throw new Error("météo manquante");
        state = tick(state, m).state;
        const kg = state.trees
          .filter((t) => t.alive && t.especeId === "malus_domestica")
          .reduce((a, t) => a + t.fruitsKg, 0);
        recolte = Math.max(recolte, kg);
      }
      const centre = state.soil.ressourceFlorale[20 * COTE + 20] ?? 0;
      return { recolte, centre };
    };

    const etale = partie(ETALE);
    const groupe = partie(GROUPE);
    // Relevé sur vingt-deux ans et trois graines, en trois voisinages : nu
    // 255,6 kg (ressource 0,029), groupé 263,4 kg (0,059), étalé 327,6 kg
    // (0,159). L'écart ne vient ni du couvert ni de l'habitat, qui sont les
    // mêmes : il vient du calendrier.
    expect(etale.centre).toBeGreaterThan(2 * groupe.centre);
    expect(etale.recolte).toBeGreaterThan(1.15 * groupe.recolte);
  }, 900_000);
});
