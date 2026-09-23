/**
 * CE QUE LA STRATE BASSE REND AU SOL (issue #201).
 *
 * Mesuré avant ce lot, une prairie spontanée à 0,95 de couverture sur limon
 * riche, sans arbre ni intervention :
 *
 *     an        1     11     21     31     41
 *     humus   6549   5711   4986   4359   3815   kg C
 *     litière  0,00   0,00   0,00   0,00   0,00
 *
 * **Le stock d'humus perdait 42 % en cinquante ans sous une prairie fermée**,
 * et la litière restait à zéro les deux mille six cents semaines. En énumérant
 * les écritures du pool de litière — chute de feuilles d'ARBRE, crottes de
 * chevreuil, BRF et fumier, érosion qui redépose — il manquait une ligne : la
 * strate herbacée n'y versait rien. Ni sénescence, ni racines fines, ni chaume,
 * ni paille.
 *
 * Park Grass, prairie permanente non fertilisée depuis 1856, tient son stock.
 *
 * Ce fichier tient quatre choses :
 *
 *   1. **le témoin** — renouvellement neutralisé, le moteur d'avant à l'octet ;
 *   2. **la prairie trouve son équilibre**, sur la durée de Park Grass ;
 *   3. **la litière aussi**, et à un stock d'ordre réaliste — ce qui n'allait
 *      pas de soi, et qui a demandé une seconde correction ;
 *   4. **la paille immobilise avant de rendre**, parce que son C/N vaut 90.
 */

import { describe, expect, it } from "vitest";
import { applyAction, type GameAction } from "../../src/engine/actions";
import {
  CARBONE_COUVERT_FERME_G_M2,
  HERBACEES,
  litiereRendue,
  N_HERBACEES,
} from "../../src/engine/herbacees";
import { syntheticYear } from "../../src/engine/meteo";
import { litterDecayRate } from "../../src/engine/nitrogen";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type GameState } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

const METEO = syntheticYear(LIMON_RICHE.climat);
const somme = (a: readonly number[] | Float64Array) => Array.from(a).reduce((x, y) => x + y, 0);

/** Une prairie spontanée, sans arbre et sans geste, sur `ans` années. */
function prairie(ans: number, cote = 30) {
  const station = { ...LIMON_RICHE.station, coteM: cote, voisinage: [] };
  let s: GameState = createGameState(station, rngStateFromSeed(4));
  const humus: number[] = [];
  const litiere: number[] = [];
  for (let i = 0; i < ans * 52; i++) {
    const m = METEO[i % 52];
    if (!m) throw new Error("météo manquante");
    s = tick(s, m).state;
    if (i % 52 === 51) {
      humus.push(somme(s.soil.humusCG) / 1000);
      litiere.push(somme(s.soil.litterCG) / 1000);
    }
  }
  return { humus, litiere, etat: s, aireHa: (cote * cote) / 10_000 };
}

describe("le témoin : sans renouvellement, rien n'a changé", () => {
  it("un renouvellement nul rend exactement le moteur d'avant le lot", () => {
    // **Le témoin F16 du lot**, et il est exact plutôt qu'approché : ce lot
    // touche C16, C17, C18, E13 et H19, tous verts. Ce que le moteur faisait
    // avant est le cas particulier `renouvellementAn = 0` — la litière rendue
    // vaut zéro, donc aucune écriture, donc aucun changement d'état.
    for (const fiche of HERBACEES) {
      expect(litiereRendue(0, fiche.litiere.cSurN)).toEqual({ c: 0, n: 0 });
    }
    // Et la conversion est LINÉAIRE en la part de couvert : rien ne se crée
    // aux petites valeurs, rien ne sature aux grandes.
    const dactyle = HERBACEES.find((h) => h.id === "dactylis_glomerata");
    if (!dactyle) throw new Error("fiche du dactyle manquante");
    const moitie = litiereRendue(0.5, dactyle.litiere.cSurN);
    const entier = litiereRendue(1, dactyle.litiere.cSurN);
    expect(2 * moitie.c).toBeCloseTo(entier.c, 12);
    expect(2 * moitie.n).toBeCloseTo(entier.n, 12);
  });

  it("et la FAUCHE n'a pas bougé d'un gramme", () => {
    // Le seul chemin qui existait avant ce lot portait deux nombres nus :
    // `litterNG += coupe * 4` et `litterCG += coupe * 4 * 25`. Ils sont
    // devenus une constante nommée et le C/N de la fiche — et le dactyle, qui
    // est l'espèce de la prairie du moteur, porte justement 25. Un couvert
    // fermé rend donc toujours 100 g de carbone et 4 g d'azote au mètre carré.
    const dactyle = HERBACEES.find((h) => h.id === "dactylis_glomerata");
    if (!dactyle) throw new Error("fiche du dactyle manquante");
    const { c, n } = litiereRendue(1, dactyle.litiere.cSurN);
    expect(c).toBeCloseTo(1 * 4 * 25, 12);
    expect(n).toBeCloseTo(1 * 4, 12);
    expect(CARBONE_COUVERT_FERME_G_M2).toBe(100);
  });
});

