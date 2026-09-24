/**
 * **La pompe à bases et le budget du sous-sol** (issue #170, critère C15).
 *
 * Ce que le moteur ne savait pas faire, en deux temps. Le calcium de la litière
 * arrivait de **nulle part** : `effetLitiereEq` créditait la surface de ce qu'une
 * feuille rend en se décomposant, sans que rien nulle part n'ait été débité. Et
 * l'altération, qui se produit dans tout le profil, créditait elle aussi la
 * seule surface — si bien que des bases libérées à un mètre de fond
 * remontaient au jour toutes seules.
 *
 * Le budget est maintenant stratifié en deux pools et il circule : chaque
 * horizon reçoit l'altération qu'il produit, la surface **lessive vers le fond**
 * au lieu de lessiver vers le néant, les racines pompent au fond, et c'est en
 * passant sous la zone racinaire qu'une base quitte la parcelle.
 *
 * Ce fichier vérifie, dans cet ordre : que le prélèvement se lit sur les deux
 * traits de l'atlas et sur rien d'autre ; que rien ne se perd ni ne se fabrique
 * entre les deux pools ; que la pompe ne peut pas toucher la surface ; et le
 * critère lui-même — sous un peuplement la profondeur s'appauvrit, sous un sol
 * nu elle ne s'appauvrit pas.
 */

import { describe, expect, it } from "vitest";
import { serieMeteoPour } from "../../src/data/meteo";
import {
  alterationBasesProfondeEqM2Semaine,
  alterationBasesSurfaceEqM2Semaine,
  basesLitiereEq,
  capaciteEchangeEqM2,
  capaciteEchangeProfondeEqM2,
  phDepuisSaturation,
  prelevementProfondEq,
} from "../../src/engine/bases";
import { getEspece } from "../../src/engine/especes";
import { serieToWeeks } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantAt, type Station } from "../../src/engine/state";
import { LIMON_ACIDE, LIMON_RICHE, type StationClimat } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";
import { fractionsRacinairesParHorizon } from "../../src/engine/trees";

const moyenne = (a: ArrayLike<number>) => {
  let t = 0;
  for (let i = 0; i < a.length; i++) t += a[i] ?? 0;
  return a.length === 0 ? 0 : t / a.length;
};

describe("ce que la pompe lit, et ce qu'elle refuse de lire", () => {
  it("le même calcium aux deux bouts du voyage", () => {
    // Le piège du lot : compter à la descente autre chose qu'à la remontée.
    // La surface reçoit `basesLitiereEq` (moins les protons, fois trois), la
    // profondeur perd `basesLitiereEq` (fois la part profonde). Si les deux
    // expressions divergeaient un jour, la pompe fabriquerait du calcium.
    expect(prelevementProfondEq(100, 16, 1)).toBe(basesLitiereEq(100, 16));
    // Et l'ordre de grandeur est celui du tableau périodique, pas d'un réglage :
    // 100 g C font 200 g de matière sèche, qui à 16 mg/g portent 3,2 g de
    // calcium, soit 0,16 eq à 20 g par équivalent.
    expect(basesLitiereEq(100, 16)).toBeCloseTo(0.16, 12);
  });

  it("une litière riche pompe plus, à masse et à racines égales", () => {
    const frene = getEspece("fraxinus_excelsior").litiere.calciumMgG;
    const callune = getEspece("calluna_vulgaris").litiere.calciumMgG;
    expect(prelevementProfondEq(100, frene, 0.4)).toBeGreaterThan(
      prelevementProfondEq(100, callune, 0.4),
    );
    // Le rapport **est** celui des deux fiches, et rien d'autre ne s'y ajoute.
    expect(
      prelevementProfondEq(100, frene, 0.4) / prelevementProfondEq(100, callune, 0.4),
    ).toBeCloseTo(frene / callune, 12);
  });

  it("un système racinaire qui ne quitte pas la surface ne pompe RIEN", () => {
    // Le cas qui fait la moitié du tri entre essences : la callune ne descend
    // qu'à 40 cm, et sous un horizon de surface plus épais elle ne touche
    // jamais au fond, si acide que soit sa litière.
    const callune = getEspece("calluna_vulgaris");
    const fractions = fractionsRacinairesParHorizon([50, 50], callune.racines.profondeurMaxCm);
    expect(1 - (fractions[0] ?? 1)).toBe(0);
    expect(prelevementProfondEq(100, callune.litiere.calciumMgG, 0)).toBe(0);
  });
});

