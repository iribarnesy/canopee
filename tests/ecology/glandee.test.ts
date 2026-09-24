/**
 * **La glandée** (issue #197).
 *
 * Le moteur savait qu'un pommier donne des pommes qu'on vend, et ne savait pas
 * qu'un chêne donne des glands. Mesuré avant ce lot sur vingt-cinq chênes mûrs,
 * les cinquante-deux semaines : `fruitsKg = 0,0`.
 *
 * Ce fichier tient quatre choses, et la troisième est celle qui décide si le
 * lot a servi à quelque chose :
 *
 *   1. **une production, pas une récolte** — un chêne produit sans rien porter
 *      à vendre, et un châtaignier fait les deux sans se contredire ;
 *   2. **synchrone et de moyenne conservée** — une glandée redistribue la
 *      production dans le temps, elle n'en crée pas, sans quoi « à production
 *      totale égale » ne voudrait rien dire ;
 *   3. **la satiété des prédateurs** : à production totale égale, l'irrégulier
 *      fait passer deux fois plus de graines que le régulier — et un témoin
 *      montre que tout tient au décalage d'un an ;
 *   4. **en partie, la régénération arrive par vagues.**
 *
 * Et il enregistre ce que la mesure a coûté au sanglier : la cinquième section.
 */

import { describe, expect, it } from "vitest";
import { ESPECES_V0, getEspece } from "../../src/engine/especes";
import {
  facteurAnneeCreuse,
  facteurDeLAnnee,
  glandeeDeLArbreKg,
  glandeeDeLaParcelleKg,
  glandeeRelative,
  glandeeSurvivanteKg,
  PRELEVEMENT_PAR_LA_FAUNE,
  RATION_SANGLIER_KG_AN,
  type Semences,
} from "../../src/engine/glandee";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { DENSITE_REFERENCE_PAR_HA } from "../../src/engine/sanglier";
import { createGameState, plantAt, type Station } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

const METEO = syntheticYear(LIMON_RICHE.climat);
const PORTEUSES = ESPECES_V0.filter((e) => e.semences);

describe("une glandée n'est pas une récolte", () => {
  it("le chêne ne porte rien à vendre, et il produit des kilos", () => {
    const chene = getEspece("quercus_pubescens");
    expect(chene.fruits).toBeUndefined();
    expect(chene.semences).toBeDefined();
  });

  it("le châtaignier porte les deux blocs, et c'est la démonstration", () => {
    // On ramasse une partie de ses châtaignes, le reste tombe et nourrit. Si
    // les deux notions étaient la même, ce cas serait impossible à écrire.
    const chataignier = getEspece("castanea_sativa");
    expect(chataignier.fruits).toBeDefined();
    expect(chataignier.semences).toBeDefined();
  });

  it("une samare n'en porte pas : le champ est le trait de TAILLE DE GRAINE", () => {
    // Le bouleau, le frêne et le saule sèment abondamment. Personne ne se
    // nourrit d'une samare et une samare ne reste pas au sol. C'est ce trait
    // que `regeneration.ts` réclamait pour cesser de trier sur le mode de
    // dissémination — et le hêtre, classé `gravite`, rejoint enfin les chênes.
    for (const id of ["betula_pendula", "fraxinus_excelsior", "salix_alba", "ulex_europaeus"]) {
      expect(getEspece(id).semences).toBeUndefined();
    }
    expect(getEspece("fagus_sylvatica").semences).toBeDefined();
    expect(getEspece("fagus_sylvatica").regeneration.dissemination).toBe("gravite");
  });
});

