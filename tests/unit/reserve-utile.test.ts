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
 * l'essai ne prouverait rien), et que le filtre ne puisse plus se tromper de
 * réserve.
 *
 * **Depuis #312, le filtre ne lit plus la réserve du tout.** Sa clause d'eau
 * (confort hydrique > 0,6 sous 120 mm) a été retirée : son seuil avait été posé
 * sur des conforts déclarés sans source, et une fois le confort tiré de
 * l'indice de Niinemets et Valladares (2006), il retirait le bouleau des semis
 * de la lande. Les essais disaient jusque-là que la surface **change** la
 * réponse et que les huit espèces y **tombent** — ils recopiaient la sortie
 * d'une clause qui n'existe plus. Ce que la loi garantit maintenant est plus
 * fort : surface ou profil, le filtre répond la même chose, et le piège de
 * #190 ne peut plus se refermer par lui.
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

  it("avec le PROFIL, la flore du limon profond tient — dont le pommier du premier niveau", () => {
    for (const id of ECARTEES_A_TORT) {
      const espece = ESPECES_V0.find((e) => e.id === id);
      if (!espece) throw new Error(`espèce inconnue : ${id}`);
      expect(especeTenable(espece, PH, STATION.ruMm), `${espece.nom} sur limon riche`).toBe(true);
    }
  });

  it("surface ou profil, le filtre exclut les mêmes espèces : la réserve ne décide plus", () => {
    // La liste est **dérivée** du filtre, pas recopiée : ce qu'il exclut sur 68 mm
    // et ce qu'il exclut sur le profil entier. Pour qu'une égalité entre deux
    // listes vides ne passe pas pour une preuve, la liste ne doit pas être vide :
    // sur ce limon à pH 7, le pH écarte au moins les calcifuges de l'atlas.
    const exclues = (ruMm: number) =>
      ESPECES_V0.filter((e) => !especeTenable(e, PH, ruMm)).map((e) => e.id);
    expect(exclues(STATION.ruMm).length).toBeGreaterThan(0);
    expect(exclues(RU_SURFACE)).toEqual(exclues(STATION.ruMm));
  });
});
