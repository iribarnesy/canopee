import { describe, expect, it } from "vitest";
import {
  altitudeDecor,
  altitudeMoyenneParcelle,
  attenuation,
  BRUME,
  BRUME_MAX,
  CANOPEE_LA_PLUS_BASSE_M,
  type CoteDecor,
  canopee,
  couleurDecor,
  couleurMasse,
  couvertureDuDecor,
  type DecorBordures,
  distanceAuBord,
  LEVEE_LA_PLUS_HAUTE_M,
  MAILLE_MASSE_M,
  masseDeLaCase,
  massesDuDecor,
  PALIER_NET_M,
  PORTEE_BRUME_M,
  penteMoyenne,
  poidsDesCotes,
  teinteDuCote,
} from "../../src/render/couches/decor";

const COTE = 100;
const foret: CoteDecor = { boise: 0.9, cultive: 0.05, urbain: 0 };
const plaine: CoteDecor = { boise: 0.03, cultive: 0.95, urbain: 0.02 };
const ville: CoteDecor = { boise: 0.2, cultive: 0.15, urbain: 0.65 };

const bordures: DecorBordures = { nord: foret, est: plaine, sud: plaine, ouest: ville };

describe("la distance au bord", () => {
  it("est nulle dans la parcelle", () => {
    expect(distanceAuBord(50, 50, COTE)).toBe(0);
    expect(distanceAuBord(0, 0, COTE)).toBe(0);
    expect(distanceAuBord(COTE, COTE, COTE)).toBe(0);
  });

  it("croît en s'éloignant, et compte les deux axes dans un coin", () => {
    expect(distanceAuBord(50, -10, COTE)).toBeCloseTo(10);
    expect(distanceAuBord(COTE + 10, 50, COTE)).toBeCloseTo(10);
    expect(distanceAuBord(-3, -4, COTE)).toBeCloseTo(5);
  });
});

describe("la brume", () => {
  it("ne mange rien au bord, et jamais tout au loin", () => {
    expect(attenuation(0)).toBe(0);
    // **Elle plafonne**, et c'est le point : une brume qui va jusqu'au bout
    // rend le lointain identique au ciel, donc la parcelle se remet à flotter
    // au milieu d'un vide. Le lointain doit rester du sol.
    expect(attenuation(PORTEE_BRUME_M)).toBeCloseTo(BRUME_MAX);
    expect(attenuation(1000)).toBeCloseTo(BRUME_MAX);
    expect(BRUME_MAX).toBeLessThan(1);
  });

  it("épargne la ceinture proche, qui doit se lire comme de la terre", () => {
    // Le premier jet prenait une racine, pour que la brume morde tout de
    // suite : le décor était alors gris dès le premier mètre, et comme le ciel
    // est de cette même brume, la parcelle flottait dans une purée sans
    // horizon. La discrétion se joue sur la saturation, pas ici.
    expect(attenuation(PALIER_NET_M)).toBe(0);
    expect(attenuation(PALIER_NET_M + 1)).toBeGreaterThan(0);
  });

  it("est monotone", () => {
    let precedent = -1;
    for (let d = 0; d <= 80; d += 4) {
      const a = attenuation(d);
      expect(a).toBeGreaterThanOrEqual(precedent);
      precedent = a;
    }
  });
});

describe("la couleur d'un côté vient de ses trois parts", () => {
  it("un côté boisé est plus sombre et plus vert qu'un côté cultivé", () => {
    const bois = teinteDuCote(foret);
    const champ = teinteDuCote(plaine);
    expect(bois.r + bois.g + bois.b).toBeLessThan(champ.r + champ.g + champ.b);
    expect(bois.g - bois.r).toBeGreaterThan(champ.g - champ.r);
  });

  it("un côté urbanisé est le plus neutre des trois", () => {
    const gris = teinteDuCote(ville);
    const ecart = (t: { r: number; g: number; b: number }) =>
      Math.max(t.r, t.g, t.b) - Math.min(t.r, t.g, t.b);
    expect(ecart(gris)).toBeLessThan(ecart(teinteDuCote(foret)));
  });
});

