/**
 * Les tempêtes et le chablis (issue #55).
 *
 * Ce que le moteur ne savait pas faire : un arbre ne pouvait pas verser. Il
 * mourait de soif à cause du vent, jamais de sa poussée. Le mot « chablis »
 * était partout dans le vocabulaire et ne désignait jamais une tempête.
 *
 * Ce que ce fichier vérifie, et dans cet ordre : que la rafale est une grandeur
 * d'hiver et de queue de distribution ; que la vulnérabilité trie sur ce qui
 * trie vraiment (l'ancrage, le sol gorgé, la prise au vent, l'abri) ; et qu'en
 * partie, un sempervirent paie plus qu'un caduc et un site abrité ne paie rien.
 */

import { describe, expect, it } from "vitest";
import { serieMeteoPour } from "../../src/data/meteo";
import { advanceWeek } from "../../src/engine/game";
import { serieToWeeks } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantAt, type Station } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import {
  abriAuVent,
  facteurAncrage,
  facteurElancement,
  facteurPriseAuVent,
  facteurSolGorge,
  facteurSouplesse,
  partDeRafaleAHauteur,
  RAFALE_MAXIMALE_MS,
  rafaleDeLaSemaine,
} from "../../src/engine/tempete";
import type { TreeState } from "../../src/engine/trees";

const SERIE = serieMeteoPour("limon-riche");
if (!SERIE) throw new Error("série manquante");
const METEO = serieToWeeks(SERIE);

describe("la rafale : une grandeur d'hiver, et de queue de distribution", () => {
  /** Période de retour d'une rafale, en années, sur un long tirage. */
  function periodeDeRetourAns(seuilMs: number, ans = 4000): number {
    let n = 0;
    for (let i = 0; i < ans * 52; i++) {
      const w = METEO[i % METEO.length];
      if (!w) throw new Error("météo manquante");
      if (rafaleDeLaSemaine(12345, i, w.ventMoyMs) >= seuilMs) n++;
    }
    return n > 0 ? ans / n : Number.POSITIVE_INFINITY;
  }

  it("les fortes rafales sont rares, et d'autant plus rares qu'elles sont fortes", () => {
    // Ce qu'on exige est l'ORDRE DE GRANDEUR et la monotonie, pas la valeur :
    // la cinquantennale de plaine, que Météo-France situe vers 40-45 m/s, doit
    // tomber dans la bonne décennie de période de retour. Mesuré à l'écriture :
    // 1,6 an à 28 m/s, 10 ans à 36, 25 ans à 40, 84 ans à 45.
    const p28 = periodeDeRetourAns(28);
    const p40 = periodeDeRetourAns(40);
    const p45 = periodeDeRetourAns(45);
    expect(p28).toBeLessThan(5);
    expect(p40).toBeGreaterThan(10);
    expect(p40).toBeLessThan(60);
    expect(p45).toBeGreaterThan(p40);
  });

  it("elles tombent en hiver, sans qu'on l'ait écrit nulle part", () => {
    // La saison sort de la vitesse MOYENNE du vent (meteo.ts), maximale en
    // janvier : la queue de distribution s'appuie dessus. Aucune ligne de
    // `tempete.ts` ne parle de décembre.
    let hiver = 0;
    let ete = 0;
    for (let i = 0; i < 4000 * 52; i++) {
      const s = i % 52;
      const w = METEO[s];
      if (!w) throw new Error("météo manquante");
      if (rafaleDeLaSemaine(12345, i, w.ventMoyMs) < 36) continue;
      if (s < 9 || s >= 44) hiver++;
      else if (s >= 22 && s < 35) ete++;
    }
    expect(hiver).toBeGreaterThan(20 * Math.max(1, ete));
  });

  it("elle ne puise pas dans le flux principal : même partie, même tempête", () => {
    const w = METEO[2];
    if (!w) throw new Error("météo manquante");
    expect(rafaleDeLaSemaine(7, 100, w.ventMoyMs)).toBe(rafaleDeLaSemaine(7, 100, w.ventMoyMs));
    // Deux parties différentes ne voient pas le même hiver.
    expect(rafaleDeLaSemaine(7, 100, w.ventMoyMs)).not.toBe(rafaleDeLaSemaine(8, 100, w.ventMoyMs));
  });

  it("la queue est bornée : une exponentielle nue produisait 313 km/h", () => {
    let max = 0;
    for (let i = 0; i < 20000 * 52; i += 7) {
      const w = METEO[i % METEO.length];
      if (!w) throw new Error("météo manquante");
      max = Math.max(max, rafaleDeLaSemaine(99, i, w.ventMoyMs));
    }
    expect(max).toBeLessThanOrEqual(RAFALE_MAXIMALE_MS);
  });
});

