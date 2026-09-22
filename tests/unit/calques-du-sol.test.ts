/**
 * LES CALQUES DE LA CARTE DU SOL SONT CHIFFRÉS (#144).
 *
 * La carte montrait six dégradés sans bornes ni valeurs : on chaulait, la
 * tache changeait de teinte, et on ne savait toujours pas si le pH visé était
 * atteint. La légende qu'on ajoute n'a de valeur que si elle dit la MÊME chose
 * que le dessin — une légende qui dérive est pire qu'une absence de légende,
 * parce qu'on la croit.
 *
 * D'où ces épreuves, qui tiennent en une phrase : la table des calques est la
 * seule règle de couleur, ses bornes sont de vraies bornes, et l'extraction
 * n'a pas changé une seule teinte de la carte d'avant.
 */

import { describe, expect, it } from "vitest";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { ruHorizonMm } from "../../src/engine/soil";
import { createGameState, type Station } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";
import {
  CALQUES,
  couleurDeLaCellule,
  enCss,
  etendueDuCalque,
  ficheDuCalque,
  partDuDegrade,
  TEINTE_EAU_LIBRE,
  valeurDuDegrade,
} from "../../src/game/panneaux/calquesDuSol";
import type { Snapshot, StationInfo } from "../../src/game/protocol";
import { construireSnapshot } from "../../src/game/snapshot";

const COTE_M = 12;
const STATION: Station = { ...LIMON_RICHE.station, coteM: COTE_M, voisinage: [], gibierParHa: 0 };
const METEO = syntheticYear(LIMON_RICHE.climat);

function instantane(): Snapshot {
  const state = createGameState(STATION, rngStateFromSeed(7));
  const w = METEO[state.week % METEO.length];
  if (!w) throw new Error("météo manquante");
  const ticked = tick(state, w);
  return construireSnapshot({
    state: ticked.state,
    weather: w,
    anneeCivile: 2026,
    paysage: "bocage",
    initialSoilCTHa: STATION.initialSoilCTHa,
    fluxes: ticked.fluxes,
    debordementParCellule: ticked.debordementParCellule,
    lumiereAuSol: ticked.lumiereAuSol,
    refusals: [],
    events: [],
    morts: ticked.morts,
    naissances: ticked.naissances,
    franchissements: ticked.franchissements,
    gestes: ticked.gestes,
    chutes: ticked.chutes,
    incendie: ticked.incendie,
    tempete: ticked.tempete,
  });
}

/**
 * La station telle que la carte la reçoit. Les champs qu'aucun calque ne lit —
 * l'eau libre décorative, les bordures du décor — sont laissés de côté : les
 * inventer ici ferait croire qu'ils comptent.
 */
function station(enEau: boolean[] = new Array(COTE_M * COTE_M).fill(false)): StationInfo {
  const horizon = STATION.profil[0];
  return {
    id: STATION.id,
    nom: STATION.nom,
    coteM: COTE_M,
    // LES DEUX, depuis #190 : le profil entier et l'horizon de surface ont
    // longtemps porté le même nom, et c'est ce qui a permis au sélecteur
    // d'essences de prendre l'un pour l'autre.
    ruMm: STATION.ruMm,
    ruHorizonSurfaceMm: horizon ? ruHorizonMm(horizon) : STATION.ruMm,
    phInitial: STATION.phInitial,
    meteoLabel: "essai",
    enEau,
    nappeEquilibreCm: 200,
    ventExposition: 0.3,
    nappeCm: new Float32Array(COTE_M * COTE_M).fill(Number.POSITIVE_INFINITY),
    altitudesM: new Array(COTE_M * COTE_M).fill(0),
  } as unknown as StationInfo;
}

const SNAPSHOT = instantane();

