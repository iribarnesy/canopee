/**
 * Le calque des changements.
 *
 * **Ce que ces essais gardent avant tout : le calque ne montre QUE ce que le
 * journal nomme.** Un marqueur au mauvais endroit est pire qu'un marqueur
 * absent — il envoie le joueur regarder là où rien ne s'est passé.
 */

import { describe, expect, it } from "vitest";
import type { GesteVisible } from "../../src/engine/actions";
import type { MortDeLaSemaine } from "../../src/engine/tick";
import type { CauseMort } from "../../src/engine/trees";
import {
  accumuler,
  centreDesCellules,
  type Marqueur,
  marqueursDuJournal,
  PLAFOND_DE_MARQUEURS,
  TEINTE_DE_LA_CAUSE,
  TIGES_PAR_GESTE_MAX,
} from "../../src/render/temps/changements";
import type { JournalDeSemaine } from "../../src/render/temps/ellipse";

const COTE = 100;

const mort = (id: number, x: number, y: number, cause: CauseMort): MortDeLaSemaine => ({
  id,
  x,
  y,
  especeId: "betula_pendula",
  cause,
  heightM: 9,
});

/** Les positions d'arbres que l'appelant est censé connaître. */
const positions = new Map([
  [1, { x: 10, y: 20 }],
  [2, { x: 30, y: 40 }],
]);
const ou = (id: number) => positions.get(id);

describe("marqueursDuJournal", () => {
  it("place un halo sur chaque mort, à SA position et avec SA couleur", () => {
    const journal: JournalDeSemaine = {
      morts: [mort(1, 12.5, 33.25, "secheresse"), mort(2, 90, 4, "feu")],
    };
    const { marqueurs: m } = marqueursDuJournal(journal, ou, COTE);
    expect(m.length).toBe(2);
    expect(m[0]).toEqual({
      x: 12.5,
      y: 33.25,
      sorte: "halo",
      teinte: TEINTE_DE_LA_CAUSE.secheresse,
    });
    expect(m[1]?.teinte).toEqual(TEINTE_DE_LA_CAUSE.feu);
  });

  it("souligne les arbres qu'un geste a touchés, un par tige", () => {
    const geste: GesteVisible = { type: "elaguer", ids: [1, 2] };
    const { marqueurs: m } = marqueursDuJournal({ gestes: [geste] }, ou, COTE);
    expect(m.map((x) => x.sorte)).toEqual(["liseré", "liseré"]);
    expect(m[0]).toMatchObject({ x: 10, y: 20 });
    expect(m[1]).toMatchObject({ x: 30, y: 40 });
  });

  it("SAUTE un identifiant inconnu au lieu de le placer à l'origine", () => {
    // Un marqueur au coin de la parcelle montrerait un endroit où rien ne s'est
    // passé — le défaut le plus trompeur qu'un calque puisse avoir.
    const { marqueurs: m } = marqueursDuJournal(
      { gestes: [{ type: "couper", ids: [1, 999] }] },
      ou,
      COTE,
    );
    expect(m.length).toBe(1);
    expect(m[0]).toMatchObject({ x: 10, y: 20 });
  });

  it("ne met qu'UN repère par geste de zone, à son centre", () => {
    // Un chaulage de deux cents cellules avec deux cents repères ne montrerait
    // plus rien : c'est un événement, pas mille.
    const cellules: number[] = [];
    for (let y = 40; y < 50; y++) for (let x = 20; x < 30; x++) cellules.push(y * COTE + x);
    const { marqueurs: m } = marqueursDuJournal(
      { gestes: [{ type: "chauler", cellules }] },
      ou,
      COTE,
    );
    expect(m.length).toBe(1);
    expect(m[0]?.sorte).toBe("zone");
    expect(m[0]?.x).toBeCloseTo(25, 6);
    expect(m[0]?.y).toBeCloseTo(45, 6);
  });

  it("ignore un geste de zone vide", () => {
    expect(
      marqueursDuJournal({ gestes: [{ type: "faucher", cellules: [] }] }, ou, COTE).marqueurs,
    ).toEqual([]);
  });

  it("ne marque PAS les chutes : une chute, on la voit", () => {
    // C'est le seul changement de la liste qui se voit tout seul — vingt mètres
    // de mouvement. Le marquer ajouterait un repère là où l'œil va déjà.
    const journal: JournalDeSemaine = {
      chutes: [
        {
          id: 1,
          x: 5,
          y: 5,
          especeId: "betula_pendula",
          heightM: 12,
          directionRad: 1,
          masseKgC: 10,
          empreinte: [],
        },
      ],
    };
    expect(marqueursDuJournal(journal, ou, COTE).marqueurs).toEqual([]);
  });

  it("rend un tableau vide sur un journal vide", () => {
    expect(marqueursDuJournal({}, ou, COTE)).toEqual({ marqueurs: [], omis: 0 });
  });

  it("distingue les douze causes DEUX À DEUX", () => {
    // Un calque dont deux causes ont la même couleur ne dit pas pourquoi ça
    // meurt — il dit seulement que ça meurt, ce que la vignette dit déjà.
    const vues = new Map<string, CauseMort>();
    for (const [cause, t] of Object.entries(TEINTE_DE_LA_CAUSE) as [CauseMort, unknown][]) {
      const cle = JSON.stringify(t);
      expect(vues.get(cle), `${cause} a la couleur de ${vues.get(cle)}`).toBeUndefined();
      vues.set(cle, cause);
    }
    expect(vues.size).toBe(12);
  });

  it("garde les teintes que le §6.8 nomme", () => {
    // Cinq viennent du cahier mot pour mot ; qu'elles y restent reconnaissables
    // se vérifie : le feu est le plus sombre, l'ombre est la moins saturée.
    const clarte = (t: { r: number; g: number; b: number }) => (t.r + t.g + t.b) / 3;
    const sature = (t: { r: number; g: number; b: number }) =>
      Math.max(t.r, t.g, t.b) - Math.min(t.r, t.g, t.b);
    const causes = Object.values(TEINTE_DE_LA_CAUSE);
    expect(clarte(TEINTE_DE_LA_CAUSE.feu)).toBe(Math.min(...causes.map(clarte)));
    expect(sature(TEINTE_DE_LA_CAUSE.ombre)).toBeLessThan(8);
    // le roux de la sécheresse : plus de rouge que de vert, plus de vert que de bleu
    const roux = TEINTE_DE_LA_CAUSE.secheresse;
    expect(roux.r).toBeGreaterThan(roux.g);
    expect(roux.g).toBeGreaterThan(roux.b);
    // le bleu-violet de l'engorgement : le bleu domine
    const eau = TEINTE_DE_LA_CAUSE.engorgement;
    expect(eau.b).toBeGreaterThan(eau.r);
    expect(eau.b).toBeGreaterThan(eau.g);
  });
});

