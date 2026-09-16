import { describe, expect, it } from "vitest";
import { getEspece } from "../../src/engine/especes";
import { HAUTEUR_BROUTAGE_M } from "../../src/engine/gibier";
import { diametreTeteCm, volumeCaviteL } from "../../src/engine/trogne";
import { HETRE } from "../../src/render/arbres/especes";
import { type FormeFeuille, portDuBouquet } from "../../src/render/arbres/feuilles";
import { contraindre } from "../../src/render/arbres/port";
import { engendrer, type Segment } from "../../src/render/arbres/squelette";
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
  fourreEnArbre,
  PALIERS_HAUTEUR,
  PROFONDEUR_OBLIQUE,
  partEcorceRefaite,
  posesDesArbres,
  replier,
  separerLeFourre,
  tailleDePose,
  teinteSelonVigueur,
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
  baseHouppierM: 4,
  partFoliaire: 1,
  senescence: 0,
  vigueur: 1,
  ...p,
});

/** Un canvas bouchonné qui compte les tracés. Aucun DOM en test. */
function fabriqueBouchon() {
  const compte = {
    canvas: 0,
    remplissages: 0,
    traits: 0,
    /** Les couleurs posées, dans l'ordre : `fill` comme `stroke`. */
    couleurs: [] as string[],
    /** Les rectangles pleins, en pixels de vignette — le manchon en est un. */
    rects: [] as { x: number; y: number; l: number; h: number }[],
    /** Rotations demandées : un bouquet allongé s'oriente, une rosette non. */
    rotations: 0,
    /** Les ellipses pleines, avec leurs demi-axes — la tête de trogne en est une. */
    ellipses: [] as { rx: number; ry: number }[],
  };
  const fabriquer = (largeur: number, hauteur: number) => {
    compte.canvas++;
    const ctx = {
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 0,
      lineCap: "",
      globalAlpha: 1,
      beginPath() {},
      moveTo() {},
      lineTo() {},
      closePath() {},
      ellipse(_x: number, _y: number, rx: number, ry: number) {
        compte.ellipses.push({ rx, ry });
      },
      arc() {},
      save() {},
      restore() {},
      translate() {},
      rotate() {
        compte.rotations++;
      },
      rect(x: number, y: number, l: number, h: number) {
        compte.rects.push({ x, y, l, h });
      },
      fill() {
        compte.remplissages++;
        compte.couleurs.push(ctx.fillStyle);
      },
      stroke() {
        compte.traits++;
        compte.couleurs.push(ctx.strokeStyle);
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
    expect(cleClasse(classeDe(arbre({ baseHouppierM: 11 }), 30, v))).not.toBe(ordinaire);
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
    cuireVignette(c, 16, 0.35, fabriquer, 4);
    expect(compte.traits).toBeGreaterThan(10);
    expect(compte.remplissages).toBeGreaterThan(10);
  });

  it("ne dessine AUCUN feuillage sur une chandelle", () => {
    const { fabriquer, compte } = fabriqueBouchon();
    const c = classeDe(arbre({ chandelle: true, partFoliaire: 0 }), 30, vue());
    cuireVignette(c, 16, 0.35, fabriquer, 4);
    expect(compte.remplissages).toBe(0);
    expect(compte.traits).toBeGreaterThan(10);
  });

  it("cuit MOINS de bois quand la vignette est petite", () => {
    // Le point de rupture mesuré au lot L0 est le zoom rapproché : à quinze
    // pixels, mille segments seraient mille traits d'un tiers de pixel.
    const petit = fabriqueBouchon();
    const grand = fabriqueBouchon();
    cuireVignette(classeDe(arbre(), 30, vue(0.15)), 16, 0.35, petit.fabriquer, 4);
    cuireVignette(classeDe(arbre(), 30, vue(6)), 16, 0.35, grand.fabriquer, 4);
    expect(petit.compte.traits).toBeLessThan(grand.compte.traits);
  });

  it("pose le pied de l'arbre en bas de la vignette", () => {
    const { fabriquer } = fabriqueBouchon();
    const v = cuireVignette(classeDe(arbre(), 30, vue()), 16, 0.35, fabriquer, 4);
    expect(v.piedY).toBeCloseTo(v.image.height - 1);
    expect(v.piedX).toBeCloseTo(v.image.width / 2);
  });

  it("est déterministe : deux cuissons de la même classe donnent le même compte", () => {
    const a = fabriqueBouchon();
    const b = fabriqueBouchon();
    const c = classeDe(arbre(), 30, vue());
    cuireVignette(c, 16, 0.35, a.fabriquer, 4);
    cuireVignette(c, 16, 0.35, b.fabriquer, 4);
    expect(a.compte).toEqual(b.compte);
  });
});

