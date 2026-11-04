/**
 * La glandée et le sanglier : ce que la ration prend, et ce que le boutis
 * détruit (docs/realisme.md, G10). Sorti de `glandee.test.ts` (#467) : relu sur
 * cinq graines, l'essai pèse trop pour partager un fichier, et le fichier est
 * l'unité que la CI répartit.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { glandeeRelative } from "../../src/engine/glandee";
import { DENSITE_REFERENCE_PAR_HA } from "../../src/engine/sanglier";
import { COTE_CHENAIE, chenaie } from "./chenaie-commun";

/** Les cinq graines remesurées pour la décision (#467, D4). */
const GRAINES = [3, 4, 5, 6, 7];
/** Une forte densité de sanglier, par hectare : dix fois la référence. */
const FORTE = 0.5;

interface Mesure {
  recrues: number;
  /** glandée qui survit à la ration, moyenne des dix dernières années */
  glandee: number;
}

/** Recrues et glandée survivante, quarante ans, à une densité donnée. */
function mesure(densite: number, graine: number): Mesure {
  const aireHa = (COTE_CHENAIE * COTE_CHENAIE) / 10_000;
  const r = chenaie(densite, 40, graine);
  const arbres = r.etat.trees.filter((t) => t.alive);
  let somme = 0;
  for (let an = 30; an < 40; an++) {
    somme += glandeeRelative(arbres, "quercus_pubescens", an, r.etat.graineMarche, densite, aireHa);
  }
  return { recrues: r.recrues, glandee: somme / 10 };
}

describe("ce que la mesure a coûté au sanglier", () => {
  const parties: { graine: number; sans: Mesure; ordinaire: Mesure; forte: Mesure }[] = [];

  beforeAll(() => {
    for (const graine of GRAINES) {
      parties.push({
        graine,
        sans: mesure(0, graine),
        ordinaire: mesure(DENSITE_REFERENCE_PAR_HA, graine),
        forte: mesure(FORTE, graine),
      });
    }
  }, 1_800_000);

  it("la ration est petite, et ce n'est PAS elle qui fait reculer le chêne", () => {
    // **l'attribution, et ce fichier est le seul qui puisse la faire** : il a la
    // glandée sous la main, donc il peut séparer les deux prises du sanglier là
    // où `sanglier.test.ts` ne voit que leur somme.
    //
    // Cet essai a d'abord affirmé le **contraire**, et c'était juste à l'époque. À
    // ration ancrée (#197), le sanglier ne pesait plus sur la régénération —
    // 71 · 71 · 71 · 77 · 70 recrues de 0 à 0,5 bête/ha, contre 97 · 82 · 60 · 22
    // sous l'ancienne loi. Le commentaire nommait ce qui manquait : **un boutis
    // détruit les semis, et le moteur n'en comptait que le bon côté** (#199). Le
    // mécanisme est arrivé, et la décroissance avec.
    //
    // **Relu sur décision du propriétaire (#467), et c'est signalé.** L'essai
    // lisait l'attribution à la densité de référence, sur la seule graine 3 :
    // la régénération devait y perdre plus de trois fois ce que la ration prend
    // à la glandée (1,4 %), une marge calée sur le moteur (« six fois mesuré,
    // seuil de marge à trois »). Remesurée sur cinq graines, la perte de
    // recrues à la densité de référence est du tirage : 0 / 5,9 / −1,1 / 13,5 /
    // −6,2 % sur les graines 3 à 7 avec la loi des voisins de #467, et 8,1 /
    // 7,7 / 8,3 / 3,9 / −6,4 % sur le couvert seul (#464). Un effet de
    // quelques recrues sur soixante-dix à cent ne se lit pas sur une graine.
    // À 0,5 sanglier par hectare, il est net partout (de 0,53 à 0,69 fois les
    // recrues sans sanglier, dans les deux variantes). L'essai garde donc la
    // ration petite à la densité de référence, et lit l'attribution à forte
    // densité, graine par graine : la régénération y perd plus que la glandée.
    // Le seuil de trois fois est retiré.
    for (const p of parties) {
      const g = `graine ${p.graine}`;
      // La ration reste petite à densité ordinaire : moins d'un vingtième de la
      // glandée, quand l'ancienne loi en mangeait 55 %.
      expect(1 - p.ordinaire.glandee / p.sans.glandee, g).toBeLessThan(0.05);
      // À forte densité, la régénération perd plus que la glandée : la ration ne
      // peut pas rendre compte de l'écart, donc ce n'est pas elle qui l'explique.
      const perteRecrues = 1 - p.forte.recrues / p.sans.recrues;
      const perteGlandee = 1 - p.forte.glandee / p.sans.glandee;
      expect(perteRecrues, g).toBeGreaterThan(perteGlandee);
      // Et le recul est net, ce qui est la moitié de G10 rendue.
      expect(p.forte.recrues, g).toBeLessThan(0.8 * p.sans.recrues);
      expect(p.forte.recrues, g).toBeGreaterThan(0);
    }
  });
});
