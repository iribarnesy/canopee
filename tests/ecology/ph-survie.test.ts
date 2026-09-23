import { describe, expect, it } from "vitest";
import { ESPECES_V0, getEspece } from "../../src/engine/especes";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import {
  facteurGammePh,
  facteurSurviePh,
  horizon,
  MARGE_SURVIE_PH,
  VIGUEUR_A_LA_BORNE,
} from "../../src/engine/soil";
import { createGameState, type GameState, plantScattered } from "../../src/engine/state";
import { LIMON_RICHE, stationDepuisProfil } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";
import { phFactor, phFactorSurvie } from "../../src/engine/trees";

/**
 * Le pH a deux seuils, comme l'eau en a deux (#161).
 *
 * L'eau distingue depuis toujours un CONFORT, qui ralentit la croissance, et un
 * STRESS, qui tue — « le hêtre pousse mal dès que l'eau manque mais son semis
 * survit ». Le pH n'avait qu'un facteur pour les deux, si bien qu'une espèce au
 * bord de son amplitude ne pouvait pas pousser mal ET tenir : elle mourait.
 *
 * Une amplitude d'atlas est une amplitude de PRÉSENCE. Y être, c'est y être
 * rare et chétif, pas y être mort.
 *
 * LE LOT DÉMONTRAIT CELA SUR LE HÊTRE À pH 4,2 ; c'est le CHARME qui s'en
 * charge depuis, au même pH et aux mêmes facteurs (croissance 0,031, survie
 * 0,621, aux trois décimales). La recalibration des gammes sur la littérature
 * (#160) a porté le hêtre de 4,5-8,0 à 3,5-8,0 — Leuschner et al. 2006 ont
 * MESURÉ des hêtraies jusqu'à pH(H2O) 3,2 — et 4,2 est devenu pour lui un
 * optimum : il y montait à 9,8 m au lieu de végéter.
 *
 * Descendre le banc sous 3,5 n'était PAS une option, et c'est le moteur qui le
 * dit : `bases.ts` plancherait le pH à 4,1 (`PH_PLANCHER`), qui est la gamme
 * tampon de l'aluminium d'Ulrich et non un garde-fou. Un profil déclaré à 3,2
 * remonte à 4,1 au premier tick. Conséquence à retenir : AUCUNE ESPÈCE DE
 * BORNE BASSE SOUS 4,1 ne peut se retrouver sous sa borne dans ce moteur — le
 * hêtre, le bouleau, la ronce, la callune, l'ajonc, le chêne-liège. Leur rampe
 * acide existe dans la fonction et ne sera jamais atteinte en jeu. Le charme
 * (4,5-8,0) est l'arbre dont la borne basse est la plus haute parmi les
 * essences d'ombre : c'est lui qui permet l'épreuve.
 */

/**
 * LE LIMON RICHE, MAIS ACIDE — et rien d'autre de changé.
 *
 * Même texture, même profondeur, même nappe, même azote : seul le pH descend, à
 * 4,2 — trois dixièmes sous la borne du charme, et un dixième au-dessus du
 * plancher du tampon aluminium (4,1), qui est le plus bas que ce moteur sache
 * représenter. C'est le seul banc qui ISOLE le facteur. Un premier jet mesurait
 * sur la lande sableuse, dont le pH (4,50) est pile la borne du charme — mais on
 * y meurt de SOIF avant d'y mourir du pH, et le banc ne prouvait donc rien du
 * lot.
 */
const PH_ACIDE = 4.2;
const ACIDE = stationDepuisProfil({
  id: "limon-riche-acide",
  relief: { altitudeM: 110, pentePct: 4, expositionDeg: 180, forme: "plan", bassinAmontHa: 0.5 },
  paysageId: "bocage",
  nom: "Limon riche acidifié",
  latitudeDeg: 49.5,
  profil: [
    horizon(35, { sable: 15, limon: 70, argile: 15 }, { moPct: 2.2, ph: PH_ACIDE }),
    horizon(65, { sable: 15, limon: 70, argile: 15 }, { moPct: 0.8, ph: PH_ACIDE + 0.2 }),
  ],
  initialMineralNKgHa: 60,
  profondeurNappeEquilibreCm: 630,
  remonteeNappeMmSemaine: 0,
  drainageExterneMmSemaine: Number.POSITIVE_INFINITY,
  herbeInitiale: 0.2,
  // 40 m : le banc isole un facteur du sol, pas une dynamique de peuplement.
  coteM: 40,
});

const GRAINES = [11, 23, 37];
const meteo = syntheticYear(LIMON_RICHE.climat);

