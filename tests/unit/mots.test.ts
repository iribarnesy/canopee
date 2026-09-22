/**
 * L'ACCORD DES NOMS D'ESSENCE (`src/game/mots.ts`).
 *
 * L'essai passe le CATALOGUE ENTIER, et c'est le point : la règle est une
 * poignée de motifs, elle ne prétend pas savoir le français. Ce qu'on garantit,
 * c'est qu'elle couvre les vingt-six noms du moteur — et que le jour où une
 * essence s'ajoute avec une forme qu'elle ne sait pas, l'essai le dit avant le
 * joueur.
 */

import { describe, expect, it } from "vitest";
import { ESPECES_V0 } from "../../src/engine/especes";
import { nomEspeces, pluriel, s } from "../../src/game/mots";

/** Le pluriel attendu de chaque nom du catalogue, écrit à la main. */
const ATTENDU: Record<string, string> = {
  Abricotier: "Abricotiers",
  "Ajonc d'Europe": "Ajoncs d'Europe",
  Arbousier: "Arbousiers",
  Aubépine: "Aubépines",
  "Aulne glutineux": "Aulnes glutineux",
  "Bouleau verruqueux": "Bouleaux verruqueux",
  Callune: "Callunes",
  Charme: "Charmes",
  Châtaignier: "Châtaigniers",
  "Chêne pubescent": "Chênes pubescents",
  "Chêne-liège": "Chênes-lièges",
  "Cornouiller mâle": "Cornouillers mâles",
  "Frêne commun": "Frênes communs",
  "Fusain d'Europe": "Fusains d'Europe",
  "Genêt à balais": "Genêts à balais",
  Houx: "Houx",
  Hêtre: "Hêtres",
  Noisetier: "Noisetiers",
  "Noyer commun": "Noyers communs",
  "Pin sylvestre": "Pins sylvestres",
  Pommier: "Pommiers",
  Prunellier: "Prunelliers",
  Ronce: "Ronces",
  "Saule blanc": "Saules blancs",
  "Sureau noir": "Sureaux noirs",
  "Troène commun": "Troènes communs",
};

describe("pluriel", () => {
  it("accorde les vingt-six noms du catalogue", () => {
    for (const espece of ESPECES_V0) {
      const attendu = ATTENDU[espece.nom];
      expect(attendu, `pluriel non écrit pour « ${espece.nom} »`).toBeDefined();
      expect(pluriel(espece.nom, 3), espece.nom).toBe(attendu);
    }
  });

  it("couvre le catalogue et rien de plus", () => {
    const noms = new Set(ESPECES_V0.map((e) => e.nom));
    for (const nom of Object.keys(ATTENDU)) {
      expect(noms.has(nom), `« ${nom} » n'est plus au catalogue`).toBe(true);
    }
  });

  it("ne bouge pas au singulier ni à zéro", () => {
    expect(pluriel("Bouleau verruqueux", 1)).toBe("Bouleau verruqueux");
    expect(pluriel("Bouleau verruqueux", 0)).toBe("Bouleau verruqueux");
  });

  it("ne rajoute pas de s à ce qui finit déjà par une sifflante", () => {
    // Le défaut qu'il corrige : le journal écrivait « 2 houxs ».
    expect(pluriel("Houx", 2)).toBe("Houx");
    expect(pluriel("Aulne glutineux", 2)).toBe("Aulnes glutineux");
  });

  it("met le nom en minuscules au fil du texte", () => {
    expect(nomEspeces("betula_pendula", 3)).toBe("bouleaux verruqueux");
    expect(nomEspeces("betula_pendula", 1)).toBe("bouleau verruqueux");
  });

  it("s() n'accorde qu'au-delà de un", () => {
    expect(s(0)).toBe("");
    expect(s(1)).toBe("");
    expect(s(2)).toBe("s");
  });
});
