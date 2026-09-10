/**
 * Le front d'incendie.
 *
 * **Ce que ces essais gardent : que le front COURT.** C'est la seule chose qui
 * distingue un incendie pédagogique d'une tache noire, et le §6.4 le dit —
 * « une ligne de flammes qui court de cellule en cellule dans l'ordre du rang
 * d'arrivée […] c'est la carte de combustibilité qui devient visible ».
 */

import { describe, expect, it } from "vitest";
import { propager, rangsDuFront } from "../../src/engine/feu";
import { rngStateFromSeed } from "../../src/engine/rng";
import {
  BOUFFEES_PAR_COLONNE,
  BRAISES_MAX,
  CENDRE,
  CHARGE_DE_REFERENCE,
  COEUR,
  COLONNES_MAX,
  cellulesEnFlammes,
  cellulesQuiFument,
  FLAMME,
  FLAMME_LA_PLUS_BASSE_M,
  FLAMME_LA_PLUS_HAUTE,
  FLAMMES_MAX,
  type FrontDIncendie,
  feuAuSol,
  frontEnCours,
  HAUTEUR_DE_FLAMME_M,
  LUEURS_MAX,
  OPACITE_DE_LA_CENDRE,
  OPACITE_DE_LA_FLAMME,
  panacheDuFeu,
  partDeLaCharge,
  porteeDuFront,
  RANGS_DU_FRONT,
  SANS_VENT,
  VARIANTES_DE_BRULURE,
} from "../../src/render/temps/feu";

const COTE = 40;

/**
 * Un front produit par le MOTEUR, pas par moi.
 *
 * **C'est la leçon du banc de bois mort** : un banc qui fabrique un état
 * inatteignable accuse le rendu. On fait donc propager un vrai feu sur une
 * charge de combustible uniforme, et on lui demande ses rangs par la fonction
 * du moteur — de sorte que ce qu'on teste est ce que le jeu produira.
 */
function frontDuMoteur(chargeParCellule: number): FrontDIncendie & { origine: number } {
  const n = COTE * COTE;
  const parCellule = new Array<number>(n).fill(chargeParCellule);
  const origine = Math.floor(COTE / 2) * COTE + Math.floor(COTE / 2);
  const { brulees } = propager(
    origine,
    { parCellule, moyenne: chargeParCellule },
    COTE,
    rngStateFromSeed(1234),
  );
  const rangs = rangsDuFront(brulees, origine, COTE);
  const liste = [...brulees].sort((a, b) => (rangs.get(a) ?? 0) - (rangs.get(b) ?? 0));
  return {
    origine,
    brulees: liste,
    rangs: liste.map((c) => rangs.get(c) ?? 0),
  };
}

/** La teinte d'une cellule dans une sortie de front, si elle y est. */
function teinteDe(cellules: ReturnType<typeof frontEnCours>, cellule: number) {
  return cellules.find((c) => c.cellule === cellule)?.teinte;
}

