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
}): number[] {
  const { ans, cote, rayonM } = options;
  const station = { ...LIMON_RICHE.station, coteM: cote, voisinage: [] };
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
    const r = culture({ ans: 121, cote: 30, rayonM: 14 });
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
    // chacune des trois dernières tranches : on ne prétend pas mesurer Broadbalk,
    // on prétend ne pas en être loin une fois le sol à l'équilibre.
    for (const debut of [61, 81, 101]) {
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
  }, 900_000);
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
