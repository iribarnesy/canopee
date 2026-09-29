/**
 * **Une stratégie qui se rejoue seule doit rendre des comptes** (#117).
 *
 * La récolte automatique et la consigne des heures supplémentaires existaient ;
 * ce qui manquait est la phrase de fin d'année qui dit si ça a payé. Ces
 * épreuves défendent ce que la phrase affirme : les kilos par essence, les
 * salaires, et surtout le **solde** — la seule chose qu'on ne pouvait pas lire
 * dans cinquante lignes hebdomadaires.
 */

import { describe, expect, it } from "vitest";
import {
  ajouterAuCompte,
  COMPTE_VIDE,
  compteVide,
  direLeCompte,
  KG_A_NOMMER,
  type LigneDeCompte,
} from "../../src/game/compteDeLAnnee";

const nom = (id: string) => ({ malus_domestica: "pommes", juglans_regia: "noix" })[id] ?? id;

describe("ce qui entre au compte", () => {
  it("une cueillette ajoute ses kilos par essence et sa recette", () => {
    const c = ajouterAuCompte(COMPTE_VIDE, {
      eur: 230,
      fruitsKg: { malus_domestica: 115, juglans_regia: 12 },
    });
    expect(c.fruitsKg).toEqual({ malus_domestica: 115, juglans_regia: 12 });
    expect(c.recetteEur).toBe(230);
  });

  it("deux cueillettes de la même essence s'additionnent", () => {
    const lignes: LigneDeCompte[] = [
      { eur: 100, fruitsKg: { malus_domestica: 50 } },
      { eur: 130, fruitsKg: { malus_domestica: 65 } },
    ];
    const c = lignes.reduce(ajouterAuCompte, COMPTE_VIDE);
    expect(c.fruitsKg.malus_domestica).toBe(115);
    expect(c.recetteEur).toBe(230);
  });

  it("une embauche compte une semaine et un salaire en positif", () => {
    // Le mouvement de trésorerie est négatif ; la phrase dit « 420 € de
    // salaires », pas « −420 € de salaires ».
    const c = ajouterAuCompte(COMPTE_VIDE, { eur: -420, semainesDeSaisonnier: 1 });
    expect(c.semainesDeSaisonnier).toBe(1);
    expect(c.salairesEur).toBe(420);
    expect(c.recetteEur).toBe(0);
  });

  it("ne modifie jamais le compte qu'on lui donne", () => {
    const avant = ajouterAuCompte(COMPTE_VIDE, { eur: 10, fruitsKg: { malus_domestica: 5 } });
    ajouterAuCompte(avant, { eur: 10, fruitsKg: { malus_domestica: 5 } });
    expect(avant.fruitsKg.malus_domestica).toBe(5);
    expect(COMPTE_VIDE.fruitsKg).toEqual({});
  });

  it("vide tant que rien d'automatique n'a eu lieu", () => {
    expect(compteVide(COMPTE_VIDE)).toBe(true);
    expect(compteVide(ajouterAuCompte(COMPTE_VIDE, { eur: -420, semainesDeSaisonnier: 1 }))).toBe(
      false,
    );
  });
});

describe("la phrase de fin d'année", () => {
  const lignes: LigneDeCompte[] = [
    { eur: 230, fruitsKg: { malus_domestica: 115 } },
    { eur: 60, fruitsKg: { juglans_regia: 12 } },
    { eur: -420, semainesDeSaisonnier: 1 },
    { eur: -420, semainesDeSaisonnier: 1 },
  ];
  const annee = lignes.reduce(ajouterAuCompte, COMPTE_VIDE);

  it("dit les fruits, du plus lourd au plus léger, et ce qu'ils ont rapporté", () => {
    const phrase = direLeCompte(annee, 2031, nom);
    expect(phrase).toContain("2031");
    expect(phrase.indexOf("pommes")).toBeLessThan(phrase.indexOf("noix"));
    expect(phrase).toContain("115 kg de pommes");
    expect(phrase).toContain("290 €");
  });

  it("dit les semaines de saisonnier et ce qu'elles ont coûté", () => {
    const phrase = direLeCompte(annee, 2031, nom);
    expect(phrase).toContain("2 semaines de saisonnier");
    expect(phrase).toContain("840 €");
  });

  it("dit le solde, et son signe — c'est la question que la phrase tranche", () => {
    // 290 € de recette, 840 € de salaires : la stratégie a coûté 550 €.
    expect(direLeCompte(annee, 2031, nom)).toContain("solde −550 €");
    const rentable = ajouterAuCompte(COMPTE_VIDE, { eur: 900, fruitsKg: { malus_domestica: 450 } });
    expect(direLeCompte(rentable, 2031, nom)).toContain("solde +900 €");
  });

  it("ne nomme pas un fruit qui ne pèse rien", () => {
    const miettes = ajouterAuCompte(COMPTE_VIDE, {
      eur: 1,
      fruitsKg: { malus_domestica: 40, juglans_regia: KG_A_NOMMER / 2 },
    });
    expect(direLeCompte(miettes, 2031, nom)).not.toContain("noix");
  });

  it("une année de saisonniers sans cueillette se dit aussi", () => {
    const sansFruit = ajouterAuCompte(COMPTE_VIDE, { eur: -420, semainesDeSaisonnier: 1 });
    const phrase = direLeCompte(sansFruit, 2031, nom);
    expect(phrase).not.toContain("récolte automatique");
    expect(phrase).toContain("1 semaine de saisonnier");
  });
});
