/**
 * LA FAUNE EN INDIVIDUS (issue #187, lot 1 : « l'animal existe »).
 *
 * Le moteur n'avait que des grandeurs : une densité de paysage pour le gibier,
 * une population anonyme pour les ravageurs, et rien du tout pour les
 * auxiliaires — `PREDATION_MAX · habitat`, c'est-à-dire qu'il les suppose. Ce
 * lot pose l'autre modèle : des individus qui s'ancrent, qu'on peut voir
 * arriver et partir.
 *
 * Ce fichier tient quatre choses, dans l'ordre où elles comptent :
 *
 *   1. **le gîte trie, et il trie tout seul** — aucune ligne du moteur ne
 *      connaît de mésange ; c'est la géométrie du creux, déjà calculée pour
 *      #183, qui décide qui peut y loger ;
 *   2. **le territoire borne l'effectif**, bien avant que les gîtes ne
 *      manquent — c'est ce qui empêche une parcelle creuse de compter cent
 *      mésanges ;
 *   3. **l'arbre qui tombe expulse quelqu'un de nommé**, sans qu'aucun code ne
 *      l'ait prévu. C'est l'événement, et il tombe du mécanisme ;
 *   4. **et allumer la faune ne déplace aucune partie.** Le lot ne touche aucun
 *      critère vert, et il doit pouvoir le prouver.
 */

import { describe, expect, it } from "vitest";
import { serieMeteoPour } from "../../src/data/meteo";
import { diametreCaviteCm, volumeCaviteTotalL } from "../../src/engine/cavites";
import {
  bilanDeTable,
  departs,
  especeFaune,
  FAUNE,
  type IndividuFaune,
  installations,
  SAISONS_MAIGRES_AVANT_DEPART,
  satisfaction,
  type TableDeLaParcelle,
} from "../../src/engine/faune";
import { advanceWeek } from "../../src/engine/game";
import type { GridDims } from "../../src/engine/grid";
import { serieToWeeks } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type GameState, plantAt, type Station } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { stateHash } from "../../src/engine/tick";
import type { TreeState } from "../../src/engine/trees";

/** Un arbre, creusé à la part de rayon demandée. */
function arbre(id: number, x: number, y: number, diametreCm: number, partRayon: number): TreeState {
  const base = {
    id,
    x,
    y,
    especeId: "quercus_pubescens",
    alive: true,
    heightM: diametreCm * 0.45,
    diametreCm,
    recepages: 0,
  } as unknown as TreeState;
  return partRayon > 0
    ? {
        ...base,
        carie: { rayonCm: (diametreCm / 2) * partRayon, barriereCm: diametreCm / 2 },
      }
    : base;
}

const SEMAINE_MESANGES = 13;

/**
 * L'aire de parcelle des essais d'ÉLIGIBILITÉ, m² — deux cents hectares.
 *
 * Deux règles se superposent dans `installations` : QUI peut loger là (le
 * gîte), et À QUELLE FRÉQUENCE le territoire de l'espèce tombe sur la parcelle
 * (la rareté). Les mélanger rendrait chaque essai illisible — une buse absente
 * ne dirait pas si c'est la fourche qui manquait ou la chance. On isole donc :
 * les essais de gîte se placent sur une parcelle plus grande que le plus grand
 * territoire de l'atlas, et la rareté a son essai à elle.
 */
const GRANDE_PARCELLE_M2 = 2_000_000;

/** La grille des essais d'éligibilité : assez large pour tous les territoires. */
const DIMS: GridDims = { widthM: 200, heightM: 200 };

/**
 * Une table PLEINE, pour la même raison que la grande parcelle : isoler.
 *
 * Trois règles se superposent maintenant dans `installations` — le gîte, la
 * rareté du territoire, et la table. Les mélanger rendrait chaque essai muet :
 * un écureuil absent ne dirait pas s'il manquait la fourche, la chance ou les
 * faines. Chacune a donc ses essais, et les autres y sont neutralisées.
 */
const TABLE_PLEINE: TableDeLaParcelle = {
  invertebres: new Array(DIMS.widthM * DIMS.heightM).fill(1),
  micromammiferes: new Array(DIMS.widthM * DIMS.heightM).fill(1000),
};

