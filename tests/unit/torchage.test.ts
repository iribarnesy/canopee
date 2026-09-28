/**
 * Le **torchage** : un arbre que le front atteint (§6.4).
 *
 * **Ce que ces essais gardent : qu'un arbre ne s'embrase pas quand l'acte
 * commence, mais quand le feu arrive à son pied.** C'est la seule chose qui
 * distingue un torchage d'un clignotement décoratif — et c'est aussi ce qui
 * rend l'élagage lisible, puisqu'un fût nu ne flambe pas.
 *
 * Le second point gardé est plus discret et coûte plus cher : un arbre torché
 * doit partir **vivant**. L'instantané le décrit après l'incendie, tronc charbonné
 * sans feuilles ; une mise en scène qui partirait de là interpolerait du néant
 * vers le néant, et c'est exactement le défaut que les onze morts du §6.3
 * avaient sans qu'on l'ait vu.
 */

import { describe, expect, it } from "vitest";
import { propager, rangsDuFront } from "../../src/engine/feu";
import { rngStateFromSeed } from "../../src/engine/rng";
import { DEBOUT } from "../../src/render/temps/chute";
import {
  type ArbreQuiSeTorche,
  avancementDuTorchage,
  BRAISES_PAR_TORCHE,
  CHANDELLE_A,
  CHARBONNE_A,
  consomptionEnCours,
  FLAMMES_PAR_TORCHE,
  type FrontDIncendie,
  flammesDeTorche,
  TORCHAGE_EN_RANGS,
  TORCHES_MAX,
  teteDuFront,
  torchageEnCours,
  vivaciteDeLaTorche,
} from "../../src/render/temps/feu";
import { idDeLaTige } from "../../src/render/temps/geste";
import {
  type ArbreATorcher,
  etatDuTorchage,
  flammesDesTorches,
  futsConsumes,
  futsConsumesATorcher,
  indexerLesTorches,
  poseDuFutConsume,
} from "../../src/render/temps/lecteur";
import type { ArbreVivant } from "../../src/render/temps/mort";

const COTE = 40;

/** Un front produit par le **moteur**, comme dans `feu.test.ts`. */
function frontDuMoteur(): FrontDIncendie & { origine: number; rangDe: Map<number, number> } {
  const n = COTE * COTE;
  const parCellule = new Array<number>(n).fill(2);
  const origine = Math.floor(COTE / 2) * COTE + Math.floor(COTE / 2);
  const { brulees } = propager(origine, { parCellule, moyenne: 2 }, COTE, rngStateFromSeed(1234));
  const rangs = rangsDuFront(brulees, origine, COTE);
  const liste = [...brulees].sort((a, b) => (rangs.get(a) ?? 0) - (rangs.get(b) ?? 0));
  return {
    origine,
    brulees: liste,
    rangs: liste.map((c) => rangs.get(c) ?? 0),
    rangDe: rangs,
  };
}

const CHENE: ArbreQuiSeTorche = {
  id: 7,
  x: 20.5,
  y: 20.5,
  cellule: 20 * COTE + 20,
  hauteurM: 14,
  baseHouppierM: 5,
  rayonHouppierM: 3,
  rang: 12,
};

const VIVANT: ArbreVivant = {
  partFoliaire: 1,
  senescence: 0.1,
  vigueur: 0.9,
  dommageHydraulique: 0,
};

