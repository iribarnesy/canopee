/**
 * Calibration des HAUTEURS ABSOLUES sur les tables de production.
 *
 * Les rapports entre essences et entre stations étaient justes de longue date ;
 * les niveaux, non — un hêtre de plaine plafonnait à moins de cinq mètres à
 * quarante ans. Cet essai attache le moteur à une vérité terrain publiée
 * plutôt qu'à lui-même.
 *
 * **Référence retenue** : Jansen J.J., Sevenster J., Faber P.J. (1996),
 * *Opbrengsttabellen voor belangrijke boomsoorten in Nederland*, IBN-DLO
 * rapport 221 / Hinkeloord Report 17 (https://edepot.wur.nl/174739). C'est la
 * seule table du corpus consulté qui donne directement la HAUTEUR DOMINANTE,
 * avec un âge compté depuis la germination et de nombreuses classes de
 * fertilité ; le CNPF (2025, *Faciliter l'utilisation des tables de production
 * forestières*) la juge parmi les mieux adaptées au contexte français pour
 * plusieurs de ces essences. On prend la CLASSE MÉDIANE de chaque essence.
 *
 * **Ce qu'on compare.** Le moteur ne connaît pas la notion de « cent plus gros
 * arbres à l'hectare » : on lui fait pousser huit sujets au large sur la
 * station confort et on prend leur hauteur moyenne. C'est la grandeur la plus
 * proche de la hauteur dominante — les dominés, qui tirent la moyenne d'un
 * peuplement vers le bas, n'existent pas ici.
 *
 * **Tolérance : ±45 % sur les deux âges TABULÉS (20 et 40 ans), et pourquoi.**
 * Trois sources d'écart s'additionnent.
 * (1) Les classes de fertilité de la table elle-même s'étalent de −18 % à
 * +16 % autour de la médiane (hêtre à 40 ans : 13,1 m en GK6, 16,0 en GK8,
 * 18,6 en GK10) — et nos stations de test ne sont calées sur AUCUNE classe.
 * (2) Chaque arbre porte une vigueur individuelle à ±20 % (`trees.ts`), d'où
 * la moyenne sur plusieurs individus ET plusieurs graines. (3) Le moteur reste
 * en retard sur les feuillus d'ombre, dont le hêtre, parce que le facteur eau
 * les bride sur une station qui ne reçoit que 750 mm.
 *
 * Une bande de ±45 % certifie donc « la bonne classe de fertilité, à une
 * classe près » — pas davantage. Elle suffit à rattraper l'erreur qu'on vient
 * de corriger : le hêtre était à 0,30 fois la table à quarante ans.
 */

import { describe, expect, it } from "vitest";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantScattered } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

/**
 * Hauteur dominante TABULÉE à 20 et 40 ans, classe médiane (Jansen 1996).
 *
 * On ne compare pas à dix ans : la table ne descend pas sous quinze ans, et
 * les valeurs à dix ans qui circulent sont des extrapolations — ce n'est pas
 * de la vérité terrain, et le moteur n'a pas à s'y caler. Le début de courbe
 * est vérifié autrement, par sa FORME (dernier essai du fichier).
 */
const TABLE: Record<string, { nom: string; h20: number; h40: number }> = {
  // Beuk, GK 8 (gamme 4→12), d'après Carbonnier 1971 et Schober 1972.
  fagus_sylvatica: { nom: "Hêtre", h20: 7.7, h40: 16.0 },
  // Groveden, GK 8 (gamme 4→12), d'après Faber 1996a.
  pinus_sylvestris: { nom: "Pin sylvestre", h20: 8.1, h40: 15.5 },
  // Zwarte els, GK 6 (gamme 4→8), d'après Mitscherlich 1945.
  alnus_glutinosa: { nom: "Aulne", h20: 12.6, h40: 18.0 },
  // Es, GK 6 (gamme 4→9), d'après Volquardts 1958.
  fraxinus_excelsior: { nom: "Frêne", h20: 9.0, h40: 16.5 },
};

const TOLERANCE = 0.45;
const GRAINES = [17, 43];
const PLANTS = 8;

