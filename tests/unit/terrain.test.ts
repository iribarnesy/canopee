/**
 * La couche de sol : découpage en morceaux, invalidation, budget de cuisson.
 *
 * Ce qui est vraiment testé ici, c'est **le cache**. Deux façons de le rater, et
 * elles sont symétriques : s'il invalide trop, on recuit dix mille tuiles par
 * semaine et le jeu rame à ×512 ; s'il invalide trop peu, l'écran garde une
 * image périmée et le sol ne réagit plus à la partie. Les deux se testent, et
 * aucune ne se voit dans une capture.
 *
 * Le canvas est bouchonné : `cuireMorceau` reçoit sa fabrique en paramètre
 * exprès, pour que ce module reste testable sans DOM.
 */

import { describe, expect, it } from "vitest";
import {
  celluleVisibles,
  tournerVue,
  type Vue,
  vueInitiale,
  zoomer,
} from "../../src/render/camera";
import {
  COTE_MORCEAU_M,
  cotePavage,
  cuireMorceau,
  type DonneesSol,
  liserePourZoom,
  morceauxDeLEmprise,
  morceauxParCote,
  signatureMorceau,
  Terrain,
} from "../../src/render/couches/terrain";
import { LITIERE_PLEINE_CG, NIVEAUX } from "../../src/render/palette";
import { profondeur } from "../../src/render/projection";

const COTE = 48; // trois morceaux de 16 m par côté

/** Un contexte 2d bouchonné qui compte ce qu'on lui demande. */
function fabriqueBouchon() {
  const compte = { canvas: 0, remplissages: 0, traits: 0 };
  const fabriquer = (largeur: number, hauteur: number) => {
    compte.canvas++;
    const ctx = {
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 0,
      beginPath() {},
      moveTo() {},
      lineTo() {},
      closePath() {},
      fill() {
        compte.remplissages++;
      },
      stroke() {
        compte.traits++;
      },
    };
    return {
      width: largeur,
      height: hauteur,
      getContext: () => ctx,
    } as unknown as HTMLCanvasElement;
  };
  return { fabriquer, compte };
}

function solPlat(patch: Partial<DonneesSol> = {}): DonneesSol {
  const n = COTE * COTE;
  return {
    coteM: COTE,
    altitudesM: new Array(n).fill(0),
    humidite: new Float32Array(n).fill(0.5),
    herbe: new Float32Array(n).fill(0.6),
    herbeBiomasse: new Float32Array(n).fill(0.3),
    litiereCG: new Float32Array(n).fill(10),
    ...patch,
  };
}

function vue(): Vue {
  return vueInitiale(COTE, 1200, 700);
}

describe("le découpage en morceaux", () => {
  it("couvre la parcelle, bord compris, même si le côté n'est pas un multiple", () => {
    expect(morceauxParCote(48)).toBe(3);
    expect(morceauxParCote(50)).toBe(4); // le reste de 2 m a droit à son morceau
    expect(morceauxParCote(100)).toBe(Math.ceil(100 / COTE_MORCEAU_M));
  });

  it("rend les morceaux de l'emprise dans l'ordre du peintre, du fond vers l'avant", () => {
    const v = vue();
    const emprise = celluleVisibles(v);
    expect(emprise).toBeDefined();
    if (!emprise) return;
    const liste = morceauxDeLEmprise(emprise, v);
    expect(liste.length).toBe(9);
    for (let i = 1; i < liste.length; i++) {
      expect(liste[i]?.profondeur).toBeGreaterThanOrEqual(liste[i - 1]?.profondeur ?? 0);
    }
  });

  it("l'ordre suit la caméra : il change au quart de tour", () => {
    const v = vue();
    const emprise = celluleVisibles(v);
    if (!emprise) throw new Error("emprise");
    const nord = morceauxDeLEmprise(emprise, v).map((m) => `${m.ix},${m.iy}`);
    const tourne = tournerVue(v, 1);
    const est = morceauxDeLEmprise(emprise, tourne).map((m) => `${m.ix},${m.iy}`);
    expect(est).not.toEqual(nord);
    // Et le premier posé est bien le plus lointain dans le NOUVEAU repère.
    const premier = morceauxDeLEmprise(emprise, tourne)[0];
    if (!premier) throw new Error("vide");
    const cx = premier.ix * COTE_MORCEAU_M + COTE_MORCEAU_M / 2;
    const cy = premier.iy * COTE_MORCEAU_M + COTE_MORCEAU_M / 2;
    expect(premier.profondeur).toBeCloseTo(profondeur(cx, cy, tourne.cam), 10);
  });
});

