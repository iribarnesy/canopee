/**
 * L'adaptateur instantané → scène.
 *
 * **Ce que ces essais gardent : que rien ne se perde et que rien ne s'invente.**
 * Le fichier n'a aucune règle à lui — il renomme des champs du protocole — donc
 * le seul défaut qu'il puisse avoir est de laisser tomber une grandeur en
 * route. C'est exactement ce qui était arrivé au banc de la vue : `floraison`,
 * `fruitProgress` et `fruitsKg` étaient déclarés dans sa scène et n'arrivaient
 * nulle part, si bien qu'un verger en fleur se dessinait comme un taillis. Rien
 * ne l'avait montré, parce que les planches d'espèces, elles, les posaient.
 */

import { describe, expect, it } from "vitest";
import { bordersUniformes, getPaysage } from "../../src/engine/paysage";
import {
  type ArbreSource,
  arbresAPoser,
  decorDesBordures,
  donneesSolDe,
  type SolSource,
} from "../../src/game/parcelle";

const COTE = 4;
const N = COTE * COTE;
const plat = Array.from({ length: N }, () => 0);
const zeros = () => new Float32Array(N);

const sol = (patch: Partial<SolSource> = {}): SolSource => ({
  coteM: COTE,
  ruMm: 100,
  altitudesM: plat,
  waterMm: zeros(),
  herbe: zeros(),
  herbeBiomasse: zeros(),
  litiereCG: zeros(),
  ...patch,
});

const arbre = (patch: Partial<ArbreSource> = {}): ArbreSource => ({
  id: 1,
  especeId: "betula_pendula",
  x: 1.5,
  y: 2.5,
  heightM: 12,
  chandelle: false,
  ...patch,
});

describe("les grilles du sol", () => {
  it("rend le remplissage de la réserve utile, pas des millimètres", () => {
    // Le moteur compte des mm d'eau, le rendu veut une fraction : le rapport
    // des deux est la définition du remplissage, et c'est la seule opération
    // que ce module s'autorise.
    const eau = Float32Array.from({ length: N }, (_, i) => i * 10);
    const d = donneesSolDe(sol({ waterMm: eau, ruMm: 50 }));
    expect(d.humidite[0]).toBeCloseTo(0, 6);
    expect(d.humidite[3]).toBeCloseTo(0.6, 6);
  });

  it("BORNE le remplissage : un sol qui déborde n'est pas plus qu'humide", () => {
    // Un profil saturé porte plus que sa réserve utile — le rendu, lui, n'a
    // qu'une teinte de plus humide, et une fraction au-dessus de 1 la ferait
    // sortir de la palette.
    const d = donneesSolDe(sol({ waterMm: Float32Array.from({ length: N }, () => 400) }));
    expect([...d.humidite].every((h) => h === 1)).toBe(true);
  });

  it("ne divise pas par zéro quand la réserve utile manque", () => {
    // Une station sans réserve utile n'existe pas ; une scène tronquée, si — et
    // une carte de `NaN` ne se dessine pas, elle disparaît.
    const d = donneesSolDe(sol({ ruMm: 0, waterMm: Float32Array.from({ length: N }, () => 5) }));
    expect([...d.humidite].every((h) => Number.isFinite(h))).toBe(true);
  });

  it("laisse absentes les grilles que la source n'a pas", () => {
    // « Absent » et « nul » ne se dessinent pas pareil : une grille de lumière
    // vide éteindrait le sous-bois, alors que son absence laisse le terrain à
    // son éclairage par défaut.
    const d = donneesSolDe(sol());
    expect(d.lumiere).toBeUndefined();
    expect(d.boisAuSol).toBeUndefined();
    expect(d.enEau).toBeUndefined();
  });

  it("porte celles qu'elle a, y compris depuis des tableaux ordinaires", () => {
    // Le banc relit du JSON : ses grilles sont des tableaux ordinaires, et
    // c'est la raison d'être des types structurels de ce module.
    const d = donneesSolDe(
      sol({ lumiere: [0.1, 0.2, 0.3, 0.4], enEau: [true, false, true, false] }),
    );
    expect(d.lumiere?.[2]).toBeCloseTo(0.3, 6);
    expect(d.enEau?.[0]).toBe(true);
  });
});

