/**
 * **La zone d'un chantier** (issue #186).
 *
 * Ce fichier tient une chose, et c'est la seule qui rende le refactor sûr :
 * **pour un disque, la nouvelle géométrie rend exactement ce que rendait
 * l'ancienne.** Pas « à peu près », pas « en moyenne » — les mêmes indices dans
 * le même ordre, et les mêmes flottants au bit près. Dix actions ont changé de
 * signature ; sans cette égalité, rien ne distingue un refactor réussi d'un
 * refactor qui déplace silencieusement toutes les parties.
 *
 * ── **ce qui a été tenté d'abord**, **et pourquoi c'était faux** ─────────────────────
 *
 * Le premier contrôle épinglait en dur le `stateHash` d'une partie de douze ans,
 * relevé sur le commit d'**avant** (`ffca0fb`). Il passait ici et **tombait en CI**.
 * Ce n'était pas le refactor : `stateHash` est un FNV-1a sur les flottants bruts
 * de chaque arbre, donc un **ulp** n'importe où le change, et le moteur ne rend pas
 * les mêmes derniers bits selon la version de V8. Mesuré des deux côtés :
 *
 *     empreinte de la même partie      avant (ffca0fb)   après (ce lot)
 *     Node 20 (V8 11.3), Node 22 (12.4)   3 806 937 118   3 806 937 118
 *     Node 24 (V8 13.6) — celui de la CI    633 354 304     633 354 304
 *
 * Le refactor est donc bien neutre **sur les deux** plateformes ; c'est la valeur
 * absolue qui n'est pas portable. Un essai dont le verdict dépend de la machine
 * ne prouve rien — c'est la même faute que l'essai qui écrivait dans mon dossier
 * de travail et passait chez moi. On ne l'assertait donc pas : on garde la
 * mesure ci-dessus comme relevé, et les contrôles ci-dessous, qui sont exacts et
 * portables. Le bout-à-bout, lui, est tenu par la suite entière — 1 671 essais
 * dont des centaines épinglent des grandeurs écologiques, verts avant comme
 * après, sous Node 22 comme sous Node 24.
 *
 * (Et la conclusion qui dépasse ce lot : les **chiffres** du moteur sont portables,
 * ses **bits** ne le sont pas. Sorti en #193.)
 */

import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/engine/actions";
import { cellIndexAt, forEachDiscCell, type GridDims } from "../../src/engine/grid";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type Station } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import {
  aireM2DeLaZone,
  cellulesDeLaZone,
  perimetreMDeLaZone,
  pourChaqueCelluleDeLaZone,
  type Zone,
  zoneContient,
} from "../../src/engine/zone";

const DIMS: GridDims = { widthM: 40, heightM: 40 };

/** L'ancienne route, telle quelle, pour comparer. */
function ancien(cx: number, cy: number, r: number, dims: GridDims = DIMS): number[] {
  const out: number[] = [];
  forEachDiscCell(dims, cx, cy, r, (i) => out.push(i));
  return out;
}

/**
 * `cellulesDuDisque` **de l'ancien** `actions.ts`, recopiée telle quelle. Ce n'est
 * pas la même route que `forEachDiscCell` : elle balaie toute la parcelle et
 * n'a **pas** la garantie « au moins une cellule ». Les deux existaient, les deux
 * doivent être reproduites.
 */
function ancienneCellulesDuDisque(cote: number, cx: number, cy: number, rayonM: number): number[] {
  const out: number[] = [];
  const r2 = rayonM * rayonM;
  for (let y = 0; y < cote; y++) {
    for (let x = 0; x < cote; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r2) out.push(y * cote + x);
    }
  }
  return out;
}

