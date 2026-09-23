/**
 * Le second volet des hauteurs absolues : frêne, charme, châtaignier — et les
 * arbustes, qui n'ont jamais eu de table.
 *
 * Le pourquoi de la coupe est dans `hauteurs.test.ts` ; le dispositif partagé
 * dans `hauteurs-commun.ts`. Le châtaignier est ici avec l'essai de forme qui
 * le lit, pour qu'aucune espèce ne soit simulée deux fois.
 */

import { describe, expect, it } from "vitest";
import { LIMON_RICHE } from "../../src/engine/stations";
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
  {
    // Repousse de CÉPÉE en taillis anglais : 2,4 à 2,8 m à la quatrième année
    // (Buckley 1992), après 1,5-1,75 m la première puis ~50 cm/an (Harmer
    // 2004). Le moteur en fait 2,66 — dedans.
    //
    // CE QU'ON MESURE ICI EST UN NOISETIER DE TAILLIS, et il faut le savoir :
    // une souche établie repart plus vite qu'un semis, et le moteur ne sait
    // pas faire la différence (sa forme de croissance dépend de la TAILLE,
    // pas de l'âge). C'est son emploi réel en haie, donc la comparaison a un
    // sens — mais elle ne dit rien d'un noisetier de semis.
    espece: "corylus_avellana",
    nom: "Noisetier",
    bandes: [{ an: 4, bas: 2.3, haut: 2.9 }],
    source: "Buckley 1992 (taillis anglais) : 2,4-2,8 m à la 4ᵉ année",
  },
  {
    // LA MEILLEURE GÉOGRAPHIE DU FICHIER : des ajoncs bretons et écossais
    // semés en jardin commun près de Rennes, donc le climat même du bocage
    // qu'on simule. 110 à 130 cm à deux ans (Hornoy 2011, valeur lue sur la
    // figure — le texte ne donne que des écarts relatifs). Le moteur en fait
    // 1,17 m.
    //
    // Les autres chiffres publiés sont d'autres régimes et on ne s'y cale
    // pas : catalogues britanniques 15-30 cm/an (taille commerciale), rejets
    // après brûlage dirigé en Galice 57 cm à trois ans (lande brûlée).
    //
    // L'ajonc est calcifuge (3,5-6,5) : sur le limon riche à pH 7 il meurt.
    espece: "ulex_europaeus",
    nom: "Ajonc d'Europe",
    bandes: [{ an: 2, bas: 1.05, haut: 1.35 }],
    sc: LIMON_ACIDE,
    source: "Hornoy 2011, jardin commun près de Rennes : 110-130 cm à 2 ans",
  },
  {
    // La plus rapide de l'atlas, et le piège est dans la grandeur mesurée :
    // un turion s'allonge de 3 à 6 m par saison, mais il s'arque et se
    // marcotte — L'ALLONGEMENT N'EST PAS UN GAIN DE HAUTEUR. La roncière
    // plafonne bas, et c'est le plafond qu'on éprouve : 1 à 3 m de hauteur
    // finale (bases horticoles allemandes, faute de mesure scientifique de
    // hauteur de roncier). Le moteur fait 2,42 m à cinq ans et plafonne à 2,5.
    espece: "rubus_fruticosus",
    nom: "Ronce",
    bandes: [{ an: 5, bas: 1.0, haut: 3.0 }],
    source: "bases horticoles allemandes : hauteur finale 1 à 3 m",
  },
  {
    // UN PLANCHER, PAS UNE BANDE, et c'est tout ce que la littérature donne :
    // 37 cm/an sur gravats de brique en friche urbaine (Gilbert 1991, via la
    // Biological Flora) — le pire sol imaginable pour un nitrophile. Sur un
    // limon riche, le moteur doit faire MIEUX, et il fait 3,37 m à cinq ans
    // contre 2,15 pour le plancher.
    //
    // La borne haute n'est pas une mesure : c'est un garde-fou à mi-chemin de
    // sa hauteur adulte (7 m). Il attrape un emballement, il ne valide rien.
    espece: "sambucus_nigra",
    nom: "Sureau noir",
    bandes: [{ an: 5, bas: 2.15, haut: 5.0 }],
    source: "Gilbert 1991 (friche urbaine) : 37 cm/an sur gravats, PLANCHER",
  },
  {
    // La trajectoire d'une lande : les guides britanniques donnent un couvert
    // de callune à 50-60 cm à maturité, vers vingt ans. Le moteur fait 0,60 m
    // à vingt ans.
    //
    // ON N'ÉPROUVE QUE LE PLATEAU, et c'est délibéré : le moteur fait naître
    // tous ses semis à 30 cm (`regeneration.ts`), si bien que la callune du
    // jeu SAUTE sa phase pionnière — les guides la donnent sous 10-15 cm.
    // Mesurer le début de sa courbe mesurerait ce défaut-là, qui n'est pas de
    // sa fiche mais d'une hauteur de semis unique pour un atlas qui va du
    // sous-arbrisseau au chêne.
    espece: "calluna_vulgaris",
    nom: "Callune",
    bandes: [{ an: 20, bas: 0.45, haut: 0.7 }],
    sc: LIMON_ACIDE,
    source: "guides britanniques : couvert de 50-60 cm à maturité, vers 20 ans",
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

  it("le troène devance le fusain, comme dans l'essai de Grubb", () => {
    // MÊME CAS QUE LE PRUNELLIER, autre espèce : le troène n'a pas de
    // Biological Flora, et le seul point publié — 104 cm à deux ans en jardin
    // (Grubb 1999) — inclut la croissance en pépinière avant repiquage, donc
    // ne vaut pas comme taux. Ce qui reste est ORDINAL : le troène est dans le
    // groupe « à croissance rapide » de cet essai, devant le fusain.
    //
    // Sa fiche portait cette contrainte sans que rien ne la garde (#185).
    // Mesuré à cinq ans : 2,05 m contre 1,78 — et le fusain est déjà là, sa
    // bande de terrain se lisant au même âge, donc l'essai ne coûte qu'une
    // course de troène.
    const troene = hauteurs("ligustrum_vulgare", 5, LIMON_RICHE, 40);
    const fusain = hauteurs("euonymus_europaeus", 5, LIMON_RICHE, 40);
    expect(a(troene, 5)).toBeGreaterThan(a(fusain, 5));
  }, 120_000);

  it("le prunellier prend l'avance sur l'aubépine, puis se fait dépasser", () => {
    // LE PRUNELLIER N'A PAS DE COURBE, et il n'en aura sans doute pas : aucune
    // mesure de croissance en climat océanique n'a été trouvée — pas de
    // Biological Flora, rien dans la littérature de haies. La seule contrainte
    // publiée est ORDINALE : Grubb 1999 le range dans le groupe « à croissance
    // rapide », devant l'aubépine.
    //
    // Sa fiche portait déjà cette contrainte ET son résultat chiffré, en
    // commentaire, sans que rien ne la garde (#185). C'est exactement ainsi
    // qu'une affirmation devient fausse en silence : il suffit que quelqu'un
    // ralentisse le prunellier pour une autre raison, et la seule chose qu'on
    // savait de lui ne serait plus vraie sans que la suite bronche.
    const prunellier = hauteurs("prunus_spinosa", 12, LIMON_RICHE, 40);
    const aubepine = hauteurs("crataegus_monogyna", 12, LIMON_RICHE, 40);
    // À trois ans, l'ordre de Grubb : 1,39 m contre 1,14 mesurés, soit 36
    // cm/an contre 28.
    expect(a(prunellier, 3)).toBeGreaterThan(a(aubepine, 3));
    // À douze ans, l'ordre s'inverse, et ce n'est pas un hasard : les deux
    // fiches portent des hauteurs adultes différentes — 4 m pour le
    // prunellier, 8 pour l'aubépine — et c'est le plafond qui parle. Mesuré :
    // 3,10 m contre 3,73. Le croisement a lieu entre cinq et huit ans ; on
    // l'éprouve à douze, où l'écart (20 %) ne peut plus être du bruit.
    expect(a(aubepine, 12)).toBeGreaterThan(a(prunellier, 12));
  }, 120_000);
});