describe("frontEnCours", () => {
  const front = frontDuMoteur(2);

  it("ne dessine RIEN avant que le feu ne parte", () => {
    // Un feu qui noircirait d'avance raconterait le contraire de ce qui se
    // passe : la parcelle est intacte jusqu'au passage du front.
    expect(frontEnCours(front, 0)).toEqual([]);
  });

  it("part de l'ORIGINE et de nulle part ailleurs", () => {
    const debut = frontEnCours(front, 0.01);
    expect(debut.length).toBeGreaterThan(0);
    for (const c of debut) {
      // au tout début, seules les cellules de rang le plus bas sont touchées
      const i = (front.brulees as number[]).indexOf(c.cellule);
      expect(front.rangs[i] ?? 99).toBeLessThan(RANGS_DU_FRONT);
    }
    expect(debut.some((c) => c.cellule === front.origine)).toBe(true);
  });

  it("COURT : ce qui brûle à un instant n'est pas ce qui brûle à un autre", () => {
    const flamboie = (a: number) =>
      new Set(
        frontEnCours(front, a)
          .filter((c) => c.opacite >= OPACITE_DE_LA_FLAMME - 1e-9)
          .map((c) => c.cellule),
      );
    const tot = flamboie(0.2);
    const tard = flamboie(0.8);
    expect(tot.size).toBeGreaterThan(0);
    expect(tard.size).toBeGreaterThan(0);
    // Un front qui court : les deux ensembles sont largement disjoints.
    const communes = [...tot].filter((c) => tard.has(c));
    expect(communes.length).toBeLessThan(Math.min(tot.size, tard.size) * 0.35);
  });

  it("laisse de la CENDRE derrière lui, pas des flammes", () => {
    const milieu = frontEnCours(front, 0.5);
    const cendre = milieu.filter((c) => c.opacite < OPACITE_DE_LA_FLAMME - 1e-9);
    expect(cendre.length).toBeGreaterThan(0);
    // L'origine a brûlé la première : à mi-parcours elle est froide.
    expect(teinteDe(milieu, front.origine)).toEqual(CENDRE);
  });

  it("finit TOUT en cendre, et n'oublie aucune cellule brûlée", () => {
    const fin = frontEnCours(front, 1);
    expect(fin.length).toBe(front.brulees.length);
    for (const c of fin) {
      expect(c.teinte).toEqual(CENDRE);
      expect(c.opacite).toBeCloseTo(OPACITE_DE_LA_CENDRE, 6);
    }
  });

  it("borne l'avancement au lieu d'extrapoler", () => {
    expect(frontEnCours(front, 4)).toEqual(frontEnCours(front, 1));
    expect(frontEnCours(front, -1)).toEqual([]);
  });

  it("ne sort JAMAIS d'une cellule que le moteur n'a pas brûlée", () => {
    const permises = new Set(front.brulees as number[]);
    for (let a = 0; a <= 1; a += 0.05) {
      for (const c of frontEnCours(front, a)) expect(permises.has(c.cellule)).toBe(true);
    }
  });

  it("marque chaque cellule brûlée comme une TACHE ÉTALÉE, pas comme un carreau", () => {
    // C'est ce qui distingue une brûlure d'un chaulage : le geste s'applique au
    // mètre carré et son bord franc le dit, la brûlure bave sur ses voisines.
    // Dessinée au carreau, elle donnait un damier — et les cellules que la
    // propagation avait sautées à l'intérieur du brûlé ressortaient en losanges
    // verts nets, ce qui se lit comme du bruit d'écran.
    const milieu = frontEnCours(front, 0.5);
    expect(milieu.length).toBeGreaterThan(0);
    for (const c of milieu) {
      expect(c.brulure).toBeDefined();
      expect(c.brulure).toBeGreaterThanOrEqual(0);
      expect(c.brulure).toBeLessThan(VARIANTES_DE_BRULURE);
    }
    // Les variantes sont VRAIMENT réparties : une seule reformerait une trame,
    // plus grosse qu'un damier de cellules mais une trame quand même.
    expect(new Set(milieu.map((c) => c.brulure)).size).toBe(VARIANTES_DE_BRULURE);
  });

  it("la flamme est CLAIRE et la cendre est SOMBRE", () => {
    // C'est le contraste qui rend le front lisible, et donc la carte de
    // combustibilité visible. S'il s'inversait, le feu se lirait comme une
    // ombre qui avance.
    const clarte = (t: { r: number; g: number; b: number }) => (t.r + t.g + t.b) / 3;
    expect(clarte(FLAMME)).toBeGreaterThan(clarte(CENDRE) * 4);
  });

  it("accepte un incendie vide sans se plaindre", () => {
    expect(frontEnCours({ brulees: [], rangs: [] }, 0.5)).toEqual([]);
    expect(porteeDuFront({ brulees: [], rangs: [] })).toBe(0);
  });
});

describe("porteeDuFront", () => {
  it("rend le rang le plus élevé, donc jusqu'où le feu est allé", () => {
    const petit = frontDuMoteur(0.35);
    const grand = frontDuMoteur(3);
    expect(porteeDuFront(grand)).toBeGreaterThan(porteeDuFront(petit));
  });

  it("croît avec la charge de combustible : c'est la carte qui décide", () => {
    // La propriété pédagogique du §6.4 — « le front s'essouffle dans le feuillu
    // frais, fonce dans la lande » — tient à ce que la portée SUIVE le
    // combustible. Ce n'est pas le rendu qui la produit, c'est le moteur ; mais
    // le rendu la perdrait s'il cessait de lire les rangs.
    const portees = [0.35, 1, 2, 4].map((c) => porteeDuFront(frontDuMoteur(c)));
    for (let i = 1; i < portees.length; i++) {
      expect(portees[i] ?? 0).toBeGreaterThanOrEqual(portees[i - 1] ?? 0);
    }
  });
});

