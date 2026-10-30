/**
 * La culture comme strate basse (issue #136, critères C16, E13, H19, H20).
 *
 * Canopée est un jeu d'agroforesterie et ne savait pas faire pousser une
 * culture. Ce fichier vérifie les trois choses que le lot affirme :
 *   1. l'histoire de vie — semée, moissonnée, et elle ne colonise rien ;
 *   2. ce que le rendement vaut, contre une source **extérieure** au moteur ;
 *   3. que l'ombre des arbres le fait baisser.
 */

import { describe, expect, it } from "vitest";
import { applyAction, grainRecoltableT } from "../../src/engine/actions";
import { HERBACEES, N_HERBACEES } from "../../src/engine/herbacees";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type GameState, plantAt } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";
import { cellulesDeLaZone } from "../../src/engine/zone";
import { CHAMP_LABOURE_AVANT_BROADBALK_ANS, RELIEF_DE_BROADBALK } from "../helpers";

const S_BLE = HERBACEES.findIndex((h) => h.id === "triticum_aestivum");
const FICHE_BLE = HERBACEES[S_BLE];
if (!FICHE_BLE?.culture) throw new Error("fiche du blé manquante");
const BLE = FICHE_BLE.culture;

const WEATHER = syntheticYear(LIMON_RICHE.climat);

/**
 * Mène une parcelle sur `ans` années : labour, semis, moisson chaque année sur
 * un disque, et rend le rendement annuel en t/ha — lu sur la **recette**, donc sur
 * ce que le joueur touche, pas sur une variable interne.
 */
function culture(options: {
  ans: number;
  cote: number;
  rayonM: number;
  /** Graine de la partie. Une seule ne dit rien dès qu'il y a des arbres. */
  graine?: number;
  arbres?: { especeId: string; y: number }[];
  /** La pente et le bassin amont de Broadbalk à la place de ceux du limon riche (#461). */
  reliefDeBroadbalk?: boolean;
}): number[] {
  const { ans, cote, rayonM } = options;
  const relief = options.reliefDeBroadbalk
    ? { ...LIMON_RICHE.station.relief, ...RELIEF_DE_BROADBALK }
    : LIMON_RICHE.station.relief;
  const station = { ...LIMON_RICHE.station, coteM: cote, voisinage: [], relief };
  let state: GameState = createGameState(station, rngStateFromSeed(options.graine ?? 4));
  for (const rang of options.arbres ?? []) {
    for (let x = 2; x < cote; x += 8) state = plantAt(state, rang.especeId, x, rang.y, 2);
  }
  const centre = cote / 2;
  // Le grain se lit sur pied, avant la moisson : la trésorerie compte aussi le
  // passage d'engin, 0,6 t/ha de blé (`grainRecoltableT`, #247).
  const zone = { x: centre, y: centre, rayonM };
  const aireHa = cellulesDeLaZone(cote, zone).length / 10_000;
  const rendements: number[] = [];
  for (let an = 0; an < ans; an++) {
    for (let w = 0; w < 52; w++) {
      const week = an * 52 + w;
      if (w === BLE.semisWeek - 1) {
        state = applyAction(state, { type: "labourer", week, x: centre, y: centre, rayonM }).state;
      }
      if (w === BLE.semisWeek) {
        state = applyAction(state, {
          type: "semer",
          week,
          x: centre,
          y: centre,
          rayonM,
          cultureId: "triticum_aestivum",
        }).state;
      }
      if (w === BLE.recolteWeek) {
        rendements.push(grainRecoltableT(state, zone) / aireHa);
        state = applyAction(state, {
          type: "moissonner",
          week,
          x: centre,
          y: centre,
          rayonM,
        }).state;
      }
      const m = WEATHER[w];
      if (!m) throw new Error("météo manquante");
      state = tick(state, m).state;
    }
  }
  return rendements;
}