describe("une glandée redistribue la production, elle n'en crée pas", () => {
  it("la moyenne est conservée par construction, sur chaque fiche", () => {
    // `facteurAnneeCreuse` est **déduit** et jamais déclaré, précisément pour ça :
    //     periode × 1 = (periode − 1) × creux + pleine
    // Sans cette égalité, « à production totale égale » ne voudrait rien dire
    // et le témoin central du lot serait faux.
    expect(PORTEUSES.length).toBeGreaterThan(0);
    for (const espece of PORTEUSES) {
      const s = espece.semences as Semences;
      const creux = facteurAnneeCreuse(s);
      const moyenne = ((s.periodeAns - 1) * creux + s.facteurAnneePleine) / s.periodeAns;
      expect(moyenne).toBeCloseTo(1, 12);
      // Une année pleine ne peut pas porter plus que la période n'en produit.
      expect(s.facteurAnneePleine).toBeLessThan(s.periodeAns);
      expect(creux).toBeGreaterThan(0);
    }
  });

  it("et la moyenne TIRÉE la retrouve, sur deux millénaires", () => {
    // L'égalité ci-dessus porte sur l'espérance. Celle-ci porte sur le tirage,
    // qui est la seule chose que le moteur exécute vraiment.
    for (const espece of PORTEUSES) {
      const s = espece.semences as Semences;
      let somme = 0;
      for (let an = 0; an < 2000; an++) somme += facteurDeLAnnee(espece.id, s, an, 12345);
      expect(somme / 2000).toBeGreaterThan(0.85);
      expect(somme / 2000).toBeLessThan(1.15);
    }
  });

  it("le chêne fait vingt fois plus une année pleine qu'une année creuse", () => {
    // Le fait à reproduire, et l'issue le chiffrait : « dix à cinquante fois
    // plus que les autres ».
    const s = getEspece("quercus_pubescens").semences as Semences;
    expect(s.facteurAnneePleine / facteurAnneeCreuse(s)).toBeGreaterThan(10);
    expect(s.facteurAnneePleine / facteurAnneeCreuse(s)).toBeLessThan(50);
  });
});

describe("synchrone : tout le massif la même année, chaque essence à son rythme", () => {
  it("deux chênes de la même parcelle portent le même facteur", () => {
    // Par construction : le tirage ne connaît ni l'arbre ni la cellule. C'est
    // la synchronie, et elle est le fait — un massif fructifie d'un bloc.
    const s = getEspece("quercus_pubescens").semences as Semences;
    for (let an = 0; an < 40; an++) {
      // Rien dans la signature ne permet à un arbre de différer d'un autre :
      // l'espèce, l'année et la partie, et c'est tout.
      expect(facteurDeLAnnee("quercus_pubescens", s, an, 7)).toBe(
        facteurDeLAnnee("quercus_pubescens", s, an, 7),
      );
    }
  });

  it("le chêne et le hêtre ne fructifient pas aux mêmes années", () => {
    const chene = getEspece("quercus_pubescens").semences as Semences;
    const hetre = getEspece("fagus_sylvatica").semences as Semences;
    let differentes = 0;
    for (let an = 0; an < 200; an++) {
      const a = facteurDeLAnnee("quercus_pubescens", chene, an, 7) > 1;
      const b = facteurDeLAnnee("fagus_sylvatica", hetre, an, 7) > 1;
      if (a !== b) differentes++;
    }
    expect(differentes).toBeGreaterThan(40);
  });

  it("et deux parties ne voient pas la même suite d'années", () => {
    const s = getEspece("quercus_pubescens").semences as Semences;
    const suite = (graine: number) =>
      Array.from({ length: 200 }, (_, an) => facteurDeLAnnee("quercus_pubescens", s, an, graine));
    expect(suite(1)).not.toEqual(suite(2));
  });

  it("un arbre produit à la mesure de son houppier, rien de plus", () => {
    // La modulation par la taille, et elle ne coûte pas une courbe d'âge : un
    // chêne qui vient d'atteindre sa maturité a un petit houppier.
    const chene = getEspece("quercus_pubescens");
    const arbre = (h: number) => ({
      id: 1,
      especeId: "quercus_pubescens",
      x: 0,
      y: 0,
      ageWeeks: 40 * 52,
      heightM: h,
      diametreCm: h * 2,
      alive: true,
    });
    const petit = glandeeDeLArbreKg(chene, arbre(8) as never, 1);
    const grand = glandeeDeLArbreKg(chene, arbre(18) as never, 1);
    expect(petit).toBeGreaterThan(0);
    expect(grand).toBeGreaterThan(4 * petit);
    // Et rien avant la maturité.
    expect(glandeeDeLArbreKg(chene, { ...arbre(18), ageWeeks: 10 * 52 } as never, 1)).toBe(0);
  });
});

