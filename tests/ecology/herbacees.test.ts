/**
 * Les espèces de la strate herbacée (critères B8 et E9, issue #70).
 *
 * Ce que le tapis moyen de `herbe.ts` ne pouvait pas produire :
 *  - des espèces qui ne démarrent pas le même jour ni au même degré-jour ;
 *  - des espèces qui ne tiennent pas les mêmes sols, si bien que la strate
 *    devient une bio-indication comme l'est déjà la strate arborée ;
 *  - une VERNALE qui vit de la fenêtre de printemps, sous un couvert caduc,
 *    et qui n'a pas cette fenêtre sous un couvert sempervirent.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { serieMeteoPour } from "../../src/data/meteo";
import { advanceWeek } from "../../src/engine/game";
import {
  capaciteHerbacee,
  evoluerEmprises,
  facteurThermique,
  HERBACEES,
  type HerbaceeV0,
  N_HERBACEES,
  partSaisonniere,
  REPOUSSE_PAR_SEMAINE,
  suivreFeuillage,
  vigueurHerbacee,
} from "../../src/engine/herbacees";
import { serieToWeeks } from "../../src/engine/meteo";
import { type ContextePhenologique, contextePhenologique } from "../../src/engine/phenologie";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantAt, type Station } from "../../src/engine/state";
import type { StationClimat } from "../../src/engine/stations";
import { LANDE_SECHE, LIMON_RICHE } from "../../src/engine/stations";

/** Ce que l'espèce gagne réellement cette semaine-là : calendrier × chaleur. */
function travail(h: HerbaceeV0, semaine: { ctx: ContextePhenologique; tMean: number }): number {
  return vigueurHerbacee(h, semaine.ctx) * facteurThermique(h, semaine.tMean);
}

function espece(id: string): HerbaceeV0 {
  const h = HERBACEES.find((e) => e.id === id);
  if (!h) throw new Error(`espèce herbacée inconnue : ${id}`);
  return h;
}

const ANEMONE = espece("anemone_nemorosa");
const DACTYLE = espece("dactylis_glomerata");
const MOLINIE = espece("molinia_caerulea");

/** Le contexte phénologique de chaque semaine d'une année, sur une station réelle. */
function anneePhenologique(sc: StationClimat) {
  const serie = serieMeteoPour(sc.station.id);
  if (!serie) throw new Error("série manquante");
  const weather = serieToWeeks(serie);
  const contextes = [];
  let dd = 0;
  for (let s = 0; s < 52; s++) {
    const w = weather[s];
    if (!w) throw new Error("météo manquante");
    dd += Math.max(0, w.tMean - 5) * 7;
    contextes.push({
      ctx: contextePhenologique(sc.station.latitudeDeg, s, dd, 20),
      tMean: w.tMean,
    });
  }
  return contextes;
}

describe("le calendrier propre à chaque herbacée", () => {
  const annee = anneePhenologique(LIMON_RICHE);

  it("la vernale travaille en mars et n'est plus là en juillet", () => {
    // Mi-mars (semaine 11) : l'anémone est sortie et pousse ; la molinie n'a
    // même pas levé sa porte, et le dactyle, qui n'en a pas, attend quand même
    // la chaleur — c'est `tBaseCroissanceC` qui le retient, pas un calendrier.
    const mars = annee[11];
    if (!mars) throw new Error("semaine manquante");
    expect(travail(ANEMONE, mars)).toBeGreaterThan(0.2);
    expect(travail(DACTYLE, mars)).toBeLessThan(travail(ANEMONE, mars));
    expect(vigueurHerbacee(MOLINIE, mars.ctx)).toBe(0);
    // Mi-juillet (semaine 28) : elle s'est retirée, et rien ne la fait revenir
    // — son retrait est programmé, pas commandé par l'ombre (herbacees.ts).
    for (const semaine of [28, 34, 40]) {
      const ctx = annee[semaine]?.ctx;
      if (!ctx) throw new Error("semaine manquante");
      expect(vigueurHerbacee(ANEMONE, ctx)).toBe(0);
      expect(partSaisonniere(ANEMONE, ctx)).toBe(0);
    }
  });

  it("la molinie démarre après tout le monde et se dénude complètement l'hiver", () => {
    // La semaine où l'espèce se met VRAIMENT à gagner du terrain : calendrier
    // et température ensemble. C'est la seule qui ait un sens ici — le dactyle
    // n'a pas de porte à lever, il attend simplement qu'il fasse assez chaud,
    // et une semaine douce de janvier lui suffit. Ce n'est donc pas l'ordre de
    // DÉPART qui distingue la vernale des graminées (elle a une porte
    // photopériodique, elles non), c'est son plein déploiement au moment où la
    // molinie n'a pas encore bougé — et son retrait avant l'été, ci-dessus.
    const depart = (h: HerbaceeV0) => annee.findIndex((sem) => travail(h, sem) > 0);
    expect(depart(DACTYLE)).toBeLessThan(depart(MOLINIE));
    const mars = annee[11];
    if (!mars) throw new Error("semaine manquante");
    expect(vigueurHerbacee(ANEMONE, mars.ctx)).toBeGreaterThan(0.8);
    expect(vigueurHerbacee(MOLINIE, mars.ctx)).toBe(0);
    // En janvier, la graminée d'hiver couvre encore et la molinie n'a que sa
    // touradon sèche : c'est ce contraste qui décide de la protection du sol.
    const janvier = annee[2]?.ctx;
    if (!janvier) throw new Error("semaine manquante");
    expect(partSaisonniere(DACTYLE, janvier)).toBeGreaterThan(0.5);
    expect(partSaisonniere(MOLINIE, janvier)).toBeLessThan(0.4);
  });

  it("la vernale pousse à des températures où la molinie ne démarre pas", () => {
    // 6 °C : une semaine de mars ordinaire dans le Nord.
    expect(facteurThermique(ANEMONE, 6)).toBeGreaterThan(0.4);
    expect(facteurThermique(MOLINIE, 6)).toBe(0);
  });
});