describe("la signature d'un morceau, qui décide de tout recuire ou de rien", () => {
  it("ignore une variation qui ne change pas de palier — la propriété qui compte", () => {
    // Un tick change l'humidité de tout le monde d'un centième. Si la
    // signature bougeait pour ça, le cache serait inutile et le jeu ramerait à
    // grande vitesse.
    const a = solPlat();
    const petitEcart = 0.4 / NIVEAUX; // reste dans la même tranche
    const b = solPlat({ humidite: new Float32Array(COTE * COTE).fill(0.5 + petitEcart) });
    expect(signatureMorceau(b, 1, 1, 10)).toBe(signatureMorceau(a, 1, 1, 10));
  });

  it("change dès qu'une SEULE cellule change de palier", () => {
    const a = solPlat();
    const humidite = new Float32Array(a.humidite);
    humidite[17 * COTE + 20] = 0.95;
    const b = solPlat({ humidite });
    expect(signatureMorceau(b, 1, 1, 10)).not.toBe(signatureMorceau(a, 1, 1, 10));
  });

  it("ne regarde que SON morceau : une cellule d'à côté ne l'invalide pas", () => {
    const a = solPlat();
    const litiereCG = new Float32Array(a.litiereCG);
    litiereCG[2 * COTE + 2] = LITIERE_PLEINE_CG; // morceau (0,0)
    const b = solPlat({ litiereCG });
    expect(signatureMorceau(b, 1, 1, 10)).toBe(signatureMorceau(a, 1, 1, 10));
    expect(signatureMorceau(b, 0, 0, 10)).not.toBe(signatureMorceau(a, 0, 0, 10));
  });

  it("suit la saison : la même parcelle ne se peint pas pareil en mai et en novembre", () => {
    const a = solPlat();
    expect(signatureMorceau(a, 1, 1, 18)).not.toBe(signatureMorceau(a, 1, 1, 45));
  });
});

describe("le pavage : le niveau de détail du SOL", () => {
  it("agrège quand la tuile est petite, et rend la cellule quand on zoome", () => {
    // La leçon d'une capture : à huit pixels par mètre, colorier chaque mètre
    // carré séparément donne un motif de camouflage. On agrège donc.
    expect(cotePavage(0.25)).toBe(8); // très dézoomé : 8 m par pavé
    expect(cotePavage(1)).toBe(2);
    expect(cotePavage(4)).toBe(1); // rapproché : la cellule redevient l'unité
    expect(cotePavage(20)).toBe(1);
  });

  it("ne rend que des puissances de deux, pour ne pas faire scintiller le zoom", () => {
    for (let zoom = 0.1; zoom < 30; zoom += 0.05) {
      const k = cotePavage(zoom);
      expect(Number.isInteger(Math.log2(k))).toBe(true);
      expect(k).toBeGreaterThanOrEqual(1);
      expect(k).toBeLessThanOrEqual(8);
    }
  });

  it("dessine bien moins de formes quand il agrège — et c'est gratuit en plus", () => {
    const large = fabriqueBouchon();
    const tresLarge: Vue = { ...vue(), cam: { ...vue().cam, zoom: 0.25 } };
    cuireMorceau(solPlat(), 1, 1, 20, tresLarge, large.fabriquer);
    // Un pavé de 8 m : quatre formes au lieu de 256.
    expect(large.compte.remplissages).toBe(4);
  });
});

