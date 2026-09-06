import { describe, expect, it } from "vitest";
import { HETRE } from "../../src/render/arbres/especes";
import { type Vue, vueInitiale } from "../../src/render/camera";
import {
  type ArbreAPoser,
  AtlasArbres,
  ancrageDePose,
  classeDe,
  cleClasse,
  couleurFeuillage,
  cuireVignette,
  FICHE_GENERIQUE,
  PALIERS_HAUTEUR,
  posesDesArbres,
  tailleDePose,
  VARIANTES,
  VIGNETTE_MAX_PX,
} from "../../src/render/couches/arbres";
import { METRE_VERTICAL_PX } from "../../src/render/projection";

const COTE = 100;
const vue = (zoom?: number): Vue => {
  const v = vueInitiale(COTE, 900, 620, 6);
  return zoom === undefined ? v : { ...v, cam: { ...v.cam, zoom } };
};

const arbre = (p: Partial<ArbreAPoser> = {}): ArbreAPoser => ({
  id: 1,
  especeId: "fagus_sylvatica",
  x: 50,
  y: 50,
  z: 0,
  heightM: 16,
  houppierRatio: 0.35,
  partFoliaire: 1,
  senescence: 0,
  vigueur: 1,
  ...p,
});

/** Un canvas bouchonné qui compte les tracés. Aucun DOM en test. */
function fabriqueBouchon() {
  const compte = { canvas: 0, remplissages: 0, traits: 0 };
  const fabriquer = (largeur: number, hauteur: number) => {
    compte.canvas++;
    const ctx = {
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 0,
      lineCap: "",
      beginPath() {},
      moveTo() {},
      lineTo() {},
      closePath() {},
      ellipse() {},
      arc() {},
      save() {},
      restore() {},
      translate() {},
      rotate() {},
      fill() {
        compte.remplissages++;
      },
      stroke() {
        compte.traits++;
      },
    };
    return {
      width: Math.max(1, Math.ceil(largeur)),
      height: Math.max(1, Math.ceil(hauteur)),
      getContext: () => ctx,
    } as unknown as HTMLCanvasElement;
  };
  return { fabriquer, compte };
}

describe("la classe : ce qui se partage et ce qui ne se partage pas", () => {
  it("deux arbres identiques partagent leur image", () => {
    const v = vue();
    expect(cleClasse(classeDe(arbre(), 30, v))).toBe(cleClasse(classeDe(arbre(), 30, v)));
  });

  it("la HAUTEUR sépare, sinon toute une plantation ferait la même taille", () => {
    const v = vue();
    const petit = cleClasse(classeDe(arbre({ heightM: 4 }), 30, v));
    const grand = cleClasse(classeDe(arbre({ heightM: 22 }), 30, v));
    expect(petit).not.toBe(grand);
  });

  it("mais elle se quantifie : un centimètre de plus ne recuit rien", () => {
    const v = vue();
    const a = cleClasse(classeDe(arbre({ heightM: 16 }), 30, v));
    const b = cleClasse(classeDe(arbre({ heightM: 16.01 }), 30, v));
    expect(a).toBe(b);
  });

  it("la VARIANTE sépare : sans elle un peuplement se répète à l'identique", () => {
    const v = vue();
    const cles = new Set(
      Array.from({ length: 12 }, (_, id) => cleClasse(classeDe(arbre({ id }), 30, v))),
    );
    expect(cles.size).toBe(VARIANTES);
  });

  it("la GESTION sépare : un arbre trogné n'est pas l'arbre ordinaire de sa classe", () => {
    const v = vue();
    const ordinaire = cleClasse(classeDe(arbre(), 30, v));
    expect(cleClasse(classeDe(arbre({ teteTrogneM: 2 }), 30, v))).not.toBe(ordinaire);
    expect(cleClasse(classeDe(arbre({ hauteurElagueeM: 6 }), 30, v))).not.toBe(ordinaire);
    expect(cleClasse(classeDe(arbre({ chandelle: true }), 30, v))).not.toBe(ordinaire);
  });

  it("la SAISON sépare, et la sénescence séparément de la part foliaire", () => {
    // Un houppier plein et vert et un houppier plein et doré ne sont pas la
    // même image : c'est ce décalage qui fait octobre (§2.2).
    const v = vue();
    const ete = cleClasse(classeDe(arbre({ partFoliaire: 1, senescence: 0 }), 30, v));
    const octobre = cleClasse(classeDe(arbre({ partFoliaire: 1, senescence: 0.9 }), 30, v));
    const novembre = cleClasse(classeDe(arbre({ partFoliaire: 0.2, senescence: 0.9 }), 30, v));
    expect(ete).not.toBe(octobre);
    expect(octobre).not.toBe(novembre);
  });

  it("le nombre de classes reste borné, même avec cinq mille arbres", () => {
    // C'est TOUT l'intérêt du partage : le coût passe de « par arbre » à
    // « par classe ». Si ce test tombe, la cuisson explose.
    const v = vue();
    const cles = new Set<string>();
    for (let i = 0; i < 5000; i++) {
      cles.add(cleClasse(classeDe(arbre({ id: i, heightM: 0.5 + (i % 60) * 0.5 }), 30, v)));
    }
    expect(cles.size).toBeLessThanOrEqual(PALIERS_HAUTEUR * VARIANTES * 4);
  });

  it("la résolution de cuisson est bornée et par puissances de deux", () => {
    for (const zoom of [0.2, 1, 4, 20]) {
      const c = classeDe(arbre(), 30, vue(zoom));
      expect(c.taillePx).toBeLessThanOrEqual(VIGNETTE_MAX_PX);
      expect(Math.log2(c.taillePx) % 1).toBeCloseTo(0, 9);
    }
  });
});