describe("l'histoire de vie d'une culture n'est pas celle d'une pérenne", () => {
  const station = { ...LIMON_RICHE.station, coteM: 20, voisinage: [] };
  /**
   * **Une parcelle neuve n'est pas un tapis fermé**, et le premier jet de cet
   * essai l'avait supposé : il semait sur un `createGameState` et s'étonnait
   * que rien ne refuse. La station démarre à sa couverture initiale, et c'est
   * la strate qui ferme le sol en quelques saisons. On la laisse donc faire —
   * un dispositif qui ne crée pas la condition qu'il teste ne teste rien.
   */
  const friche = (() => {
    let s = createGameState(station, rngStateFromSeed(4));
    for (let w = 0; w < 6 * 52; w++) {
      const m = WEATHER[w % 52];
      if (!m) throw new Error("météo manquante");
      s = tick(s, m).state;
    }
    return s;
  })();
  const nu = friche;

  it("semer dans un tapis fermé est REFUSÉ, et le refus dit quoi faire", () => {
    // **La règle « préparer le lit de semence » n'est écrite nulle part** : le
    // semis pose la place **libre** (`actions.ts`), et une friche n'en laisse pas.
    // Mesuré avant la garde : le semis passait, l'emprise valait zéro, et la
    // moisson annonçait « rien à moissonner » neuf mois plus tard.
    const r = applyAction(nu, {
      type: "semer",
      week: BLE.semisWeek,
      x: 10,
      y: 10,
      rayonM: 5,
      cultureId: "triticum_aestivum",
    });
    expect(r.refusals).toHaveLength(1);
    expect(r.refusals[0]?.reason).toContain("labourer");
  });

  it("après un labour, le semis prend toute la place", () => {
    const laboure = applyAction(nu, {
      type: "labourer",
      week: BLE.semisWeek - 1,
      x: 10,
      y: 10,
      rayonM: 5,
    }).state;
    const seme = applyAction(laboure, {
      type: "semer",
      week: BLE.semisWeek,
      x: 10,
      y: 10,
      rayonM: 5,
      cultureId: "triticum_aestivum",
    });
    expect(seme.refusals).toEqual([]);
    const centre = 10 * 20 + 10;
    expect(seme.state.soil.herbeEmprise[centre * N_HERBACEES + S_BLE]).toBeCloseTo(1, 6);
  });

  it("hors de sa fenêtre, le semis est refusé", () => {
    const printemps = applyAction(nu, {
      type: "semer",
      week: 14,
      x: 10,
      y: 10,
      rayonM: 5,
      cultureId: "triticum_aestivum",
    });
    expect(printemps.refusals[0]?.reason).toContain("fenêtre de semis");
  });

  it("une culture ne COLONISE rien : sa vitesse d'installation est nulle", () => {
    // C'est ce qui la sépare d'une pérenne, et c'est ce qui fait qu'une
    // parcelle laissée seule se couvre de molinie et jamais de blé.
    expect(HERBACEES[S_BLE]?.vitesseInstallation).toBe(0);
  });
});

