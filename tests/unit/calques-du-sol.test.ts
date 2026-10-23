/**
 * **Les calques de la carte du sol sont chiffrés** (#144).
 *
 * La carte montrait six dégradés sans bornes ni valeurs : on chaulait, la
 * tache changeait de teinte, et on ne savait toujours pas si le pH visé était
 * atteint. La légende qu'on ajoute n'a de valeur que si elle dit la **même** chose
 * que le dessin — une légende qui dérive est pire qu'une absence de légende,
 * parce qu'on la croit.
 *
 * D'où ces épreuves, qui tiennent en une phrase : la table des calques est la
 * seule règle de couleur, ses bornes sont de vraies bornes, et l'extraction
 * n'a pas changé une seule teinte de la carte d'avant.
 */

import { describe, expect, it } from "vitest";
import { syntheticYear } from "../../src/engine/meteo";
import { K_SUR_K2O, MG_K_PAR_CMOL } from "../../src/engine/pk";
import { rngStateFromSeed } from "../../src/engine/rng";
import { ruHorizonMm } from "../../src/engine/soil";
import { createGameState, type Station } from "../../src/engine/state";
import { K_ECHANGEABLE_TERRE_DE_LIMON_MG_KG, LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";
import {
  CALQUES,
  couleurDeLaCellule,
  enCss,
  enK2O,
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
    installationsFaune: [],
    departsFaune: [],
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
    // **les deux**, depuis #190 : le profil entier et l'horizon de surface ont
    // longtemps porté le même nom, et c'est ce qui a permis au sélecteur
    // d'essences de prendre l'un pour l'autre.
    ruMm: STATION.ruMm,
    ruHorizonSurfaceMm: horizon ? ruHorizonMm(horizon) : STATION.ruMm,
    // L'épaisseur de ce même horizon : c'est l'échelle du calque d'érosion (#110).
    epaisseurHorizonSurfaceCm: horizon?.epaisseurCm ?? 0,
    phInitial: STATION.phInitial,
    // La teneur que la station déclare (#395) : le repère du potassium (#435).
    potassiumEchangeableMgKg: STATION.potassiumEchangeableMgKg,
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
    // Pas un maximum choisi : `ruHorizonSurfaceMm` **est** la capacité de
    // l'horizon que `soilWater` mesure (worker.ts). Une échelle qui ne peut pas
    // être atteinte serait un mensonge de légende.
    //
    // Et c'est bien **celle-là**, pas la réserve du profil : sur un limon à deux
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
      // La nappe, elle, est un **seuil** déclaré : elle descend à 6 m sur ce
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
    // Y compris sur l'azote, dont l'échelle est **courbe** : c'est justement là
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
    // L'azote n'y est **pas** : son échelle a changé exprès (bornes doublées,
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

  // L'azote, les ravageurs, l'érosion et le potassium n'y sont **pas**, et pour
  // deux raisons opposées : l'azote a changé d'échelle exprès (bornes doublées,
  // courbe en racine), les trois autres n'avaient pas de teinte d'avant —
  // personne ne les dessinait (#109, #110, #435). Les faire passer sous une
  // épreuve qui dit « rien n'a bougé » noierait l'un et mentirait sur les autres.
  const SANS_PASSE = new Set(["azote", "ravageurs", "erosion", "potassium"]);
  for (const fiche of CALQUES.filter((c) => !SANS_PASSE.has(c.id))) {
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

/**
 * **La tache de ravageurs** (#109).
 *
 * Ce que ces épreuves défendent tient en deux points. D'abord que la carte lit
 * la **grille** et rien d'autre : la moyenne voyageait depuis toujours, et une
 * moyenne ne dit pas où regarder. Ensuite que le foyer se **voit** — une
 * échelle qui range toute une partie ordinaire dans le premier dixième du
 * dégradé dessine un aplat, ce qui revient à ne rien dessiner.
 */
describe("la grille de ravageurs se dessine par taches", () => {
  const FICHE = ficheDuCalque("ravageurs");

  /** Un instantané où un coin pullule et le reste dort. */
  function avecFoyer(): Snapshot {
    const grille = new Float32Array(COTE_M * COTE_M).fill(0.05);
    grille[0] = 0.45;
    grille[1] = 0.4;
    grille[COTE_M] = 0.4;
    return { ...SNAPSHOT, soilRavageurs: grille };
  }

  it("lit la cellule, pas la moyenne de la parcelle", () => {
    const s = avecFoyer();
    const st = station();
    expect(FICHE.lire(s, st, 0)).toBeCloseTo(0.45, 6);
    expect(FICHE.lire(s, st, 40)).toBeCloseTo(0.05, 6);
  });

  it("le foyer et le calme ne portent pas la même couleur, et de loin", () => {
    // Les deux valeurs sont celles qu'on mesure : médiane de cellule autour de
    // 0,05, pic d'une année ordinaire autour de 0,45. Si ces deux-là se
    // ressemblent à l'écran, le calque ne sert à rien — c'est la seule chose
    // que le joueur doit pouvoir distinguer d'un coup d'œil.
    const st = station();
    const calme = partDuDegrade(0.05, FICHE, st);
    const foyer = partDuDegrade(0.45, FICHE, st);
    expect(foyer - calme).toBeGreaterThan(0.4);
    const [, , lCalme] = FICHE.teinte(calme);
    const [, , lFoyer] = FICHE.teinte(foyer);
    expect(lCalme - lFoyer).toBeGreaterThan(18);
  });

  it("une parcelle indemne reste claire : on ne crie pas pour rien", () => {
    const [, , clarte] = FICHE.teinte(partDuDegrade(0, FICHE, station()));
    expect(clarte).toBeGreaterThan(85);
  });

  it("l'échelle va jusqu'au bout de ce que le moteur peut produire", () => {
    // Bornée sur ce qu'on a observé, la carte saturerait à la première partie
    // qui fait pire — et une carte saturée ne montre plus de foyer.
    expect(FICHE.bornes(station())).toEqual([0, 1]);
    expect(partDuDegrade(1, FICHE, station())).toBe(1);
  });

  it("l'étendue encadre le foyer et le calme", () => {
    const e = etendueDuCalque(FICHE, avecFoyer(), station(), COTE_M * COTE_M);
    expect(e?.bas).toBeCloseTo(0.05, 6);
    expect(e?.haut).toBeCloseTo(0.45, 6);
  });
});

/**
 * **L'érosion se lit des deux côtés du zéro** (#110).
 *
 * Un seul champ dit les deux moitiés du phénomène : la terre qui part d'un
 * versant et celle qui se dépose en bas. Ce que ces épreuves défendent est que
 * le dessin garde ce lien — le zéro au milieu, les deux sens de part et
 * d'autre — et que la légende n'affirme pas des extrêmes qui n'existent pas :
 * un cumul n'a pas de maximum, il monte tant que la partie dure.
 */
describe("le calque de l'érosion, une échelle qui diverge", () => {
  const FICHE = ficheDuCalque("erosion");

  function avecRavine(): Snapshot {
    const grille = new Float32Array(COTE_M * COTE_M).fill(0.02);
    // Une ravine qui décape, et le bas de pente qui s'engraisse.
    grille[10] = 1.4;
    grille[11] = 2.1;
    grille[COTE_M * 2] = -2.6;
    return { ...SNAPSHOT, soilEpaisseurPerdueCm: grille };
  }

  it("le zéro tombe au milieu du dégradé, et il y est neutre", () => {
    const st = station();
    expect(partDuDegrade(0, FICHE, st)).toBeCloseTo(0.5, 10);
    // Pâle : une cellule que rien n'a touchée ne doit pas crier.
    const [, saturation, clarte] = FICHE.teinte(0.5);
    expect(saturation).toBeLessThan(12);
    expect(clarte).toBeGreaterThan(88);
  });

  it("perte et dépôt tombent de part et d'autre, et ne portent pas la même teinte", () => {
    const st = station();
    const perte = partDuDegrade(2, FICHE, st);
    const depot = partDuDegrade(-2, FICHE, st);
    expect(perte).toBeGreaterThan(0.5);
    expect(depot).toBeLessThan(0.5);
    const [teintePerte] = FICHE.teinte(perte);
    const [teinteDepot] = FICHE.teinte(depot);
    expect(teintePerte).not.toBe(teinteDepot);
  });

  it("la courbe étale le bas des deux côtés, symétriquement", () => {
    // La moitié des cellules d'une parcelle en pente vit sous le dixième de
    // centimètre : sur une échelle droite, tout ce monde-là serait neutre.
    const st = station();
    const petitePerte = partDuDegrade(0.5, FICHE, st);
    const petitDepot = partDuDegrade(-0.5, FICHE, st);
    expect(petitePerte - 0.5).toBeGreaterThan(0.05);
    expect(petitePerte - 0.5).toBeCloseTo(0.5 - petitDepot, 10);
  });

  it("l'échelle est l'horizon de surface lui-même, pas un nombre choisi", () => {
    // Perdre un centimètre n'est pas la même chose sur un horizon de 20 cm et
    // sur un horizon de 40 : l'échelle vient donc du profil de la station.
    const st = station();
    expect(st.epaisseurHorizonSurfaceCm).toBeGreaterThan(0);
    expect(FICHE.bornes(st)).toEqual([-st.epaisseurHorizonSurfaceCm, st.epaisseurHorizonSurfaceCm]);
  });

  it("les deux bornes sont des seuils, et la légende doit le dire", () => {
    expect(FICHE.borneHauteOuverte).toBe(true);
    expect(FICHE.borneBasseOuverte).toBe(true);
    // Un cumul n'a pas de maximum : mesuré dans le jeu, une parcelle d'un
    // hectare à 45 % de pente laissée 120 ans perd des mètres. Ça se rabat sur
    // la teinte de bout, et le curseur donne le chiffre.
    const st = station();
    expect(partDuDegrade(-1800, FICHE, st)).toBe(0);
    expect(partDuDegrade(1800, FICHE, st)).toBe(1);
    expect(FICHE.format(-10.2)).toBe("-10.20");
  });

  it("lit la cellule, et l'étendue encadre la ravine comme le dépôt", () => {
    const e = etendueDuCalque(FICHE, avecRavine(), station(), COTE_M * COTE_M);
    expect(e?.haut).toBeCloseTo(2.1, 6);
    expect(e?.bas).toBeCloseTo(-2.6, 6);
  });
});

/**
 * **Le potassium se lit comme une analyse de terre** (#435).
 *
 * Le volet l'écrivait en « kg/ha assimilables », une moyenne de parcelle dans
 * une unité qu'aucun bulletin n'emploie. La station déclare depuis #395 une
 * teneur de laboratoire, en mg K/kg ; un laboratoire français l'écrit en
 * mg K₂O/kg. Ces épreuves tiennent les deux bouts : la carte lit la grille de
 * l'instantané et rien d'autre, et la conversion vers le bulletin est celle du
 * moteur.
 */
describe("le calque du potassium, une teneur d'analyse de terre", () => {
  const FICHE = ficheDuCalque("potassium");

  it("lit la teneur de la cellule, en mg K/kg", () => {
    const grille = new Float32Array(COTE_M * COTE_M).fill(124.5);
    grille[7] = 170;
    const s = { ...SNAPSHOT, soilPotassiumMgKg: grille };
    expect(FICHE.unite).toBe("mg K/kg");
    expect(FICHE.lire(s, station(), 7)).toBeCloseTo(170, 4);
    expect(FICHE.lire(s, station(), 8)).toBeCloseTo(124.5, 4);
    const e = etendueDuCalque(FICHE, s, station(), COTE_M * COTE_M);
    expect(e?.haut).toBeCloseTo(170, 4);
    expect(e?.bas).toBeCloseTo(124.5, 4);
  });

  it("une parcelle à peine entamée relit la teneur que sa station déclare", () => {
    // Une semaine de tick a tourné : les racines et la réserve ont bougé le
    // stock de quelques millièmes, pas davantage.
    const st = station();
    const e = etendueDuCalque(FICHE, SNAPSHOT, st, COTE_M * COTE_M);
    expect(e).toBeDefined();
    expect((e?.moyenne ?? 0) / st.potassiumEchangeableMgKg).toBeCloseTo(1, 1);
  });

  it("le bulletin d'analyse l'écrit en K₂O, au rapport du moteur", () => {
    // La terre de limon des médianes BDAT : 150 mg K₂O/kg, déclarés en K.
    expect(enK2O(K_ECHANGEABLE_TERRE_DE_LIMON_MG_KG)).toBeCloseTo(150, 9);
    expect(FICHE.auBulletin?.unite).toBe("mg K₂O/kg");
    expect(FICHE.auBulletin?.format(K_ECHANGEABLE_TERRE_DE_LIMON_MG_KG)).toBe("150");
    // Environ 1,2 de K₂O par K, ce que l'issue rappelle.
    expect(enK2O(1)).toBeCloseTo(1 / K_SUR_K2O, 12);
    expect(enK2O(1)).toBeGreaterThan(1.19);
    expect(enK2O(1)).toBeLessThan(1.21);
  });

  it("le haut du dégradé est un seuil : 300 mg K₂O/kg, la classe la plus riche de la BDAT", () => {
    const [bas, haut] = FICHE.bornes(station());
    expect(bas).toBe(0);
    expect(enK2O(haut)).toBeCloseTo(300, 9);
    expect(FICHE.borneHauteOuverte).toBe(true);
    // Des apports répétés passent au-dessus : la teinte s'arrête, le chiffre non.
    expect(partDuDegrade(400, FICHE, station())).toBe(1);
    expect(FICHE.format(400)).toBe("400");
  });

  it("les sols forestiers et le limon ne se confondent pas", () => {
    // Les stations forestières déclarent 20 à 34 mg K/kg (RENECOFOR), le limon
    // 125 : sur une échelle droite, les premières tiendraient dans le premier
    // huitième du dégradé et se ressembleraient toutes.
    const st = station();
    const lande = partDuDegrade(0.05 * MG_K_PAR_CMOL, FICHE, st);
    const suberaie = partDuDegrade(0.087 * MG_K_PAR_CMOL, FICHE, st);
    const limon = partDuDegrade(K_ECHANGEABLE_TERRE_DE_LIMON_MG_KG, FICHE, st);
    expect(lande).toBeGreaterThan(0.25);
    expect(suberaie - lande).toBeGreaterThan(0.05);
    expect(limon - suberaie).toBeGreaterThan(0.25);
  });
});