describe("la cuisson d'une vignette", () => {
  it("dessine du bois et du feuillage", () => {
    const { fabriquer, compte } = fabriqueBouchon();
    const c = classeDe(arbre(), 30, vue());
    cuireVignette(c, 16, 0.35, fabriquer);
    expect(compte.traits).toBeGreaterThan(10);
    expect(compte.remplissages).toBeGreaterThan(10);
  });

  it("ne dessine AUCUN feuillage sur une chandelle", () => {
    const { fabriquer, compte } = fabriqueBouchon();
    const c = classeDe(arbre({ chandelle: true, partFoliaire: 0 }), 30, vue());
    cuireVignette(c, 16, 0.35, fabriquer);
    expect(compte.remplissages).toBe(0);
    expect(compte.traits).toBeGreaterThan(10);
  });

  it("cuit MOINS de bois quand la vignette est petite", () => {
    // Le point de rupture mesuré au lot L0 est le zoom rapproché : à quinze
    // pixels, mille segments seraient mille traits d'un tiers de pixel.
    const petit = fabriqueBouchon();
    const grand = fabriqueBouchon();
    cuireVignette(classeDe(arbre(), 30, vue(0.15)), 16, 0.35, petit.fabriquer);
    cuireVignette(classeDe(arbre(), 30, vue(6)), 16, 0.35, grand.fabriquer);
    expect(petit.compte.traits).toBeLessThan(grand.compte.traits);
  });

  it("pose le pied de l'arbre en bas de la vignette", () => {
    const { fabriquer } = fabriqueBouchon();
    const v = cuireVignette(classeDe(arbre(), 30, vue()), 16, 0.35, fabriquer);
    expect(v.piedY).toBeCloseTo(v.image.height - 1);
    expect(v.piedX).toBeCloseTo(v.image.width / 2);
  });

  it("est déterministe : deux cuissons de la même classe donnent le même compte", () => {
    const a = fabriqueBouchon();
    const b = fabriqueBouchon();
    const c = classeDe(arbre(), 30, vue());
    cuireVignette(c, 16, 0.35, a.fabriquer);
    cuireVignette(c, 16, 0.35, b.fabriquer);
    expect(a.compte).toEqual(b.compte);
  });
});

