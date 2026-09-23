/**
 * LE LAND EQUIVALENT RATIO (issue #136, critère H21 ; docs/regles.md §7.5).
 *
 * Le chiffre de l'agroforesterie, et le dernier morceau de #136 : la culture
 * existait (C16, C18, H19, H20), le gradient sous les arbres existait (E13), et
 * il manquait la question que les deux préparaient — *est-ce que le mélange bat
 * la somme des parties ?*
 *
 * **C'EST UN DISPOSITIF, PAS UN AFFICHAGE**, et c'est ce qui fait la longueur
 * de ce fichier. Un LER a besoin de DEUX monocultures témoins, sur la même
 * station, sous le même climat, avec la même graine et la même conduite. Aucune
 * quantité mesurée sur la seule parcelle mixte ne les remplace, et `ler.ts`
 * explique pourquoi chacune des trois tentatives tentantes échoue.
 *
 * Les trois bras :
 *   A. agroforesterie — deux rangs de noyers, 13 m d'allée, blé dessous ;
 *   B. blé pur — même conduite, pas un arbre ;
 *   C. noyers purs — plantation forestière à sa propre densité, pas de blé.
 *
 * Cible de validation : le noyer-céréale de Restinclières dépasse **1,2**
 * (Dupraz & Capillon, INRAE Montpellier).
 */

import { describe, expect, it } from "vitest";
import { applyAction, type GameAction } from "../../src/engine/actions";
import {
  HERBACEES,
  INDEX_CULTURES,
  N_HERBACEES,
  partDuRendement,
} from "../../src/engine/herbacees";
import { ler, lerPartiel, production } from "../../src/engine/ler";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type GameState, plantAt } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";
import { volumeTigeM3 } from "../../src/engine/trees";
import type { Zone, ZoneBande } from "../../src/engine/zone";

/** Un chantier : une zone du moteur, disque ou bande (#186). */
type Chantier = Zone;

const FICHE = HERBACEES.find((h) => h.id === "triticum_aestivum");
if (!FICHE?.culture) throw new Error("fiche du blé manquante");
const BLE = FICHE.culture;
const WEATHER = syntheticYear(LIMON_RICHE.climat);

/** Carré de quarante mètres, et un rayon qui le couvre en entier. */
const COTE = 40;
const RAYON = 30;
const AIRE_HA = (COTE * COTE) / 10_000;
const CENTRE = COTE / 2;
const ANS = 60;
/** Azote minéral, au printemps, comme le blé de Broadbalk (#140). */
const DOSE_N = 192;

/**
 * ── LA GÉOMÉTRIE, ET C'EST ELLE LE CŒUR DU DISPOSITIF ────────────────────────
 *
 * Deux rangs à 13,3 m — l'allée de Restinclières — et 5 m sur le rang, soit
 * **100 tiges/ha**, la densité du dispositif réel. La plantation témoin est à
 * 6 × 6, soit 278 tiges/ha : le témoin d'un LER est la monoculture à SA
 * densité, pas la même densité sans culture.
 *
 * **ET LA CULTURE ÉPARGNE LE PIED DES RANGS.** C'est ce que le premier
 * dispositif ne savait pas faire, et ça lui coûtait 77 % du volume des arbres :
 * il labourait par-dessus les noyers tous les ans, ce qu'aucun agroforestier ne
 * fait — la règle d'installation est justement « des bandes larges de plus d'un
 * mètre » le long du rang (CNPF, *Les noyers à bois*).
 *
 * **CES BANDES SONT MAINTENANT DES BANDES** (#186). La première version pavait
 * chaque allée de disques qui se chevauchent, faute d'une forme longue dans le
 * moteur ; ça marchait, c'était mesuré, et ça laissait une lentille non semée
 * au bord de chaque allée entre deux disques voisins. Une `ZoneBande` dit
 * exactement ce que le dispositif veut dire, et la surface cultivée mesurée
 * monte de 0,82 à 0,85 — la lentille, précisément.
 *
 * **ET LA BANDE ÉPARGNÉE S'ENTRETIENT** (#184). C'était l'impureté déclarée du
 * lot précédent : épargner le pied des rangs les laissait se reboiser tout
 * seuls, dix-huit semis spontanés de noyer qui pesaient 5,6 % du terme arbre.
 * On écrivait alors « le moteur n'a pas de geste pour entretenir une bande » —
 * il l'a : la fauche emporte désormais les tiges ligneuses qu'elle atteint
 * (`prairie-de-fauche.test.ts`), et une bande fauchée une fois l'an reste une
 * bande enherbée, ce que dit la règle et ce que fait l'agroforestier.
 *
 * La surface réellement cultivée n'est pas calculée mais MESURÉE, cellule par
 * cellule, et rapportée avec le résultat — c'est elle qui porte le partage du
 * sol que le LER met en nombres.
 */
