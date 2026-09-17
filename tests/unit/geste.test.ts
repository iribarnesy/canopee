/**
 * La mise en scène des cinq gestes sur arbres (§6.2).
 *
 * **Ce que ces essais gardent, c'est le partage entre les deux mises en
 * scène** — et il ne suit pas le type du geste mais ce que le moteur en DIT.
 * Une tige entière couchée porte une `directionRad` ; une charpente démontée
 * sur place n'en porte pas, « parce que le moteur n'y voit pas une direction
 * unique et n'en invente pas ». Le rendu qui trancherait sur le type se
 * tromperait le jour où un geste change de nature, et il dessinerait un
 * élagage comme un abattage.
 *
 * Le second point tenu : **un recépage alimente les deux**. La cépée tombe, la
 * souche reste — c'est le seul geste qui le fasse, et c'est celui qui casse une
 * implémentation qui aurait supposé l'exclusivité.
 */

import { describe, expect, it } from "vitest";
import type { ArbreRetire, GesteVisible } from "../../src/engine/actions";
import { getEspece } from "../../src/engine/especes";
import { type Vue, vueInitiale } from "../../src/render/camera";
import { DEBOUT } from "../../src/render/temps/chute";
import { planDEllipse } from "../../src/render/temps/ellipse";
import {
  demasclageEnCours,
  estUneTige,
  idDeLArbre,
  idDeLaTige,
  poseDeLaPlantation,
  recolteEnCours,
  remodelageEnCours,
  tigeAbattueDe,
} from "../../src/render/temps/geste";
import {
  chuteDeLaTige,
  indexerLesGestes,
  poseDuPlant,
  remodelageDe,
  tigesAbattues,
} from "../../src/render/temps/lecteur";

const COTE = 100;
const vue = (): Vue => vueInitiale(COTE, 1600, 900);

const retire = (patch: Partial<ArbreRetire> = {}): ArbreRetire => ({
  id: 7,
  x: 40,
  y: 50,
  especeId: "quercus_robur",
  diametreCm: 32,
  hauteurAvantM: 18,
  hauteurApresM: 0,
  baseHouppierAvantM: 6,
  baseHouppierApresM: 0,
  directionRad: -Math.PI / 4,
  ...patch,
});

/** Les quatre gestes tels que le moteur les rapporte vraiment. */
const COUPE = retire();
const ELAGAGE = retire({
  id: 8,
  hauteurApresM: 18,
  baseHouppierAvantM: 3,
  baseHouppierApresM: 9,
  directionRad: undefined,
});
const TROGNE = retire({
  id: 9,
  hauteurAvantM: 12,
  hauteurApresM: 2.5,
  baseHouppierAvantM: 4,
  baseHouppierApresM: 2.5,
  directionRad: undefined,
});
const RECEPAGE = retire({
  id: 10,
  hauteurAvantM: 9,
  hauteurApresM: 0.3,
  baseHouppierAvantM: 2,
  baseHouppierApresM: 0.3,
  directionRad: 1.2,
});

describe("les identifiants de tige", () => {
  it("ne peuvent pas entrer en collision avec ceux du moteur", () => {
    // Un recépage laisse la souche en jeu AVEC son identifiant : si la tige
    // portait le même, la souche tomberait avec la cépée.
    for (const id of [0, 1, 7, 4096, 10 ** 6]) {
      expect(idDeLaTige(id)).toBeLessThan(0);
      expect(estUneTige(idDeLaTige(id))).toBe(true);
      expect(estUneTige(id)).toBe(false);
    }
  });

  it("se remontent", () => {
    for (const id of [0, 3, 12345]) expect(idDeLArbre(idDeLaTige(id))).toBe(id);
  });
});

