import { describe, expect, it } from "vitest";
import { hashDeLOnglet, type Onglet, ongletDeLUrl, TITRE } from "../../src/onglets";

const TOUS: Onglet[] = ["jeu", "modele", "labo"];

describe("l'onglet dans l'URL", () => {
  it("fait l'aller-retour pour les trois onglets", () => {
    for (const onglet of TOUS) {
      expect(ongletDeLUrl(hashDeLOnglet(onglet))).toBe(onglet);
    }
  });

  it("mène au jeu quand l'URL ne dit rien", () => {
    expect(ongletDeLUrl("")).toBe("jeu");
    expect(ongletDeLUrl("#")).toBe("jeu");
  });

  it("laisse l'adresse nue pour le jeu : c'est l'accueil", () => {
    expect(hashDeLOnglet("jeu")).toBe("");
  });

  // Ce que fait un copier-coller : le « # » qui saute, la barre en trop, la
  // casse d'un correcteur automatique, l'espace de fin d'une ligne de courriel.
  it.each(["#/modele", "#modele", "modele", "/modele", "#/modele/", "#/MODELE", "  #/modele  "])(
    "reconnaît « %s »",
    (abime) => {
      expect(ongletDeLUrl(abime)).toBe("modele");
    },
  );

  it("ne devine pas : une adresse inconnue mène au jeu, pas à une page vide", () => {
    expect(ongletDeLUrl("#/moteur")).toBe("jeu");
    expect(ongletDeLUrl("#/modele-des-sols")).toBe("jeu");
    expect(ongletDeLUrl("#section-3")).toBe("jeu");
  });

  it("donne à chaque onglet son titre, et ils sont distincts", () => {
    const titres = TOUS.map((o) => TITRE[o]);
    expect(new Set(titres).size).toBe(TOUS.length);
    for (const t of titres) expect(t.startsWith("Canopée")).toBe(true);
  });
});