describe("les arbres à poser", () => {
  const ctx = { coteM: COTE, week: 100, altitudesM: plat };

  it("écarte les tiges de hauteur nulle", () => {
    // Le moteur en porte la semaine de leur plantation, et une vignette de
    // zéro mètre n'a pas de classe.
    expect(arbresAPoser([arbre({ heightM: 0 })], ctx)).toHaveLength(0);
  });

  it("lit l'altitude du sol SOUS l'arbre", () => {
    const relief = plat.map((_, i) => i);
    // x = 1,5 ; y = 2,5 → cellule (1, 2) → indice 2 × 4 + 1 = 9
    const [pose] = arbresAPoser([arbre()], { ...ctx, altitudesM: relief });
    expect(pose?.z).toBe(9);
  });

  it("garde un arbre au bord DANS la grille", () => {
    // Un arbre posé sur la dernière cellule tombe hors du tableau si on ne
    // borne pas : la vue le placerait alors à l'altitude zéro, sous le terrain.
    const relief = plat.map(() => 7);
    const [pose] = arbresAPoser([arbre({ x: COTE, y: COTE })], { ...ctx, altitudesM: relief });
    expect(pose?.z).toBe(7);
  });

  it("porte les fleurs et les fruits", () => {
    // Le défaut qui a motivé l'extraction : trois champs déclarés, jamais
    // transmis.
    const [pose] = arbresAPoser([arbre({ floraison: 0.8, fruitProgress: 0.5, fruitsKg: 12 })], ctx);
    expect(pose?.floraison).toBeCloseTo(0.8, 6);
    expect(pose?.fruitProgress).toBeCloseTo(0.5, 6);
    expect(pose?.fruitsKg).toBe(12);
  });

  it("compte une DURÉE depuis le démasclage, pas une présence", () => {
    // Le moteur donne la semaine du dernier levage : on peut donc dire où en
    // est l'écorce, et pas seulement qu'elle a été levée.
    const [pose] = arbresAPoser([arbre({ derniereLeveeSemaine: 40 })], ctx);
    expect(pose?.semainesDepuisLevee).toBe(60);
  });

  it("dépouille une chandelle de son feuillage", () => {
    const [pose] = arbresAPoser([arbre({ chandelle: true })], ctx);
    expect(pose?.chandelle).toBe(true);
    expect(pose?.partFoliaire).toBe(0);
  });

  it("rend VIVANT l'arbre que l'incendie est en train de torcher", () => {
    // L'instantané le décrit après le feu — tronc charbonné, sans feuilles — et
    // une mise en scène qui partirait de là interpolerait du néant vers le
    // néant. Le canal `mourant` le ramène ensuite à l'état décrit.
    const brule = arbre({ chandelle: true, brulEeSemaine: 100, vigueur: 0 });
    const [tel] = arbresAPoser([brule], ctx);
    const [torche] = arbresAPoser([brule], { ...ctx, seTorche: () => true });
    expect(tel?.chandelle).toBe(true);
    expect(tel?.brulee).toBe(true);
    expect(torche?.chandelle).toBeUndefined();
    expect(torche?.brulee).toBeUndefined();
    expect(torche?.vigueur).toBe(1);
  });

  it("laisse le feuillage plein quand la saison est inconnue", () => {
    // Le repli honnête de « on ne sait pas quelle semaine il est » — et non une
    // saison choisie au hasard.
    const [pose] = arbresAPoser([arbre()], ctx);
    expect(pose?.partFoliaire).toBe(1);
    expect(pose?.senescence).toBe(0);
  });

  it("ne fabrique pas les états que l'arbre n'a pas", () => {
    // Chaque état optionnel est un dessin de plus : les poser à faux les ferait
    // tous apparaître, manchons et frottis compris.
    const [pose] = arbresAPoser([arbre()], ctx);
    expect(pose?.protege).toBeUndefined();
    expect(pose?.frotte).toBeUndefined();
    expect(pose?.broute).toBeUndefined();
    expect(pose?.brulee).toBeUndefined();
    expect(pose?.teteTrogneM).toBeUndefined();
  });
});

describe("le décor des bordures", () => {
  it("réduit chaque côté à ses trois parts et à ses semenciers", () => {
    const b = bordersUniformes("massif-forestier");
    const p = getPaysage("massif-forestier");
    const d = decorDesBordures(b);
    expect(d.nord.boise).toBe(p.partBoisee);
    expect(d.nord.cultive).toBe(p.partCultivee);
    expect(d.nord.urbain).toBe(p.partUrbaine);
    // Les **essences**, et pas seulement les parts : sans elles un massif de pins
    // de lande se dessine comme une hêtraie.
    expect(d.nord.especes?.map((e) => e.especeId)).toEqual(p.semenciers.map((s) => s.especeId));
  });

  it("distingue les quatre côtés", () => {
    // Le repère de la parcelle est +x est, +y nord : un côté rangé ailleurs
    // retourne le paysage d'un quart de tour.
    const d = decorDesBordures({
      nord: "massif-forestier",
      est: "plaine-cerealiere",
      sud: "massif-forestier",
      ouest: "massif-forestier",
    });
    expect(d.est.cultive).toBeGreaterThan(d.nord.cultive);
    expect(d.nord.boise).toBeGreaterThan(d.est.boise);
  });
});
