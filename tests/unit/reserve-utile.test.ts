/**
 * **Deux réserves utiles**, **deux noms** (#190).
 *
 * Un même nom — `ruMm` — désignait la réserve du **profil entier** côté moteur et
 * celle du **seul horizon de surface** dans `StationInfo`. Les deux sont des
 * millimètres d'eau, rien à l'usage ne les distinguait, et le sélecteur
 * d'essences a pris l'une pour l'autre : sur le limon le plus riche du jeu, il
 * écartait huit espèces — dont le hêtre, le frêne et le pommier — comme si le
 * sol était trop sec pour elles.
 *
 * Ces essais tiennent la propriété par ses deux bouts : que les deux grandeurs
 * soient bien **différentes** sur une station à plusieurs horizons (sinon
 * l'essai ne prouverait rien), et que ce soit la bonne des deux qui décide.
 */

import { describe, expect, it } from "vitest";
import { ESPECES_V0 } from "../../src/engine/especes";
import { especeTenable } from "../../src/engine/paysage";
import { ruHorizonMm } from "../../src/engine/soil";
import { LIMON_RICHE } from "../../src/engine/stations";

const STATION = LIMON_RICHE.station;
const PREMIER = STATION.profil[0];
if (!PREMIER) throw new Error("profil vide");
const RU_SURFACE = ruHorizonMm(PREMIER);
const PH = PREMIER.ph;

/** Les huit que le mauvais chiffre écartait. */
const ECARTEES_A_TORT = [
  "alnus_glutinosa",
  "fagus_sylvatica",
  "malus_domestica",
  "sambucus_nigra",
  "carpinus_betulus",
  "ilex_aquifolium",
  "salix_alba",
  "fraxinus_excelsior",
];

describe("les deux réserves du limon riche", () => {
  it("ne sont pas la même : le profil en tient près du triple de sa surface", () => {
    expect(STATION.profil.length).toBeGreaterThan(1);
    expect(RU_SURFACE).toBeLessThan(120);
    expect(STATION.ruMm).toBeGreaterThan(120);
  });

  it("changent la réponse du filtre : c'est là que le piège se refermait", () => {
    const avecSurface = ESPECES_V0.filter((e) => especeTenable(e, PH, RU_SURFACE));
    const avecProfil = ESPECES_V0.filter((e) => especeTenable(e, PH, STATION.ruMm));
    expect(avecProfil.length).toBeGreaterThan(avecSurface.length);
  });

  it("avec le PROFIL, la flore du limon profond tient — dont le pommier du premier niveau", () => {
    for (const id of ECARTEES_A_TORT) {
      const espece = ESPECES_V0.find((e) => e.id === id);
      if (!espece) throw new Error(`espèce inconnue : ${id}`);
      expect(especeTenable(espece, PH, STATION.ruMm), `${espece.nom} sur limon riche`).toBe(true);
    }
  });

  it("avec la SURFACE, elles tombent toutes — l'essai échouerait si le défaut revenait", () => {
    for (const id of ECARTEES_A_TORT) {
      const espece = ESPECES_V0.find((e) => e.id === id);
      if (!espece) throw new Error(`espèce inconnue : ${id}`);
      expect(especeTenable(espece, PH, RU_SURFACE), `${espece.nom} sur 68 mm`).toBe(false);
    }
  });
});
