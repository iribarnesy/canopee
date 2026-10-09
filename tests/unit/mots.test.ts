/**
 * **L'accord des noms d'essence** (`src/game/mots.ts`).
 *
 * L'essai passe le **catalogue entier**, et c'est le point : la règle est une
 * poignée de motifs, elle ne prétend pas savoir le français. Ce qu'on garantit,
 * c'est qu'elle couvre les vingt-six noms du moteur — et que le jour où une
 * essence s'ajoute avec une forme qu'elle ne sait pas, l'essai le dit avant le
 * joueur.
 */

import { describe, expect, it } from "vitest";
import { ESPECES_V0 } from "../../src/engine/especes";
import { especeFaune, FAUNE } from "../../src/engine/faune";
import { type CauseMort, LIBELLE_CAUSE } from "../../src/engine/trees";
import {
  accord,
  capitale,
  causeDite,
  departDit,
  estFeminin,
  GENRE,
  ilOuElle,
  laFaune,
  nomEspeces,
  pluriel,
  s,
  uneFaune,
} from "../../src/game/mots";

/** Le pluriel attendu de chaque nom du catalogue, écrit à la main. */
const ATTENDU: Record<string, string> = {
  Abricotier: "Abricotiers",
  "Ajonc d'Europe": "Ajoncs d'Europe",
  Arbousier: "Arbousiers",
  Aubépine: "Aubépines",
  "Aulne glutineux": "Aulnes glutineux",
  "Bouleau verruqueux": "Bouleaux verruqueux",
  Callune: "Callunes",
  Charme: "Charmes",
  Châtaignier: "Châtaigniers",
  "Chêne pubescent": "Chênes pubescents",
  "Chêne-liège": "Chênes-lièges",
  "Cornouiller mâle": "Cornouillers mâles",
  "Frêne commun": "Frênes communs",
  "Fusain d'Europe": "Fusains d'Europe",
  "Genêt à balais": "Genêts à balais",
  Houx: "Houx",
  Hêtre: "Hêtres",
  Noisetier: "Noisetiers",
  "Noyer commun": "Noyers communs",
  "Pin sylvestre": "Pins sylvestres",
  Pommier: "Pommiers",
  Prunellier: "Prunelliers",
  Ronce: "Ronces",
  "Saule blanc": "Saules blancs",
  "Sureau noir": "Sureaux noirs",
  "Troène commun": "Troènes communs",
};

describe("causeDite", () => {
  it("accorde le participe, pas le complément", () => {
    // Le défaut vu sur l'écran de fin : « 90 ronces morts étouffés par l'ombre ».
    expect(causeDite("ombre", 90, true)).toBe("étouffées par l'ombre");
    expect(causeDite("ombre", 1, false)).toBe("étouffé par l'ombre");
    expect(causeDite("ombre", 3, false)).toBe("étouffés par l'ombre");
  });

  it("laisse les causes sans participe invariables", () => {
    for (const n of [1, 40]) {
      for (const f of [false, true]) {
        expect(causeDite("secheresse", n, f)).toBe("de sécheresse");
        expect(causeDite("vieillesse", n, f)).toBe("de vieillesse");
        expect(causeDite("feu", n, f)).toBe("dans l'incendie");
      }
    }
  });

  it("change le complément là où le NOMBRE le change", () => {
    expect(causeDite("solHorsGamme", 1)).toContain("de sa gamme");
    expect(causeDite("solHorsGamme", 5)).toContain("de leur gamme");
  });

  it("couvre toutes les causes du moteur, sans phrase vide", () => {
    for (const cause of Object.keys(LIBELLE_CAUSE) as CauseMort[]) {
      expect(causeDite(cause).length, cause).toBeGreaterThan(3);
      expect(causeDite(cause, 5, true).length, cause).toBeGreaterThan(3);
    }
  });
});