describe("ce qui tombe", () => {
  it("emporte toute la hauteur d'une coupe rase", () => {
    const t = tigeAbattueDe(COUPE);
    expect(t?.heightM).toBe(18);
    expect(t?.baseHouppierM).toBe(6);
    expect(t?.hauteurDeCoupeM).toBe(0);
  });

  it("emporte la CÉPÉE d'un recépage, pas la souche", () => {
    const t = tigeAbattueDe(RECEPAGE);
    expect(t?.heightM).toBeCloseTo(8.7, 6);
    // Le houppier est compté depuis le pied de la TIGE, donc depuis la coupe.
    expect(t?.baseHouppierM).toBeCloseTo(1.7, 6);
    // Et la tige pivote autour de la coupe, pas du sol : à fort zoom une
    // souche de trente centimètres fait une vingtaine de pixels.
    expect(t?.hauteurDeCoupeM).toBeCloseTo(0.3, 6);
  });

  it("ne tombe PAS quand le moteur ne donne pas de direction", () => {
    // « La charpente est démontée sur place : le moteur n'y voit pas une
    // direction unique et n'en invente pas. » Le rendu non plus.
    expect(tigeAbattueDe(ELAGAGE)).toBeUndefined();
    expect(tigeAbattueDe(TROGNE)).toBeUndefined();
  });

  it("ne fabrique pas une tige de hauteur nulle", () => {
    expect(tigeAbattueDe(retire({ hauteurAvantM: 5, hauteurApresM: 5 }))).toBeUndefined();
  });

  it("garde l'espèce, pour que le fût ressemble à l'arbre d'avant", () => {
    // Une tige abattue qui ne ressemblerait pas à l'arbre qu'elle était une
    // image plus tôt ferait un raccord visible.
    expect(tigeAbattueDe(COUPE)?.especeId).toBe("quercus_robur");
  });
});

describe("ce qui reste debout", () => {
  it("part de l'arbre d'AVANT et arrive à l'instantané", () => {
    // L'inversion du §6.3 : le jeu ne reçoit que l'état d'arrivée, donc la
    // mise en scène remonte le temps au début de l'acte.
    expect(remodelageEnCours(ELAGAGE, 0)?.baseHouppierM).toBe(3);
    expect(remodelageEnCours(ELAGAGE, 1)?.baseHouppierM).toBe(9);
    expect(remodelageEnCours(ELAGAGE, 0.5)?.baseHouppierM).toBe(6);
  });

  it("fait MONTER la base du houppier d'un élagage, sans toucher la hauteur", () => {
    const a = remodelageEnCours(ELAGAGE, 0);
    const b = remodelageEnCours(ELAGAGE, 1);
    expect(b?.baseHouppierM ?? 0).toBeGreaterThan(a?.baseHouppierM ?? 0);
    expect(a?.heightM).toBe(b?.heightM);
  });

  it("fait DESCENDRE la hauteur d'un étêtage", () => {
    expect(remodelageEnCours(TROGNE, 0)?.heightM).toBe(12);
    expect(remodelageEnCours(TROGNE, 1)?.heightM).toBe(2.5);
  });

  it("remodèle AUSSI la souche d'un recépage — la cépée tombe, la souche reste", () => {
    // Le seul geste qui alimente les deux mises en scène.
    expect(tigeAbattueDe(RECEPAGE)).toBeDefined();
    expect(remodelageEnCours(RECEPAGE, 0)?.heightM).toBe(9);
    expect(remodelageEnCours(RECEPAGE, 1)?.heightM).toBe(0.3);
  });

  it("ne remodèle RIEN quand la tige entière est partie", () => {
    // Il n'y a plus d'arbre : c'est la tige abattue qui raconte.
    expect(remodelageEnCours(COUPE, 0.5)).toBeUndefined();
  });

  it("borne l'avancement", () => {
    expect(remodelageEnCours(TROGNE, -3)?.heightM).toBe(12);
    expect(remodelageEnCours(TROGNE, 9)?.heightM).toBe(2.5);
  });
});

/** Un geste du moteur, tel qu'il arrive dans un journal. */
const geste = (type: "couper" | "elaguer" | "receper", r: ArbreRetire[]): GesteVisible => ({
  type,
  ids: r.map((x) => x.id),
  retire: r,
});