describe("centreDesCellules", () => {
  it("rend le centre de gravité, au centre des cellules", () => {
    // Le `+ 0.5` compte : une cellule est un carré d'un mètre, et son centre
    // n'est pas son coin.
    expect(centreDesCellules([0], COTE)).toEqual({ x: 0.5, y: 0.5 });
    expect(centreDesCellules([0, 1], COTE)).toEqual({ x: 1, y: 0.5 });
  });

  it("rend undefined sur un ensemble vide", () => {
    expect(centreDesCellules([], COTE)).toBeUndefined();
  });
});

describe("accumuler", () => {
  const faux = (n: number): Marqueur[] =>
    Array.from({ length: n }, (_, i) => ({
      x: i,
      y: i,
      sorte: "halo" as const,
      teinte: { r: 1, g: 2, b: 3 },
    }));

  it("empile les marqueurs dans l'ordre d'arrivée", () => {
    const a = faux(2);
    const b = faux(3);
    expect(accumuler(a, b).length).toBe(5);
    expect(accumuler(a, b)[0]).toBe(a[0]);
  });

  it("garde les plus RÉCENTS quand le plafond est atteint", () => {
    // Tronquer par le début garderait dix ans de vieux repères et cacherait la
    // semaine en cours.
    const vieux = faux(PLAFOND_DE_MARQUEURS);
    const neufs = faux(5);
    const tout = accumuler(vieux, neufs);
    expect(tout.length).toBe(PLAFOND_DE_MARQUEURS);
    expect(tout.at(-1)).toBe(neufs.at(-1));
    expect(tout).not.toContain(vieux[0]);
  });

  it("respecte un plafond donné", () => {
    expect(accumuler(faux(10), faux(10), 7).length).toBe(7);
  });
});

describe("ce que le calque refuse de pointer", () => {
  it("ne pointe PAS un geste qui touche presque tout, et le dit", () => {
    // Mesuré sur la friche de référence : une semaine porte quatre gestes de
    // `brouter` de deux mille tiges chacun. Le premier jet en faisait huit
    // mille liserés — le calque couvrait la parcelle et ne montrait rien.
    const ids = Array.from({ length: 2004 }, (_, i) => i + 1);
    const partout = new Map(ids.map((id) => [id, { x: id % COTE, y: Math.floor(id / COTE) }]));
    const calque = marqueursDuJournal(
      { gestes: [{ type: "brouter", ids }] },
      (id) => partout.get(id),
      COTE,
    );
    expect(calque.marqueurs).toEqual([]);
    expect(calque.omis).toBe(2004);
  });

  it("pointe un chantier de joueur, qui touche peu de tiges", () => {
    const ids = Array.from({ length: TIGES_PAR_GESTE_MAX }, (_, i) => i + 1);
    const peu = new Map(ids.map((id) => [id, { x: id, y: id }]));
    const calque = marqueursDuJournal(
      { gestes: [{ type: "elaguer", ids }] },
      (id) => peu.get(id),
      COTE,
    );
    expect(calque.marqueurs.length).toBe(TIGES_PAR_GESTE_MAX);
    expect(calque.omis).toBe(0);
  });

  it("borne le calque d'un SEUL journal, pas seulement l'empilement", () => {
    // Le premier jet ne plafonnait que `accumuler` : un unique journal
    // suffisait à couvrir la carte.
    const morts = Array.from({ length: PLAFOND_DE_MARQUEURS + 120 }, (_, i) =>
      mort(i, i % COTE, Math.floor(i / COTE), "vieillesse"),
    );
    const calque = marqueursDuJournal({ morts }, ou, COTE);
    expect(calque.marqueurs.length).toBe(PLAFOND_DE_MARQUEURS);
    expect(calque.omis).toBe(120);
  });
});
