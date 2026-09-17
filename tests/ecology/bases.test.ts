/**
 * Les bases échangeables et la dérive du pH (issue #71, critère C10).
 *
 * Ce que le moteur ne savait pas faire : le pH était une constante que seul le
 * joueur pouvait changer. Une pessière n'acidifiait rien, un frêne
 * n'entretenait rien, et un sol lessivé ne s'appauvrissait pas.
 *
 * Ce que ce fichier vérifie, et dans cet ordre : que rien ne bouge au démarrage
 * (une dérive qui commence par déplacer le pH de départ est un bug, pas une
 * dérive) ; que le budget de bases se conserve ; que la dérive va dans le bon
 * sens, à la bonne vitesse, et qu'elle dépend de l'essence sans qu'aucune
 * espèce soit nommée ; et que le chaulage a cessé d'être un geste à effet fixe.
 */

import { describe, expect, it } from "vitest";
import { serieMeteoPour } from "../../src/data/meteo";
import { applyAction } from "../../src/engine/actions";
import {
  CALCIUM_NEUTRE_MG_G,
  capaciteEchangeEqM2,
  effetLitiereEq,
  lessivageBasesEq,
  PH_PLANCHER,
  PH_SATURE,
  phDepuisSaturation,
  saturationDepuisPh,
} from "../../src/engine/bases";
import { getEspece } from "../../src/engine/especes";
import { serieToWeeks } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantAt, type Station } from "../../src/engine/state";
import {
  LANDE_SECHE,
  LIMON_ACIDE,
  LIMON_RICHE,
  type StationClimat,
} from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

const moyenne = (a: readonly number[]) => a.reduce((x, y) => x + y, 0) / a.length;

describe("le pH est une lecture du complexe, pas un état libre", () => {
  it("la courbe pH ↔ saturation est croissante et s'inverse exactement", () => {
    expect(phDepuisSaturation(0)).toBe(PH_PLANCHER);
    expect(phDepuisSaturation(1)).toBe(PH_SATURE);
    expect(phDepuisSaturation(0.2)).toBeLessThan(phDepuisSaturation(0.8));
    // L'aller-retour doit être exact : c'est lui qui garantit qu'une partie
    // démarre au pH que sa station déclare.
    for (const ph of [4.5, 5, 6.5, 7]) {
      expect(phDepuisSaturation(saturationDepuisPh(ph))).toBeCloseTo(ph, 10);
    }
  });

  it("elle passe par les deux repères mesurés sur sols forestiers", () => {
    // Sols granitiques à moins de 10 % de saturation : pH 4,1 à 4,8.
    expect(phDepuisSaturation(0.1)).toBeGreaterThanOrEqual(4.1);
    expect(phDepuisSaturation(0.1)).toBeLessThanOrEqual(4.8);
    // 50 % de saturation : pH 4,8 (saturation effective) à 5,5 (standard).
    expect(phDepuisSaturation(0.5)).toBeGreaterThanOrEqual(4.8);
    expect(phDepuisSaturation(0.5)).toBeLessThanOrEqual(5.5);
  });

  it("une partie démarre EXACTEMENT au pH que sa station déclare", () => {
    // Le piège du lot : dériver le pH est une chose, déplacer son point de
    // départ en est une autre, et ce serait un bug déguisé en mécanisme.
    for (const sc of [LANDE_SECHE, LIMON_ACIDE, LIMON_RICHE]) {
      const s = createGameState({ ...sc.station, coteM: 6, voisinage: [] }, rngStateFromSeed(1));
      expect(moyenne(s.soil.ph)).toBeCloseTo(sc.station.phInitial, 10);
    }
  });

  it("un sable a un petit complexe, une argile un grand", () => {
    const sable = LANDE_SECHE.station.profil[0];
    const limon = LIMON_RICHE.station.profil[0];
    if (!sable || !limon) throw new Error("profil");
    expect(capaciteEchangeEqM2(sable)).toBeLessThan(capaciteEchangeEqM2(limon));
  });
});