describe("le liseré s'efface au loin", () => {
  it("disparaît quand la tuile devient une trame, et revient au zoom", () => {
    // Correction venue d'une capture, pas d'un chiffre : à la parcelle entière,
    // le quadrillage fait lire un champ labouré.
    expect(liserePourZoom(0.4)).toBe(false);
    expect(liserePourZoom(4)).toBe(true);
  });
});

describe("la cuisson", () => {
  it("dimensionne l'image sur l'emprise RÉELLE du morceau, flancs compris", () => {
    // Le bug de L0 qu'on ne refait pas : une image taillée sur la hauteur
    // nominale coupait les objets. Ici on vérifie qu'un morceau en relief
    // demande une image plus haute qu'un morceau plat.
    const { fabriquer } = fabriqueBouchon();
    const v = vue();
    const plat = cuireMorceau(solPlat(), 1, 1, 20, v, fabriquer);
    const altitudesM = new Array(COTE * COTE)
      .fill(0)
      .map((_, i) => (Math.floor(i / COTE) % 8) * 1.5);
    const bosselé = cuireMorceau(solPlat({ altitudesM }), 1, 1, 20, v, fabriquer);
    expect(bosselé.image.height).toBeGreaterThan(plat.image.height);
  });

  it("remplit une forme par cellule, plus les flancs là où ça descend", () => {
    const { fabriquer, compte } = fabriqueBouchon();
    const v = vue();
    cuireMorceau(solPlat(), 1, 1, 20, v, fabriquer);
    // Terrain plat : une surface par cellule, aucun flanc.
    expect(compte.remplissages).toBe(COTE_MORCEAU_M * COTE_MORCEAU_M);
  });

  it("ne trace pas le liseré au zoom d'ensemble, et le trace au zoom rapproché", () => {
    const large = fabriqueBouchon();
    cuireMorceau(solPlat(), 1, 1, 20, vue(), large.fabriquer);
    expect(large.compte.traits).toBe(0);

    const proche = fabriqueBouchon();
    const v = zoomer(vue(), 20, { sx: 600, sy: 350 });
    cuireMorceau(solPlat(), 1, 1, 20, v, proche.fabriquer);
    expect(proche.compte.traits).toBeGreaterThan(0);
  });
});