/** Hauteur moyenne des sujets plantés, aux jalons demandés, moyennée sur les graines. */
function hauteurs(especeId: string): { h10: number; h20: number; h40: number } {
  const weather = syntheticYear(LIMON_RICHE.climat);
  // Parcelle réduite (60 × 60 m) : mêmes dynamiques, essai plus rapide.
  const station = { ...LIMON_RICHE.station, coteM: 60, gibierParHa: 0, voisinage: [] };
  const cumul = { h10: 0, h20: 0, h40: 0 };
  for (const graine of GRAINES) {
    let state = createGameState(station, rngStateFromSeed(graine));
    state = plantScattered(state, especeId, PLANTS, 0.3);
    for (let i = 0; i < 40 * 52; i++) {
      const w = weather[i % weather.length];
      if (!w) throw new Error("météo manquante");
      state = tick(state, w).state;
      const an = (i + 1) / 52;
      if (an !== 10 && an !== 20 && an !== 40) continue;
      const vivants = state.trees.filter((t) => t.alive && t.id <= PLANTS);
      const moyenne = vivants.length
        ? vivants.reduce((s, t) => s + t.heightM, 0) / vivants.length
        : 0;
      if (an === 10) cumul.h10 += moyenne;
      else if (an === 20) cumul.h20 += moyenne;
      else cumul.h40 += moyenne;
    }
  }
  const n = GRAINES.length;
  return { h10: cumul.h10 / n, h20: cumul.h20 / n, h40: cumul.h40 / n };
}

describe("hauteurs absolues contre les tables de production", () => {
  for (const [especeId, ref] of Object.entries(TABLE)) {
    it(`${ref.nom} : 20 et 40 ans dans la bande de la table`, () => {
      const sim = hauteurs(especeId);
      for (const [jalon, attendu, obtenu] of [
        ["20 ans", ref.h20, sim.h20],
        ["40 ans", ref.h40, sim.h40],
      ] as const) {
        const ecart = obtenu / attendu - 1;
        expect(
          Math.abs(ecart),
          `${ref.nom} à ${jalon} : ${obtenu.toFixed(1)} m simulés contre ${attendu} m dans la table (${(100 * ecart).toFixed(0)} %)`,
        ).toBeLessThan(TOLERANCE);
      }
    }, 300_000);
  }

  it("le bouleau reste trop rapide en jeunesse — écart connu, et borné", () => {
    // Le bouleau est la seule essence de l'échantillon que le moteur pousse
    // AU-DESSUS de la meilleure classe publiée : 12,6 m à vingt ans contre
    // 8,6 m en classe médiane et 9,5 m en GK6, la meilleure de Braastad
    // 1967. Ce n'est pas la forme de courbe qui est en cause — c'est
    // `pousseMaxMAn = 0,9 m/an`, hérité de l'atlas et jamais confronté à une
    // table. Les tables donnent d'ailleurs l'aulne PLUS rapide que le
    // bouleau en jeunesse (12,6 contre 8,6 m à vingt ans), quand l'atlas
    // range le bouleau devant. Corriger ce rang-là est un autre chantier :
    // ici on se contente de borner l'écart pour qu'il ne s'aggrave pas.
    const sim = hauteurs("betula_pendula");
    expect(sim.h20).toBeGreaterThan(8.6);
    expect(sim.h20).toBeLessThan(14);
    expect(sim.h40).toBeGreaterThan(11.2); // GK3, la plus mauvaise classe
    expect(sim.h40).toBeLessThan(22);
  }, 300_000);

  it("la courbe a la forme d'une sigmoïde, pas d'une exponentielle qui s'épuise", () => {
    // Ce que le moteur faisait avant : pousse maximale à la germination, puis
    // décroissance — la seule forme de la famille Chapman-Richards qui ne
    // soit pas sigmoïde. Sur la table, un hêtre fait 21 % de sa hauteur de
    // quarante ans au bout de dix ans ; avec l'ancienne forme il en faisait
    // 39 %. On vérifie donc que le début de courbe reste bas.
    const sim = hauteurs("fagus_sylvatica");
    expect(sim.h10 / sim.h40).toBeLessThan(0.3);
    expect(sim.h10 / sim.h40).toBeGreaterThan(0.13);
  }, 300_000);
});
