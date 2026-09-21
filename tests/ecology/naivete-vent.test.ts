/**
 * LA NAÏVETÉ AU VENT (issue #177, F18).
 *
 * « Un peuplement qu'on vient d'ouvrir verse pendant quelques années. » Le
 * moteur applique la nouvelle exposition à un arbre réputé instantanément
 * adapté, alors que l'épaississement du fût et de l'ancrage sous la contrainte
 * mécanique se compte en années.
 *
 * Chaque arbre retient donc l'abri sous lequel il a grandi, et c'est la CHUTE
 * entre cette mémoire et l'abri du jour qui le fragilise.
 *
 * Le fichier tient deux choses de nature différente. D'abord la naïveté
 * elle-même — son ampleur, sa décroissance, le fait qu'elle distingue toute
 * seule les deux façons d'éclaircir —, qui se lit sur les fonctions et ne
 * dépend d'aucun tirage. Puis, à la fin, **le banc APPARIÉ**, qui mesure ce que
 * l'ouverture coûte en ruines et qu'il a fallu trois essais ratés pour
 * obtenir : la comparaison ne vaut que si les deux bras suivent les MÊMES
 * arbres, et que si on la lit dans la fenêtre où l'abri perdu est leur seule
 * différence.
 */

import { describe, expect, it } from "vitest";
import { serieMeteoPour } from "../../src/data/meteo";
import { applyAction } from "../../src/engine/actions";
import { serieToWeeks } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import {
  createGameState,
  type GameState,
  plantScattered,
  type Station,
} from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import {
  abriAuVent,
  facteurNaivete,
  HAUTEUR_SOUPLE_M,
  MEMOIRE_ABRI_ANS,
  memoireDAbri,
  naiveteAuVent,
  PERTE_NAIVETE,
} from "../../src/engine/tempete";
import { tick } from "../../src/engine/tick";