/**
 * Le gibier ET le sanglier sont écartés, pour la même raison : ce fichier mesure
 * ce que le pH fait à une tige, et une tige plantée à trente centimètres est à
 * portée des deux. Le sanglier s'est ajouté avec le boutis (#199), qui arrache
 * ce qui n'a pas atteint cinquante centimètres — il tuait un charme sur vingt et
 * l'essai du dessous comptait des morts qui n'avaient rien à voir avec le sol.
 */
function peuplement(plantations: [string, number][], annees: number, seed: number): GameState {
  let s = createGameState(
    { ...ACIDE, gibierParHa: 0, sanglierParHa: 0, voisinage: [] },
    rngStateFromSeed(seed),
  );
  for (const [id, n] of plantations) s = plantScattered(s, id, n, 0.3);
  for (let i = 0; i < annees * 52; i++) {
    const w = meteo[s.week % meteo.length];
    if (!w) throw new Error("météo manquante");
    s = tick(s, w).state;
  }
  return s;
}

describe("le pH distingue enfin pousser mal et mourir", () => {
  it("DANS son amplitude, aucune espèce ne voit son facteur bouger d'un iota", () => {
    // LA GARANTIE QUI PROTÈGE LES TABLES DE PRODUCTION, et elle est structurelle
    // plutôt que mesurée : la queue de croissance ne vit qu'au-dehors, donc à
    // l'intérieur `phFactor` rend exactement l'ancienne valeur. Aucune espèce
    // n'étant calée hors de sa gamme — le pin sylvestre est à pH 7 dans 4–7,5,
    // le châtaignier sur le limon acide où il vaut 1 — aucune table ne PEUT
    // bouger. Si cet essai tombe, c'est la calibration entière qui est en jeu.
    const ecarts: string[] = [];
    for (const e of ESPECES_V0) {
      const [min, max] = e.ph;
      for (let ph = min; ph <= max + 1e-9; ph += 0.05) {
        const avant = facteurGammePh(e.ph, ph);
        const apres = phFactor(e, ph);
        if (Math.abs(avant - apres) > 1e-12) {
          ecarts.push(`${e.nom} à pH ${ph.toFixed(2)} : ${avant} → ${apres}`);
        }
      }
    }
    expect(ecarts.slice(0, 5)).toEqual([]);
  });

  it("les deux courbes se rejoignent à la borne, sans marche", () => {
    for (const e of ESPECES_V0) {
      const [min] = e.ph;
      // À la borne : la rampe vaut VIGUEUR_A_LA_BORNE, la survie vaut 1.
      expect(phFactor(e, min)).toBeCloseTo(VIGUEUR_A_LA_BORNE, 6);
      expect(phFactorSurvie(e, min)).toBeCloseTo(1, 6);
      // PAS DE SAUT — et c'est bien un saut qu'on cherche, pas une pente. Une
      // première version comparait `min ± 0,01` en exigeant moins de 0,01
      // d'écart : la rampe a une pente de 1/0,7, elle bouge donc de 0,014 sur
      // cet intervalle rien qu'en étant continue. L'essai mesurait la
      // PLATITUDE et tombait sur une fonction parfaitement saine.
      //
      // Un coude à la borne est légitime : au-dessus c'est la rampe qui
      // commande, en dessous la queue. Ce qui ne le serait pas, c'est une
      // marche — que ce test attraperait, puisqu'elle ne s'efface pas quand ε
      // tend vers zéro.
      const eps = 1e-6;
      expect(Math.abs(phFactor(e, min + eps) - phFactor(e, min - eps))).toBeLessThan(1e-4);
      expect(phFactor(e, min - eps)).toBeLessThanOrEqual(VIGUEUR_A_LA_BORNE + 1e-9);
    }
  });

  it("la survie va plus loin que la croissance, exactement de sa marge", () => {
    const charme = getEspece("carpinus_betulus");
    const [min] = charme.ph;
    // La croissance s'éteint juste sous la borne ; la survie tient une marge
    // de plus. C'est tout l'objet du lot.
    expect(facteurGammePh(charme.ph, min - 0.1)).toBe(0);
    expect(facteurSurviePh(charme.ph, min - 0.1)).toBeGreaterThan(0.45);
    expect(facteurSurviePh(charme.ph, min - MARGE_SURVIE_PH - 0.2)).toBe(0);
  });

  it("un charme sous sa borne SURVIT, là où il mourait à 20 sur 20", () => {
    // Avant ce lot, mesuré sur ces trois graines (sur le hêtre, alors calé
    // 4,5-8,0) : 0/20 vivants à cinq ans, cause `solHorsGamme`, à un pH que
    // l'atlas donne pour tolérable.
    for (const g of GRAINES) {
      const s = peuplement([["carpinus_betulus", 20]], 15, g);
      const coh = s.trees.filter((t) => t.id <= 20);
      const vivants = coh.filter((t) => t.alive);
      expect(vivants.length).toBeGreaterThan(15);
      expect(coh.filter((t) => t.causeMort === "solHorsGamme")).toHaveLength(0);
    }
  });

  it("mais il VÉGÈTE : il pousse, très peu, et n'est pas un nain immortel", () => {
    // Le premier jet de ce lot laissait la croissance à zéro sous la borne :
    // l'arbre tenait cinquante ans à ses 0,30 m de plantation, sans grandir
    // d'un millimètre ni mourir. L'issue dit « pousse mal ET tient », pas « ne
    // pousse pas ». D'où la queue de croissance dans la marge.
    const hauteurs = GRAINES.map((g) => {
      const s = peuplement([["carpinus_betulus", 20]], 40, g);
      const v = s.trees.filter((t) => t.alive && t.id <= 20);
      return v.reduce((a, t) => a + t.heightM, 0) / v.length;
    });
    for (const h of hauteurs) {
      expect(h).toBeGreaterThan(0.45); // il a poussé
      expect(h).toBeLessThan(2); // et très peu : quarante ans pour deux tiers de mètre
    }
  });

  it("et il reste un BRIN DOMINÉ dans une pinède : C7 tient autrement", () => {
    // Le point délicat du lot. Si le pH ne tue plus, la bio-indication doit
    // venir d'ailleurs — et elle vient de là où elle devrait : l'espèce à qui le
    // sol convient fait la canopée, l'autre reste au sol. À 4,2, le pin (gamme
    // 4–7,5) est dans sa rampe basse et vaut 0,34 ; le charme (4,5–8) est sous
    // sa borne et vaut 0,03.
    //
    // **CET ESSAI AFFIRMAIT `hp > 10 × hc`, ET C'ÉTAIT UN COUTEAU** (#201). Le
    // pin recalé sur sa table de production l'a fait tomber sur une graine :
    //
    //     graine   pin (m)   charme (m)   rapport   charme SEUL
    //       11      10,403      0,976      10,66       1,012
    //       23       9,042      0,954       9,48       0,907
    //       37       8,703      0,928       9,37       0,886
    //
    // **Deux graines sur trois passaient désormais sous dix**, et la troisième
    // à 6 % près. Le « dix fois » était lu du rapport des FACTEURS de pH (0,34
    // contre 0,03, soit onze), transporté tel quel sur des HAUTEURS. Rien ne dit
    // qu'un facteur onze fois plus petit fasse une tige dix fois plus courte :
    // **un rapport entre deux espèces porte tout ce qui les distingue**, et il
    // suffit d'en recalibrer une pour qu'il bascule.
    //
    // **Et la mesure a corrigé l'énoncé lui-même, pas seulement son seuil.** La
    // colonne de droite donne le charme SEUL, sur la même station et la même
    // durée : −3,6 %, +5,2 %, +4,7 % pour le charme en mélange contre le charme
    // seul. Trois à cinq pour cent, **et le signe change d'une graine à
    // l'autre**. **Le pin ne fait presque rien au charme.** Ce n'est donc pas la
    // concurrence qui l'exclut, c'est le pH, directement : l'essai s'appelait
    // « exclu par la CONCURRENCE » et mesurait autre chose. Ce qu'il montre
    // vraiment, et qui suffit à C7, c'est la STRUCTURE qui en résulte — une
    // pinède où les charmes sont des brins.
    //
    // Chaque borne ne porte donc plus qu'UNE espèce : recalibrer le pin déplace
    // la première et laisse la seconde tranquille. Le plafond du charme est
    // celui que l'essai voisin lui donne déjà en peuplement pur (« quarante ans
    // pour deux tiers de mètre »), ce qui rend les deux cohérents.
    for (const g of GRAINES) {
      const s = peuplement(
        [
          ["pinus_sylvestris", 15],
          ["carpinus_betulus", 15],
        ],
        50,
        g,
      );
      const coh = s.trees.filter((t) => t.id <= 30 && t.alive);
      const pins = coh.filter((t) => t.especeId === "pinus_sylvestris");
      const charmes = coh.filter((t) => t.especeId === "carpinus_betulus");
      expect(pins.length).toBeGreaterThan(10);
      const hp = pins.reduce((a, t) => a + t.heightM, 0) / pins.length;
      const hc = charmes.length ? charmes.reduce((a, t) => a + t.heightM, 0) / charmes.length : 0;
      // Le pin fait un arbre (8,7 à 10,4 m mesurés), le charme reste un brin
      // (0,93 à 0,98) : une pinède avec des charmes dessous, pas un mélange.
      expect(hp).toBeGreaterThan(5);
      expect(hc).toBeLessThan(2);
    }
  });
});
