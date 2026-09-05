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
 * **Ce que cet essai prouve, et ce qu'il ne prouve pas.** Les deux âges n'ont
 * pas le même statut, et c'est délibéré.
 *
 * À QUARANTE ANS, deux espèces sont CALÉES sur la table : le hêtre et le
 * bouleau ont vu leur `pousseMaxMAn` dérivé de cette valeur-là (especes.ts).
 * Pour elles, l'essai ne valide rien — il garde l'acquis, et il attrapera
 * toute dérive future. Les trois autres — pin, aulne, frêne — n'ont pas été
 * touchées : leur accord avec la table, lui, est un vrai résultat.
 *
 * À VINGT ANS, aucune espèce n'est calée. C'est la vérification tenue à
 * l'écart : un seul paramètre par espèce a été ajusté, sur un seul âge, et le
 * second âge est une PRÉDICTION de la forme de la courbe. Mesuré : −13 % à
 * +10 % selon l'essence. C'est ce chiffre-là qui dit quelque chose du moteur.
 *
 * **Convention assumée** : le moteur n'a pas de notion d'indice de fertilité.
 * Caler une essence sur une classe de table oblige donc à décréter qu'une
 * station la représente — ici, `LIMON_RICHE` VAUT la classe médiane. Une
 * station plus pauvre en jeu donnera moins, une plus riche davantage ; c'est
 * le comportement RELATIF que le moteur modélise, et la table lui donne son
 * échelle.
 *
 * Les tolérances tiennent compte de deux bruits : les classes de fertilité de
 * la table s'étalent déjà de −18 % à +16 % autour de la médiane (hêtre à 40
 * ans : 13,1 m en GK6, 16,0 en GK8, 18,6 en GK10), et chaque arbre porte une
 * vigueur individuelle à ±20 % (`trees.ts`) — d'où la moyenne sur plusieurs
 * individus ET plusieurs graines.
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

/** À quarante ans : garde-fou serré, puisque deux espèces y sont calées. */
const TOLERANCE_CALAGE = 0.15;
/** À vingt ans : vérification tenue à l'écart, aucune espèce n'y est calée. */
const TOLERANCE_TENUE_A_LECART = 0.2;
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
      for (const [jalon, attendu, obtenu, tolerance] of [
        ["20 ans", ref.h20, sim.h20, TOLERANCE_TENUE_A_LECART],
        ["40 ans", ref.h40, sim.h40, TOLERANCE_CALAGE],
      ] as const) {
        const ecart = obtenu / attendu - 1;
        expect(
          Math.abs(ecart),
          `${ref.nom} à ${jalon} : ${obtenu.toFixed(1)} m simulés contre ${attendu} m dans la table (${(100 * ecart).toFixed(0)} %)`,
        ).toBeLessThan(tolerance);
      }
    }, 300_000);
  }

  it("le bouleau reste devant le hêtre en jeunesse : c'est un pionnier", () => {
    // Le bouleau n'est PAS calé sur une table, et l'essai ne prétend donc pas
    // le mesurer. La seule table du corpus est norvégienne (Braastad 1967) :
    // 8,6 m à vingt ans, ce qui est un bouleau boréal, pas un bouleau de
    // bocage. On avait un moment conclu que l'atlas se trompait de rang parce
    // que cette table donne l'aulne allemand devant — mais comparer une table
    // norvégienne à une table allemande, c'est comparer deux climats.
    //
    // Ce qui se vérifie sans table, en revanche, c'est le tempérament : un
    // pionnier prend l'avance sur une climacique, et la garde à vingt ans.
    // Faute de référence transposable, ralentir le bouleau cassait cinq
    // conclusions écologiques du dépôt sans qu'aucune preuve ne l'exige.
    expect(hauteurs("betula_pendula").h20).toBeGreaterThan(hauteurs("fagus_sylvatica").h20);
  }, 600_000);

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