describe("ce que le blé rend, contre une source extérieure au moteur", () => {
  it("un blé continu sans apport descend vers la parcelle NUE de Broadbalk", () => {
    // **Le calage et la validation viennent de la même source, sur deux
    // chiffres différents.** Broadbalk (Rothamsted, blé continu depuis 1843)
    // donne 8-9 t/ha sur les parcelles pleinement fumées — c'est le plafond de
    // la fiche — et ~1 t/ha sur celles qui ne reçoivent **rien**, tenu sur cent
    // soixante-dix ans. Le moteur n'a pas d'action de fertilisation : un blé
    // continu doit donc descendre de lui-même vers le second, ce que rien dans
    // le code ne lui dit de faire.
    //
    // Le moteur entre dans la gamme de Broadbalk vers les années 40 à 60 et s'y
    // pose **au-dessus** de ~1, à 1,4 t/ha. Il en était dit qu'il « glissait sous
    // 1 » à cause de la paille non restituée : c'était la mesure. Le rendement se
    // lisait sur la trésorerie, qui compte aussi le passage d'engin de la moisson
    // — 120 €/ha, 0,6 t/ha de blé —, et le grain était donc lu 0,6 t/ha trop bas
    // sur toute la courbe (#247). Il se lit maintenant sur pied
    // (`grainRecoltableT`).
    //
    // **Réancré sur l'équilibre (#247), comme ce commentaire le demandait déjà.**
    // La borne tenait à l'an 24 (« sous 2 t/ha ») et comparait donc un sol
    // encore riche — il minéralise ~70 kg N/ha/an, dans le Mh du COMIFER pour un
    // limon profond (80) — à l'équilibre d'un sol que Broadbalk épuise depuis
    // cent cinquante ans. La méthode COMIFER elle-même prête à un blé non
    // fertilisé sur ce limon de l'ordre de 3 t/ha à ce stade (0,5 × 80 + un
    // reliquat de ~40 kg, à 3 kg N par quintal) : c'est une déduction, pas une
    // mesure, mais elle dit que l'an 24 n'est pas le moment de Broadbalk.
    //
    // La comparaison juste est celle de l'échelle de l'essai : les moyennes par
    // tranche de vingt ans **une fois la décroissance amortie**. Relevé sur ce
    // moteur, cent vingt ans :
    //
    //     ans 1-20   21-40   41-60   61-80   81-100   101-120
    //       4,40      2,83    2,08    1,73     1,56      1,38
    //
    // Lu sur la trésorerie, le même moteur rendait 3,81 / 2,24 / 1,48 / 1,13 /
    // 0,96 / 0,78 ; avec en plus l'ancienne perte d'humus au labour (5 %, sans
    // source, trois à quatre fois West et Post 2002) : 2,94 / 1,18 / 0,83 / 0,79
    // / 0,79 / 0,70. La dernière tranche s'écarte de la précédente de 11,5 % :
    // il ralentit encore à cent vingt ans. La fraction d'humus stable des
    // jachères nues de longue durée (Barré et al. 2010) n'en est pas la cause
    // (#317, voir plus bas).
    //
    // **La fenêtre se lit maintenant sur un champ labouré depuis deux siècles**
    // (#324). L'essai comparait le transitoire d'un sol neuf, 74 t C/ha d'humus
    // comme une prairie, à une parcelle qui était en culture depuis plusieurs
    // siècles en 1843 (`CHAMP_LABOURE_AVANT_BROADBALK_ANS`). Les ans 61 à 120
    // étaient encore la descente de ce sol neuf. La parcelle passe donc deux
    // cents ans sous la conduite de l'essai avant les trois tranches jugées, et
    // les bornes ne bougent pas. Le moteur n'a pas d'équilibre à atteindre :
    // sur quatre cents ans (sonde du blé continu, déterministe), le grain de
    // main baisse de 13 à 19 % tous les vingt ans jusqu'au bout, et l'azote de la
    // litière monte sans arrêt, 114 kg N/ha à l'an 0, 432 à l'an 400. Sur ce champ-là,
    // main rend 0,35 / 0,30 / 0,26 t/ha (ans 201-260) : il sort du facteur deux
    // par le bas. L'accord des ans 61 à 120 tenait au passage dans la bande.
    // Partir des stocks de 1843 (1,00 % de carbone, Poulton et al. 2018) ne
    // suffisait pas : le moteur les perd comme ceux du sol neuf, et les
    // tranches jugées ne baissaient que de 6 à 9 %.
    //
    // **La litière ne manquait pas d'azote** (#461). Sur ce disque, la borne
    // d'azote de la décomposition ne mord sur aucune cellule-semaine en quatre
    // siècles. La paille s'entassait parce que ses décomposeurs lisaient leur
    // humidité sur la réserve du profil de départ, quand l'érosion amincit
    // l'horizon : 18 t C/ha de litière à l'an 400 depuis le partage de l'eau de
    // #391. Lue sur la réserve de la cellule, elle reste à 3 t C/ha, et le grain
    // ne bouge pas (1,458 / 1,339 / 1,240 t/ha contre 1,461 / 1,341 / 1,244) :
    // le blé baisse encore de 5 à 6 % tous les vingt ans à l'an 400.
    //
    // **Le banc change, et ses bornes non** (#461). Deux choses manquaient à
    // l'équilibre, et ce lot les règle ensemble.
    //
    // Le grain était deux fois trop pauvre en azote : 7,9 kg N par tonne de
    // matière sèche, contre 16,6 sur la parcelle Nil (Coleman et al. 2017,
    // *Sci. Total Environ.* 609 : 1483, moyennes 1968-2012). La croissance ne
    // suivait l'indice de nutrition qu'une fois, et un blé affamé gardait tout
    // son feuillage. Elle le suit maintenant au carré, avec le plancher de
    // STICS (`facteurAzoteDeLaCroissance`, herbe.ts) : 14,2 kg N par tonne.
    //
    // Et le banc portait le relief du limon riche, une pente de 4 % sous un
    // demi-hectare de bassin, qui emporte quatre à cinq tonnes de terre par
    // hectare et par an (#311) ; Broadbalk a une pente d'un degré et n'est pas
    // un bas de versant. **Le banc prend le relief de Broadbalk**
    // (`RELIEF_DE_BROADBALK`) : c'est un changement du dispositif, signalé ici,
    // et les bornes de C16 ne bougent pas. Relevé (sonde du blé continu,
    // déterministe, fusion de 18dbb29) :
    //
    //                                     ans 201-220   221-240   241-260   an 2
    //     main, relief du limon              1,482       1,364     1,266    4,66
    //     ce lot, relief du limon            0,823       0,785     0,755    4,01
    //     ce lot, relief de Broadbalk        1,157       1,147     1,139    4,39
    //
    // Et le blé **se pose** : 1,13 t de matière sèche/ha de l'an 260 à l'an
    // 400, à moins de 1 % d'une tranche à l'autre, soit 1,33 t/ha à 85 % pour
    // 1,16 sur la parcelle Nil, avec 14,2 kg N par tonne de matière sèche. Le
    // niveau tient au plancher de l'indice : le blé finit sa saison dessous
    // (0,25 à la moisson). Sur le relief du limon, le même moteur descend
    // encore de 4 à 5 % tous les vingt ans : l'érosion et le lessivage.
    const VIEUX = CHAMP_LABOURE_AVANT_BROADBALK_ANS;
    const r = culture({ ans: VIEUX + 61, cote: 30, rayonM: 14, reliefDeBroadbalk: true });
    const an2 = r[2] ?? 0;
    const tranche = (debut: number) => {
      const t = r.slice(debut, debut + 20);
      return t.reduce((s, v) => s + v, 0) / Math.max(1, t.length);
    };
    // Il part haut — une bonne terre minéralise son humus — et il s'épuise. Le
    // **sens** est l'essentiel : chaque tranche des soixante premières années
    // sous la précédente. La borne d'avant, « l'an 24 sous la moitié de l'an 2 »,
    // n'avait pas de source ; c'était une attente sur le moteur (5,38 → ~3,2 en grain).
    expect(an2).toBeGreaterThan(3);
    expect(tranche(21)).toBeLessThan(tranche(1));
    expect(tranche(41)).toBeLessThan(tranche(21));
    // Il atterrit dans la bande de la parcelle nue, à un facteur deux près, sur
    // chacune des trois tranches qui suivent les deux siècles de labour : on ne
    // prétend pas mesurer Broadbalk, on prétend ne pas en être loin sur un champ
    // qui a l'âge du sien.
    for (const debut of [VIEUX + 1, VIEUX + 21, VIEUX + 41]) {
      expect(tranche(debut), `ans ${debut}-${debut + 19}`).toBeGreaterThan(0.5);
      expect(tranche(debut), `ans ${debut}-${debut + 19}`).toBeLessThan(2);
    }
    // Il exigeait aussi qu'il s'y **pose** : la dernière tranche à moins d'un
    // cinquième de la précédente. Le chiffre n'avait pas de source, et il ne
    // passait qu'au bord : 18,5 % sur main (1,14 puis 0,93), 20,4 % depuis que
    // l'érosion ne prend plus une terre que la cellule n'a pas (#283 : 1,12 puis
    // 0,89). La parcelle Nil de Broadbalk, elle, ne bouge plus depuis cent
    // soixante-dix ans, et le moteur ne sait pas encore la tenir : un humus à
    // un seul pool, sans fraction stable, se vide sans plancher (Barré et al.
    // 2010). La borne est retirée, avec l'accord de l'auteur sur les bornes sans
    // source. #317 a sondé la fraction d'humus stable : elle pose un plancher
    // au carbone, pas à l'azote, et le blé descend plus vite (0,63 au lieu de
    // 0,89). Ce qui reste est le transitoire d'un sol neuf mis en blé, et c'est
    // le dispositif qui est repris (#324) ; C16 le dit.
  }, 1_800_000);
});

