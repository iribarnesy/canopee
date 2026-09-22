/**
 * La culture comme strate basse (issue #136, critères C16, E13, H19, H20).
 *
 * Canopée est un jeu d'agroforesterie et ne savait pas faire pousser une
 * culture. Ce fichier vérifie les trois choses que le lot affirme :
 *   1. l'histoire de vie — semée, moissonnée, et elle ne colonise rien ;
 *   2. ce que le rendement vaut, contre une source EXTÉRIEURE au moteur ;
 *   3. que l'ombre des arbres le fait baisser.
 */

import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/engine/actions";
import { HERBACEES, N_HERBACEES } from "../../src/engine/herbacees";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type GameState, plantAt } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

const S_BLE = HERBACEES.findIndex((h) => h.id === "triticum_aestivum");
const FICHE_BLE = HERBACEES[S_BLE];
if (!FICHE_BLE?.culture) throw new Error("fiche du blé manquante");
const BLE = FICHE_BLE.culture;

const WEATHER = syntheticYear(LIMON_RICHE.climat);

/**
 * Mène une parcelle sur `ans` années : labour, semis, moisson chaque année sur
 * un disque, et rend le rendement annuel en t/ha — lu sur la RECETTE, donc sur
 * ce que le joueur touche, pas sur une variable interne.
 */
function culture(options: {
  ans: number;
  cote: number;
  rayonM: number;
  arbres?: { especeId: string; y: number }[];
}): number[] {
  const { ans, cote, rayonM } = options;
  const station = { ...LIMON_RICHE.station, coteM: cote, voisinage: [] };
  let state: GameState = createGameState(station, rngStateFromSeed(4));
  for (const rang of options.arbres ?? []) {
    for (let x = 2; x < cote; x += 8) state = plantAt(state, rang.especeId, x, rang.y, 2);
  }
  const centre = cote / 2;
  const aireHa = (Math.PI * rayonM * rayonM) / 10_000;
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
        const avant = state.economy.treasuryEur;
        state = applyAction(state, {
          type: "moissonner",
          week,
          x: centre,
          y: centre,
          rayonM,
        }).state;
        rendements.push((state.economy.treasuryEur - avant) / BLE.prixEurT / aireHa);
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
   * **Une parcelle NEUVE n'est pas un tapis fermé**, et le premier jet de cet
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
    // semis pose la place LIBRE (`actions.ts`), et une friche n'en laisse pas.
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
    // la fiche — et ~1 t/ha sur celles qui ne reçoivent RIEN, tenu sur cent
    // soixante-dix ans. Le moteur n'a pas d'action de fertilisation : un blé
    // continu doit donc descendre de lui-même vers le second, ce que rien dans
    // le code ne lui dit de faire.
    //
    // Relevé après #141, qui a levé le plafond de tassement : 4,16 t/ha à
    // l'an 4, 2,63 à l'an 12, **1,45 à l'an 24**, 1,20 à l'an 29. Toute la
    // trajectoire a monté d'un quart, et elle descend toujours.
    //
    // **Et elle a été poursuivie jusqu'à l'échelle de l'essai**, parce que
    // comparer trente ans de moteur à cent quatre-vingts ans d'épuisement n'est
    // pas le même dispositif (moyennes par tranche de vingt ans) :
    //
    //     ans 1-20   21-40   41-60   61-80   81-100   101-120
    //       2,96      1,25    0,84    0,78     0,79      0,70
    //
    // Le moteur passe par la gamme de Broadbalk vers les années 20 à 40 puis
    // converge SOUS, à 0,70-0,84. Il glisse donc bien sous 1 là où l'essai
    // tient, et la cause probable reste la PAILLE non restituée
    // (`herbacees.ts`). Mesure détaillée dans `labour-desserre.test.ts`.
    const r = culture({ ans: 26, cote: 30, rayonM: 14 });
    const an2 = r[2] ?? 0;
    const an24 = r[24] ?? 0;
    // Il part haut — le labour d'une bonne terre minéralise son humus — et il
    // s'épuise. Le SENS est l'essentiel.
    expect(an2).toBeGreaterThan(3);
    expect(an24).toBeLessThan(an2 / 2);
    // Et il atterrit dans la bande de la parcelle nue, à un facteur deux près :
    // on ne prétend pas mesurer Broadbalk, on prétend ne pas en être loin.
    expect(an24).toBeGreaterThan(0.5);
    expect(an24).toBeLessThan(2);
  }, 900_000);
});

