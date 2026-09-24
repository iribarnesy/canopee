/**
 * **La chandelle qui tombe ne s'escamote plus** (#163).
 *
 * Retour de partie : « des arbres disparaissent ». J'ai cherché la cause en
 * mesurant plutôt qu'en devinant, et elle n'était pas celle qu'on attendait.
 *
 * **Ce n'est pas une disparition hors journal** : sur six stations et vingt
 * ans, une seule disparition sur 866 n'est pas nommée au journal. Et ce n'est
 * pas l'omission d'actes : en ×1 le plan n'en omet aucun.
 *
 * **C'est que la chute n'avait personne à animer.** Une chandelle qui s'abat
 * quitte `state.trees` dans le tick même où sa chute est rapportée — 423 fois
 * sur 423 dans la mesure. `deformationDe` n'est donc jamais interrogée pour
 * elle, la scène n'a aucun sprite de ce nom, et le fût disparaît d'une image à
 * l'autre. Toute la mécanique de chute existait et ne servait à rien.
 *
 * La réponse est celle que les gestes utilisaient déjà : reposer le fût le
 * temps de sa chute, à partir du seul événement.
 */

import { describe, expect, it } from "vitest";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type Station } from "../../src/engine/state";
import { STATIONS_V0 } from "../../src/engine/stations";
import { type ChuteDeChandelle, tick } from "../../src/engine/tick";
import { construireSnapshot } from "../../src/game/snapshot";
import { type Vue, vueInitiale } from "../../src/render/camera";
import { DEBOUT } from "../../src/render/temps/chute";
import { planDEllipse } from "../../src/render/temps/ellipse";
import { estUneTige, idDeLaTige } from "../../src/render/temps/geste";
import {
  chandellesTombees,
  chuteDeLaChandelle,
  indexerLesChandellesTombees,
} from "../../src/render/temps/lecteur";

const vue = (): Vue => vueInitiale(100, 900, 640, 0);

const chute = (id: number, heightM = 14): ChuteDeChandelle => ({
  id,
  x: 40 + (id % 10),
  y: 50,
  especeId: "betula_pendula",
  heightM,
  // Un azimut de profil, pour que la rotation soit franche et mesurable.
  directionRad: -Math.PI / 4,
  masseKgC: 300,
  empreinte: [],
});

describe("le fût reposé", () => {
  it("il y en a un par chandelle qui tombe, sous un identifiant de tige", () => {
    const plan = planDEllipse([{ chutes: [chute(7), chute(9)] }], 2000);
    const tiges = chandellesTombees(plan);
    expect(tiges.map((t) => t.id)).toEqual([idDeLaTige(7), idDeLaTige(9)]);
    for (const t of tiges) expect(estUneTige(t.id)).toBe(true);
  });

  it("il reprend la position, l'espèce et la hauteur de l'événement, sans rien ajouter", () => {
    const evenement = chute(3, 17.5);
    const [tige] = chandellesTombees(planDEllipse([{ chutes: [evenement] }], 2000));
    expect(tige).toBeDefined();
    if (!tige) return;
    expect(tige.x).toBe(evenement.x);
    expect(tige.y).toBe(evenement.y);
    expect(tige.especeId).toBe(evenement.especeId);
    expect(tige.heightM).toBe(evenement.heightM);
    expect(tige.directionRad).toBe(evenement.directionRad);
  });

  it("c'est une chandelle, et elle bascule depuis le sol", () => {
    // Le drapeau vaut zéro part foliaire à la pose : un fût mort n'a pas de
    // feuilles, et une chandelle qui tomberait en vert serait pire que rien.
    const [tige] = chandellesTombees(planDEllipse([{ chutes: [chute(1)] }], 2000));
    expect(tige?.chandelle).toBe(true);
    // Zéro, contrairement à une tige de recépage qui pivote sur sa souche.
    expect(tige?.hauteurDeCoupeM).toBe(0);
  });

  it("une chute de hauteur nulle ne pose rien", () => {
    expect(chandellesTombees(planDEllipse([{ chutes: [chute(1, 0)] }], 2000))).toHaveLength(0);
  });

  it("un plan sans chute ne pose rien", () => {
    const plan = planDEllipse([{ morts: [] }], 2000);
    expect(chandellesTombees(plan)).toHaveLength(0);
  });
});