/**
 * Les particules : la lueur, les flammes, le panache, les braises.
 *
 * **Ce que ces essais gardent : que le feu S'ÉTEINT tout seul, et que rien ne
 * sort de ce que le moteur a brûlé.** Le premier est ce qui évite un panache
 * suspendu au-dessus d'une parcelle en cendres à la fin de l'acte ; le second
 * est la règle #1 du cahier, appliquée à un système qui, par nature, invente des
 * positions — un panache de fumée n'existe nulle part dans l'état du moteur.
 */
describe("les particules du feu", () => {
  const front = frontDuMoteur(2);
  const COTE_P = COTE;
  const brulees = new Set(front.brulees as number[]);

  const auSol = (a: number, t = 0) => feuAuSol(front, a, t, COTE_P);
  // **Un vent EST vent, et le moteur le dit maintenant** : le panache ne devine
  // plus sa direction depuis l'avance du front. On souffle donc vers l'est-nord-
  // est pour les essais, avec une force qu'on fait varier.
  const enHaut = (a: number, t = 0, force = 0.6) =>
    panacheDuFeu(front, a, t, COTE_P, { versRad: 0.4, force });

  it("ne produit RIEN avant que le feu ne parte", () => {
    expect(auSol(0)).toEqual([]);
    expect(enHaut(0)).toEqual([]);
    expect(auSol(-1)).toEqual([]);
  });

  it("S'ÉTEINT tout seul à la fin de l'acte, sans cas particulier", () => {
    // C'est la propriété qui a dispensé d'écrire une extinction : à
    // l'avancement 1, la tête du front a dépassé le dernier rang de sa largeur
    // plus un, donc plus une cellule ne flambe, donc plus une flamme et plus
    // une bouffée. Il ne reste que la cendre du calque au sol — ce que
    // l'instantané d'après décrira.
    expect(cellulesEnFlammes(front, 1)).toEqual([]);
    expect(auSol(1)).toEqual([]);
    expect(enHaut(1)).toEqual([]);
    // et la cendre, elle, est toujours là
    expect(frontEnCours(front, 1).length).toBe(front.brulees.length);
  });

  it("ne part JAMAIS d'une cellule que le moteur n'a pas brûlée", () => {
    for (let a = 0.05; a < 1; a += 0.05) {
      for (const p of [...auSol(a, a * 1000), ...enHaut(a, a * 1000)]) {
        expect(brulees.has(p.cellule)).toBe(true);
      }
    }
  });

  it("ne fait FLAMBER que ce qui flambe, et FUMER que ce qui vient de brûler", () => {
    // Une flamme sur un sol froid, ou une bouffée au-dessus de lui, dirait que
    // le feu est encore là. Et une traîne sur ce qui n'a pas encore brûlé
    // dirait l'inverse.
    const a = 0.4;
    const enFeu = new Set(cellulesEnFlammes(front, a).map((c) => c.cellule));
    const fument = new Set(cellulesQuiFument(front, a).map((c) => c.cellule));
    for (const p of [...auSol(a), ...enHaut(a)]) {
      expect(p.forme === "traine" ? fument.has(p.cellule) : enFeu.has(p.cellule)).toBe(true);
    }
    // les deux ensembles sont DISJOINTS : ce qui flambe ne fume pas encore
    for (const c of enFeu) expect(fument.has(c)).toBe(false);
    // et le front n'est qu'une petite part du brûlé
    expect(enFeu.size).toBeLessThan(front.brulees.length * 0.5);
  });

  it("fait FUMER derrière le front, jamais devant", () => {
    // La traîne relie le front à son panache ; posée devant, elle annoncerait
    // le feu là où la parcelle est encore intacte.
    const a = 0.4;
    const rangDe = new Map<number, number>();
    for (let i = 0; i < front.brulees.length; i++) {
      rangDe.set(front.brulees[i] as number, front.rangs[i] as number);
    }
    const rangsEnFeu = cellulesEnFlammes(front, a).map((c) => rangDe.get(c.cellule) ?? 0);
    const rangMinEnFeu = Math.min(...rangsEnFeu);
    for (const c of cellulesQuiFument(front, a)) {
      // ce qui fume est en ARRIÈRE : son rang est inférieur à la ligne de feu
      expect(rangDe.get(c.cellule) ?? 0).toBeLessThan(rangMinEnFeu);
    }
  });

  it("respecte ses plafonds, quel que soit le nombre de cellules en feu", () => {
    // Mesuré : un front de cent rangs a des milliers de cellules en flammes à
    // son plus large. Sans plafond, ce sont autant de panneaux à trier et à
    // poser par image — et un mur opaque au lieu d'une ligne de flammes.
    let vues = 0;
    for (let a = 0.1; a < 1; a += 0.1) {
      const sol = auSol(a);
      const haut = enHaut(a);
      const par = (l: typeof sol, f: string) => l.filter((p) => p.forme === f).length;
      expect(par(sol, "lueur")).toBeLessThanOrEqual(LUEURS_MAX);
      expect(par(sol, "flamme")).toBeLessThanOrEqual(FLAMMES_MAX);
      expect(par(sol, "coeur")).toBeLessThanOrEqual(FLAMMES_MAX);
      expect(par(haut, "fumee")).toBeLessThanOrEqual(COLONNES_MAX * BOUFFEES_PAR_COLONNE);
      expect(par(haut, "braise")).toBeLessThanOrEqual(BRAISES_MAX);
      vues = Math.max(vues, cellulesEnFlammes(front, a).length);
    }
    // et l'essai ne vaut que si le plafond a vraiment servi
    expect(vues).toBeGreaterThan(FLAMMES_MAX);
  });

  it("est REPRODUCTIBLE : deux fois le même instant, deux fois la même image", () => {
    // C'est ce qui rend une capture figée jugeable, et ce qu'un système de
    // particules à état ne peut pas donner.
    expect(auSol(0.37, 1234)).toEqual(auSol(0.37, 1234));
    expect(enHaut(0.37, 1234)).toEqual(enHaut(0.37, 1234));
    // et l'horloge fait bien bouger quelque chose, sinon l'essai est vide
    expect(enHaut(0.37, 1234)).not.toEqual(enHaut(0.37, 1600));
  });

  it("garde des opacités et des tailles utilisables", () => {
    for (let a = 0.05; a < 1; a += 0.07) {
      for (const p of [...auSol(a, a * 700), ...enHaut(a, a * 700)]) {
        expect(p.opacite).toBeGreaterThanOrEqual(0);
        expect(p.opacite).toBeLessThanOrEqual(1);
        expect(p.largeurM).toBeGreaterThan(0);
        expect(p.hauteurM).toBeGreaterThan(0);
        expect(p.hM).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
      }
    }
  });

  it("MONTE : une bouffée haute est plus grosse et plus pâle qu'une bouffée basse", () => {
    // Un panache dont les bouffées gardent leur taille est une file de billes.
    const colonnes = new Map<number, ReturnType<typeof enHaut>>();
    for (const p of enHaut(0.5, 800).filter((q) => q.forme === "fumee")) {
      colonnes.set(p.cellule, [...(colonnes.get(p.cellule) ?? []), p]);
    }
    expect(colonnes.size).toBeGreaterThan(1);
    for (const bouffees of colonnes.values()) {
      const triees = [...bouffees].sort((a, b) => a.hM - b.hM);
      const bas = triees[0];
      const haut = triees.at(-1);
      if (!bas || !haut) continue;
      expect(haut.largeurM).toBeGreaterThan(bas.largeurM);
      // pâle au sens de la teinte : la suie s'éclaircit en se diluant
      expect(haut.teinte.r).toBeGreaterThan(bas.teinte.r);
    }
  });

  it("PENCHE toutes ses colonnes du MÊME côté, et pas en éventail", () => {
    // La correction que la capture a imposée : le premier jet faisait pencher
    // chaque colonne à l'opposé de l'origine, donc la gerbe s'ouvrait en
    // éventail — un vent qui souffle vers l'extérieur dans toutes les
    // directions à la fois. Un vent est uniforme sur un hectare.
    const bouffees = enHaut(0.6, 400).filter((p) => p.forme === "fumee");
    const colonnes = new Map<number, typeof bouffees>();
    for (const p of bouffees) colonnes.set(p.cellule, [...(colonnes.get(p.cellule) ?? []), p]);
    expect(colonnes.size).toBeGreaterThan(2);
    const sens: { dx: number; dy: number }[] = [];
    for (const c of colonnes.values()) {
      const triees = [...c].sort((a, b) => a.hM - b.hM);
      const bas = triees[0];
      const haut = triees.at(-1);
      if (!bas || !haut) continue;
      const dx = haut.x - bas.x;
      const dy = haut.y - bas.y;
      const d = Math.hypot(dx, dy);
      if (d > 1) sens.push({ dx: dx / d, dy: dy / d });
    }
    expect(sens.length).toBeGreaterThan(2);
    // Toutes les colonnes pointent dans le même quart de tour : le produit
    // scalaire de chacune avec la première reste franchement positif.
    const premier = sens[0];
    if (!premier) throw new Error("aucune colonne inclinée");
    for (const v of sens) expect(v.dx * premier.dx + v.dy * premier.dy).toBeGreaterThan(0.7);
  });

  it("penche dans le sens du VENT, et le moteur le dit maintenant", () => {
    // Ce que ça change à l'image : un front qui descend le vent et un front qui
    // le REMONTE se dessinaient pareil, puisque la seule direction disponible
    // était celle de l'avance du front. Maintenant, non.
    for (const versRad of [0, 1.2, Math.PI, -2]) {
      const dx = Math.cos(versRad);
      const dy = Math.sin(versRad);
      for (const p of panacheDuFeu(front, 0.6, 400, COTE_P, { versRad, force: 0.8 })) {
        if (p.forme !== "fumee" || p.hM < 15) continue;
        const ex = p.x - ((p.cellule % COTE_P) + 0.5);
        const ey = p.y - (Math.floor(p.cellule / COTE_P) + 0.5);
        // La composante le long du vent est positive : la bouffée haute est en
        // AVAL de son pied, quel que soit le sens où le feu court.
        expect(ex * dx + ey * dy).toBeGreaterThan(0);
      }
    }
  });

  it("penche PLUS quand le vent est fort", () => {
    // L'amplitude vient de la force du vent de la semaine, qui vient elle-même
    // de la rose de la station et du régime de la semaine (`engine/vent.ts`).
    const derive = (force: number) => {
      const bouffees = enHaut(0.6, 400, force).filter((p) => p.forme === "fumee");
      let somme = 0;
      for (const p of bouffees) {
        somme += Math.hypot(
          p.x - ((p.cellule % COTE_P) + 0.5),
          p.y - (Math.floor(p.cellule / COTE_P) + 0.5),
        );
      }
      return somme / Math.max(1, bouffees.length);
    };
    expect(derive(1)).toBeGreaterThan(derive(0.2) * 1.5);
  });

  it("SUIT le front : la fumée s'éloigne de l'origine à mesure que le feu court", () => {
    // C'est la même pédagogie que le front lui-même : on voit OÙ le feu est,
    // et pas seulement qu'il y en a un.
    const o = { x: (front.origine % COTE_P) + 0.5, y: Math.floor(front.origine / COTE_P) + 0.5 };
    const rayonDesPieds = (a: number) => {
      const pieds = new Set(enHaut(a, 300).map((p) => p.cellule));
      let somme = 0;
      for (const c of pieds) {
        somme += Math.hypot((c % COTE_P) + 0.5 - o.x, Math.floor(c / COTE_P) + 0.5 - o.y);
      }
      return somme / Math.max(1, pieds.size);
    };
    expect(rayonDesPieds(0.7)).toBeGreaterThan(rayonDesPieds(0.2));
  });

  it("borne la hauteur d'une flamme au lieu de la laisser filer", () => {
    for (let a = 0.05; a < 1; a += 0.05) {
      for (const p of auSol(a, a * 900)) {
        if (p.forme !== "flamme") continue;
        expect(p.hauteurM).toBeGreaterThanOrEqual(FLAMME_LA_PLUS_BASSE_M * 0.999);
        expect(p.hauteurM).toBeLessThanOrEqual(HAUTEUR_DE_FLAMME_M * 1.31);
      }
    }
  });

  it("fait la FLAMME PLUS HAUTE là où le combustible est plus lourd", () => {
    // **C'est la pédagogie du §6.4 portée par la flamme elle-même** et plus
    // seulement par la vitesse du front : « s'essouffle dans le feuillu frais,
    // fonce dans la lande ». Le moteur donne la charge de chaque cellule brûlée
    // (`IncendieResult.charges`) ; jusque-là le rendu dessinait toutes ses
    // flammes à la même hauteur de convention.
    const n = front.brulees.length;
    const chargeUniforme = (c: number) => ({
      brulees: front.brulees,
      rangs: front.rangs,
      charges: new Array<number>(n).fill(c),
    });
    const mediane = (charge: number) => {
      const h = feuAuSol(chargeUniforme(charge), 0.4, 500, COTE_P)
        .filter((p) => p.forme === "flamme")
        .map((p) => p.hauteurM)
        .sort((a, b) => a - b);
      return h[Math.floor(h.length / 2)] ?? 0;
    };
    // un sous-bois frais, une pelouse ordinaire, une lande d'ajoncs
    const frais = mediane(0.2);
    const pelouse = mediane(CHARGE_DE_REFERENCE);
    const ajonc = mediane(2);
    expect(frais).toBeLessThan(pelouse);
    expect(pelouse).toBeLessThan(ajonc);
    // et l'écart se VOIT : plus du double du frais à l'ajonc
    expect(ajonc).toBeGreaterThan(frais * 2);
  });

  it("ne fait pas des flammes DIX fois plus hautes pour dix fois la charge", () => {
    // La longueur de flamme croît comme une puissance de l'intensité nettement
    // inférieure à un (Byram) : la racine en est l'approximation habituelle, et
    // elle a la bonne propriété de dessin — un pré ras garde une flamme visible
    // au lieu de disparaître, un tas de rémanents ne fait pas un mur.
    expect(partDeLaCharge(CHARGE_DE_REFERENCE)).toBeCloseTo(1, 6);
    expect(partDeLaCharge(CHARGE_DE_REFERENCE * 4)).toBeCloseTo(2, 6);
    expect(partDeLaCharge(0)).toBe(0);
    expect(partDeLaCharge(1e6)).toBe(FLAMME_LA_PLUS_HAUTE);
  });

  it("retombe sur la hauteur de convention quand la scène ne porte pas de charge", () => {
    // Les scènes cuites avant que le moteur n'expose les charges n'en ont pas,
    // et une flamme de hauteur moyenne vaut mieux qu'un plantage.
    const sans = feuAuSol({ brulees: front.brulees, rangs: front.rangs }, 0.4, 500, COTE_P);
    for (const c of cellulesEnFlammes({ brulees: front.brulees, rangs: front.rangs }, 0.4)) {
      expect(c.charge).toBe(CHARGE_DE_REFERENCE);
    }
    expect(sans.length).toBeGreaterThan(0);
  });

  it("porte un CŒUR clair par flamme : c'est le dégradé de température", () => {
    const sol = auSol(0.4, 200);
    const flammes = sol.filter((p) => p.forme === "flamme");
    const coeurs = sol.filter((p) => p.forme === "coeur");
    expect(flammes.length).toBeGreaterThan(0);
    expect(coeurs.length).toBe(flammes.length);
    const clarte = (t: { r: number; g: number; b: number }) => (t.r + t.g + t.b) / 3;
    expect(clarte(COEUR)).toBeGreaterThan(clarte(FLAMME));
    // et le cœur est plus petit que sa flamme, sinon il la remplace
    for (const c of coeurs) expect(c.hauteurM).toBeLessThan(HAUTEUR_DE_FLAMME_M);
  });

  it("pose la LUEUR au sol, aplatie de moitié, et une seule par maille", () => {
    const lueurs = auSol(0.3, 100).filter((p) => p.forme === "lueur");
    expect(lueurs.length).toBeGreaterThan(0);
    for (const l of lueurs) {
      expect(l.hM).toBe(0);
      expect(l.largeurM).toBeCloseTo(l.hauteurM * 2, 6);
    }
    // Une lueur par maille de sept mètres : sur un front, elles sont donc
    // beaucoup moins nombreuses que les cellules en flammes.
    expect(lueurs.length).toBeLessThan(cellulesEnFlammes(front, 0.3).length);
  });

  it("monte DROIT quand il n'y a pas de vent", () => {
    // Force nulle : la colonne est droite, et c'est la lecture honnête d'un
    // jour calme comme d'un instantané qui n'en porte pas (`SANS_VENT`).
    const droite = panacheDuFeu(front, 0.4, 300, COTE_P, SANS_VENT);
    expect(droite.length).toBeGreaterThan(0);
    for (const p of droite) {
      const ex = p.x - ((p.cellule % COTE_P) + 0.5);
      const ey = p.y - (Math.floor(p.cellule / COTE_P) + 0.5);
      // seuls le serpentement et le zigzag des braises écartent la colonne
      expect(Math.hypot(ex, ey)).toBeLessThan(2);
    }
  });

  it("accepte un incendie vide sans se plaindre", () => {
    expect(feuAuSol({ brulees: [], rangs: [] }, 0.5, 0, COTE_P)).toEqual([]);
    expect(panacheDuFeu({ brulees: [], rangs: [] }, 0.5, 0, COTE_P, SANS_VENT)).toEqual([]);
    expect(cellulesEnFlammes({ brulees: [], rangs: [] }, 0.5)).toEqual([]);
  });
});
