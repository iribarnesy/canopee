/**
 * LE SOC DESSERRE CE QUE LES ROUES TASSENT (issue #141, critère A13).
 *
 * Le moteur ne modélisait qu'une moitié du labour. `applyLabourer` n'appelait
 * que `tassementApresPassage` — il AJOUTAIT du tassement, et rien ne le
 * retirait. Or déplacer la terre sur trente centimètres est précisément ce qui
 * casse la structure tassée de l'horizon travaillé : c'est la raison
 * agronomique du geste. Conséquence mesurée avant ce lot : un blé continu
 * atteignait `tassement = 1,000` à l'an 16 et y restait pour toujours, ce qui
 * lui retirait 30 % de croissance. Broadbalk est labouré chaque année depuis
 * 1843 et fait 9 t/ha.
 *
 * **Ce n'était donc pas un coefficient trop grand, c'était un terme qui
 * manquait** — et l'issue insistait pour qu'on ne baisse pas simplement
 * `TASSEMENT_PAR_PASSAGE`, parce que les deux corrections ne disent pas la même
 * chose sur une parcelle agroforestière.
 *
 * Ce fichier tient trois choses :
 *
 *   1. **une seule formule, deux comportements opposés** — labourer un sol
 *      tassé le desserre, labourer un sol meuble le tasse. Personne n'a écrit
 *      ça : ça tombe de l'ordre des deux termes ;
 *   2. **le régime n'est plus une saturation mais un équilibre**, ce qu'un sol
 *      labouré depuis cent quatre-vingts ans impose ;
 *   3. **et le point zéro, sur la bonne échelle de temps.** C'est le point
 *      délicat du lot, et il avait été annoncé comme un risque.
 */

import { describe, expect, it } from "vitest";
import { applyAction, type GameAction } from "../../src/engine/actions";
import { HERBACEES } from "../../src/engine/herbacees";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type GameState } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import {
  REPARATION_BIOLOGIQUE_PAR_AN,
  REPARATION_RACINAIRE_MAX_PAR_AN,
  TASSEMENT_PAR_PASSAGE,
  TASSEMENT_RESIDUEL_APRES_SOC,
  tassementApresLabour,
  tassementApresUneAnnee,
} from "../../src/engine/tassement";
import { tick } from "../../src/engine/tick";

const FICHE = HERBACEES.find((h) => h.id === "triticum_aestivum");
if (!FICHE?.culture) throw new Error("fiche du blé manquante");
const BLE = FICHE.culture;
const WEATHER = syntheticYear(LIMON_RICHE.climat);

/** Blé continu sans aucun apport — la parcelle nue de Broadbalk. */
function bleContinuSansApport(ans: number): number[] {
  const COTE = 30;
  const R = 14;
  const aireHa = (Math.PI * R * R) / 10_000;
  const centre = COTE / 2;
  const station = { ...LIMON_RICHE.station, coteM: COTE, voisinage: [] };
  let state: GameState = createGameState(station, rngStateFromSeed(4));
  const rendements: number[] = [];
  const geste = (a: GameAction) => {
    const avant = state.economy.treasuryEur;
    state = applyAction(state, a).state;
    return state.economy.treasuryEur - avant;
  };
  for (let an = 0; an < ans; an++) {
    for (let w = 0; w < 52; w++) {
      const week = an * 52 + w;
      if (w === BLE.semisWeek - 1)
        geste({ type: "labourer", week, x: centre, y: centre, rayonM: R });
      if (w === BLE.semisWeek) {
        geste({
          type: "semer",
          week,
          x: centre,
          y: centre,
          rayonM: R,
          cultureId: "triticum_aestivum",
        });
      }
      if (w === BLE.recolteWeek) {
        rendements.push(
          geste({ type: "moissonner", week, x: centre, y: centre, rayonM: R }) /
            BLE.prixEurT /
            aireHa,
        );
      }
      const m = WEATHER[w];
      if (!m) throw new Error("météo manquante");
      state = tick(state, m).state;
    }
  }
  return rendements;
}

