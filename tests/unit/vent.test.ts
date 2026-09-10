/**
 * Le VENT de la semaine.
 *
 * **Ce que ces essais gardent avant tout : que le vent est de la MÉTÉO.** Il ne
 * dépend pas de la graine de la partie, il ne puise pas dans le flux principal
 * du PRNG, et sa force moyenne sur une année retombe sur `ventExposition` — la
 * grandeur que le moteur utilisait avant lui. Ces trois propriétés sont ce qui
 * permet d'ajouter un mécanisme à un moteur déjà calibré sans rebattre les
 * cartes de tout le monde.
 */

import { describe, expect, it } from "vitest";
import { serieMeteoPour } from "../../src/data/meteo";
import { indiceRisqueFeu } from "../../src/engine/feu";
import { serieToWeeks, syntheticYear, type WeekWeather } from "../../src/engine/meteo";
import { FRICHE_LIMON, LANDE_SECHE, VALLEE_ENGORGEE } from "../../src/engine/stations";
import {
  DISPERSION_DU_SECTEUR,
  entreAzimuts,
  graineDuVent,
  PLUIE_PERTURBEE_MM,
  PLUIE_SECHE_MM,
  ROSE_ATLANTIQUE,
  ROSE_MISTRAL,
  ROSE_TRAMONTANE,
  ventDeLaSemaine,
  zonalite,
} from "../../src/engine/vent";

const SEMAINE = (rainMm: number, tMax = 22): WeekWeather => ({
  tMean: tMax - 6,
  tMin: tMax - 10,
  tMax,
  rainMm,
  tMinAbsC: tMax - 13,
});

describe("zonalite", () => {
  it("sépare la semaine perturbée de la semaine sèche", () => {
    // La pluie est le meilleur marqueur de régime dont le moteur dispose : en
    // France, elle vient massivement des perturbations d'ouest.
    expect(zonalite(0)).toBe(0);
    expect(zonalite(PLUIE_SECHE_MM)).toBe(0);
    expect(zonalite(PLUIE_PERTURBEE_MM)).toBe(1);
    expect(zonalite(60)).toBe(1);
  });

  it("INTERPOLE au lieu de basculer", () => {
    // Une semaine à 8 mm n'est ni l'une ni l'autre, et la trancher ferait sauter
    // la direction du vent d'un secteur à l'autre une semaine sur deux.
    const milieu = (PLUIE_SECHE_MM + PLUIE_PERTURBEE_MM) / 2;
    expect(zonalite(milieu)).toBeCloseTo(0.5, 6);
    expect(zonalite(milieu - 2)).toBeLessThan(zonalite(milieu));
  });
});

describe("entreAzimuts", () => {
  it("prend le PLUS COURT chemin sur le cercle", () => {
    // Le détail compte : la moyenne arithmétique de 350° et 20° donne 185°,
    // soit le sud, alors que les deux secteurs sont au nord. Une rose de
    // mistral tombe exactement dans ce piège.
    expect(entreAzimuts(350, 20, 0.5)).toBeCloseTo(5, 6);
    expect(entreAzimuts(20, 350, 0.5)).toBeCloseTo(5, 6);
  });

  it("rend les bornes exactement", () => {
    expect(entreAzimuts(245, 65, 0)).toBeCloseTo(245, 6);
    expect(entreAzimuts(245, 65, 1)).toBeCloseTo(65, 6);
  });

  it("reste dans [0, 360[", () => {
    for (const part of [0, 0.25, 0.5, 0.75, 1]) {
      const a = entreAzimuts(350, 20, part);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(360);
    }
  });
});

