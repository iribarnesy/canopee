/**
 * **Aucun stock conservatif ne devient négatif** — le garde-fou que l'issue #234
 * a rendu nécessaire, et l'audit des autres pools qu'elle a déclenché.
 *
 * ## Ce que #234 a révélé, et qu'aucun essai ne pouvait attraper
 *
 * Le pool de bases échangeables était débité **sans plancher** et passait sous
 * zéro. Les deux gardes qui auraient dû le voir regardaient ailleurs : le pH,
 * seule grandeur que le reste du moteur consulte, est **borné** par
 * `phDepuisSaturation` et restait parfaitement correct au plancher pendant que
 * le stock plongeait ; et le bilan de conservation (C14) **passait**, à 1e-13,
 * parce qu'il est cohérent avec lui-même. Il comptait simplement un stock
 * impossible.
 *
 * **Une conservation n'est pas une vérification de domaine.** Elle interdit d'en
 * perdre ou d'en fabriquer en route ; elle ne dit rien de ce que le stock a le
 * droit de valoir. C'est le trou que ce fichier bouche, pour tous les pools à la
 * fois.
 *
 * ## Ce que l'audit des autres pools a trouvé : rien, et pourquoi
 *
 * Tous les autres débits du moteur ont l'une de deux formes sûres — une
 * **proportion du stock lui-même** (`stock × fraction`), ou un `Math.min` contre
 * lui. La décomposition de la litière plafonne même explicitement sa fraction
 * (`Math.min(1, litterK × climat)`), le prélèvement racinaire prend
 * `Math.min(stock, demande)`, l'érosion emporte au plus 3 % par semaine, la
 * réserve de potassium ne cède que `Math.min(reserve, écart × k)`.
 *
 * Les bases étaient **le seul site** où une quantité *absolue*, calculée à partir
 * d'autre chose — le budget calcium de la litière —, était retranchée d'un
 * stock. C'est précisément la forme qui peut passer sous zéro. Le jour où
 * quelqu'un en écrit une seconde, c'est ce fichier qui le dira.
 *
 * ## Pourquoi ces décors-là et pas d'autres
 *
 * **Un garde-fou qui ne sait pas rougir ne garde rien.** Les deux décors
 * ci-dessous ont été calibrés à l'envers : plancher neutralisé, ils **tombent**,
 * et c'est la seule raison de les avoir choisis. Un premier jet, un plant tous
 * les trois mètres sur les sept stations, ne vidait jamais le complexe en
 * soixante ans et serait resté vert **sur le défaut de #234 lui-même** — il
 * aurait décoré la suite sans rien garder.
 *
 * Et la sensibilité n'est pas affaire de taille : mesuré sur quatre parcelles,
 * les côtés 8 et 16 tombent (−0,233 à l'an 58, −1,133 à l'an 55), les côtés 10
 * et 12 **passent** (+0,855 et +0,456). Ce qui révèle est la trajectoire du
 * peuplement, pas le nombre de cellules — d'où deux décors et non un.
 */

import { describe, expect, it } from "vitest";
import { serieMeteoPour } from "../../src/data/meteo";
import { serieToWeeks } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantAt, type Station } from "../../src/engine/state";
import { LANDE_SECHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

/**
 * Les stocks que le moteur tient et qu'une propriété de conservation somme —
 * c'est-à-dire, à une exception près, les `GrilleLongue` de `SoilState`
 * (`grid.ts`). `phosphoreG` et `potassiumG` sont des `Grille` mais restent des
 * stocks : le type dit la précision qu'il leur faut, pas ce qu'ils sont.
 */
const POOLS = [
  "waterMm",
  "excessMm",
  "nappeMm",
  "mineralNG",
  "litterNG",
  "litterCG",
  "humusCG",
  "boisAuSolCG",
  "phosphoreG",
  "phosphoreFixeG",
  "potassiumG",
  "potassiumReserveG",
  "basesEq",
  "basesProfondEq",
] as const;

/** Les stocks de **parcelle**, qui ne sont pas des grilles mais se vident pareil. */
const STOCKS_PARCELLE = ["deadWoodKgC", "oeuvreStockKgC"] as const;

/**
 * Fait tourner une lande d'ajoncs et rend, pour chaque pool, la pire valeur
 * jamais vue — **chaque cellule, chaque semaine**. Un pool qui plonge puis
 * remonte passerait un contrôle final ; celui-ci ne le laisse pas passer.
 */
function pireDeChaquePool(cote: number, ans: number) {
  const station: Station = {
    ...LANDE_SECHE.station,
    coteM: cote,
    voisinage: [],
    ventExposition: 0,
  };
  const serie = serieMeteoPour(LANDE_SECHE.station.id);
  if (!serie) throw new Error("série météo manquante");
  const METEO = serieToWeeks(serie);
  let s = createGameState(station, rngStateFromSeed(3));
  for (let y = 1; y < cote; y += 2) {
    for (let x = 1; x < cote; x += 2) s = plantAt(s, "ulex_europaeus", x, y, 0.3);
  }
  const pire: Record<string, number> = {};
  for (const p of [...POOLS, ...STOCKS_PARCELLE]) pire[p] = Number.POSITIVE_INFINITY;
  for (let i = 0; i < ans * 52; i++) {
    const w = METEO[i % METEO.length];
    if (!w) throw new Error("météo manquante");
    s = tick(s, w).state;
    for (const p of POOLS) {
      const g = (s.soil as unknown as Record<string, ArrayLike<number>>)[p];
      if (!g) throw new Error(`pool absent de SoilState : ${p}`);
      for (let k = 0; k < g.length; k++) {
        const v = g[k] ?? 0;
        if (v < (pire[p] ?? 0)) pire[p] = v;
      }
    }
    for (const p of STOCKS_PARCELLE) {
      const v = (s.carbon as unknown as Record<string, number>)[p] ?? 0;
      if (v < (pire[p] ?? 0)) pire[p] = v;
    }
  }
  return { pire, tiges: s.trees.filter((t) => t.alive).length };
}

/** Nomme le fautif : un `expect` par pool dirait « false » sans dire lequel. */
function aucunNegatif(pire: Record<string, number>) {
  const fautifs = [...POOLS, ...STOCKS_PARCELLE]
    .filter((p) => (pire[p] ?? 0) < 0)
    .map((p) => `${p}=${(pire[p] ?? 0).toExponential(3)}`);
  expect(fautifs).toEqual([]);
}

describe("aucun stock conservatif ne devient négatif", () => {
  it("soixante ans d'ajoncs sur la lande sèche, parcelle de 16 m", () => {
    // **Décor calibré** : sans le plancher de #234, `basesEq` y tombe à −1,133 à
    // l'an 55. C'est la seule raison de le garder.
    const { pire, tiges } = pireDeChaquePool(16, 60);
    // Le décor a bien vécu — un peuplement mort ne prouverait rien.
    expect(tiges).toBeGreaterThan(0);
    aucunNegatif(pire);
  }, 120_000);

  it("la même lande sur une parcelle de 8 m : une autre trajectoire, même exigence", () => {
    // **Second décor calibré** : sans le plancher, `basesEq` y tombe à −0,233 à
    // l'an 58. Il n'est pas là pour la couverture spatiale mais parce que la
    // trajectoire du peuplement y est différente — et c'est elle qui révèle,
    // pas le nombre de cellules.
    const { pire, tiges } = pireDeChaquePool(8, 60);
    expect(tiges).toBeGreaterThan(0);
    aucunNegatif(pire);
  }, 120_000);
});