/** Et une table VIDE, pour l'essai qui la regarde. */
const TABLE_VIDE: TableDeLaParcelle = {
  invertebres: new Array(DIMS.widthM * DIMS.heightM).fill(0),
  micromammiferes: new Array(DIMS.widthM * DIMS.heightM).fill(0),
};

/** Une partie de trente ans sur une parcelle dont on a creusé un arbre sur trois. */
function partie(faune: boolean, arbres = 25): { hash: number; state: GameState } {
  const COTE = 80;
  const station: Station = { ...LIMON_RICHE.station, coteM: COTE, voisinage: [], faune };
  const serie = serieMeteoPour(LIMON_RICHE.station.id);
  if (!serie) throw new Error("série manquante");
  const meteo = serieToWeeks(serie);
  // Une vieille futaie claire : vingt-cinq chênes de dix-huit mètres. On les
  // plante à cette taille et on en CREUSE un sur trois à la main, plutôt que
  // d'attendre le siècle de coups de vent qui les creuserait pour de vrai :
  // ce qu'on éprouve ici est l'installation, pas la carie, et `carie.test.ts`
  // tient déjà l'autre bout de la chaîne.
  let s: GameState = createGameState(station, rngStateFromSeed(11));
  let poses = 0;
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      if (poses >= arbres) continue;
      s = plantAt(s, "quercus_pubescens", 8 + i * 16, 8 + j * 16, 18);
      poses++;
    }
  }
  s = {
    ...s,
    trees: s.trees.map((t, i) =>
      i % 3 === 0
        ? { ...t, carie: { rayonCm: t.diametreCm * 0.35, barriereCm: t.diametreCm / 2 } }
        : t,
    ),
  };
  for (let w = 0; w < 52 * 30; w++) {
    const m = meteo[w % meteo.length];
    if (!m) throw new Error("météo manquante");
    s = advanceWeek(s, m, []).state;
  }
  return { hash: stateHash(s), state: s };
}

describe("le gîte trie les espèces, et rien dans le code ne les connaît", () => {
  it("un arbre sain ne loge aucun cavernicole, quelle que soit sa taille", () => {
    // Le point de départ, et il n'est pas décoratif : ce qui fait un
    // arbre-habitat n'est pas l'âge ni le diamètre, c'est le CREUX. Un chêne
    // d'un mètre jamais blessé n'offre pas une loge (`cavites.ts`, #182).
    const sain = arbre(1, 50, 50, 100, 0);
    expect(volumeCaviteTotalL(sain)).toBe(0);
    expect(
      installations([], [sain], SEMAINE_MESANGES, 1, GRANDE_PARCELLE_M2, DIMS, TABLE_PLEINE),
    ).toEqual([]);
  });

  it("et la guilde s'approfondit avec le creux, sans qu'aucun seuil ne le dise", () => {
    // Trois arbres, la même part de rayon cariée, trois tailles. Ce qui change
    // est le volume de la chambre et son calibre — et le tri tombe tout seul.
    const gradient: [string, TreeState][] = [
      ["perche 15 cm", arbre(1, 50, 50, 15, 0.5)],
      ["arbre 25 cm", arbre(2, 50, 50, 25, 0.5)],
      ["chêne 50 cm", arbre(3, 50, 50, 50, 0.5)],
    ];
    const accueillis = gradient.map(([, t]) => {
      const v = volumeCaviteTotalL(t);
      const calibreMm = diametreCaviteCm(t) * 10;
      return FAUNE.filter(
        (e) => e.gite === "cavite" && v >= e.volumeLogeL && calibreMm >= e.entreeMinMm,
      ).length;
    });
    // Monotone, et la perche n'accueille pas tout le monde.
    const [perche = 0, moyen = 0, chene = 0] = accueillis;
    expect(perche).toBeLessThan(chene);
    expect(perche).toBeLessThanOrEqual(moyen);
    // La chevêche, qui demande 70 mm d'entrée et quinze litres, n'entre pas
    // dans une perche : son alésage fait cinq centimètres.
    const cheveche = especeFaune("chouette_cheveche");
    if (!cheveche) throw new Error("fiche manquante");
    expect(diametreCaviteCm(arbre(1, 0, 0, 15, 0.5)) * 10).toBeLessThan(cheveche.entreeMinMm);
    expect(diametreCaviteCm(arbre(3, 0, 0, 50, 0.5)) * 10).toBeGreaterThan(cheveche.entreeMinMm);
  });

  it("un gîte CONSTRUIT ne se juge pas comme un creux : il lui faut un support", () => {
    // L'écureuil et la buse bâtissent DANS la ramure. Un arbre creux mais grêle
    // ne leur sert à rien, un gros arbre sain leur suffit — c'est exactement
    // l'inverse du cavernicole, et c'est le même code qui le rend.
    //
    // **On compte sur quarante arbres, pas sur un.** Une installation est un
    // TIRAGE : à un seul essai, ce qu'on mesure est la graine, pas le
    // mécanisme, et l'écureuil qui ne vient pas ne prouve rien. C'est la mise
    // en garde de l'issue, et elle vaut ici au mot près.
    const essais = (fabrique: (id: number) => TreeState, semaine: number, especeId: string) => {
      let venus = 0;
      for (let id = 1; id <= 40; id++) {
        const nouveaux = installations(
          [],
          [fabrique(id)],
          semaine,
          id,
          GRANDE_PARCELLE_M2,
          DIMS,
          TABLE_PLEINE,
        );
        if (nouveaux.some((n) => n.individu.especeId === especeId)) venus++;
      }
      return venus;
    };
    const surGreles = essais((id) => arbre(id, 50, 50, 12, 0.6), 6, "ecureuil_roux");
    const surGros = essais((id) => arbre(id, 50, 50, 60, 0), 6, "ecureuil_roux");
    // Jamais sur un baliveau de douze centimètres, même creux ; souvent sur un
    // gros arbre sain, et « souvent » est exactement la fiche (une chance sur
    // deux par an).
    expect(surGreles).toBe(0);
    expect(surGros).toBeGreaterThan(10);
    // Et la buse, qui demande trente-cinq centimètres de fourche, ne s'installe
    // pas là où l'écureuil se contente : le même arbre, deux réponses.
    expect(essais((id) => arbre(id, 50, 50, 20, 0), 8, "buse_variable")).toBe(0);
    expect(essais((id) => arbre(id, 50, 50, 60, 0), 8, "buse_variable")).toBeGreaterThan(0);
  });
});

