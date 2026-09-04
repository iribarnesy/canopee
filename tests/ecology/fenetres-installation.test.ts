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
  /** Nombre d'années, consécutives ou non, passées au-dessus du seuil. */
  function anneesAuDessus(parAnnee: readonly number[], seuil: number): number {
    return parAnnee.filter((n) => n > seuil).length;
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
    // On compte les années au-dessus du seuil, CONSÉCUTIVES OU NON : une
    // seule interruption ne dit rien de la colonisation.
    expect(anneesAuDessus(betulaByYear, 50)).toBeGreaterThan(12);

    // Le pin, lui, demande DEUX clauses, et c'est le régime de feu qui
    // l'impose. Il s'installe franchement — il passe la cinquantaine de tiges
    // sur les six graines mesurées, de 98 à 332 selon le nombre de feux — puis
    // il tient la station à une trentaine de tiges, sous le bouleau qui monte
    // plus vite et prend la lumière. Lui demander de tenir DOUZE ANS au-dessus
    // de cinquante échouerait dès qu'une graine met deux ou trois feux dans la
    // fenêtre (9 et 11 années seulement, sur les graines 7 et 12).
    //
    // Pourquoi le bouleau l'emporte, et pourquoi c'est défendable : il rejette
    // de souche après un feu (`rejetteApresFeu`), le pin non ; il fructifie à
    // dix ans contre quinze, et sème deux fois plus. Un feu fréquent favorise
    // les rejeteurs contre les semenciers obligés — c'est un schéma documenté.
    // Que les Landes soient un pays de pin relève de la plantation et de la
    // gestion, pas de la succession spontanée sous feu fréquent.
    expect(Math.max(...pinusByYear)).toBeGreaterThan(50);
    expect(anneesAuDessus(pinusByYear, 30)).toBeGreaterThan(12);
  });

  it("l'installation se fait par vagues, pas à débit constant (météo réelle)", () => {
    // On rapporte les gains au NOMBRE DE SEMENCIERS de l'année. Sans cette
    // normalisation, on ne mesure que la croissance exponentielle d'une
    // population qui se ressème elle-même : dix bouleaux en font plus que
    // deux, quel que soit le temps qu'il fait. Ce qu'on veut voir, c'est que
    // le RENDEMENT d'un semencier varie fortement d'une année sur l'autre —
    // c'est ça, une fenêtre d'installation.
    const rendements: number[] = [];
    for (let i = 1; i < 25; i++) {
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