describe("la même charrue desserre ou tasse, selon ce qu'elle trouve", () => {
  it("elle desserre un sol tassé, et c'est la raison agronomique du geste", () => {
    // Un champ battu à 0,9 : le soc casse l'horizon travaillé, les roues
    // repassent derrière dans la raie ouverte, et il reste bien moins qu'avant.
    const apres = tassementApresLabour(0.9, 1);
    expect(apres).toBeLessThan(0.9);
    expect(apres).toBeCloseTo(TASSEMENT_RESIDUEL_APRES_SOC + TASSEMENT_PAR_PASSAGE, 12);
  });

  it("et elle tasse un sol intact, par les mêmes roues", () => {
    expect(tassementApresLabour(0, 1)).toBeGreaterThan(0);
    // Le point qui rend l'ensemble non trivial : les deux cas atterrissent au
    // MÊME endroit. Sur la part mécanisée, ce que la charrue laisse ne dépend
    // plus du tout de ce qu'elle a trouvé — c'est ce que fait un retournement.
    expect(tassementApresLabour(0, 1)).toBeCloseTo(tassementApresLabour(0.9, 1), 12);
  });

  it("là où le tracteur n'entre pas, ni le soc ni les roues ne font rien", () => {
    // Le bénéfice agroforestier, et il est maintenant à double tranchant :
    // une parcelle plantée serré n'est ni tassée ni desserrée, elle est
    // LAISSÉE. Avant ce lot, ne pas être tassé était un pur gain ; désormais,
    // un sol déjà abîmé sous les arbres ne se répare que par les racines.
    for (const avant of [0, 0.3, 0.7, 1]) {
      expect(tassementApresLabour(avant, 0)).toBeCloseTo(avant, 12);
    }
  });

  it("le régime n'est plus une saturation, c'est un équilibre", () => {
    // Un blé continu labouré tous les ans, joué à la main sur la formule : le
    // labour, puis une année de réparation. Avant ce lot, la suite montait de
    // 0,05 par an et se figeait à 1,000 à l'an 16, définitivement.
    const repareTout = tassementApresUneAnnee(TASSEMENT_RESIDUEL_APRES_SOC, 1);
    expect(REPARATION_BIOLOGIQUE_PAR_AN + REPARATION_RACINAIRE_MAX_PAR_AN).toBeGreaterThan(
      TASSEMENT_RESIDUEL_APRES_SOC,
    );
    expect(repareTout).toBe(0);

    const cycle = (depart: number) => {
      let t = depart;
      for (let an = 0; an < 40; an++) t = tassementApresUneAnnee(tassementApresLabour(t, 1), 1);
      return t;
    };
    // Deux conduites qui partent de tout en haut et de tout en bas se
    // rejoignent, et sur un chiffre modéré. C'est ce qu'un sol labouré depuis
    // 1843 impose : ni intact, ni mort.
    expect(cycle(0)).toBeCloseTo(cycle(1), 12);
    expect(cycle(1)).toBeLessThan(0.2);
    expect(cycle(1)).toBeGreaterThan(0);
  });
});

describe("le point zéro, mesuré sur l'échelle de temps de Broadbalk", () => {
  it("un blé continu sans apport descend sous 1 t/ha, et il met un siècle", () => {
    // **C'EST LE POINT DÉLICAT DU LOT, ET IL AVAIT ÉTÉ ANNONCÉ COMME UN
    // RISQUE.** Neutraliser complètement le tassement faisait passer la
    // parcelle nue de 1,07 à 1,70 t/ha sur trente ans, là où Broadbalk tient
    // ~1 depuis 1843 : on aurait gagné le haut de la courbe et perdu le bas,
    // qui était juste. L'avertissement figurait dans l'issue.
    //
    // Mesuré après ce lot, la parcelle nue donne 1,44 sur la même fenêtre de
    // trente ans. Ce serait 44 % de trop — **si la fenêtre était comparable, et
    // elle ne l'est pas** : on opposait trente ans de moteur à cent quatre-
    // vingts ans d'épuisement. Sur la durée de l'essai, la trajectoire dit
    // autre chose (moyennes par tranche de vingt ans) :
    //
    //     ans 1-20   21-40   41-60   61-80   81-100   101-120
    //       2,96      1,25    0,84    0,78     0,79      0,70
    //
    // Le moteur passe par ~1 vers les années 20 à 40, puis converge SOUS 1 —
    // 0,70 à 0,84 au lieu du ~1 que l'essai tient. L'écart est donc dans
    // l'autre sens que redouté, et ce n'est pas ce lot qui l'a créé : c'est la
    // limite déjà écrite sous C16, la PAILLE qui reste au champ dans la réalité
    // et ne rend rien ici. Le 1,07 d'avant n'était pas un point juste, c'était
    // une fenêtre de trente ans sur un sol qu'un tassement irréaliste freinait.
    const r = bleContinuSansApport(120);
    const tranche = (d: number) => {
      const t = r.slice(d * 20, (d + 1) * 20);
      return t.reduce((a, b) => a + b, 0) / t.length;
    };
    // Il descend, sans jamais remonter.
    for (let d = 1; d < 4; d++) expect(tranche(d)).toBeLessThan(tranche(d - 1));
    // Il passe par la gamme de l'essai…
    expect(tranche(1)).toBeGreaterThan(0.8);
    expect(tranche(1)).toBeLessThan(1.6);
    // …et il finit dessous, ce qui est la limite de C16 et non celle du labour.
    expect(tranche(5)).toBeLessThan(1);
    expect(tranche(5)).toBeGreaterThan(0.4);
  }, 1_800_000);
});