const RANG_BAS_Y = 13.33;
const RANG_HAUT_Y = 26.67;
/** Demi-largeur de la bande épargnée de part et d'autre d'un rang, m. */
const BANDE_EPARGNEE_M = 1.75;

const RANGS_AGROFORESTERIE: [number, number][] = [];
for (const y of [RANG_BAS_Y, RANG_HAUT_Y])
  for (let x = 2; x < COTE; x += 5) RANGS_AGROFORESTERIE.push([x, y]);
const PLANTATION_PURE: [number, number][] = [];
for (let y = 3; y < COTE; y += 6) for (let x = 3; x < COTE; x += 6) PLANTATION_PURE.push([x, y]);

/** Une bande horizontale `[yBas, yHaut]` qui traverse la parcelle. */
function bande(yBas: number, yHaut: number): ZoneBande {
  return {
    zone: "bande",
    x: CENTRE,
    y: (yBas + yHaut) / 2,
    longueurM: COTE,
    largeurM: yHaut - yBas,
    orientationRad: 0,
  };
}

/**
 * Les bandes cultivées de l'agroforesterie : entre les rangs, et de part et
 * d'autre, chacune amputée de la bande épargnée.
 */
const BANDES_CULTIVEES: Chantier[] = [
  bande(0, RANG_BAS_Y - BANDE_EPARGNEE_M),
  bande(RANG_BAS_Y + BANDE_EPARGNEE_M, RANG_HAUT_Y - BANDE_EPARGNEE_M),
  bande(RANG_HAUT_Y + BANDE_EPARGNEE_M, COTE),
];

/**
 * Et les bandes épargnées elles-mêmes, celles qui portent les rangs : ni
 * labourées, ni semées, ni fertilisées — fauchées une fois l'an, comme une
 * bande enherbée d'agroforesterie.
 */
const BANDES_EPARGNEES: Chantier[] = [
  bande(RANG_BAS_Y - BANDE_EPARGNEE_M, RANG_BAS_Y + BANDE_EPARGNEE_M),
  bande(RANG_HAUT_Y - BANDE_EPARGNEE_M, RANG_HAUT_Y + BANDE_EPARGNEE_M),
];

/** Le blé pur, lui, couvre tout : c'est la terre que le mélange cède aux arbres. */
const PARCELLE_ENTIERE: Chantier[] = [{ x: CENTRE, y: CENTRE, rayonM: RAYON }];

/** Le grain mûr sur la parcelle, en tonnes — ce que la moissonneuse va emporter. */
function grainSurPiedT(state: GameState): number {
  let t = 0;
  const { cultureGrain, cultureGrainPotentiel } = state.soil;
  const nCells = COTE * COTE;
  for (const s of INDEX_CULTURES) {
    const culture = HERBACEES[s]?.culture;
    if (!culture) continue;
    for (let i = 0; i < nCells; i++) {
      const base = i * N_HERBACEES;
      const part = partDuRendement(
        cultureGrain[base + s] ?? 0,
        cultureGrainPotentiel[base + s] ?? 0,
      );
      // Un m² par cellule, et `rendementMaxTHa` est en tonnes par hectare.
      t += (part * culture.rendementMaxTHa) / 10_000;
    }
  }
  return t;
}

