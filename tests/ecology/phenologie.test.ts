/**
 * Phénologie foliaire (phenologie.ts) : l'ordre de débourrement, la porte
 * photopériodique, l'étalement de la chute, et la sénescence — qui devance la
 * chute et met la feuille hors service avant qu'elle ne tombe.
 */

import { describe, expect, it } from "vitest";
import { getEspece } from "../../src/engine/especes";
import { dureeDuJourH } from "../../src/engine/meteo";
import {
  contextePhenologique,
  debourrementExigeDJ,
  ETALEMENT_CHUTE_SEMAINES,
  ETALEMENT_SENESCENCE_SEMAINES,
  partFoliaire,
  partFoliaireActive,
  partFoliaireDans,
  SENESCENCE_DEBUT_SEMAINE,
  SOLSTICE_ETE_SEMAINE,
  semaineDeFroid,
  senescenceEnCoursDans,
  senescenceFoliaire,
} from "../../src/engine/phenologie";

/** Jour au 15 avril, à la latitude du limon (49,5° N) et de la lande (44,5° N). */
const AVRIL_NORD = dureeDuJourH(49.5, 105);
const AVRIL_SUD = dureeDuJourH(44.5, 105);

describe("l'ordre de débourrement", () => {
  it("le bouleau part avant le chêne, qui part avant le hêtre et le frêne", () => {
    // C'est un fait de terrain, et c'est lui qui décide de qui profite de la
    // lumière d'avril sous un couvert encore nu.
    const dj = (id: string) => getEspece(id).phenologie.debourrementDJ;
    expect(dj("betula_pendula")).toBeLessThan(dj("quercus_pubescens"));
    expect(dj("quercus_pubescens")).toBeLessThan(dj("fagus_sylvatica"));
    expect(dj("fagus_sylvatica")).toBeLessThan(dj("fraxinus_excelsior"));
  });

  it("à cumul égal, le bouleau est feuillé quand le frêne est encore nu", () => {
    const bouleau = getEspece("betula_pendula");
    const frene = getEspece("fraxinus_excelsior");
    // 200 °C·j : mi-avril dans le nord de la France.
    expect(partFoliaire(bouleau, 200, AVRIL_NORD, false, 0)).toBeGreaterThan(0.9);
    expect(partFoliaire(frene, 200, AVRIL_NORD, false, 0)).toBe(0);
  });
});

describe("la porte photopériodique", () => {
  it("sans elle, le Sud débourrerait en hiver — elle l'en empêche", () => {
    // La lande girondine a déjà cumulé 340 °C·j au 12 avril quand le limon du
    // Nord n'en a que 123 : le forçage seul ferait partir le chêne six
    // semaines trop tôt. La photopériode, elle, ne se réchauffe pas.
    const chene = getEspece("quercus_pubescens");
    const cumulLargementSuffisant = 600;
    // Mi-février au sud : jour court, rien ne part malgré la chaleur.
    const fevrierSud = dureeDuJourH(44.5, 46);
    expect(partFoliaire(chene, cumulLargementSuffisant, fevrierSud, false, 0)).toBe(0);
    // Mi-avril, la porte s'entrouvre ; fin avril elle est grande ouverte.
    expect(partFoliaire(chene, cumulLargementSuffisant, AVRIL_SUD, false, 0)).toBeGreaterThan(0.4);
    const finAvrilSud = dureeDuJourH(44.5, 120);
    expect(partFoliaire(chene, cumulLargementSuffisant, finAvrilSud, false, 0)).toBe(1);
  });

  it("le hêtre est le plus photopériodique des feuillus de l'atlas", () => {
    const seuil = (id: string) => getEspece(id).phenologie.seuilJourH;
    expect(seuil("fagus_sylvatica")).toBeGreaterThan(seuil("betula_pendula"));
    expect(seuil("fagus_sylvatica")).toBeGreaterThanOrEqual(seuil("quercus_pubescens"));
  });
});

