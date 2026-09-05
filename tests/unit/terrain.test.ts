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
  morceauxDeLEmprise,
  morceauxParCote,
  signatureMorceau,
  sousDivisions,
  Terrain,
} from "../../src/render/couches/terrain";
import { DEBORDEMENT_PLEIN_MM, LITIERE_PLEINE_CG, NIVEAUX } from "../../src/render/palette";
import { profondeur, TUILE_LARGEUR_PX } from "../../src/render/projection";

const COTE = 48; // trois morceaux de 16 m par côté

/** Un contexte 2d bouchonné qui compte ce qu'on lui demande. */
function fabriqueBouchon() {
  // `traitsColores` compte les traits qui NE SONT PAS de la couleur du
  // remplissage en cours : ce sont les seuls qui se voient, et donc les seuls
  // qui violeraient la règle « pas de liseré sur le sol ». Les autres ne font
  // que fermer le demi-pixel d'antialiasing entre deux surfaces jointives.
  const compte = { canvas: 0, remplissages: 0, traits: 0, traitsColores: 0 };
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
      // Le tapis, qui n'apparaît qu'au zoom rapproché, dessine des ellipses
      // orientées : sans ces quatre-là, les cas à fort zoom lèvent une erreur
      // au lieu de mesurer ce qu'ils prétendent mesurer.
      save() {},
      restore() {},
      translate() {},
      rotate() {},
      ellipse() {},
      arc() {},
      fill() {
        compte.remplissages++;
      },
      stroke() {
        compte.traits++;
        if (ctx.strokeStyle !== ctx.fillStyle) compte.traitsColores++;
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

  it("échantillonne grossièrement mais dessine finement — les deux ne sont PAS liés", () => {
    // La distinction que ce module doit tenir : le pavage combat le bruit,
    // la subdivision combat les bords francs. Confondre les deux redonne soit
    // un camouflage, soit une mosaïque.
    const bouchon = fabriqueBouchon();
    const tresLarge: Vue = { ...vue(), cam: { ...vue().cam, zoom: 0.25 } };
    cuireMorceau(solPlat(), 1, 1, 20, tresLarge, bouchon.fabriquer);

    const pas = cotePavage(0.25);
    const pavesParCote = COTE_MORCEAU_M / pas;
    const sous = sousDivisions(TUILE_LARGEUR_PX * 0.25 * pas);
    expect(bouchon.compte.remplissages).toBe(pavesParCote ** 2 * sous ** 2);
    // Quatre échantillons de 8 m, mais bien plus de formes dessinées : c'est
    // exactement ce qu'on veut.
    expect(pavesParCote ** 2).toBe(4);
    expect(bouchon.compte.remplissages).toBeGreaterThan(pavesParCote ** 2);
  });

  it("borne la subdivision : le coût monte en carré, l'œil ne suit pas", () => {
    for (const pavePx of [1, 12, 40, 200, 5000]) {
      const k = sousDivisions(pavePx);
      expect(k).toBeGreaterThanOrEqual(1);
      expect(k).toBeLessThanOrEqual(4);
    }
    expect(sousDivisions(1)).toBe(1);
    expect(sousDivisions(48)).toBe(4);
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

  it("ne dessine aucun flanc sur un terrain plat", () => {
    // Le nombre de remplissages suit la subdivision ; ce qui doit être vérifié
    // ici, c'est qu'un terrain plat n'engendre AUCUN flanc — sinon on peindrait
    // des falaises là où le sol ne descend pas.
    const { fabriquer, compte } = fabriqueBouchon();
    const v = vue();
    cuireMorceau(solPlat(), 1, 1, 20, v, fabriquer);
    const pas = cotePavage(v.cam.zoom);
    const sous = sousDivisions(TUILE_LARGEUR_PX * v.cam.zoom * pas);
    const paves = (COTE_MORCEAU_M / pas) ** 2;
    expect(compte.remplissages).toBe(paves * sous ** 2);
  });

  it("n'ourle PAS une pente régulière, si raide soit-elle", () => {
    // **Ce test disait l'inverse, et il avait tort.** Il exigeait un flanc dès
    // que le terrain descendait, ce qui était juste tant que les quads étaient
    // des losanges plats : sur une pente, chaque pavé décrochait de son voisin
    // d'aval et il fallait boucher le trou. Une capture a montré ce que ça
    // donne — un versant lisse hachuré de traits sombres réguliers, c'est-à-dire
    // un escalier. Les quads sont désormais tracés par leurs quatre coins : la
    // surface est continue, il n'y a plus rien à boucher, et l'ourlet devient
    // faux là où il servait.
    const { fabriquer, compte } = fabriqueBouchon();
    const v = vue();
    const pas = cotePavage(v.cam.zoom);
    const sous = sousDivisions(TUILE_LARGEUR_PX * v.cam.zoom * pas);
    const paves = (COTE_MORCEAU_M / pas) ** 2;
    // Une pente à 50 cm par mètre — raide, et pourtant régulière.
    const altitudesM = new Array(COTE * COTE).fill(0).map((_, i) => -Math.floor(i / COTE) * 0.5);
    cuireMorceau(solPlat({ altitudesM }), 1, 1, 20, v, fabriquer);
    expect(compte.remplissages).toBe(paves * sous ** 2);
  });

  it("ourle en revanche une VRAIE rupture, où il y a une paroi à montrer", () => {
    const { fabriquer, compte } = fabriqueBouchon();
    const v = vue();
    const pas = cotePavage(v.cam.zoom);
    const sous = sousDivisions(TUILE_LARGEUR_PX * v.cam.zoom * pas);
    const paves = (COTE_MORCEAU_M / pas) ** 2;
    // Un talus : trois mètres de chute d'un coup, au milieu du morceau.
    const altitudesM = new Array(COTE * COTE)
      .fill(0)
      .map((_, i) => (Math.floor(i / COTE) >= 24 ? -3 : 0));
    cuireMorceau(solPlat({ altitudesM }), 1, 1, 20, v, fabriquer);
    expect(compte.remplissages).toBeGreaterThan(paves * sous ** 2);
  });

  it("ne trace aucun liseré VISIBLE sur le sol, à aucun zoom", () => {
    // Conclusion de Q6 renversée pour le sol : un quadrillage permanent fait
    // lire un champ labouré de loin et un fil de fer de près. Le détourage vaut
    // pour les formes — arbres, souches, troncs couchés — pas pour le fond.
    //
    // Le test comptait les traits et exigeait zéro. Il en reste désormais, mais
    // **de la couleur exacte du remplissage qu'ils bordent** : leur seul rôle
    // est de fermer le demi-pixel que l'antialiasing laisse entre deux quads
    // voisins, sans quoi la grille reparaît en clair — le défaut même que Q6
    // voulait éviter. Ce qu'il faut vérifier n'est donc plus « aucun trait »
    // mais « aucun trait d'une AUTRE couleur ».
    for (const zoom of [0.3, 1, 4, 20]) {
      const bouchon = fabriqueBouchon();
      const v: Vue = { ...vue(), cam: { ...vue().cam, zoom } };
      cuireMorceau(solPlat(), 1, 1, 20, v, bouchon.fabriquer);
      expect(bouchon.compte.traitsColores).toBe(0);
    }
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

describe("l'eau libre, qui ne s'interpole pas", () => {
  /** Une parcelle avec un ruisseau de deux cellules de large. */
  function avecRuisseau(): DonneesSol {
    const enEau = new Array(COTE * COTE).fill(false);
    for (let x = 0; x < COTE; x++) {
      enEau[20 * COTE + x] = true;
      enEau[21 * COTE + x] = true;
    }
    return solPlat({ enEau });
  }

  it("entre dans la signature : sinon une crue monterait sans rien redessiner", () => {
    const sec = solPlat();
    const debordementMm = new Float32Array(COTE * COTE);
    debordementMm[18 * COTE + 18] = DEBORDEMENT_PLEIN_MM;
    expect(signatureMorceau(solPlat({ debordementMm }), 1, 1, 20)).not.toBe(
      signatureMorceau(sec, 1, 1, 20),
    );
  });

  it("mais le débordement est quantifié : un millimètre de plus ne recuit rien", () => {
    const a = new Float32Array(COTE * COTE).fill(10);
    const b = new Float32Array(COTE * COTE).fill(10.4);
    expect(signatureMorceau(solPlat({ debordementMm: b }), 1, 1, 20)).toBe(
      signatureMorceau(solPlat({ debordementMm: a }), 1, 1, 20),
    );
  });

  it("se dessine par son CONTOUR, en UNE passe, et non cellule par cellule", () => {
    // Le test exigeait un remplissage par cellule d'eau — c'était le tracé qui
    // faisait les marches que le retour a signalées. L'eau libre est désormais
    // un seul chemin par morceau : tous les polygones de rive y sont accumulés
    // puis peints d'un coup, ce qui fond les cellules voisines en une surface
    // et supprime aussi les points d'antialiasing qui mouchetaient la mare.
    //
    // La résolution, elle, n'a pas changé : le contour reste calculé cellule
    // par cellule, donc un ruisseau de deux mètres ne disparaît toujours pas.
    const sans = fabriqueBouchon();
    const avec = fabriqueBouchon();
    const v = vue();
    cuireMorceau(solPlat(), 1, 1, 20, v, sans.fabriquer);
    cuireMorceau(avecRuisseau(), 1, 1, 20, v, avec.fabriquer);
    expect(avec.compte.remplissages - sans.compte.remplissages).toBe(1);
  });

  it("ne dessine rien là où il n'y a ni eau libre ni débordement", () => {
    const bouchon = fabriqueBouchon();
    const debordementMm = new Float32Array(COTE * COTE); // tout à zéro
    const reference = fabriqueBouchon();
    cuireMorceau(solPlat(), 1, 1, 20, vue(), reference.fabriquer);
    cuireMorceau(solPlat({ debordementMm }), 1, 1, 20, vue(), bouchon.fabriquer);
    expect(bouchon.compte.remplissages).toBe(reference.compte.remplissages);
  });
});