describe("l'ombre des arbres coûte du rendement", () => {
  it("sans fertilisation, l'arbre dispute au blé son ombre et son azote", () => {
    // Deux rangs de noyers encadrant une allée de 8 m : le rapport
    // hauteur / largeur d'allée monte jusqu'à 1,28 en trente-trois ans.
    //
    // **ce banc tourne sur cinq graines depuis #197, et il a fallu ça pour
    // découvrir qu'une de ses deux affirmations était fausse.** Il n'en tirait
    // qu'une, la 4, et il en concluait qu'à l'an 25 l'allée rend 7 % de **plus**
    // que le blé pur (1,069) — « l'énoncé le plus net de ce que cet essai est
    // seul à dire ». Relevé sur cinq graines, sur le moteur d'**avant** ce lot :
    //
    //     graine        4      1      7     33   2022
    //     an 25      1,069  1,052  0,940  0,929  0,922
    //     an 33      0,834  0,837  0,883  0,770  0,810
    //
    // **Trois graines sur cinq passaient déjà sous 1 à l'an 25.** Le seuil ne
    // tenait pas au mécanisme, il tenait au tirage — et ce n'est pas #197 qui
    // l'a cassé, c'est #197 qui l'a fait tomber en déplaçant la graine. La
    // seconde affirmation, elle, était solide : les cinq graines décrochaient à
    // l'an 33.
    //
    // Ce que ce lot change vraiment : une graine de noyer se **mange** (elle porte
    // `semences`), donc la parcelle porte 49 à 66 noyers à l'an 33 au lieu de
    // 72 à 89, donc moins d'ombre **et** moins de litière. Relevé après :
    //
    //     an 25      0,922  1,046  0,947  0,929  0,920   → moyenne 0,953
    //     an 33      1,034  0,799  0,808  0,848  1,006   → moyenne 0,899
    //
    // Sur la moyenne des cinq, la trajectoire est **monotone** — 0,993 / 0,987
    // / 0,953 / 0,899 — ce qu'aucune graine prise seule ne montre. C'est le bon
    // dispositif, et il dit la même chose en mieux : la compensation tient
    // longtemps, et elle a une fin.
    //
    // Le premier régime retrouve l'observation de Dupraz — « le rendement
    // n'est pas beaucoup affecté tant que H/L reste sous 0,8 » — mais **pas** pour
    // la même raison, et il faut le dire : chez lui l'allée est fertilisée,
    // donc son seuil est de l'ombre pure. Ici c'est une compensation, l'ombre
    // coûte et la litière de noyer rend. Même chiffre, composition différente,
    // et c'est la fertilisation qui manque au moteur pour les séparer.
    const ANS = 34;
    const GRAINES = [4, 1, 7, 33, 2022];
    const parGraine = GRAINES.map((graine) => {
      const pur = culture({ ans: ANS, cote: 40, rayonM: 3, graine });
      const allee = culture({
        ans: ANS,
        cote: 40,
        rayonM: 3,
        graine,
        arbres: [
          { especeId: "juglans_regia", y: 16 },
          { especeId: "juglans_regia", y: 24 },
        ],
      });
      return (a: number) => ((pur[a] ?? 0) > 0 ? (allee[a] ?? 0) / (pur[a] ?? 1) : 0);
    });
    const rapport = (a: number) =>
      parGraine.reduce((somme, r) => somme + r(a), 0) / parGraine.length;

    // **ce que cet essai montrait, c'était le masquage**, et c'est ce qui a
    // motivé le lot de la fertilisation (#140). Sans apport, le témoin en blé
    // pur s'épuise pendant que l'allée reçoit la litière des noyers : on mesure
    // donc l'azote des arbres autant que leur ombre.
    //
    // Le gradient d'**ombre pure** est mesuré ailleurs, les deux côtés fertilisés
    // (`fertilisation.test.ts`) : 0,993 à H/L 0,29 puis 0,706 à 1,28, monotone.
    // Cet essai-ci garde ce qu'il est seul à dire : ce que l'azote de l'arbre
    // fait, ou ne fait plus, à une allée qui n'en reçoit pas d'autre.
    expect(rapport(3)).toBeGreaterThan(0.95);
    // **Le masquage est tombé avec #291, et il faut dire pourquoi.** Cet essai
    // affirmait que la compensation tenait jusqu'à H/L ≈ 1 : 0,953 à l'an 25,
    // 0,899 à l'an 33, sur la moyenne des cinq graines. Mesuré après :
    //
    //     graine        4      1      7     33   2022   moyenne
    //     an 25      0,781  0,921  0,841  0,828  0,795    0,833
    //     an 33      0,678  0,696  0,730  0,757  0,739    0,720
    //
    // Deux variantes l'ont isolé : l'export net ne change rien ici (pas de
    // nappe) ; c'est la traversée de la surface. Sous les noyers, les racines
    // vident les horizons profonds l'été, et la pluie qui les remplit traverse
    // l'horizon de surface en emportant son nitrate — ce que le calcul d'avant,
    // qui lisait le drainage sous le profil, ne voyait pas. La physique est plus
    // juste ; le masquage d'avant reposait en partie sur une rétention de surface
    // qui n'existe pas.
    //
    // **Mais ce nitrate, un vrai noyer le reprend** par ses racines profondes —
    // le « filet de sécurité » de l'agroforesterie —, et le moteur ne sait pas
    // encore le faire : c'est le lot B de #247. Tant qu'il manque, l'allée non
    // fertilisée perd **au moins** ce que l'ombre seule lui coûte
    // (`fertilisation.test.ts` : 0,808 à H/L 1,02, 0,706 à 1,28). Cet essai le
    // garde tel quel, et il est **attendu qu'il bascule** quand le lot B
    // arrivera : c'est à ce moment-là qu'il faudra le réécrire, pas avant.
    //
    // **Il a bougé avant, et pas à cause du lot B** (#247). Avec la perte d'humus
    // au labour calée sur West et Post (1 % par passage au lieu de 5 % sans
    // source) :
    //
    //     graine        4      1      7     33   2022   moyenne
    //     an 25      0,890  0,925  0,924  0,919  0,894    0,910
    //     an 33      0,791  0,818  0,875  0,843  0,834    0,832
    //
    // (grain lu sur pied, `grainRecoltableT` : la trésorerie comptait aussi le
    // passage d'engin, moins cher entre des rangs d'arbres.) L'allée ne perd
    // plus « au moins ce que l'ombre seule lui coûte » : 0,910 à l'an 25 et
    // 0,832 à l'an 33, contre 0,808 et 0,706 d'ombre pure, fertilisée des deux
    // côtés (`fertilisation.test.ts`). La litière des noyers
    // recompense de nouveau quelques points, parce que le labour annuel ne brûle
    // plus l'humus qu'elle construit. L'ancienne borne (0,9) tombait à un
    // millième de la moyenne relevée à travers la trésorerie, et une borne à ce
    // point du relevé mesure le tirage.
    // Ce qui reste affirmé : l'allée non fertilisée paie son ombre à l'an 25, et
    // de plus en plus avec l'âge.
    //
    // **Le lot B est arrivé, et l'essai a basculé dans l'autre sens** (#247).
    // On attendait que le noyer reprenne au fond le nitrate perdu, et rende de
    // la compensation. Mais le blé y descend aussi désormais (120 cm, FAO-56) :
    // rien n'est plus lessivé, ni sous le blé pur ni sous l'allée, et le noyer
    // dispute au blé l'azote du fond comme celui de la surface. Mesuré :
    //
    //     graine        4      1      7     33   2022   moyenne
    //     an 25      0,653  0,712  0,766  0,738  0,689    0,712
    //     an 33      0,431  0,504  0,620  0,527  0,521    0,521
    //
    // contre 0,862 et 0,749 pour la même allée fertilisée à 192 kg N (graine
    // 4) : sans apport, la concurrence pour l'azote s'ajoute à l'ombre. Le
    // plancher qui suivait (0,6) n'avait pas de source, c'était un relevé du
    // moteur ; il est remplacé par ce que chaque graine montre sans exception,
    // une perte qui croît avec l'âge.
    //
    // **Et elle s'est creusée de moitié quand les noyers ont cessé de subir
    // leur propre juglone** (#375). Plantés à huit mètres les uns des autres, ils
    // poussaient à la moitié de ce qu'ils pouvaient ; libérés, ils prennent à un
    // blé sans apport l'ombre et l'azote d'arbres deux fois plus grands :
    //
    //     graine        4      1      7     33   2022   moyenne
    //     an 25      0,274  0,316  0,427  0,337  0,340    0,339
    //     an 33      0,151  0,209  0,198  0,176  0,195    0,186
    //
    // contre 0,723 et 0,534 de moyenne juste avant. Les directions tiennent sur
    // chaque graine, et c'est tout ce que l'essai affirme. Le niveau, lui, n'a
    // pas d'ancre : aucune allée de huit mètres ne porte des noyers de vingt-
    // cinq ans sans engrais, et le moteur dit seulement qu'elle ne nourrirait
    // plus grand-chose.
    expect(rapport(25)).toBeLessThan(0.95);
    expect(rapport(25)).toBeLessThan(rapport(3));
    // L'ombre gagne toujours avec l'âge, et le classement des âges reste strict.
    expect(rapport(33)).toBeLessThan(rapport(25));
    for (const [i, r] of parGraine.entries()) {
      expect(r(25), `graine ${GRAINES[i]}`).toBeLessThan(r(3));
      expect(r(33), `graine ${GRAINES[i]}`).toBeLessThan(r(25));
    }
  }, 1_800_000);
});