describe("avancementDuTorchage", () => {
  it("ne commence RIEN avant que le front n'arrive", () => {
    // C'est la propriété centrale : le rang de la cellule est l'horloge du
    // torchage. Un arbre qui s'embraserait au début de l'acte raconterait un
    // incendie instantané, c'est-à-dire pas un incendie.
    expect(avancementDuTorchage(0, 12)).toBeUndefined();
    expect(avancementDuTorchage(11.9, 12)).toBeUndefined();
    expect(avancementDuTorchage(12, 12)).toBeUndefined();
  });

  it("court sur TORCHAGE_EN_RANGS puis reste accompli", () => {
    expect(avancementDuTorchage(12 + TORCHAGE_EN_RANGS / 2, 12)).toBeCloseTo(0.5, 6);
    expect(avancementDuTorchage(12 + TORCHAGE_EN_RANGS, 12)).toBe(1);
    // Accompli le **reste** de l'acte : sans ça, un arbre brûlé reverdirait.
    expect(avancementDuTorchage(999, 12)).toBe(1);
  });

  it("dure plus longtemps que le front n'est profond", () => {
    // C'est ce qui fait qu'on voit des torches **derrière** la ligne de flammes —
    // une couronne met plus de temps à brûler que l'herbe sous elle.
    expect(TORCHAGE_EN_RANGS).toBeGreaterThan(3);
  });
});

describe("vivaciteDeLaTorche", () => {
  it("s'éteint quand il ne reste qu'une chandelle", () => {
    // Une chandelle qui flamberait encore à la fin de l'acte dirait que le feu
    // n'est pas passé.
    expect(vivaciteDeLaTorche(1)).toBe(0);
  });

  it("culmine APRÈS le début : il faut que le feu monte", () => {
    const v = [0.05, 0.2, 0.32, 0.6, 0.9].map(vivaciteDeLaTorche);
    const max = Math.max(...v);
    expect(v[2]).toBe(max);
    expect(v[0] ?? 0).toBeLessThan(max);
    expect(v[4] ?? 1).toBeLessThan(max);
  });
});

describe("torchageEnCours", () => {
  it("part VIVANT et finit en chandelle charbonnée", () => {
    const debut = torchageEnCours(VIVANT, 0.01);
    expect(debut.partFoliaire).toBeCloseTo(VIVANT.partFoliaire, 6);
    expect(debut.chandelle).toBe(false);
    expect(debut.brulee).toBe(false);
    const fin = torchageEnCours(VIVANT, 1);
    expect(fin.partFoliaire).toBeCloseTo(0, 6);
    expect(fin.chandelle).toBe(true);
    expect(fin.brulee).toBe(true);
  });

  it("NOIRCIT avant de devenir une chandelle", () => {
    // L'écorce noircit dès que la flamme la lèche ; il faut que la couronne
    // ait fini de brûler pour que ce soit un tronc mort sur pied. Entre les
    // deux, on voit un arbre noir qui a encore des feuilles.
    expect(CHARBONNE_A).toBeLessThan(CHANDELLE_A);
    const entre = torchageEnCours(VIVANT, (CHARBONNE_A + CHANDELLE_A) / 2);
    expect(entre.brulee).toBe(true);
    expect(entre.chandelle).toBe(false);
    expect(entre.partFoliaire).toBeGreaterThan(0);
  });

  it("ne fait bouger que TROIS grandeurs de classe", () => {
    // Chaque grandeur qui bouge multiplie les vignettes à cuire : la sénescence
    // et la cime sèche n'ont rien à dire sur un arbre qui brûle, et un feuillage
    // brûlé ne jaunit pas — il noircit, et c'est `brulee` qui le dit.
    for (const u of [0.1, 0.4, 0.8, 1]) {
      const e = torchageEnCours(VIVANT, u);
      expect(e.senescence).toBe(VIVANT.senescence);
      expect(e.dommageHydraulique).toBe(VIVANT.dommageHydraulique);
      expect(e.opacite).toBe(1);
      expect(e.hauteur).toBe(1);
    }
  });

  it("QUANTIFIE son avancement : une classe de vignette est un cache", () => {
    // La leçon de `mort.ts`, payée une fois : une grandeur continue dans une
    // clé de cache est un cache qui ne sert à rien.
    const parts = new Set<number>();
    for (let u = 0; u <= 1.0001; u += 0.01) parts.add(torchageEnCours(VIVANT, u).partFoliaire);
    expect(parts.size).toBeLessThanOrEqual(5);
  });
});