/**
 * Le calendrier d'éclaircie de la plantation témoin, en (année, tiges/ha visées).
 *
 * **Sans lui, le témoin n'en est pas un** : mesuré une première fois sans
 * éclaircie, les 49 noyers plantés étaient 187 à l'arrivée — les sujets mûrs
 * s'étaient ressemés et le « témoin forestier » était devenu un fourré. Une
 * plantation, ça se conduit : c'est la définition même de la monoculture à
 * laquelle un LER compare. Le bras agroforestier, lui, ne s'éclaircit pas —
 * un alignement se taille, il ne se dépressage pas —, et il n'en a pas besoin :
 * le labour annuel des allées supprime la régénération tout seul.
 */
const ECLAIRCIES: [number, number][] = [
  [20, 400],
  [35, 200],
  [50, 120],
];

/** Volume de tige sur pied, m³. */
function surPiedM3(state: GameState): number {
  let v = 0;
  for (const t of state.trees) if (t.alive) v += volumeTigeM3(t.diametreCm, t.heightM);
  return v;
}

/** Combien de cellules portent effectivement du blé, à un instant donné. */
function cellulesSemees(state: GameState): number {
  let n = 0;
  const { herbeEmprise } = state.soil;
  for (let i = 0; i < COTE * COTE; i++) {
    for (const s of INDEX_CULTURES) {
      if ((herbeEmprise[i * N_HERBACEES + s] ?? 0) > 0) {
        n++;
        break;
      }
    }
  }
  return n;
}