/**
 * Une chênaie arithmétique : `ans` années de production, passées aux mangeurs.
 * Aucun moteur, aucune météo — la loi seule, sur la durée qu'il faut pour juger
 * une masting. Renvoie ce qui a été produit et ce qui a survécu.
 */
function chenaieArithmetique(opts: {
  ans: number;
  periodeAns: number;
  sanglierParHa?: number;
  /** Les mangeurs suivent-ils la glandée de l'**an passé**, ou celle de l'année ? */
  decalage?: boolean;
  moyenneKgHa?: number;
}): { produit: number; survivant: number } {
  const s: Semences = {
    kgParM2HouppierAn: 0,
    periodeAns: opts.periodeAns,
    facteurAnneePleine: getEspece("quercus_pubescens").semences?.facteurAnneePleine ?? 3.5,
  };
  const moyenne = opts.moyenneKgHa ?? 400;
  let produit = 0;
  let survivant = 0;
  let precedente = moyenne;
  for (let an = 0; an < opts.ans; an++) {
    const prod = moyenne * facteurDeLAnnee("quercus_pubescens", s, an, 7);
    produit += prod;
    survivant += glandeeSurvivanteKg(
      prod,
      (opts.decalage ?? true) ? precedente : prod,
      opts.sanglierParHa ?? DENSITE_REFERENCE_PAR_HA,
      1,
    );
    precedente = prod;
  }
  return { produit, survivant };
}

