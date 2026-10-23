/**
 * **Fertiliser, enfin atteignable** (#435, `src/game/fertilisation.ts`).
 *
 * Le moteur épand de l'ammonitrate et du fumier depuis #140, de la potasse
 * depuis #395, et aucun bouton ne le lui demandait. Ce que ces épreuves
 * tiennent est que le jeu **ne décide rien** du geste : les bornes du curseur
 * sont les plafonds du moteur, la dose part dans le champ de sa forme, et la
 * ligne du journal dit la surface et le prix que le moteur a comptés — pas une
 * estimation refaite à côté.
 */

import { describe, expect, it } from "vitest";
import {
  AZOTE_MINERAL_EUR_KG,
  applyAction,
  DOSE_AZOTE_MAX_KG_HA,
  DOSE_POTASSE_MAX_KG_HA,
  FUMIER_CN_RATIO,
  FUMIER_EUR_KG_N,
  FUMIER_K_SUR_N,
  type GameAction,
  POTASSE_EUR_KG_K2O,
  prevoirAction,
} from "../../src/engine/actions";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { aireM2DeLaZone, cellulesDeLaZone, type Zone } from "../../src/engine/zone";
import {
  actionDeFertilisation,
  bornerLaDose,
  DOSE_MIN,
  direLaFertilisation,
  doseDeLAction,
  ENGRAIS,
  eurosLus,
  FORMES_ENGRAIS,
  type FormeEngrais,
} from "../../src/game/fertilisation";
import type { ActionSansSemaine } from "../../src/game/protocol";

const COTE = 20;
const ETAT = createGameState(
  { ...LIMON_RICHE.station, coteM: COTE, voisinage: [] },
  rngStateFromSeed(4),
);
const DISQUE: Zone = { x: 10, y: 10, rayonM: 5 };

/** L'action telle que le worker la date, à la semaine ouverte. */
function datee(action: ActionSansSemaine): GameAction {
  return { ...action, week: ETAT.week } as GameAction;
}

function prevoir(forme: FormeEngrais, dose: number, zone: Zone = DISQUE) {
  return prevoirAction(ETAT, datee(actionDeFertilisation(forme, dose, zone)));
}

describe("le curseur s'arrête où le moteur refuse", () => {
  it("le plafond de chaque forme est la constante que le moteur lit pour refuser", () => {
    // Importées, pas recopiées : le jour où le moteur recalibre un plafond, le
    // curseur le suit sans qu'on y touche.
    expect(ENGRAIS.mineral.doseMax).toBe(DOSE_AZOTE_MAX_KG_HA);
    expect(ENGRAIS.fumier.doseMax).toBe(DOSE_AZOTE_MAX_KG_HA);
    expect(ENGRAIS.potasse.doseMax).toBe(DOSE_POTASSE_MAX_KG_HA);
  });

  it("les deux bouts du curseur passent, et le moteur refuse juste au-delà", () => {
    for (const forme of FORMES_ENGRAIS) {
      const fiche = ENGRAIS[forme];
      expect(prevoir(forme, DOSE_MIN), forme).toEqual([]);
      expect(prevoir(forme, fiche.doseMax), forme).toEqual([]);
      const refus = prevoir(forme, fiche.doseMax + 1);
      expect(refus, forme).toHaveLength(1);
      // Et le refus parle dans **l'unité de la forme** : c'est bien le plafond
      // de la potasse qui borne la potasse, pas celui de l'azote.
      expect(refus[0]?.reason).toContain("ce n'est plus fertiliser");
      expect(refus[0]?.reason).toContain(fiche.unite);
    }
  });

  it("une dose réglée est ramenée dans ce que le moteur accepte", () => {
    expect(bornerLaDose("potasse", 0)).toBe(DOSE_MIN);
    expect(bornerLaDose("potasse", -40)).toBe(DOSE_MIN);
    expect(bornerLaDose("potasse", 400)).toBe(DOSE_POTASSE_MAX_KG_HA);
    expect(bornerLaDose("fumier", 400)).toBe(DOSE_AZOTE_MAX_KG_HA);
    expect(bornerLaDose("mineral", 47.6)).toBe(48);
    // Un curseur qui rendrait n'importe quoi ne casse pas la dose : on repart
    // de celle qu'on proposait.
    expect(bornerLaDose("potasse", Number.NaN)).toBe(ENGRAIS.potasse.doseParDefaut);
  });
});

describe("les doses proposées d'abord", () => {
  it("sont celles que les sources citées donnent", () => {
    // Le palier du milieu de Broadbalk, le plafond de la directive nitrates
    // pour l'organique, la dose moyenne des blés qui reçoivent de la potasse
    // (Agreste 2017) — chacune dite à sa ligne dans `fertilisation.ts`.
    expect(ENGRAIS.mineral.doseParDefaut).toBe(96);
    expect(ENGRAIS.fumier.doseParDefaut).toBe(170);
    expect(ENGRAIS.potasse.doseParDefaut).toBe(48);
  });

  it("le moteur les accepte toutes, chacune dans son unité", () => {
    for (const forme of FORMES_ENGRAIS) {
      const fiche = ENGRAIS[forme];
      expect(fiche.doseParDefaut).toBeLessThanOrEqual(fiche.doseMax);
      expect(prevoir(forme, fiche.doseParDefaut), forme).toEqual([]);
    }
  });
});