describe("le déploiement et la chute sont progressifs", () => {
  it("le feuillage sort par degrés, pas d'un coup", () => {
    const chene = getEspece("quercus_pubescens");
    const dj = chene.phenologie.debourrementDJ;
    const debut = partFoliaire(chene, dj + 5, 14, false, 0);
    const milieu = partFoliaire(chene, dj + 45, 14, false, 0);
    const fin = partFoliaire(chene, dj + 120, 14, false, 0);
    expect(debut).toBeGreaterThan(0);
    expect(milieu).toBeGreaterThan(debut);
    expect(fin).toBeGreaterThan(milieu);
    expect(fin).toBe(1);
  });

  it("les feuilles tombent sur plusieurs semaines", () => {
    const chene = getEspece("quercus_pubescens");
    const jourCourt = 10;
    const parts = [0, 1, 2, 3, 4, 5].map((s) => partFoliaire(chene, 900, jourCourt, true, s));
    for (let i = 1; i < parts.length; i++) {
      expect(parts[i] ?? 0).toBeLessThanOrEqual(parts[i - 1] ?? 0);
    }
    expect(parts[0]).toBe(1);
    expect(parts[ETALEMENT_CHUTE_SEMAINES]).toBe(0);
  });

  it("un sempervirent garde son feuillage toute l'année", () => {
    const pin = getEspece("pinus_sylvestris");
    expect(partFoliaire(pin, 0, 9, false, 0)).toBe(1);
    expect(partFoliaire(pin, 900, 9, true, 10)).toBe(1);
  });
});

describe("le besoin de froid : un hiver doux RETARDE le printemps", () => {
  it("sans froid, il faut bien plus de chaleur pour débourrer", () => {
    // C'est le paradoxe documenté du réchauffement sur la phénologie de
    // printemps : le bourgeon ne sort pas de dormance sans avoir eu froid, et
    // un hiver trop doux recule le débourrement au lieu de l'avancer.
    const hetre = getEspece("fagus_sylvatica");
    const hiverNormal = debourrementExigeDJ(hetre, 20);
    const hiverDoux = debourrementExigeDJ(hetre, 4);
    expect(hiverNormal).toBeCloseTo(hetre.phenologie.debourrementDJ, 6);
    expect(hiverDoux).toBeGreaterThan(1.5 * hiverNormal);
  });

  it("le hêtre en souffre plus que le bouleau : il en réclame davantage", () => {
    // La littérature est nette sur l'ordre : le besoin de froid du bouleau et
    // du chêne est bien moindre que celui du hêtre.
    const froid = (id: string) => getEspece(id).phenologie.besoinFroidSemaines;
    expect(froid("fagus_sylvatica")).toBeGreaterThan(froid("betula_pendula"));
    expect(froid("fagus_sylvatica")).toBeGreaterThan(froid("quercus_pubescens"));
    // À hiver également doux, le hêtre est le plus pénalisé des deux.
    const penalite = (id: string) =>
      debourrementExigeDJ(getEspece(id), 5) / getEspece(id).phenologie.debourrementDJ;
    expect(penalite("fagus_sylvatica")).toBeGreaterThan(penalite("betula_pendula"));
  });

  it("seul le froid UTILE compte : ni le gel profond ni la douceur", () => {
    expect(semaineDeFroid(5)).toBe(true);
    expect(semaineDeFroid(-3)).toBe(false);
    expect(semaineDeFroid(14)).toBe(false);
  });

  it("un hiver doux retarde le feuillage à date égale", () => {
    const hetre = getEspece("fagus_sylvatica");
    const jourLong = 14;
    const chaleur = 260; // de quoi débourrer après un hiver normal
    expect(partFoliaire(hetre, chaleur, jourLong, false, 0, 20)).toBeGreaterThan(0);
    expect(partFoliaire(hetre, chaleur, jourLong, false, 0, 3)).toBe(0);
  });
});