describe("la chute du fût reposé", () => {
  it("debout, puis penché, puis effacé", () => {
    const plan = planDEllipse([{ chutes: [chute(5)] }], 2000);
    const index = indexerLesChandellesTombees(plan);
    const id = idDeLaTige(5);
    const v = vue();
    expect(chuteDeLaChandelle(index, 0, id, v)).toEqual(DEBOUT);
    const milieu = chuteDeLaChandelle(index, 1000, id, v);
    // **Sur l'inclinaison et sur la hauteur.** Un fût qui tombe **vers** la caméra
    // ne pivote pas : il se raccourcit. Ne regarder que la rotation aurait
    // rendu l'épreuve fausse une orientation de caméra sur quatre.
    expect(Math.abs(milieu.rotationRad) > 0 || milieu.hauteur < 1).toBe(true);
    const fin = chuteDeLaChandelle(index, 2000, id, v);
    // Effacé à la fin : le fût au sol est l'affaire du terrain, et le laisser
    // couché en dessinerait deux.
    expect(fin.opacite).toBe(0);
  });

  it("la rotation ne recule jamais", () => {
    const plan = planDEllipse([{ chutes: [chute(5)] }], 2000);
    const index = indexerLesChandellesTombees(plan);
    const id = idDeLaTige(5);
    const v = vue();
    let precedente = 0;
    for (let t = 0; t <= 1999; t += 100) {
      const a = Math.abs(chuteDeLaChandelle(index, t, id, v).rotationRad);
      expect(a).toBeGreaterThanOrEqual(precedente - 1e-9);
      precedente = a;
    }
    // Et elle a vraiment tourné : une épreuve de monotonie que zéro satisfait
    // ne prouve rien.
    expect(precedente).toBeGreaterThan(0.1);
  });

  it("ne dit rien d'un identifiant qu'elle ne connaît pas", () => {
    const plan = planDEllipse([{ chutes: [chute(5)] }], 2000);
    const index = indexerLesChandellesTombees(plan);
    // Celui de l'**arbre** et non de la tige : c'est l'index des chutes qui le
    // porte, et confondre les deux reposerait un fût sur un arbre vivant.
    expect(chuteDeLaChandelle(index, 500, 5, vue())).toEqual(DEBOUT);
    expect(chuteDeLaChandelle(index, 500, idDeLaTige(404), vue())).toEqual(DEBOUT);
  });
});

describe("la prémisse, tenue par le moteur", () => {
  /**
   * Le fait mesuré sur lequel tout ce lot repose. Si le moteur se mettait à
   * garder la chandelle une semaine de plus, on la dessinerait **deux** fois —
   * celle de l'instantané et le fût reposé — et le remède deviendrait le mal.
   */
  it("une chandelle qui tombe a déjà quitté l'instantané de la semaine", () => {
    const sc = STATIONS_V0.find((s) => s.station.id === "vallee-engorgee");
    if (!sc) throw new Error("station absente");
    const st: Station = { ...sc.station, coteM: 30 };
    const meteo = syntheticYear(sc.climat);
    let state = createGameState(st, rngStateFromSeed(11));
    let vues = 0;
    let encoreLa = 0;
    for (let s = 0; s < 8 * 52; s++) {
      const w = meteo[state.week % meteo.length];
      if (!w) throw new Error("météo manquante");
      const t = tick(state, w);
      state = t.state;
      const snap = construireSnapshot({
        state: t.state,
        weather: w,
        anneeCivile: 2026,
        paysage: "bocage",
        initialSoilCTHa: st.initialSoilCTHa,
        fluxes: t.fluxes,
        debordementParCellule: t.debordementParCellule,
        lumiereAuSol: t.lumiereAuSol,
        refusals: [],
        events: [],
        morts: t.morts,
        naissances: t.naissances,
        franchissements: t.franchissements,
        gestes: t.gestes,
        chutes: t.chutes,
        incendie: t.incendie,
        tempete: t.tempete,
      });
      const ids = new Set(snap.trees.map((x) => x.id));
      for (const c of snap.chutes ?? []) {
        vues++;
        if (ids.has(c.id)) encoreLa++;
      }
    }
    // Il en faut pour que l'épreuve prouve quelque chose.
    expect(vues).toBeGreaterThan(10);
    expect(encoreLa).toBe(0);
  }, 300000);
});