describe("la pose : la résolution n'est pas la taille", () => {
  it("**pose à la taille écran, pas à la résolution de cuisson**", () => {
    // Le piège qui s'est refermé : coller la vignette à sa résolution donnait
    // des arbres trois fois trop grands, une futaie de mâts plus hauts que la
    // parcelle n'est large.
    const { fabriquer } = fabriqueBouchon();
    const v = vue();
    const vignette = cuireVignette(classeDe(arbre(), 30, v), 16, 0.35, fabriquer);
    const taille = tailleDePose(16, vignette, v);
    expect(taille.hauteur).toBeCloseTo(16 * METRE_VERTICAL_PX * v.cam.zoom, 6);
    expect(taille.hauteur).not.toBeCloseTo(vignette.image.height, 0);
  });

  it("garde les proportions de la vignette", () => {
    const { fabriquer } = fabriqueBouchon();
    const v = vue();
    const vignette = cuireVignette(classeDe(arbre(), 30, v), 16, 0.35, fabriquer);
    const taille = tailleDePose(16, vignette, v);
    expect(taille.largeur / taille.hauteur).toBeCloseTo(
      vignette.image.width / vignette.image.height,
      6,
    );
  });

  it("l'ancrage suit la mise à l'échelle", () => {
    const { fabriquer } = fabriqueBouchon();
    const v = vue();
    const vignette = cuireVignette(classeDe(arbre(), 30, v), 16, 0.35, fabriquer);
    const taille = tailleDePose(16, vignette, v);
    const ancre = ancrageDePose(vignette, taille);
    // Le pied reste au milieu, en bas, quelle que soit l'échelle.
    expect(ancre.dx).toBeCloseTo(taille.largeur / 2, 3);
    expect(ancre.dy).toBeGreaterThan(taille.hauteur * 0.99);
  });

  it("un arbre deux fois plus haut se pose deux fois plus haut", () => {
    const { fabriquer } = fabriqueBouchon();
    const v = vue();
    const petite = cuireVignette(classeDe(arbre({ heightM: 8 }), 30, v), 8, 0.35, fabriquer);
    const grande = cuireVignette(classeDe(arbre({ heightM: 16 }), 30, v), 16, 0.35, fabriquer);
    expect(tailleDePose(16, grande, v).hauteur).toBeCloseTo(
      2 * tailleDePose(8, petite, v).hauteur,
      6,
    );
  });
});

describe("l'ordre du peintre", () => {
  it("trie du plus lointain au plus proche, comme le terrain", () => {
    const v = vue();
    const liste = posesDesArbres(
      [
        arbre({ id: 1, x: 90, y: 90 }),
        arbre({ id: 2, x: 10, y: 10 }),
        arbre({ id: 3, x: 50, y: 50 }),
      ],
      () => 30,
      v,
    );
    for (let i = 1; i < liste.length; i++) {
      const a = liste[i - 1];
      const b = liste[i];
      if (!a || !b) continue;
      expect(a.profondeur).toBeLessThanOrEqual(b.profondeur);
    }
  });

  it("ignore les arbres de hauteur nulle", () => {
    expect(posesDesArbres([arbre({ heightM: 0 })], () => 30, vue())).toHaveLength(0);
  });
});

describe("l'atlas", () => {
  it("ne cuit une classe qu'une fois, même pour mille arbres", () => {
    const { fabriquer, compte } = fabriqueBouchon();
    const v = vue();
    const arbres = Array.from({ length: 1000 }, (_, i) => arbre({ id: i % VARIANTES }));
    const poses = posesDesArbres(arbres, () => 30, v);
    const atlas = new AtlasArbres(fabriquer);
    expect(atlas.rafraichir(poses)).toBe(VARIANTES);
    atlas.cuire(10_000_000);
    expect(atlas.taille).toBe(VARIANTES);
    const canvasApres = compte.canvas;
    // Deuxième tour : rien à cuire.
    expect(atlas.rafraichir(poses)).toBe(0);
    atlas.cuire(10_000_000);
    expect(compte.canvas).toBe(canvasApres);
  });

  it("respecte son budget de PIXELS et garde le reste pour l'image suivante", () => {
    // Le budget compte des pixels, pas des vignettes : c'est ce qui le rend
    // juste aux deux bouts du zoom, où une vignette peut coûter deux cent
    // cinquante-six fois plus que l'autre.
    const { fabriquer } = fabriqueBouchon();
    const v = vue();
    const poses = posesDesArbres(
      Array.from({ length: 40 }, (_, i) => arbre({ id: i, heightM: 2 + i * 0.5 })),
      () => 30,
      v,
    );
    const atlas = new AtlasArbres(fabriquer);
    const manquantes = atlas.rafraichir(poses);
    expect(manquantes).toBeGreaterThan(3);
    // Un budget minuscule ne cuit qu'une classe : on ne saute jamais son tour,
    // sinon une vignette trop grosse ne serait jamais cuite du tout.
    expect(atlas.cuire(1)).toBe(1);
    expect(atlas.enRetard).toBe(manquantes - 1);
  });

  it("cuit BEAUCOUP de petites vignettes pour le prix d'une grande", () => {
    const petites = fabriqueBouchon();
    const grandes = fabriqueBouchon();
    const deLoin = vue(0.2);
    const dePres = vue(8);
    const sujets = Array.from({ length: 60 }, (_, i) => arbre({ id: i, heightM: 2 + i * 0.4 }));

    const atlasLoin = new AtlasArbres(petites.fabriquer);
    atlasLoin.rafraichir(posesDesArbres(sujets, () => 30, deLoin));
    const nLoin = atlasLoin.cuire(300_000);

    const atlasPres = new AtlasArbres(grandes.fabriquer);
    atlasPres.rafraichir(posesDesArbres(sujets, () => 30, dePres));
    const nPres = atlasPres.cuire(300_000);

    expect(nLoin).toBeGreaterThan(nPres);
  });

  it("rend `undefined` pour une classe pas encore cuite, sans lever", () => {
    const { fabriquer } = fabriqueBouchon();
    const atlas = new AtlasArbres(fabriquer);
    expect(atlas.vignette(classeDe(arbre(), 30, vue()))).toBeUndefined();
  });

  it("se vide", () => {
    const { fabriquer } = fabriqueBouchon();
    const v = vue();
    const atlas = new AtlasArbres(fabriquer);
    atlas.rafraichir(posesDesArbres([arbre()], () => 30, v));
    atlas.cuire(10_000_000);
    expect(atlas.taille).toBe(1);
    atlas.vider();
    expect(atlas.taille).toBe(0);
  });
});