const COTE = 40;
const STATION: Station = { ...LIMON_RICHE.station, coteM: COTE, voisinage: [] };
const SERIE = serieMeteoPour(LIMON_RICHE.station.id);
if (!SERIE) throw new Error("série manquante");
const METEO = serieToWeeks(SERIE);
const moyenne = (a: readonly number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

describe("ce que la mémoire d'abri sait dire", () => {
  it("elle rattrape la réalité en quelques années, pas en une", () => {
    // Une mémoire qui rattraperait en un an ne serait pas une mémoire.
    let m = 0.8;
    for (let an = 0; an < MEMOIRE_ABRI_ANS; an++) m = memoireDAbri(m, 0);
    expect(m).toBeGreaterThan(0.2);
    expect(m).toBeLessThan(0.4);
    // Et elle converge : au bout de vingt ans il ne reste rien de l'ancien.
    for (let an = 0; an < 15; an++) m = memoireDAbri(m, 0);
    expect(m).toBeLessThan(0.05);
  });

  it("être ABRITÉ ne rend pas naïf : le plancher est à zéro", () => {
    // Le cas symétrique, et il doit être inerte. Un arbre qu'un voisin vient
    // de protéger n'est pas fragile, il est mieux protégé.
    expect(naiveteAuVent(0.2, 0.9)).toBe(0);
    expect(naiveteAuVent(0.9, 0.2)).toBeCloseTo(0.7, 12);
    // Et un arbre sans mémoire — un semis qui n'a pas vu passer un 1ᵉʳ janvier
    // — n'est pas naïf non plus.
    expect(naiveteAuVent(undefined, 0)).toBe(0);
  });

  it("la pénalité est bornée, et nulle sans naïveté", () => {
    expect(facteurNaivete(0)).toBe(1);
    expect(facteurNaivete(1)).toBeCloseTo(1 - PERTE_NAIVETE, 12);
    expect(facteurNaivete(0.5)).toBeGreaterThan(facteurNaivete(1));
  });
});

/** Quarante ans de pins, puis une éclaircie, et ce qu'il en reste. */
function apresEclaircie(critere: "parLeBas" | "parLeHaut", ans = 40) {
  let s: GameState = plantScattered(
    createGameState(STATION, rngStateFromSeed(7)),
    "pinus_sylvestris",
    600,
  );
  for (let i = 0; i < ans * 52; i++) {
    const w = METEO[i % METEO.length];
    if (!w) throw new Error("météo manquante");
    s = tick(s, w).state;
  }
  s = applyAction(s, {
    type: "eclaircir",
    week: ans * 52,
    x: COTE / 2,
    y: COTE / 2,
    rayonM: COTE,
    densiteCibleParHa: 250,
    critere,
    devenir: "laisser",
  }).state;
  const naivete = (etat: GameState) => {
    const v = etat.trees.filter((t) => t.alive && t.heightM > HAUTEUR_SOUPLE_M);
    return moyenne(v.map((t) => naiveteAuVent(t.abriHabituel, abriAuVent(etat.trees, t))));
  };
  return { etat: s, naivete, debut: ans * 52 };
}

describe("en partie : la naïveté distingue les deux façons d'éclaircir", () => {
  it("par le HAUT, elle est massive ; par le BAS, elle est nulle", () => {
    // LE RÉSULTAT QU'ON N'A PAS ÉCRIT, et le plus instructif du lot. Une
    // éclaircie par le bas retire les dominés et garde les DOMINANTS — or
    // `abriAuVent` ne compte que les voisins qui DÉPASSENT, donc les dominants
    // n'étaient abrités par personne : ils ne perdent rien, et ils ne
    // deviennent pas naïfs. C'est juste, et c'est exactement la règle
    // sylvicole : ce qui met un peuplement en danger, c'est d'ouvrir par le
    // haut. Relevé 0,589 contre 0,012.
    const haut = apresEclaircie("parLeHaut");
    const bas = apresEclaircie("parLeBas");
    expect(haut.naivete(haut.etat)).toBeGreaterThan(0.3);
    expect(bas.naivete(bas.etat)).toBeLessThan(0.05);
  });

  it("et elle s'estompe d'elle-même en quelques années", () => {
    // Le cœur du critère : « pendant quelques années », pas pour toujours.
    // Relevé après une éclaircie par le haut : 0,486 puis 0,252 / 0,157 /
    // 0,110 / 0,085 / 0,062 aux cinq anniversaires suivants.
    const { etat, naivete, debut } = apresEclaircie("parLeHaut");
    const juste = naivete(etat);
    expect(juste).toBeGreaterThan(0.3);
    let s = etat;
    for (let i = 0; i < MEMOIRE_ABRI_ANS * 52; i++) {
      const w = METEO[(debut + i) % METEO.length];
      if (!w) throw new Error("météo manquante");
      s = tick(s, w).state;
    }
    const apres = naivete(s);
    expect(apres).toBeLessThan(0.5 * juste);
  });
});

describe("LE CRITÈRE : un peuplement qu'on vient d'ouvrir verse", () => {
  it("les MÊMES arbres versent deux fois et demie plus dans les cinq ans qui suivent", () => {
    // LE BANC APPARIÉ, et il a fallu trois essais ratés pour l'obtenir.
    //
    // Les deux premiers comparaient des populations différentes — une éclaircie
    // par le haut retire les grands, donc la population vulnérable, et le
    // peuplement éclairci ressortait plus SÛR que le témoin (8,3 % contre
    // 43,7 %). Ce n'était pas faux : il n'avait plus d'arbres à perdre. Mais ça
    // ne dit rien de la fragilité d'après-ouverture.
    //
    // Celui-ci suit **exactement les mêmes arbres dans les deux bras** : ceux
    // que l'éclaircie laisse debout. Populations identiques à l'instant zéro ;
    // seule diffère la présence des voisins qu'on a retirés.
    const COTE_B = 40;
    const stationB: Station = { ...LIMON_RICHE.station, coteM: COTE_B, voisinage: [] };
    const AN = 40;
    const SUIVI = 12;
    let couchesEclairci = 0;
    let couchesTemoin = 0;
    let toutDeSuiteEclairci = 0;
    let toutDeSuiteTemoin = 0;
    let cohorteTotale = 0;
    let abriEclairci = 0;
    let abriTemoin = 0;
    for (const graine of [3, 7, 11, 13, 17, 19]) {
      let base: GameState = plantScattered(
        createGameState(stationB, rngStateFromSeed(graine)),
        "pinus_sylvestris",
        400,
      );
      for (let i = 0; i < AN * 52; i++) {
        const w = METEO[i % METEO.length];
        if (!w) throw new Error("météo manquante");
        base = tick(base, w).state;
      }
      // Une éclaircie PAR LE BAS : elle garde les dominants, et c'est le cas
      // réel — celui où la question « sont-ils plus fragiles ? » a un sens.
      const eclairci = applyAction(base, {
        type: "eclaircir",
        week: AN * 52,
        x: COTE_B / 2,
        y: COTE_B / 2,
        rayonM: COTE_B,
        densiteCibleParHa: 150,
        critere: "parLeBas",
        devenir: "laisser",
      }).state;
      const vE = eclairci.trees.filter((t) => t.alive);
      const vT = base.trees.filter((t) => t.alive);
      const hMax = Math.max(0, ...vE.map((t) => t.heightM));
      const dom = vE.filter((t) => t.heightM > 0.8 * hMax);
      const cohorte = new Set(dom.map((t) => t.id));
      cohorteTotale += cohorte.size;
      abriEclairci += moyenne(dom.map((t) => abriAuVent(vE, t))) * dom.length;
      abriTemoin += moyenne(dom.map((t) => abriAuVent(vT, t))) * dom.length;
      for (const [eclairciBras, depart] of [
        [true, eclairci],
        [false, base],
      ] as const) {
        let s = depart;
        for (let i = AN * 52; i < (AN + SUIVI) * 52; i++) {
          const w = METEO[i % METEO.length];
          if (!w) throw new Error("météo manquante");
          const r = tick(s, w);
          s = r.state;
          if (!r.tempete) continue;
          for (const vic of r.tempete.victimes) {
            if (!cohorte.has(vic.id)) continue;
            const tot = i < (AN + 5) * 52;
            if (eclairciBras) {
              couchesEclairci++;
              if (tot) toutDeSuiteEclairci++;
            } else {
              couchesTemoin++;
              if (tot) toutDeSuiteTemoin++;
            }
          }
        }
      }
    }
    // L'ouverture dépouille les dominants : relevé 0,275 → 0,189 sur les six
    // graines, soit un tiers de leur abri.
    expect(abriEclairci / cohorteTotale).toBeLessThan(0.8 * (abriTemoin / cohorteTotale));

    // ── ET C'EST LA FENÊTRE DE CINQ ANS QUI PORTE LA MESURE (#183) ──────────
    //
    // Premier relevé, douze graines, avant la carie du tronc : 57 couchés
    // contre 19 sur douze ans, dont 11 contre 1 sur les cinq premières années.
    // La carie (#182, corrigée en #183) a tout déplacé sans rien dire sur le
    // vent — elle affaiblit les fûts des DEUX bras, donc elle relève le
    // plancher du témoin, qui ne versait presque pas :
    //
    //                     avant carie (12 gr.)   après (6 gr.)
    //   sur douze ans        57 / 19  = 3,0       133 / 81 = 1,6
    //   sur cinq ans         11 /  1  = 11        49 / 20  = 2,5
    //
    // Le rapport baisse dans les deux fenêtres, et il baisse pour une raison
    // écologique et non par bruit : un peuplement dont les fûts sont en partie
    // cariés perd des tiges même sans qu'on l'ouvre. La naïveté reste ce
    // qu'elle était ; c'est le témoin qui a cessé d'être intact.
    //
    // La fenêtre de CINQ ANS est celle qui compte, et le commentaire ci-dessus
    // disait déjà pourquoi : au-delà, les deux bras ont divergé en hauteur et
    // en diamètre, donc on ne mesure plus l'abri perdu mais tout ce qui a
    // suivi. Les deux seuils sont posés sous les rapports mesurés — 1,75 sous
    // 2,45 et 1,3 sous 1,64 — et tous deux au-dessus de 1.
    expect(couchesTemoin).toBeGreaterThan(0);
    expect(toutDeSuiteTemoin).toBeGreaterThan(0);
    expect(toutDeSuiteEclairci).toBeGreaterThan(1.75 * toutDeSuiteTemoin);
    expect(couchesEclairci).toBeGreaterThan(1.3 * couchesTemoin);
  }, 900_000);
});
