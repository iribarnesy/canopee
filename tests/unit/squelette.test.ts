import { describe, expect, it } from "vitest";
import type { Branchement } from "../../src/render/arbres/fiche";
import {
  engendrer,
  hauteurAtteinteM,
  LONGUEUR_MIN_M,
  rameauxTerminaux,
  rayonAtteintM,
  rayonAuPiedM,
  SEGMENTS_MAX,
  type Sujet,
} from "../../src/render/arbres/squelette";

const feuillu: Branchement = {
  angleDeg: 42,
  divergenceDeg: 137,
  ratioLongueur: 0.72,
  dominance: 0.45,
  branchesParNoeud: 3,
  conicite: 0.82,
  tortuosite: 0.3,
};

const sujet = (p: Partial<Sujet> = {}): Sujet => ({
  id: 1234,
  hauteurM: 18,
  houppierRatio: 0.35,
  ...p,
});

describe("le squelette", () => {
  it("est déterministe : le même arbre rend exactement le même bois", () => {
    // `Math.random` est interdit dans `src/render` et le garde-fou le vérifie ;
    // ce test dit pourquoi cette interdiction a un sens.
    expect(engendrer(sujet(), feuillu)).toEqual(engendrer(sujet(), feuillu));
  });

  it("deux arbres d'id différent ne se ressemblent pas", () => {
    const a = engendrer(sujet({ id: 1 }), feuillu);
    const b = engendrer(sujet({ id: 2 }), feuillu);
    const bouts = (s: typeof a) =>
      s.map((x) => `${x.arrivee.x.toFixed(3)},${x.arrivee.z.toFixed(3)}`);
    expect(bouts(a)).not.toEqual(bouts(b));
  });

  it("ne dépasse JAMAIS le plafond de segments", () => {
    // La contrainte mesurée du lot L0 : la cuisson d'une silhouette passait de
    // 0,3 à 13,3 ms quand le compte explosait. Une fiche déréglée doit dégrader
    // l'arbre, pas geler l'image.
    const fou: Branchement = { ...feuillu, branchesParNoeud: 3, ratioLongueur: 0.99, dominance: 0 };
    for (const hauteurM of [5, 20, 40]) {
      expect(engendrer(sujet({ hauteurM }), fou).length).toBeLessThanOrEqual(SEGMENTS_MAX);
    }
  });

  it("le plafond coupe le DERNIER ORDRE, pas une branche au milieu", () => {
    // En profondeur, le plafond ferait un arbre manchot. En largeur, l'arbre
    // perd du détail partout à la fois. On le vérifie en comparant, à plafond
    // serré, la distribution des ordres : elle doit être tronquée par le haut
    // et complète en dessous.
    const petit = engendrer(sujet(), feuillu, 60);
    const ordres = new Set(petit.map((s) => s.ordre));
    const max = Math.max(...ordres);
    for (let o = 0; o <= max; o++) expect(ordres.has(o)).toBe(true);
    // Et l'arbre reste symétrique : aucun ordre n'a qu'un seul représentant
    // alors que le précédent en a beaucoup.
    expect(petit.filter((s) => s.ordre === max).length).toBeGreaterThan(1);
  });

  it("un arbre de plafond serré reste TERMINÉ : tous ses bouts portent du feuillage", () => {
    // Sans ça, l'arbre tronqué sortirait nu — le défaut exact que L0 a trouvé
    // en accrochant le feuillage au dernier ordre de récursion.
    const petit = engendrer(sujet(), feuillu, 60);
    const bouts = rameauxTerminaux(petit);
    expect(bouts.length).toBeGreaterThan(0);
    const ordreMax = Math.max(...petit.map((s) => s.ordre));
    expect(bouts.some((s) => s.ordre === ordreMax)).toBe(true);
  });

  it("le feuillage s'accroche aux rameaux SANS FILLE, à plusieurs ordres", () => {
    // La règle de L0 : « terminal » veut dire sans fille, pas « au dernier
    // ordre de récursion » — une branche latérale raccourcit plus vite que la
    // flèche et s'arrête bien avant elle. Mesuré sur un arbre de quatre mètres,
    // où c'est la LONGUEUR qui arrête la récursion : les bouts feuillus se
    // répartissent sur cinq ordres.
    const bouts = rameauxTerminaux(engendrer(sujet({ hauteurM: 4 }), feuillu));
    const ordres = new Set(bouts.map((s) => s.ordre));
    expect(ordres.size).toBeGreaterThan(3);
  });

  it("mais quand le PLAFOND tranche, il tranche à plat — et l'arbre reste feuillu", () => {
    // Sur un grand arbre, c'est le plafond de segments qui arrête la récursion,
    // et il abandonne un ordre entier : tous les bouts se retrouvent alors au
    // même ordre. C'est voulu — l'arbre perd du détail uniformément — et ça ne
    // le laisse pas nu, ce qui est la seule chose qui compte.
    const grand = engendrer(sujet({ hauteurM: 18 }), feuillu);
    const bouts = rameauxTerminaux(grand);
    expect(bouts.length).toBeGreaterThan(100);
    const ordreMax = Math.max(...grand.map((s) => s.ordre));
    expect(bouts.every((s) => s.ordre === ordreMax)).toBe(true);
  });

  it("aucun segment terminal n'a de segment qui parte de son bout", () => {
    const arbre = engendrer(sujet(), feuillu);
    const departs = new Set(
      arbre.map(
        (s) => `${s.depart.x.toFixed(6)}|${s.depart.y.toFixed(6)}|${s.depart.z.toFixed(6)}`,
      ),
    );
    for (const s of rameauxTerminaux(arbre)) {
      const cle = `${s.arrivee.x.toFixed(6)}|${s.arrivee.y.toFixed(6)}|${s.arrivee.z.toFixed(6)}`;
      expect(departs.has(cle)).toBe(false);
    }
  });

  it("s'arrête sur la LONGUEUR et non sur l'ordre", () => {
    const arbre = engendrer(sujet(), feuillu);
    for (const s of arbre) {
      if (!s.terminal) continue;
      const longueur = Math.hypot(
        s.arrivee.x - s.depart.x,
        s.arrivee.y - s.depart.y,
        s.arrivee.z - s.depart.z,
      );
      // Un rameau terminal est court : soit il a buté sur la longueur minimale,
      // soit il est au bout de la récursion.
      expect(longueur).toBeLessThan(4);
    }
  });

  it("atteint à peu près la hauteur demandée", () => {
    for (const hauteurM of [1, 6, 18, 32]) {
      const h = hauteurAtteinteM(engendrer(sujet({ hauteurM }), feuillu));
      expect(h).toBeGreaterThan(hauteurM * 0.55);
      expect(h).toBeLessThan(hauteurM * 1.35);
    }
  });

  it("un semis rend un arbre, pas un tableau vide", () => {
    const semis = engendrer(sujet({ hauteurM: 0.4 }), feuillu);
    expect(semis.length).toBeGreaterThan(1);
    expect(hauteurAtteinteM(semis)).toBeGreaterThan(0.1);
  });

  it("rend un tableau vide pour une hauteur nulle", () => {
    expect(engendrer(sujet({ hauteurM: 0 }), feuillu)).toHaveLength(0);
  });

  it("les stades sortent GRATUITEMENT : c'est le même squelette, déroulé moins loin", () => {
    // La promesse de D4. Un gaulis n'est pas un autre dessin, c'est un jeune
    // arbre — donc sa ramure doit GRANDIR de façon monotone avec la hauteur.
    //
    // Ce qu'on mesure est l'encombrement, pas le nombre de segments : celui-ci
    // n'est PAS monotone une fois le plafond atteint, et c'est normal. Un arbre
    // plus grand a des segments plus longs, donc il tient plus d'ordres avant la
    // longueur minimale, donc le plafond lui coupe un ordre entier là où un
    // arbre plus petit gardait le sien. Mesuré : 2 033 segments à douze mètres,
    // 1 094 à vingt-cinq. L'arbre n'est pas plus pauvre pour autant — il est
    // seulement moins subdivisé, ce qui est exactement ce que le plafond doit
    // faire.
    let hauteur = 0;
    let rayon = 0;
    for (const hauteurM of [0.5, 2, 5, 12, 25]) {
      const arbre = engendrer(sujet({ hauteurM }), feuillu);
      expect(arbre.length).toBeGreaterThan(3);
      expect(rameauxTerminaux(arbre).length).toBeGreaterThan(0);
      const h = hauteurAtteinteM(arbre);
      const r = rayonAtteintM(arbre);
      expect(h).toBeGreaterThan(hauteur);
      expect(r).toBeGreaterThan(rayon);
      hauteur = h;
      rayon = r;
    }
  });
});