describe("chaque espèce a sa station (bio-indication)", () => {
  it("le pH sépare les deux graminées, et aucune n'est écrite en dur", () => {
    // Podzol de lande à 4,5 : la molinie, et elle seule.
    expect(capaciteHerbacee(MOLINIE, 1, 4.5)).toBeGreaterThan(0.9);
    expect(capaciteHerbacee(DACTYLE, 1, 4.5)).toBe(0);
    // Limon neutre à 7 : l'inverse.
    expect(capaciteHerbacee(DACTYLE, 1, 7)).toBeGreaterThan(0.9);
    expect(capaciteHerbacee(MOLINIE, 1, 7)).toBe(0);
  });

  it("la plante d'ombre tient une lumière où les graminées lâchent", () => {
    for (const lumiere of [0.05, 0.1]) {
      expect(capaciteHerbacee(ANEMONE, lumiere, 6.5)).toBeGreaterThan(0);
      expect(capaciteHerbacee(DACTYLE, lumiere, 6.5)).toBe(0);
      expect(capaciteHerbacee(MOLINIE, lumiere, 6.5)).toBe(0);
    }
  });
});

describe("le partage du sol entre espèces", () => {
  const empriseAleatoire = fc.array(fc.double({ min: 0, max: 1, noNaN: true }), {
    minLength: N_HERBACEES,
    maxLength: N_HERBACEES,
  });
  const unitaires = fc.array(fc.double({ min: 0, max: 1, noNaN: true }), {
    minLength: N_HERBACEES,
    maxLength: N_HERBACEES,
  });

  it("le sol est fini : la somme des emprises ne dépasse jamais 1", () => {
    fc.assert(
      fc.property(empriseAleatoire, unitaires, unitaires, unitaires, (dep, cap, vig, th) => {
        // On part d'un état déjà valide (somme ≤ 1), comme le moteur le tient.
        const somme = dep.reduce((a, b) => a + b, 0);
        const emprises = somme > 1 ? dep.map((v) => v / somme) : dep.slice();
        for (let semaine = 0; semaine < 200; semaine++) {
          evoluerEmprises(emprises, 0, cap, vig, th);
          const total = emprises.reduce((a, b) => a + b, 0);
          expect(total).toBeLessThanOrEqual(1 + 1e-9);
          for (const e of emprises) expect(e).toBeGreaterThanOrEqual(-1e-9);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("la place qu'une espèce lâche revient à celle qui pousse, la semaine même", () => {
    // Le dactyle n'a plus sa lumière (capacité 0), l'anémone l'a : le terrain
    // change de main sans passer par une case vide.
    const emprises = [0.1, 0.9, 0];
    const capacites = [1, 0, 0];
    const vigueurs = [1, 1, 0];
    const thermiques = [1, 1, 0];
    evoluerEmprises(emprises, 0, capacites, vigueurs, thermiques);
    expect(emprises[1]).toBeCloseTo(0.7, 6); // 0,9 − 0,2 de repli
    expect(emprises[0]).toBeGreaterThan(0.1); // et l'anémone avance
  });

  it("sur une trouée que les deux convoitent, la plus rapide rafle presque tout", () => {
    const emprises = [0, 0.9, 0];
    const capacites = [1, 1, 0];
    const vigueurs = [1, 1, 0];
    const thermiques = [1, 1, 0];
    evoluerEmprises(emprises, 0, capacites, vigueurs, thermiques);
    const gainLent = emprises[0] ?? 0;
    const gainRapide = (emprises[1] ?? 0) - 0.9;
    expect(gainRapide / gainLent).toBeGreaterThan(20);
    expect(gainLent + gainRapide).toBeCloseTo(0.1, 6); // toute la place libre
  });
});

describe("le feuillage suit l'emprise, et lui seul se fait couper", () => {
  it("une coupe repousse à la vitesse de repousse, l'emprise n'ayant pas bougé", () => {
    const emprises = [0, 1, 0];
    const feuillage = [0, 0.1, 0]; // ce que la faucheuse a laissé
    suivreFeuillage(feuillage, emprises, 0, [1, 1, 1], [1, 1, 1], [1, 1, 1]);
    expect(feuillage[1]).toBeCloseTo(0.1 + REPOUSSE_PAR_SEMAINE, 6);
  });

  it("une espèce qui rentre sous terre y laisse son feuillage, pas son emprise", () => {
    const emprises = [0.5, 0.5, 0];
    const feuillage = [0.5, 0.5, 0];
    // Part saisonnière nulle pour la première : elle se retire. Son feuillage
    // s'en va — pas d'un coup, une feuille jaunit avant de disparaître — et
    // son emprise, elle, ne bouge pas d'un pouce.
    for (let semaine = 0; semaine < 5; semaine++) {
      suivreFeuillage(feuillage, emprises, 0, [0, 1, 1], [1, 1, 1], [1, 1, 1]);
    }
    expect(feuillage[0]).toBe(0);
    expect(emprises[0]).toBe(0.5);
  });
});

/** Plante une parcelle entière à l'écartement donné et la fait vivre `ans` ans. */
function peuplement(
  sc: StationClimat,
  especeId: string | null,
  ans: number,
  graine: number,
  ecartM = 3,
  coteM = 30,
) {
  const station: Station = { ...sc.station, coteM, voisinage: [] };
  const serie = serieMeteoPour(sc.station.id);
  if (!serie) throw new Error("série manquante");
  const weather = serieToWeeks(serie);
  let state = createGameState(station, rngStateFromSeed(graine));
  if (especeId) {
    for (let y = 2; y < coteM; y += ecartM) {
      for (let x = 2; x < coteM; x += ecartM) state = plantAt(state, especeId, x, y, 0.3);
    }
  }
  const releves = new Map<number, { emprises: number[]; couverture: number; lumiere: number }>();
  for (let i = 0; i < ans * 52; i++) {
    const w = weather[i % weather.length];
    if (!w) throw new Error("météo manquante");
    const r = advanceWeek(state, w, []);
    state = r.state;
    const semaine = i % 52;
    if (i >= (ans - 1) * 52) {
      const n = state.soil.herbeCouverture.length;
      const emprises = new Array<number>(N_HERBACEES).fill(0);
      for (let c = 0; c < n; c++) {
        for (let s = 0; s < N_HERBACEES; s++) {
          emprises[s] =
            (emprises[s] ?? 0) + (state.soil.herbeEmprise[c * N_HERBACEES + s] ?? 0) / n;
        }
      }
      releves.set(semaine, {
        emprises,
        couverture: state.soil.herbeCouverture.reduce((a, b) => a + b, 0) / n,
        lumiere: r.lumiereAuSol.reduce((a, b) => a + b, 0) / r.lumiereAuSol.length,
      });
    }
  }
  return releves;
}

const iEspece = (h: HerbaceeV0) => HERBACEES.indexOf(h);

describe("B8 — les strates basses se partagent la lumière et le sol", () => {
  it("la friche dit le sol : graminée neutrophile sur limon, molinie sur podzol", () => {
    const limon = peuplement(LIMON_RICHE, null, 11, 3).get(30);
    const lande = peuplement(LANDE_SECHE, null, 11, 3).get(30);
    if (!limon || !lande) throw new Error("relevé manquant");
    expect(limon.emprises[iEspece(DACTYLE)]).toBeGreaterThan(0.5);
    expect(limon.emprises[iEspece(MOLINIE)]).toBe(0);
    expect(lande.emprises[iEspece(MOLINIE)]).toBeGreaterThan(0.5);
    expect(lande.emprises[iEspece(DACTYLE)]).toBe(0);
    // Aucune ligne du moteur ne nomme d'espèce : c'est le pH de la cellule,
    // confronté à la gamme de l'atlas, qui a fait ce tri.
  });
});

/**
 * E9 — LA FENÊTRE DE PRINTEMPS.
 *
 * Ce qu'on mesure, et pourquoi c'est le bon signal : une vernale ne vit pas de
 * la lumière moyenne de l'année, elle vit de celle de mars. Un couvert qui se
 * ferme en mai lui laisse donc sa fenêtre entière tout en interdisant le sol
 * aux graminées ; un couvert sempervirent ne lui donne rien de plus qu'aux
 * autres. La strate y répond de deux façons qu'on relève toutes les deux :
 * la SAISONNALITÉ de la couverture (un sous-bois vert en avril, nu en juillet)
 * et la PART que la vernale prend dans l'emprise.
 *
 * On exige la DIRECTION, graine par graine, et pas un rapport — un rapport
 * entre deux quantités composites n'est pas une propriété du monde
 * (docs/realisme.md). Les valeurs relevées à l'écriture, en année 40 sur une
 * parcelle de 20 m : hêtre 2,98 et 3,45 de rapport printemps/été, 36 et 40 %
 * d'emprise vernale ; pin sylvestre 1,25 / 1,24 et 19 % ; découvert 1,04 et
 * 3 %.
 */
describe("E9 — les plantes de sous-bois profitent de la fenêtre de printemps", () => {
  // Mi-avril : la fenêtre est grande ouverte — sous la hêtraie mesurée, la
  // lumière au sol tombe de 0,69 à 0,30 entre les semaines 16 et 18, quand le
  // hêtre déploie. Fin juillet, tout est refermé.
  const PRINTEMPS = 16;
  const ETE = 30;

  /** Rapport printemps/été de la couverture, et part de la vernale dans l'emprise. */
  function profil(especeId: string | null, graine: number) {
    const releves = peuplement(LIMON_RICHE, especeId, 40, graine, 3, 20);
    const p = releves.get(PRINTEMPS);
    const e = releves.get(ETE);
    if (!p || !e) throw new Error("relevé manquant");
    const total = e.emprises.reduce((a, b) => a + b, 0);
    return {
      saisonnalite: p.couverture / Math.max(1e-9, e.couverture),
      partVernale: (e.emprises[iEspece(ANEMONE)] ?? 0) / Math.max(1e-9, total),
      lumierePrintemps: p.lumiere,
      lumiereEte: e.lumiere,
    };
  }

  for (const graine of [3, 7]) {
    it(`graine ${graine} : le sous-bois caduc est vert en avril et nu en juillet, le sempervirent non`, () => {
      const caduc = profil("fagus_sylvatica", graine);
      const sempervirent = profil("pinus_sylvestris", graine);
      const decouvert = profil(null, graine);

      // Le dispositif tient : c'est bien la SAISON de la lumière qui change,
      // pas seulement son niveau.
      expect(caduc.lumierePrintemps).toBeGreaterThan(2 * caduc.lumiereEte);
      expect(sempervirent.lumierePrintemps).toBeLessThan(1.2 * sempervirent.lumiereEte);

      // La couverture du sol suit cette saison sous le caduc, et pas ailleurs.
      expect(caduc.saisonnalite).toBeGreaterThan(2.2);
      expect(sempervirent.saisonnalite).toBeLessThan(1.6);
      expect(decouvert.saisonnalite).toBeLessThan(1.1);

      // Et ce printemps est celui de la vernale : plus l'été est sombre, plus
      // la strate lui appartient. Gradient monotone sur les trois couverts.
      expect(caduc.partVernale).toBeGreaterThan(sempervirent.partVernale);
      expect(sempervirent.partVernale).toBeGreaterThan(decouvert.partVernale);
      expect(caduc.partVernale).toBeGreaterThan(0.3);
      expect(decouvert.partVernale).toBeLessThan(0.1);
    });
  }

  it("sous un couvert sombre AUSSI au printemps, elle n'a plus rien", () => {
    // La limite du dispositif ci-dessus : le moteur ne produit pas, sur cette
    // station, de peuplement sempervirent assez sombre — le pin sylvestre est
    // une essence de lumière et s'auto-éclaircit. Ce que la fenêtre vaut
    // vraiment se lit donc ici, sur la capacité : privée de sa lumière de mars,
    // la vernale n'a pas d'autre saison où se rattraper.
    expect(capaciteHerbacee(ANEMONE, 0.6, 6.5)).toBeGreaterThan(0.9);
    expect(capaciteHerbacee(ANEMONE, 0.04, 6.5)).toBeLessThan(0.1);
  });
});