describe("l'ombre des arbres coûte du rendement", () => {
  it("sans fertilisation, l'azote de l'arbre MASQUE son ombre", () => {
    // Deux rangs de noyers encadrant une allée de 8 m : le rapport
    // hauteur / largeur d'allée monte jusqu'à 1,28 en trente-trois ans.
    //
    // Relevé après #141, allée rapportée au même blé en plein champ :
    // 0,990 à l'an 3 ; 0,982 à l'an 15 ; **1,069 à l'an 25** ; 0,834 à l'an 33.
    //
    // **Ces chiffres ont bougé avec le desserrement par le soc, et il faut dire
    // pourquoi** — le rapport de fin est passé de 0,953 à 0,834. Ce n'est PAS
    // un effet différentiel du tassement : les deux bras sont au même 0,10
    // pendant l'essentiel de l'essai, et l'allée ne descend à 0,05 qu'à la fin,
    // quand les noyers réduisent la part mécanisable. C'est que les deux bras
    // ne sont plus freinés par le sol, donc chacun bute sur ce qui le limite
    // VRAIMENT : le témoin sur son azote, l'allée sur la lumière. Relâcher une
    // contrainte commune fait apparaître celle qui diffère.
    //
    // Le premier régime retrouve l'observation de Dupraz — « le rendement
    // n'est pas beaucoup affecté tant que H/L reste sous 0,8 » — mais PAS pour
    // la même raison, et il faut le dire : chez lui l'allée est fertilisée,
    // donc son seuil est de l'ombre pure. Ici c'est une compensation, l'ombre
    // coûte et la litière de noyer rend. Même chiffre, composition différente,
    // et c'est la fertilisation qui manque au moteur pour les séparer.
    const ANS = 34;
    const pur = culture({ ans: ANS, cote: 40, rayonM: 3 });
    const allee = culture({
      ans: ANS,
      cote: 40,
      rayonM: 3,
      arbres: [
        { especeId: "juglans_regia", y: 16 },
        { especeId: "juglans_regia", y: 24 },
      ],
    });
    const rapport = (a: number) => ((pur[a] ?? 0) > 0 ? (allee[a] ?? 0) / (pur[a] ?? 1) : 0);
    // **CE QUE CET ESSAI MONTRE VRAIMENT, C'EST LE MASQUAGE**, et c'est ce qui
    // a motivé le lot de la fertilisation (#140). Sans apport, le témoin en blé
    // pur s'épuise pendant que l'allée reçoit la litière des noyers : on mesure
    // donc l'azote des arbres bien plus que leur ombre, et le rapport a même
    // dépassé 1 entre H/L 0,93 et 1,11.
    //
    // Le gradient d'OMBRE PURE est mesuré ailleurs, les deux côtés fertilisés
    // (`fertilisation.test.ts`) : 0,999 à H/L 0,29 puis 0,787 à 1,28, monotone.
    // Cet essai-ci garde donc ce qu'il est seul à dire — qu'une allée non
    // fertilisée ne laisse PAS voir l'ombre, parce que l'arbre rend ce qu'il
    // prend.
    expect(rapport(3)).toBeGreaterThan(0.95);
    // **LA COMPENSATION TIENT JUSQU'À H/L ≈ 1, ET ELLE PASSE MÊME DEVANT.** À
    // l'an 25, l'allée rend 7 % de PLUS que le blé pur : la litière des noyers
    // vaut mieux, pour un témoin qui s'épuise, que ce que leur ombre coûte.
    // C'est l'énoncé le plus net de ce que cet essai est seul à dire, et le
    // seuil ci-dessous le prend par le haut plutôt que par le bas.
    expect(rapport(25)).toBeGreaterThan(1);
    // Puis l'ombre finit par gagner, ce que le seuil d'avant ne voyait pas :
    // à H/L 1,28 l'allée décroche de 17 %. Le masquage a une fin.
    expect(rapport(33)).toBeLessThan(0.9);
    expect(rapport(33)).toBeGreaterThan(0.7);
  }, 900_000);
});