describe("flammesDeTorche", () => {
  it("ne pose RIEN sur une chandelle éteinte", () => {
    expect(flammesDeTorche(CHENE, 1, 0)).toEqual([]);
  });

  it("flambe DANS le houppier, jamais dans le fût nu", () => {
    // C'est la pédagogie de l'élagage : un fût nu de cinq mètres ne s'embrase
    // pas, et ça doit se voir sur l'image et non seulement dans les chiffres.
    for (const p of flammesDeTorche(CHENE, 0.3, 120)) {
      if (p.forme !== "flamme") continue;
      expect(p.hM).toBeGreaterThanOrEqual(CHENE.baseHouppierM - 1e-9);
      expect(p.hM).toBeLessThanOrEqual(CHENE.hauteurM);
    }
  });

  it("lâche des braises AU-DESSUS de la cime : « les particules montent »", () => {
    const braises = flammesDeTorche(CHENE, 0.3, 120).filter((p) => p.forme === "braise");
    expect(braises.length).toBe(BRAISES_PAR_TORCHE);
    expect(Math.max(...braises.map((b) => b.hM))).toBeGreaterThan(CHENE.hauteurM * 0.6);
  });

  it("pose ses particules sur la CELLULE de l'arbre", () => {
    // C'est elle qui donne l'altitude du sol : une couronne qui flamberait à
    // l'altitude d'ailleurs flotterait au-dessus d'une butte.
    for (const p of flammesDeTorche(CHENE, 0.3, 120)) expect(p.cellule).toBe(CHENE.cellule);
  });

  it("est REPRODUCTIBLE et bat dans le temps", () => {
    expect(flammesDeTorche(CHENE, 0.3, 120)).toEqual(flammesDeTorche(CHENE, 0.3, 120));
    expect(flammesDeTorche(CHENE, 0.3, 120)).not.toEqual(flammesDeTorche(CHENE, 0.3, 400));
  });

  it("échelonne ses flammes sur l'arbre, pas sur une taille fixe", () => {
    // Un semis de cinquante centimètres et un chêne de quatorze mètres ne
    // brûlent pas de la même taille de flamme.
    const semis: ArbreQuiSeTorche = {
      ...CHENE,
      hauteurM: 0.6,
      baseHouppierM: 0,
      rayonHouppierM: 0.3,
    };
    const grand = Math.max(...flammesDeTorche(CHENE, 0.32, 0).map((p) => p.hauteurM));
    const petit = Math.max(...flammesDeTorche(semis, 0.32, 0).map((p) => p.hauteurM));
    expect(grand).toBeGreaterThan(petit * 3);
  });
});