describe("le territoire borne l'effectif avant que les gîtes ne manquent", () => {
  it("quadrupler les arbres creux ne multiplie pas les mésanges", () => {
    // La même parcelle d'un hectare, garnie de vingt-cinq puis de cent chênes
    // creux. En litres de loge, il y a quatre fois plus de place ; en mésanges
    // bleues, il n'y en a pas davantage. **Ce n'est pas le gîte qui borne, c'est
    // le territoire** — et c'est le fait de terrain qu'on voulait obtenir sans
    // écrire nulle part un effectif maximal.
    const grille = (cote: number): TreeState[] => {
      const trees: TreeState[] = [];
      const pas = 100 / cote;
      for (let i = 0; i < cote * cote; i++) {
        trees.push(
          arbre(i + 1, pas / 2 + (i % cote) * pas, pas / 2 + Math.floor(i / cote) * pas, 50, 0.6),
        );
      }
      return trees;
    };
    const compteBleues = (trees: TreeState[]) =>
      installations([], trees, SEMAINE_MESANGES, 1, GRANDE_PARCELLE_M2, DIMS, TABLE_PLEINE).filter(
        (n) => n.individu.especeId === "mesange_bleue",
      );
    const peu = compteBleues(grille(5));
    const beaucoup = compteBleues(grille(10));
    expect(peu.length).toBeGreaterThan(0);
    expect(beaucoup.length).toBeLessThanOrEqual(peu.length + 1);
    // Et deux installées ne se chevauchent jamais : c'est la garantie
    // élémentaire dont tout le reste découle.
    const territoire = especeFaune("mesange_bleue")?.territoireM ?? 0;
    for (const lot of [peu, beaucoup]) {
      for (let a = 0; a < lot.length; a++) {
        for (let b = a + 1; b < lot.length; b++) {
          const ia = lot[a]?.individu;
          const ib = lot[b]?.individu;
          if (!ia || !ib) continue;
          expect(Math.hypot(ia.x - ib.x, ia.y - ib.y)).toBeGreaterThanOrEqual(territoire);
        }
      }
    }
  });

  it("un même arbre loge plusieurs pensionnaires, dans la limite de ses litres", () => {
    // Un vieux chêne creux porte plusieurs dendromicrohabitats : c'est le fait
    // de terrain. Ce qui l'empêche d'en porter cinquante est un budget en
    // litres, pas une règle écrite.
    const veteran = arbre(1, 50, 50, 80, 0.8);
    const tous = FAUNE.filter((e) => e.gite === "cavite");
    const installes = tous
      .flatMap((e) =>
        installations(
          [],
          [veteran],
          e.semaineInstallation,
          1,
          GRANDE_PARCELLE_M2,
          DIMS,
          TABLE_PLEINE,
        ),
      )
      .filter((n) => especeFaune(n.individu.especeId)?.gite === "cavite");
    expect(installes.length).toBeGreaterThan(1);
    const litres = installes.reduce(
      (t, n) => t + (especeFaune(n.individu.especeId)?.volumeLogeL ?? 0),
      0,
    );
    expect(litres).toBeLessThanOrEqual(volumeCaviteTotalL(veteran));
  });
});