describe("l'altération cesse de remonter toute seule", () => {
  it("chaque horizon crédite SON pool, et la somme est inchangée", () => {
    // Le défaut corrigé : `alterationBasesEqM2Semaine` sommait tout le profil
    // et versait le tout en surface. Le total libéré ne change pas — c'est lui
    // qui est calé sur les budgets de bases mesurés —, seule sa **destination**
    // change. Le sous-sol en prend la plus grosse part, parce qu'il fait les
    // deux tiers de l'épaisseur.
    for (const sc of [LIMON_RICHE, LIMON_ACIDE]) {
      const surface = alterationBasesSurfaceEqM2Semaine(sc.station.profil);
      const profond = alterationBasesProfondeEqM2Semaine(sc.station.profil);
      expect(profond).toBeGreaterThan(surface);
      expect(profond / (surface + profond)).toBeGreaterThan(0.6);
    }
  });

  it("le sous-sol est le gros réservoir, et c'est pour ça qu'il tient", () => {
    // Un pool profond plus petit que celui de surface rendrait la pompe
    // spectaculaire en quelques décennies, ce qu'aucune conversion ne montre.
    for (const sc of [LIMON_RICHE, LIMON_ACIDE]) {
      const horizonSurface = sc.station.profil[0];
      if (!horizonSurface) throw new Error("profil vide");
      expect(capaciteEchangeProfondeEqM2(sc.station.profil)).toBeGreaterThan(
        capaciteEchangeEqM2(horizonSurface),
      );
    }
  });
});

/** Fait tourner une parcelle et rend les deux budgets, terme par terme. */
function parcelle(sc: StationClimat, especeId: string | null, ans: number) {
  const COTE = 16;
  const station: Station = { ...sc.station, coteM: COTE, voisinage: [], ventExposition: 0 };
  const serie = serieMeteoPour(sc.station.id);
  if (!serie) throw new Error("série manquante");
  const METEO = serieToWeeks(serie);
  let s = createGameState(station, rngStateFromSeed(3));
  if (especeId) {
    for (let y = 2; y < COTE; y += 4) {
      for (let x = 2; x < COTE; x += 4) s = plantAt(s, especeId, x, y, 0.4);
    }
  }
  const cecProfond = capaciteEchangeProfondeEqM2(station.profil);
  const surface0 = moyenne(s.soil.basesEq);
  const profond0 = moyenne(s.soil.basesProfondEq);
  let budgetSurface = 0;
  let budgetProfond = 0;
  let descendu = 0;
  let recuAuFond = 0;
  let preleve = 0;
  for (let i = 0; i < ans * 52; i++) {
    const w = METEO[i % METEO.length];
    if (!w) throw new Error("météo manquante");
    const r = tick(s, w);
    s = r.state;
    const f = r.fluxes;
    budgetSurface +=
      (f.basesApportEqHa + f.basesLitiereEqHa - f.basesLessiveEqHa - f.basesAcideEqHa) / 10_000;
    budgetProfond += (f.basesApportProfondEqHa - f.basesPreleveEqHa - f.basesExportEqHa) / 10_000;
    descendu += f.basesLessiveEqHa / 10_000;
    recuAuFond += f.basesApportProfondEqHa / 10_000;
    preleve += f.basesPreleveEqHa / 10_000;
  }
  const profond = moyenne(s.soil.basesProfondEq);
  return {
    surface0,
    surface: moyenne(s.soil.basesEq),
    budgetSurface,
    profond0,
    profond,
    budgetProfond,
    descendu,
    recuAuFond,
    preleve,
    phProfond: phDepuisSaturation(profond / cecProfond),
    phProfond0: phDepuisSaturation(profond0 / cecProfond),
    tiges: s.trees.filter((t) => t.alive).length,
  };
}