describe("pluriel", () => {
  it("accorde les vingt-six noms du catalogue", () => {
    for (const espece of ESPECES_V0) {
      const attendu = ATTENDU[espece.nom];
      expect(attendu, `pluriel non écrit pour « ${espece.nom} »`).toBeDefined();
      expect(pluriel(espece.nom, 3), espece.nom).toBe(attendu);
    }
  });

  it("couvre le catalogue et rien de plus", () => {
    const noms = new Set(ESPECES_V0.map((e) => e.nom));
    for (const nom of Object.keys(ATTENDU)) {
      expect(noms.has(nom), `« ${nom} » n'est plus au catalogue`).toBe(true);
    }
  });

  it("ne bouge pas au singulier ni à zéro", () => {
    expect(pluriel("Bouleau verruqueux", 1)).toBe("Bouleau verruqueux");
    expect(pluriel("Bouleau verruqueux", 0)).toBe("Bouleau verruqueux");
  });

  it("ne rajoute pas de s à ce qui finit déjà par une sifflante", () => {
    // Le défaut qu'il corrige : le journal écrivait « 2 houxs ».
    expect(pluriel("Houx", 2)).toBe("Houx");
    expect(pluriel("Aulne glutineux", 2)).toBe("Aulnes glutineux");
  });

  it("met le nom en minuscules au fil du texte", () => {
    expect(nomEspeces("betula_pendula", 3)).toBe("bouleaux verruqueux");
    expect(nomEspeces("betula_pendula", 1)).toBe("bouleau verruqueux");
  });

  it("donne un genre à chaque essence du catalogue, et à rien d'autre", () => {
    for (const espece of ESPECES_V0) {
      expect(GENRE[espece.id], `genre non écrit pour « ${espece.nom} »`).toBeDefined();
    }
    const ids = new Set(ESPECES_V0.map((e) => e.id));
    for (const id of Object.keys(GENRE)) {
      expect(ids.has(id), `« ${id} » n'est plus au catalogue`).toBe(true);
    }
  });

  it("connaît les trois essences féminines", () => {
    expect(estFeminin("rubus_fruticosus")).toBe(true);
    expect(estFeminin("crataegus_monogyna")).toBe(true);
    expect(estFeminin("calluna_vulgaris")).toBe(true);
    expect(estFeminin("fagus_sylvatica")).toBe(false);
    // Une essence inconnue passe au masculin plutôt que d'exploser.
    expect(estFeminin("inconnue")).toBe(false);
  });

  it("accord() donne les quatre terminaisons", () => {
    expect(accord(false, 1)).toBe("");
    expect(accord(true, 1)).toBe("e");
    expect(accord(false, 3)).toBe("s");
    expect(accord(true, 3)).toBe("es");
  });

  it("s() n'accorde qu'au-delà de un", () => {
    expect(s(0)).toBe("");
    expect(s(1)).toBe("");
    expect(s(2)).toBe("s");
  });
});

describe("la faune, comptée comme le moteur la compte (#259)", () => {
  const fiche = (id: string) => {
    const e = especeFaune(id);
    if (!e) throw new Error(id);
    return e;
  };

  it("une arrivée dit ce qui s'installe : un couple, une colonie, une population, une bête", () => {
    expect(uneFaune(fiche("mesange_bleue"))).toBe("un couple de mésanges bleues");
    expect(uneFaune(fiche("pic_epeiche"))).toBe("un couple de pics épeiches");
    expect(uneFaune(fiche("murin_de_bechstein"))).toBe("une colonie de murins de Bechstein");
    expect(uneFaune(fiche("noctule_commune"))).toBe("une colonie de noctules communes");
    expect(uneFaune(fiche("grand_capricorne"))).toBe("une population de grands capricornes");
    expect(uneFaune(fiche("rosalie_des_alpes"))).toBe("une population de rosalies des Alpes");
    expect(uneFaune(fiche("ecureuil_roux"))).toBe("un écureuil roux");
  });

  it("le pique-prune ne s'accorde que sur son nom", () => {
    expect(uneFaune(fiche("pique_prune"))).toBe("une population de pique-prunes");
  });

  it("un départ désigne ce qui était là, à l'article défini", () => {
    expect(laFaune(fiche("buse_variable"))).toBe("le couple de buses variables");
    expect(laFaune(fiche("noctule_commune"))).toBe("la colonie de noctules communes");
    expect(laFaune(fiche("ecureuil_roux"))).toBe("l'écureuil roux");
    expect(laFaune(fiche("loir_gris"))).toBe("le loir gris");
  });

  it("le pronom suit le mot qui compte, pas l'espèce", () => {
    // « la mésange » est féminine, « le couple » ne l'est pas.
    expect(ilOuElle(fiche("mesange_bleue"))).toBe("il");
    expect(ilOuElle(fiche("murin_de_bechstein"))).toBe("elle");
    expect(ilOuElle(fiche("ecureuil_roux"))).toBe("il");
  });

  it("l'unité vient de la fiche, pas d'une liste du jeu", () => {
    const inventee = { id: "aigle_imaginaire", nom: "aigle noir", unite: "colonie" } as const;
    expect(uneFaune(inventee)).toBe("une colonie d'aigles noirs");
    expect(laFaune({ ...inventee, unite: "individu" })).toBe("l'aigle noir");
  });

  it("nomme les douze espèces de l'atlas, chacune avec son article et son nom", () => {
    // La table des genres est du jeu, pas du moteur — c'est de la grammaire.
    // Si l'atlas grandit sans elle, ça se voit ici et non à l'écran.
    for (const espece of FAUNE) {
      expect(uneFaune(espece), espece.id).toMatch(/^(un |une )/);
      expect(laFaune(espece), espece.id).toMatch(/^(le |la |l')/);
      if (espece.unite === "individu") expect(uneFaune(espece)).toContain(espece.nom);
      else expect(uneFaune(espece)).toContain(`${espece.unite} de`);
    }
  });

  it("chaque cause de départ a sa phrase, et aucune n'est vide", () => {
    for (const cause of ["arbreDisparu", "arbreMort", "giteTropPetit", "tableVide"] as const) {
      expect(departDit(cause).length, cause).toBeGreaterThan(5);
    }
  });

  it("met la capitale sur la première lettre, élision comprise", () => {
    expect(capitale("l'écureuil roux s'installe")).toBe("L'écureuil roux s'installe");
    expect(capitale("la buse variable s'en va")).toBe("La buse variable s'en va");
  });
});
