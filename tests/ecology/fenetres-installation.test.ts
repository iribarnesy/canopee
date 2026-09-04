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
    // incendie peut remettre les compteurs à zéro (ici en année 39, ce qui
    // est le comportement attendu). Ce qu'on vérifie, c'est que chacune
    // s'installe et tient des décennies — pas l'état de la dernière année.
    // On compte les années au-dessus du seuil, CONSÉCUTIVES OU NON : la date
    // des incendies varie d'une graine à l'autre, et une seule d'entre elles
    // coupe la série en deux sans rien dire de la colonisation. Ce qui compte
    // est que la station soit tenue une bonne partie du temps.
    expect(anneesAuDessus(betulaByYear, 50)).toBeGreaterThan(12);
    // Le pin tient la station, mais SOUS le bouleau : celui-ci monte plus vite
    // et prend la lumière (ici près de mille tiges en fin de série, contre
    // quelques dizaines de pins). On lui demande donc de tenir des décennies à
    // une trentaine de tiges, pas de faire jeu égal.
    // Le seuil vaut ce que vaut le régime de feu : depuis que le feu CONSUME
    // les chandelles au lieu de les laisser debout (tick.ts), le combustible
    // ne s'accumule plus indéfiniment et les incendies s'espacent (années 15,
    // 23 et 39, au lieu d'un feu tous les trois ou quatre ans). Le bouleau
    // profite de ces longs intervalles ; le pin, lui, redémarre après chaque
    // passage du feu.
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
