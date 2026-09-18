/**
 * LE PRÉAVIS : demander au moteur si un geste passerait, sans le faire.
 *
 * Le jeu veut annoncer « ce clic sera refusé » AVANT le clic, pour que le
 * fantôme d'arbre sous le curseur passe au rouge. Il n'a qu'un moyen honnête
 * de le savoir : appliquer l'action sur l'état courant et jeter le résultat,
 * en ne gardant que les refus. Refaire la règle du moteur dans le jeu en
 * ferait une seconde copie, qui dériverait sans que rien ne le signale.
 *
 * **Ce fichier épingle ce que ce moyen suppose.** `applyAction` rend
 * aujourd'hui un état neuf plutôt que de toucher à celui qu'on lui donne ;
 * c'est une propriété observée du code, pas un contrat écrit. Le jour où une
 * branche modifierait un tableau en place, le préavis corromprait la partie
 * du joueur en silence — et le bug ne se verrait qu'au chargement suivant.
 * Ces essais échouent bruyamment ce jour-là. #139 demande au moteur d'en
 * faire une vraie garantie, signature à l'appui.
 */

import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/engine/actions";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";

const STATION = { ...LIMON_RICHE.station, coteM: 30, voisinage: [] };

/** Une parcelle avec un arbre déjà en place, à un endroit connu. */
function avecUnArbre() {
  const depart = createGameState(STATION, rngStateFromSeed(7), { economie: true });
  const { state } = applyAction(depart, {
    type: "planter",
    week: 5,
    especeId: "betula_pendula",
    positions: [{ x: 10, y: 10 }],
  });
  return state;
}

/** Ce qui doit rester identique après un préavis. */
function empreinte(s: ReturnType<typeof avecUnArbre>) {
  return JSON.stringify({
    arbres: s.trees.length,
    ids: s.trees.map((t) => t.id),
    positions: s.trees.map((t) => [t.x, t.y]),
    prochainId: s.nextTreeId,
    argent: s.economy.treasuryEur,
    heuresSemaine: s.economy.hoursUsedWeek,
    heuresAnnee: s.economy.hoursUsedYear,
    rng: s.rng,
    carboneImporte: s.carbon.importedPlantsCumKgC,
  });
}

describe("prévoir une action ne change pas la partie", () => {
  it("un préavis de plantation ne plante rien", () => {
    const etat = avecUnArbre();
    const avant = empreinte(etat);
    applyAction(etat, {
      type: "planter",
      week: 6,
      especeId: "pinus_sylvestris",
      positions: [{ x: 20, y: 20 }],
    });
    expect(empreinte(etat)).toBe(avant);
  });

  it("le tirage de vigueur d'un préavis ne consomme pas le hasard de la partie", () => {
    // Sans ça, deux parties de même graine divergeraient selon les endroits
    // que le joueur a SURVOLÉS — un déterminisme cassé par un mouvement de
    // souris, et introuvable.
    const etat = avecUnArbre();
    const rngAvant = JSON.stringify(etat.rng);
    for (let i = 0; i < 20; i++) {
      applyAction(etat, {
        type: "planter",
        week: 6,
        especeId: "pinus_sylvestris",
        positions: [{ x: i, y: 25 }],
      });
    }
    expect(JSON.stringify(etat.rng)).toBe(rngAvant);
  });

  it("le préavis rend le refus que l'action rendrait — la règle du mètre", () => {
    const etat = avecUnArbre();
    const preavis = applyAction(etat, {
      type: "planter",
      week: 6,
      especeId: "pinus_sylvestris",
      positions: [{ x: 10.4, y: 10 }],
    });
    expect(preavis.refusals.map((r) => r.reason).join(" ")).toContain("trop proche");

    // et le vrai geste, au même endroit, refuse pareil
    const vrai = applyAction(etat, {
      type: "planter",
      week: 6,
      especeId: "pinus_sylvestris",
      positions: [{ x: 10.4, y: 10 }],
    });
    expect(vrai.refusals.map((r) => r.reason)).toEqual(preavis.refusals.map((r) => r.reason));
    expect(vrai.state.trees.length).toBe(etat.trees.length);
  });

  it("là où c'est libre, le préavis ne refuse rien", () => {
    const etat = avecUnArbre();
    const { refusals } = applyAction(etat, {
      type: "planter",
      week: 6,
      especeId: "pinus_sylvestris",
      positions: [{ x: 25, y: 4 }],
    });
    expect(refusals).toEqual([]);
  });
});