describe("une prairie permanente ne se décarbonise pas", () => {
  it("son humus s'ajuste, puis il TIENT — sur la durée de Park Grass", () => {
    // **Le repère porte une durée, donc le dispositif la porte aussi.** C'est
    // la leçon du lot du soc (#141) : opposer trente ans de moteur à cent
    // soixante-dix ans d'essai n'est pas le même dispositif. Park Grass est
    // non fertilisée depuis 1856, on mesure donc sur cent soixante-dix ans.
    //
    // Relevé à l'écriture :
    //
    //     an       1    21    41    61    81   101   121   141   161
    //     humus  6571  6284  6109  5997  5925  5883  5860  5856  5857  kg C
    //     litière 131   235   236   234   234   234   236   234   236
    //
    // L'humus s'ajuste de 11 % sur le premier siècle — le point de départ de
    // la station n'est pas son équilibre — puis il TIENT : quatre dixièmes de
    // kilo d'écart entre l'an 141 et l'an 161, sur cinq tonnes huit. Avant ce
    // lot il perdait 42 % en cinquante ans et continuait de descendre, en
    // ligne droite, vers rien.
    const r = prairie(170);
    const an = (a: number) => r.humus[a - 1] ?? 0;
    // Il descend d'abord, et pas de beaucoup.
    expect(an(161)).toBeLessThan(an(1));
    expect(an(161)).toBeGreaterThan(0.8 * an(1));
    // Puis il TIENT : le dernier quart de siècle ne bouge plus d'un pour cent.
    expect(Math.abs(an(161) - an(141)) / an(141)).toBeLessThan(0.01);
    // Et il tient HAUT, pas à l'agonie : plus de cinquante tonnes de carbone à
    // l'hectare, l'ordre de grandeur d'un sol de prairie sur limon.
    expect(an(161) / r.aireHa / 1000).toBeGreaterThan(40);
  }, 1_800_000);

  it("et sa litière trouve son stock d'équilibre, ce qui n'allait pas de soi", () => {
    // **La deuxième erreur du lot, et c'est l'essai qui l'a dite.** Le premier
    // jet branchait l'apport sans toucher à `litterK`, la vitesse de
    // décomposition d'une cellule — un mélange pondéré des vitesses de ce qui
    // y est tombé. Sur une parcelle SANS ARBRE, personne ne l'avait jamais
    // posée : elle valait zéro, donc la litière ne se décomposait pas du tout
    // et s'empilait à 99 t C/ha après quarante ans. Elle se déduit du C/N,
    // donc le trait de la fiche suffisait déjà.
    const r = prairie(60);
    const parHa = (kg: number) => kg / r.aireHa / 1000;
    const fin = r.litiere[59] ?? 0;
    // Un tapis de litière de prairie se compte en quelques tonnes de carbone à
    // l'hectare, jamais en dizaines *(à confirmer)*.
    expect(parHa(fin)).toBeGreaterThan(0.5);
    expect(parHa(fin)).toBeLessThan(10);
    // Et c'est un ÉQUILIBRE, pas une pente : les vingt dernières années ne
    // bougent plus. Sans `litterK`, cette ligne échouait franchement.
    const avant = r.litiere[39] ?? 0;
    expect(Math.abs(fin - avant) / avant).toBeLessThan(0.05);
  }, 1_800_000);
});

