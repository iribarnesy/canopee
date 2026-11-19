/**
 * Le limon acide sur socle : la station qui manquait.
 *
 * La station de référence du moteur est à pH 7. Or le châtaignier s'arrête à
 * 6,5 et le houx à 7 : deux espèces de l'atlas ne pouvaient vivre sur **aucune**
 * station de comparaison, et l'essai des hauteurs devait s'en fabriquer une à
 * la volée. Ce n'était pas un défaut du modèle de pH — un châtaignier ne pousse
 * pas sur calcaire — mais une lacune du catalogue.
 */

import { describe, expect, it } from "vitest";
import { getEspece } from "../../src/engine/especes";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantScattered } from "../../src/engine/state";
import { LIMON_ACIDE, LIMON_RICHE, STATIONS_V0 } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";
import { phFactor, phFactorSurvie } from "../../src/engine/trees";

/** Hauteur moyenne des sujets plantés après `ans` années, moyennée sur deux graines. */
function apres(
  station: (typeof LIMON_ACIDE)["station"],
  climat: (typeof LIMON_ACIDE)["climat"],
  especeId: string,
  ans: number,
) {
  const meteo = syntheticYear(climat);
  let somme = 0;
  let vivants = 0;
  for (const graine of [11, 29]) {
    let state = createGameState(
      { ...station, coteM: 40, gibierParHa: 0, voisinage: [] },
      rngStateFromSeed(graine),
    );
    state = plantScattered(state, especeId, 8, 0.3);
    for (let i = 0; i < ans * 52; i++) state = tick(state, meteo[i % 52] as never).state;
    const v = state.trees.filter((t) => t.alive && t.id <= 8);
    somme += v.reduce((s, t) => s + t.heightM, 0);
    vivants += v.length;
  }
  return { hauteurMoyenne: vivants > 0 ? somme / vivants : 0, vivants };
}

describe("la station acide est dans le catalogue", () => {
  it("elle y est, et elle est vraiment acide", () => {
    expect(STATIONS_V0.some((s) => s.station.id === "limon-acide")).toBe(true);
    expect(LIMON_ACIDE.station.phInitial).toBeLessThan(5.5);
  });

  it("ce n'est pas le limon riche avec un pH baissé", () => {
    // Un sol lessivé sur socle acide diffère par plus que son pH : plus
    // sableux, matière organique accumulée parce qu'elle se minéralise
    // lentement, azote minéral plus bas pour la même raison.
    const acide = LIMON_ACIDE.station.profil[0];
    const riche = LIMON_RICHE.station.profil[0];
    expect(acide?.sable).toBeGreaterThan(riche?.sable ?? 1);
    expect(acide?.moPct).toBeGreaterThan(riche?.moPct ?? 0);
  });
});

describe("les acidiphiles y sont enfin chez eux", () => {
  it("le châtaignier vit sur l'acide et meurt sur le riche", () => {
    const gamme = getEspece("castanea_sativa").ph;
    expect(gamme[1]).toBeLessThan(LIMON_RICHE.station.phInitial);

    const surAcide = apres(LIMON_ACIDE.station, LIMON_ACIDE.climat, "castanea_sativa", 12);
    expect(surAcide.vivants).toBeGreaterThan(0);
    expect(surAcide.hauteurMoyenne).toBeGreaterThan(2);

    const surRiche = apres(LIMON_RICHE.station, LIMON_RICHE.climat, "castanea_sativa", 12);
    expect(surRiche.vivants).toBe(0);
  });

  it("le houx aussi, lui qui s'arrête juste au pH de la station de référence", () => {
    const surAcide = apres(LIMON_ACIDE.station, LIMON_ACIDE.climat, "ilex_aquifolium", 12);
    expect(surAcide.vivants).toBeGreaterThan(0);
  });
}, 300_000);

