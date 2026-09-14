/**
 * Calibration des HAUTEURS ABSOLUES sur les tables de production.
 *
 * Les rapports entre essences et entre stations étaient justes de longue date ;
 * les niveaux, non — un hêtre de plaine plafonnait à moins de cinq mètres à
 * quarante ans. Cet essai attache le moteur à une vérité terrain publiée
 * plutôt qu'à lui-même.
 *
 * **Référence principale** : Jansen J.J., Sevenster J., Faber P.J. (1996),
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
 * **Les autres références**, essence par essence, sont citées dans `TABLE` et
 * dans `MESURES` (bas de fichier) : une table allemande pour le charme, un
 * faisceau de courbes français pour le châtaignier, et pour les arbustes — qui
 * n'ont jamais eu de table, parce qu'on ne les vend pas au mètre cube — des
 * essais en jardin et des monographies britanniques.
 *
 * **Ce que cet essai prouve, et ce qu'il ne prouve pas.** Les âges n'ont pas
 * tous le même statut, et c'est délibéré.
 *
 * CALÉES sur la table à quarante ans, donc gardées et non validées ici : le
 * HÊTRE et le CHARME. Leur `pousseMaxMAn` a été dérivé de cette valeur-là
 * (especes.ts). L'essai ne les mesure pas ; il attrapera leur dérive.
 *
 * NON CALÉES, donc réellement mises à l'épreuve : pin, aulne, frêne,
 * CHÂTAIGNIER à quarante ans ; aubépine, fusain, genêt et houx dans le bloc
 * des arbustes. Leur accord avec la mesure est un résultat, pas un réglage.
 *
 * À VINGT ANS, aucune espèce n'est calée. C'est la vérification tenue à
 * l'écart : un seul paramètre par espèce a été ajusté, sur un seul âge, et le
 * second âge est une PRÉDICTION de la forme de la courbe. Mesuré : −13 % à
 * +10 % selon l'essence, le charme arrivé depuis à −3 %. C'est ce chiffre-là
 * qui dit quelque chose du moteur.
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
import { horizon } from "../../src/engine/soil";
import { createGameState, plantScattered } from "../../src/engine/state";
import { LIMON_RICHE, stationDepuisProfil } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

/**
 * LE LIMON RICHE, MAIS ACIDE — la station des calcifuges.
 *
 * Le limon riche titre pH 7,0 en surface. Le châtaignier (pH 4→6,5) et le houx
 * (4→7) y meurent de chlorose : on ne peut pas les comparer à une table sur une
 * station qui les tue. Même texture, même matière organique, même azote, même
 * climat — seul le pH change, et il vaut alors ce qu'il vaut sous une
 * châtaigneraie du Limousin. C'est la même convention que pour le limon riche :
 * cette station-là VAUT la classe médiane, pour les essences qui l'habitent.
 */
const LIMON_ACIDE = {
  station: stationDepuisProfil({
    ...LIMON_RICHE.station,
    id: "limon-acide",
    nom: "Limon profond acide",
    profil: [
      horizon(35, { sable: 20, limon: 65, argile: 15 }, { moPct: 2.2, ph: 5.2 }),
      horizon(65, { sable: 20, limon: 65, argile: 15 }, { moPct: 0.8, ph: 5 }),
    ],
    initialMineralNKgHa: 60,
  }),
  climat: LIMON_RICHE.climat,
};

interface Reference {
  nom: string;
  /** absente quand la table n'est PAS comparable à vingt ans (voir le châtaignier) */
  h20?: number;
  h40: number;
  /** station de référence, quand ce n'est pas le limon riche */
  sc?: typeof LIMON_RICHE;
}

/**
 * Hauteur dominante TABULÉE à 20 et 40 ans, classe médiane.
 *
 * On ne compare pas à dix ans : les tables ne descendent pas sous quinze ans,
 * et les valeurs à dix ans qui circulent sont des extrapolations — ce n'est pas
 * de la vérité terrain, et le moteur n'a pas à s'y caler. Le début de courbe
 * est vérifié autrement, par sa FORME (dernier essai du fichier).
 */
