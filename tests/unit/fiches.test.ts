import { describe, expect, it } from "vitest";
import { ESPECES_V0, getEspece } from "../../src/engine/especes";
import { FICHES, ficheDe } from "../../src/render/arbres/especes";
import type { Port } from "../../src/render/arbres/fiche";
import { contraindre } from "../../src/render/arbres/port";
import { engendrer, rayonAtteintM, SEGMENTS_MAX } from "../../src/render/arbres/squelette";

describe("les fiches graphiques tiennent au moteur", () => {
  it("désignent toutes une espèce qui existe", () => {
    for (const f of FICHES) {
      expect(getEspece(f.especeId), f.especeId).toBeDefined();
    }
  });

  it("ne se marchent pas dessus : une espèce, une fiche", () => {
    const ids = FICHES.map((f) => f.especeId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("**ne redéclarent aucune grandeur que le moteur porte déjà**", () => {
    // La règle de `fiche.ts` : la hauteur maximale, le ratio de houppier, la
    // caducité et la marcescence vivent dans `src/engine/especes.ts`. Les
    // dupliquer ici, c'est organiser leur divergence.
    const interdits = ["hauteurMaxM", "houppierRatio", "caduc", "marcescence", "lai", "croissance"];
    for (const f of FICHES) {
      const cles = new Set([
        ...Object.keys(f),
        ...Object.keys(f.branchement),
        ...Object.keys(f.feuillage),
      ]);
      for (const interdit of interdits) {
        expect(cles.has(interdit), `${f.especeId} redéclare ${interdit}`).toBe(false);
      }
    }
  });

  it("portent toutes des références : une fiche sans source est une fiche inventée", () => {
    for (const f of FICHES) {
      expect(f.references.length, f.especeId).toBeGreaterThan(0);
      for (const r of f.references) expect(r.length).toBeGreaterThan(12);
    }
  });

  it("**couvrent tout le catalogue : plus aucune espèce au port générique**", () => {
    // Le sens de lecture inverse du premier essai, et le plus utile des deux :
    // celui-là attrape l'espèce qu'on ajoute au moteur en oubliant son dessin.
    // Elle ne planterait pas — elle sortirait au port générique, ce qui se
    // remarque beaucoup moins qu'une exception.
    const sansFiche = ESPECES_V0.filter((e) => !ficheDe(e.id)).map((e) => e.id);
    expect(sansFiche).toEqual([]);
  });

  it("rendent `undefined` pour une espèce sans fiche, sans lever", () => {
    // Une essence sans fiche prend le port de sa famille en attendant la
    // sienne, et la vue tourne : c'est écrit dans §5.4 et ça doit rester vrai
    // même maintenant que le catalogue est complet — c'est le filet des
    // espèces à venir, pas une étape qu'on a franchie.
    expect(ficheDe("nawak")).toBeUndefined();
  });
});

describe("les huit familles de port sont éprouvées", () => {
  it("couvrent les géométries d'ARBRE", () => {
    // La huitième famille — fourré bas — se dessine par cellule agrégée et ne
    // passe pas par le générateur : elle n'a pas de fiche, et c'est voulu.
    const ports = new Set<Port>(FICHES.map((f) => f.port));
    for (const attendu of ["boule", "retombant", "fastigie", "etage", "gobelet"] as Port[]) {
      expect(ports.has(attendu), attendu).toBe(true);
    }
  });

  it("chaque fiche engendre un arbre non vide, borné, et feuillu", () => {
    for (const f of FICHES) {
      const espece = getEspece(f.especeId);
      if (!espece) continue;
      const hauteurM = Math.min(20, espece.hauteurMaxM * 0.6);
      const segments = engendrer(
        {
          id: 42,
          hauteurM,
          houppierRatio: espece.lumiere.houppierRatio,
          ...(f.brinsDeCepee ? { brins: f.brinsDeCepee } : {}),
        },
        f.branchement,
      );
      expect(segments.length, f.especeId).toBeGreaterThan(3);
      expect(segments.length, f.especeId).toBeLessThanOrEqual(SEGMENTS_MAX);
      expect(
        segments.some((s) => s.terminal),
        f.especeId,
      ).toBe(true);
    }
  });

  it("le houppier de chaque fiche tient dans le ratio que le MOTEUR annonce", () => {
    // Le rayon du houppier n'est pas un paramètre graphique : c'est
    // `lumiere.houppierRatio`, celui-là même qui calcule l'ombre portée. Si le
    // dessin s'en écartait, l'ombre ne correspondrait plus à l'arbre.
    for (const f of FICHES) {
      const espece = getEspece(f.especeId);
      if (!espece) continue;
      const hauteurM = Math.min(20, espece.hauteurMaxM * 0.6);
      const ratio = espece.lumiere.houppierRatio;
      const brut = engendrer(
        {
          id: 42,
          hauteurM,
          houppierRatio: ratio,
          ...(f.brinsDeCepee ? { brins: f.brinsDeCepee } : {}),
        },
        f.branchement,
      );
      const houppier = brut.filter((s) => s.ordre >= 1);
      const base = Math.min(...houppier.map((s) => s.depart.y));
      const sommet = Math.max(...houppier.map((s) => s.arrivee.y));
      const rabattu = contraindre(brut, f.port, base, sommet, ratio * hauteurM).filter(
        (s) => s.ordre >= 1,
      );
      expect(rayonAtteintM(rabattu), f.especeId).toBeLessThanOrEqual(ratio * hauteurM * 1.05);
    }
  });

  it("les vingt-cinq silhouettes se distinguent les unes des autres", () => {
    // Le critère de fin de D4 : « une essence n'est finie que si quelqu'un
    // d'autre la reconnaît sans étiquette ». Ce test est beaucoup plus faible —
    // il constate que les squelettes diffèrent, pas qu'un humain les nomme —
    // mais il attrape le cas où deux fiches auraient convergé par mégarde.
    //
    // **La signature ne peut PAS être le rayon atteint**, et c'est le piège où
    // cet essai est tombé : `contraindre` calibre le houppier pour qu'il
    // touche exactement `rayonMaxM`, donc ce rayon vaut `houppierRatio × h`
    // pour tout le monde — c'est une constante déguisée en mesure. Deux
    // fiches de même port, même ratio moteur et même nombre de segments
    // sortaient donc identiques quels que soient leurs angles : mesuré sur le
    // pommier et l'abricotier, qui n'ont pourtant pas la même charpente.
    //
    // On mesure donc la RÉPARTITION des bouts et non l'extension : leur
    // écartement moyen à l'axe, et leur hauteur moyenne. L'angle d'insertion,
    // la dominance et la tortuosité s'y lisent ; la calibration, non.
    const moyenne = (xs: number[]) => xs.reduce((a, v) => a + v, 0) / Math.max(1, xs.length);
    const signatures = FICHES.map((f) => {
      const espece = getEspece(f.especeId);
      const ratio = espece?.lumiere.houppierRatio ?? 0.3;
      const segments = engendrer(
        {
          id: 42,
          hauteurM: 12,
          houppierRatio: ratio,
          ...(f.brinsDeCepee ? { brins: f.brinsDeCepee } : {}),
        },
        f.branchement,
      );
      const houppier = segments.filter((s) => s.ordre >= 1);
      const base = Math.min(...houppier.map((s) => s.depart.y));
      const sommet = Math.max(...houppier.map((s) => s.arrivee.y));
      const rabattu = contraindre(segments, f.port, base, sommet, ratio * 12);
      const bouts = rabattu.filter((s) => s.terminal);
      const ecart = moyenne(bouts.map((s) => Math.hypot(s.arrivee.x, s.arrivee.z)));
      const haut = moyenne(bouts.map((s) => s.arrivee.y));
      return `${f.port}|${segments.length}|${ecart.toFixed(2)}|${haut.toFixed(2)}`;
    });
    expect(new Set(signatures).size).toBe(FICHES.length);
  });
});

describe("les couleurs de feuillage", () => {
  it("sont dans les clous sur les trois canaux", () => {
    for (const f of FICHES) {
      for (const [nom, t] of Object.entries(f.couleurs)) {
        if (!t) continue;
        for (const canal of [t.r, t.g, t.b]) {
          expect(canal, `${f.especeId}.${nom}`).toBeGreaterThanOrEqual(0);
          expect(canal, `${f.especeId}.${nom}`).toBeLessThanOrEqual(255);
        }
      }
    }
  });

  it("un persistant a une couleur d'HIVER, un caduc pur n'en a pas", () => {
    // Le lien avec le moteur, et il doit tenir dans les deux sens : une fiche
    // qui donnerait un feuillage d'hiver à un caduc pur mentirait sur l'ombre
    // portée, que le moteur calcule à partir de `caduc`.
    //
    // **Le moteur a TROIS façons de porter quelque chose en janvier**, et cet
    // essai n'en connaissait que deux — il aurait refusé le troène, qui a
    // pourtant raison de garder du vert. Les voici :
    //   - `caduc: false` — le persistant vrai (houx, pin, arbousier) ;
    //   - `marcescence` — la feuille MORTE qui tient (hêtre, charme, chêne) ;
    //   - `retentionHivernale` — la feuille VIVANTE qui tient, le
    //     semi-persistant, et le troène est le seul de l'atlas dans ce cas.
    // Les trois font de l'ombre, donc les trois ont une couleur d'hiver ; ce
    // qui change, c'est laquelle — morte pour le deuxième, verte pour l'autre.
    for (const f of FICHES) {
      const espece = getEspece(f.especeId);
      if (!espece) continue;
      const garde =
        !espece.lumiere.caduc ||
        (espece.lumiere.marcescence ?? 0) > 0 ||
        (espece.lumiere.retentionHivernale ?? 0) > 0;
      expect(Boolean(f.couleurs.hiver), f.especeId).toBe(garde);
    }
  });

  it("le printemps est plus CLAIR que l'été : c'est la pousse tendre", () => {
    const clarte = (t: { r: number; g: number; b: number }) => (t.r + t.g + t.b) / 3;
    for (const f of FICHES) {
      expect(clarte(f.couleurs.printemps), f.especeId).toBeGreaterThan(clarte(f.couleurs.ete));
    }
  });
});

describe("les signatures d'écorce", () => {
  it("le bouleau est le fût le plus clair de tous", () => {
    const clarte = (t: { r: number; g: number; b: number }) => (t.r + t.g + t.b) / 3;
    const bouleau = FICHES.find((f) => f.especeId === "betula_pendula");
    expect(bouleau).toBeDefined();
    if (!bouleau) return;
    for (const f of FICHES) {
      if (f.especeId === "betula_pendula") continue;
      expect(clarte(bouleau.ecorce), f.especeId).toBeGreaterThan(clarte(f.ecorce));
    }
  });

  it("le pin sylvestre est le SEUL à avoir deux couleurs de fût", () => {
    // C'est sa signature : gris crevassé en bas, orangé en haut.
    const avecDeux = FICHES.filter((f) => f.ecorceHaute);
    expect(avecDeux.map((f) => f.especeId)).toEqual(["pinus_sylvestris"]);
    const pin = avecDeux[0];
    if (!pin?.ecorceHaute) return;
    // Et le haut est franchement plus chaud que le bas, sinon on ne voit rien.
    expect(pin.ecorceHaute.r - pin.ecorceHaute.b).toBeGreaterThan(pin.ecorce.r - pin.ecorce.b + 40);
  });
});