describe("l'élagage et la trogne sont des COUPES dans le squelette", () => {
  it("un arbre élagué n'a aucune charpentière sous la bille", () => {
    const arbre = engendrer(sujet({ hauteurElagueeM: 8 }), feuillu);
    for (const s of arbre) {
      if (s.ordre === 0) continue;
      expect(s.depart.y).toBeGreaterThanOrEqual(8 - 1e-6);
    }
  });

  it("une trogne repart toute d'un même point, à la hauteur de sa tête", () => {
    const arbre = engendrer(sujet({ teteTrogneM: 2, hauteurM: 6 }), feuillu);
    const houppier = arbre.filter((s) => s.ordre >= 1);
    expect(houppier.length).toBeGreaterThan(0);
    const bas = Math.min(...houppier.map((s) => s.depart.y));
    expect(bas).toBeCloseTo(2, 2);
  });

  it("l'élagage ne raccourcit pas l'arbre", () => {
    const libre = hauteurAtteinteM(engendrer(sujet(), feuillu));
    const elague = hauteurAtteinteM(engendrer(sujet({ hauteurElagueeM: 8 }), feuillu));
    expect(elague).toBeGreaterThan(libre * 0.75);
  });
});

describe("les paramètres de branchement séparent bien les ports", () => {
  it("une forte dominance élance, une faible étale", () => {
    const elance = engendrer(sujet(), { ...feuillu, dominance: 0.8 });
    const etale = engendrer(sujet(), { ...feuillu, dominance: 0.1 });
    const elancement = (s: ReturnType<typeof engendrer>) =>
      hauteurAtteinteM(s) / (rayonAtteintM(s) || 1);
    expect(elancement(elance)).toBeGreaterThan(elancement(etale));
  });

  it("un grand angle d'insertion écarte davantage", () => {
    const serre = rayonAtteintM(engendrer(sujet(), { ...feuillu, angleDeg: 15 }));
    const ouvert = rayonAtteintM(engendrer(sujet(), { ...feuillu, angleDeg: 70 }));
    expect(ouvert).toBeGreaterThan(serre);
  });

  it("la tortuosité ne change pas le nombre de segments, seulement leur direction", () => {
    const droit = engendrer(sujet(), { ...feuillu, tortuosite: 0 });
    const tordu = engendrer(sujet(), { ...feuillu, tortuosite: 1 });
    expect(tordu.length).toBe(droit.length);
    expect(tordu.map((s) => s.arrivee.x)).not.toEqual(droit.map((s) => s.arrivee.x));
  });
});