const TABLE: Record<string, Reference> = {
  // Jansen 1996, beuk, GK 8 (gamme 4→12), d'après Carbonnier 1971 et Schober 1972.
  fagus_sylvatica: { nom: "Hêtre", h20: 7.7, h40: 16.0 },
  // Jansen 1996, groveden, GK 8 (gamme 4→12), d'après Faber 1996a.
  pinus_sylvestris: { nom: "Pin sylvestre", h20: 8.1, h40: 15.5 },
  // Jansen 1996, zwarte els, GK 6 (gamme 4→8), d'après Mitscherlich 1945.
  alnus_glutinosa: { nom: "Aulne", h20: 12.6, h40: 18.0 },
  // Jansen 1996, es, GK 6 (gamme 4→9), d'après Volquardts 1958.
  fraxinus_excelsior: { nom: "Frêne", h20: 9.0, h40: 16.5 },
  // Lockow & Lockow 2009, PREMIÈRE table de production du charme (avant elle,
  // on le taxait par analogie avec le hêtre) : bonité absolue HO100 = 25 m
  // (II,25 Ekl.), classe médiane de la gamme 18→31 m. Colonne HO, p. 46.
  // Géographie à décoter : plaine du nord-est allemand, subcontinentale sèche.
  // Recoupement dans la bonne zone : le CNPF (2025) recommande pour le charme
  // français les tables NÉERLANDAISES de chêne, qui donnent 15,4 m à quarante
  // ans — 6 % sous celle-ci. Les deux encadrent le moteur, qui était sous les
  // deux.
  carpinus_betulus: { nom: "Charme", h20: 9.9, h40: 16.3 },
  // Faisceau de courbes des TAILLIS de châtaignier en France (Lemaire 2005,
  // SUF-IDF, publié par le CRPF Île-de-France–Centre 2013). Les seules valeurs
  // écrites du faisceau sont les hauteurs dominantes à 25 ans : 21 / 18,5 / 16
  // / 13,5 / 11 / 8,5 m pour les classes 1 à 6, soit 14,75 m à la médiane. La
  // hauteur à quarante ans est LUE SUR LE GRAPHIQUE *(à confirmer)*.
  //
  // Pas de repère à vingt ans, et c'est délibéré : ce sont des courbes de
  // TAILLIS. Un rejet de souche part sur un système racinaire fait, il devance
  // donc un semis en jeunesse, et le moteur ne sait pas rendre cet écart (sa
  // forme de croissance dépend de la taille, pas de l'âge). Comparer les deux
  // à vingt ans mesurerait ce décalage-là, pas la vitesse de l'essence. Ce
  // qu'on en vérifie est le SIGNE, dans l'essai suivant.
  castanea_sativa: { nom: "Châtaignier", h40: 18.7, sc: LIMON_ACIDE },
};

/** À quarante ans : garde-fou serré, puisque deux espèces y sont calées. */
const TOLERANCE_CALAGE = 0.15;
/** À vingt ans : vérification tenue à l'écart, aucune espèce n'y est calée. */
const TOLERANCE_TENUE_A_LECART = 0.2;
const GRAINES = [17, 43];
const PLANTS = 8;

/**
 * Mémoïsation : plusieurs essais réclament la même espèce (le hêtre sert de
 * témoin au bouleau et de sujet à l'essai de forme). Chaque appel coûte deux
 * parties de quarante ans ; les recalculer serait payer trois fois le même
 * résultat déterministe.
 */
const CACHE = new Map<string, Record<number, number>>();

/**
 * Hauteur moyenne des sujets plantés, aux jalons demandés, moyennée sur les
 * graines. `anMax` borne la simulation : un arbuste dont la mesure de terrain
 * s'arrête à douze ans ne coûte pas une partie de quarante.
 */
function hauteurs(
  especeId: string,
  anMax = 40,
  sc = LIMON_RICHE,
  coteM = 60,
): Record<number, number> {
  const cle = `${especeId}|${anMax}|${sc.station.id}|${coteM}`;
  const enCache = CACHE.get(cle);
  if (enCache) return enCache;
  const jalons = [3, 5, 8, 10, 12, 20, 40].filter((an) => an <= anMax);
  const weather = syntheticYear(sc.climat);
  // Parcelle réduite (60 × 60 m) : mêmes dynamiques, essai plus rapide.
  const station = { ...sc.station, coteM, gibierParHa: 0, voisinage: [] };
  const cumul: Record<number, number> = {};
  for (const j of jalons) cumul[j] = 0;
  for (const graine of GRAINES) {
    let state = createGameState(station, rngStateFromSeed(graine));
    state = plantScattered(state, especeId, PLANTS, 0.3);
    for (let i = 0; i < anMax * 52; i++) {
      const w = weather[i % weather.length];
      if (!w) throw new Error("météo manquante");
      state = tick(state, w).state;
      const an = (i + 1) / 52;
      if (!jalons.includes(an)) continue;
      const vivants = state.trees.filter((t) => t.alive && t.id <= PLANTS);
      const moyenne = vivants.length
        ? vivants.reduce((s, t) => s + t.heightM, 0) / vivants.length
        : 0;
      cumul[an] = (cumul[an] ?? 0) + moyenne;
    }
  }
  const mesure: Record<number, number> = {};
  for (const j of jalons) mesure[j] = (cumul[j] ?? 0) / GRAINES.length;
  CACHE.set(cle, mesure);
  return mesure;
}

/** Hauteur simulée à un jalon, ou l'échec explicite si le jalon n'a pas été mesuré. */
function a(mesure: Record<number, number>, an: number): number {
  const h = mesure[an];
  if (h === undefined) throw new Error(`jalon ${an} ans non mesuré`);
  return h;
}

describe("hauteurs absolues contre les tables de production", () => {
  for (const [especeId, ref] of Object.entries(TABLE)) {
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
    expect(a(hauteurs("betula_pendula", 20), 20)).toBeGreaterThan(
      a(hauteurs("fagus_sylvatica"), 20),
    );
  }, 600_000);

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

  it("la courbe a la forme d'une sigmoïde, pas d'une exponentielle qui s'épuise", () => {
    // Ce que le moteur faisait avant : pousse maximale à la germination, puis
    // décroissance — la seule forme de la famille Chapman-Richards qui ne
    // soit pas sigmoïde. Sur la table, un hêtre fait 21 % de sa hauteur de
    // quarante ans au bout de dix ans ; avec l'ancienne forme il en faisait
    // 39 %. On vérifie donc que le début de courbe reste bas.
    const sim = hauteurs("fagus_sylvatica");
    expect(a(sim, 10) / a(sim, 40)).toBeLessThan(0.3);
    expect(a(sim, 10) / a(sim, 40)).toBeGreaterThan(0.13);
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