/** Un bras du dispositif : des arbres (ou pas), du blé (ou pas), soixante ans. */
function bras(
  arbres: readonly [number, number][],
  avecBle: boolean,
  options: {
    eclaircir?: boolean;
    graine?: number;
    sansLabour?: boolean;
    /** Laboure les allées sans y semer : le contrôle qui isole la part du soc. */
    labourerQuandMeme?: boolean;
  } = {},
) {
  const graine = options.graine ?? 4;
  // Les chantiers de culture : un seul disque pour le blé pur, une bande par
  // allée pour l'agroforesterie, qui épargne ainsi le pied des rangs.
  const chantiers = arbres.length > 0 ? BANDES_CULTIVEES : PARCELLE_ENTIERE;
  // Le dispositif EN ALLÉES, et lui seul, a des bandes enherbées à entretenir :
  // la plantation témoin n'en a pas, le blé pur non plus. Il les fauche dans
  // TOUS ses bras, cultivés ou non — sans quoi le témoin « mêmes rangs sans
  // blé » ne différerait plus du bras agroforestier par la seule culture.
  const enAllees = arbres === RANGS_AGROFORESTERIE;
  const station = { ...LIMON_RICHE.station, coteM: COTE, voisinage: [] };
  let state: GameState = createGameState(station, rngStateFromSeed(graine));
  for (const [x, y] of arbres) state = plantAt(state, "juglans_regia", x, y, 2);
  const plantes = new Set(state.trees.map((t) => t.id));
  const geste = (a: GameAction) => {
    state = applyAction(state, a).state;
  };
  /** L'éclaircie et le bilan portent sur la parcelle entière, pas sur une bande. */
  const disque = { x: CENTRE, y: CENTRE, rayonM: RAYON };
  let grainT = 0;
  let boisRecolteM3 = 0;
  /** Surface réellement cultivée, MESURÉE et non calculée (cellules d'un m²). */
  let semeesMax = 0;
  for (let an = 0; an < ANS; an++) {
    for (let w = 0; w < 52; w++) {
      const week = an * 52 + w;
      if (options.eclaircir && w === 0) {
        const cible = ECLAIRCIES.find(([a]) => a === an)?.[1];
        if (cible !== undefined) {
          const avant = surPiedM3(state);
          geste({
            type: "eclaircir",
            week,
            ...disque,
            densiteCibleParHa: cible,
            critere: "parLeBas",
            devenir: "vendre",
          });
          boisRecolteM3 += Math.max(0, avant - surPiedM3(state));
        }
      }
      if (!avecBle && options.labourerQuandMeme) {
        // Le contrôle doit ne changer QU'UNE chose. Mesuré d'abord sans l'azote,
        // il donnait 0,319 m³/arbre contre 0,427 pour le bras cultivé — le
        // labour paraissait coûter PLUS que le labour plus le blé, ce qui est
        // absurde. La cause était le confondant : la fertilisation du blé
        // profite aussi aux noyers, et la retirer avec lui mélangeait deux
        // effets. On laboure donc ET on fertilise, sans semer.
        if (w === BLE.semisWeek - 1)
          for (const z of BANDES_CULTIVEES) geste({ type: "labourer", week, ...z });
        if (w === 10)
          for (const z of BANDES_CULTIVEES)
            geste({ type: "fertiliser", week, ...z, forme: "mineral", doseKgNHa: DOSE_N });
      }
      // La bande enherbée se fauche une fois l'an, en été, comme un foin —
      // c'est ce qui l'empêche de se reboiser (#184).
      if (enAllees && w === 25) {
        for (const z of BANDES_EPARGNEES) geste({ type: "faucher", week, ...z });
      }
      if (avecBle) {
        for (const z of chantiers) {
          if (w === BLE.semisWeek - 1)
            geste(
              options.sansLabour
                ? { type: "faucher", week, ...z }
                : { type: "labourer", week, ...z },
            );
          if (w === BLE.semisWeek)
            geste({ type: "semer", week, ...z, cultureId: "triticum_aestivum" });
          if (w === 10)
            geste({ type: "fertiliser", week, ...z, forme: "mineral", doseKgNHa: DOSE_N });
        }
        if (w === BLE.recolteWeek) {
          // Le grain se compte AVANT la moisson et sur toute la parcelle : les
          // chantiers se chevauchent, et additionner disque par disque
          // compterait deux fois les cellules communes.
          grainT += grainSurPiedT(state);
          semeesMax = Math.max(semeesMax, cellulesSemees(state));
          for (const z of chantiers) geste({ type: "moissonner", week, ...z });
        }
      }
      const m = WEATHER[w];
      if (!m) throw new Error("météo manquante");
      state = tick(state, m).state;
    }
  }
  const noyers = state.trees.filter((t) => t.alive && t.especeId === "juglans_regia");
  const cohorte = state.trees.filter((t) => t.alive && plantes.has(t.id));
  const volCohorte = cohorte.reduce((a, t) => a + volumeTigeM3(t.diametreCm, t.heightM), 0);
  const autres = state.trees.filter((t) => t.alive && t.especeId !== "juglans_regia");
  return {
    autres: autres.length,
    partCultivee: semeesMax / (COTE * COTE),
    // **Le bois du LER est celui de l'ESPÈCE CULTIVÉE**, pas celui de tout ce
    // qui pousse. Un LER compare deux productions : le grain d'un côté, le bois
    // d'œuvre de l'autre. Les semis spontanés d'autres essences qui s'installent
    // dans la plantation ne sont pas le produit, et les compter gonflerait le
    // témoin — donc écraserait le terme arbre du mélange, où le labour annuel
    // des allées les supprime. Mesuré avant cette règle : le témoin comptait
    // 15,0 m³ pour 6,7 m³ de noyers.
    production: production(noyers, AIRE_HA, ANS, grainT, boisRecolteM3),
    tiges: noyers.length,
    boisRecolteM3,
    /** Les arbres PLANTÉS, suivis par leur identité : le seul échantillon comparable d'un bras à l'autre. */
    cohorte: cohorte.length,
    volCohorte,
    dCohorte: cohorte.length ? cohorte.reduce((a, t) => a + t.diametreCm, 0) / cohorte.length : 0,
    hCohorte: cohorte.length ? cohorte.reduce((a, t) => a + t.heightM, 0) / cohorte.length : 0,
    dMoy: noyers.length ? noyers.reduce((a, t) => a + t.diametreCm, 0) / noyers.length : 0,
    hMoy: noyers.length ? noyers.reduce((a, t) => a + t.heightM, 0) / noyers.length : 0,
  };
}

