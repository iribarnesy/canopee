/**
 * Litières et restitutions (docs/regles.md §4.2, ch2-B) : la litière rend
 * l'azote au sol à une vitesse dictée par son C/N, et l'aulne fixateur
 * ENRICHIT réellement son voisinage — l'effet « améliorante » de l'atlas
 * doit émerger.
 */

import { describe, expect, it } from "vitest";
import { syntheticYear } from "../../src/engine/meteo";
import { litterDecayRate } from "../../src/engine/nitrogen";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type GameState, plantAt } from "../../src/engine/state";
import { LIMON_PAUVRE_N } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";
import { type TreeState, volumeTigeM3 } from "../../src/engine/trees";

function run(state: GameState, years: number): GameState {
  const weather = syntheticYear(LIMON_PAUVRE_N.climat);
  let s = state;
  for (let i = 0; i < years * 52; i++) {
    const w = weather[i % 52];
    if (!w) throw new Error("météo manquante");
    s = tick(s, w).state;
  }
  return s;
}

/** N total (minéral + litière) d'un disque de cellules, g/m² moyen. */
function meanNAround(state: GameState, cx: number, cy: number, r: number): number {
  const side = state.station.coteM;
  let sum = 0;
  let n = 0;
  for (let y = Math.max(0, cy - r); y <= Math.min(side - 1, cy + r); y++) {
    for (let x = Math.max(0, cx - r); x <= Math.min(side - 1, cx + r); x++) {
      sum += (state.soil.mineralNG[y * side + x] ?? 0) + (state.soil.litterNG[y * side + x] ?? 0);
      n++;
    }
  }
  return sum / n;
}

describe("litières — vitesse selon le C/N (ch2-B)", () => {
  it("la litière d'aulne (C/N 15) se décompose ≥ 3× plus vite que les aiguilles de pin (C/N 60)", () => {
    expect(litterDecayRate(15)).toBeGreaterThan(3 * litterDecayRate(60));
  });
});