describe("la paille reste au champ, et son C/N décide de la suite", () => {
  it("le blé porte le C/N le plus élevé de l'atlas, et de loin", () => {
    // **C'est le trait le plus conséquent du bloc.** Une paille de céréale est
    // à 80-100 : elle IMMOBILISE l'azote du sol le temps que les
    // micro-organismes la digèrent, et ne le rend qu'ensuite. Un feuillage
    // herbacé jeune est à 15-25 et se minéralise en quelques semaines.
    const ble = HERBACEES.find((h) => h.id === "triticum_aestivum");
    const anemone = HERBACEES.find((h) => h.id === "anemone_nemorosa");
    if (!ble || !anemone) throw new Error("fiches manquantes");
    expect(ble.litiere.cSurN).toBeGreaterThan(3 * anemone.litiere.cSurN);
    // Et le C/N commande la vitesse, sans qu'on ait à l'écrire : une paille se
    // décompose plusieurs fois plus lentement qu'une feuille tendre.
    expect(litterDecayRate(ble.litiere.cSurN)).toBeLessThan(
      litterDecayRate(anemone.litiere.cSurN) / 3,
    );
    // À masse de carbone égale, elle rend beaucoup moins d'azote.
    expect(litiereRendue(1, ble.litiere.cSurN).c).toBeCloseTo(
      litiereRendue(1, anemone.litiere.cSurN).c,
      12,
    );
    expect(litiereRendue(1, ble.litiere.cSurN).n).toBeLessThan(
      litiereRendue(1, anemone.litiere.cSurN).n / 3,
    );
  });

  it("une moisson laisse du carbone au sol là où elle n'en laissait aucun", () => {
    // Le geste lui-même. Avant ce lot, `applyMoissonner` mettait le feuillage
    // à zéro : le grain était vendu et **le reste s'évaporait**.
    const COTE = 20;
    const R = 8;
    const station = { ...LIMON_RICHE.station, coteM: COTE, voisinage: [] };
    const fiche = HERBACEES.find((h) => h.id === "triticum_aestivum");
    if (!fiche?.culture) throw new Error("fiche du blé manquante");
    const BLE = fiche.culture;
    let s: GameState = createGameState(station, rngStateFromSeed(4));
    const centre = COTE / 2;
    const geste = (a: GameAction) => {
      s = applyAction(s, a).state;
    };
    let litiereAvantMoisson = 0;
    let nppAvantMoisson = 0;
    for (let w = 0; w < 52 * 2; w++) {
      const sem = w % 52;
      if (sem === BLE.semisWeek - 1)
        geste({ type: "labourer", week: w, x: centre, y: centre, rayonM: R });
      if (sem === BLE.semisWeek) {
        geste({
          type: "semer",
          week: w,
          x: centre,
          y: centre,
          rayonM: R,
          cultureId: "triticum_aestivum",
        });
      }
      if (sem === BLE.recolteWeek) {
        litiereAvantMoisson = somme(s.soil.litterCG);
        nppAvantMoisson = s.carbon.nppCumKgC;
        geste({ type: "moissonner", week: w, x: centre, y: centre, rayonM: R });
      }
      const m = METEO[sem];
      if (!m) throw new Error("météo manquante");
      s = tick(s, m).state;
    }
    const rendu = somme(s.soil.litterCG) - litiereAvantMoisson;
    expect(rendu).toBeGreaterThan(0);
    // **Et il est CRÉDITÉ à la production primaire**, sans quoi on le ferait
    // apparaître de nulle part — c'est la plante qui l'a fixé. La strate
    // n'était pas au bilan carbone du tout, si bien que le seul geste qui
    // l'alimentait, la fauche, en créait en silence : la propriété de
    // conservation ne passe pas par `faucher`.
    expect(s.carbon.nppCumKgC - nppAvantMoisson).toBeGreaterThan(0);
  }, 600_000);
});

describe("aucune espèce n'est nommée, et l'atlas porte tout", () => {
  it("chaque herbacée déclare ses deux traits, dans des gammes tenables", () => {
    expect(HERBACEES.length).toBe(N_HERBACEES);
    for (const h of HERBACEES) {
      // Un C/N de litière végétale vit entre la légumineuse et la paille.
      expect(h.litiere.cSurN).toBeGreaterThanOrEqual(10);
      expect(h.litiere.cSurN).toBeLessThanOrEqual(100);
      // Un renouvellement négatif n'a pas de sens ; au-delà de cinq fois par
      // an non plus, pour une plante tempérée.
      expect(h.litiere.renouvellementAn).toBeGreaterThanOrEqual(0);
      expect(h.litiere.renouvellementAn).toBeLessThanOrEqual(5);
    }
  });

  it("une ANNUELLE renouvelle moins qu'une pérenne, et c'est sa biologie", () => {
    // Le blé fait un cycle et s'en va : ce qui reste en place est sa racine,
    // son appareil aérien partant d'un coup à la moisson. Une pérenne, elle,
    // renouvelle feuilles et racines fines toute l'année et plusieurs fois.
    const ble = HERBACEES.find((h) => h.id === "triticum_aestivum");
    const dactyle = HERBACEES.find((h) => h.id === "dactylis_glomerata");
    if (!ble || !dactyle) throw new Error("fiches manquantes");
    expect(ble.litiere.renouvellementAn).toBeLessThan(dactyle.litiere.renouvellementAn);
  });
});
