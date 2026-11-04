/**
 * Le pin sylvestre contre sa table de production, sur sept graines (#473).
 *
 * Le pourquoi du banc et de sa station est dans `hauteurs.test.ts` et
 * `hauteurs-commun.ts` : huit sujets au large, la classe médiane de Jansen
 * 1996, jugée sur le sable de couverture que la table décrit (#254).
 *
 * **Le pin a quitté le fichier commun parce que son banc a grandi.** Deux
 * graines ne suffisaient plus. Depuis que le phosphore de la matière organique
 * suit son azote (#473), le pin du sable ne manque plus de phosphore que le
 * quart des semaines (les trois quarts sur le moteur d'avant), et pousse de 6 à
 * 10 % plus haut. Plus haut, il offre plus de prise aux coups de vent : sur la
 * graine 17, ses huit sujets tombent en chablis entre vingt-deux et
 * trente-deux ans (cinq sur huit sur le moteur d'avant), et la moyenne des deux
 * graines du banc tombait à 7,9 m pour 15,5. Sur sept graines (17, 43, 7, 1 à
 * 4), le moteur d'avant faisait 15,30 m, et le nouveau 14,05 m en comptant zéro
 * pour la graine rasée : dans la bande, dans les deux cas.
 *
 * **Mesuré sur ce banc**, graines 17 / 43 / 1 / 2 / 3 / 4 / 5 : 0 (aucun pin
 * vivant) / 15,79 / 17,35 / 17,36 / 15,19 / 18,22 / 15,42 m à quarante ans,
 * 14,19 m en moyenne (−8,5 %) ; 9,19 m à vingt ans (+13,5 %). Prédit avant la
 * course : 13,5 à 16,0 m, et 8,5 à 9,7 m.
 *
 * **Ce qui change, et ce qui ne change pas.** Le banc tourne sur les deux
 * graines d'avant et les cinq premières (17, 43, 1, 2, 3, 4, 5), choisies avant
 * la course. La bande de la table ne bouge pas (15,5 m à quarante ans à 15 %
 * près, calée ; 8,1 m à vingt ans à 20 % près, tenue à l'écart), et la règle
 * du banc pour une graine rasée non plus : elle compte zéro.
 */

import { describe, expect, it } from "vitest";
import { a, hauteurs, TABLE, TOLERANCE_CALAGE, TOLERANCE_TENUE_A_LECART } from "./hauteurs-commun";

const GRAINES_PIN = [17, 43, 1, 2, 3, 4, 5];

describe("hauteurs absolues contre les tables de production (pin)", () => {
  const ref = TABLE.pinus_sylvestris;
  if (!ref) throw new Error("table du pin manquante");
  it(`${ref.nom} : 20 et 40 ans dans la bande de la table, sur sept graines`, () => {
    const sim = hauteurs("pinus_sylvestris", 40, ref.sc, 60, GRAINES_PIN);
    const jalons: [string, number, number, number][] = [
      ["40 ans", ref.h40, a(sim, 40), TOLERANCE_CALAGE],
    ];
    if (ref.h20 !== undefined) {
      jalons.push(["20 ans", ref.h20, a(sim, 20), TOLERANCE_TENUE_A_LECART]);
    }
    for (const [jalon, attendu, obtenu, tolerance] of jalons) {
      const ecart = obtenu / attendu - 1;
      expect(
        Math.abs(ecart),
        `${ref.nom} à ${jalon} : ${obtenu.toFixed(1)} m simulés contre ${attendu} m dans la table (${(100 * ecart).toFixed(0)} %)`,
      ).toBeLessThan(tolerance);
    }
    // **Le délai** (#378) : sept graines de quarante ans. En CI sur main, deux
    // graines de pin prenaient 154 à 251 s, soit jusqu'à 125 s la graine ; sept
    // en demandent jusqu'à 880. Le délai en fait 2,5 fois, arrondi à la minute.
  }, 2_220_000);
});