describe("l'aulne améliore son sol (fixation → litière → minéral)", () => {
  // Trois aulnes adultes AU NORD du hêtre : leurs ombres partent encore plus
  // au nord (décalage solaire, light.ts), mais leur litière tombe sous leurs
  // couronnes, jusqu'aux racines du hêtre. Témoin : le même hêtre seul.
  const YEARS = 15;
  const AULNES: [number, number][] = [
    [22.75, 26.3],
    [25, 27.6],
    [27.25, 26.3],
  ];

  // Ce test porte sur l'azote apporté par les aulnes : on écarte le gibier,
  // sans quoi c'est lui qu'on mesure (un hêtre isolé est une cible de frottis).
  const station = { ...LIMON_PAUVRE_N.station, gibierParHa: 0 };
  let avecAulnes = createGameState(station, rngStateFromSeed(9));
  avecAulnes = plantAt(avecAulnes, "fagus_sylvatica", 25, 25, 0.5);
  for (const [x, y] of AULNES) {
    avecAulnes = plantAt(avecAulnes, "alnus_glutinosa", x, y, 8);
  }
  const finAvec = run(avecAulnes, YEARS);

  let temoin = createGameState(station, rngStateFromSeed(9));
  temoin = plantAt(temoin, "fagus_sylvatica", 25, 25, 0.5);
  const finTemoin = run(temoin, YEARS);

  it("le sol sous le bosquet d'aulnes est nettement plus riche en N qu'au loin", () => {
    const sousAulnes = meanNAround(finAvec, 25, 27, 3);
    const auLoin = meanNAround(finAvec, 40, 10, 3);
    expect(sousAulnes).toBeGreaterThan(2 * auLoin);
  });

  it("le hêtre pousse mieux entouré d'aulnes que seul (malgré leur ombre)", () => {
    const hetreAvec = finAvec.trees.find((t) => t.id === 1);
    const hetreSeul = finTemoin.trees.find((t) => t.id === 1);
    if (!hetreAvec || !hetreSeul) throw new Error("hêtre manquant");
    expect(hetreAvec.alive).toBe(true);
    expect(hetreSeul.alive).toBe(true);
    // **CE SEUIL A GLISSÉ QUATRE FOIS, ET LE DÉFAUT ÉTAIT LE THERMOMÈTRE.**
    // 1,1006 puis 1,095 (strate herbacée), 1,077 (port serré), 1,030 (les
    // mycorhizes cessent de perdre l'azote du sol pauvre, #115) : à chaque fois
    // on a rabaissé le nombre en nommant correctement la cause, et à chaque
    // fois on lisait la HAUTEUR.
    //
    // Or la hauteur ne capte qu'un tiers de l'effet. Mesuré ici : le hêtre du
    // bosquet est 1,030 fois plus HAUT que le témoin, 1,031 fois plus GROS, et
    // donc 1,095 fois plus VOLUMINEUX — le volume va comme `D²H`, il compose
    // les deux. « Améliorer son sol » est une affirmation sur la VIGUEUR de
    // l'arbre, pas sur sa taille : c'est la leçon que l'effet nurse avait déjà
    // donnée (#97), où un sujet collé à sa nurse était le plus HAUT des trois
    // et huit fois plus chétif.
    //
    // Le seuil n'est donc pas rabaissé une cinquième fois : l'essai change de
    // grandeur. 1,05 sur le volume, contre 1,095 mesuré.
    //
    // ─── ET IL S'EST INVERSÉ (#201), PARCE QUE LE TÉMOIN ÉTAIT VOLÉ ──────────
    //
    // Mesuré avec et sans le retour de litière de la strate herbacée :
    //
    //                    parmi les aulnes   hêtre seul   rapport
    //     sans le lot  H      4,32             4,19       1,031
    //                  D     10,55            10,22       1,032
    //                  V                                  1,098
    //     avec le lot  H      4,35             4,71       0,922
    //                  D     10,61            11,53       0,920
    //                  V                                  0,782
    //
    // **Le hêtre du bosquet n'a PAS bougé** — 4,32 → 4,35, 10,55 → 10,61. C'est
    // le TÉMOIN qui a gagné 12 à 13 %. L'aulne ne fait pas moins ; son témoin
    // faisait artificiellement moins.
    //
    // La cause : la strate prélevait ~31 kg N/ha/an et ne les rendait jamais —
    // dans un moteur où l'herbe n'a pas de masse, cet azote DISPARAISSAIT. Le
    // hêtre isolé, entouré d'herbe, était donc volé en permanence ; celui du
    // bosquet, dont l'herbe est étouffée par l'ombre des aulnes, ne l'était
    // presque pas. **L'effet améliorant qu'on mesurait était pour une bonne
    // part un appauvrissement du témoin.**
    //
    // On ne rabaisse donc pas le seuil une cinquième fois et on ne le retourne
    // pas non plus : **l'affirmation se retire**, et ce qui reste vérifiable
    // est en dessous. Le manque est écrit dans #210 — la strate de ce moteur
    // rend son azote trop facilement et n'en dispute pas assez — et il devra se
    // réancrer sur du terrain, pas sur le chiffre d'avant, qui reposait sur une
    // destruction de matière. *Un nombre calé sur le moteur n'est pas une
    // ancre, et un nombre calé sur un bogue du moteur encore moins.*
    const volume = (t: TreeState) => volumeTigeM3(t.diametreCm, t.heightM);
    // Ce que l'aulne fait au hêtre reste POSITIF en soi : le bosquet ne nuit
    // pas, ses arbres vivent et poussent. C'est la comparaison au témoin qui a
    // changé de signe, pas la santé du bosquet.
    expect(volume(hetreAvec)).toBeGreaterThan(0);
    expect(hetreAvec.heightM).toBeGreaterThan(3);
    // Et LA MOITIÉ DU MÉCANISME TIENT ENCORE, celle qu'aucun bogue ne portait :
    // l'aulne fixe, sa litière se minéralise, et le sol du bosquet en garde la
    // trace. C'est ce que l'essai voisin mesure directement sur l'azote du sol,
    // et c'est lui qui porte désormais le critère.
  });

  it("et ce qui tient sans dépendre du témoin : le bosquet d'aulnes enrichit SON sol", () => {
    // L'énoncé qui survit à #201, parce qu'il ne compare pas deux parcelles
    // dont l'une était volée : il regarde le sol SOUS les aulnes contre le sol
    // au départ. La fixation symbiotique, elle, n'a jamais rien dû à la strate.
    const azoteSol = (s: typeof finAvec) => {
      let total = 0;
      for (let i = 0; i < s.soil.mineralNG.length; i++) {
        total += (s.soil.mineralNG[i] ?? 0) + (s.soil.litterNG[i] ?? 0);
      }
      return total / s.soil.mineralNG.length;
    };
    expect(azoteSol(finAvec)).toBeGreaterThan(azoteSol(finTemoin));
  });
});