describe("le fût", () => {
  it("s'affine vers le haut", () => {
    const fut = engendrer(sujet(), feuillu).find((s) => s.ordre === 0);
    expect(fut).toBeDefined();
    if (!fut) return;
    expect(fut.rayonArriveeM).toBeLessThan(fut.rayonDepartM);
  });

  it("a un rayon qui suit la hauteur, et jamais nul", () => {
    expect(rayonAuPiedM(20)).toBeGreaterThan(rayonAuPiedM(5));
    expect(rayonAuPiedM(0)).toBeGreaterThan(0);
  });

  it("part du sol", () => {
    const fut = engendrer(sujet(), feuillu).find((s) => s.ordre === 0);
    expect(fut?.depart).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe("la longueur minimale", () => {
  it("est respectée : aucun axe plus court ne se divise", () => {
    const arbre = engendrer(sujet(), feuillu);
    for (const s of arbre) {
      const longueur = Math.hypot(
        s.arrivee.x - s.depart.x,
        s.arrivee.y - s.depart.y,
        s.arrivee.z - s.depart.z,
      );
      if (longueur < LONGUEUR_MIN_M) expect(s.terminal).toBe(true);
    }
  });
});

describe("la cépée : plusieurs brins, pas de fût", () => {
  it("n'a AUCUN tronc : tous les brins partent du sol", () => {
    // « Une cépée n'est pas un petit arbre » (§5.4). Sans ce cas, un noisetier
    // et un pommier taillé en gobelet sortaient identiques au segment près —
    // mesuré, pas supposé.
    const cepee = engendrer(sujet({ hauteurM: 5, brins: 7 }), feuillu);
    const futs = cepee.filter((s) => s.ordre === 0);
    for (const f of futs) {
      const longueur = Math.hypot(
        f.arrivee.x - f.depart.x,
        f.arrivee.y - f.depart.y,
        f.arrivee.z - f.depart.z,
      );
      expect(longueur).toBeLessThan(0.05);
    }
  });

  it("part en autant de brins qu'annoncé", () => {
    for (const brins of [3, 7, 12]) {
      const cepee = engendrer(sujet({ hauteurM: 5, brins }), feuillu);
      expect(cepee.filter((s) => s.ordre === 1).length).toBe(brins);
    }
  });

  it("écarte ses brins : une cépée est plus large qu'un fût unique", () => {
    const seul = rayonAtteintM(engendrer(sujet({ hauteurM: 5 }), feuillu));
    const cepee = rayonAtteintM(engendrer(sujet({ hauteurM: 5, brins: 7 }), feuillu));
    expect(cepee).toBeGreaterThan(seul);
  });

  it("affine ses brins : sept brins ne font pas sept troncs", () => {
    const seul = engendrer(sujet({ hauteurM: 5 }), feuillu).find((s) => s.ordre === 1);
    const cepee = engendrer(sujet({ hauteurM: 5, brins: 7 }), feuillu).find((s) => s.ordre === 1);
    expect(cepee?.rayonDepartM ?? 1).toBeLessThan(seul?.rayonDepartM ?? 0);
  });

  it("reste déterministe", () => {
    expect(engendrer(sujet({ brins: 5 }), feuillu)).toEqual(
      engendrer(sujet({ brins: 5 }), feuillu),
    );
  });

  it("un brin unique redonne exactement l'arbre à fût", () => {
    expect(engendrer(sujet({ brins: 1 }), feuillu)).toEqual(engendrer(sujet(), feuillu));
  });
});

describe("la cime porte des feuilles", () => {
  it("le rameau le plus HAUT est terminal", () => {
    // Le défaut que ça corrige : le marquage se faisait pendant la récursion,
    // au moment où un axe engendrait des filles. Quand la boucle s'arrêtait
    // AVANT de poser ces filles — à l'ordre maximal — le dernier rang était
    // perdu et ses parents restaient marqués « a des filles ». La cime n'avait
    // plus de feuilles : mesuré sur un hêtre de seize mètres, les rameaux
    // feuillus s'arrêtaient à 12,5 m.
    for (const hauteurM of [3, 8, 16, 30]) {
      const arbre = engendrer(sujet({ hauteurM }), feuillu);
      const sommet = hauteurAtteinteM(arbre);
      const bouts = rameauxTerminaux(arbre);
      const plusHaut = Math.max(...bouts.map((s) => s.arrivee.y));
      expect(plusHaut, `${hauteurM} m`).toBeCloseTo(sommet, 6);
    }
  });

  it("atteint EXACTEMENT la hauteur demandée", () => {
    // La normalisation d'après coup : la chaîne apicale est une série
    // géométrique tronquée, donc sa somme n'atteint jamais sa limite. Sans
    // étirement, l'arbre s'arrêtait aux trois quarts et sortait en poteau.
    for (const hauteurM of [1, 4, 12, 28]) {
      expect(hauteurAtteinteM(engendrer(sujet({ hauteurM }), feuillu))).toBeCloseTo(hauteurM, 6);
    }
  });
});

describe("la flèche et les branches ne poussent pas pareil", () => {
  it("une latérale ne repart PAS comme un second tronc", () => {
    // Sans distinction, la fille apicale d'une latérale héritait du ratio de la
    // flèche : la latérale atteignait la longueur du tronc, et le houppier
    // s'écrasait en galette — 44 % des rameaux dans un dixième de sa hauteur.
    const arbre = engendrer(sujet({ hauteurM: 16 }), feuillu);
    const tronc = 16 * (1 - Math.min(0.8, 0.35 * 1.6));
    const bouts = rameauxTerminaux(arbre);
    const bandes = new Array(10).fill(0);
    for (const b of bouts) {
      const u = (b.arrivee.y - tronc) / (16 - tronc);
      const i = Math.min(9, Math.max(0, Math.floor(u * 10)));
      bandes[i]++;
    }
    // Aucune bande ne concentre la moitié du houppier.
    for (const n of bandes) expect(n / bouts.length).toBeLessThan(0.5);
    // Et le houppier occupe vraiment sa hauteur : les bandes hautes ne sont
    // pas vides.
    expect(bandes.slice(6).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  });
});

describe("le verticille : ce qui fait un conifère", () => {
  const conifere: Branchement = {
    angleDeg: 72,
    divergenceDeg: 90,
    ratioLongueur: 0.62,
    dominance: 0.74,
    branchesParNoeud: 3,
    conicite: 0.92,
    tortuosite: 0.05,
    verticille: true,
  };

  it("répartit les branches d'une couronne RÉGULIÈREMENT autour de l'axe", () => {
    // Un feuillu suit une divergence phyllotaxique et empile ses branches en
    // spirale ; un conifère en pose une couronne d'un coup. Sans ce cas, le pin
    // sylvestre sortait « comme un feuillu avec des blobs verts » — et le port
    // étagé de `port.ts` n'y changeait rien : la forme de l'enveloppe ne
    // remplace pas la structure de la ramure.
    const arbre = engendrer(sujet({ hauteurM: 16 }), conifere);
    // Les branches d'ordre 2 partant d'un même point : c'est une couronne.
    const parPoint = new Map<string, number[]>();
    for (const s of arbre) {
      if (s.ordre !== 2) continue;
      const cle = `${s.depart.x.toFixed(4)}|${s.depart.y.toFixed(4)}|${s.depart.z.toFixed(4)}`;
      const azimut = Math.atan2(s.arrivee.z - s.depart.z, s.arrivee.x - s.depart.x);
      parPoint.set(cle, [...(parPoint.get(cle) ?? []), azimut]);
    }
    const couronnes = [...parPoint.values()].filter((a) => a.length >= 2);
    expect(couronnes.length).toBeGreaterThan(0);
    // Dans une couronne, les branches ne sont pas toutes du même côté.
    for (const azimuts of couronnes) {
      const ecart = Math.max(...azimuts) - Math.min(...azimuts);
      expect(ecart).toBeGreaterThan(0.5);
    }
  });

  it("garde un axe DROIT : c'est la flèche d'un conifère", () => {
    // La flèche, c'est la chaîne qui reste sur l'axe : ses deux extrémités
    // sont près du centre. Les latérales, elles, s'en écartent dès leur
    // premier segment, et leurs propres filles peuvent redescendre — ce qui
    // est normal pour une branche et ne dit rien de la flèche.
    const arbre = engendrer(sujet({ hauteurM: 16 }), conifere);
    const fleche = arbre.filter(
      (s) =>
        s.ordre >= 1 &&
        Math.hypot(s.depart.x, s.depart.z) < 0.2 &&
        Math.hypot(s.arrivee.x, s.arrivee.z) < 0.2,
    );
    expect(fleche.length).toBeGreaterThan(2);
    for (const s of fleche) {
      expect(s.arrivee.y - s.depart.y).toBeGreaterThan(0);
    }
  });

  it("donne une silhouette différente du même arbre sans verticille", () => {
    // Mesuré sur les POSITIONS et non sur l'encombrement : les deux arbres
    // peuvent avoir par hasard le même rayon maximal — c'est arrivé, à seize
    // décimales — alors que leurs ramures n'ont rien à voir.
    const avec = engendrer(sujet({ hauteurM: 16 }), conifere);
    const sans = engendrer(sujet({ hauteurM: 16 }), { ...conifere, verticille: false });
    const positions = (a: typeof avec) => a.map((s) => `${s.arrivee.x.toFixed(4)}`).join(",");
    expect(positions(avec)).not.toBe(positions(sans));
  });

  it("reste déterministe", () => {
    expect(engendrer(sujet(), conifere)).toEqual(engendrer(sujet(), conifere));
  });
});