describe("les deux pools se referment, et la pompe ne peut pas toucher la surface", () => {
  it("le budget de SURFACE se referme sans aucun terme de pompe", () => {
    // C'est la garantie qui remplace le « rien n'a bougé » d'un lot additif —
    // ce lot-ci n'est **pas** additif, la surface bouge, et exiger qu'elle ne bouge
    // pas serait faux. Ce qu'on peut exiger, et qui vaut mieux, c'est que son
    // budget se referme **exactement** sur ses quatre termes d'origine : apport,
    // litière, lessivage, charge acide. Si la pompe touchait la surface d'un
    // millionième, cette égalité tomberait — sur une parcelle qui pompe fort.
    const r = parcelle(LIMON_ACIDE, "castanea_sativa", 30);
    expect(r.preleve).toBeGreaterThan(0);
    expect(r.surface - r.surface0).toBeCloseTo(r.budgetSurface, 8);
  });

  it("le budget du SOUS-SOL se referme sur ses trois termes", () => {
    const r = parcelle(LIMON_ACIDE, "castanea_sativa", 30);
    expect(r.profond - r.profond0).toBeCloseTo(r.budgetProfond, 8);
  });

  it("rien ne s'évapore entre les deux pools : ce qui descend arrive", () => {
    // Le risque propre à une cascade : perdre des bases dans l'escalier. Ce que
    // le fond reçoit vaut exactement ce que la surface a lessivé, plus sa
    // propre altération — au produit près du nombre de semaines.
    const ANS = 10;
    const r = parcelle(LIMON_RICHE, "fagus_sylvatica", ANS);
    const alterationCumul =
      alterationBasesProfondeEqM2Semaine(LIMON_RICHE.station.profil) * ANS * 52;
    expect(r.recuAuFond).toBeCloseTo(r.descendu + alterationCumul, 8);
  });
});

describe("C15 : la profondeur s'appauvrit sous un peuplement, et pas sans lui", () => {
  it("le témoin sans arbre : le sous-sol ne s'appauvrit PAS tout seul", () => {
    // Le témoin qui donne son sens au critère, et qui n'était pas mesurable
    // tant que le pool profond n'avait que le terme de pompe — il ne pouvait
    // alors que baisser, arbre ou pas. Maintenant qu'il a son altération et son
    // lessivage, il trouve son équilibre : sur limon riche sans un arbre, il
    // remonte même très légèrement (7,000 → 7,018 en cinquante ans).
    const nu = parcelle(LIMON_RICHE, null, 50);
    expect(nu.preleve).toBe(0);
    expect(nu.phProfond).toBeGreaterThanOrEqual(nu.phProfond0);
  });

  it("sous une hêtraie il baisse, et c'est la pompe qui fait la différence", () => {
    // Le critère lui-même. Même station, même graine, même météo : seule la
    // présence du peuplement change, et elle renverse le signe. Relevé sur
    // cinquante ans : 7,000 → 6,976 sous hêtraie contre 7,018 au sol nu.
    const hetre = parcelle(LIMON_RICHE, "fagus_sylvatica", 50);
    const nu = parcelle(LIMON_RICHE, null, 50);
    expect(hetre.preleve).toBeGreaterThan(0);
    expect(hetre.phProfond).toBeLessThan(hetre.phProfond0);
    expect(hetre.phProfond).toBeLessThan(nu.phProfond);
    // Et en **dixièmes**, pas en unités : un sous-sol vidé en une vie d'arbre
    // serait spectaculaire et faux. Le réservoir fait sept cent mille eq/ha.
    expect(hetre.phProfond0 - hetre.phProfond).toBeLessThan(0.2);
  });

  it("pendant que la SURFACE, elle, reçoit — c'est le sens du mot pompe", () => {
    // « Remonte les bases du sous-sol et les **dépose en surface** » : le critère
    // demande les deux moitiés. Une essence à litière riche tient sa surface
    // au-dessus du sol nu tout en creusant son fond ; le sol nu fait l'inverse
    // exact, surface qui décroche et fond stable.
    const frene = parcelle(LIMON_RICHE, "fraxinus_excelsior", 50);
    const nu = parcelle(LIMON_RICHE, null, 50);
    expect(frene.surface).toBeGreaterThan(nu.surface);
    expect(frene.phProfond).toBeLessThan(nu.phProfond);
  });

  it("c'est le CALCIUM qui décide, pas la profondeur des racines", () => {
    // Le contraste le plus instructif de l'atlas, et il est contre-intuitif :
    // sur la même station, le pin descend deux fois plus bas que le hêtre
    // (80 cm de racines contre 42 à cinquante ans) et porte plus de tiges — et
    // il pompe cinquante fois moins, parce que sa litière est à 3,8 mg/g de
    // calcium contre 7,5. La profondeur donne l'**accès** ; la teneur donne la
    // quantité.
    const hetre = parcelle(LIMON_RICHE, "fagus_sylvatica", 50);
    const pin = parcelle(LIMON_RICHE, "pinus_sylvestris", 50);
    expect(pin.tiges).toBeGreaterThan(hetre.tiges);
    expect(pin.preleve).toBeLessThan(0.1 * hetre.preleve);
  });
});
