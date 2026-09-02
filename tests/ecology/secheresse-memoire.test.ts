/**
 * La mémoire des sécheresses (critère D11).
 *
 * Question posée : les trajectoires GIEC produisent-elles déjà des sécheresses
 * pluriannuelles ? Réponse mesurée : **le sol, lui, n'a aucune mémoire**. Même
 * sous SSP5-8.5, la réserve profonde est à 94-100 % à chaque sortie d'hiver —
 * chaque été repart à plein.
 *
 * La mémoire existe pourtant, et elle est dans l'ARBRE. Quand la tension
 * devient extrême, l'eau casse en colonnes dans les vaisseaux : la cavitation.
 * Ces vaisseaux ne se réparent pas — l'arbre ne récupère qu'en fabriquant du
 * bois neuf, ce qui prend des années. C'est ce qui explique les mortalités
 * différées observées après 1976, 2003 et 2018 : les arbres ne meurent pas
 * l'année de la sécheresse, mais deux ou trois ans plus tard, à la suivante.
 */

import { describe, expect, it } from "vitest";
import { prochainDommageHydraulique } from "../../src/engine/trees";

describe("la cavitation s'installe vite et se dilue lentement", () => {
  const seuilSurvie = 0.5;

  it("un simple inconfort ne casse rien : il faut une tension extrême", () => {
    // Un arbre passe des étés à souffrir sans s'emboliser.
    expect(prochainDommageHydraulique(0, 0.45, seuilSurvie)).toBe(0);
    expect(prochainDommageHydraulique(0, 0.3, seuilSurvie)).toBe(0);
    // En dessous de la moitié du seuil de survie, en revanche, ça casse.
    expect(prochainDommageHydraulique(0, 0.05, seuilSurvie)).toBeGreaterThan(0);
  });

  it("quelques semaines de sécheresse sévère laissent une marque durable", () => {
    let dommage = 0;
    for (let i = 0; i < 8; i++) dommage = prochainDommageHydraulique(dommage, 0.02, seuilSurvie);
    expect(dommage).toBeGreaterThan(0.15);

    // Deux ans de conditions correctes : la marque s'estompe, elle ne disparaît
    // pas. L'arbre ne répare pas ses vaisseaux, il les dilue en poussant.
    let apres = dommage;
    for (let i = 0; i < 104; i++) apres = prochainDommageHydraulique(apres, 1, seuilSurvie);
    expect(apres).toBeLessThan(dommage);
    expect(apres).toBeGreaterThan(0);
  });

  it("la seconde sécheresse trouve un arbre déjà entamé", () => {
    // Premier épisode.
    let dommage = 0;
    for (let i = 0; i < 6; i++) dommage = prochainDommageHydraulique(dommage, 0.02, seuilSurvie);
    const apresPremier = dommage;
    // Une année de répit.
    for (let i = 0; i < 52; i++) dommage = prochainDommageHydraulique(dommage, 1, seuilSurvie);
    // Second épisode, identique au premier.
    for (let i = 0; i < 6; i++) dommage = prochainDommageHydraulique(dommage, 0.02, seuilSurvie);
    // L'arbre en sort plus abîmé qu'après le premier : c'est le cumul, et
    // c'est ce qui tue à la deuxième ou troisième sécheresse.
    expect(dommage).toBeGreaterThan(apresPremier * 1.4);
  });

  it("le dommage plafonne : un arbre à 85 % d'embolie est déjà mort debout", () => {
    let dommage = 0;
    for (let i = 0; i < 500; i++) dommage = prochainDommageHydraulique(dommage, 0, seuilSurvie);
    expect(dommage).toBeLessThanOrEqual(0.85);
  });
});
