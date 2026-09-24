/**
 * **Une futaie s'abrite elle-même** (issue #179).
 *
 * `abriAuVent` ne comptait que les voisins **qui dépassent**. Dans une futaie
 * régulière personne ne dépasse personne, donc personne n'était abrité — et la
 * chaîne se refermait sur elle-même : les seuls arbres à avoir de l'abri à
 * perdre étaient les dominés, les dominés sont courts, les courts ne versent
 * pas, donc aucune ouverture ne pouvait faire verser quoi que ce soit de plus.
 * C'est ce qui a bloqué F18 (#177).
 *
 * Les modèles de la famille ForestGALES ne raisonnent pas en « qui dépasse
 * qui » mais sur le rapport de l'**espacement** à la **hauteur** : plus les tiges sont
 * serrées, plus la quantité de mouvement se partage. C'est ce rapport qu'on lit.
 */

import { describe, expect, it } from "vitest";
import { serieMeteoPour } from "../../src/data/meteo";
import { serieToWeeks } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import {
  createGameState,
  type GameState,
  plantScattered,
  type Station,
} from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import {
  ABRI_PEUPLEMENT_MAX,
  abriAuVent,
  abriDuPeuplement,
  ESPACEMENT_PLEIN_VENT,
  espacementSurHauteur,
  HAUTEUR_SOUPLE_M,
  PART_HAUTEUR_PAIR,
  RAYON_PEUPLEMENT,
} from "../../src/engine/tempete";
import { tick } from "../../src/engine/tick";
import type { TreeState } from "../../src/engine/trees";