describe("ce qui décide qu'un arbre verse", () => {
  it("le vent monte avec la hauteur : un semis est dans l'air lent", () => {
    expect(partDeRafaleAHauteur(1)).toBeLessThan(partDeRafaleAHauteur(10));
    expect(partDeRafaleAHauteur(10)).toBeLessThan(partDeRafaleAHauteur(25));
    // Par construction, la hauteur de l'anémomètre reçoit exactement 1.
    expect(partDeRafaleAHauteur(10)).toBeCloseTo(1, 6);
  });

  it("une jeune tige plie : elle n'est pas candidate", () => {
    expect(facteurSouplesse(3)).toBe(0);
    expect(facteurSouplesse(12)).toBe(1);
    expect(facteurSouplesse(8)).toBeGreaterThan(0);
    expect(facteurSouplesse(8)).toBeLessThan(1);
  });

  it("l'ancrage se juge sur le BRAS DE LEVIER, pas en centimètres", () => {
    // Un semis de deux mètres à trente centimètres de racines est MIEUX ancré
    // qu'un fût de vingt mètres à quarante : c'est le rapport qui compte, et
    // c'est ce qui a empêché la tempête de coucher des semis.
    expect(facteurAncrage(30, 2)).toBeGreaterThan(facteurAncrage(40, 20));
    expect(facteurAncrage(200, 20)).toBeGreaterThan(facteurAncrage(40, 20));
  });

  it("les deux régimes hydriques du moteur tiennent dans le barème", () => {
    // Le seuil a d'abord été calé sur des arbres d'une seule station, où l'été
    // sec pousse les racines vers le bas. Les deux populations que le moteur
    // produit vraiment doivent y tenir, sans quoi toute une forêt légitime se
    // retrouve au fond du barème — c'est ce qui couchait seize hêtres sur
    // soixante-quatre dans `lumiere.test.ts`, un fichier qui ne parle pas de
    // vent.
    //
    // Un hêtre de quarante ans entraîné par la sécheresse (95 cm à 16 m) :
    expect(facteurAncrage(95, 16)).toBe(1);
    // Le même sur un site jamais sec (44 cm à 20 m) : pénalisé, pas condamné.
    expect(facteurAncrage(44, 20)).toBeGreaterThan(0.85);
    // Et l'ancrage n'est pas le terme dominant : au pire il retire un
    // cinquième, quand la prise au vent en retire plus d'un tiers.
    expect(facteurAncrage(0, 25)).toBe(0.8);
  });

  it("un sol gorgé lâche les racines — sauf celles d'une espèce qui vit là", () => {
    // Le hêtre (tolérance 0,1) perd gros dans un bas-fond saturé.
    expect(facteurSolGorge(0.9, 0.1)).toBeLessThan(0.7);
    // L'aulne (tolérance 1) n'y perd rien : ses racines sont faites pour ce
    // sol-là. Sans cette nuance, l'aulnaie de fond de vallée se faisait coucher
    // tous les deux ans — mesuré.
    expect(facteurSolGorge(0.9, 1)).toBe(1);
    // Et un sol ressuyé ne coûte rien à personne.
    expect(facteurSolGorge(0, 0.1)).toBe(1);
  });

  it("un houppier plein prend plus de vent qu'un houppier nu", () => {
    expect(facteurPriseAuVent(1)).toBeLessThan(facteurPriseAuVent(0));
    expect(facteurPriseAuVent(0)).toBe(1);
  });

  it("l'élancement compte — mais le moteur ne lui laisse qu'un cinquième de sa gamme", () => {
    // Écrit sur la gamme sylvicole réelle (H/D 40 à 100)…
    expect(facteurElancement(40, 100)).toBe(1);
    expect(facteurElancement(40, 40)).toBeLessThan(0.5);
    // …mais le moteur ne produit que 35 à 49 (#79), où le facteur ne descend
    // pas sous 0,92. La limite est écrite ici pour qu'on la retrouve le jour où
    // l'amplitude s'ouvrira.
    expect(facteurElancement(15, 100 / 2.2)).toBeGreaterThan(0.9);
  });
});

describe("l'abri, au niveau de la CIME", () => {
  const arbre = (id: number, x: number, y: number, heightM: number): TreeState =>
    ({ id, x, y, heightM, alive: true }) as TreeState;

  it("une futaie régulière ne s'abrite pas elle-même", () => {
    // Tout le monde à la même hauteur : personne ne dépasse, personne n'est
    // protégé. C'est Klaus dans les pins alignés — et c'est exactement ce que
    // `windShelterAt` (light.ts) ne sait pas dire, lui qui sature à 1 ici.
    const peuplement = [
      arbre(1, 10, 10, 20),
      arbre(2, 14, 10, 20),
      arbre(3, 10, 14, 20),
      arbre(4, 6, 10, 20),
    ];
    expect(abriAuVent(peuplement, peuplement[0] as TreeState)).toBe(0);
  });

  it("un sous-étage est protégé par sa canopée", () => {
    const sousEtage = arbre(1, 10, 10, 3);
    const canopee = [sousEtage, arbre(2, 13, 10, 20), arbre(3, 10, 13, 20), arbre(4, 7, 10, 20)];
    expect(abriAuVent(canopee, sousEtage)).toBeGreaterThan(0.5);
  });

  it("un arbre isolé ne reçoit aucun abri", () => {
    const seul = arbre(1, 10, 10, 20);
    expect(abriAuVent([seul], seul)).toBe(0);
  });
});