describe("ventDeLaSemaine", () => {
  it("tourne du secteur SEC au secteur PERTURBÉ avec la pluie", () => {
    const sec = ventDeLaSemaine(ROSE_ATLANTIQUE, 1, 10, SEMAINE(0));
    const pluvieux = ventDeLaSemaine(ROSE_ATLANTIQUE, 1, 10, SEMAINE(40));
    // La dispersion résiduelle est la même (même semaine, même graine) : l'écart
    // entre les deux ne peut donc venir que du régime.
    const ecart = Math.abs(((pluvieux.deDeg - sec.deDeg + 540) % 360) - 180);
    expect(ecart).toBeGreaterThan(90);
  });

  it("souffle PLUS FORT en régime perturbé dans la France ordinaire", () => {
    const sec = ventDeLaSemaine(ROSE_ATLANTIQUE, 1, 10, SEMAINE(0));
    const pluvieux = ventDeLaSemaine(ROSE_ATLANTIQUE, 1, 10, SEMAINE(40));
    expect(pluvieux.force).toBeGreaterThan(sec.force);
  });

  it("INVERSE la règle sous mistral et tramontane : le vent de beau temps est le vent fort", () => {
    // C'est toute la différence entre une friche picarde et une garrigue, et
    // c'est celle qui décide si un été sec est dangereux ou seulement chaud.
    for (const rose of [ROSE_MISTRAL, ROSE_TRAMONTANE]) {
      const sec = ventDeLaSemaine(rose, 1, 10, SEMAINE(0));
      const pluvieux = ventDeLaSemaine(rose, 1, 10, SEMAINE(40));
      expect(sec.force).toBeGreaterThan(pluvieux.force);
      // et il vient du nord-ouest à nord, pas du sud-ouest
      expect(sec.deDeg > 260 || sec.deDeg < 40).toBe(true);
    }
  });

  it("met le vent de beau temps du mistral AU NORD, sans passer par le sud", () => {
    // Le piège de l'interpolation circulaire, vu sur une vraie rose : le
    // mistral va de 200° (perturbé) à 350° (sec), et une moyenne naïve
    // enverrait les semaines mêlées plein sud.
    const mele = ventDeLaSemaine(ROSE_MISTRAL, 1, 10, SEMAINE(8.5));
    // le secteur mêlé est entre 350 et 200 par le PLUS COURT chemin, donc
    // au-delà de 275° ou en dessous de 20° — jamais vers le sud
    expect(mele.deDeg > 250 || mele.deDeg < 30).toBe(true);
  });

  it("change l'ÉCHELLE avec l'exposition de la station", () => {
    // Un vallon abrité ne voit pas passer la tempête qui couche le plateau
    // d'à côté.
    const abrite = ventDeLaSemaine(ROSE_ATLANTIQUE, 0.2, 10, SEMAINE(30));
    const ouvert = ventDeLaSemaine(ROSE_ATLANTIQUE, 0.9, 10, SEMAINE(30));
    expect(ouvert.force).toBeGreaterThan(abrite.force * 3);
    // …mais pas la direction : l'abri ne tourne pas le vent
    expect(ouvert.deDeg).toBeCloseTo(abrite.deDeg, 6);
  });

  it("laisse la force DÉPASSER un pour un vent exceptionnel", () => {
    // Le premier jet la bornait à [0,1] : un mistral sur une vallée ouverte
    // saturait alors dans les deux régimes, et la signature de la rose
    // devenait invisible là où elle compte le plus. C'est à l'usage de borner.
    const mistral = ventDeLaSemaine(ROSE_MISTRAL, 0.9, 3, SEMAINE(0));
    expect(mistral.force).toBeGreaterThan(1);
    // …mais jamais négative, et l'usage borne : `indiceRisqueFeu` sature.
    for (const pluie of [0, 5, 15, 90]) {
      expect(ventDeLaSemaine(ROSE_ATLANTIQUE, 0.6, 3, SEMAINE(pluie)).force).toBeGreaterThan(0);
    }
    expect(indiceRisqueFeu(0.02, 33, 1, 5)).toBeCloseTo(indiceRisqueFeu(0.02, 33, 1, 1), 9);
  });

  it("ne se répète pas d'une année sur l'autre", () => {
    // La graine prend la semaine ABSOLUE : sinon le vent de la semaine 30 serait
    // le même tous les ans, et une partie de cinquante ans verrait cinquante
    // fois la même tempête au même jour.
    const meteo = SEMAINE(30);
    const a = ventDeLaSemaine(ROSE_ATLANTIQUE, 1, 30, meteo);
    const b = ventDeLaSemaine(ROSE_ATLANTIQUE, 1, 30 + 52, meteo);
    expect(a.deDeg).not.toBeCloseTo(b.deDeg, 3);
  });

  it("est REPRODUCTIBLE : même semaine, même météo, même vent", () => {
    const meteo = SEMAINE(12);
    expect(ventDeLaSemaine(ROSE_ATLANTIQUE, 0.7, 77, meteo)).toEqual(
      ventDeLaSemaine(ROSE_ATLANTIQUE, 0.7, 77, meteo),
    );
    // et la graine ne dépend PAS de la partie : c'est de la météo, et deux
    // parties qui traversent la même semaine voient passer la même dépression.
    expect(graineDuVent(77)).toBe(graineDuVent(77));
  });

  it("reste dans son secteur, à la dispersion près", () => {
    // Un vent rigoureusement constant serait le défaut inverse de celui qu'on
    // corrige — un panache qui pencherait toujours pareil se lit comme un
    // décor — mais la dominante doit rester lisible.
    let maxEcart = 0;
    for (let semaine = 0; semaine < 520; semaine++) {
      const v = ventDeLaSemaine(ROSE_ATLANTIQUE, 1, semaine, SEMAINE(40));
      const ecart = Math.abs(((v.deDeg - ROSE_ATLANTIQUE.perturbeDeg + 540) % 360) - 180);
      maxEcart = Math.max(maxEcart, ecart);
    }
    expect(maxEcart).toBeGreaterThan(5);
    expect(maxEcart).toBeLessThanOrEqual((DISPERSION_DU_SECTEUR * 180) / Math.PI + 1e-6);
  });

  it("convertit l'azimut météo dans le repère de la GRILLE", () => {
    // Le repère de la grille : +x = est, +y = nord, angle trigonométrique
    // depuis l'est. Un angle qui change de repère entre le moteur et le dessin
    // est un angle qu'on finit par appliquer à l'envers.
    const versRad = (deDeg: number) => Math.PI / 2 - ((deDeg + 180) * Math.PI) / 180;
    // vent d'ouest (270°) → souffle vers l'est → +x → angle 0
    expect(Math.cos(versRad(270))).toBeCloseTo(1, 6);
    expect(Math.sin(versRad(270))).toBeCloseTo(0, 6);
    // vent du sud (180°) → souffle vers le nord → +y → angle π/2
    expect(Math.cos(versRad(180))).toBeCloseTo(0, 6);
    expect(Math.sin(versRad(180))).toBeCloseTo(1, 6);
    // et la fonction applique bien cette conversion
    const v = ventDeLaSemaine(ROSE_ATLANTIQUE, 1, 5, SEMAINE(40));
    expect(Math.cos(v.versRad)).toBeCloseTo(Math.cos(versRad(v.deDeg)), 6);
    expect(Math.sin(v.versRad)).toBeCloseTo(Math.sin(versRad(v.deDeg)), 6);
  });
});

