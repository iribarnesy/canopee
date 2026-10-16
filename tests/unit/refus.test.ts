/**
 * **Un refus passe, et les refus identiques font une ligne** (#402).
 *
 * « Les erreurs restent affichées beaucoup trop longtemps », et la même
 * plantation trop serrée en écrivait trois lignes identiques. L'essai tient les
 * deux règles de `refus.ts` : le regroupement, avec son compte, et l'effacement,
 * à l'instant exact où la durée est écoulée.
 */

import { describe, expect, it } from "vitest";
import type { ActionRefusal } from "../../src/engine/actions";
import {
  ajouterLesRefus,
  DUREE_D_UN_REFUS_MS,
  LIGNES_DE_REFUS_MAX,
  type LigneDeRefus,
  prochaineFin,
  refusEnCours,
} from "../../src/game/refus";

const TROP_PROCHE: ActionRefusal = {
  week: 12,
  action: "planter",
  reason: "trop proche d'une tige vivante (ronce, < 0.3 m)",
};
const DECOUVERT: ActionRefusal = { week: 12, action: "couper", reason: "découvert plafonné" };
const HORS_PARCELLE: ActionRefusal = { week: 12, action: "chauler", reason: "hors parcelle" };
const SANS_OUVRIER: ActionRefusal = {
  week: 12,
  action: "embaucher",
  reason: "aucun ouvrier en CDI",
};

const lisible = (lignes: readonly LigneDeRefus[]) =>
  lignes.map((l) => `${l.action} ×${l.fois}`).join(", ");

describe("le regroupement", () => {
  it("trois refus identiques du même instantané font une ligne ×3", () => {
    const l = ajouterLesRefus([], [TROP_PROCHE, TROP_PROCHE, TROP_PROCHE], 1000);
    expect(l).toHaveLength(1);
    expect(l[0]?.fois).toBe(3);
    expect(l[0]?.reason).toBe(TROP_PROCHE.reason);
  });

  it("le même geste pour une autre raison est une autre ligne, et la semaine n'y fait rien", () => {
    const autre = { ...TROP_PROCHE, reason: "trop proche d'une tige vivante (aubépine, < 0.3 m)" };
    const l = ajouterLesRefus([], [TROP_PROCHE, { ...TROP_PROCHE, week: 13 }, autre], 1000);
    expect(lisible(l)).toBe("planter ×1, planter ×2");
  });

  it("un refus qui revient pendant que sa ligne est à l'écran s'ajoute à son compte", () => {
    let l = ajouterLesRefus([], [TROP_PROCHE], 1000);
    l = ajouterLesRefus(l, [TROP_PROCHE], 2000);
    l = ajouterLesRefus(l, [TROP_PROCHE, TROP_PROCHE], 3000);
    expect(lisible(l)).toBe("planter ×4");
  });

  it("un refus qui revient après s'être effacé repart à ×1", () => {
    let l = ajouterLesRefus([], [TROP_PROCHE, TROP_PROCHE], 1000);
    l = ajouterLesRefus(l, [TROP_PROCHE], 1000 + DUREE_D_UN_REFUS_MS);
    expect(lisible(l)).toBe("planter ×1");
  });
});

describe("l'ordre", () => {
  it("le plus récent en tête, y compris dans un même instantané", () => {
    let l = ajouterLesRefus([], [DECOUVERT], 1000);
    l = ajouterLesRefus(l, [HORS_PARCELLE, TROP_PROCHE], 2000);
    // Le moteur émet dans l'ordre des gestes : le dernier émis est le plus récent.
    expect(lisible(l)).toBe("planter ×1, chauler ×1, couper ×1");
  });

  it("un refus qui revient remonte en tête", () => {
    let l = ajouterLesRefus([], [TROP_PROCHE], 1000);
    l = ajouterLesRefus(l, [DECOUVERT], 2000);
    l = ajouterLesRefus(l, [TROP_PROCHE], 3000);
    expect(lisible(l)).toBe("planter ×2, couper ×1");
  });

  it(`pas plus de ${LIGNES_DE_REFUS_MAX} lignes : la plus ancienne cède sa place`, () => {
    let l = ajouterLesRefus([], [SANS_OUVRIER], 1000);
    l = ajouterLesRefus(l, [DECOUVERT, HORS_PARCELLE, TROP_PROCHE], 2000);
    expect(l).toHaveLength(LIGNES_DE_REFUS_MAX);
    expect(l.some((x) => x.action === "embaucher")).toBe(false);
  });
});

describe("l'effacement", () => {
  it("une ligne est là jusqu'au bout de sa durée, et partie à l'instant exact où elle s'achève", () => {
    const l = ajouterLesRefus([], [TROP_PROCHE], 1000);
    expect(refusEnCours(l, 1000 + DUREE_D_UN_REFUS_MS - 1)).toHaveLength(1);
    expect(refusEnCours(l, 1000 + DUREE_D_UN_REFUS_MS)).toHaveLength(0);
  });

  it("un refus identique qui revient remet son horloge à zéro", () => {
    let l = ajouterLesRefus([], [TROP_PROCHE], 1000);
    l = ajouterLesRefus(l, [TROP_PROCHE], 4000);
    expect(refusEnCours(l, 1000 + DUREE_D_UN_REFUS_MS)).toHaveLength(1);
    expect(refusEnCours(l, 4000 + DUREE_D_UN_REFUS_MS)).toHaveLength(0);
  });

  it("chaque ligne s'efface à son heure, et la prochaine fin est celle de la plus ancienne", () => {
    let l = ajouterLesRefus([], [DECOUVERT], 1000);
    l = ajouterLesRefus(l, [TROP_PROCHE], 3000);
    expect(prochaineFin(l)).toBe(1000 + DUREE_D_UN_REFUS_MS);
    const reste = refusEnCours(l, 1000 + DUREE_D_UN_REFUS_MS);
    expect(lisible(reste)).toBe("planter ×1");
    expect(prochaineFin(reste)).toBe(3000 + DUREE_D_UN_REFUS_MS);
    expect(prochaineFin(refusEnCours(reste, 3000 + DUREE_D_UN_REFUS_MS))).toBeUndefined();
  });

  it("les lignes échues partent aussi quand un autre refus arrive", () => {
    let l = ajouterLesRefus([], [DECOUVERT], 1000);
    l = ajouterLesRefus(l, [TROP_PROCHE], 1000 + DUREE_D_UN_REFUS_MS + 1);
    expect(lisible(l)).toBe("planter ×1");
  });

  it("ne touche pas à la liste qu'on lui donne", () => {
    const avant = ajouterLesRefus([], [DECOUVERT], 1000);
    const copie = structuredClone(avant);
    ajouterLesRefus(avant, [DECOUVERT, TROP_PROCHE], 2000);
    refusEnCours(avant, 1000 + DUREE_D_UN_REFUS_MS);
    expect(avant).toEqual(copie);
  });
});
