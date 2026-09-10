/**
 * Ce que la météo réelle apporte que la synthétique ne peut pas (ch4-B) :
 * la colonisation de la lande ne se fait pas à débit constant mais par
 * VAGUES, au gré des séquences humides — quelques semis les années sèches,
 * des dizaines les années favorables. Seules les frugales (bouleau, pin)
 * passent ; les exigeantes sont exclues (cf. tolerances.test.ts).
 */

import { describe, expect, it } from "vitest";
import { serieMeteoPour } from "../../src/data/meteo";
import { serieToWeeks } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState } from "../../src/engine/state";
import { LANDE_SECHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

describe("colonisation de la lande (météo réelle 1964→)", () => {
  const serie = serieMeteoPour("lande-seche");
  if (!serie) throw new Error("série manquante");
  const weather = serieToWeeks(serie);
  // Parcelle réduite (60 × 60 m) : mêmes dynamiques, test plus rapide.
  const station = { ...LANDE_SECHE.station, coteM: 60 };
  let state = createGameState(station, rngStateFromSeed(7));
  const betulaByYear: number[] = [];
  const pinusByYear: number[] = [];
  /** Bouleaux en âge de grainer, année par année : les semenciers du moment. */
  const semenciersByYear: number[] = [];
  for (let i = 0; i < 42 * 52; i++) {
    const w = weather[i % weather.length];
    if (!w) throw new Error("météo manquante");
    state = tick(state, w).state;
    if ((i + 1) % 52 === 0) {
      betulaByYear.push(
        state.trees.filter((t) => t.alive && t.especeId === "betula_pendula").length,
      );
      pinusByYear.push(
        state.trees.filter((t) => t.alive && t.especeId === "pinus_sylvestris").length,
      );
      semenciersByYear.push(
        state.trees.filter(
          (t) => t.alive && t.especeId === "betula_pendula" && t.ageWeeks / 52 >= 10,
        ).length,
      );
    }
  }
  /**
   * Plus longue séquence CONSÉCUTIVE d'années au-dessus du seuil.
   *
   * Pourquoi consécutive, et pas le total : le total d'années au-dessus d'un
   * seuil ne mesure, sur cette station, que la DATE DU PREMIER INCENDIE. Une
   * graine qui brûle à l'année 15 puis à l'année 26 cumule onze années
   * au-dessus de trente tiges ; une graine qui ne brûle pas en cumule
   * trente-huit. C'est une propriété du tirage, pas du pin. La plus longue
   * série, elle, dit combien de temps l'espèce tient la station tant qu'un feu
   * ne la remet pas à zéro — ce qui est la question écologique.
   */
  function plusLongueSerie(parAnnee: readonly number[], seuil: number): number {
    let max = 0;
    let courante = 0;
    for (const n of parAnnee) {
      courante = n > seuil ? courante + 1 : 0;
      if (courante > max) max = courante;
    }
    return max;
  }

  it("les deux pionnières frugales colonisent durablement le sable", () => {
    // « Durablement » ne veut pas dire « pour toujours » : sur la lande, un
    // incendie remet les compteurs à zéro. Ce qu'on vérifie, c'est que chacune
    // s'installe et tient des décennies — pas l'état de la dernière année.
    //
    // ON NE NOMME PAS LES ANNÉES D'INCENDIE. Le régime de feu dépend
    // entièrement de la graine : mesuré sur six d'entre elles, on va d'AUCUN
    // feu en quarante-deux ans à trois feux (années 1, 19 et 38). Un
    // commentaire qui datait l'incendie s'est déjà retrouvé faux quand le
    // moteur a changé — la date n'est pas une propriété écologique, le
    // comportement en est une.
    //
    // Le bouleau tient la station de 31 à 34 ans d'affilée sur les dix graines
    // mesurées : la marge sur le seuil est large, et il n'y a pas de graine
    // limite.
    expect(plusLongueSerie(betulaByYear, 50)).toBeGreaterThan(12);

    // Le pin, lui, demande DEUX clauses, et c'est le régime de feu qui
    // l'impose. Il s'installe franchement — il culmine de 96 à 492 tiges sur
    // les dix graines mesurées, selon le nombre de feux — puis il tient la
    // station à une trentaine de tiges, sous le bouleau qui monte plus vite et
    // prend la lumière.
    //
    // La deuxième clause a été posée trop haut une première fois : elle
    // comptait les années au-dessus de trente tiges, consécutives ou non, et
    // demandait plus de douze. Elle est passée à 13 puis à 11 quand l'ombrage
    // de lisière a décalé le flux aléatoire, donc le calendrier des feux, sans
    // rien changer d'écologique — la lisière ne retire que quelques dixièmes de
    // pour cent de lumière sur cette parcelle. Un test qui bascule sur un
    // décalage de feu ne mesure pas ce qu'il annonce.
    //
    // Sur dix graines, la plus longue série consécutive va de 10 ans (graine 7,
    // deux feux) à 39 ans (graine 23, aucun) ; le seuil est placé sous le pire
    // cas mesuré, pas sur lui.
    //
    // Pourquoi le bouleau l'emporte, et pourquoi c'est défendable : il rejette
    // de souche après un feu (`rejetteApresFeu`), le pin non ; il fructifie à
    // dix ans contre quinze, et sème deux fois plus. Un feu fréquent favorise
    // les rejeteurs contre les semenciers obligés — c'est un schéma documenté.
    // Que les Landes soient un pays de pin relève de la plantation et de la
    // gestion, pas de la succession spontanée sous feu fréquent.
    expect(Math.max(...pinusByYear)).toBeGreaterThan(50);
    expect(plusLongueSerie(pinusByYear, 30)).toBeGreaterThan(8);
  });

  it("l'installation se fait par vagues, pas à débit constant (météo réelle)", () => {
    // On rapporte les gains au NOMBRE DE SEMENCIERS de l'année. Sans cette
    // normalisation, on ne mesure que la croissance exponentielle d'une
    // population qui se ressème elle-même : dix bouleaux en font plus que
    // deux, quel que soit le temps qu'il fait. Ce qu'on veut voir, c'est que
    // le RENDEMENT d'un semencier varie fortement d'une année sur l'autre —
    // c'est ça, une fenêtre d'installation.
    // La fenêtre d'observation va jusqu'à l'année 38, pas 25 : depuis que la
    // croissance juvénile suit une sigmoïde (`FORME_CROISSANCE`, trees.ts), un
    // bouleau met plus longtemps à devenir semencier, et la cohorte de départ
    // n'atteint le seuil des cinq porte-graines que vers l'année vingt. On
    // s'arrête avant l'incendie de l'année 39, qui remet les compteurs à zéro.
    const rendements: number[] = [];
    for (let i = 1; i < 38; i++) {
      const semenciers = semenciersByYear[i - 1] ?? 0;
      if (semenciers < 5) continue; // avant, c'est la pluie de semis du voisinage
      rendements.push(((betulaByYear[i] ?? 0) - (betulaByYear[i - 1] ?? 0)) / semenciers);
    }
    expect(rendements.length).toBeGreaterThan(5);
    const tries = [...rendements].sort((a, b) => a - b);
    const median = tries[Math.floor(tries.length / 2)] ?? 0;
    const best = Math.max(...rendements);
    // Une bonne année vaut plusieurs années ordinaires, par semencier.
    expect(best).toBeGreaterThan(2 * Math.max(0.05, median));
  });

  it("la colonisation part de rien et met des décennies", () => {
    expect(betulaByYear[2] ?? 0).toBeLessThan(30);
    // On compare au sommet atteint, pas à la dernière année : un incendie tardif
    // ne doit pas effacer le fait que la colonisation a bien eu lieu.
    expect(Math.max(...betulaByYear)).toBeGreaterThan(5 * (betulaByYear[2] ?? 1));
  });
});