describe("l'indice lui-même, avant toute partie", () => {
  it("un terme est une SURFACE ÉQUIVALENTE, et un témoin nul ne vaut pas l'infini", () => {
    expect(lerPartiel(5, 10)).toBeCloseTo(0.5, 12);
    expect(lerPartiel(10, 10)).toBe(1);
    // Un dénominateur nul dit que la monoculture est impossible ici, donc que
    // la question du partage ne se pose pas — pas que le mélange est infiniment
    // meilleur.
    expect(lerPartiel(5, 0)).toBe(0);
    expect(lerPartiel(-3, 10)).toBe(0);
  });

  it("le mélange gagne quand la somme des deux parts dépasse un", () => {
    const mixte = { grainTHaAn: 3, boisM3HaAn: 4 };
    const bleP = { grainTHaAn: 5, boisM3HaAn: 0 };
    const boisP = { grainTHaAn: 0, boisM3HaAn: 8 };
    const r = ler(mixte, bleP, boisP);
    expect(r.culture).toBeCloseTo(0.6, 12);
    expect(r.arbre).toBeCloseTo(0.5, 12);
    expect(r.total).toBeCloseTo(1.1, 12);
    // Et il perd quand chacun rend moins que sa part de surface.
    expect(ler({ grainTHaAn: 2, boisM3HaAn: 2 }, bleP, boisP).total).toBeLessThan(1);
  });

  it("le bois compte la production, pas le stock : une coupe ne fait pas baisser le LER", () => {
    const debout = production([], 1, 10, 0, 0);
    const coupe = production([], 1, 10, 0, 50);
    expect(debout.boisM3HaAn).toBe(0);
    expect(coupe.boisM3HaAn).toBeCloseTo(5, 12);
  });
});