describe("les poids des côtés", () => {
  it("un point plein nord ne doit qu'au nord", () => {
    const w = poidsDesCotes(50, COTE + 20, COTE);
    expect(w.nord).toBeCloseTo(1);
    expect(w.est + w.sud + w.ouest).toBeCloseTo(0);
  });

  it("un coin mélange ses deux côtés, jamais l'opposé", () => {
    const w = poidsDesCotes(COTE + 10, COTE + 10, COTE);
    expect(w.nord).toBeCloseTo(0.5);
    expect(w.est).toBeCloseTo(0.5);
    expect(w.sud).toBe(0);
    expect(w.ouest).toBe(0);
  });

  it("somment toujours à un", () => {
    for (const [x, y] of [
      [-30, 50],
      [130, -20],
      [50, 150],
      [-5, -5],
    ]) {
      const w = poidsDesCotes(x as number, y as number, COTE);
      expect(w.nord + w.est + w.sud + w.ouest).toBeCloseTo(1);
    }
  });
});

describe("la couleur du décor n'attire pas l'œil", () => {
  it("va vers la brume au loin, sans jamais y arriver", () => {
    const proche = couleurDecor(bordures, 50, COTE + 1, COTE);
    const loin = couleurDecor(bordures, 50, COTE + PORTEE_BRUME_M, COTE);
    const ecart = (a: { r: number; g: number; b: number }, b: typeof a) =>
      Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
    expect(ecart(loin, BRUME)).toBeLessThan(ecart(proche, BRUME));
    expect(ecart(loin, BRUME)).toBeGreaterThan(20);
  });

  it("est moins saturée que la matière dont elle sort", () => {
    const saturation = (t: { r: number; g: number; b: number }) =>
      Math.max(t.r, t.g, t.b) - Math.min(t.r, t.g, t.b);
    const brut = teinteDuCote(foret);
    const rendu = couleurDecor({ ...bordures, nord: foret }, 50, COTE + 1, COTE);
    expect(saturation(rendu)).toBeLessThan(saturation(brut));
  });

  it("suit bien le côté sous lequel on se trouve", () => {
    const auNord = couleurDecor(bordures, 50, COTE + 2, COTE);
    const aLOuest = couleurDecor(bordures, -2, 50, COTE);
    // Forêt au nord, ville à l'ouest : le nord est plus vert.
    expect(auNord.g - auNord.r).toBeGreaterThan(aLOuest.g - aLOuest.r);
  });
});

