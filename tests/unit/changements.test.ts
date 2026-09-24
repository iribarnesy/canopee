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
  sujetsDuJournal,
  TEINTE_DE_LA_CAUSE,
  TEINTE_DE_LA_RECRUE,
  TEINTE_DU_STADE,
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

  it("pointe les NAISSANCES que le moteur rapporte, et pas celles qu'il déduisait", () => {
    // **Le rendu les déduisait d'un `ageWeeks` inférieur à l'intervalle du
    // journal.** Ça marchait, mais ça confondait « arrivé depuis la dernière
    // fois » avec « jeune », et surtout ça perdait toute naissance suivie d'une
    // mort dans le même intervalle : un semis qui lève et se fait brouter dans
    // la même saison n'existait jamais. Le moteur les rapporte maintenant, avec
    // leur position — donc même un semis déjà disparu de l'instantané est
    // pointé.
    const journal: JournalDeSemaine = {
      naissances: [
        { id: 900, x: 4.5, y: 8.5, especeId: "betula_pendula", heightM: 0.3 },
        { id: 901, x: 60, y: 12, especeId: "quercus_robur", heightM: 0.2 },
      ],
    };
    const { marqueurs: m } = marqueursDuJournal(journal, ou, COTE);
    expect(m.length).toBe(2);
    expect(m[0]).toEqual({ x: 4.5, y: 8.5, sorte: "recrue", teinte: TEINTE_DE_LA_RECRUE });
    // `ou` ne connaît NI 900 NI 901 : la naissance porte sa position, elle n'a
    // rien à demander à l'instantané.
    expect(ou(900)).toBeUndefined();
  });

  it("pointe les MONTÉES de stade, teintées par le stade atteint", () => {
    // La seule bonne nouvelle du calque qui ne soit pas une naissance. Le stade
    // se calcule de la hauteur côté rendu ; c'est le FRANCHISSEMENT, qui demande
    // de comparer deux instants, que seul le moteur peut voir.
    const journal: JournalDeSemaine = {
      franchissements: [
        { id: 1, deStade: "semis", versStade: "gaulis" },
        { id: 2, deStade: "perchis", versStade: "futaie" },
      ],
    };
    const { marqueurs: m } = marqueursDuJournal(journal, ou, COTE);
    expect(m.map((x) => x.sorte)).toEqual(["montée", "montée"]);
    expect(m[0]).toMatchObject({ x: 10, y: 20, teinte: TEINTE_DU_STADE.gaulis });
    expect(m[1]).toMatchObject({ x: 30, y: 40, teinte: TEINTE_DU_STADE.futaie });
  });

  it("teinte les montées dans un ORDRE : plus c'est gros, plus c'est sombre", () => {
    // C'est le seul endroit du calque où la teinte encode un ordre plutôt
    // qu'une catégorie, et l'ordre doit se lire sans légende.
    const clarte = (t: { r: number; g: number; b: number }) => (t.r + t.g + t.b) / 3;
    const echelle = ["semis", "gaulis", "perchis", "futaie"] as const;
    for (let i = 1; i < echelle.length; i++) {
      const avant = echelle[i - 1];
      const apres = echelle[i];
      if (!avant || !apres) continue;
      expect(clarte(TEINTE_DU_STADE[apres])).toBeLessThan(clarte(TEINTE_DU_STADE[avant]));
    }
  });

  it("SAUTE une montée dont l'arbre a disparu de l'instantané", () => {
    // Une tige que le même intervalle a fait monter PUIS mourir n'a plus de
    // position, et c'est la bonne lecture : son halo de mort dit tout ce qu'il
    // y a à dire, et un chevron sur un mort serait un contresens.
    const { marqueurs: m } = marqueursDuJournal(
      { franchissements: [{ id: 999, deStade: "semis", versStade: "gaulis" }] },
      ou,
      COTE,
    );
    expect(m).toEqual([]);
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

  it("distingue toutes les causes DEUX À DEUX", () => {
    // Un calque dont deux causes ont la même couleur ne dit pas pourquoi ça
    // meurt — il dit seulement que ça meurt, ce que la vignette dit déjà.
    const vues = new Map<string, CauseMort>();
    for (const [cause, t] of Object.entries(TEINTE_DE_LA_CAUSE) as [CauseMort, unknown][]) {
      const cle = JSON.stringify(t);
      expect(vues.get(cle), `${cause} a la couleur de ${vues.get(cle)}`).toBeUndefined();
      vues.set(cle, cause);
    }
    // Quatorze depuis que le volis existe à côté du chablis (#176), quinze
    // depuis que le boutis existe à côté du labour (#199) — et c'est le même
    // garde-fou qui a joué : deux morts qui se ressemblent ne peuvent pas
    // partager une teinte, il a fallu en trouver une au sanglier.
    expect(vues.size).toBe(16);
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

describe("ce que l'estompe laisse net", () => {
  it("garde NETTES les naissances et les montées, pas seulement les morts", () => {
    // **Sans ça, l'estompe ne laisserait net que ce qui meurt**, ce qui est
    // exactement la lecture fausse que le §6.8 reproche à un calque de
    // mortalité : une friche qui se boise est le sujet même du jeu.
    const sujets = sujetsDuJournal({
      morts: [mort(1, 1, 1, "secheresse")],
      naissances: [{ id: 900, x: 4, y: 8, especeId: "betula_pendula", heightM: 0.3 }],
      franchissements: [{ id: 2, deStade: "semis", versStade: "gaulis" }],
    });
    expect([...sujets].sort((a, b) => a - b)).toEqual([1, 2, 900]);
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