describe("ce qui fait pencher le budget", () => {
  it("une litière riche en calcium rend des bases, une litière pauvre en prend", () => {
    expect(effetLitiereEq(100, 16)).toBeGreaterThan(0);
    expect(effetLitiereEq(100, 3.5)).toBeLessThan(0);
    // Et le seuil est EXACT par construction : la neutralité n'est pas réglée
    // deux fois, elle est déduite une fois (bases.ts).
    expect(effetLitiereEq(100, CALCIUM_NEUTRE_MG_G)).toBeCloseTo(0, 12);
  });

  it("aucune espèce n'est nommée : c'est le calcium de l'atlas qui trie", () => {
    // Le frêne rend, le pin prend — et ni l'un ni l'autre n'apparaît dans
    // `bases.ts`. Si demain une fiche change de calcium, le tri suit.
    const frene = getEspece("fraxinus_excelsior").litiere.calciumMgG;
    const pin = getEspece("pinus_sylvestris").litiere.calciumMgG;
    expect(effetLitiereEq(100, frene)).toBeGreaterThan(0);
    expect(effetLitiereEq(100, pin)).toBeLessThan(0);
    // Et « résineux » n'est pas une grandeur : la littérature donne l'épicéa à
    // deux fois le pin sylvestre. Le seul garde-fou qu'on puisse écrire ici est
    // que le pin est bas, pas que les résineux le sont.
    expect(pin).toBeLessThan(CALCIUM_NEUTRE_MG_G);
  });

  it("le complexe retient : un sol fourni lessive une part plus faible", () => {
    const riche = lessivageBasesEq(100, 10, 100, 20);
    const pauvre = lessivageBasesEq(100, 10, 100, 5);
    expect(pauvre).toBeGreaterThan(riche);
    // Et sans drainage, rien ne part.
    expect(lessivageBasesEq(100, 0, 100, 10)).toBe(0);
  });
});

/** Fait tourner une parcelle et rend ce que le budget de bases a fait. */
function parcelle(sc: StationClimat, especeId: string | null, ans: number) {
  const COTE = 16;
  const station: Station = { ...sc.station, coteM: COTE, voisinage: [], ventExposition: 0 };
  const serie = serieMeteoPour(sc.station.id);
  if (!serie) throw new Error("série manquante");
  const METEO = serieToWeeks(serie);
  let s = createGameState(station, rngStateFromSeed(3));
  if (especeId) {
    for (let y = 2; y < COTE; y += 4) {
      for (let x = 2; x < COTE; x += 4) s = plantAt(s, especeId, x, y, 0.4);
    }
  }
  const ph0 = moyenne(s.soil.ph);
  const bases0 = moyenne(s.soil.basesEq);
  let budget = 0;
  for (let i = 0; i < ans * 52; i++) {
    const w = METEO[i % METEO.length];
    if (!w) throw new Error("météo manquante");
    const r = tick(s, w);
    s = r.state;
    budget +=
      (r.fluxes.basesApportEqHa +
        r.fluxes.basesLitiereEqHa -
        r.fluxes.basesLessiveEqHa -
        r.fluxes.basesAcideEqHa) /
      10_000;
  }
  return { ph0, ph: moyenne(s.soil.ph), bases0, bases: moyenne(s.soil.basesEq), budget };
}