describe("le cache de terrain", () => {
  it("cuit tout au premier tour, puis plus rien si rien ne change", () => {
    const { fabriquer } = fabriqueBouchon();
    const terrain = new Terrain(fabriquer, COTE);
    const sol = solPlat();
    const v = vue();

    expect(terrain.rafraichir(sol, 20, v)).toBe(9);
    // Le budget par image est la leçon de l'atlas de L0 : jamais tout d'un coup.
    expect(terrain.cuire(sol, 20, v, 4)).toBe(4);
    expect(terrain.enRetard).toBe(5);
    terrain.cuire(sol, 20, v, 99);
    expect(terrain.enRetard).toBe(0);

    // Deuxième semaine, mêmes paliers : rien à faire du tout.
    expect(terrain.rafraichir(sol, 20, v)).toBe(0);
  });

  it("ne recuit QUE le morceau touché quand une cellule change de palier", () => {
    const { fabriquer } = fabriqueBouchon();
    const terrain = new Terrain(fabriquer, COTE);
    const sol = solPlat();
    const v = vue();
    terrain.rafraichir(sol, 20, v);
    terrain.cuire(sol, 20, v, 99);

    const litiereCG = new Float32Array(sol.litiereCG);
    litiereCG[20 * COTE + 20] = LITIERE_PLEINE_CG; // morceau (1,1)
    expect(terrain.rafraichir(solPlat({ litiereCG }), 20, v)).toBe(1);
  });

  it("recuit à un changement de zoom ou d'orientation : l'image est cuite à l'échelle", () => {
    const { fabriquer } = fabriqueBouchon();
    const terrain = new Terrain(fabriquer, COTE);
    const sol = solPlat();
    const v = vue();
    terrain.rafraichir(sol, 20, v);
    terrain.cuire(sol, 20, v, 99);
    expect(terrain.rafraichir(sol, 20, tournerVue(v, 1))).toBe(9);
  });

  it("ne s'occupe que du visible : au zoom rapproché il cuit moins de morceaux", () => {
    // Sur une parcelle d'un hectare, pas sur celle de 48 m des autres tests :
    // à 48 m un plan rapproché touche encore les trois morceaux d'un côté, et
    // ce n'est pas un défaut de découpage mais la granularité du morceau.
    const GRAND = 160;
    const n = GRAND * GRAND;
    const sol: DonneesSol = {
      coteM: GRAND,
      altitudesM: new Array(n).fill(0),
      humidite: new Float32Array(n).fill(0.5),
      herbe: new Float32Array(n).fill(0.6),
      herbeBiomasse: new Float32Array(n).fill(0.3),
      litiereCG: new Float32Array(n).fill(10),
    };
    const { fabriquer } = fabriqueBouchon();
    const terrain = new Terrain(fabriquer, GRAND);
    const ensemble = vueInitiale(GRAND, 1200, 700);
    const tous = terrain.rafraichir(sol, 20, ensemble);
    expect(tous).toBe(morceauxParCote(GRAND) ** 2);

    const proche = zoomer(ensemble, 12, { sx: 600, sy: 350 });
    const rapproche = new Terrain(fabriquer, GRAND).rafraichir(sol, 20, proche);
    // Le chiffre qui justifie le découpage par emprise : un ordre de grandeur.
    expect(rapproche * 10).toBeLessThan(tous);
  });

  it("pose les morceaux cuits dans l'ordre du peintre, et seulement ceux-là", () => {
    const { fabriquer } = fabriqueBouchon();
    const terrain = new Terrain(fabriquer, COTE);
    const sol = solPlat();
    const v = vue();
    terrain.rafraichir(sol, 20, v);
    // Rien de cuit encore : rien à poser, et surtout pas de trou noir.
    expect(terrain.aPoser(v)).toEqual([]);
    terrain.cuire(sol, 20, v, 3);
    expect(terrain.aPoser(v)).toHaveLength(3);
    terrain.cuire(sol, 20, v, 99);
    const poses = terrain.aPoser(v);
    expect(poses).toHaveLength(9);
    for (let i = 1; i < poses.length; i++) {
      const a = poses[i - 1];
      const b = poses[i];
      if (!a || !b) throw new Error("vide");
      const pa = profondeur(a.x0 + 8, a.y0 + 8, v.cam);
      const pb = profondeur(b.x0 + 8, b.y0 + 8, v.cam);
      expect(pb).toBeGreaterThanOrEqual(pa);
    }
  });

  it("le budget cuit d'abord ce qui est le plus PROCHE de la caméra", () => {
    // Si le budget ne suffit pas, mieux vaut que le retard soit au fond de la
    // scène, là où l'œil ne va pas.
    const { fabriquer } = fabriqueBouchon();
    const terrain = new Terrain(fabriquer, COTE);
    const sol = solPlat();
    const v = vue();
    terrain.rafraichir(sol, 20, v);
    terrain.cuire(sol, 20, v, 1);
    const pose = terrain.aPoser(v);
    expect(pose).toHaveLength(1);
    const seul = pose[0];
    if (!seul) throw new Error("vide");
    const emprise = celluleVisibles(v);
    if (!emprise) throw new Error("emprise");
    const tous = morceauxDeLEmprise(emprise, v);
    const dernier = tous[tous.length - 1];
    expect(`${seul.ix},${seul.iy}`).toBe(`${dernier?.ix},${dernier?.iy}`);
  });
});
