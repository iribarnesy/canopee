/**
 * LES ARBRES À CAVITÉS (issue #183, critère J3).
 *
 * Le critère dit « les gros arbres ET les arbres à cavités valent plusieurs
 * jeunes », et il était ✅ à moitié : le moteur savait creuser une tête de
 * têtard (`trogne.ts`) et rien d'autre. Or le vieux chêne creux d'un bocage
 * n'a pas été conduit en trogne — il a été blessé par des coups de vent, et la
 * carie de #182 fabrique exactement ce creux-là sans que personne le compte.
 *
 * Ce fichier vérifie trois choses, dans l'ordre où elles comptent :
 *   1. le creux se calcule, et son ordre de grandeur sépare la loge d'une
 *      mésange de celle d'une chevêche sans qu'aucun seuil ne le décide ;
 *   2. à cavités nulles, RIEN ne bouge — ni l'indice, ni la carte des
 *      auxiliaires. Le lot touche deux critères déjà verts (J3, G3) et il doit
 *      pouvoir prouver qu'il ne les a pas déplacés par accident ;
 *   3. et il PAIE : là où des arbres se creusent, les auxiliaires logent mieux.
 */

import { describe, expect, it } from "vitest";
import { serieMeteoPour } from "../../src/data/meteo";
import { indiceBiodiversite } from "../../src/engine/biodiversite";
import {
  CARIE_EVIDEE,
  partHabitatDeCavites,
  volumeCaviteTotalL,
  volumeCaviteTroncL,
} from "../../src/engine/cavites";
import { advanceWeek } from "../../src/engine/game";
import { serieToWeeks } from "../../src/engine/meteo";
import { carteBiotique } from "../../src/engine/ravageurs";
import { rngStateFromSeed } from "../../src/engine/rng";
import {
  createGameState,
  type GameState,
  gridDims,
  plantScattered,
  type Station,
} from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { partCariee } from "../../src/engine/tempete";
import type { TreeState } from "../../src/engine/trees";
import { CAVITE_HABITAT_L } from "../../src/engine/trogne";

/** Un arbre nu, juste ce qu'il faut pour les fonctions de cavité. */
const arbre = (diametreCm: number, heightM: number, rayonCarieCm: number) => ({
  diametreCm,
  heightM,
  recepages: 0,
  carie: rayonCarieCm > 0 ? { rayonCm: rayonCarieCm, barriereCm: diametreCm / 2 } : undefined,
});

describe("le creux se compte en litres, et les litres trient les espèces", () => {
  it("la même formule donne le nid d'une mésange et le gîte d'une chevêche", () => {
    // Rien dans le code ne distingue les deux cas : c'est la géométrie qui
    // s'en charge. Un chêne de 50 cm creux à mi-rayon et une perche de 15 cm
    // creuse au même degré ont la MÊME part de rayon cariée, et deux ordres de
    // grandeur d'écart en volume.
    const chene = volumeCaviteTroncL(arbre(50, 20, 12.5));
    const perche = volumeCaviteTroncL(arbre(15, 8, 3.75));
    expect(partCariee(arbre(50, 20, 12.5).carie, 50)).toBeCloseTo(0.5, 9);
    expect(partCariee(arbre(15, 8, 3.75).carie, 15)).toBeCloseTo(0.5, 9);
    expect(chene).toBeGreaterThan(CAVITE_HABITAT_L);
    expect(perche).toBeGreaterThan(2);
    expect(perche).toBeLessThan(15);
    expect(chene / perche).toBeGreaterThan(20);
  });

  it("un arbre sain n'offre rien, et un arbre est UN arbre", () => {
    expect(volumeCaviteTroncL(arbre(50, 20, 0))).toBe(0);
    expect(partHabitatDeCavites(arbre(50, 20, 0))).toBe(0);
    // Têtard ET carié : les deux creux s'additionnent en litres, mais la part
    // d'habitat plafonne — sans quoi un seul arbre vaudrait deux habitats.
    const double = { ...arbre(60, 10, 20), teteTrogneM: 2, recepages: 10 };
    expect(volumeCaviteTotalL(double)).toBeGreaterThan(volumeCaviteTroncL(double));
    expect(partHabitatDeCavites(double)).toBe(1);
  });

  it("le creux suit la carie, et il est borné par ce qu'il reste de bois", () => {
    // `CARIE_EVIDEE` dit que tout le bois carié n'est pas parti : il en reste
    // en décomposition au fond. Le volume évidé ne peut donc pas dépasser
    // cette part du fût, même à cœur entièrement pourri.
    const croissant = [0, 5, 10, 20, 25].map((r) => volumeCaviteTroncL(arbre(50, 20, r)));
    for (let i = 1; i < croissant.length; i++) {
      expect(croissant[i] ?? 0).toBeGreaterThan(croissant[i - 1] ?? 0);
    }
    const tout = volumeCaviteTroncL(arbre(50, 20, 25));
    const fut = volumeCaviteTroncL({
      ...arbre(50, 20, 25),
      carie: { rayonCm: 25, barriereCm: 25 },
    });
    expect(tout).toBeCloseTo(fut, 9);
    expect(tout).toBeLessThan(CARIE_EVIDEE * 1000 * 0.5 * 20); // très large, c'est un garde-fou
  });
});