describe("indexerLesTorches et le canal de la mise en scène", () => {
  const front = frontDuMoteur();
  const acte = {
    debutMs: 0,
    dureeMs: 1000,
    // Bloquant, comme tout ce qui vient du journal (#163).
    bloquant: true,
    sujet: {
      quoi: "feu" as const,
      origine: front.origine,
      brulees: front.brulees as number[],
      rangs: front.rangs as number[],
      charges: (front.brulees as number[]).map(() => 1.2),
    },
  };
  const trouve = { acte, origine: front.origine, feu: front as FrontDIncendie };

  /** Deux arbres : un dans le brûlé, un hors du brûlé. */
  const candidats: ArbreATorcher[] = [
    {
      // Décalé de l'origine **exprès** : posé dessus, son rang vaut zéro et il
      // flambe dès la première image, ce qui rend l'essai du « rien avant que
      // le front n'arrive » vide de sens. L'essai l'a attrapé.
      id: 1,
      x: 26.5,
      y: 23.5,
      hauteurM: 12,
      baseHouppierM: 4,
      rayonHouppierM: 2.5,
      avantLeFeu: VIVANT,
    },
    {
      id: 2,
      x: 0.5,
      y: 0.5,
      hauteurM: 12,
      baseHouppierM: 4,
      rayonHouppierM: 2.5,
      avantLeFeu: VIVANT,
    },
  ];

  it("donne à chaque arbre le RANG du front sur sa cellule", () => {
    const index = indexerLesTorches(trouve, candidats, COTE);
    const un = index.arbres.get(1);
    expect(un).toBeDefined();
    expect(un?.torche.rang).toBe(front.rangDe.get(23 * COTE + 26));
  });

  it("ÉCARTE un arbre dont la cellule n'a pas brûlé", () => {
    // Un instantané qui décrirait un arbre brûlé hors du front est un
    // instantané dont on ne peut rien tirer ; le placer quelque part serait
    // pire que de l'ignorer.
    const petit = { brulees: [23 * COTE + 26], rangs: [0], charges: [1.2] };
    const index = indexerLesTorches({ ...trouve, feu: petit }, candidats, COTE);
    expect(index.arbres.has(1)).toBe(true);
    expect(index.arbres.has(2)).toBe(false);
  });

  it("rend un index vide sans incendie, et sans allouer", () => {
    expect(indexerLesTorches(undefined, candidats, COTE).arbres.size).toBe(0);
    expect(indexerLesTorches(undefined, candidats, COTE)).toBe(indexerLesTorches(trouve, [], COTE));
  });

  it("n'anime RIEN avant que le front n'atteigne l'arbre", () => {
    const index = indexerLesTorches(trouve, candidats, COTE);
    const rang = index.arbres.get(1)?.torche.rang ?? 0;
    expect(rang).toBeGreaterThan(0);
    // On cherche l'instant où la tête du front atteint tout juste ce rang.
    const avant = (rang * 0.5) / teteDuFront(front, 1);
    expect(etatDuTorchage(index, avant * acte.dureeMs, 1)).toBeUndefined();
    expect(
      flammesDesTorches(index, avant * acte.dureeMs).filter((p) => p.cellule === 20 * COTE + 20),
    ).toEqual([]);
  });

  it("finit accompli à la fin de l'acte, et le reste après", () => {
    const index = indexerLesTorches(trouve, candidats, COTE);
    const fin = etatDuTorchage(index, acte.dureeMs, 1);
    expect(fin?.chandelle).toBe(true);
    expect(fin?.brulee).toBe(true);
    expect(etatDuTorchage(index, acte.dureeMs * 10, 1)?.chandelle).toBe(true);
    // et plus une flamme : l'acte est passé
    expect(flammesDesTorches(index, acte.dureeMs * 10)).toEqual([]);
  });

  it("PLAFONNE le nombre de couronnes qui flambent en même temps", () => {
    // Mesuré : la friche de dix-huit ans perd 2 751 tiges dans le même
    // incendie. Un feu qui traverse un peuplement dense en embraserait plus
    // qu'on ne peut poser.
    const foule: ArbreATorcher[] = (front.brulees as number[]).map((cellule, i) => ({
      id: 1000 + i,
      x: (cellule % COTE) + 0.5,
      y: Math.floor(cellule / COTE) + 0.5,
      hauteurM: 10,
      baseHouppierM: 3,
      rayonHouppierM: 2,
      avantLeFeu: VIVANT,
    }));
    const index = indexerLesTorches(trouve, foule, COTE);
    expect(index.arbres.size).toBeGreaterThan(TORCHES_MAX);
    let vues = 0;
    for (let t = 0; t <= 1; t += 0.05) {
      const p = flammesDesTorches(index, t * acte.dureeMs);
      const torches = new Set(p.map((q) => q.cellule)).size;
      expect(p.length).toBeLessThanOrEqual(TORCHES_MAX * (FLAMMES_PAR_TORCHE + BRAISES_PAR_TORCHE));
      vues = Math.max(vues, torches);
    }
    // et l'essai ne vaut que si le plafond a vraiment servi
    expect(vues).toBeGreaterThan(1);
  });
});