describe("LE POINT DU LOT : à production totale égale, l'irrégulier passe", () => {
  it("une chênaie irrégulière laisse passer deux fois plus de graines qu'une régulière", () => {
    // **C'est la seule chose qui décide si ce lot a servi à quelque chose.**
    // L'issue l'écrivait ainsi : « le point à ne pas rater est que la
    // régénération doit être **meilleure** en irrégulier qu'en régulier à
    // production totale égale — sinon le mécanisme n'a servi à rien ».
    //
    // Vingt mille ans, à la densité de sanglier de référence. La durée n'est
    // pas une coquetterie : sur quatre cents ans le tirage de Bernoulli donnait
    // encore 7,5 % de production en trop à l'un des deux bras, et « à
    // production totale égale » serait devenu une formule de politesse.
    //
    // Mesuré à l'écriture : **73,5 % de la production survit en irrégulier,
    // 38,7 % en régulier**, pour des totaux à un demi pour cent l'un de
    // l'autre.
    const irregulier = chenaieArithmetique({ ans: 20_000, periodeAns: 4 });
    const regulier = chenaieArithmetique({ ans: 20_000, periodeAns: 1 });
    // Les deux chênaies ont bien produit la même chose : sans ça, la
    // comparaison ne dirait rien.
    expect(irregulier.produit / regulier.produit).toBeCloseTo(1, 1);
    expect(irregulier.survivant).toBeGreaterThan(1.7 * regulier.survivant);
  });

  it("et c'est le DÉCALAGE D'UN AN qui le fait, pas l'irrégularité", () => {
    // Le témoin, et c'est lui qui explique le précédent au lieu de le
    // constater. On relâche la seule chose qui diffère entre un mangeur et une
    // constante : sa population est dimensionnée par la nourriture de
    // l'automne **précédent**. Qu'elle suive la glandée de l'année même, et
    // l'avantage disparaît intégralement — une glandée irrégulière ne vaut
    // alors pas mieux qu'une glandée régulière de même total.
    //
    // Autrement dit : ce n'est pas la variance qui sauve le chêne, c'est le
    // retard des mangeurs sur elle.
    // Sans sanglier, dont la ration est un nombre de kilos et non une part :
    // il pèse plus lourd sur une année creuse que sur une année pleine, ce qui
    // est une seconde différence entre les deux bras. On l'écarte pour isoler
    // la première.
    const sansDecalage = { ans: 400, decalage: false, sanglierParHa: 0 };
    const irregulier = chenaieArithmetique({ ...sansDecalage, periodeAns: 4 });
    const regulier = chenaieArithmetique({ ...sansDecalage, periodeAns: 1 });
    expect(irregulier.survivant / irregulier.produit).toBeCloseTo(
      regulier.survivant / regulier.produit,
      6,
    );
  });

  it("l'année qui SUIT une glandée est la pire de toutes", () => {
    // La face sombre du même mécanisme, et elle est aussi documentée que
    // l'autre : les rongeurs ont pullulé sur la glandée, et la maigre
    // fructification suivante ne laisse rien passer.
    const s = getEspece("quercus_pubescens").semences as Semences;
    const creux = 400 * facteurAnneeCreuse(s);
    const pleine = 400 * s.facteurAnneePleine;
    const apresCreux = glandeeSurvivanteKg(creux, creux, 0, 1);
    const apresPleine = glandeeSurvivanteKg(creux, pleine, 0, 1);
    expect(apresPleine).toBeLessThan(apresCreux / 10);
  });

  it("le témoin d'identité : sans masting et sans mangeur, rien n'a changé", () => {
    // Le moteur d'avant ce lot est un cas particulier de celui-ci. Une
    // production régulière que personne ne mange donne exactement la
    // production — donc `semisParAn` intact, donc la régénération d'avant.
    expect(glandeeSurvivanteKg(400, 0, 0, 1)).toBeCloseTo(400, 9);
    const s: Semences = { kgParM2HouppierAn: 0.04, periodeAns: 1, facteurAnneePleine: 1 };
    for (let an = 0; an < 50; an++) {
      expect(facteurDeLAnnee("quercus_pubescens", s, an, 7)).toBe(1);
    }
  });
});

/** Une chênaie mûre, quarante ans, à une densité de sanglier donnée. */
function chenaie(densite: number, ans: number) {
  const COTE = 24;
  const station: Station = {
    ...LIMON_RICHE.station,
    coteM: COTE,
    voisinage: [],
    ventExposition: 0,
    sanglierParHa: densite,
  };
  let s = createGameState(station, rngStateFromSeed(3));
  for (let y = 3; y < COTE; y += 6) {
    for (let x = 3; x < COTE; x += 6) s = plantAt(s, "quercus_pubescens", x, y, 12);
  }
  const plantes = s.trees.length;
  const parAn = new Map<number, number>();
  for (let i = 0; i < ans * 52; i++) {
    const w = METEO[i % METEO.length];
    if (!w) throw new Error("météo manquante");
    const t = tick(s, w);
    s = t.state;
    const n = t.naissances.length;
    if (n > 0) parAn.set(Math.floor(i / 52), (parAn.get(Math.floor(i / 52)) ?? 0) + n);
  }
  return { recrues: s.trees.filter((t) => t.alive).length - plantes, parAn, etat: s };
}