/** Cent vingt ans de chênes, les coups de vent faisant les blessures. */
function siecleDeChenes(graine: number, ans = 120): GameState {
  const COTE = 40;
  const station: Station = { ...LIMON_RICHE.station, coteM: COTE, voisinage: [] };
  const serie = serieMeteoPour(LIMON_RICHE.station.id);
  if (!serie) throw new Error("série manquante");
  const meteo = serieToWeeks(serie);
  let s: GameState = plantScattered(
    createGameState(station, rngStateFromSeed(graine)),
    "quercus_pubescens",
    300,
  );
  for (let i = 0; i < ans * 52; i++) {
    const w = meteo[i % meteo.length];
    if (!w) throw new Error("météo manquante");
    s = advanceWeek(s, w, []).state;
  }
  return s;
}

/** Le même peuplement, mais dont aucun arbre ne s'est jamais creusé. */
const sansCreux = (trees: readonly TreeState[]): TreeState[] =>
  trees.map((t) => ({ ...t, carie: undefined, teteTrogneM: undefined }));

describe("ce que le lot promet de NE PAS faire", () => {
  it("un peuplement déjà riche en bois mort ne gagne rien aux cavités", () => {
    // Le lot touche G3, qui est ✅, et la garantie doit être structurelle, pas
    // mesurée. Le terme de gîte prend le PLUS GÉNÉREUX du bois mort et des
    // creux : au-delà de vingt tonnes à l'hectare il est déjà saturé, donc les
    // creux ne peuvent rien y ajouter, et les deux cartes coïncident au bit
    // près. Si le terme avait été AJOUTÉ au lieu de se substituer, ce test
    // tomberait sur toutes les cellules à la fois.
    const s = siecleDeChenes(7, 40);
    const dims = gridDims(s.station);
    const herbe = [...s.soil.herbeCouverture];
    const avec = carteBiotique(s.trees, herbe, 25, dims).habitat;
    const sans = carteBiotique(sansCreux(s.trees), herbe, 25, dims).habitat;
    for (let i = 0; i < avec.length; i++) expect(avec[i]).toBe(sans[i]);
  }, 900_000);

  it("et ailleurs, un creux ne peut jamais APPAUVRIR une cellule", () => {
    // La monotonie, qui est l'autre moitié de la garantie : le mécanisme est à
    // sens unique. Une cellule ne doit jamais valoir moins parce qu'un arbre
    // s'y est creusé.
    const s = siecleDeChenes(7, 40);
    const dims = gridDims(s.station);
    const herbe = [...s.soil.herbeCouverture];
    const avec = carteBiotique(s.trees, herbe, 0, dims).habitat;
    const sans = carteBiotique(sansCreux(s.trees), herbe, 0, dims).habitat;
    for (let i = 0; i < avec.length; i++) {
      expect(avec[i] ?? 0).toBeGreaterThanOrEqual(sans[i] ?? 0);
    }
  }, 900_000);
});