describe("la calibration : ajouter le vent ne déplace pas la climatologie", () => {
  it("la force MOYENNE d'une année retombe sur ventExposition", () => {
    // **C'est la contrainte qui rend le mécanisme ajoutable.** `indiceRisqueFeu`
    // utilisait `ventExposition` ; il utilise maintenant la force de la semaine.
    // Si la moyenne dérivait, la fréquence des incendies de chaque station
    // dériverait avec — et toute la calibration du feu serait à refaire.
    //
    // La propriété est gardée, pas les décimales : le nombre exact dépend de la
    // zonalité des séries, qui changera quand les séries changeront.
    for (const sc of [FRICHE_LIMON, LANDE_SECHE, VALLEE_ENGORGEE]) {
      const serie = serieMeteoPour(sc.station.id);
      if (!serie) continue;
      const semaines = serieToWeeks(serie);
      let somme = 0;
      for (let i = 0; i < semaines.length; i++) {
        const w = semaines[i];
        if (!w) continue;
        somme += ventDeLaSemaine(ROSE_ATLANTIQUE, sc.station.ventExposition, i, w).force;
      }
      const moyenne = somme / semaines.length;
      expect(Math.abs(moyenne - sc.station.ventExposition)).toBeLessThan(
        0.05 * sc.station.ventExposition,
      );
    }
  });

  it("marche aussi sur une année synthétique, qui n'a aucun aléa", () => {
    const semaines = syntheticYear(LANDE_SECHE.climat);
    let somme = 0;
    for (let i = 0; i < semaines.length; i++) {
      const w = semaines[i];
      if (!w) continue;
      somme += ventDeLaSemaine(ROSE_ATLANTIQUE, 0.6, i, w).force;
    }
    // Plus lâche que sur les séries réelles : une année synthétique est une
    // sinusoïde, sa zonalité n'a pas de raison de valoir celle d'un vrai climat.
    expect(somme / semaines.length).toBeGreaterThan(0.35);
    expect(somme / semaines.length).toBeLessThan(0.85);
  });

  it("concentre le risque de feu sur les semaines VENTÉES", () => {
    // Ce que le changement apporte : à sécheresse et combustible égaux, le
    // risque suit maintenant le vent du moment au lieu d'être étalé sur toutes
    // les semaines de l'année. C'est ce que le §3 des règles annonçait en
    // écrivant « vent (événements) ».
    const risque = (force: number) => indiceRisqueFeu(0.02, 33, 1, force);
    expect(risque(0.9)).toBeGreaterThan(risque(0.1) * 1.4);
    expect(risque(0)).toBeGreaterThan(0);
  });
});