/**
 * Le CONTEXTE phénologique : les cinq scalaires qui suffisent à retrouver le
 * calendrier d'une semaine sans avoir l'état de la partie sous la main. C'est
 * ce qui voyage dans l'instantané, et ce qui garantit que le rendu colore les
 * houppiers avec exactement le calendrier du moteur (src/game/snapshot.ts).
 */
describe("le contexte phénologique", () => {
  it("l'automne commence au solstice, pas au 1ᵉʳ janvier", () => {
    const printemps = contextePhenologique(49.5, SOLSTICE_ETE_SEMAINE - 1, 400, 20);
    const ete = contextePhenologique(49.5, SOLSTICE_ETE_SEMAINE, 400, 20);
    expect(printemps.automne).toBe(false);
    expect(ete.automne).toBe(true);
  });

  it("le compteur de chute ne part qu'à la semaine de sénescence", () => {
    expect(
      contextePhenologique(49.5, SENESCENCE_DEBUT_SEMAINE, 900, 20).semainesDepuisSenescence,
    ).toBe(0);
    expect(
      contextePhenologique(49.5, SENESCENCE_DEBUT_SEMAINE + 3, 900, 20).semainesDepuisSenescence,
    ).toBe(3);
    // Avant le solstice, il n'y a rien à compter.
    expect(contextePhenologique(49.5, 10, 300, 20).semainesDepuisSenescence).toBe(0);
  });

  it("le jour raccourcit plus vite au nord : le contexte le sait", () => {
    const nord = contextePhenologique(49.5, 45, 900, 20);
    const sud = contextePhenologique(44.5, 45, 900, 20);
    expect(nord.jourH).toBeLessThan(sud.jourH);
  });

  it("il redonne exactement `partFoliaire` : une seule loi, deux appelants", () => {
    const chene = getEspece("quercus_pubescens");
    const ctx = contextePhenologique(49.5, 45, 900, 20);
    expect(partFoliaireDans(chene, ctx)).toBe(
      partFoliaire(chene, 900, ctx.jourH, true, ctx.semainesDepuisSenescence, 20),
    );
    // Et la sénescence est enclenchée : le compteur de chute tourne.
    expect(senescenceEnCoursDans(ctx)).toBe(true);
  });
});

describe("la sénescence, distincte de la chute", () => {
  const chene = getEspece("quercus_pubescens");
  const pin = getEspece("pinus_sylvestris");
  /** Un jour d'automne déjà court : la sénescence est enclenchée. */
  const jourCourt = 10;

  it("elle DEVANCE la chute : le houppier est encore garni et déjà doré", () => {
    // C'est tout l'automne, et c'est ce que la part foliaire seule ne disait
    // pas : beaucoup de feuilles, plus une qui travaille.
    const semaine = ETALEMENT_SENESCENCE_SEMAINES;
    const accrochee = partFoliaire(chene, 900, jourCourt, true, semaine);
    const jaunie = senescenceFoliaire(chene, jourCourt, true, semaine);
    expect(accrochee).toBeGreaterThan(0.5);
    expect(jaunie).toBe(1);
  });

  it("elle est nulle avant que le jour ne raccourcisse assez", () => {
    // Un jour long d'août : rien n'a commencé, même après le solstice.
    expect(senescenceFoliaire(chene, 15, true, 0)).toBe(0);
    // Et jamais au printemps, quelle que soit la durée du jour.
    expect(senescenceFoliaire(chene, 10, false, 5)).toBe(0);
  });

  it("un sempervirent ne sénesce pas : pas d'automne pour un pin", () => {
    expect(senescenceFoliaire(pin, jourCourt, true, 10)).toBe(0);
    expect(partFoliaireActive(pin, 0, jourCourt, true, 10)).toBe(1);
  });

  it("le feuillage ACTIF tombe à zéro avant le feuillage accroché", () => {
    // La conséquence qui compte pour le moteur : l'arbre cesse de produire
    // (donc de pousser et de transpirer) alors qu'il porte encore ses
    // feuilles. Sans ça, un automne doux faisait pousser un houppier mort.
    const semaine = ETALEMENT_SENESCENCE_SEMAINES;
    expect(partFoliaireActive(chene, 900, jourCourt, true, semaine)).toBe(0);
    expect(partFoliaire(chene, 900, jourCourt, true, semaine)).toBeGreaterThan(0);
  });

  it("l'actif décroît sans jamais dépasser l'accroché", () => {
    let precedent = Number.POSITIVE_INFINITY;
    for (let s = 0; s <= ETALEMENT_CHUTE_SEMAINES; s++) {
      const actif = partFoliaireActive(chene, 900, jourCourt, true, s);
      const accrochee = partFoliaire(chene, 900, jourCourt, true, s);
      expect(actif).toBeLessThanOrEqual(accrochee + 1e-9);
      expect(actif).toBeLessThanOrEqual(precedent + 1e-9);
      precedent = actif;
    }
  });

  it("en pleine saison, l'actif EST l'accroché : rien ne change l'été", () => {
    // Le garde-fou de non-régression : la sénescence ne doit toucher que
    // l'automne, sinon elle rognerait la croissance de toute l'année.
    const ete = partFoliaire(chene, 900, 15, false, 0);
    expect(partFoliaireActive(chene, 900, 15, false, 0)).toBeCloseTo(ete, 10);
  });
});