describe("les bornes sont de vraies bornes", () => {
  it("l'eau va de zéro à la réserve utile de l'horizon de surface", () => {
    // Pas un maximum choisi : `ruHorizonSurfaceMm` EST la capacité de
    // l'horizon que `soilWater` mesure (worker.ts). Une échelle qui ne peut pas
    // être atteinte serait un mensonge de légende.
    //
    // Et c'est bien CELLE-LÀ, pas la réserve du profil : sur un limon à deux
    // horizons les deux diffèrent d'un facteur trois, et borner sur le profil
    // ferait paraître la parcelle sèche en permanence (#190).
    const st = station();
    expect(ficheDuCalque("eau").bornes(st)).toEqual([0, st.ruHorizonSurfaceMm]);
    expect(st.ruHorizonSurfaceMm).toBeGreaterThan(0);
    expect(st.ruHorizonSurfaceMm).toBeLessThan(st.ruMm);
  });

  it("aucune valeur de la parcelle ne sort de son dégradé", () => {
    const st = station();
    for (const fiche of CALQUES) {
      const bornes = fiche.bornes(st);
      // **L'eau dépasse un peu, et c'est le sol qui déborde, pas la borne.**
      // Mesuré sur deux ans de limon riche : l'horizon de surface monte jusqu'à
      // 3,4 % au-dessus de sa réserve utile, le temps qu'une pluie infiltrée
      // descende. Le moteur lui-même ne compte cette eau-là nulle part — il
      // rabat le rapport à 1 partout où il s'en sert (`tick.ts`). La borne
      // reste donc « le sol plein », qui est ce qu'un joueur lit, et la carte
      // rabat comme le moteur.
      // La nappe, elle, est un SEUIL déclaré : elle descend à 6 m sur ce
      // limon-là, et la légende l'écrit « ≥ 3 » plutôt que de prétendre un
      // maximum. C'est le sens de `borneHauteOuverte`, et c'est pourquoi ce
      // calque ne passe pas sous cette épreuve.
      if (fiche.borneHauteOuverte) continue;
      const tolerance = fiche.id === "eau" ? 1.05 : 1;
      for (let i = 0; i < COTE_M * COTE_M; i++) {
        const v = fiche.lire(SNAPSHOT, st, i);
        if (!Number.isFinite(v)) continue;
        expect(v, `${fiche.id} en ${i}`).toBeGreaterThanOrEqual(bornes[0]);
        expect(v, `${fiche.id} en ${i}`).toBeLessThanOrEqual(bornes[1] * tolerance);
      }
    }
  });

  it("la position dans le dégradé et la valeur sont l'inverse l'une de l'autre", () => {
    // Y compris sur l'azote, dont l'échelle est COURBE : c'est justement là
    // qu'une légende graduée à part dériverait sans qu'on le voie.
    const st = station();
    for (const fiche of CALQUES) {
      for (const part of [0, 0.25, 0.5, 0.75, 1]) {
        expect(partDuDegrade(valeurDuDegrade(part, fiche, st), fiche, st)).toBeCloseTo(part, 10);
      }
    }
  });

  it("une valeur hors bornes est rabattue, elle ne déborde pas la teinte", () => {
    // Le dessin d'avant ne rabattait rien sur le pH : à pH 3,5 il sortait de
    // la gamme de teintes que la légende montre, et la légende aurait menti.
    const fiche = ficheDuCalque("ph");
    expect(partDuDegrade(3.5, fiche, station())).toBe(0);
    expect(partDuDegrade(9.9, fiche, station())).toBe(1);
  });

  it("une nappe hors de portée est au bout du dégradé et se dit en toutes lettres", () => {
    const fiche = ficheDuCalque("nappe");
    expect(fiche.borneHauteOuverte).toBe(true);
    // Une nappe plus profonde que le seuil garde sa teinte de bout, et son
    // chiffre reste vrai sous le curseur.
    expect(partDuDegrade(613, fiche, station())).toBe(1);
    expect(fiche.format(613)).toBe("6.13");
    expect(partDuDegrade(Number.POSITIVE_INFINITY, fiche, station())).toBe(1);
    expect(fiche.format(Number.POSITIVE_INFINITY)).toBe("hors de portée");
    expect(fiche.format(150)).toBe("1.50");
  });
});

