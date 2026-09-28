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
import { type CauseDepart, FAUNE } from "../../src/engine/faune";
import { type CauseMort, LIBELLE_CAUSE } from "../../src/engine/trees";
import {
  accord,
  capitale,
  causeDite,
  departDit,
  estFeminin,
  GENRE,
  GENRE_FAUNE,
  libelleFaune,
  nomEspeces,
  nomFaunes,
  pluriel,
  s,
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

/**
 * **Nommer ce qui s'installe** (issue #255).
 *
 * Le moteur appelle « individu » ce qui est tantôt une bête, tantôt un couple
 * nicheur, tantôt quarante femelles dans une loge de pic noir, tantôt des
 * dizaines de larves dans un fût — et les fiches ne le disaient qu'en prose.
 * L'essai passe **l'atlas entier**, comme celui des essences : la phrase attendue
 * est écrite à la main espèce par espèce, donc une guilde qui s'ajoute sans
 * avoir décidé ce qu'elle installe se fait prendre ici.
 */
describe("les mots de la faune", () => {
  /** Ce qu'on doit lire pour chaque fiche, écrit à la main. */
  const ATTENDU_FAUNE: Record<string, string> = {
    mesange_bleue: "un couple de mésanges bleues",
    mesange_charbonniere: "un couple de mésanges charbonnières",
    pic_epeiche: "un couple de pics épeiches",
    chouette_cheveche: "un couple de chouettes chevêches",
    loir_gris: "un loir gris",
    ecureuil_roux: "un écureuil roux",
    buse_variable: "un couple de buses variables",
    murin_de_bechstein: "une colonie de murins de Bechstein",
    noctule_commune: "une colonie de noctules communes",
    pique_prune: "une population de pique-prunes",
    grand_capricorne: "une population de grands capricornes",
    rosalie_des_alpes: "une population de rosalies des Alpes",
  };

  it("nomme les douze fiches de l'atlas, et aucune autre", () => {
    for (const espece of FAUNE) {
      const attendu = ATTENDU_FAUNE[espece.id];
      expect(attendu, `libellé non écrit pour « ${espece.nom} »`).toBeDefined();
      expect(libelleFaune(espece.id), espece.id).toBe(attendu);
    }
    const ids = new Set(FAUNE.map((e) => e.id));
    for (const id of Object.keys(ATTENDU_FAUNE)) {
      expect(ids.has(id), `« ${id} » n'est plus à l'atlas`).toBe(true);
    }
  });

  it("ne dit jamais « une noctule » d'une colonie", () => {
    // Le défaut que le champ `unite` existe pour empêcher : la noctule
    // s'installe par colonie de parturition, pas par bête, et l'écrire au
    // singulier serait faux d'un facteur quarante.
    expect(libelleFaune("noctule_commune")).toContain("colonie");
    // Et une larve de capricorne n'est pas non plus l'unité : c'est **l'arbre**
    // qui porte une population, et c'est ce que la conservation compte.
    expect(libelleFaune("grand_capricorne")).toContain("population");
  });

  it("accorde « pique-prune » sans accorder le verbe", () => {
    // Un composé verbe + nom : « pique » ne s'accorde pas, quand « chêne-liège »
    // accorde ses deux moitiés. Rien dans la forme ne les distingue, donc la
    // règle générale se trompe et la liste la rattrape.
    expect(nomFaunes("pique_prune", 3)).toBe("pique-prunes");
    expect(nomFaunes("pique_prune", 1)).toBe("pique-prune");
  });

  it("donne un genre à chaque fiche, et à rien d'autre", () => {
    for (const espece of FAUNE) {
      expect(GENRE_FAUNE[espece.id], `genre non écrit pour « ${espece.nom} »`).toBeDefined();
    }
    const ids = new Set(FAUNE.map((e) => e.id));
    for (const id of Object.keys(GENRE_FAUNE)) {
      expect(ids.has(id), `« ${id} » n'est plus à l'atlas`).toBe(true);
    }
  });

  it("dit les trois causes de départ, sans en laisser une muette", () => {
    for (const cause of ["arbreDisparu", "giteTropPetit", "tableVide"] as CauseDepart[]) {
      expect(departDit(cause).length, cause).toBeGreaterThan(3);
    }
    // Celle-ci est la seule qui soit une conséquence de la conduite du joueur,
    // et elle doit le dire.
    expect(departDit("arbreDisparu")).toContain("arbre");
  });

  it("une espèce inconnue ne fait pas exploser la phrase", () => {
    expect(libelleFaune("chimere")).toBe("chimere");
  });

  it("capitale() ouvre une phrase sans toucher au reste", () => {
    expect(capitale(libelleFaune("mesange_bleue"))).toBe("Un couple de mésanges bleues");
  });
});