describe("le fût que le feu consume (#246)", () => {
  const front = frontDuMoteur();
  const acte = {
    debutMs: 0,
    dureeMs: 1000,
    bloquant: true,
    sujet: {
      quoi: "feu" as const,
      origine: front.origine,
      brulees: front.brulees as number[],
      rangs: front.rangs as number[],
      charges: (front.brulees as number[]).map(() => 1.2),
    },
  };
  const trouve = { acte, origine: front.origine, feu: front as FrontDIncendie };
  /** Ce que le moteur rapporte d'une chandelle consumée depuis #246. */
  const incendie = {
    chandellesConsumees: [{ id: 7, x: 26.5, y: 23.5, especeId: "pinus_sylvestris", hauteurM: 9 }],
  } as unknown as Parameters<typeof futsConsumes>[0];

  it("repose le fût là où le moteur dit qu'il était, sous un identifiant de tige", () => {
    // Sans position, rien ne se pose : c'est tout l'objet de l'aller-retour
    // avec le moteur. L'identifiant est négatif parce que le fût n'est plus
    // dans `state.trees` — il partage le chemin des tiges abattues.
    const [tige] = futsConsumes(incendie);
    expect(tige?.id).toBe(idDeLaTige(7));
    expect([tige?.x, tige?.y]).toEqual([26.5, 23.5]);
    expect(tige?.especeId).toBe("pinus_sylvestris");
    expect(tige?.heightM).toBe(9);
    expect(tige?.chandelle).toBe(true);
  });

  it("brûle sous le MÊME identifiant que celui sous lequel il se dessine", () => {
    // L'invariant qui fait tenir l'ensemble : l'index des torches est consulté
    // par l'identifiant de pose. Deux numérotations, et le fût serait posé
    // sans jamais flamber.
    const poses = futsConsumes(incendie).map((t) => t.id);
    const torches = futsConsumesATorcher(incendie).map((t) => t.id);
    expect(torches).toEqual(poses);
  });

  it("reste DEBOUT et entier tant que le front ne l'a pas atteint", () => {
    // Le défaut rapporté en jouant : « l'incendie, je n'ai rien vu, tout a
    // disparu d'un coup » — 1 433 fûts escamotés entre deux images.
    const index = indexerLesTorches(trouve, futsConsumesATorcher(incendie), COTE);
    expect(poseDuFutConsume(index, 0, idDeLaTige(7))).toBe(DEBOUT);
  });

  it("s'efface pendant qu'il flambe, et il n'en reste rien", () => {
    const index = indexerLesTorches(trouve, futsConsumesATorcher(incendie), COTE);
    const opacites = [0.25, 0.5, 0.75, 1].map(
      (part) => poseDuFutConsume(index, acte.dureeMs * part, idDeLaTige(7)).opacite,
    );
    // Décroissante, et nulle au bout : le moteur dit qu'elle a été consumée.
    for (let i = 1; i < opacites.length; i++) {
      expect(opacites[i]).toBeLessThanOrEqual(opacites[i - 1] ?? 1);
    }
    expect(opacites[opacites.length - 1]).toBe(0);
  });

  it("n'efface pas un arbre que le feu laisse en chandelle", () => {
    // Un arbre vivant que le front torche RESTE sur la parcelle, noir :
    // l'instantané suivant le montre. Effacer les deux serait reprendre d'une
    // main ce que l'issue corrige de l'autre.
    const vivant: ArbreATorcher = {
      id: 1,
      x: 26.5,
      y: 23.5,
      hauteurM: 12,
      baseHouppierM: 4,
      rayonHouppierM: 2.5,
      avantLeFeu: VIVANT,
    };
    const index = indexerLesTorches(trouve, [vivant], COTE);
    expect(poseDuFutConsume(index, acte.dureeMs, 1)).toBe(DEBOUT);
    expect(etatDuTorchage(index, acte.dureeMs, 1)?.opacite).toBe(1);
  });

  it("le fût consumé n'a pas de feuillage à perdre, et il est chandelle d'emblée", () => {
    const etat = consomptionEnCours(0);
    expect(etat.partFoliaire).toBe(0);
    expect(etat.chandelle).toBe(true);
    expect(etat.opacite).toBe(1);
    expect(consomptionEnCours(1).opacite).toBe(0);
  });
});