describe("un grand domaine vital rend l'installation RARE, pas impossible", () => {
  it("la chance qu'une buse choisisse votre parcelle suit la part de son territoire", () => {
    // Le prolongement de « ce qui s'ancre contre ce qui traverse », et la règle
    // sans laquelle le modèle devient absurde : un couple de buses occupe seul
    // cent cinquante hectares, donc la chance que SON aire tombe sur un demi-
    // hectare n'est pas celle d'un couple de mésanges, dont le territoire tient
    // tout entier chez vous.
    //
    // Mesuré : deux cents tentatives sur des arbres distincts, sur trois
    // tailles de parcelle. On compte des arrivées, pas des probabilités.
    const essais = (aireM2: number, especeId: string, semaine: number) => {
      let venus = 0;
      for (let id = 1; id <= 200; id++) {
        const t = arbre(id, 50, 50, 60, 0.7);
        if (
          installations([], [t], semaine, id, aireM2, DIMS, TABLE_PLEINE).some(
            (n) => n.individu.especeId === especeId,
          )
        ) {
          venus++;
        }
      }
      return venus;
    };
    const DEMI_HECTARE = 5_000;
    const CENT_CINQUANTE_HA = 1_500_000;

    // La buse : quasi jamais sur un demi-hectare, ordinaire sur un domaine à sa
    // mesure. Sans ce facteur, une parcelle de jardin abritait une buse À COUP
    // SÛR en dix ans — soit, ramené à l'hectare, cent fois le terrain.
    const buseChezVous = essais(DEMI_HECTARE, "buse_variable", 8);
    const buseSurUnDomaine = essais(CENT_CINQUANTE_HA, "buse_variable", 8);
    expect(buseChezVous).toBeLessThanOrEqual(2);
    expect(buseSurUnDomaine).toBeGreaterThan(20 * buseChezVous + 10);

    // La mésange bleue, elle, ne bouge presque pas : son hectare tient déjà
    // presque entier dans le demi-hectare, donc agrandir ne change rien. C'est
    // la même formule, et elle rend deux comportements opposés.
    const mesangeChezVous = essais(DEMI_HECTARE, "mesange_bleue", SEMAINE_MESANGES);
    const mesangeSurUnDomaine = essais(CENT_CINQUANTE_HA, "mesange_bleue", SEMAINE_MESANGES);
    expect(mesangeChezVous).toBeGreaterThan(40);
    expect(mesangeSurUnDomaine).toBeLessThan(mesangeChezVous * 2.5);
  });
});