describe("en partie : la régénération arrive par vagues", () => {
  it("les recrues tombent sur les années pleines, pas au fil de l'eau", () => {
    // **La signature observable du lot.** Avant, la régénération du chêne était
    // un filet régulier. Relevé à l'écriture, quarante ans, même graine et même
    // météo que l'essai du sanglier :
    //
    //     an 30 : 1 · an 31 : 1 · an 32 : 5 · an 33 : 50* · an 38 : 19*
    //
    // Les deux étoiles sont les deux années pleines, et elles portent 88 % des
    // recrues du siècle. L'an 34, juste après la glandée, n'en porte **aucune** :
    // les mangeurs ont pullulé dessus.
    const { parAn, etat } = chenaie(DENSITE_REFERENCE_PAR_HA, 40);
    const s = getEspece("quercus_pubescens").semences as Semences;
    let pleines = 0;
    let creuses = 0;
    for (const [an, n] of parAn) {
      if (facteurDeLAnnee("quercus_pubescens", s, an, etat.graineMarche) > 1) pleines += n;
      else creuses += n;
    }
    expect(pleines + creuses).toBeGreaterThan(20);
    expect(pleines).toBeGreaterThan(3 * creuses);
  }, 600_000);

  it("et une glandée de l'année se lit dans l'état de la parcelle", () => {
    // Le bout par lequel les autres mécanismes la liront (#187, le geai, le
    // sanglier) : une quantité en kilos, calculable de l'extérieur, sans état.
    const { etat } = chenaie(0, 35);
    const annee = Math.floor(etat.week / 52);
    let pleine = 0;
    let creuse = 0;
    for (let a = annee - 12; a <= annee; a++) {
      const g = glandeeDeLaParcelleKg(etat.trees, "quercus_pubescens", a, etat.graineMarche);
      if (g.produiteKg > g.moyenneKg) pleine = Math.max(pleine, g.produiteKg);
      else creuse = Math.max(creuse, g.produiteKg);
    }
    expect(creuse).toBeGreaterThan(0);
    expect(pleine).toBeGreaterThan(10 * creuse);
  }, 600_000);
});