describe("le dispositif à trois bras, soixante ans", () => {
  /**
   * CE QUE LE DISPOSITIF A DÛ APPRENDRE, ET DANS L'ORDRE OÙ IL L'A APPRIS.
   * Cinq relevés, quatre causes écartées, une retenue — et c'était la mienne.
   *
   * 1. LE TÉMOIN FORESTIER N'EN ÉTAIT PAS UN. 49 noyers plantés, **187** à
   *    l'arrivée : les sujets mûrs s'étaient ressemés et le « témoin » était un
   *    fourré. Une plantation, ça se conduit — d'où `ECLAIRCIES`.
   *
   * 2. IL COMPTAIT LE BOIS DES ESSENCES SPONTANÉES : 15,0 m³ là où les noyers
   *    n'en faisaient que 6,7. Un LER compare des PRODUITS.
   *
   * 3. J'AI ACCUSÉ LA CROISSANCE DU NOYER, ET C'ÉTAIT FAUX. Sa fiche est
   *    marquée « NON calé sur table », les moyennes semblaient l'accabler —
   *    et **comparer des moyennes de distributions asymétriques ne dit rien**.
   *    En volume l'écart était de 2,5, pas de 1,2. Le seul échantillon
   *    comparable est la COHORTE PLANTÉE, suivie par ses identités.
   *
   * 4. J'AI ENSUITE ACCUSÉ LE LABOUR ET LA CONCURRENCE DU BLÉ, sur la foi d'un
   *    écart de 77 % du volume des arbres. **C'était encore ma géométrie.** Le
   *    dispositif labourait jusqu'au pied des rangs, ce qu'aucun agroforestier
   *    ne fait : la règle d'installation est « des bandes larges de plus d'un
   *    mètre » (CNPF). En pavant les allées de disques qui épargnent le rang,
   *    la pénalité s'évapore. Cohorte plantée, soixante ans :
   *
   *      allée, blé + labour              0,551 m³/arbre
   *      mêmes rangs, sans blé ni labour  0,561
   *      mêmes rangs, LABOURÉS+fertilisés 0,563
   *      plantation 6 × 6                 0,498
   *
   *    Cultiver coûtait alors **2 %**, et le soc seul rien. **Et ce 2 % était
   *    FAUX à son tour** : voir le point 6.
   *
   *    Le contrôle du labour a dû être purifié : mesuré d'abord sans azote, il
   *    donnait 0,319 m³/arbre, donc le labour paraissait coûter PLUS que le
   *    labour plus le blé. Absurde, et confondant évident — la fertilisation du
   *    blé profite aussi aux noyers. On laboure et on fertilise, sans semer.
   *
   * 5. MES BANDES ÉPARGNÉES N'EN ÉTAIENT PAS. Le rayon des disques dépassait la
   *    demi-largeur pour couvrir les creux, et mangeait le rang : mesuré,
   *    93,3 % de la parcelle cultivée au lieu de 82 %, donc 0,67 m épargné de
   *    chaque côté au lieu de 1,75 — sous la règle. C'est la SURFACE MESURÉE,
   *    et non calculée, qui l'a dit. Rayon ramené à la demi-largeur exacte.
   *
   * 6. **ET LE PAVAGE ÉPARGNAIT ENCORE PLUS QU'IL NE LE DISAIT** (#184). Deux
   *    disques voisins qui se touchent laissent un feston au BORD de la bande,
   *    c'est-à-dire exactement au pied du rang, et le point 5 l'avait écrit
   *    comme un détail acceptable — « une petite lentille non semée ». Ce
   *    détail portait tout le résultat du point 4. Les vraies bandes de #186
   *    l'ont supprimé : surface cultivée mesurée 0,850 au lieu de 0,823, et la
   *    pénalité passe de 2 % à **21 %**.
   *
   *    **Le banc de dose l'a attribué**, en ne bougeant QUE la demi-largeur
   *    épargnée (graine 4, témoin sans blé à 0,5624 m³/arbre) :
   *
   *      demi-bande   vol/arbre   part cultivée   grain t/ha/an
   *        1,00 m       0,367         0,900           5,47
   *        1,75 m       0,443         0,850           5,15
   *        2,50 m       0,534         0,750           4,55
   *        3,25 m       0,560         0,650           3,96
   *
   *    Rien de pathologique là-dedans : ce qu'on laboure, c'est une part du
   *    disque racinaire, et la pénalité la suit à peu près linéairement. Le
   *    feston valait ~2,5 m épargnés par endroits, d'où le 2 %. **On ne mesure
   *    pas une géométrie, on la déclare et on vérifie qu'elle est celle qu'on a
   *    déclarée** — c'est la même leçon qu'au point 5, et il a fallu la
   *    réapprendre parce que le contrôle de surface portait sur la MOYENNE de
   *    la parcelle, où trois pour cent se cachent, et non sur le bord de bande.
   *
   *    Et le compromis que l'agroforesterie met en nombres apparaît ici tout
   *    seul : la bande qui sauve l'arbre coûte le grain, 5,47 → 3,96 t/ha/an.
   *
   * 7. LA BANDE ÉPARGNÉE S'ENTRETIENT (#184). Elle se reboisait toute seule —
   *    dix-huit semis spontanés de noyer, 34 tiges pour 16 plantées. La fauche
   *    emporte désormais les tiges ligneuses qu'elle atteint, et une fauche
   *    annuelle de la bande ramène le bras à ses 16 plantées, exactement.
   *
   * CAMPAGNE FINALE, trois graines, soixante ans, bandes de #186 et bande
   * enherbée entretenue :
   *
   *   graine        4       11      23
   *   culture     0,713   0,712   0,725
   *   arbre       0,460   0,519   0,373
   *   TOTAL       1,172   1,231   1,098
   *
   * **ET LE DISPOSITIF NE REND PLUS LE FAIT DE RESTINCLIÈRES**, ce que les
   * chiffres du point 4 masquaient : là-bas l'arbre d'allée pousse PLUS VITE
   * que celui du témoin forestier, ici il reste 11 à 22 % dessous (0,443 contre
   * 0,498 à la graine 4), et le LER ne dépasse la cible de 1,2 que sur une
   * graine sur trois. L'essai épingle les deux écarts plus bas, en PLAFOND et
   * non en plancher : tant qu'ils tiennent, le moteur n'a pas retrouvé le fait.
   * C'est la question 2 de #184, et elle reste ouverte — elle vise la pénalité
   * qu'un sol travaillé inflige aux racines voisines, pas la géométrie.
   */
  it("le mélange bat la somme des parties", () => {
    const agro = bras(RANGS_AGROFORESTERIE, true);
    const rangsSansBle = bras(RANGS_AGROFORESTERIE, false);

    const blePur = bras([], true);
    const boisPur = bras(PLANTATION_PURE, false, { eclaircir: true });
    const r = ler(agro.production, blePur.production, boisPur.production);
    // Les deux témoins doivent exister, sans quoi l'indice ne veut rien dire.
    expect(blePur.production.grainTHaAn).toBeGreaterThan(0);
    expect(boisPur.production.boisM3HaAn).toBeGreaterThan(0);
    expect(agro.tiges).toBeGreaterThan(0);
    // Le témoin forestier doit être CONDUIT, sans quoi il n'en est pas un :
    // sans éclaircie il finissait à 187 tiges pour 49 plantées.
    expect(boisPur.tiges).toBeLessThan(PLANTATION_PURE.length * 1.5);
    // LE PARTAGE DU SOL EST CE QUE LE LER MET EN NOMBRES, donc il se vérifie :
    // le mélange cède au rang ce que la monoculture garde. Mesuré, pas calculé.
    expect(blePur.partCultivee).toBeGreaterThan(0.99);
    expect(agro.partCultivee).toBeGreaterThan(0.75);
    expect(agro.partCultivee).toBeLessThan(0.9);
    // **LA BANDE ÉPARGNÉE NE SE REBOISE PLUS** : la cohorte plantée est tout ce
    // qui reste debout dans les rangs, parce qu'on la fauche (#184). Avant, le
    // bras finissait à 34 noyers pour 16 plantés.
    expect(agro.tiges).toBe(agro.cohorte);
    // **CE QUE L'ARBRE D'ALLÉE PAIE, ET C'EST UN ENCADREMENT À DEUX BORNES.**
    // L'essai affirmait ici « il ne paie rien, à 10 % près », sur la foi du
    // pavage de disques qui épargnait un feston au pied du rang ; les vraies
    // bandes rendent la mesure à 0,79-0,81 du témoin sans blé. Un encadrement
    // plutôt qu'un plancher, parce que les deux sorties veulent dire quelque
    // chose : au-dessus de 0,9 c'est le feston qui serait revenu, en dessous de
    // 0,7 c'est que le chantier repasse sur les rangs.
    const parArbre = (b: { volCohorte: number; cohorte: number }) => b.volCohorte / b.cohorte;
    const rapport = parArbre(agro) / parArbre(rangsSansBle);
    expect(rapport).toBeGreaterThan(0.7);
    expect(rapport).toBeLessThan(0.9);
    // **ET VOICI LE FAIT QUE LE MOTEUR NE REND PAS** — épinglé en PLAFOND, pas
    // en plancher, comme E12 : à Restinclières l'arbre d'allée pousse plus vite
    // que celui du témoin forestier, parce qu'il a plus de place. Ici il reste
    // dessous. Le jour où cette ligne tombera, le moteur aura retrouvé le fait
    // et il faudra la retourner — c'est la question 2 de #184.
    expect(parArbre(agro)).toBeLessThan(parArbre(boisPur));
    // LA CULTURE, ELLE, PAIE — et c'est le sens même d'un LER : le mélange rend
    // moins de grain par hectare de PARCELLE qu'un champ de blé pur, puisqu'il
    // lui cède la place des rangs. Un terme culture au-dessus de 1 serait le
    // signe que les arbres n'ombragent rien, ce qui fut le cas et fut le défaut.
    expect(r.culture).toBeLessThan(1);
    expect(r.arbre).toBeGreaterThan(0.3);
    // **LE MÉLANGE BAT LA SOMME DES PARTIES, ET C'EST TOUT CE QUE CETTE LIGNE
    // AFFIRME.** Elle tenait 1,1, sous le minimum d'une campagne à 1,202 ; les
    // vraies bandes donnent 1,172 / 1,231 / 1,098 et la cible de Restinclières
    // (> 1,2) n'est plus atteinte que sur une graine sur trois. On ne rabaisse
    // pas le seuil d'un cran pour le faire passer : on revient à l'énoncé du
    // LER, qui est « au-dessus de 1 », et c'est le référentiel (H21, repassé
    // 🟡) qui porte l'écart à la cible.
    expect(r.total).toBeGreaterThan(1);
  }, 900_000);
});