describe("rien ne tombe hors sénescence", () => {
  /**
   * Le bug que ce test verrouille : la chute des feuilles se calculait comme
   * l'écart entre `partFoliaire` de cette semaine et celui d'un cran plus tôt.
   * Au printemps, ces deux appels ont le même compteur de sénescence (zéro) —
   * leur seule différence était le besoin de froid, passé d'un côté et pas de
   * l'autre. Un hêtre dont la dormance n'était pas levée versait ainsi près
   * d'un tiers de son azote foliaire en litière EN PLEINE FEUILLAISON.
   *
   * Ce n'était pas une chute de feuilles : c'était deux lois comparées l'une à
   * l'autre. Le garde `senescenceEnCoursDans` supprime la cause.
   */
  const hetre = getEspece("fagus_sylvatica");

  it("au printemps, un froid insatisfait ne fait pas tomber de feuilles", () => {
    // Le cas exact : hêtre, 500 °C·j, trois semaines de froid pour un besoin
    // bien supérieur — la dormance n'est pas levée, le débourrement est
    // retardé, et rien ne doit tomber pour autant.
    expect(hetre.phenologie.besoinFroidSemaines).toBeGreaterThan(3);
    const printemps = contextePhenologique(49.5, 16, 500, 3);
    expect(senescenceEnCoursDans(printemps)).toBe(false);

    // C'est bien la comparaison qui divergeait : sans le garde, l'écart entre
    // les deux appels est positif alors que le feuillage ne fait que SORTIR.
    const avecFroid = partFoliaireDans(hetre, printemps);
    const sansFroid = partFoliaireDans(hetre, {
      ...printemps,
      semainesDeFroid: Number.POSITIVE_INFINITY,
    });
    expect(sansFroid).toBeGreaterThan(avecFroid);
  });

  it("en automne, la sénescence est bien enclenchée et le froid n'entre plus", () => {
    // La branche d'automne de `partFoliaire` ignore le besoin de froid : les
    // deux contextes doivent donc donner exactement la même chose.
    const automne = contextePhenologique(49.5, SENESCENCE_DEBUT_SEMAINE + 2, 900, 3);
    expect(senescenceEnCoursDans(automne)).toBe(true);
    expect(partFoliaireDans(hetre, automne)).toBeCloseTo(
      partFoliaireDans(hetre, { ...automne, semainesDeFroid: Number.POSITIVE_INFINITY }),
      10,
    );
  });
});