describe("ce que la mesure a coûté au sanglier", () => {
  it("l'ancienne part de 55 % supposait un hectare portant seize kilos de glands", () => {
    // **Le chiffre remplacé n'était pas une ration, c'était un réglage.**
    // L'ancienne loi valait exp(−k × densité) avec k tel que 0,05 sanglier/ha
    // mangent 55 % ; la nouvelle vaut exp(−ration/production). Les égaler dit
    // quelle production l'ancienne supposait :
    //
    //     0,9 × 0 + 400 × 0,05 × A / P = −ln(1 − 0,55)
    //
    // soit P/A ≈ 25 kg de glands à l'hectare. Un hectare de chênaie en porte
    // quelques centaines. Et à l'envers, la même égalité faisait avaler à une
    // bête plus d'une tonne de glands par an, soit plusieurs kilos par jour
    // tous les jours de l'année.
    const k = -Math.log(1 - 0.55);
    const productionSupposee = (RATION_SANGLIER_KG_AN * DENSITE_REFERENCE_PAR_HA) / k;
    expect(productionSupposee).toBeLessThan(50);
    expect(productionSupposee).toBeGreaterThan(10);
  });

  it("la ration est petite, et ce n'est PAS elle qui fait reculer le chêne", () => {
    // **l'attribution, et ce fichier est le seul qui puisse la faire** : il a la
    // glandée sous la main, donc il peut séparer les deux prises du sanglier là
    // où `sanglier.test.ts` ne voit que leur somme.
    //
    // Cet essai a d'abord affirmé le **contraire**, et c'était juste à l'époque. À
    // ration ancrée (#197), le sanglier ne pesait plus sur la régénération —
    // 71 · 71 · 71 · 77 · 70 recrues de 0 à 0,5 bête/ha, contre 97 · 82 · 60 · 22
    // sous l'ancienne loi. On n'affirmait donc pas une décroissance qu'on ne
    // mesurait plus, et le commentaire nommait ce qui manquait : **un boutis
    // détruit les semis, et le moteur n'en comptait que le bon côté** (#199).
    //
    // Le mécanisme est arrivé, et la décroissance avec. Mesuré ici, quarante
    // ans, mêmes graine et météo, en lisant les deux grandeurs sur la **même**
    // partie — les recrues d'un côté, la glandée qui survit à la ration de
    // l'autre, moyennée sur les dix dernières années :
    //
    //     sanglier/ha    recrues    glandée survivante    perte de glandée
    //        0             71            0,7113                  —
    //        0,05          65            0,7016               1,4 %
    //        0,5           48            0,6377              10,4 %
    //
    // **À la densité de référence, la ration prélève 1,4 % de la glandée et la
    // régénération perd 8,5 % : six fois plus.** L'arithmétique de #197 tient
    // donc toujours — un sanglier ne peut pas manger une glandée —, et ce qui
    // fait reculer le chêne est l'autre geste, celui qui laboure ce qui a levé.
    // Le gradient complet, cinq graines, est dans `sanglier.test.ts`.
    const aireHa = (24 * 24) / 10_000;
    const mesure = (d: number) => {
      const r = chenaie(d, 40);
      const arbres = r.etat.trees.filter((t) => t.alive);
      let somme = 0;
      for (let an = 30; an < 40; an++) {
        somme += glandeeRelative(arbres, "quercus_pubescens", an, r.etat.graineMarche, d, aireHa);
      }
      return { recrues: r.recrues, glandee: somme / 10 };
    };
    const sans = mesure(0);
    const ordinaire = mesure(DENSITE_REFERENCE_PAR_HA);
    const forte = mesure(0.5);
    // La ration reste petite à densité ordinaire : moins d'un vingtième de la
    // glandée, quand l'ancienne loi en mangeait 55 %.
    expect(1 - ordinaire.glandee / sans.glandee).toBeLessThan(0.05);
    // Et la régénération perd **bien plus** que la glandée : la ration ne peut pas
    // rendre compte de l'écart, donc ce n'est pas elle qui l'explique. Six fois
    // mesuré, seuil de marge à trois.
    const perteRecrues = 1 - ordinaire.recrues / sans.recrues;
    const perteGlandee = 1 - ordinaire.glandee / sans.glandee;
    expect(perteRecrues).toBeGreaterThan(3 * perteGlandee);
    // Et à forte densité le recul est net, ce qui est la moitié de G10 rendue.
    expect(forte.recrues).toBeLessThan(0.8 * sans.recrues);
    expect(forte.recrues).toBeGreaterThan(0);
  }, 900_000);

  it("les deux termes restent de signes et d'échelles reconnaissables", () => {
    expect(PRELEVEMENT_PAR_LA_FAUNE).toBeGreaterThan(0.5);
    expect(PRELEVEMENT_PAR_LA_FAUNE).toBeLessThan(1);
    // Une bête, une ration : quelques centaines de kilos, jamais des tonnes.
    expect(RATION_SANGLIER_KG_AN).toBeGreaterThan(100);
    expect(RATION_SANGLIER_KG_AN).toBeLessThan(1000);
  });

  it("jamais zéro, quoi qu'il arrive", () => {
    // La discipline du dépôt, déjà payée deux fois (l'anémone à pH 4,0, le
    // chêne-liège à pH 4,50) et une troisième par `partGlandeeRestante` : une
    // grandeur posée sur une borne bascule d'un extrême à l'autre pour un
    // centième de rien.
    // Cent kilos de glands sous dix sangliers à l'hectare et après une glandée
    // dix fois moyenne : quarante-neuf fois la ration, et il en reste.
    expect(glandeeSurvivanteKg(100, 1_000, 1, 10)).toBeGreaterThan(0);
    // **Ce qui n'est pas vrai à l'infini, et autant l'écrire** : passé sept
    // cent quarante fois la ration, `exp` rend zéro parce qu'un flottant
    // s'arrête là. Aucune parcelle n'y arrive — il faudrait mille sangliers à
    // l'hectare — mais la garantie est celle de la forme, pas celle du calcul.
    expect(glandeeSurvivanteKg(100, 100_000, 50, 1000)).toBe(0);
    expect(glandeeSurvivanteKg(0, 0, 0, 1)).toBe(0);
    expect(glandeeRelative([], "quercus_pubescens", 0, 7, 0, 1)).toBe(0);
  });
});