describe("le repli d'espèce", () => {
  it("une essence sans fiche prend un port de famille, et la vue tourne", () => {
    // §5.4 : « une essence sans fiche prend le port de sa famille en attendant
    // la sienne ». Ce n'est pas un vœu, c'est ce que le rendu doit faire.
    const { fabriquer, compte } = fabriqueBouchon();
    const c = classeDe(arbre({ especeId: "rubus_fruticosus" }), 30, vue());
    expect(() => cuireVignette(c, 4, 0.5, fabriquer)).not.toThrow();
    expect(compte.traits).toBeGreaterThan(0);
  });

  it("la fiche générique est complète", () => {
    expect(FICHE_GENERIQUE.references.length).toBeGreaterThan(0);
    expect(FICHE_GENERIQUE.feuillage.densite).toBeGreaterThan(0);
  });
});

describe("la couleur de feuillage suit la sénescence", () => {
  it("va du vert d'été à la couleur d'automne", () => {
    expect(couleurFeuillage(HETRE, 0)).toEqual(HETRE.couleurs.ete);
    expect(couleurFeuillage(HETRE, 1)).toEqual(HETRE.couleurs.automne);
  });

  it("passe par des valeurs intermédiaires, sans saut", () => {
    const milieu = couleurFeuillage(HETRE, 0.5);
    expect(milieu.r).toBeGreaterThan(HETRE.couleurs.ete.r);
    expect(milieu.r).toBeLessThan(HETRE.couleurs.automne.r);
  });
});

describe("le découpage par emprise visible", () => {
  it("ne pose QUE ce qui est visible", () => {
    // La règle du lot L0 : « le point de rupture est le zoom rapproché, pas la
    // parcelle entière ». Sans ce filtre, la vue Pixi posait cinq mille six
    // cents sprites par image et gardait cinq cents classes de vignette en
    // retard, pour une trentaine d'arbres réellement à l'écran.
    const serre: Vue = { ...vue(), cam: { ...vue().cam, zoom: 6 }, centre: { x: 20, y: 20 } };
    const tous = Array.from({ length: 400 }, (_, i) =>
      arbre({ id: i, x: (i % 20) * 5, y: Math.floor(i / 20) * 5, heightM: 6 }),
    );
    const poses = posesDesArbres(tous, () => 30, serre);
    expect(poses.length).toBeGreaterThan(0);
    expect(poses.length).toBeLessThan(tous.length / 2);
  });

  it("garde tout ce qui tient à l'écran au zoom d'ensemble", () => {
    const large = vue();
    const tous = Array.from({ length: 100 }, (_, i) =>
      arbre({ id: i, x: (i % 10) * 10 + 2, y: Math.floor(i / 10) * 10 + 2, heightM: 6 }),
    );
    expect(posesDesArbres(tous, () => 30, large)).toHaveLength(tous.length);
  });

  it("garde un arbre dont le PIED est hors cadre mais la cime dedans", () => {
    // La marge de `celluleVisibles` compte la hauteur, et c'est ce qui évite
    // qu'un grand arbre disparaisse d'un coup quand son pied sort du bas.
    const serre: Vue = { ...vue(), cam: { ...vue().cam, zoom: 5 }, centre: { x: 50, y: 50 } };
    const proche = posesDesArbres([arbre({ x: 50, y: 50, heightM: 25 })], () => 30, serre);
    expect(proche).toHaveLength(1);
  });
});
