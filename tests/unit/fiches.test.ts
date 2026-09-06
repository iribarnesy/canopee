import { describe, expect, it } from "vitest";
import { ESPECES_V0, getEspece } from "../../src/engine/especes";
import { FICHES, ficheDe } from "../../src/render/arbres/especes";
import type { Port } from "../../src/render/arbres/fiche";
import { contraindre } from "../../src/render/arbres/port";
import { engendrer, rayonAtteintM, SEGMENTS_MAX } from "../../src/render/arbres/squelette";
import { vueInitiale } from "../../src/render/camera";
import {
  type ArbreAPoser,
  classeDe,
  cleClasse,
  etatDuFruit,
  FRUIT_AUCUN,
  FRUIT_CROISSANCE,
  FRUIT_MUR,
} from "../../src/render/couches/arbres";

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
          baseHouppierM: hauteurM * 0.25,
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
          baseHouppierM: hauteurM * 0.25,
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
          baseHouppierM: 3,
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

describe("les houppiers tiennent debout", () => {
  /**
   * Décentrement d'un houppier : distance du barycentre des bouts à l'axe du
   * tronc, rapportée au rayon atteint. Zéro = houppier centré.
   */
  function decentrement(f: (typeof FICHES)[number], id: number): number | undefined {
    const espece = getEspece(f.especeId);
    const ratio = espece?.lumiere.houppierRatio ?? 0.35;
    const hauteurM = Math.min(16, (espece?.hauteurMaxM ?? 16) * 0.6);
    const brut = engendrer(
      {
        id,
        hauteurM,
        houppierRatio: ratio,
        baseHouppierM: 3,
        ...(f.brinsDeCepee ? { brins: f.brinsDeCepee } : {}),
      },
      f.branchement,
    );
    const houppier = brut.filter((s) => s.ordre >= 1);
    if (houppier.length === 0) return undefined;
    const base = Math.min(...houppier.map((s) => s.depart.y));
    const sommet = Math.max(...houppier.map((s) => s.arrivee.y));
    const bouts = contraindre(brut, f.port, base, sommet, ratio * hauteurM).filter(
      (s) => s.terminal,
    );
    if (bouts.length === 0) return undefined;
    const cx = bouts.reduce((a, s) => a + s.arrivee.x, 0) / bouts.length;
    const cz = bouts.reduce((a, s) => a + s.arrivee.z, 0) / bouts.length;
    return Math.hypot(cx, cz) / Math.max(1e-6, rayonAtteintM(bouts));
  }

  it("**aucun houppier ne penche d'un côté**", () => {
    // Le défaut, et il se voyait d'un coup d'œil sur la planche : le houppier
    // s'effondrait d'un côté de l'arbre, la flèche restant nue de l'autre. Il
    // avait trois causes empilées, et il a fallu les trois mesures pour les
    // séparer — c'est pour ça que cet essai mesure au lieu de regarder.
    //
    //   1. Le décalage d'azimut était tiré par FILLE et non par nœud, ce qui
    //      effaçait la divergence : chaque fille partait dans une direction
    //      indépendante, et trois tirages uniformes se groupent au lieu de se
    //      répartir. (0,17→0,32 sur les feuillus à fût unique.)
    //   2. La divergence était appliquée entre filles d'un même nœud au lieu de
    //      l'être d'un nœud au suivant : ce n'est pas ce que le mot désigne
    //      dans la plante, et ce n'est pas ce qui équilibre un arbre.
    //   3. Les espèces à rameaux opposés déclaraient `branchesParNoeud: 2`,
    //      c'est-à-dire UNE latérale, la flèche comptant pour la première.
    //
    // Les cépées et le pin, eux, étaient déjà centrés : ce sont précisément les
    // deux cas où le code répartissait les azimuts régulièrement. Le seuil est
    // fixé au-dessus du pire mesuré après correction — le bouleau et le frêne,
    // à 0,13 — et bien en dessous de ce que donnaient les trois défauts.
    for (const f of FICHES) {
      if (f.fourre) continue;
      for (const id of [3, 17, 42, 88, 131]) {
        const d = decentrement(f, id);
        if (d === undefined) continue;
        expect(d, `${f.especeId} (graine ${id})`).toBeLessThan(0.25);
      }
    }
  });

  it("aucune fiche ne range ses latérales dans un seul plan", () => {
    // 180° de divergence, c'est la garantie que toutes les latérales d'un axe
    // tombent dans un même plan vertical : le frêne en sortait en C. Le piège
    // est d'autant plus facile que 180° a l'air de vouloir dire « opposé » —
    // or la paire opposée est affaire de `branchesParNoeud`, pas de divergence.
    for (const f of FICHES) {
      if (f.fourre) continue;
      const d = f.branchement.divergenceDeg;
      expect(Math.abs(d - 180), `${f.especeId} : divergence ${d}°`).toBeGreaterThan(15);
    }
  });

  it("une paire opposée se déclare à TROIS, la flèche comptant pour une", () => {
    // La cohérence entre ce que la fiche dit en français et ce qu'elle encode :
    // cinq fiches annonçaient des rameaux « opposés, par paires » avec un
    // compte qui n'en donnait qu'un seul.
    const opposees = [
      "fraxinus_excelsior",
      "sambucus_nigra",
      "cornus_mas",
      "euonymus_europaeus",
      "ligustrum_vulgare",
    ];
    for (const id of opposees) {
      const f = ficheDe(id);
      expect(f, id).toBeDefined();
      expect(f?.branchement.branchesParNoeud, id).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("les fruits : l'état vient du moteur, le dessin de la fiche", () => {
  it("**une fiche déclare un fruit SI ET SEULEMENT SI le moteur en suit un**", () => {
    // Le garde-fou central de cette fonctionnalité, et il tient dans les deux
    // sens. Une fiche qui déclarerait un fruit sans bloc `fruits` côté moteur
    // peindrait un fruit sans état derrière : il ne mûrirait jamais, ne se
    // récolterait pas, ne disparaîtrait pas après la fenêtre — et il masquerait
    // le fait qu'il manque quelque chose au modèle, ce qui est le pire des deux
    // maux (§0, principe n° 1).
    //
    // Dans l'autre sens, une espèce que le moteur fait fructifier et dont la
    // fiche ne dit rien produit un arbre qui porte des kilos invisibles : le
    // joueur ne sait pas qu'il y a à récolter.
    //
    // Trois espèces portent des fruits bien visibles et n'ont rien côté moteur
    // — l'aubépine, le houx, le fusain — et cet essai est ce qui garantit
    // qu'on ne leur en dessinera pas par distraction.
    for (const f of FICHES) {
      const espece = getEspece(f.especeId);
      if (!espece) continue;
      expect(
        Boolean(f.fruit),
        `${f.especeId} : fiche ${f.fruit ? "avec" : "sans"} fruit, moteur ${espece.fruits ? "avec" : "sans"}`,
      ).toBe(Boolean(espece.fruits));
    }
  });

  it("un rendement NUL n'est pas un fruit absent", () => {
    // Le troène a `rendementMaxKg: 0` — ses baies sont toxiques et ne se
    // récoltent pas — mais le moteur suit quand même leur cycle. Elles ont donc
    // un état, et se dessinent. Confondre « rien à récolter » avec « rien à
    // voir » aurait supprimé un des fruits les plus caractéristiques de la haie.
    const troene = ficheDe("ligustrum_vulgare");
    expect(troene?.fruit).toBeDefined();
    expect(getEspece("ligustrum_vulgare")?.fruits?.rendementMaxKg).toBe(0);
  });

  it("**l'état lu est celui du moteur, et le mûr l'emporte**", () => {
    // `fruitsKg` passe devant `fruitProgress`, et ce n'est pas arbitraire : un
    // arbre chargé de fruits mûrs a AUSSI un `fruitProgress` de 1, et c'est le
    // mûr qui est l'information — c'est le seul état de la liste qui appelle un
    // geste, et il se perd si on le rate (`fenetreRecolteWeeks`).
    const arbre = (patch: Partial<ArbreAPoser>): ArbreAPoser => ({
      id: 1,
      especeId: "malus_domestica",
      x: 0,
      y: 0,
      z: 0,
      heightM: 6,
      houppierRatio: 0.45,
      baseHouppierM: 1.5,
      partFoliaire: 1,
      senescence: 0,
      vigueur: 1,
      ...patch,
    });
    expect(etatDuFruit(arbre({}))).toBe(FRUIT_AUCUN);
    expect(etatDuFruit(arbre({ fruitProgress: 0.5 }))).toBe(FRUIT_CROISSANCE);
    expect(etatDuFruit(arbre({ fruitProgress: 1, fruitsKg: 12 }))).toBe(FRUIT_MUR);
    // Et l'inverse ne s'invente pas : sans grandeur, pas de fruit. Un arbre
    // dont la scène ne transporte pas l'état n'en porte pas.
    expect(etatDuFruit(arbre({ fruitsKg: 0, fruitProgress: 0 }))).toBe(FRUIT_AUCUN);
  });

  it("l'état de fructification entre dans la clé de cache", () => {
    // Sans quoi un pommier chargé et un pommier nu partageraient la même image,
    // et ce serait l'un ou l'autre qu'on verrait selon qui a été cuit le
    // premier.
    const v = vueInitiale(100, 800, 600);
    const base: ArbreAPoser = {
      id: 3,
      especeId: "malus_domestica",
      x: 10,
      y: 10,
      z: 0,
      heightM: 6,
      houppierRatio: 0.45,
      baseHouppierM: 1.5,
      partFoliaire: 1,
      senescence: 0,
      vigueur: 1,
    };
    const nu = cleClasse(classeDe(base, 12, v));
    const charge = cleClasse(classeDe({ ...base, fruitProgress: 1, fruitsKg: 9 }, 12, v));
    expect(nu).not.toBe(charge);
  });

  it("les diamètres de grappe déclarés sont plus grands que leurs fruits", () => {
    // Une cohérence bête et utile : un corymbe contient ses baies, donc il est
    // plus large qu'une baie. C'est le sens de la grandeur — et l'essai attrape
    // l'unité confondue (centimètres au lieu de mètres), qui est l'erreur
    // probable sur un champ comme celui-là.
    for (const f of FICHES) {
      if (!f.fruit?.grappeM) continue;
      expect(f.fruit.grappeM, f.especeId).toBeGreaterThan(f.fruit.longueurM);
      // Et pas absurdement : un groupe de fruits n'est pas un houppier.
      expect(f.fruit.grappeM, f.especeId).toBeLessThan(0.5);
    }
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
