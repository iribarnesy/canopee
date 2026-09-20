/**
 * Le second volet des hauteurs absolues : frêne, charme, châtaignier — et les
 * arbustes, qui n'ont jamais eu de table.
 *
 * Le pourquoi de la coupe est dans `hauteurs.test.ts` ; le dispositif partagé
 * dans `hauteurs-commun.ts`. Le châtaignier est ici avec l'essai de forme qui
 * le lit, pour qu'aucune espèce ne soit simulée deux fois.
 */

import { describe, expect, it } from "vitest";
import type { LIMON_RICHE } from "../../src/engine/stations";
import {
  a,
  hauteurs,
  LIMON_ACIDE,
  TABLE,
  TOLERANCE_CALAGE,
  TOLERANCE_TENUE_A_LECART,
} from "./hauteurs-commun";

describe("hauteurs absolues contre les tables de production (frêne, charme, châtaignier)", () => {
  const especes = ["fraxinus_excelsior", "carpinus_betulus", "castanea_sativa"];
  for (const [especeId, ref] of Object.entries(TABLE)) {
    if (!especes.includes(especeId)) continue;
    it(`${ref.nom} : 20 et 40 ans dans la bande de la table`, () => {
      const sim = hauteurs(especeId, 40, ref.sc);
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
    }, 300_000);
  }
  it("le châtaignier de semis reste DERRIÈRE la courbe de taillis en jeunesse", () => {
    // Le sens de l'écart est une prédiction, pas un réglage : un rejet de
    // souche démarre sur un système racinaire déjà fait, un semis non. Si le
    // moteur passait DEVANT une courbe de taillis à vingt ans tout en tombant
    // juste à quarante, c'est que sa forme de courbe serait fausse.
    const sim = hauteurs("castanea_sativa", 40, LIMON_ACIDE);
    const h20 = a(sim, 20);
    expect(h20, `${h20.toFixed(1)} m simulés à vingt ans`).toBeLessThan(13.0);
    // Mais pas non plus deux fois plus bas : le retard doit rester un retard
    // de démarrage, résorbé à quarante ans.
    expect(h20).toBeGreaterThan(0.7 * 13.0);
  }, 300_000);
});

/**
 * LES ARBUSTES N'ONT PAS DE TABLE — ils ont des mesures, et ce n'est pas la
 * même chose.
 *
 * Aucun forestier n'a jamais dressé de table de production pour une aubépine :
 * on ne la vend pas au mètre cube. Ce qui existe est d'une autre nature — des
 * essais en jardin, des plantations de boisement suivies cinq ans, des
 * monographies de la série *Biological Flora of the British Isles*. C'est plus
 * pauvre (souvent un seul chiffre, parfois lu sur une figure), mais c'est
 * MESURÉ, et c'est de la bonne géographie : sud de l'Angleterre, Midlands,
 * Bretagne, plaine allemande.
 *
 * **Aucune de ces quatre espèces n'est calée** : les quatre valeurs de
 * `pousseMaxMAn` sont celles d'avant cette campagne. L'essai est donc une
 * vérification entière, pas un garde-fou — et il passe, ce qui est le vrai
 * résultat de ce fichier.
 *
 * Parcelle de 40 m au lieu de 60 : à ces âges-là et pour des sujets de deux à
 * trois mètres, la mesure ne bouge pas (2 % sur l'aubépine à douze ans) et
 * l'essai coûte trois fois moins.
 */
const MESURES: {
  espece: string;
  nom: string;
  /** bandes attendues, en mètres, aux âges mesurés par la source */
  bandes: { an: number; bas: number; haut: number }[];
  sc?: typeof LIMON_RICHE;
  source: string;
}[] = [
  {
    // 37 cm/an sur douze ans en jardin (Grubb 1999) contre ~28 sur cinq ans en
    // plantation forestière (Willoughby 2007) : deux protocoles anglais, une
    // bande. On vérifie que le moteur tombe dedans, pas qu'il tombe sur l'un
    // des deux. Bande élargie de deux centimètres par an vers le bas pour
    // absorber le bruit (vigueur individuelle à ±20 %, deux graines).
    espece: "crataegus_monogyna",
    nom: "Aubépine",
    bandes: [{ an: 12, bas: 0.3 + 12 * 0.26, haut: 0.3 + 12 * 0.4 }],
    source: "Grubb 1999 et Willoughby 2007 (Angleterre) : 28 à 37 cm/an",
  },
  {
    // +135,9 cm en cinq ans sur limon de marne calcaire, à partir de plants de
    // 41-57 cm (Willoughby 2007, via Thomas 2011). La même source donne 7
    // cm/an sur substrat dégradé : c'est l'écart de STATION, que le moteur doit
    // produire par ses facteurs et non porter dans sa fiche.
    espece: "euonymus_europaeus",
    nom: "Fusain",
    bandes: [{ an: 5, bas: 0.3 + 5 * 0.2, haut: 0.3 + 5 * 0.35 }],
    source: "Willoughby 2007, Midlands anglais : +135,9 cm en 5 ans (27 cm/an)",
  },
  {
    // Waloff & Richards 1977 à Londres, via la Biological Flora 2025 : ~160 cm
    // à trois ans, ~220 cm à huit — un ralentissement, pas une droite, et
    // c'est ce couple qui rend l'essai informatif. Le genêt est calcifuge :
    // sur le limon riche à pH 7 il meurt, on le mesure sur le limon acide.
    espece: "cytisus_scoparius",
    nom: "Genêt à balais",
    bandes: [
      { an: 3, bas: 1.35, haut: 1.85 },
      { an: 8, bas: 1.9, haut: 2.45 },
    ],
    sc: LIMON_ACIDE,
    source: "Waloff & Richards 1977 (Londres) : ~160 cm à 3 ans, ~220 cm à 8 ans",
  },
  {
    // Peterken & Lloyd 1967 : 1,5 à 3,0 m entre huit et quinze ans « given good
    // sunlight ». Le houx aussi meurt à pH 7 (sa gamme s'arrête là).
    espece: "ilex_aquifolium",
    nom: "Houx",
    bandes: [{ an: 10, bas: 1.5, haut: 3.0 }],
    sc: LIMON_ACIDE,
    source: "Peterken & Lloyd 1967 (Grande-Bretagne) : 1,5 à 3,0 m entre 8 et 15 ans",
  },
];

describe("arbustes : ce que disent les mesures de terrain, faute de tables", () => {
  for (const m of MESURES) {
    const dernier = m.bandes[m.bandes.length - 1];
    if (!dernier) throw new Error("bande manquante");
    it(`${m.nom} : dans la bande mesurée à ${m.bandes.map((b) => b.an).join(" et ")} ans`, () => {
      const sim = hauteurs(m.espece, dernier.an, m.sc, 40);
      for (const bande of m.bandes) {
        const h = a(sim, bande.an);
        const message = `${m.nom} : ${h.toFixed(2)} m simulés à ${bande.an} ans, attendu entre ${bande.bas.toFixed(2)} et ${bande.haut.toFixed(2)} m — ${m.source}`;
        expect(h, message).toBeGreaterThan(bande.bas);
        expect(h, message).toBeLessThan(bande.haut);
      }
    }, 120_000);
  }
});