describe("les masses du décor", () => {
  it("ne sèment jamais dans la parcelle", () => {
    const dedans = massesDuDecor(bordures, COTE, 10, 10, 80, 80);
    expect(dedans).toHaveLength(0);
  });

  it("sont déterministes : deux appels donnent exactement les mêmes", () => {
    const a = massesDuDecor(bordures, COTE, -40, -40, 140, 140);
    const b = massesDuDecor(bordures, COTE, -40, -40, 140, 140);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it("une case rend au plus une masse, et son pied reste dans la case", () => {
    for (let j = -4; j < 20; j++) {
      const m = masseDeLaCase(bordures, -2, j, COTE);
      if (!m) continue;
      expect(m.x).toBeGreaterThanOrEqual(-2 * MAILLE_MASSE_M);
      expect(m.x).toBeLessThan(-1 * MAILLE_MASSE_M);
    }
  });

  it("sont rendues dans l'ordre du peintre", () => {
    const liste = massesDuDecor(bordures, COTE, -40, -40, 140, 140);
    for (let i = 1; i < liste.length; i++) {
      const avant = liste[i - 1];
      const apres = liste[i];
      if (!avant || !apres) continue;
      expect(avant.x + avant.y).toBeLessThanOrEqual(apres.x + apres.y);
    }
  });
});

describe("la couleur d'une masse est écrasée sur son fond", () => {
  it("s'écarte moins du fond que la matière pure", () => {
    const fond = couleurDecor(bordures, 50, COTE + 5, COTE);
    const masse = couleurMasse("bois", fond, 5);
    const ecart = (a: { r: number; g: number; b: number }, b: typeof a) =>
      Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
    expect(ecart(masse, fond)).toBeLessThan(ecart({ r: 74, g: 88, b: 66 }, fond));
  });

  it("s'efface avec la distance : le lointain n'a plus de détail", () => {
    const contraste = (d: number): number => {
      const fond = couleurDecor(bordures, 50, COTE + d, COTE);
      const masse = couleurMasse("bois", fond, d);
      return Math.hypot(masse.r - fond.r, masse.g - fond.g, masse.b - fond.b);
    };
    expect(contraste(PORTEE_BRUME_M)).toBeLessThan(contraste(2) / 2);
  });
});

describe("l'altitude du décor", () => {
  const coteM = 8;
  // Un plan incliné : z croît de 0,1 m par mètre vers le nord.
  const altitudes = Array.from({ length: coteM * coteM }, (_, i) => Math.floor(i / coteM) * 0.1);

  it("prolonge exactement la lisière, sans marche — même sur un versant", () => {
    // Le lissage ne joue QUE le long du bord : en travers, la valeur au
    // contact est celle de la cellule du bord, au centimètre près. Une moyenne
    // dans les deux sens ouvrirait une marche de neuf centimètres tout autour
    // de la parcelle, ce qui est le défaut qu'on corrige.
    const moyenne = altitudeMoyenneParcelle(altitudes, coteM);
    const dedans = altitudes[(coteM - 1) * coteM + 3] ?? 0;
    const dehors = altitudeDecor(altitudes, coteM, moyenne, 3.5, coteM + 0.001);
    expect(dehors).toBeCloseTo(dedans, 3);
  });

  it("lisse pourtant le bruit LATÉRAL de la lisière", () => {
    // Un bord en dents de scie : la nappe du décor doit en sortir régulière,
    // sinon elle se lit en terrasses.
    const dents = Array.from({ length: coteM * coteM }, (_, i) => (i % 2 === 0 ? 0 : 1));
    const moyenne = altitudeMoyenneParcelle(dents, coteM);
    const a = altitudeDecor(dents, coteM, moyenne, 2.5, coteM + 0.001);
    const b = altitudeDecor(dents, coteM, moyenne, 3.5, coteM + 0.001);
    expect(Math.abs(a - b)).toBeLessThan(0.2);
  });

  it("PROLONGE la pente au loin, plutôt que de retomber sur une plaine", () => {
    // Le premier jet retombait vers la moyenne, en se disant qu'on ne sait rien
    // du lointain. Sur un versant, ça creuse une cuvette concentrique en
    // terrasses tout autour de la parcelle : « ne rien prétendre » n'existe pas,
    // poser une plaine autour d'un versant est une affirmation, et elle est
    // fausse.
    const moyenne = altitudeMoyenneParcelle(altitudes, coteM);
    const bord = altitudeDecor(altitudes, coteM, moyenne, 3.5, coteM + 0.001);
    const loin = altitudeDecor(altitudes, coteM, moyenne, 3.5, coteM + 20);
    expect(loin - bord).toBeCloseTo(0.1 * 20, 1);
  });

  it("la pente moyenne est bien celle du plan", () => {
    const [dzdx, dzdy] = penteMoyenne(altitudes, coteM);
    expect(dzdx).toBeCloseTo(0, 6);
    expect(dzdy).toBeCloseTo(0.1, 6);
  });

  it("la moyenne est bien celle de la parcelle", () => {
    expect(altitudeMoyenneParcelle(altitudes, coteM)).toBeCloseTo(0.35, 2);
  });
});

/**
 * La canopée du hors-parcelle.
 *
 * **Ces essais gardent des propriétés qui ont CHANGÉ DE PORTEUR.** Elles
 * étaient vérifiées sur les masses boisées — plus nombreuses du côté boisé, se
 * raréfiant avec la distance, groupées et non éparpillées. Les bois ne sont
 * plus des masses dénombrables mais une surface (voir `canopee`), et les trois
 * propriétés restent vraies et valent d'être tenues : c'est le même paysage,
 * dessiné autrement.
 */
describe("la canopée du décor", () => {
  const cote = (b: number, especes?: { especeId: string; poids: number }[]): CoteDecor => ({
    boise: b,
    cultive: 1 - b,
    urbain: 0,
    ...(especes ? { especes } : {}),
  });
  const partout = (c: CoteDecor): DecorBordures => ({ nord: c, est: c, sud: c, ouest: c });

  it("ne pousse pas dans la parcelle", () => {
    expect(canopee(partout(cote(0.9)), 50, 50, COTE).couverture).toBe(0);
    expect(canopee(partout(cote(0.9)), 50, 50, COTE).hauteurM).toBe(0);
  });

  it("couvre davantage du côté boisé que du côté cultivé", () => {
    const cotesForet: DecorBordures = { nord: foret, est: foret, sud: plaine, ouest: plaine };
    const moyenne = (y0: number, y1: number) => {
      let somme = 0;
      let n = 0;
      for (let y = y0; y < y1; y += 3) {
        for (let x = 0; x < COTE; x += 3) {
          somme += canopee(cotesForet, x, y, COTE).couverture;
          n++;
        }
      }
      return somme / n;
    };
    expect(moyenne(COTE + 2, COTE + 40)).toBeGreaterThan(moyenne(-40, -2));
  });

  it("se raréfie avec la distance, puisque la brume la mangerait", () => {
    const b = partout(cote(0.4));
    const bande = (d: number) => {
      let somme = 0;
      let n = 0;
      for (let y = COTE + d; y < COTE + d + 30; y += 2) {
        for (let x = 0; x < COTE; x += 2) {
          somme += canopee(b, x, y, COTE).couverture;
          n++;
        }
      }
      return somme / n;
    };
    expect(bande(70)).toBeLessThan(bande(10));
    expect(bande(100)).toBeLessThan(bande(70));
  });

  it("se GROUPE au lieu de s'éparpiller : des bois et des clairières", () => {
    // Le grumeau module la couverture localement : la variance de la couverture
    // moyenne par bloc doit dépasser largement celle qu'aurait un champ
    // uniforme, sinon il n'y a ni bois ni clairière mais une purée homogène.
    const b = partout(cote(0.4));
    const blocs: number[] = [];
    for (let bx = 0; bx < 8; bx++) {
      for (let by = 0; by < 8; by++) {
        let somme = 0;
        let n = 0;
        for (let y = 0; y < 20; y += 4) {
          for (let x = 0; x < 20; x += 4) {
            somme += couvertureDuDecor(
              b,
              COTE + 10 + bx * 20 + x,
              COTE + 10 + by * 20 + y,
              COTE,
            ).boise;
            n++;
          }
        }
        blocs.push(somme / n);
      }
    }
    const moyenne = blocs.reduce((p, q) => p + q, 0) / blocs.length;
    const variance = blocs.reduce((p, q) => p + (q - moyenne) ** 2, 0) / blocs.length;
    expect(variance).toBeGreaterThan(0.002);
  });

  it("prend l'essence que le PAYSAGE déclare, et pas une autre", () => {
    // La règle n° 1 : le rendu n'invente rien. Un paysage de lande porte des
    // pins et des bouleaux ; la canopée ne doit pas y planter de hêtre.
    const lande = [
      { especeId: "pinus_sylvestris", poids: 4 },
      { especeId: "betula_pendula", poids: 3 },
    ];
    const b = partout(cote(0.9, lande));
    const vues = new Set<string>();
    for (let y = COTE + 2; y < COTE + 80; y += 3) {
      for (let x = 0; x < COTE; x += 3) {
        const e = canopee(b, x, y, COTE).especeId;
        if (e) vues.add(e);
      }
    }
    expect(vues.size).toBeGreaterThan(1);
    for (const e of vues) expect(lande.map((l) => l.especeId)).toContain(e);
  });

  it("ne déclare AUCUNE essence quand le paysage n'en donne pas", () => {
    // Mieux vaut un bois anonyme qu'une essence tirée au sort : le décor dirait
    // alors quelque chose que le moteur ne dit pas.
    const b = partout(cote(0.9));
    for (let y = COTE + 2; y < COTE + 40; y += 5) {
      expect(canopee(b, 50, y, COTE).especeId).toBeUndefined();
    }
  });

  it("monte plus haut sous une essence haute que sous une basse", () => {
    // La hauteur vient de `hauteurMaxM` du moteur : un massif de hêtres et une
    // haie d'épine noire ne peuvent pas se dessiner pareil.
    const haut = partout(cote(0.9, [{ especeId: "fagus_sylvatica", poids: 1 }]));
    const bas = partout(cote(0.9, [{ especeId: "prunus_spinosa", poids: 1 }]));
    const moyenne = (b: DecorBordures) => {
      let somme = 0;
      let n = 0;
      for (let y = COTE + 2; y < COTE + 40; y += 2) {
        for (let x = 0; x < COTE; x += 2) {
          somme += canopee(b, x, y, COTE).hauteurM;
          n++;
        }
      }
      return somme / n;
    };
    expect(moyenne(haut)).toBeGreaterThan(moyenne(bas) * 1.5);
  });

  it("ne dresse jamais un mur : la levée est plafonnée", () => {
    // Dessinée à sa hauteur vraie, une canopée de trente mètres présentait au
    // bord du bois une jupe d'un seul ton de cent dix pixels, et le décor
    // sortait en facettes de cristal.
    const b = partout(cote(1, [{ especeId: "fagus_sylvatica", poids: 1 }]));
    for (let y = COTE + 1; y < COTE + 60; y += 1) {
      for (let x = 0; x < COTE; x += 7) {
        // l'ondulation des cimes peut dépasser la levée de son amplitude
        expect(canopee(b, x, y, COTE).hauteurM).toBeLessThan(LEVEE_LA_PLUS_HAUTE_M * 1.2);
      }
    }
  });

  it("a une hauteur CONTINUE : pas de marche entre deux peuplements", () => {
    // Le premier jet tirait la maturité par peuplement, donc chaque maille de
    // vingt-six mètres avait son plateau d'altitude, et les quads à cheval
    // formaient des rampes : le décor sortait en facettes. Un pas de dix
    // centimètres ne doit pas faire sauter la canopée.
    const b = partout(cote(0.8, [{ especeId: "fagus_sylvatica", poids: 1 }]));
    let pire = 0;
    for (let y = COTE + 2; y < COTE + 50; y += 0.5) {
      const a = canopee(b, 40, y, COTE).hauteurM;
      const c = canopee(b, 40, y + 0.1, COTE).hauteurM;
      pire = Math.max(pire, Math.abs(c - a));
    }
    // Dix centimètres de déplacement, dix centimètres de canopée au plus.
    expect(pire).toBeLessThan(0.1);
  });

  it("s'annule à la lisière au lieu de s'arrêter net", () => {
    // Une lisière est une PENTE : la couverture module la hauteur, donc le bord
    // d'un bois descend au sol au lieu de se terminer par une falaise.
    const b = partout(cote(0.45, [{ especeId: "fagus_sylvatica", poids: 1 }]));
    // Sur une AIRE et non sur une ligne : une transversale unique peut tomber
    // entre deux bois, et l'essai mesurerait alors le hasard du tracé.
    const hauteurs: number[] = [];
    for (let y = COTE + 2; y < COTE + 60; y += 2) {
      for (let x = 0; x < COTE; x += 2) hauteurs.push(canopee(b, x, y, COTE).hauteurM);
    }
    // Il y a des bois francs ET des clairières — mais la clairière n'est pas
    // une hauteur NULLE : avec 45 % de boisé, le grumeau laisse partout au
    // moins quelques pourcents de couverture, donc un demi-mètre de canopée.
    // C'est le seuil de tracé qui fait les vraies clairières, et c'est à lui
    // qu'il faut comparer — j'avais d'abord attendu un zéro qui n'existe pas.
    expect(hauteurs.some((h) => h > LEVEE_LA_PLUS_HAUTE_M * 0.5)).toBe(true);
    expect(hauteurs.some((h) => h < CANOPEE_LA_PLUS_BASSE_M)).toBe(true);
    // ... et des valeurs intermédiaires entre les deux : la lisière.
    expect(
      hauteurs.some((h) => h > CANOPEE_LA_PLUS_BASSE_M && h < LEVEE_LA_PLUS_HAUTE_M * 0.5),
    ).toBe(true);
  });
});

describe("les masses du décor, après la canopée", () => {
  it("ne sème plus AUCUN bois : un bois est une surface", () => {
    const foretPartout: DecorBordures = { nord: foret, est: foret, sud: foret, ouest: foret };
    const masses = massesDuDecor(foretPartout, COTE, -60, -60, COTE + 60, COTE + 60);
    for (const m of masses) expect(m.masse).toBe("bati");
  });

  it("sème des bâtiments à proportion de la part urbaine", () => {
    const urbain: DecorBordures = { nord: ville, est: ville, sud: ville, ouest: ville };
    const rase: CoteDecor = { boise: 0.03, cultive: 0.97, urbain: 0 };
    const champs: DecorBordures = { nord: rase, est: rase, sud: rase, ouest: rase };
    const combien = (b: DecorBordures) =>
      massesDuDecor(b, COTE, 0, COTE + 2, COTE, COTE + 40).length;
    expect(combien(urbain)).toBeGreaterThan(combien(champs));
    expect(combien(champs)).toBe(0);
  });
});