describe("la pose : la résolution n'est pas la taille", () => {
  /**
   * La hauteur de l'ARBRE une fois posé, marge de vignette déduite.
   *
   * **La distinction est le fond de ces essais.** Une vignette réserve de la
   * place au-dessus de la cime, sinon les feuilles du sommet sont tranchées ;
   * l'image posée est donc un peu plus haute que l'arbre, et c'est voulu. Ce
   * qui doit valoir exactement la hauteur écran, c'est l'arbre — mesurer
   * l'image reviendrait à réclamer une vignette sans marge, c'est-à-dire le
   * défaut qu'on vient de corriger.
   */
  const arbrePose = (
    vignette: { image: { height: number }; hautArbrePx: number },
    taille: { hauteur: number },
  ) => taille.hauteur * (vignette.hautArbrePx / vignette.image.height);

  it("**pose à la taille écran, pas à la résolution de cuisson**", () => {
    // Le piège qui s'est refermé : coller la vignette à sa résolution donnait
    // des arbres trois fois trop grands, une futaie de mâts plus hauts que la
    // parcelle n'est large.
    const { fabriquer } = fabriqueBouchon();
    const v = vue();
    const vignette = cuireVignette(classeDe(arbre(), 30, v), 16, 0.35, fabriquer, 4);
    const taille = tailleDePose(16, vignette, v);
    expect(arbrePose(vignette, taille)).toBeCloseTo(16 * METRE_VERTICAL_PX * v.cam.zoom, 6);
    expect(taille.hauteur).not.toBeCloseTo(vignette.image.height, 0);
  });

  it("la marge de la vignette ne déborde pas sur l'arbre", () => {
    // L'image posée est plus haute que l'arbre — c'est la marge — mais de peu :
    // une vignette dont la moitié serait du vide gâcherait autant de budget de
    // cuisson que de remplissage à l'écran.
    const { fabriquer } = fabriqueBouchon();
    const v = vue();
    const vignette = cuireVignette(classeDe(arbre(), 30, v), 16, 0.35, fabriquer, 4);
    const taille = tailleDePose(16, vignette, v);
    const arbre16 = arbrePose(vignette, taille);
    expect(taille.hauteur).toBeGreaterThan(arbre16);
    expect(taille.hauteur).toBeLessThan(arbre16 * 1.12);
  });

  it("**la boîte contient le houppier, si large soit-il**", () => {
    // Le défaut que cet essai garde fermé : la vignette était un rectangle de
    // proportion fixe — une largeur pour une hauteur et demie — quelle que
    // soit l'espèce. Un houppier plus large que le tiers de la hauteur en
    // débordait et sortait tranché net à la verticale. Le moteur donne des
    // `houppierRatio` de 0,45 à 0,6 à tous les arbustes de haie : ils étaient
    // TOUS coupés, et la planche de la haie le montrait sans ambiguïté.
    //
    // L'invariant se vérifie en mètres et non en pixels : la demi-largeur de
    // l'image, ramenée à l'échelle de la vignette, doit couvrir le rayon du
    // houppier — que `contraindre` calibre exactement à `houppierRatio × h`.
    const { fabriquer } = fabriqueBouchon();
    const v = vue();
    for (const ratio of [0.25, 0.35, 0.45, 0.6]) {
      const hauteurM = 8;
      const vignette = cuireVignette(classeDe(arbre(), 30, v), hauteurM, ratio, fabriquer, 4);
      // pixels par mètre dans la vignette
      const echelle = vignette.hautArbrePx / hauteurM;
      const demiLargeurM = vignette.image.width / 2 / echelle;
      expect(demiLargeurM, `ratio ${ratio}`).toBeGreaterThanOrEqual(ratio * hauteurM);
    }
  });

  it("**le fourré aussi tient dans sa boîte, et n'a pas de barre pour base**", () => {
    // Le fourré avait sa propre boîte — carrée, de côté `taillePx`, remplie sur
    // toute sa hauteur — et il en sortait un RECTANGLE : monticule tranché net
    // en bas par une barre sombre rectiligne, coupé à la verticale sur les deux
    // flancs. Visible au zoom ×16 de la friche, où le roncier faisait un pavé.
    //
    // Or `fourreEnArbre` déclare déjà `houppierRatio: 0.5` — « un fourré est
    // aussi large que haut ». Il n'avait pas besoin d'un cas particulier, mais
    // qu'on lise ce qu'il déclarait : c'est ce que cet essai garde acquis, en
    // vérifiant que sa boîte suit la même règle que celle d'un arbre.
    const { fabriquer } = fabriqueBouchon();
    const v = vue();
    const hauteurM = 1.4;
    const ronce = arbre({ especeId: "rubus_fruticosus", heightM: hauteurM });
    const vignette = cuireVignette(classeDe(ronce, 2.5, v), hauteurM, 0.5, fabriquer, 4);
    const echelle = vignette.hautArbrePx / hauteurM;
    expect(vignette.image.width / 2 / echelle).toBeGreaterThanOrEqual(0.5 * hauteurM);
    // Et il garde une marge : la vignette est plus haute que le fourré, sinon
    // les touffes du sommet sont rognées comme l'étaient celles des flancs.
    expect(vignette.hautArbrePx).toBeLessThan(vignette.image.height);
  });

  it("garde les proportions de la vignette", () => {
    const { fabriquer } = fabriqueBouchon();
    const v = vue();
    const vignette = cuireVignette(classeDe(arbre(), 30, v), 16, 0.35, fabriquer, 4);
    const taille = tailleDePose(16, vignette, v);
    expect(taille.largeur / taille.hauteur).toBeCloseTo(
      vignette.image.width / vignette.image.height,
      6,
    );
  });

  it("l'ancrage suit la mise à l'échelle", () => {
    const { fabriquer } = fabriqueBouchon();
    const v = vue();
    const vignette = cuireVignette(classeDe(arbre(), 30, v), 16, 0.35, fabriquer, 4);
    const taille = tailleDePose(16, vignette, v);
    const ancre = ancrageDePose(vignette, taille);
    // Le pied reste au milieu, en bas, quelle que soit l'échelle.
    expect(ancre.dx).toBeCloseTo(taille.largeur / 2, 3);
    expect(ancre.dy).toBeGreaterThan(taille.hauteur * 0.99);
  });

  it("un arbre deux fois plus haut se pose deux fois plus haut", () => {
    const { fabriquer } = fabriqueBouchon();
    const v = vue();
    const petite = cuireVignette(classeDe(arbre({ heightM: 8 }), 30, v), 8, 0.35, fabriquer, 4);
    const grande = cuireVignette(classeDe(arbre({ heightM: 16 }), 30, v), 16, 0.35, fabriquer, 4);
    // Sur l'ARBRE et non sur l'image : la marge vaut une longueur de feuille,
    // la même en mètres pour les deux sujets, donc une part plus grande de la
    // vignette du petit. C'est correct — et ça se verrait comme une erreur si
    // on comparait les images.
    expect(arbrePose(grande, tailleDePose(16, grande, v))).toBeCloseTo(
      2 * arbrePose(petite, tailleDePose(8, petite, v)),
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
    const c = classeDe(arbre({ especeId: "ilex_aquifolium" }), 30, vue());
    expect(() => cuireVignette(c, 4, 0.5, fabriquer, 4)).not.toThrow();
    expect(compte.traits).toBeGreaterThan(0);
  });

  it("un FOURRÉ ne dessine aucun bois : c'est une masse, pas un arbre", () => {
    // La huitième famille ne passe pas par le générateur. Un roncier dessiné
    // avec un squelette sortait en petit arbre à fût et à couronne — faux en
    // botanique et visible sur la capture.
    const { fabriquer, compte } = fabriqueBouchon();
    const c = classeDe(arbre({ especeId: "rubus_fruticosus", heightM: 0.8 }), 3, vue());
    cuireVignette(c, 0.8, 0.5, fabriquer, 4);
    expect(compte.traits).toBe(0);
    expect(compte.remplissages).toBeGreaterThan(0);
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

describe("le fourré bas prend un autre chemin", () => {
  it("sort de la liste des arbres et devient des masses", () => {
    // §5.4 : les espèces de fourré sont « dessinées par cellule agrégée ».
    // Une ronce n'a ni fût ni houppier : lui appliquer le générateur donne un
    // petit arbre, ce qui est faux et se voit.
    const melange = [
      arbre({ id: 1, especeId: "fagus_sylvatica" }),
      ...Array.from({ length: 30 }, (_, i) =>
        arbre({ id: 100 + i, especeId: "rubus_fruticosus", x: 10 + (i % 3), y: 10, heightM: 0.7 }),
      ),
    ];
    const { arbres: restants, fourre } = separerLeFourre(melange);
    expect(restants).toHaveLength(1);
    expect(fourre.length).toBeGreaterThan(0);
    expect(fourre.length).toBeLessThan(30);
  });

  it("laisse passer une espèce sans fiche : elle reste un arbre", () => {
    const { arbres: restants, fourre } = separerLeFourre([arbre({ especeId: "ilex_aquifolium" })]);
    expect(restants).toHaveLength(1);
    expect(fourre).toHaveLength(0);
  });

  it("une masse devient un sujet aussi large que haut", () => {
    const { fourre } = separerLeFourre([
      arbre({ especeId: "ulex_europaeus", heightM: 1.2, x: 6, y: 6 }),
    ]);
    const masse = fourre[0];
    expect(masse).toBeDefined();
    if (!masse) return;
    const sujet = fourreEnArbre(masse);
    expect(sujet.houppierRatio).toBeCloseTo(0.5);
    expect(sujet.heightM).toBeCloseTo(1.2);
    // La densité devient la part foliaire : un carreau à deux tiges montre le
    // sol, un carreau plein ne le montre plus.
    expect(sujet.partFoliaire).toBeGreaterThan(0);
    expect(sujet.partFoliaire).toBeLessThanOrEqual(1);
  });

  it("donne le même identifiant d'une image à l'autre — le fourré ne grouille pas", () => {
    const { fourre } = separerLeFourre([
      arbre({ id: 1, especeId: "rubus_fruticosus", x: 9, y: 9 }),
      arbre({ id: 2, especeId: "rubus_fruticosus", x: 10, y: 10 }),
    ]);
    const a = fourre.map(fourreEnArbre).map((s) => s.id);
    const b = fourre.map(fourreEnArbre).map((s) => s.id);
    expect(a).toEqual(b);
  });
});

describe("les états de santé : deux grandeurs, deux signaux", () => {
  it("**la vigueur change la vignette : un arbre qui végète n'est pas un arbre sain**", () => {
    // Elle voyageait jusqu'ici depuis le début et n'était PAS lue à la
    // cuisson : un arbre qui végétait avait exactement le houppier d'un arbre
    // florissant. C'est le signal d'alerte PRÉCOCE du moteur — un sujet dominé
    // ou chroniquement assoiffé a une vigueur basse bien avant d'accumuler du
    // stress — donc celui qui laisse encore le temps d'agir.
    const v = vue();
    expect(cleClasse(classeDe(arbre({ vigueur: 0.2 }), 30, v))).not.toBe(
      cleClasse(classeDe(arbre({ vigueur: 1 }), 30, v)),
    );
  });

  it("le dommage hydraulique aussi, et c'est une AUTRE grandeur", () => {
    // La vigueur est réversible — l'arbre repart si les conditions
    // reviennent ; l'embolie ne se répare pas. Les confondre dans une seule
    // clé ferait dire à l'écran qu'un arbre guéri a retrouvé sa cime, ce qui
    // est faux : il lui faut des années de bois neuf.
    const v = vue();
    expect(cleClasse(classeDe(arbre({ dommageHydraulique: 0.5 }), 30, v))).not.toBe(
      cleClasse(classeDe(arbre({ dommageHydraulique: 0 }), 30, v)),
    );
  });

  it("**la cime sèche par le HAUT, jamais par le bas**", () => {
    // C'est une histoire de distance hydraulique aux racines : ce qui lâche en
    // premier est ce qui est le plus loin, donc le sommet. Un arbre qui
    // perdrait son feuillage bas serait un arbre broutté ou élagué, pas un
    // arbre assoiffé — et l'œil sait faire la différence.
    const { fabriquer } = fabriqueBouchon();
    const v = vue();
    const sain = cuireVignette(classeDe(arbre(), 30, v), 16, 0.35, fabriquer, 4);
    const sec = cuireVignette(
      classeDe(arbre({ dommageHydraulique: 0.6 }), 30, v),
      16,
      0.35,
      fabriquer,
      4,
    );
    // Les deux vignettes existent et ont la même géométrie : c'est le FEUILLAGE
    // qui manque en haut, pas l'arbre qui a rapetissé. Le bois reste dessiné,
    // et c'est ce qui distingue une cime sèche d'un arbre simplement défeuillé.
    expect(sec.hautArbrePx).toBeCloseTo(sain.hautArbrePx, 6);
    expect(sec.image.height).toBe(sain.image.height);
  });

  it("un houppier sans vigueur pâlit vers le JAUNE, pas vers l'automne", () => {
    // Une feuille d'octobre est franchement dorée ou rousse ; un arbre qui
    // végète en juillet est d'un vert malade — plus clair, plus jaune, moins
    // saturé. Confondre les deux ferait lire « l'automne arrive » là où le
    // moteur dit « celui-ci ne va pas bien ».
    const ete = { r: 86, g: 118, b: 62 };
    const malade = teinteSelonVigueur(ete, 0);
    expect(malade.r).toBeGreaterThan(ete.r);
    expect(malade.b).toBeGreaterThan(ete.b);
    // Mais il reste VERT : le vert domine encore, ce qui n'est plus vrai d'une
    // feuille d'automne.
    expect(malade.g).toBeGreaterThan(malade.b);
    // Et un arbre en pleine vigueur ne bouge pas d'un cran.
    expect(teinteSelonVigueur(ete, 1)).toEqual(ete);
  });
});

describe("ce que la cime sèche N'A PAS le droit de faire au fruit", () => {
  /**
   * Compte les marques de FRUIT seules.
   *
   * L'arbre est posé sans feuillage (`partFoliaire: 0`) — sinon le compteur
   * mélangerait les deux, et le feuillage, lui, DOIT baisser avec la cime
   * sèche : c'est tout l'objet du dessin. Le bois se trace en `stroke`, pas en
   * `fill`, donc ce qui reste est exactement le fruit.
   */
  function marquesDeFruit(dommageHydraulique: number): number {
    const { fabriquer, compte } = fabriqueBouchon();
    const v = vue(6);
    const pommier = arbre({
      especeId: "malus_domestica",
      heightM: 8,
      houppierRatio: 0.45,
      baseHouppierM: 2,
      fruitProgress: 1,
      fruitsKg: 12,
      partFoliaire: 0,
      dommageHydraulique,
    });
    cuireVignette(classeDe(pommier, 12, v), 8, 0.45, fabriquer, 2);
    return compte.remplissages;
  }

  it("**elle déplace les fruits, elle n'en retire pas**", () => {
    // Le moteur calcule `fruitsKg` SANS terme de dommage hydraulique :
    // `rendementMaxKg × sizeFactor × fruitProgress × gel × pollinisation ×
    // service`. Il dit donc qu'un arbre à cime sèche porte sa charge entière.
    //
    // La première version filtrait les rameaux secs puis parcourait le reste
    // avec la même probabilité : elle dessinait 45 % de fruits en moins sur un
    // arbre à 45 % de cime sèche. C'était atténuer le signal de RÉCOLTE — le
    // seul de l'arbre qui appelle un geste — au nom d'un mécanisme que le
    // moteur ne modélise pas. Éditer une grandeur du moteur est aussi grave que
    // d'en inventer une.
    //
    // Le « bois mort » n'existe d'ailleurs pas côté moteur : `dommage
    // Hydraulique` est un scalaire sur l'arbre, et le squelette est une
    // construction du rendu. L'incohérence à résoudre était interne au dessin ;
    // elle n'avait pas à se payer sur une donnée.
    const sain = marquesDeFruit(0);
    const sec = marquesDeFruit(0.5);
    expect(sain).toBeGreaterThan(0);
    // À la tolérance du tirage déterministe près : la charge dessinée ne suit
    // pas la cime sèche.
    expect(sec).toBeGreaterThan(sain * 0.75);
  });
});

describe("les états de conduite : trogne, chandelle, manchon", () => {
  /**
   * **L'essai qui manquait, et le défaut qu'il aurait attrapé.** La hauteur de
   * tête n'entrait pas dans la clé de cache : elle voyageait par un rappel
   * passé à la cuisson, qu'aucun appelant ne fournissait. Résultat, aucune
   * trogne n'avait de tête nulle part — et les deux planches censées comparer
   * une tête jeune et une tête creuse rendaient deux images identiques au bit
   * près, ce qu'aucun essai ne pouvait dire puisque aucun ne regardait.
   */
  it("sépare deux trognes étêtées à des hauteurs différentes", () => {
    const v = vue();
    const basse = cleClasse(classeDe(arbre({ teteTrogneM: 1.6 }), 30, v));
    const haute = cleClasse(classeDe(arbre({ teteTrogneM: 6 }), 30, v));
    expect(basse).not.toBe(haute);
    // Et deux trognes de la même parcelle, étêtées au même endroit à un
    // centimètre près, PARTAGENT leur vignette : c'est tout l'intérêt du
    // palier.
    expect(cleClasse(classeDe(arbre({ teteTrogneM: 1.61 }), 30, v))).toBe(basse);
  });

  /**
   * **Deux gradients là où il y avait un booléen.** Le rendu lisait
   * `recepages >= 2` — le seuil binaire que `biodiversite.ts` appliquait alors
   * — et dessinait donc la même tête et le même creux pour un têtard de trois
   * coupes et pour un saule centenaire. `trogne.ts` donne maintenant un
   * diamètre qui s'épaissit et une cavité qui se creuse ; l'image doit suivre
   * les deux.
   */
  it("sépare une jeune tête d'un têtard centenaire, et pas seulement d'un arbre nu", () => {
    const v = vue();
    const tete = (recepages: number) => {
      const t = { teteTrogneM: 2.2, recepages };
      return cleClasse(
        classeDe(
          arbre({ ...t, diametreTeteCm: diametreTeteCm(t), caviteTeteL: volumeCaviteL(t) }),
          30,
          v,
        ),
      );
    };
    // Les valeurs viennent du moteur, pas de la planche : l'essai tombe si
    // `trogne.ts` change d'échelle.
    expect(new Set([tete(1), tete(6), tete(25)]).size).toBe(3);
  });

  it("dessine un renflement de plus sur une trogne que sur un arbre ordinaire", () => {
    const ordinaire = fabriqueBouchon();
    const trogne = fabriqueBouchon();
    const v = vue(6);
    cuireVignette(classeDe(arbre(), 30, v), 16, 0.35, ordinaire.fabriquer, 4);
    cuireVignette(classeDe(arbre({ teteTrogneM: 2.2 }), 30, v), 16, 0.35, trogne.fabriquer, 4, {
      teteTrogneM: 2.2,
      diametreTeteCm: 25,
      caviteTeteL: 0,
    });
    expect(trogne.compte.remplissages).toBeGreaterThan(ordinaire.compte.remplissages);
  });

  /**
   * **Le renflement vient du MOTEUR, plus du rayon du fût.** C'était une
   * allométrie maison (`rayonAuPiedM × 2,2`), portée en issue #19 justement
   * parce qu'une taille de tête a une conséquence écologique qu'une valeur
   * inventée n'aurait jamais rencontrée. `trogne.ts` la donne : même arbre,
   * deux diamètres, deux têtes.
   */
  it("dimensionne la tête sur le diamètre du moteur, pas sur le fût", () => {
    const petite = fabriqueBouchon();
    const grosse = fabriqueBouchon();
    const v = vue(6);
    const c = classeDe(arbre({ teteTrogneM: 2.2, partFoliaire: 0 }), 30, v);
    cuireVignette(c, 16, 0.35, petite.fabriquer, 4, {
      teteTrogneM: 2.2,
      diametreTeteCm: 25,
      caviteTeteL: 0,
    });
    cuireVignette(c, 16, 0.35, grosse.fabriquer, 4, {
      teteTrogneM: 2.2,
      diametreTeteCm: 120,
      caviteTeteL: 0,
    });
    // Le bouchon ne mesure pas les ellipses ; ce qu'il voit, c'est que la même
    // CLASSE et le même arbre donnent le même nombre de tracés — donc que la
    // différence passe bien par la dimension et non par un tracé de plus.
    expect(grosse.compte.remplissages).toBe(petite.compte.remplissages);
    expect(grosse.compte.ellipses.length).toBeGreaterThan(0);
    const dPetite = petite.compte.ellipses.at(0)?.rx ?? 0;
    const dGrosse = grosse.compte.ellipses.at(0)?.rx ?? 0;
    // 120 cm contre 25 : un facteur 4,8, et il doit se retrouver à l'écran.
    expect(dGrosse / dPetite).toBeCloseTo(120 / 25, 1);
  });

  it("ne creuse pas une tête d'un seul étêtage : une coupe est une plaie", () => {
    const v = vue(6);
    const jeune = fabriqueBouchon();
    const creuse = fabriqueBouchon();
    const c = classeDe(arbre({ teteTrogneM: 2.2, partFoliaire: 0 }), 30, v);
    // Les valeurs du moteur pour un et pour six étêtages.
    cuireVignette(c, 16, 0.35, jeune.fabriquer, 4, {
      teteTrogneM: 2.2,
      diametreTeteCm: 25,
      caviteTeteL: 0,
    });
    cuireVignette(c, 16, 0.35, creuse.fabriquer, 4, {
      teteTrogneM: 2.2,
      diametreTeteCm: 55,
      caviteTeteL: 17.8,
    });
    expect(creuse.compte.remplissages).toBe(jeune.compte.remplissages + 1);
  });

  /**
   * Le creux se dessine à sa TAILLE, et pas à une fraction de la tête. Un
   * volume est une sphère : son diamètre est la racine cubique du volume, si
   * bien qu'un creux de dix litres et un de cent ne sont pas dans un rapport
   * de dix à l'écran mais de deux — ce qui est exactement juste, et ce qu'une
   * fraction constante aurait manqué dans les deux sens.
   */
  it("dessine le creux au diamètre que son volume implique", () => {
    const v = vue(6);
    const dix = fabriqueBouchon();
    const cent = fabriqueBouchon();
    const c = classeDe(arbre({ teteTrogneM: 2.2, partFoliaire: 0 }), 30, v);
    // Une tête assez large pour que le plafond de dessin ne morde pas.
    const tete = { teteTrogneM: 2.2, diametreTeteCm: 120 };
    cuireVignette(c, 16, 0.35, dix.fabriquer, 4, { ...tete, caviteTeteL: 10 });
    cuireVignette(c, 16, 0.35, cent.fabriquer, 4, { ...tete, caviteTeteL: 100 });
    const rDix = dix.compte.ellipses.at(1)?.rx ?? 0;
    const rCent = cent.compte.ellipses.at(1)?.rx ?? 0;
    expect(rDix).toBeGreaterThan(0);
    expect(rCent / rDix).toBeCloseTo(10 ** (1 / 3), 1);
  });

  it("grise le bois d'une chandelle et noircit celui d'un brûlé", () => {
    const v = vue(6);
    const vivant = fabriqueBouchon();
    const morte = fabriqueBouchon();
    const brulee = fabriqueBouchon();
    const nu = { partFoliaire: 0 } as const;
    cuireVignette(classeDe(arbre(nu), 30, v), 16, 0.35, vivant.fabriquer, 4);
    cuireVignette(classeDe(arbre({ ...nu, chandelle: true }), 30, v), 16, 0.35, morte.fabriquer, 4);
    cuireVignette(
      classeDe(arbre({ ...nu, chandelle: true, brulee: true }), 30, v),
      16,
      0.35,
      brulee.fabriquer,
      4,
    );
    // Le même bois, trois états, trois teintes — et le brûlé est le plus
    // sombre des trois, sinon le feu ne se lirait pas.
    const clarte = (c: readonly string[]) => {
      const n = c
        .map((s) => s.match(/\d+/g)?.map(Number) ?? [])
        .filter((t) => t.length >= 3)
        .map((t) => ((t[0] ?? 0) + (t[1] ?? 0) + (t[2] ?? 0)) / 3);
      return n.reduce((a, b) => a + b, 0) / Math.max(1, n.length);
    };
    expect(clarte(brulee.compte.couleurs)).toBeLessThan(clarte(morte.compte.couleurs));
    expect(clarte(vivant.compte.couleurs)).not.toBeCloseTo(clarte(morte.compte.couleurs), 0);
  });

  /**
   * Le manchon monte à `HAUTEUR_BROUTAGE_M` — la hauteur de dent du moteur —
   * et pas à une hauteur choisie ici. L'essai lit la constante du moteur plutôt
   * que d'en réécrire la valeur : c'est le seul moyen qu'il tombe si le moteur
   * change d'avis.
   */
  it("monte le manchon à la hauteur de dent du moteur, et pas plus large qu'un tube", () => {
    const { fabriquer, compte } = fabriqueBouchon();
    const c = classeDe(arbre({ heightM: 0.9, baseHouppierM: 0, protege: true }), 30, vue(6));
    const v = cuireVignette(c, 0.9, 0.4, fabriquer, 0);
    const tube = compte.rects.at(-1);
    expect(tube).toBeDefined();
    if (!tube) return;
    // L'échelle de la vignette : le pied est en bas, la tête du tube est à
    // `HAUTEUR_BROUTAGE_M` au-dessus.
    const pixelsParMetre = v.hautArbrePx / 0.9;
    expect(tube.h / pixelsParMetre).toBeCloseTo(HAUTEUR_BROUTAGE_M, 1);
    // Un tube, pas un mur : dix centimètres de diamètre, pas une fraction de
    // sa propre hauteur.
    expect(tube.l / pixelsParMetre).toBeCloseTo(0.1, 2);
    // Et il tient tout entier dans l'image : c'est la marge de vignette qui
    // lui fait la place, sinon il sort par le haut.
    expect(tube.y).toBeGreaterThanOrEqual(0);
  });

  it("ne dessine de manchon que sur un plant protégé", () => {
    const sans = fabriqueBouchon();
    const avec = fabriqueBouchon();
    const v = vue(6);
    const jeune = { heightM: 0.9, baseHouppierM: 0 } as const;
    cuireVignette(classeDe(arbre(jeune), 30, v), 0.9, 0.4, sans.fabriquer, 0);
    cuireVignette(classeDe(arbre({ ...jeune, protege: true }), 30, v), 0.9, 0.4, avec.fabriquer, 0);
    expect(sans.compte.rects).toHaveLength(0);
    expect(avec.compte.rects).toHaveLength(1);
  });
});

describe("le frottis : la seule trace lisible d'un dégât de gibier", () => {
  it("sépare une tige frottée d'une tige intacte", () => {
    const v = vue();
    expect(cleClasse(classeDe(arbre({ frotte: true }), 30, v))).not.toBe(
      cleClasse(classeDe(arbre(), 30, v)),
    );
  });

  it("pose la plaie sur le fût : deux tracés de plus, l'ourlet et le bois à nu", () => {
    const intacte = fabriqueBouchon();
    const frottee = fabriqueBouchon();
    const v = vue(6);
    // Une tige dans la fourchette du moteur, et sans feuillage pour que le
    // compte ne mesure que le bois.
    const tige = { heightM: 2.5, baseHouppierM: 0.9, partFoliaire: 0 } as const;
    cuireVignette(classeDe(arbre(tige), 30, v), 2.5, 0.4, intacte.fabriquer, 0.9);
    cuireVignette(
      classeDe(arbre({ ...tige, frotte: true }), 30, v),
      2.5,
      0.4,
      frottee.fabriquer,
      0.9,
    );
    expect(frottee.compte.remplissages).toBe(intacte.compte.remplissages + 2);
  });

  /**
   * La plaie est du bois MIS À NU : plus clair que l'écorce, et cerné d'un
   * lambeau plus sombre qu'elle. Sans ces deux bouts, la tache se lit comme le
   * côté éclairé du fût — qui est dessiné juste à côté par la même méthode.
   */
  it("pose du bois plus clair que l'écorce et un ourlet plus sombre", () => {
    const { fabriquer, compte } = fabriqueBouchon();
    const tige = { heightM: 2.5, baseHouppierM: 0.9, partFoliaire: 0, frotte: true } as const;
    cuireVignette(classeDe(arbre(tige), 30, vue(6)), 2.5, 0.4, fabriquer, 0.9);
    const clarte = (css: string) => {
      const t = css.match(/\d+/g)?.map(Number) ?? [];
      return ((t[0] ?? 0) + (t[1] ?? 0) + (t[2] ?? 0)) / 3;
    };
    const posees = compte.couleurs.map(clarte);
    const ourlet = posees.at(-2);
    const nu = posees.at(-1);
    expect(ourlet).toBeDefined();
    expect(nu).toBeDefined();
    if (ourlet === undefined || nu === undefined) return;
    // L'écorce du charme tourne autour de 110-140 de clarté moyenne ; on ne
    // fixe pas de valeur, on demande l'ORDRE : ourlet < écorce < bois à nu.
    const ecorce = posees.slice(0, -2);
    const moyenne = ecorce.reduce((a, b) => a + b, 0) / Math.max(1, ecorce.length);
    expect(ourlet).toBeLessThan(moyenne);
    expect(nu).toBeGreaterThan(moyenne);
  });

  it("ne dessine rien quand la tige est trop petite à l'écran pour porter une plaie", () => {
    // Au zoom parcelle, la plaie ferait moins de deux pixels de haut : un point
    // sombre au hasard sur un fût ressemble à un défaut de rendu, pas à une
    // blessure.
    const intacte = fabriqueBouchon();
    const frottee = fabriqueBouchon();
    const v = vue(0.15);
    const tige = { heightM: 2.5, baseHouppierM: 0.9, partFoliaire: 0 } as const;
    cuireVignette(classeDe(arbre(tige), 30, v), 2.5, 0.4, intacte.fabriquer, 0.9);
    cuireVignette(
      classeDe(arbre({ ...tige, frotte: true }), 30, v),
      2.5,
      0.4,
      frottee.fabriquer,
      0.9,
    );
    expect(frottee.compte.remplissages).toBe(intacte.compte.remplissages);
  });
});

describe("le liège : le seul état dont le moteur donne la DURÉE", () => {
  const suber = (p: Partial<ArbreAPoser> = {}): ArbreAPoser =>
    arbre({ especeId: "quercus_suber", heightM: 12, baseHouppierM: 3.6, ...p });

  /**
   * `partEcorceRefaite` ne recopie pas la règle du moteur, elle en lit la
   * constante : `especes.ts` porte `ecorce.rotationAns`, et `ecorceRecoltable`
   * compare le même rapport à 1. L'essai lit la constante à la source, pour
   * qu'il tombe si le moteur change la rotation.
   */
  it("suit la rotation du moteur, d'un bout à l'autre", () => {
    const rotation = getEspece("quercus_suber").ecorce?.rotationAns;
    expect(rotation).toBeDefined();
    if (rotation === undefined) return;
    expect(partEcorceRefaite(suber({ semainesDepuisLevee: 0 }))).toBe(0);
    expect(partEcorceRefaite(suber({ semainesDepuisLevee: rotation * 52 }))).toBe(1);
    expect(partEcorceRefaite(suber({ semainesDepuisLevee: (rotation * 52) / 2 }))).toBeCloseTo(
      0.5,
      5,
    );
    // Au-delà de la rotation, l'écorce ne se refait pas « plus que refaite ».
    expect(partEcorceRefaite(suber({ semainesDepuisLevee: rotation * 52 * 3 }))).toBe(1);
  });

  it("ne dit rien d'une espèce qu'on ne démascle pas", () => {
    // Un hêtre n'a pas de bloc `ecorce` : la grandeur n'a pas de sens pour lui,
    // et le rendu ne doit surtout pas lui inventer une rotation.
    expect(getEspece("fagus_sylvatica").ecorce).toBeUndefined();
    expect(partEcorceRefaite(arbre({ semainesDepuisLevee: 0 }))).toBe(1);
  });

  it("sépare un tronc à vif d'un tronc refait, et pas seulement levé de non levé", () => {
    const v = vue();
    const vif = cleClasse(classeDe(suber({ semainesDepuisLevee: 0 }), 20, v));
    const mi = cleClasse(classeDe(suber({ semainesDepuisLevee: 5 * 52 }), 20, v));
    const refait = cleClasse(classeDe(suber({ semainesDepuisLevee: 10 * 52 }), 20, v));
    expect(new Set([vif, mi, refait]).size).toBe(3);
    // Un arbre jamais démasclé et un arbre dont l'écorce est refaite sont la
    // MÊME image : il n'y a rien à distinguer, et c'est ce que dit le moteur en
    // les rendant tous deux récoltables.
    expect(cleClasse(classeDe(suber(), 20, v))).toBe(refait);
  });

  it("pose la bande sur le bas du fût, et rien une fois l'écorce refaite", () => {
    const refait = fabriqueBouchon();
    const vif = fabriqueBouchon();
    const v = vue(6);
    const nu = { partFoliaire: 0 } as const;
    cuireVignette(classeDe(suber(nu), 20, v), 12, 0.4, refait.fabriquer, 3.6);
    const vignette = cuireVignette(
      classeDe(suber({ ...nu, semainesDepuisLevee: 0 }), 20, v),
      12,
      0.4,
      vif.fabriquer,
      3.6,
    );
    expect(refait.compte.rects).toHaveLength(0);
    expect(vif.compte.rects).toHaveLength(1);
    const bande = vif.compte.rects[0];
    expect(bande).toBeDefined();
    if (!bande) return;
    // **La hauteur de démasclage, en MÈTRES, et c'est là que le défaut se
    // voyait.** La première version colorait les segments du squelette ; le fût
    // d'un chêne-liège tient en un seul segment, donc la bande montait jusqu'au
    // houppier — quatre mètres au lieu de deux et demi, et la limite sautait
    // avec la découpe du squelette.
    const pixelsParMetre = vignette.hautArbrePx / 12;
    expect(bande.h / pixelsParMetre).toBeCloseTo(2.6, 1);
    // Et elle part du PIED : le bas de la bande touche le bas de l'image.
    expect(bande.y + bande.h).toBeCloseTo(vignette.piedY, 0);
  });
});

describe("la clé de classe : tout champ qui entre dans la classe entre dans la clé", () => {
  /**
   * **L'essai qui aurait évité un gel silencieux.** `scene.ts` avait sa propre
   * clé de texture, recopiée champ par champ depuis `cleClasse`, et elle a
   * dérivé trois fois : la santé, le fruit et le liège sont entrés dans la
   * classe sans entrer dans la copie. Deux classes distinctes tombaient alors
   * sur la même clé, on détruisait une texture qu'un sprite déjà posé tenait
   * encore, et le rendu levait une exception DANS le rappel d'animation — qui
   * n'atteignait donc jamais son `requestAnimationFrame` suivant. La vue de
   * parcelle rendait une image, puis gelait.
   *
   * Le poseur appelle maintenant `cleClasse`. Cet essai garde l'autre bout :
   * il parcourt les champs de la classe par réflexion, si bien qu'un champ
   * ajouté demain est couvert sans qu'on y pense — c'est précisément ce qui a
   * manqué trois fois.
   */
  it("change de clé dès qu'un champ de la classe change, quel qu'il soit", () => {
    const base = classeDe(arbre(), 30, vue());
    const cle = cleClasse(base);
    for (const champ of Object.keys(base) as (keyof typeof base)[]) {
      const valeur = base[champ];
      const autre =
        typeof valeur === "number"
          ? { ...base, [champ]: valeur + 1 }
          : { ...base, [champ]: `${valeur}-autre` };
      expect(cleClasse(autre), `le champ « ${champ} » ne compte pas dans la clé`).not.toBe(cle);
    }
  });

  it("ne change pas de clé sans raison : deux classes égales ont la même clé", () => {
    const a = classeDe(arbre(), 30, vue());
    const b = classeDe(arbre(), 30, vue());
    expect(cleClasse(a)).toBe(cleClasse(b));
  });
});

describe("le bouquet : l'unité de dessin, et ce qui la distingue d'une espèce à l'autre", () => {
  /**
   * **L'écart que la planche des trois sujets a rendu visible.** Le §4 pose que
   * l'unité de dessin est le bouquet et non la feuille ; le bouquet était
   * pourtant le seul élément du houppier sans caractère d'espèce. Un hêtre et un
   * bouleau vus de près portaient exactement le même disque déchiqueté, et le
   * pin sylvestre — dont le code croyait dessiner une brosse — sortait en
   * boules rondes.
   *
   * Le port se DÉDUIT de la forme de la feuille, déjà déclarée : rien de
   * nouveau n'entre dans les fiches, donc rien ne peut les contredire.
   */
  it("allonge et découpe une fronde composée plus qu'une rosette ovale", () => {
    const fronde = portDuBouquet("composee");
    const rosette = portDuBouquet("ovale");
    expect(fronde.allongement).toBeGreaterThan(rosette.allongement);
    expect(fronde.decoupe).toBeGreaterThan(rosette.decoupe);
    // Une rosette n'a pas d'axe : c'est ce qui la dispense d'être orientée.
    expect(rosette.allongement).toBe(1);
  });

  it("fait de l'aiguille le port le plus allongé de tous", () => {
    const formes: FormeFeuille[] = [
      "ovale",
      "triangulaire",
      "tronquee",
      "coriace",
      "dentee",
      "cordee",
      "lobee",
      "composee",
      "lanceolee",
    ];
    const brosse = portDuBouquet("aiguille").allongement;
    for (const f of formes) {
      expect(portDuBouquet(f).allongement, `« ${f} » devrait rester sous la brosse`).toBeLessThan(
        brosse,
      );
    }
  });

  it("borne la découpe : un bord irrégulier, jamais une explosion", () => {
    const formes: FormeFeuille[] = [
      "ovale",
      "triangulaire",
      "tronquee",
      "aiguille",
      "coriace",
      "dentee",
      "cordee",
      "lobee",
      "composee",
      "lanceolee",
    ];
    for (const f of formes) {
      const p = portDuBouquet(f);
      expect(p.decoupe).toBeGreaterThan(0);
      // Au-delà de 1, le rayon d'un sommet passerait sous zéro et le contour
      // se retournerait sur lui-même.
      expect(p.decoupe).toBeLessThanOrEqual(1);
      expect(p.allongement).toBeGreaterThanOrEqual(1);
    }
  });

  it("oriente le bouquet du pin sur son rameau, pas celui du hêtre", () => {
    // Vignette petite exprès : sous le seuil de détail, aucune feuille n'est
    // tracée, donc les rotations comptées ne viennent que des bouquets.
    const pin = fabriqueBouchon();
    const hetre = fabriqueBouchon();
    const v = vue(0.6);
    cuireVignette(
      classeDe(arbre({ especeId: "pinus_sylvestris" }), 30, v),
      16,
      0.3,
      pin.fabriquer,
      4,
    );
    cuireVignette(
      classeDe(arbre({ especeId: "fagus_sylvatica" }), 30, v),
      16,
      0.35,
      hetre.fabriquer,
      4,
    );
    expect(pin.compte.rotations).toBeGreaterThan(0);
    expect(hetre.compte.rotations).toBe(0);
  });

  /**
   * **L'aire d'un bouquet ne change pas quand il s'allonge**, et ce n'est pas
   * cosmétique : le calibre est calculé pour qu'un nombre donné de taches
   * couvre la part voulue du houppier. Étirer sans compenser aurait changé la
   * transparence de chaque espèce au passage — un pin serait devenu plus clair
   * qu'un hêtre pour une raison qui n'a rien à voir avec sa densité.
   */
  it("ne change pas le NOMBRE de bouquets selon le port", () => {
    const pin = fabriqueBouchon();
    const hetre = fabriqueBouchon();
    const v = vue(0.6);
    cuireVignette(
      classeDe(arbre({ especeId: "pinus_sylvestris" }), 30, v),
      16,
      0.3,
      pin.fabriquer,
      4,
    );
    cuireVignette(
      classeDe(arbre({ especeId: "fagus_sylvatica" }), 30, v),
      16,
      0.3,
      hetre.fabriquer,
      4,
    );
    // Les deux fiches n'ont pas la même densité, donc pas le même compte — ce
    // qu'on vérifie, c'est qu'un bouquet reste UN remplissage, et que le port
    // n'en ajoute ni n'en retire.
    expect(pin.compte.remplissages).toBeGreaterThan(0);
    expect(hetre.compte.remplissages).toBeGreaterThan(0);
  });
});

describe("le repli de la profondeur : un panneau vu de face a quand même une épaisseur", () => {
  /**
   * **Le défaut le plus coûteux de cette passe, et il tenait à un axe jeté.**
   * `versPx` ne lisait que `x` et `y` du squelette : une branche pointée vers
   * l'objectif projetait donc sur `x = 0` et s'écrasait sur le tronc. Une
   * ramure OPPOSÉE (`branchesParNoeud: 3`, `divergenceDeg: 90`) alterne
   * exactement entre deux plans perpendiculaires — un nœud sur deux partait
   * droit vers la caméra. Les bouquets s'empilaient en colonnes verticales et
   * le cornouiller sortait en chapelets de perles.
   *
   * J'avais d'abord attribué ça à l'allongement du bouquet. À tort : le
   * cornouiller déclare une feuille ovale, son bouquet est une rosette ronde,
   * il n'avait aucun allongement à baisser. Chercher le réglage plutôt que la
   * grandeur perdue, une fois de plus.
   */
  const seg = (dx: number, dz: number): Segment => ({
    depart: { x: 0, y: 0, z: 0 },
    arrivee: { x: dx, y: 1, z: dz },
    rayonDepartM: 0.05,
    rayonArriveeM: 0.03,
    ordre: 1,
    terminal: true,
  });

  it("donne une largeur à l'écran à une branche pointée vers l'objectif", () => {
    const [vers] = replier([seg(0, 1)]);
    expect(vers).toBeDefined();
    if (!vers) return;
    // Avant, c'était zéro : la branche n'existait pas.
    expect(Math.abs(vers.arrivee.x)).toBeGreaterThan(0.2);
    expect(vers.arrivee.x).toBeCloseTo(PROFONDEUR_OBLIQUE, 6);
  });

  it("sépare l'avant de l'arrière, au lieu de les confondre", () => {
    const [devant] = replier([seg(0, 1)]);
    const [derriere] = replier([seg(0, -1)]);
    expect(devant?.arrivee.x).toBeCloseTo(-(derriere?.arrivee.x ?? 0), 6);
  });

  it("ne touche pas une branche déjà dans le plan du panneau", () => {
    const [plat] = replier([seg(1, 0)]);
    expect(plat?.arrivee.x).toBeCloseTo(1, 6);
    expect(plat?.arrivee.y).toBeCloseTo(1, 6);
    // Et la profondeur est CONSOMMÉE : plus rien ne reste à replier ensuite.
    expect(plat?.arrivee.z).toBe(0);
  });

  /**
   * **La mesure qui a fini par dire le mécanisme, après deux fausses pistes.**
   * Une ramure opposée ne prend que quatre azimuts — 0, 90, 180, 270 degrés —
   * et leur COSINUS, seul facteur que lisait la projection, n'en prend que
   * trois : 1, 0, −1. Les décalages horizontaux se quantifiaient donc, les
   * bouts tombaient sur un réseau de positions, et les bouquets s'empilaient en
   * colonnes. Le sinus vaut 0 ou ±1 là où le cosinus vaut ±1 ou 0 : le replier
   * donne quatre multiplicateurs au lieu de trois, et le réseau se démultiplie
   * d'ordre en ordre.
   *
   * Ce n'est donc PAS « les branches vers l'objectif s'écrasent sur le tronc »,
   * ce que j'ai cru et qui est mesuré faux : 2 % des bouts seulement passaient
   * près de l'axe. Ce qui s'écrasait était l'ÉCART, pas la position.
   */
  it("démultiplie les positions d'un houppier à ramure opposée", () => {
    // La fiche du cornouiller, dans ce qu'elle a de décisif : une paire de
    // latérales opposées, une divergence d'un quart de tour, un bois raide.
    const opposee = {
      angleDeg: 50,
      divergenceDeg: 90,
      ratioLongueur: 0.7,
      dominance: 0.34,
      branchesParNoeud: 3,
      conicite: 0.82,
      tortuosite: 0.18,
    };
    const sujet = { id: 11, hauteurM: 6, houppierRatio: 0.5, baseHouppierM: 0.5, brins: 3 };
    const passe = (avecRepli: boolean) => {
      const engendre = engendrer(sujet, opposee, 600);
      const brut = avecRepli ? replier(engendre) : engendre;
      const houppier = brut.filter((s) => s.ordre >= 1);
      const base = Math.min(...houppier.map((s) => s.depart.y));
      const sommet = Math.max(...houppier.map((s) => s.arrivee.y));
      return contraindre(brut, "boule", base, sommet, 0.5 * 6).filter((s) => s.terminal);
    };
    /** Combien de COLONNES distinctes, au décimètre près. */
    const colonnes = (segs: readonly Segment[]) =>
      new Set(segs.map((s) => Math.round(s.arrivee.x * 10))).size;
    const sans = passe(false);
    const avec = passe(true);
    expect(sans.length).toBe(avec.length);
    // Mesuré : 35 colonnes sans, 59 avec, sur 243 bouts. On demande la moitié
    // de ce gain, pour que l'essai tienne à un réglage près.
    expect(colonnes(avec)).toBeGreaterThan(colonnes(sans) * 1.3);
  });
});

describe("le brout : le dégât qui était entièrement invisible", () => {
  const plant = (p: Partial<ArbreAPoser> = {}): ArbreAPoser =>
    arbre({ heightM: 1.4, baseHouppierM: 0, ...p });

  it("sépare un plant brouté d'un plant intact", () => {
    const v = vue();
    expect(cleClasse(classeDe(plant({ broute: true }), 30, v))).not.toBe(
      cleClasse(classeDe(plant(), 30, v)),
    );
  });

  /**
   * **L'essai qui aurait attrapé le défaut que la planche a montré.** Le
   * premier jet posait les sections AVANT le feuillage — avec un commentaire
   * affirmant le contraire — et elles étaient purement invisibles : un bout de
   * rameau est par construction sous le bouquet qu'il porte. Le compte de
   * tracés montait bien, lui, ce qui aurait suffi à faire passer un essai
   * naïf.
   *
   * On mesure donc l'ORDRE : la dernière couleur posée doit être celle du bois
   * à nu, pas celle d'une feuille.
   */
  it("pose les sections DEVANT le feuillage, pas dessous", () => {
    const { fabriquer, compte } = fabriqueBouchon();
    const c = classeDe(plant({ broute: true, partFoliaire: 1 }), 30, vue(6));
    cuireVignette(c, 1.4, 0.4, fabriquer, 0);
    const clarte = (css: string) => {
      const t = css.match(/\d+/g)?.map(Number) ?? [];
      return { r: t[0] ?? 0, g: t[1] ?? 0, b: t[2] ?? 0 };
    };
    const derniere = clarte(compte.couleurs.at(-1) ?? "");
    // Du bois à nu : clair, et surtout PAS plus vert que rouge.
    expect(derniere.r).toBeGreaterThan(derniere.g);
    expect(derniere.r).toBeGreaterThan(150);
  });

  it("prend la flèche et quelques pousses, pas un rameau sur deux", () => {
    const sans = fabriqueBouchon();
    const avec = fabriqueBouchon();
    const v = vue(6);
    cuireVignette(classeDe(plant({ partFoliaire: 0 }), 30, v), 1.4, 0.4, sans.fabriquer, 0);
    cuireVignette(
      classeDe(plant({ broute: true, partFoliaire: 0 }), 30, v),
      1.4,
      0.4,
      avec.fabriquer,
      0,
    );
    const sections = avec.compte.remplissages - sans.compte.remplissages;
    expect(sections).toBeGreaterThan(0);
    // Le premier jet en posait un sur deux : sur un semis qui porte des
    // dizaines de bouts, ça donnait un plant couvert de points crème qu'on
    // lisait comme des baies.
    expect(sections).toBeLessThan(20);
  });

  /**
   * La hauteur de dent vient du moteur : `HAUTEUR_BROUTAGE_M` est la hauteur
   * au-delà de laquelle « la flèche est hors d'atteinte et le plant est
   * sorti ». Un arbre entièrement au-dessus ne porte donc aucune marque, même
   * si le champ est renseigné — il a été brouté quand il était petit.
   */
  it("ne marque rien au-dessus de la hauteur de dent du moteur", () => {
    const sans = fabriqueBouchon();
    const avec = fabriqueBouchon();
    const v = vue(6);
    // Un houppier qui commence bien au-dessus de la hauteur de dent.
    const grand = { heightM: 16, baseHouppierM: HAUTEUR_BROUTAGE_M * 3, partFoliaire: 0 } as const;
    cuireVignette(classeDe(arbre(grand), 30, v), 16, 0.35, sans.fabriquer, grand.baseHouppierM);
    cuireVignette(
      classeDe(arbre({ ...grand, broute: true }), 30, v),
      16,
      0.35,
      avec.fabriquer,
      grand.baseHouppierM,
    );
    expect(avec.compte.remplissages).toBe(sans.compte.remplissages);
  });
});