describe("le chêne pubescent y tient, sur la foi de deux relevés (#492)", () => {
  it("planté sur le limon acide, il vit et pousse", () => {
    // Sa borne basse de pH est passée de 5,5, sans source, à 4,6 sur décision du
    // propriétaire du 18 novembre 2026. L'essai Querco du WSL a suivi trois
    // saisons des pubescents plantés sur un sol à pH CaCl₂ 3,93 (Kuster et al.
    // 2014, *PLoS ONE* 9 : e89724), soit 4,58 en pH eau par la conversion du
    // dépôt, + 0,65 (Saenger et al. 2023). Sous l'ancienne borne, un plant du
    // limon acide (pH 5,0) mourait de son sol en dix-huit semaines, sans avoir
    // poussé : 0 vivant sur 16 dans ce décor, morts à la semaine 18 (#492).
    const pubescent = getEspece("quercus_pubescens");
    // Au pH du sol de Querco, sa survie est pleine : c'est là qu'il a vécu.
    expect(phFactorSurvie(pubescent, 3.93 + 0.65)).toBe(1);
    // Au pH du limon acide, il passe le seuil où un semis s'installe
    // (`regeneration.ts`, 0,2) : il vaut 0,62.
    expect(phFactor(pubescent, LIMON_ACIDE.station.phInitial)).toBeGreaterThan(0.2);

    // Mesuré à la décision : 15 vivants sur 16 à cinq ans (un mort de
    // l'engorgement d'hiver, la semaine 13), 0,96 m en moyenne pour 0,30 m
    // plantés. Les seuils gardent la direction : la plupart vivent, et ils ont
    // au moins doublé.
    const r = apres(LIMON_ACIDE.station, LIMON_ACIDE.climat, "quercus_pubescens", 5);
    expect(r.vivants).toBeGreaterThanOrEqual(12);
    expect(r.hauteurMoyenne).toBeGreaterThan(0.6);
  });
}, 300_000);

describe("le prunellier y tient, sur la foi des haies de Westphalie (#496)", () => {
  it("planté sur le limon acide, il vit et pousse", () => {
    // Sa borne basse de pH est passée de 5,5, une valeur de l'atlas du jeu sans
    // source, à 4,3 sur décision du propriétaire du 19 novembre 2026. Wittig 1976
    // (*Abh. Westf. Mus. Naturk.* 38(3), tableau 1) a mesuré trois haies du
    // Rubo elegantispinosi-Prunetum à pH eau 5,0, 4,4 et 4,3, chacune la moyenne
    // de dix échantillons, et le prunellier est présent dans les trois. Sous
    // l'ancienne borne, un plant du limon acide (pH 5,0) mourait de son sol en
    // dix-huit semaines : 400 sur 400 sur le banc de #492.
    const prunellier = getEspece("prunus_spinosa");
    // Au pH de la plus acide des trois haies, sa survie est pleine.
    expect(phFactorSurvie(prunellier, 4.3)).toBe(1);
    // Au pH du limon acide, il passe le seuil où un semis s'installe
    // (`regeneration.ts`, 0,2) : il y est à plein régime, et c'est ce qui le
    // ramène dans la pluie de graines du bocage.
    expect(phFactor(prunellier, LIMON_ACIDE.station.phInitial)).toBeGreaterThan(0.2);

    // Mesuré à la décision, dans ce décor : 15 vivants sur 16 à cinq ans (un mort
    // de l'engorgement d'hiver, la semaine 13), 1,77 m en moyenne pour 0,30 m
    // plantés. Sous l'ancienne borne : 0 sur 16, quinze morts du pH à la semaine
    // 18. Les seuils gardent la direction : la plupart vivent, et ils ont au moins
    // quadruplé.
    const r = apres(LIMON_ACIDE.station, LIMON_ACIDE.climat, "prunus_spinosa", 5);
    expect(r.vivants).toBeGreaterThanOrEqual(12);
    expect(r.hauteurMoyenne).toBeGreaterThan(1.2);
  });
}, 300_000);
