/**
 * « Les trouées déclenchent une régénération » (docs/realisme.md F7), dans un
 * couvert **vraiment** fermé. Le dispositif est celui de `trouees.test.ts` (la
 * même parcelle, la même trouée, la même pluie de semis venue du paysage, le
 * même comparateur apparié : la même zone, la même graine, avec et sans la
 * trouée) ; il est décrit là-bas et partagé par `trouees-commun.ts`.
 *
 * **La limite écrite de cet essai est tombée** (#95). Le banc de
 * `trouees.test.ts` plante à **huit** mètres, et pas par choix : au-delà, le
 * plafond de recouvrement, qui se comptait sur la **parcelle entière**, bloquait
 * toute installation partout, trouée comprise. Une hêtraie serrée atteint un
 * recouvrement de 6 à 16 pour un plafond de 2,5, et l'essai ne pouvait donc pas
 * éprouver la trouée dans une futaie vraiment dense, qui est pourtant le cas
 * intéressant. Il fallait même un garde-fou, une seconde espèce tolérante dont
 * la présence prouvait qu'il y avait quelque chose à mesurer, parce que sans
 * lui un « zéro recrue sous couvert » aurait décroché le ✅ pour la mauvaise
 * raison. Le plafond est devenu **local**, et ce banc-ci plante à **trois** mètres.
 * Il n'a besoin d'aucun garde-fou : son témoin fermé ne recrute rien parce qu'il
 * est vraiment fermé, et sa trouée recrute parce qu'elle est vraiment ouverte.
 * C'est F7 sans détour.
 *
 * **Le banc a changé (#467), et c'est signalé.** Il plantait des hêtres adultes :
 * 169 tiges de 15 m à 3 m, et la partie durait quinze ans. Avec l'élagage niveau
 * par niveau, aucun élancement ne les tenait.
 * - À l'élancement d'un arbre sans histoire (H/D 50, 30 cm de diamètre), des
 *   troncs trapus dont les houppiers se recouvraient sept à dix fois, le banc
 *   mourait de **faim** : 34 ou 35 hêtres encore debout au bout de cinq ans sur
 *   quatre graines (62 sur la cinquième), et le couvert « vraiment fermé »
 *   s'ouvrait (lumière d'été au sol de 0,39 à 0,74 dans la zone comptée).
 * - À l'élancement d'une hêtraie serrée non éclaircie (H/D 97, Štefančík 2020,
 *   *J. For. Sci.* 66 : 492), les 169 hêtres cassaient **tous au vent** (volis)
 *   dans le premier mois, sur chaque graine : la vitesse de rupture
 *   (`vitesseCritiqueVolisMs`) varie comme (50 / H/D)^1,5 et tombe vers 16 m/s
 *   de rafale à la cime, et rien ne dit au moteur qu'un arbre planté a grandi
 *   abrité. La lumière d'été de la zone remontait à 0,36-0,52 à quinze ans.
 *
 * Un arbre planté adulte n'a pas l'histoire de ses voisins : ni le houppier
 * qu'ils lui ont laissé, ni le vent qu'ils lui ont épargné. Le couvert est donc
 * maintenant **poussé par le moteur** (décision du propriétaire) : une hêtraie
 * pure plantée à 3 m, quarante ans sans pluie de semis, comme la plantation de
 * l'auto-éclaircie (F6, qui garde 1 300 tiges/ha et 3,5 % de lumière au sol à
 * quarante ans, à 2 m). Puis la trouée s'ouvre, le paysage sème, et l'on compte
 * les recrues des quinze ans qui suivent, comme avant. Aucun élancement n'est
 * choisi : la forme des tiges est celle que le moteur leur a donnée. Les deux
 * parties d'une graine partagent leurs quarante premières années, ce qui
 * resserre l'appariement : seule la trouée les sépare. Le critère de F7 ne
 * bouge pas ; la prémisse, elle, se vérifie (le premier essai ci-dessous).
 */

import { beforeAll, describe, expect, it } from "vitest";
import { apresOuverture, type Comptage, couvertFerme, GRAINES } from "./trouees-commun";

describe("une trouée dans un couvert VRAIMENT fermé", () => {
  const parties: {
    seed: number;
    /** lumière d'été au sol de la zone, l'été avant l'ouverture */
    lumiereOuverture: number;
    trouee: Comptage;
    fermee: Comptage;
  }[] = [];

  // Cinq graines, chacune quarante ans de couvert puis deux fois quinze ans.
  beforeAll(() => {
    for (const seed of GRAINES) {
      const couvert = couvertFerme(seed);
      parties.push({
        seed,
        lumiereOuverture: couvert.lumiere,
        trouee: apresOuverture(couvert.etat, true),
        fermee: apresOuverture(couvert.etat, false),
      });
    }
  }, 2_400_000);

  it("la prémisse : le couvert est fermé quand on l'ouvre, et le témoin l'est encore à la fin, sur chaque graine", () => {
    // Sans elle, « le couvert fermé ne recrute rien » pourrait casser parce que
    // le banc s'est ouvert, pas parce que la lumière ne trie plus. Sous les
    // essences d'ombre, dont le hêtre, le sol ne reçoit que 1 à 3 % du PAR
    // (Hagemeier et Leuschner 2019, *Forests* 10 : 925) ; un couvert qui en
    // laisse passer plus de 5 % n'est plus le couvert fermé dont parle F7.
    for (const p of parties) {
      expect(p.lumiereOuverture, `graine ${p.seed}, à l'ouverture`).toBeLessThan(0.05);
      expect(p.fermee.lumiereEteTrouee, `graine ${p.seed}, à la fin`).toBeLessThan(0.05);
    }
  });

  it("le couvert fermé ne recrute RIEN, et l'ouverture recrute", () => {
    // Mesuré sur le banc planté adulte, avant #467, recrues dans la zone
    // (12,20) : 3 / 2 / 4 / 6 / 4 avec la trouée, contre 0 / 0 / 0 / 0 / 0
    // sans elle. Aucun seuil n'est épinglé : ce qui est affirmé, c'est un zéro
    // d'un côté et un non-zéro de l'autre, sur les cinq graines.
    for (const p of parties) {
      expect(p.fermee.trouee, `graine ${p.seed}`).toBe(0);
      expect(p.trouee.trouee, `graine ${p.seed}`).toBeGreaterThan(0);
    }
  });

  it("et le pionnier entre par là, alors qu'il n'entrait nulle part", () => {
    // Le bouleau exige 50 % de lumière : sous ce couvert-là, il n'a aucune
    // chance. Mesuré sur le banc planté adulte, avant #467 : 0 / 1 / 3 / 4 / 1
    // bouleaux dans la trouée. La direction ne peut pas s'exiger graine par
    // graine (une trouée de huit mètres dans une futaie de quinze n'est pas
    // toujours assez claire pour lui), mais le total, lui, est sans ambiguïté.
    const dansLaTrouee = parties.reduce((s, p) => s + p.trouee.bouleauTrouee, 0);
    const sousCouvert = parties.reduce((s, p) => s + p.fermee.bouleauTrouee, 0);
    expect(sousCouvert).toBe(0);
    expect(dansLaTrouee).toBeGreaterThan(3);
  });
});