describe("l'arbre qui disparaît expulse quelqu'un de nommé", () => {
  it("abattre l'arbre porteur fait partir son occupant, et on sait lequel", () => {
    const porteur = arbre(7, 30, 30, 60, 0.7);
    const nouveaux = installations(
      [],
      [porteur],
      SEMAINE_MESANGES,
      1,
      GRANDE_PARCELLE_M2,
      DIMS,
      TABLE_PLEINE,
    );
    expect(nouveaux.length).toBeGreaterThan(0);
    const presents = nouveaux.map((n) => n.individu);

    // Tant que l'arbre est là, personne ne bouge.
    expect(departs(presents, [porteur])).toEqual([]);

    // On l'abat : la parcelle ne le contient plus (c'est ce que fait
    // `applyAction`, et ce que fait `tick` quand une chandelle s'abat).
    const sortants = departs(presents, []);
    expect(sortants.length).toBe(presents.length);
    for (const sortie of sortants) {
      expect(sortie.cause).toBe("arbreDisparu");
      expect(especeFaune(sortie.individu.especeId)?.nom).toBeTruthy();
      expect(sortie.individu.arbreId).toBe(porteur.id);
    }
  });

  it("et un gîte qui rapetisse fait partir les grands d'abord", () => {
    // Le cas plus fin : l'arbre est toujours là, mais son creux n'est plus à la
    // taille. Le tri se refait à l'envers — ce qui exclut est ce qui excluait
    // déjà à l'installation.
    const gros = arbre(9, 30, 30, 60, 0.7);
    const occupants: IndividuFaune[] = FAUNE.filter((e) => e.gite === "cavite").map((e, i) => ({
      id: i + 1,
      especeId: e.id,
      arbreId: gros.id,
      x: gros.x,
      y: gros.y,
      depuisSemaine: 0,
    }));
    expect(departs(occupants, [gros])).toEqual([]);

    const rabougri = arbre(9, 30, 30, 14, 0.5);
    const sortants = departs(occupants, [rabougri]);
    expect(sortants.length).toBeGreaterThan(0);
    for (const sortie of sortants) expect(sortie.cause).toBe("giteTropPetit");
    // La chevêche part, la mésange bleue reste : c'est le calibre qui décide.
    const partis = sortants.map((s) => s.individu.especeId);
    expect(partis).toContain("chouette_cheveche");
    expect(partis).not.toContain("mesange_bleue");
  });
});

describe("le commutateur, et la preuve qu'il ne déplace rien", () => {
  it("allumer la faune ne déplace AUCUNE partie", () => {
    // Le contrôle de neutralité du lot, et il est plus fort qu'attendu : les
    // tirages d'installation passent par une graine LOCALE (modèle
    // `graineDeChute`), donc ils ne consomment pas le flux principal. La partie
    // avec faune n'est pas « proche » de la partie sans, elle est la MÊME.
    //
    // Comparé DANS LE MÊME PROCESSUS, et pas contre une valeur épinglée : une
    // empreinte absolue n'est pas portable d'une version de V8 à l'autre (#193).
    const sans = partie(false);
    const avec = partie(true);
    expect(avec.hash).toBe(sans.hash);
    // Éteinte, la faune n'existe même pas — pas de tableau vide, rien.
    expect(sans.state.faune).toBeUndefined();
  });

  it("et allumée, elle peuple la parcelle à des densités plausibles", () => {
    // Relevé sur trente ans, vingt-cinq chênes creusés sur 0,64 ha, trois
    // graines : 7, 7 et 10 individus, toujours les mêmes guildes — une ou deux
    // mésanges bleues, une charbonnière, un pic, deux à quatre loirs, un
    // écureuil, et sur les trois une chevêche. **Pas de buse**, et c'est le
    // travail de `partDuTerritoire` : sans lui elle s'installait à coup sûr.
    //
    // Sur 4 ha, même conduite : 38 individus, dont 10 mésanges bleues
    // (2,5/ha — le terrain donne 1 à 2 en chênaie), 13 loirs (3,3/ha, pour 2 à
    // 10 publiés), 4 écureuils (1/ha, pour 0,5 à 1,5) et UNE buse. Les ordres de
    // grandeur sont les bons, et aucun n'a été calé : ils tombent du gîte et du
    // territoire.
    const { state } = partie(true);
    const peuplement = state.faune ?? [];
    expect(peuplement.length).toBeGreaterThan(3);
    // Chaque individu est ancré à un arbre qui existe encore.
    const ids = new Set(state.trees.map((t) => t.id));
    for (const ind of peuplement) expect(ids.has(ind.arbreId)).toBe(true);
    // Et les identités sont uniques — c'est ce qui permet de s'y attacher.
    expect(new Set(peuplement.map((i) => i.id)).size).toBe(peuplement.length);
    // Plusieurs espèces, pas une monoculture d'individus.
    expect(new Set(peuplement.map((i) => i.especeId)).size).toBeGreaterThan(2);
    // Bornée par les territoires, pas par le nombre d'arbres creux.
    expect(peuplement.length).toBeLessThan(state.trees.length);
  });
});