describe("en partie : le sol dérive, et pas n'importe comment", () => {
  it("le budget se conserve : la variation du pool VAUT la somme de ses termes", () => {
    // La discipline de l'azote, du phosphore et du potassium. Et la mise en
    // garde du référentiel avec : la conservation ne valide pas le NIVEAU, elle
    // interdit seulement d'en perdre ou d'en fabriquer en route.
    const r = parcelle(LIMON_RICHE, "fagus_sylvatica", 20);
    expect(r.bases - r.bases0).toBeCloseTo(r.budget, 6);
  });

  it("un châtaignier acidifie le limon acide qu'il occupe", () => {
    // Le mécanisme que l'issue demandait, et le seul qui compte pour le joueur :
    // planter une essence à litière pauvre referme la porte à une partie de
    // l'atlas. Relevé à l'écriture sur cinquante ans : 5,00 → 4,76.
    const boise = parcelle(LIMON_ACIDE, "castanea_sativa", 50);
    const nu = parcelle(LIMON_ACIDE, null, 50);
    expect(boise.ph).toBeLessThan(boise.ph0);
    expect(boise.ph).toBeLessThan(nu.ph - 0.1);
  });

  it("un frêne entretient le sien, et la différence est l'essence seule", () => {
    // Même station, même graine, même météo : seule la fiche change.
    //
    // **La comparaison se fait contre le SOL NU, et c'est une correction.**
    // L'essai lisait « le frêne remonte son pH au-dessus de son point de
    // départ », ce qui mêlait deux choses : l'effet de la litière, qu'il visait,
    // et la quantité de biomasse que la parcelle porte, qu'il ne contrôlait pas.
    // Le budget carbone (#96) a séparé les deux — le frêne est héliophile, sa
    // régénération ne passe plus sous couvert, la parcelle est passée de 35 à 11
    // recrues et sa litière cumulée de 15 200 à 7 000 eq/ha. C'est
    // écologiquement juste (le frêne est une essence de trouée) et ça suffit à
    // faire passer le pH du frêne sous son point de départ.
    //
    // Le témoin manquait : cette station s'acidifie TOUTE SEULE, 7,00 → 6,87
    // sans un arbre. Comparée à lui, la conclusion est intacte et même plus
    // nette qu'avant — frêne 6,94 au-dessus du sol nu, hêtre 6,75 en dessous.
    // C'est bien la litière de l'essence qu'on mesure, et elle seule.
    const hetre = parcelle(LIMON_RICHE, "fagus_sylvatica", 50);
    const frene = parcelle(LIMON_RICHE, "fraxinus_excelsior", 50);
    const nu = parcelle(LIMON_RICHE, null, 50);
    expect(hetre.ph).toBeLessThan(nu.ph);
    expect(frene.ph).toBeGreaterThan(nu.ph);
    // Et la dérive de la station elle-même va vers le bas : sans arbre, ce
    // limon perd déjà des bases.
    expect(nu.ph).toBeLessThan(nu.ph0);
  });

  it("la dérive se compte en DIXIÈMES sur une vie de forêt, pas en unités", () => {
    // La mise en garde de l'issue, et elle vaut test : la podzolisation se
    // compte en décennies à siècles. Un mécanisme qui ferait bouger le pH d'une
    // unité en cinquante ans serait spectaculaire et faux — c'est exactement ce
    // que faisait le premier jet, qui vidait un limon neutre jusqu'au plancher
    // d'acidité en vingt-cinq ans parce qu'il lessivait au taux du potassium.
    for (const sc of [LANDE_SECHE, LIMON_ACIDE, LIMON_RICHE]) {
      const nu = parcelle(sc, null, 50);
      expect(Math.abs(nu.ph - nu.ph0)).toBeLessThan(0.2);
    }
  });
});

describe("le chaulage n'est plus un geste à effet fixe", () => {
  /** Chaule le centre d'une parcelle et rend le pH avant/après. */
  function chauler(sc: StationClimat) {
    const station: Station = { ...sc.station, coteM: 12, voisinage: [] };
    const s = createGameState(station, rngStateFromSeed(1));
    const avant = moyenne(s.soil.ph);
    const r = applyAction(s, { type: "chauler", week: 0, x: 6, y: 6, rayonM: 5 });
    const i = 6 * 12 + 6;
    return { avant, apres: r.state.soil.ph[i] ?? 0, refus: r.refusals.length };
  }

  it("il remonte le pH, et davantage là où le complexe est petit", () => {
    const sable = chauler(LANDE_SECHE);
    const limon = chauler(LIMON_ACIDE);
    expect(sable.refus).toBe(0);
    expect(limon.refus).toBe(0);
    expect(sable.apres).toBeGreaterThan(sable.avant);
    expect(limon.apres).toBeGreaterThan(limon.avant);
    // LA règle qui TOMBE du mécanisme sans avoir été écrite : la même chaux sur
    // un podzol sableux (petit complexe) déplace beaucoup plus que sur un limon
    // argileux, parce que la capacité d'échange est au dénominateur du taux de
    // saturation. Avant ce lot, le chaulage montait de 0,5 partout.
    expect(sable.apres - sable.avant).toBeGreaterThan(limon.apres - limon.avant);
  });

  it("il ne dépasse pas la saturation du complexe", () => {
    // Au-delà, il faudrait des carbonates libres — un autre régime tampon, que
    // le moteur ne modélise pas et qui ne doit donc pas être franchi par
    // accident.
    let s = createGameState(
      { ...LIMON_RICHE.station, coteM: 12, voisinage: [] },
      rngStateFromSeed(1),
    );
    for (let k = 0; k < 12; k++) {
      s = applyAction(s, { type: "chauler", week: k, x: 6, y: 6, rayonM: 5 }).state;
    }
    expect(Math.max(...s.soil.ph)).toBeLessThanOrEqual(PH_SATURE);
  });
});