/** Plante une parcelle entière et compte ce que les tempêtes y couchent. */
function soixanteAns(especeId: string, graine: number, ventExposition: number) {
  const COTE = 24;
  const station: Station = {
    ...LIMON_RICHE.station,
    coteM: COTE,
    voisinage: [],
    ventExposition,
  };
  let state = createGameState(station, rngStateFromSeed(graine));
  for (let y = 2; y < COTE; y += 3) {
    for (let x = 2; x < COTE; x += 3) state = plantAt(state, especeId, x, y, 0.5);
  }
  let tempetes = 0;
  let verses = 0;
  let volumeM3 = 0;
  const semaines: number[] = [];
  for (let i = 0; i < 60 * 52; i++) {
    const w = METEO[i % METEO.length];
    if (!w) throw new Error("météo manquante");
    const r = advanceWeek(state, w, []);
    state = r.state;
    if (!r.tempete) continue;
    tempetes++;
    verses += r.tempete.arbresVerses;
    volumeM3 += r.tempete.volumeM3;
    semaines.push(i % 52);
  }
  const vivants = state.trees.filter((t) => t.alive);
  return {
    tempetes,
    verses,
    volumeM3,
    semaines,
    hMax: Math.max(0, ...vivants.map((t) => t.heightM)),
  };
}

/**
 * EN PARTIE : ce que la tempête trie.
 *
 * Valeurs relevées à l'écriture, soixante ans sur limon riche, parcelle de
 * 24 m plantée à 3 m, deux graines :
 *
 * | | tempêtes | arbres couchés | volume |
 * |---|---|---|---|
 * | pin exposé | 17-18 | 65-88 | 33-41 m³ |
 * | hêtre exposé | 3-5 | 4-11 | 2-8 m³ |
 * | l'un ou l'autre, abrité | 0 | 0 | 0 |
 *
 * La colonne « tempêtes » compte les semaines où quelque chose est tombé : une
 * rafale qui passe sans rien coucher ne remonte pas (tick.ts). Les deux
 * peuplements voient donc les MÊMES rafales et n'en retiennent pas le même
 * nombre — c'est déjà le tri.
 *
 * On exige la DIRECTION graine par graine, pas le rapport : un rapport entre
 * deux comptes d'événements rares n'est pas une propriété du monde
 * (docs/realisme.md).
 */
describe("en partie : la tempête trie, et elle ne trie pas au hasard", () => {
  for (const graine of [3, 11]) {
    it(`graine ${graine} : le sempervirent paie l'hiver, le caduc nu s'en tire`, () => {
      const pin = soixanteAns("pinus_sylvestris", graine, 1);
      const hetre = soixanteAns("fagus_sylvatica", graine, 1);
      // Les deux peuplements arrivent à taille comparable : ce qui les sépare
      // au vent n'est pas leur hauteur, c'est leur feuillage de janvier.
      expect(pin.hMax).toBeGreaterThan(10);
      expect(hetre.hMax).toBeGreaterThan(10);
      expect(pin.verses).toBeGreaterThan(3 * Math.max(1, hetre.verses));
      expect(pin.volumeM3).toBeGreaterThan(hetre.volumeM3);
      // Et les tempêtes sont des événements d'hiver. Pas « jamais en été » :
      // une bourrasque de juin qui couche un arbre existe, et la série en donne
      // une (semaine 22, graine 11). Ce qui est une propriété du
      // monde, c'est la FORME de la distribution — les semaines où le vent
      // moyen de la série est au plancher (2,8-3,0 m/s, semaines 23 à 37) n'en
      // produisent aucune, et le gros tombe dans la moitié hivernale.
      const semaines = [...pin.semaines, ...hetre.semaines];
      for (const s of semaines) expect(s < 23 || s > 37).toBe(true);
      const hivernales = semaines.filter((s) => s >= 40 || s < 14).length;
      expect(hivernales).toBeGreaterThanOrEqual(0.75 * semaines.length);
    });

    it(`graine ${graine} : un site abrité ne paie rien, le même exposé paie`, () => {
      const expose = soixanteAns("pinus_sylvestris", graine, 1);
      const abrite = soixanteAns("pinus_sylvestris", graine, 0.15);
      expect(expose.verses).toBeGreaterThan(0);
      expect(abrite.verses).toBe(0);
      // Et ça se voit sur la forêt : sans tempête, la pinède monte plus haut.
      expect(abrite.hMax).toBeGreaterThan(expose.hMax);
    });
  }
});