describe("un gîte ne suffit pas : il faut une table (lot 2)", () => {
  it("le même creux, parfait, reste vide dans un désert", () => {
    // Même arbre, même semaine, même territoire libre : seule la nourriture
    // change. Quarante arbres distincts, parce qu'une installation est un
    // tirage et qu'un seul essai mesurerait la graine.
    const essais = (table: TableDeLaParcelle) => {
      let venus = 0;
      for (let id = 1; id <= 40; id++) {
        const t = arbre(id, 100, 100, 50, 0.6);
        if (
          installations([], [t], SEMAINE_MESANGES, id, GRANDE_PARCELLE_M2, DIMS, table).length > 0
        ) {
          venus++;
        }
      }
      return venus;
    };
    expect(essais(TABLE_PLEINE)).toBeGreaterThan(10);
    expect(essais(TABLE_VIDE)).toBe(0);
  });

  it("et une espèce SANS table est jugée sur son seul gîte", () => {
    // L'écureuil et le loir n'ont pas de table, parce que leur nourriture
    // n'existe pas dans ce moteur : le bloc `fruits` de l'atlas décrit une
    // RÉCOLTE de verger, et un peuplement mûr de chênes rend `fruitsKg = 0`
    // toute l'année. Les brancher dessus les aurait fait manger le verger et
    // jamais les chênes. Ils restent donc au régime du lot 1, et l'essai
    // épingle ce choix plutôt que de le laisser passer pour un oubli.
    const ecureuil = especeFaune("ecureuil_roux");
    if (!ecureuil) throw new Error("fiche manquante");
    expect(ecureuil.table).toBeUndefined();
    expect(satisfaction(ecureuil, 0, 5_000)).toBe(1);
    // Et il s'installe donc dans un désert, là où la mésange n'y va pas.
    let venus = 0;
    for (let id = 1; id <= 40; id++) {
      const t = arbre(id, 100, 100, 60, 0);
      if (
        installations([], [t], 6, id, GRANDE_PARCELLE_M2, DIMS, TABLE_VIDE).some(
          (n) => n.individu.especeId === "ecureuil_roux",
        )
      ) {
        venus++;
      }
    }
    expect(venus).toBeGreaterThan(10);
  });
});

describe("le manque ne compte qu'à hauteur de ce que la parcelle pèse", () => {
  it("un demi-hectare peut affamer une mésange, jamais une buse", () => {
    // **LE POINT QUI ÉVITE L'ABSURDE**, et il se règle avec une notion déjà
    // écrite pour la rareté. Une mésange a son hectare chez vous : votre herbe
    // et vos chenilles décident de son sort. Une buse chasse sur cent cinquante
    // hectares dont vous n'êtes que quatre millièmes : ce que vous faites ne
    // pèse rien pour elle, et prétendre l'affamer serait faux.
    const mesange = especeFaune("mesange_bleue");
    const buse = especeFaune("buse_variable");
    if (!mesange?.table || !buse?.table) throw new Error("fiches manquantes");
    const DEMI_HECTARE = 5_000;
    // Offre nulle des deux côtés : c'est le POIDS de la parcelle qui décide.
    expect(satisfaction(mesange, 0, DEMI_HECTARE)).toBeLessThan(0.6);
    expect(satisfaction(buse, 0, DEMI_HECTARE)).toBeGreaterThan(0.99);
    // Et sur un domaine à sa mesure, la buse redevient sensible.
    expect(satisfaction(buse, 0, 1_500_000)).toBeLessThan(0.1);
    // Une table servie satisfait tout le monde, quelle que soit la taille.
    expect(satisfaction(mesange, mesange.table.seuil, DEMI_HECTARE)).toBe(1);
    expect(satisfaction(buse, buse.table.seuil, 1_500_000)).toBe(1);
  });
});