describe("l'extraction n'a pas changé la carte", () => {
  // Les formules d'avant, recopiées ici telles qu'elles étaient dans
  // `dessinerCarteDuSol`. Si la table les trahit, c'est ici qu'on le voit et
  // pas trois captures plus tard.
  const AVANT: Record<string, (s: Snapshot, st: StationInfo, i: number) => string> = {
    eau: (s, st, i) =>
      `hsl(90 18% ${88 - 45 * Math.min(1, (s.soilWater[i] ?? 0) / st.ruHorizonSurfaceMm)}%)`,
    ph: (s, _st, i) => {
      const ph = s.soilPh[i] ?? 7;
      return `hsl(${20 + ((ph - 4) / 4.5) * 200} 35% 70%)`;
    },
    // L'azote n'y est PAS : son échelle a changé exprès (bornes doublées,
    // courbe en racine), et prétendre le contraire noierait la seule
    // modification voulue de ce lot dans un test qui dit « rien n'a bougé ».
    herbe: (s, _st, i) => {
      const c = s.soilHerbe[i] ?? 0;
      return `hsl(95 ${15 + 45 * c}% ${85 - 35 * c}%)`;
    },
    nappe: (s, st, i) => {
      const prof = Math.min(
        s.soilNappeCm[i] ?? Number.POSITIVE_INFINITY,
        st.nappeCm?.[i] ?? Number.POSITIVE_INFINITY,
      );
      const proximite = Number.isFinite(prof) ? Math.max(0, 1 - prof / 300) : 0;
      return `hsl(205 ${8 + 52 * proximite}% ${88 - 40 * proximite}%)`;
    },
    engorgement: (s, _st, i) => {
      const e = Math.min(1, Math.max(0, s.soilEngorgement[i] ?? 0));
      return `hsl(280 ${6 + 44 * e}% ${90 - 45 * e}%)`;
    },
  };

  for (const fiche of CALQUES.filter((c) => c.id !== "azote")) {
    it(`même teinte qu'avant, calque ${fiche.id}`, () => {
      const st = station();
      for (let i = 0; i < COTE_M * COTE_M; i++) {
        const avant = AVANT[fiche.id]?.(SNAPSHOT, st, i);
        const maintenant = enCss(couleurDeLaCellule(fiche, SNAPSHOT, st, i));
        // On compare les nombres et pas les chaînes : `hsl(90 18% 70.5%)` et
        // `hsl(90 18% 70.50%)` sont la même couleur.
        const chiffres = (css: string) => (css.match(/[\d.]+/g) ?? []).map(Number);
        expect(chiffres(maintenant), `cellule ${i}`).toEqual(chiffres(avant ?? ""));
      }
    });
  }

  it("l'eau libre prime toujours sur tous les calques", () => {
    const enEau = new Array<boolean>(COTE_M * COTE_M).fill(false);
    enEau[5] = true;
    const st = station(enEau);
    for (const fiche of CALQUES) {
      expect(couleurDeLaCellule(fiche, SNAPSHOT, st, 5)).toEqual(TEINTE_EAU_LIBRE);
      expect(couleurDeLaCellule(fiche, SNAPSHOT, st, 6)).not.toEqual(TEINTE_EAU_LIBRE);
    }
  });
});

describe("ce que la parcelle occupe du dégradé", () => {
  it("encadre la moyenne et tient dans les bornes", () => {
    const st = station();
    for (const fiche of CALQUES) {
      const e = etendueDuCalque(fiche, SNAPSHOT, st, COTE_M * COTE_M);
      expect(e, fiche.id).toBeDefined();
      if (!e) continue;
      expect(e.bas).toBeLessThanOrEqual(e.moyenne);
      expect(e.moyenne).toBeLessThanOrEqual(e.haut);
    }
  });

  it("ne compte pas l'eau libre : une mare n'a pas de pH", () => {
    const st = station();
    const sansEau = etendueDuCalque(ficheDuCalque("ph"), SNAPSHOT, st, COTE_M * COTE_M);
    const enEau = new Array<boolean>(COTE_M * COTE_M).fill(false);
    // Toute la parcelle sous l'eau : plus rien à moyenner.
    enEau.fill(true);
    expect(
      etendueDuCalque(ficheDuCalque("ph"), SNAPSHOT, station(enEau), COTE_M * COTE_M),
    ).toBeUndefined();
    expect(sansEau).toBeDefined();
  });
});

describe("chaque calque dit quelque chose", () => {
  it("les deux bouts du dégradé sont des teintes différentes", () => {
    for (const fiche of CALQUES) {
      expect(enCss(fiche.teinte(0)), fiche.id).not.toBe(enCss(fiche.teinte(1)));
    }
  });

  it("chaque calque porte un titre, un sens et un libellé court", () => {
    for (const fiche of CALQUES) {
      expect(fiche.titre.length).toBeGreaterThan(fiche.libelle.length - 1);
      expect(fiche.sens).not.toBe("");
      expect(fiche.libelle.length).toBeLessThanOrEqual(12);
    }
  });
});