describe("le plan et sa lecture", () => {
  const plan = () => planDEllipse([{ gestes: [geste("couper", [COUPE, RECEPAGE])] }], 2000);

  it("range les tiges sous leur identifiant de tige, les arbres sous le leur", () => {
    const index = indexerLesGestes(plan());
    expect([...index.tiges.keys()].every(estUneTige)).toBe(true);
    // La souche du recépage, et elle seule : la coupe rase ne laisse rien.
    expect([...index.remodeles.keys()]).toEqual([RECEPAGE.id]);
  });

  it("pose les tiges pour toute l'ellipse et non image par image", () => {
    // Le tableau d'arbres sert de clé de cache à la cuisson : une liste qui
    // grandit et rétrécit ferait recuire à chaque image.
    const tiges = tigesAbattues(indexerLesGestes(plan()));
    expect(tiges).toHaveLength(2);
    expect(tiges.map((t) => t.especeId)).toEqual(["quercus_robur", "quercus_robur"]);
  });

  it("laisse la tige DEBOUT avant son acte, couchée pendant, effacée après", () => {
    const p = plan();
    const index = indexerLesGestes(p);
    const id = idDeLaTige(COUPE.id);
    const v = vue();
    expect(chuteDeLaTige(index, -1, id, v)).toEqual(DEBOUT);
    const apres = chuteDeLaTige(index, p.dureeMs + 1000, id, v);
    // Effacée : le fût au sol est désormais l'affaire du terrain, et le
    // laisser couché en dessinerait deux.
    expect(apres.opacite).toBe(0);
    expect(Math.abs(apres.rotationRad)).toBeGreaterThan(0);
  });

  it("ne déforme pas une tige qu'aucun geste n'a couchée", () => {
    expect(chuteDeLaTige(indexerLesGestes(plan()), 500, idDeLaTige(999), vue())).toEqual(DEBOUT);
  });

  it("rend la main à l'instantané une fois l'acte fini", () => {
    // `undefined` et non l'état d'arrivée : l'arbre part alors tel que
    // l'instantané le donne, sans copie.
    const p = plan();
    const index = indexerLesGestes(p);
    expect(remodelageDe(index, p.dureeMs + 1, RECEPAGE.id)).toBeUndefined();
    expect(remodelageDe(index, -1, RECEPAGE.id)?.heightM).toBe(9);
  });

  it("ignore un geste que le gibier a fait : il ne retire aucun volume", () => {
    // `brouter` et `frotter` n'ont pas de `retire` — leur marque est déjà dans
    // la classe de vignette.
    const sansRetire = planDEllipse([{ gestes: [{ type: "brouter", ids: [3, 4] }] }], 2000);
    const index = indexerLesGestes(sansRetire);
    expect(index.tiges.size).toBe(0);
    expect(index.remodeles.size).toBe(0);
  });

  it("garde `retire` quand deux gestes du même type se fusionnent", () => {
    // Le défaut corrigé au passage : `fusionnerGestes` reconstruisait
    // `{ type, ids }` et laissait tomber le reste, si bien que les arbres de
    // la première éclaircie disparaissaient sans tomber.
    const p = planDEllipse(
      [{ gestes: [geste("couper", [COUPE])] }, { gestes: [geste("couper", [RECEPAGE])] }],
      2000,
    );
    expect(tigesAbattues(indexerLesGestes(p))).toHaveLength(2);
  });
});

/**
 * Les trois gestes qui ne démontent rien (#114) : plantation, récolte,
 * démasclage.
 *
 * **Ce que ces essais gardent : qu'on n'anime que ce que le moteur a dit.** Ces
 * trois-là n'ont pas d'`ArbreRetire` — « un arbre planté, récolté ou démasclé
 * garde sa géométrie » — donc rien à interpoler entre deux formes. Ce qui bouge
 * est un stock, et la seule tentation serait d'en inventer la valeur de départ.
 */
describe("les gestes qui déplacent un stock", () => {
  it("fait partir les fruits, et les fait partir VRAIMENT", () => {
    // À l'avancement 0 la couronne porte encore toute la récolte ; à 1 elle
    // rend la main à l'instantané, qui est déjà vide.
    expect(recolteEnCours(12, 0).fruitsKgEnPlus).toBe(12);
    expect(recolteEnCours(12, 0.5).fruitsKgEnPlus).toBeCloseTo(6, 6);
    // Exactement zéro, pas un reliquat : `etatDuFruit` classe tout kilo > 0 en
    // FRUIT_MUR, donc un milliardième laisserait l'arbre chargé pour toujours.
    expect(recolteEnCours(12, 1).fruitsKgEnPlus).toBe(0);
  });

  it("borne l'avancement de la récolte", () => {
    expect(recolteEnCours(12, -2).fruitsKgEnPlus).toBe(12);
    expect(recolteEnCours(12, 7).fruitsKgEnPlus).toBe(0);
  });

  it("lève l'écorce depuis l'état que le moteur EXIGE, pas depuis une valeur choisie", () => {
    // `ecorceRecoltable` n'autorise la levée que sur une écorce refaite : le
    // départ est donc la rotation de l'espèce, lue sur sa fiche.
    const rotationAns = getEspece("quercus_suber")?.ecorce?.rotationAns;
    expect(rotationAns).toBeGreaterThan(0);
    const debut = demasclageEnCours("quercus_suber", 0);
    expect(debut?.semainesDepuisLevee).toBeCloseTo((rotationAns ?? 0) * 52, 6);
    expect(demasclageEnCours("quercus_suber", 1)?.semainesDepuisLevee).toBe(0);
  });

  it("ne démascle pas un arbre qui n'a pas d'écorce à lever", () => {
    // Une teinte de liège sur un bouleau se verrait, et le moteur ne devrait
    // pas produire le geste : on ne dessine rien plutôt que d'improviser.
    expect(demasclageEnCours("betula_pendula", 0.5)).toBeUndefined();
  });

  it("ne touche à AUCUNE géométrie", () => {
    // C'est le point : ces gestes ne bougent ni la hauteur ni le houppier, et
    // les laisser indéfinis est ce qui permet à la vue de ne rien écraser.
    const r = recolteEnCours(3, 0.4);
    expect(r.heightM).toBeUndefined();
    expect(r.baseHouppierM).toBeUndefined();
    const d = demasclageEnCours("quercus_suber", 0.4);
    expect(d?.heightM).toBeUndefined();
    expect(d?.baseHouppierM).toBeUndefined();
  });
});