describe("une mauvaise année est un avertissement, deux sont une décision", () => {
  const SEMAINE_BILAN_MESANGE = 20;
  const installee = (): IndividuFaune => ({
    id: 1,
    especeId: "mesange_bleue",
    arbreId: 7,
    x: 100,
    y: 100,
    depuisSemaine: 0,
  });

  it("la première saison maigre ne fait partir personne", () => {
    const { individus, partants } = bilanDeTable(
      [installee()],
      DIMS,
      TABLE_VIDE,
      SEMAINE_BILAN_MESANGE,
      5_000,
    );
    expect(partants).toEqual([]);
    expect(individus[0]?.saisonsMaigres).toBe(1);
  });

  it("la seconde, si", () => {
    let vivants = [installee()];
    for (let an = 0; an < SAISONS_MAIGRES_AVANT_DEPART; an++) {
      const r = bilanDeTable(vivants, DIMS, TABLE_VIDE, an * 52 + SEMAINE_BILAN_MESANGE, 5_000);
      vivants = r.individus;
      if (an === SAISONS_MAIGRES_AVANT_DEPART - 1) {
        expect(r.partants.length).toBe(1);
        expect(r.partants[0]?.cause).toBe("tableVide");
        expect(vivants).toEqual([]);
      }
    }
  });

  it("et une bonne année remet le compteur à zéro", () => {
    const maigre = bilanDeTable([installee()], DIMS, TABLE_VIDE, SEMAINE_BILAN_MESANGE, 5_000);
    expect(maigre.individus[0]?.saisonsMaigres).toBe(1);
    const grasse = bilanDeTable(
      maigre.individus,
      DIMS,
      TABLE_PLEINE,
      52 + SEMAINE_BILAN_MESANGE,
      5_000,
    );
    expect(grasse.partants).toEqual([]);
    expect(grasse.individus[0]?.saisonsMaigres).toBe(0);
  });

  it("hors de la semaine de bilan, rien ne se passe et rien ne s'alloue", () => {
    // Le bilan dort cinquante semaines sur cinquante-deux, comme
    // l'installation. Rendre le MÊME tableau plutôt qu'une copie n'est pas une
    // coquetterie : c'est ce qui rend le mécanisme gratuit le reste du temps.
    const avant = [installee()];
    const r = bilanDeTable(avant, DIMS, TABLE_VIDE, SEMAINE_BILAN_MESANGE + 1, 5_000);
    expect(r.partants).toEqual([]);
    expect(r.individus).toBe(avant);
  });
});

describe("et la table PAIE : une haie de vieux arbres n'est pas un bois", () => {
  it("le même gîte, le même sol, trois arbres au lieu de vingt-cinq", () => {
    // **L'ESSAI QUI DIT SI LE MÉCANISME SERT À QUELQUE CHOSE.** Un mécanisme
    // qui ne change rien sur une partie réelle n'est pas un mécanisme, c'est un
    // paramètre. Deux parcelles, même station, même graine, même conduite, même
    // proportion d'arbres creusés : seul leur NOMBRE change.
    //
    // Relevé sur trente ans, trois graines :
    //
    //     25 chênes creusés   7 / 7 / 10 individus   AUCUN départ par la faim
    //      3 chênes creusés   4 / 4 /  5 individus   3 départs sur deux graines
    //
    // Et c'est le PIC ÉPEICHE qui disparaît le premier, ce qui est le bon
    // ordre : c'est lui dont le territoire est le plus grand, donc celui qui
    // moyenne le plus de vide. Une mésange se contente d'un hectare, un pic en
    // demande sept — trois arbres ne les nourrissent pas de la même façon.
    const bois = partie(true, 25).state.faune ?? [];
    const haie = partie(true, 3).state.faune ?? [];
    expect(bois.length).toBeGreaterThan(haie.length);
    // Le bois porte des espèces que la haie n'a pas.
    const especesDuBois = new Set(bois.map((i) => i.especeId));
    const especesDeLaHaie = new Set(haie.map((i) => i.especeId));
    expect(especesDuBois.size).toBeGreaterThan(especesDeLaHaie.size);
    // Et la haie garde tout de même du monde : elle est pauvre, pas morte.
    expect(haie.length).toBeGreaterThan(0);
  }, 900_000);
});