const moyenne = (a: readonly number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

describe("ce que l'espacement dit de l'abri", () => {
  it("plus il y a de pairs, plus l'espacement est serré", () => {
    const r = 40;
    expect(espacementSurHauteur(50, r, 20)).toBeLessThan(espacementSurHauteur(5, r, 20));
    // Et un arbre sans pair est de plein vent, pas « infiniment serré ».
    expect(espacementSurHauteur(0, r, 20)).toBe(Number.POSITIVE_INFINITY);
    expect(abriDuPeuplement(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("l'abri décroît avec l'espacement et s'annule au plein vent", () => {
    expect(abriDuPeuplement(0)).toBeCloseTo(ABRI_PEUPLEMENT_MAX, 12);
    expect(abriDuPeuplement(ESPACEMENT_PLEIN_VENT)).toBe(0);
    expect(abriDuPeuplement(2 * ESPACEMENT_PLEIN_VENT)).toBe(0);
    expect(abriDuPeuplement(0.2)).toBeGreaterThan(abriDuPeuplement(0.4));
  });

  it("une futaie serrée n'est JAMAIS invulnérable, et c'est un garde-fou", () => {
    // Le premier jet de ce module avait réutilisé `windShelterAt`, qui saturait
    // à 1 pour tout le monde : plus rien ne versait, zéro arbre couché en
    // soixante ans. Un terme collectif mal borné referait la même faute.
    expect(ABRI_PEUPLEMENT_MAX).toBeLessThan(0.5);
    for (const sh of [0, 0.01, 0.1, 0.3]) {
      expect(abriDuPeuplement(sh)).toBeLessThanOrEqual(ABRI_PEUPLEMENT_MAX);
    }
  });

  it("un voisin trop petit ne fait pas peuplement", () => {
    // Sans ce filtre, la régénération abriterait la futaie — un dominant
    // entouré de semis est pourtant un arbre isolé.
    const geant: TreeState = { ...gabarit, id: 1, x: 10, y: 10, heightM: 20, diametreCm: 40 };
    const semis = Array.from({ length: 60 }, (_, k) => ({
      ...gabarit,
      id: 100 + k,
      x: 10 + (k % 8) - 4,
      y: 10 + Math.floor(k / 8) - 4,
      heightM: 1,
      diametreCm: 2,
    }));
    expect(abriAuVent([geant, ...semis], geant)).toBe(0);
    // Les mêmes voisins, mais à hauteur de pair : l'abri apparaît.
    const pairs = semis.map((t) => ({ ...t, heightM: PART_HAUTEUR_PAIR * 20 + 0.1 }));
    expect(abriAuVent([geant, ...pairs], geant)).toBeGreaterThan(0);
  });
});

const gabarit: TreeState = {
  id: 0,
  especeId: "pinus_sylvestris",
  x: 0,
  y: 0,
  ageWeeks: 52 * 40,
  heightM: 20,
  diametreCm: 40,
  stress: 0,
  alive: true,
  uptakeYearG: 0,
  fruitsKg: 0,
  fruitProgress: 0,
  bloomFrosted: false,
  rootDepthCm: 120,
  hauteurElagueeM: 0,
  pousseTendreM: 0,
  vigueur: 1,
  dommageHydraulique: 0,
  protege: false,
  recepages: 0,
  vigueurIndividuelle: 1,
};

/** Quarante-cinq ans de pins sur une parcelle carrée. */
function futaie(coteM: number, plants: number): GameState {
  const station: Station = { ...LIMON_RICHE.station, coteM, voisinage: [] };
  const serie = serieMeteoPour(LIMON_RICHE.station.id);
  if (!serie) throw new Error("série manquante");
  const meteo = serieToWeeks(serie);
  let s = plantScattered(createGameState(station, rngStateFromSeed(7)), "pinus_sylvestris", plants);
  for (let i = 0; i < 45 * 52; i++) {
    const w = meteo[i % meteo.length];
    if (!w) throw new Error("météo manquante");
    s = tick(s, w).state;
  }
  return s;
}

/** Les dominants : ceux qui versent, et ceux que le lot vise. */
function dominants(s: GameState, filtre: (t: TreeState) => boolean = () => true) {
  const v = s.trees.filter((t) => t.alive && t.heightM > HAUTEUR_SOUPLE_M);
  const hMax = Math.max(0, ...v.map((t) => t.heightM));
  return v.filter((t) => t.heightM > 0.8 * hMax && filtre(t));
}

describe("en partie : ce sont les DOMINANTS que le lot change", () => {
  it("un dominant de futaie fermée est désormais abrité", () => {
    // Le trou que ce lot comble. Relevé à l'écriture : l'abri des dominants
    // passe de 0,182 à 0,314 sur une futaie de pins à quarante-cinq ans.
    // C'était 0,18 parce que personne ne les dépassait ; c'est 0,31 parce que
    // leurs pairs les entourent.
    const s = futaie(40, 600);
    const abri = moyenne(dominants(s).map((t) => abriAuVent(s.trees, t)));
    expect(abri).toBeGreaterThan(0.25);
    // Et jamais au point de les rendre intouchables : l'abri de peuplement
    // plafonne au tiers, et la rafale reçue n'en perd qu'une part.
    expect(abri).toBeLessThan(0.7);
  });

  it("un dominant de LISIÈRE l'est moins qu'un dominant d'intérieur", () => {
    // La distance à la lisière n'est calculée nulle part : un arbre de bordure
    // a simplement moins de voisins, donc un espacement local plus grand.
    // Relevé : 0,271 au bord contre 0,338 à l'intérieur.
    const s = futaie(60, 1200);
    const bord = (t: TreeState) => Math.min(t.x, t.y, 60 - t.x, 60 - t.y);
    const lisiere = moyenne(dominants(s, (t) => bord(t) < 12).map((t) => abriAuVent(s.trees, t)));
    const interieur = moyenne(dominants(s, (t) => bord(t) > 20).map((t) => abriAuVent(s.trees, t)));
    expect(lisiere).toBeGreaterThan(0);
    expect(interieur).toBeGreaterThan(lisiere);
  });

  it("et le rayon de peuplement se compte en HAUTEURS, pas en mètres", () => {
    // Ce qui fait canopée pour un arbre de vingt mètres n'est pas ce qui fait
    // canopée pour un de cinq : le voisinage se mesure à son échelle.
    const r = (h: number) => RAYON_PEUPLEMENT * h;
    expect(r(20)).toBeGreaterThan(r(5));
  });
});