/** Générateur reproductible : un balayage au hasard vaut mieux qu'un cas choisi. */
function tirage(graine: number): () => number {
  let s = graine;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

describe("le disque ne bouge pas d'un indice", () => {
  it("rend exactement les mêmes cellules qu'avant, sur tous les cas de bord", () => {
    // Centré, décentré, à cheval sur le bord, débordant complètement, minuscule
    // au point de ne toucher aucun centre de cellule — le cas que la garantie
    // « au moins une cellule » existe pour couvrir.
    const cas: [number, number, number][] = [
      [20, 20, 5],
      [20, 20, 0.5],
      [20.5, 20.5, 0.1],
      [0, 0, 3],
      [39.9, 39.9, 4],
      [20, 20, 100],
      [-5, 20, 8],
      [20, 20, 1],
      [7.3, 31.8, 6.4],
    ];
    for (const [x, y, rayonM] of cas) {
      const attendu = ancien(x, y, rayonM);
      const obtenu: number[] = [];
      pourChaqueCelluleDeLaZone(DIMS, { x, y, rayonM }, (i) => obtenu.push(i));
      expect(obtenu, `disque (${x}, ${y}, r=${rayonM})`).toEqual(attendu);
    }
  });

  it("et sur cinq cents disques tirés au hasard, les deux routes d'avant", () => {
    // Neuf cas choisis prouvent ce à quoi on a pensé. Cinq cents tirés prouvent
    // aussi ce à quoi on n'a pas pensé — et c'est bien ce qui est arrivé : le
    // balayage a trouvé la **seconde** divergence du refactor, que les neuf cas de
    // bord avaient manquée.
    //
    // `cellulesDuDisque` n'avait **pas** la garantie « au moins une cellule », que
    // `forEachDiscCell` avait. Les deux vivaient côte à côte dans `actions.ts` :
    // `semer` et `moissonner` passaient par la première, tout le reste par la
    // seconde, si bien qu'un semis de vingt centimètres ne semait rien du tout
    // — en silence, et facturé. La zone unifie sur la garantie, donc ce cas-là
    // change, et lui seul : hors de lui, les deux listes sont identiques.
    const suivant = tirage(20260922);
    let degeneres = 0;
    for (let n = 0; n < 500; n++) {
      const x = -5 + suivant() * 50;
      const y = -5 + suivant() * 50;
      const rayonM = suivant() * 25;
      const zone: Zone = { x, y, rayonM };

      const parcours: number[] = [];
      pourChaqueCelluleDeLaZone(DIMS, zone, (i) => parcours.push(i));
      expect(parcours, `parcours (${x}, ${y}, r=${rayonM})`).toEqual(ancien(x, y, rayonM));

      const attendu = ancienneCellulesDuDisque(40, x, y, rayonM);
      const obtenu = cellulesDeLaZone(40, zone);
      if (attendu.length > 0) {
        expect(obtenu, `liste (${x}, ${y}, r=${rayonM})`).toEqual(attendu);
      } else {
        degeneres++;
        expect(obtenu, `liste dégénérée (${x}, ${y}, r=${rayonM})`).toEqual([
          cellIndexAt(DIMS, x, y),
        ]);
      }
    }
    // Le cas dégénéré doit être **rencontré**, sinon la branche ci-dessus ne prouve
    // rien — et rester rare, sinon le tirage ne teste plus le cas courant.
    expect(degeneres).toBeGreaterThan(0);
    expect(degeneres).toBeLessThan(40);
  });

  it("l'aire et le périmètre sont les MÊMES FLOTTANTS, pas des valeurs proches", () => {
    // `toBe` et non `toBeCloseTo` : ces nombres facturent des heures de chantier
    // et entrent dans le `stateHash`. Une réassociation d'un **ulp** suffirait à
    // déplacer une partie, donc l'expression doit être la même, pas équivalente.
    const suivant = tirage(7);
    for (let n = 0; n < 2000; n++) {
      const rayonM = suivant() * 60;
      expect(aireM2DeLaZone({ x: 0, y: 0, rayonM })).toBe(Math.PI * rayonM * rayonM);
      expect(perimetreMDeLaZone({ x: 0, y: 0, rayonM })).toBe(2 * Math.PI * rayonM);
    }
  });

  it("et `zoneContient` tranche exactement comme le test au carré d'avant", () => {
    // Les actions ne testent pas que des centres de cellule : `labourer` et
    // `eclaircir` testent aussi des **positions d'arbre**, continues.
    const suivant = tirage(99);
    for (let n = 0; n < 5000; n++) {
      const cx = suivant() * 40;
      const cy = suivant() * 40;
      const rayonM = suivant() * 20;
      const px = suivant() * 40;
      const py = suivant() * 40;
      const dx = px - cx;
      const dy = py - cy;
      expect(zoneContient({ x: cx, y: cy, rayonM }, px, py)).toBe(
        dx * dx + dy * dy <= rayonM * rayonM,
      );
    }
  });

  it("LE SEUL ENDROIT QUI N'EST PAS AU BIT PRÈS, et de combien", () => {
    // `choisirTigesAEclaircir` écrivait `(Math.PI * r2) / 10_000`, soit
    // π·(r·r) ; les cinq autres appels écrivaient `Math.PI * r * r`, soit
    // (π·r)·r. Les deux familles se contredisaient **déjà** d'un **ulp** entre elles :
    // il n'existe donc pas d'« avant » unique à préserver. `aireM2DeLaZone`
    // prend la forme majoritaire, et l'éclaircie se décale d'au plus un **ulp** sur
    // 30 % des rayons.
    //
    // Ce décalage ne peut changer une partie que s'il fait basculer le
    // `Math.round` du nombre de tiges à garder. Balayé sur les rayons et les
    // densités plausibles : jamais.
    let differents = 0;
    let couples = 0;
    for (let r = 0.5; r <= 60; r += 0.05) {
      const avant = (Math.PI * (r * r)) / 10_000;
      const apres = (Math.PI * r * r) / 10_000;
      for (const densite of [50, 100, 120, 150, 200, 300, 400, 500, 800, 1000, 1600, 2500]) {
        couples++;
        if (Math.round(densite * avant) !== Math.round(densite * apres)) differents++;
      }
    }
    expect(couples).toBeGreaterThan(14_000);
    expect(differents).toBe(0);
  });
});

describe("l'empreinte d'un chantier sur le sol est celle d'avant", () => {
  // Les contrôles ci-dessus portent sur la géométrie prise à part. Ceux-ci la
  // prennent **par l'autre bout** : on joue l'action, et on regarde quelles cellules
  // du sol ont bougé. C'est ce qui attrape un argument mal branché — un centre
  // inversé, un rayon passé à la place d'un autre —, et les zones sont
  // volontairement **décentrées** et asymétriques pour qu'un échange de x et y se
  // voie. Instantané, et portable : on compare des ensembles d'indices, pas des
  // flottants.
  const COTE = 40;
  const station: Station = { ...LIMON_RICHE.station, coteM: COTE, voisinage: [] };
  const neuf = () => createGameState(station, rngStateFromSeed(3));
  const dims: GridDims = { widthM: COTE, heightM: COTE };

  it("clôturer clôt exactement le disque, et pas son symétrique", () => {
    const { state } = applyAction(neuf(), {
      type: "cloturer",
      week: 10,
      x: 12.3,
      y: 27.8,
      rayonM: 6.4,
    });
    const closes = [...state.soil.cloture.keys()].filter((i) => state.soil.cloture[i]);
    expect(closes).toEqual(ancien(12.3, 27.8, 6.4, dims));
    expect(closes).not.toEqual(ancien(27.8, 12.3, 6.4, dims));
  });

  it("labourer tasse exactement le disque — l'autre route, celle sans garantie", () => {
    const { state, refusals } = applyAction(neuf(), {
      type: "labourer",
      week: 30,
      x: 9.7,
      y: 31.2,
      rayonM: 5.5,
    });
    expect(refusals).toEqual([]);
    const laboures = [...state.soil.tassement.keys()].filter(
      (i) => (state.soil.tassement[i] ?? 0) > 0,
    );
    expect(laboures).toEqual(ancienneCellulesDuDisque(COTE, 9.7, 31.2, 5.5));
  });

  it("chauler relève le pH exactement sur le disque", () => {
    const avant = neuf();
    const { state } = applyAction(avant, {
      type: "chauler",
      week: 12,
      x: 30.4,
      y: 8.1,
      rayonM: 7.2,
    });
    const chaulees = [...state.soil.ph.keys()].filter((i) => state.soil.ph[i] !== avant.soil.ph[i]);
    expect(chaulees).toEqual(ancienneCellulesDuDisque(COTE, 30.4, 8.1, 7.2));
  });
});

describe("la bande est une bande", () => {
  const horizontale: Zone = {
    zone: "bande",
    x: 20,
    y: 20,
    longueurM: 30,
    largeurM: 4,
    orientationRad: 0,
  };

  it("elle est longue dans son axe et étroite en travers", () => {
    expect(zoneContient(horizontale, 20, 20)).toBe(true);
    expect(zoneContient(horizontale, 34, 20)).toBe(true); // 14 m le long : dedans
    expect(zoneContient(horizontale, 36, 20)).toBe(false); // 16 m : dehors
    expect(zoneContient(horizontale, 20, 21.9)).toBe(true); // 1,9 m en travers
    expect(zoneContient(horizontale, 20, 22.1)).toBe(false); // 2,1 m : dehors
  });

  it("la tourner d'un quart de tour échange sa longueur et sa largeur", () => {
    const verticale: Zone = { ...horizontale, orientationRad: Math.PI / 2 };
    expect(zoneContient(verticale, 20, 34)).toBe(true);
    expect(zoneContient(verticale, 34, 20)).toBe(false);
    expect(zoneContient(verticale, 21.9, 20)).toBe(true);
    // Et à rotation près, elles couvrent le même nombre de cellules.
    expect(cellulesDeLaZone(40, verticale).length).toBe(cellulesDeLaZone(40, horizontale).length);
  });

  it("une bande en diagonale n'est ni l'une ni l'autre", () => {
    const diagonale: Zone = { ...horizontale, orientationRad: Math.PI / 4 };
    expect(zoneContient(diagonale, 20 + 10 / Math.SQRT2, 20 + 10 / Math.SQRT2)).toBe(true);
    expect(zoneContient(diagonale, 34, 20)).toBe(false);
  });

  it("son aire est celle d'un rectangle, et son périmètre aussi", () => {
    expect(aireM2DeLaZone(horizontale)).toBeCloseTo(120, 12);
    expect(perimetreMDeLaZone(horizontale)).toBeCloseTo(68, 12);
  });

  it("une bande trop fine pour toucher un centre de cellule en touche une quand même", () => {
    // Même garantie que le disque, et pour la même raison : un chantier désigné
    // agit quelque part. Une bande de 10 cm de large sur une grille au mètre ne
    // doit pas être un geste qui ne fait rien en silence.
    const fine: Zone = { ...horizontale, largeurM: 0.1, longueurM: 0.1 };
    expect(cellulesDeLaZone(40, fine).length).toBe(1);
  });

  it("elle se laisse borner par la parcelle, comme le disque", () => {
    const debordante: Zone = { ...horizontale, x: 0, y: 0, longueurM: 200, largeurM: 200 };
    expect(cellulesDeLaZone(40, debordante).length).toBe(40 * 40);
  });
});