describe("le plant qui sort de terre", () => {
  it("grandit de presque rien à sa taille pleine", () => {
    expect(poseDeLaPlantation(0).hauteur).toBeLessThan(0.2);
    expect(poseDeLaPlantation(0).opacite).toBe(0);
    expect(poseDeLaPlantation(0.5).hauteur).toBeGreaterThan(poseDeLaPlantation(0).hauteur);
    // Exactement DEBOUT à la fin : un plant posé est un arbre ordinaire, et
    // `combiner` doit le trouver neutre.
    expect(poseDeLaPlantation(1)).toEqual(DEBOUT);
  });

  it("ne part jamais d'une hauteur nulle", () => {
    // Un sprite de hauteur zéro ne se dessine pas : la première image ne
    // montrerait rien, ce qui est le contraire d'un plant qui apparaît.
    expect(poseDeLaPlantation(0).hauteur).toBeGreaterThan(0);
  });
});

describe("le plan des trois gestes sans retire", () => {
  const planter = (): GesteVisible => ({ type: "planter", ids: [21, 22] });
  const recolter = (): GesteVisible => ({ type: "recolter", ids: [31], masseKg: [8] });
  const demascler = (): GesteVisible => ({
    type: "leverEcorce",
    ids: [41],
    masseKg: [15],
  });

  it("range chacun dans sa table, et pas dans celle des tiges", () => {
    const p = planDEllipse([{ gestes: [planter(), recolter(), demascler()] }], 2000);
    const index = indexerLesGestes(p);
    expect([...index.plants.keys()]).toEqual([21, 22]);
    expect([...index.stocks.keys()].sort((a, b) => a - b)).toEqual([31, 41]);
    // Aucune tige ne tombe et aucune forme ne bouge : c'est ce qui les sépare
    // des cinq autres gestes.
    expect(index.tiges.size).toBe(0);
    expect(index.remodeles.size).toBe(0);
  });

  it("ignore une récolte sans masse : on n'anime pas un stock inconnu", () => {
    const p = planDEllipse([{ gestes: [{ type: "recolter", ids: [31] }] }], 2000);
    expect(indexerLesGestes(p).stocks.size).toBe(0);
  });

  it("rend la main à l'instantané une fois l'acte fini", () => {
    const p = planDEllipse([{ gestes: [recolter(), planter()] }], 2000);
    const index = indexerLesGestes(p);
    expect(remodelageDe(index, p.dureeMs + 1, 31)).toBeUndefined();
    expect(poseDuPlant(index, p.dureeMs + 1, 21)).toEqual(DEBOUT);
  });

  it("ne déforme pas un arbre qu'aucune plantation ne concerne", () => {
    const index = indexerLesGestes(planDEllipse([{ gestes: [planter()] }], 2000));
    expect(poseDuPlant(index, 500, 999)).toEqual(DEBOUT);
  });

  it("cumule un geste de forme et un geste de stock sur le MÊME arbre", () => {
    // Un arbre élagué et récolté la même semaine doit montrer les deux : le
    // houppier qui remonte et les fruits qui partent.
    const elagage = { ...ELAGAGE, id: 31 };
    const p = planDEllipse([{ gestes: [geste("elaguer", [elagage]), recolter()] }], 2000);
    const index = indexerLesGestes(p);
    const r = remodelageDe(index, 0, 31);
    expect(r?.baseHouppierM).toBe(3);
    expect(r?.fruitsKgEnPlus).toBe(8);
  });
});