// **UNE SEULE PARTIE POUR LES DEUX ESSAIS.** Cent vingt ans sur quarante mètres
// avec trois cents chênes coûte plusieurs minutes, et ce fichier la faisait
// tourner deux fois pour en lire deux choses différentes. Elle est déterministe :
// la partager ne change aucun résultat et divise le fichier par deux.
const SIECLE = siecleDeChenes(7);

describe("le vieil arbre creux paie, et la boucle se ferme", () => {
  it("un siècle de tempêtes loge les auxiliaires mieux qu'un peuplement sain", () => {
    // LA BOUCLE, dont tous les maillons existaient sauf le dernier : une
    // tempête arrache une branche (#181) → la plaie installe une carie qui ne
    // guérit pas (#182) → le cœur se vide → l'arbre devient un gîte → les
    // auxiliaires qui y logent écrêtent les pullulations (G3).
    //
    // La comparaison est APPARIÉE au sens fort : ce sont les mêmes arbres, au
    // même instant, aux mêmes coordonnées, avec les mêmes essences et les
    // mêmes hauteurs. La SEULE différence est qu'on a effacé leurs creux. Rien
    // d'autre ne peut expliquer l'écart.
    const s = SIECLE;
    const dims = gridDims(s.station);
    const herbe = [...s.soil.herbeCouverture];
    // Sans bois mort au dénominateur, sinon le terme de gîte est déjà saturé
    // et la question ne se pose pas — c'est précisément ce que dit le `max`.
    const avec = carteBiotique(s.trees, herbe, 0, dims).habitat;
    const sans = carteBiotique(sansCreux(s.trees), herbe, 0, dims).habitat;
    const moyenne = (a: Float64Array) => a.reduce((x, y) => x + y, 0) / a.length;
    const creux = s.trees.filter((t) => t.alive && volumeCaviteTotalL(t) > 0);
    // **CE COMPTE EST UN TIRAGE, PAS UNE GRANDEUR** (#199). Il demandait plus de
    // cinq arbres creux, et il est tombé à quatre quand le sanglier s'est mis à
    // arracher les semis. On a cherché de combien le boutis coûtait, et la
    // réponse est : de rien du tout. Les trois mesures, même graine, même météo,
    // cent vingt ans :
    //
    //     sanglier, pas de boutis (avant #199)     6 creux   141 vivants
    //     sanglier + boutis                        4 creux   136 vivants
    //     AUCUN SANGLIER DU TOUT                   4 creux   127 vivants
    //
    // **Retirer la bête entièrement donne le même quatre que le boutis.** Le
    // compte n'est donc monotone en rien : c'est ce que rend un siècle de coups
    // de vent sur une poignée de vieux arbres, et n'importe quelle perturbation
    // le déplace d'un ou deux. Le seuil était une photographie d'une trajectoire.
    //
    // Ce que cet essai AFFIRME, lui, n'a jamais dépendu de ce nombre : c'est la
    // comparaison appariée de la ligne d'en dessous — les mêmes arbres, au même
    // instant, aux mêmes coordonnées, dont on a seulement effacé les creux. Le
    // compte reste ici comme GARDE, pour que la comparaison ne soit pas vide, et
    // il est ramené à une valeur qui garde sa marge sur les trois mesures.
    expect(creux.length).toBeGreaterThan(2);
    expect(moyenne(avec)).toBeGreaterThan(moyenne(sans));
  }, 900_000);

  it("et l'indice de biodiversité les compte comme arbres-habitats", () => {
    const s = SIECLE;
    const petitsCreux = s.trees.filter(
      (t) => t.alive && t.heightM < 15 && partHabitatDeCavites(t) > 0,
    );
    expect(petitsCreux.length).toBeGreaterThan(0);
    const surfaceHa = (s.station.coteM * s.station.coteM) / 10_000;
    const avec = indiceBiodiversite(s.trees, 0, surfaceHa, s.station.coteM);
    const sans = indiceBiodiversite(sansCreux(s.trees), 0, surfaceHa, s.station.coteM);
    expect(avec.grosArbres).toBeGreaterThanOrEqual(sans.grosArbres);
  }, 900_000);
});