describe("l'action envoyée", () => {
  it("porte la dose dans le champ de sa forme", () => {
    // Une potasse envoyée en `doseKgNHa` serait, pour le moteur, une dose nulle.
    expect(actionDeFertilisation("potasse", 48, DISQUE)).toEqual({
      type: "fertiliser",
      ...DISQUE,
      forme: "potasse",
      doseKgK2OHa: 48,
    });
    expect(actionDeFertilisation("fumier", 170, DISQUE)).toEqual({
      type: "fertiliser",
      ...DISQUE,
      forme: "fumier",
      doseKgNHa: 170,
    });
    expect(actionDeFertilisation("mineral", 96, DISQUE)).toEqual({
      type: "fertiliser",
      ...DISQUE,
      forme: "mineral",
      doseKgNHa: 96,
    });
  });

  it("une bande passe telle quelle, comme pour les autres gestes de zone", () => {
    const bande: Zone = {
      zone: "bande",
      x: 10,
      y: 10,
      longueurM: 16,
      largeurM: 4,
      orientationRad: 0.3,
    };
    expect(actionDeFertilisation("potasse", 48, bande)).toMatchObject(bande);
    expect(prevoir("potasse", 48, bande)).toEqual([]);
  });

  it("la dose se relit quelle que soit la forme", () => {
    for (const forme of FORMES_ENGRAIS) {
      const action = datee(actionDeFertilisation(forme, 77, DISQUE));
      if (action.type !== "fertiliser") throw new Error("pas une fertilisation");
      expect(doseDeLAction(action)).toBe(77);
    }
  });
});

describe("la ligne du journal", () => {
  it("dit la forme, la dose dans son unité, la surface et le prix", () => {
    expect(direLaFertilisation("potasse", 48, 201, 0.8683)).toBe(
      "Potasse : 48 kg K₂O/ha sur 201 m², 0,87 € — le potassium entre dans l'échangeable",
    );
    expect(direLaFertilisation("mineral", 96, 2000, 28.8)).toBe(
      "Ammonitrate : 96 kg N/ha sur 2000 m², 29 € — l'azote est disponible tout de suite, et lessivable",
    );
    // Au-delà d'un demi-hectare, la surface se dit en hectares, comme au bilan.
    expect(direLaFertilisation("fumier", 170, 12_000, 510)).toBe(
      "Fumier : 170 kg N/ha sur 1,2 ha, 510 € — son azote viendra sur des années, son potassium tout de suite",
    );
  });

  it("un petit apport se lit au centime : « 0 € » le dirait gratuit", () => {
    // 48 kg K₂O/ha sur le plus petit disque du curseur (3 m) : douze centimes.
    expect(eurosLus(0.122)).toBe("0,12 €");
    expect(eurosLus(9.994)).toBe("9,99 €");
    expect(eurosLus(12.4)).toBe("12 €");
    // Le signe ne passe pas : la ligne dit un prix, pas un mouvement de caisse.
    expect(eurosLus(-3.5)).toBe("3,50 €");
  });

  it("la surface et le prix de la ligne sont ceux que le moteur a comptés", () => {
    // Un disque qui **déborde** du coin : le moteur ne fertilise que ce qui est
    // dans la parcelle, et ne fait payer que là. La ligne compte ces cellules
    // par la fonction même du moteur — l'aire du disque dirait plus.
    const coin: Zone = { x: 1, y: 1, rayonM: 5 };
    const m2 = cellulesDeLaZone(COTE, coin).length;
    expect(m2).toBeLessThan(aireM2DeLaZone(coin) / 2);
    for (const forme of FORMES_ENGRAIS) {
      const dose = ENGRAIS[forme].doseParDefaut;
      const apres = applyAction(ETAT, datee(actionDeFertilisation(forme, dose, coin))).state;
      const cout = ETAT.economy.treasuryEur - apres.economy.treasuryEur;
      // Ce que le moteur a facturé est la dose, sur ces mètres carrés, au prix
      // que le panneau affiche pour cette forme : si le moteur changeait de prix
      // ou de surface, le panneau et la ligne mentiraient, et c'est ici qu'on
      // le verrait.
      expect(cout, forme).toBeCloseTo(dose * (m2 / 10_000) * ENGRAIS[forme].prixEurKg, 9);
    }
  });
});

describe("ce que le panneau dit de chaque forme", () => {
  it("chaque forme a son nom, son unité et une explication qui commence par son prix", () => {
    for (const forme of FORMES_ENGRAIS) {
      const fiche = ENGRAIS[forme];
      expect(fiche.forme).toBe(forme);
      expect(fiche.nom).not.toBe("");
      expect(fiche.explication).toMatch(/^\d+(,\d+)? €\/kg (N|K₂O)[.,] /);
    }
    expect(ENGRAIS.potasse.unite).toBe("kg K₂O/ha");
    expect(ENGRAIS.mineral.unite).toBe("kg N/ha");
    expect(ENGRAIS.fumier.unite).toBe("kg N/ha");
    // Les nombres du moteur, à la française — pas une copie qui dériverait.
    const fr = (v: number) => v.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
    expect(ENGRAIS.potasse.explication.startsWith(`${fr(POTASSE_EUR_KG_K2O)} €/kg K₂O`)).toBe(true);
    expect(ENGRAIS.mineral.explication.startsWith(`${fr(AZOTE_MINERAL_EUR_KG)} €/kg N`)).toBe(true);
    expect(ENGRAIS.fumier.explication.startsWith(`${fr(FUMIER_EUR_KG_N)} €/kg N`)).toBe(true);
    expect(ENGRAIS.fumier.explication).toContain(`${fr(FUMIER_K_SUR_N)} kg K par kg N`);
    expect(ENGRAIS.fumier.explication).toContain(`C/N de ${FUMIER_CN_RATIO}`);
  });
});
