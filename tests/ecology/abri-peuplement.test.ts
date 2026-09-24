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
  it("un dominant de futaie fermée est abrité ; celui d'une plantation clairsemée ne l'est pas", () => {
    // Le trou que ce lot comble. Relevé à l'écriture : l'abri des dominants
    // passe de 0,182 à 0,314 sur une futaie de pins à quarante-cinq ans.
    // C'était 0,18 parce que personne ne les dépassait ; c'est 0,31 parce que
    // leurs pairs les entourent.
    //
    // **et le seuil absolu qui en avait été tiré était couplé à la vitesse de
    // croissance du pin** (#201). Il demandait `abri > 0,25`, à mi-chemin entre
    // les deux relevés ; il est tombé à 0,221 quand le pin a été calé sur sa
    // table de production. Attribué en forçant le seul `pousseMaxMAn` dans
    // l'atlas, tout le reste égal :
    //
    //                          abri   dominants   hMax
    //     pin à 0,50          0,285       65      19,06
    //     pin à 0,45          0,221       51      18,19
    //
    // La cause est mécanique et vaut d'être écrite : **le rayon de peuplement se
    // compte en hauteurs** (l'essai du bas le dit), donc un peuplement 5 % plus
    // court regarde un disque 5 % plus petit, y trouve 10 % de voisins en moins,
    // et s'abrite d'autant moins. Un seuil absolu sur `abri` est donc une
    // photographie de la **taille** du peuplement autant que de sa fermeture — il
    // rebougera à chaque calage d'espèce. (Le reste de la dérive, 0,314 → 0,285,
    // est antérieur à ce lot et n'a pas été instruit ici.)
    //
    // L'essai change donc de grandeur, et prend le témoin qui manquait : **la
    // même parcelle, le même âge, la même espèce, peuplée dense ou clairsemée.**
    // Les deux bras montent et descendent ensemble avec la taille des arbres, et
    // ce qui reste est ce que le lot affirme — un dominant est abrité par ses
    // **pairs**, pas seulement par ce qui le dépasse. Mesuré à quarante-cinq ans sur
    // quarante mètres de côté :
    //
    //     600 plants (3 750/ha)   abri 0,221   51 dominants
    //     150 plants   (940/ha)   abri 0,245   51
    //      40 plants   (250/ha)   abri 0,073   21
    //
    // Trois fois plus d'abri dans la futaie que dans la plantation lâche, et
    // l'effet **sature** entre 150 et 600 tiges — au-delà, l'auto-éclaircie espace
    // les survivants autant que la densité les rapproche. Le seuil est une
    // marge (×2 pour un rapport mesuré à 3,0), pas une ancre.
    const dense = futaie(40, 600);
    const clairsemee = futaie(40, 40);
    const abriDense = moyenne(dominants(dense).map((t) => abriAuVent(dense.trees, t)));
    const abriClair = moyenne(dominants(clairsemee).map((t) => abriAuVent(clairsemee.trees, t)));
    expect(abriDense).toBeGreaterThan(2 * abriClair);
    // Un dominant isolé n'est pas à zéro non plus : il a des voisins, ils sont
    // juste loin. Ce que le lot nie, c'est qu'il faille être **dominé** pour être
    // abrité, pas qu'un arbre au large le soit un peu.
    expect(abriClair).toBeGreaterThan(0);
    // Et jamais au point de les rendre intouchables : l'abri de peuplement
    // plafonne au tiers, et la rafale reçue n'en perd qu'une part.
    expect(abriDense).toBeLessThan(0.7);
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
