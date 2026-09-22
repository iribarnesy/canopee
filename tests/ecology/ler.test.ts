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
 * Les actions du moteur prennent toutes un DISQUE, et un disque ne pave pas une
 * bande. On la pave donc de plusieurs disques qui se chevauchent, ce que
 * `semer` autorise sans le savoir : son calcul de place libre EXCLUT la culture
 * qu'on sème, donc deux disques de blé ne se refusent pas l'un l'autre. Le
 * moteur gagnera des zones en bande un jour (#186) ; en attendant, ceci marche
 * et se mesure.
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

/** Un disque de chantier : centre et rayon. */
interface Disque {
  x: number;
  y: number;
  rayonM: number;
}

/**
 * Pave une bande horizontale `[yBas, yHaut]` de disques qui se chevauchent.
 *
 * Le rayon est pris un peu plus grand que la demi-largeur pour que les creux
 * entre deux disques voisins soient couverts — un point du bord de bande n'est
 * atteint que si un centre est assez proche. Le débord vertical est le prix,
 * et il est compté : la bande épargnée est dimensionnée pour l'absorber.
 */
function paverBande(yBas: number, yHaut: number): Disque[] {
  const centre = (yBas + yHaut) / 2;
  const demi = (yHaut - yBas) / 2;
  // Le rayon vaut EXACTEMENT la demi-largeur : aucun débord, donc la bande
  // épargnée est celle qu'on a déclarée. Le premier jet prenait un rayon plus
  // grand pour couvrir les creux entre disques, et mesuré, il cultivait 93,3 %
  // de la parcelle au lieu des ~82 % voulus — les rangs ne gardaient plus que
  // 0,67 m de chaque côté au lieu de 1,75, sous la règle du « plus d'un mètre ».
  // Le prix de cette rigueur est une petite lentille non semée au bord de bande
  // entre deux disques voisins ; elle est DANS la bande, pas dans le rang, et
  // la surface réellement cultivée est mesurée plus bas.
  const rayonM = demi;
  const pas = demi * 0.7;
  const out: Disque[] = [];
  for (let x = 0; x <= COTE + pas; x += pas) out.push({ x, y: centre, rayonM });
  return out;
}

/**
 * Les bandes cultivées de l'agroforesterie : entre les rangs, et de part et
 * d'autre, chacune amputée de la bande épargnée.
 */
const BANDES_CULTIVEES: Disque[] = [
  ...paverBande(0, RANG_BAS_Y - BANDE_EPARGNEE_M),
  ...paverBande(RANG_BAS_Y + BANDE_EPARGNEE_M, RANG_HAUT_Y - BANDE_EPARGNEE_M),
  ...paverBande(RANG_HAUT_Y + BANDE_EPARGNEE_M, COTE),
];

/** Le blé pur, lui, couvre tout : c'est la terre que le mélange cède aux arbres. */
const PARCELLE_ENTIERE: Disque[] = [{ x: CENTRE, y: CENTRE, rayonM: RAYON }];

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
  // Les chantiers de culture : un seul disque pour le blé pur, une bande pavée
  // par allée pour l'agroforesterie, qui épargne ainsi le pied des rangs.
  const chantiers = arbres.length > 0 ? BANDES_CULTIVEES : PARCELLE_ENTIERE;
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
   *    Cultiver coûte **2 %**, et le soc seul ne coûte rien. Mieux : l'arbre
   *    d'allée DÉPASSE celui de la plantation, ce qui est le fait réel — il a
   *    plus de place. Les 77 % étaient intégralement l'artefact.
   *
   *    Et le contrôle du labour a dû être purifié : mesuré d'abord sans azote,
   *    il donnait 0,319 m³/arbre, donc le labour paraissait coûter PLUS que le
   *    labour plus le blé. Absurde, et confondant évident — la fertilisation du
   *    blé profite aussi aux noyers. On laboure et on fertilise, sans semer.
   *
   * 5. MES BANDES ÉPARGNÉES N'EN ÉTAIENT PAS. Le rayon des disques dépassait la
   *    demi-largeur pour couvrir les creux, et mangeait le rang : mesuré,
   *    93,3 % de la parcelle cultivée au lieu de 82 %, donc 0,67 m épargné de
   *    chaque côté au lieu de 1,75 — sous la règle. C'est la SURFACE MESURÉE,
   *    et non calculée, qui l'a dit.
   *
   * CAMPAGNE FINALE, trois graines, soixante ans :
   *
   *   graine        4       11      23
   *   culture     0,719   0,719   0,734
   *   arbre       0,604   0,668   0,468
   *   TOTAL       1,323   1,388   1,202
   *
   * Les trois dépassent la cible de Restinclières (> 1,2), et la composition
   * est celle de la littérature (~0,7 et ~0,5) sur les trois. Le terme CULTURE
   * est quasi constant et le terme ARBRE varie du simple au tiers : c'est
   * attendu, le blé répond à la lumière et à l'azote, tous deux déterministes
   * ici, pendant que la mortalité et la régénération des arbres sont des
   * tirages. L'essai n'en garde qu'une par coût de calcul, et ses seuils sont
   * posés sous le minimum des trois.
   *
   * **Ce qui reste impur, et il faut le dire** : la bande épargnée se reboise
   * toute seule. Élargie de 0,67 à 1,75 m, elle a fait passer le bras
   * agroforestier de 23 à 34 noyers — dix-huit semis spontanés, qui pèsent
   * 5,6 % du terme arbre. C'est précisément pourquoi la règle dit « parfaitement
   * désherbées », et le moteur n'a pas de geste pour entretenir une bande.
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
    // LES ARBRES D'ALLÉE NE PAIENT PAS LA CULTURE, et c'est ce qui a demandé
    // cinq relevés. Un écart de plus de 10 % ici voudrait dire que le chantier
    // repasse sur les rangs.
    const parArbre = (b: { volCohorte: number; cohorte: number }) => b.volCohorte / b.cohorte;
    expect(parArbre(agro)).toBeGreaterThan(0.9 * parArbre(rangsSansBle));
    // Et ils dépassent ceux de la plantation, parce qu'ils ont plus de place.
    expect(parArbre(agro)).toBeGreaterThan(parArbre(boisPur));
    // LA CULTURE, ELLE, PAIE — et c'est le sens même d'un LER : le mélange rend
    // moins de grain par hectare de PARCELLE qu'un champ de blé pur, puisqu'il
    // lui cède la place des rangs. Un terme culture au-dessus de 1 serait le
    // signe que les arbres n'ombragent rien, ce qui fut le cas et fut le défaut.
    expect(r.culture).toBeLessThan(1);
    expect(r.arbre).toBeGreaterThan(0.3);
    // Seuil sous le minimum de la campagne à trois graines (1,202).
    expect(r.total).toBeGreaterThan(1.1);
  }, 900_000);
});
