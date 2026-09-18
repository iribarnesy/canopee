/**
 * LE TAPIS PREND LA TEINTE ET LE SEUIL DE QUI LE TIENT.
 *
 * Le rendu lisait le seuil d'eau chez le dactyle pour toutes les cellules, et
 * n'avait qu'un vert pour toute la strate. C'était exact tant que le tapis
 * était « un dactyle qui s'ignorait » ; ça ne l'est plus depuis que le moteur
 * envoie l'emprise de chaque espèce.
 *
 * **Le mélange et non la dominante**, parce que l'identité de la dominante
 * bascule d'avril à juillet sur près de quarante pour cent des cellules alors
 * que le mélange, lui, ne bouge presque pas. Les essais ci-dessous vérifient
 * donc surtout des propriétés de mélange : qu'une cellule partagée ne soit ni
 * l'une ni l'autre, et qu'elle varie continûment entre les deux.
 */

import { describe, expect, it } from "vitest";
import { facteurEauHerbacee, HERBACEES } from "../../src/engine/herbacees";
import {
  couleurHerbe,
  type MelangeDuTapis,
  quantifier,
  satisfactionEnEau,
  signatureCellule,
} from "../../src/render/palette";

const DACTYLE = "dactylis_glomerata";
const MOLINIE = "molinia_caerulea";
const ANEMONE = "anemone_nemorosa";
const fiche = (id: string) => HERBACEES.find((h) => h.id === id);

const seul = (id: string): MelangeDuTapis => ({ ids: [id], parts: [1] });
const moitie = (a: string, b: string): MelangeDuTapis => ({ ids: [a, b], parts: [0.5, 0.5] });

/** ÉTÉ : phase où la teinte d'espèce porte, plutôt que le gris d'hiver. */
const SEMAINE_ETE = 26;

describe("le seuil d'eau suit les espèces présentes", () => {
  it("une cellule de dactyle pur rend exactement ce que le moteur rend pour lui", () => {
    const d = fiche(DACTYLE);
    if (!d) throw new Error("fiche manquante");
    for (const h of [0.1, 0.2, 0.3, 0.4, 0.6]) {
      expect(satisfactionEnEau(h, seul(DACTYLE))).toBeCloseTo(facteurEauHerbacee(d, h), 10);
    }
  });

  it("sans mélange connu, on retombe sur l'espèce de référence — le comportement d'avant", () => {
    for (const h of [0.15, 0.35, 0.8]) {
      expect(satisfactionEnEau(h)).toBeCloseTo(satisfactionEnEau(h, seul(DACTYLE)), 10);
    }
  });

  /**
   * **Le contournement était exact pour la molinie, et c'est ce que la mesure
   * a montré** : les deux courbes sont identiques, écart nul. L'issue citait
   * pourtant la lande à molinie comme le cas faux. Ce qui change vraiment,
   * c'est l'anémone.
   */
  it("dactyle et molinie : aucune différence, l'ancien contournement les servait bien", () => {
    for (const h of [0.1, 0.2, 0.3, 0.4, 0.5, 0.9]) {
      expect(satisfactionEnEau(h, seul(MOLINIE))).toBeCloseTo(satisfactionEnEau(h, seul(DACTYLE)), 10);
    }
  });

  it("l'anémone s'écarte, et seulement dans la bande sèche", () => {
    const ecart = (h: number) =>
      satisfactionEnEau(h, seul(DACTYLE)) - satisfactionEnEau(h, seul(ANEMONE));
    expect(ecart(0.3)).toBeGreaterThan(0.2);
    // Au-dessus du confort, tout sature : plus personne n'a soif, donc plus
    // d'écart à montrer.
    expect(ecart(0.6)).toBeCloseTo(0, 10);
    expect(ecart(0.9)).toBeCloseTo(0, 10);
  });

  it("moitié-moitié tombe entre les deux, et à mi-chemin", () => {
    const h = 0.3;
    const d = satisfactionEnEau(h, seul(DACTYLE));
    const a = satisfactionEnEau(h, seul(ANEMONE));
    expect(satisfactionEnEau(h, moitie(DACTYLE, ANEMONE))).toBeCloseTo((d + a) / 2, 10);
  });

  it("une espèce inconnue du rendu ne casse rien : on lit ce qu'on connaît", () => {
    const m: MelangeDuTapis = { ids: ["herbe_de_demain", DACTYLE], parts: [0.5, 0.5] };
    expect(satisfactionEnEau(0.3, m)).toBeCloseTo(satisfactionEnEau(0.3, seul(DACTYLE)), 10);
  });

  it("une cellule sans herbe retombe sur la référence plutôt que sur rien", () => {
    const vide: MelangeDuTapis = { ids: [DACTYLE, ANEMONE], parts: [0, 0] };
    expect(satisfactionEnEau(0.3, vide)).toBeCloseTo(satisfactionEnEau(0.3), 10);
  });
});

describe("la teinte suit les espèces présentes", () => {
  const vert = (m?: MelangeDuTapis) => couleurHerbe(SEMAINE_ETE, 0, 1, m);

  it("trois espèces pures donnent trois verts distincts", () => {
    const d = vert(seul(DACTYLE));
    const m = vert(seul(MOLINIE));
    const a = vert(seul(ANEMONE));
    const memeCouleur = (x: typeof d, y: typeof d) =>
      Math.abs(x.r - y.r) + Math.abs(x.g - y.g) + Math.abs(x.b - y.b) < 3;
    expect(memeCouleur(d, m)).toBe(false);
    expect(memeCouleur(d, a)).toBe(false);
    expect(memeCouleur(m, a)).toBe(false);
  });

  it("la molinie tire au bleu, l'anémone au clair — leurs noms le disent", () => {
    const d = vert(seul(DACTYLE));
    const m = vert(seul(MOLINIE));
    const a = vert(seul(ANEMONE));
    // *Molinia caerulea* : plus de bleu que le dactyle.
    expect(m.b).toBeGreaterThan(d.b);
    // Feuillage de sous-bois printanier : plus clair que la graminée de pré.
    expect(a.r + a.g + a.b).toBeGreaterThan(d.r + d.g + d.b);
  });

  it("moitié-moitié est entre les deux, sur les trois canaux", () => {
    const d = vert(seul(DACTYLE));
    const a = vert(seul(ANEMONE));
    const mi = vert(moitie(DACTYLE, ANEMONE));
    for (const canal of ["r", "g", "b"] as const) {
      const bas = Math.min(d[canal], a[canal]);
      const haut = Math.max(d[canal], a[canal]);
      expect(mi[canal]).toBeGreaterThanOrEqual(bas - 1e-9);
      expect(mi[canal]).toBeLessThanOrEqual(haut + 1e-9);
    }
  });

  it("sans mélange connu, la teinte ne bouge pas de ce qu'elle était", () => {
    expect(vert()).toEqual(vert(seul(DACTYLE)));
  });
});

describe("la signature d'une cellule voit tout ce qui la colore", () => {
  const base = { humidite: 0.5, herbe: 0.8, herbeBiomasse: 0.4, litiereCG: 0 };

  /**
   * **Deux grandeurs manquaient**, et `couleurSol` les lisait : la lumière et
   * la soif du tapis. Une cellule dont la seule chose à changer était l'ombre
   * portée ou le grillage de l'herbe gardait sa signature, donc son morceau
   * n'était pas recuit — le changement n'arrivait à l'écran que quand autre
   * chose bougeait.
   */
  it("la soif du tapis change la signature", () => {
    const sec = signatureCellule(quantifier({ ...base, herbeHumidite: 0.1 }));
    const humide = signatureCellule(quantifier({ ...base, herbeHumidite: 0.9 }));
    expect(sec).not.toBe(humide);
  });

  it("l'ombre portée change la signature", () => {
    const ombre = signatureCellule(quantifier({ ...base, lumiere: 0.1 }));
    const soleil = signatureCellule(quantifier({ ...base, lumiere: 1 }));
    expect(ombre).not.toBe(soleil);
  });

  /**
   * La signature d'une CELLULE ne porte que les parts : la liste d'espèces est
   * une propriété de la parcelle — l'instantané en envoie une seule, partagée
   * par toutes les cellules. Deux cellules d'une même parcelle se distinguent
   * donc par leurs parts, et c'est ce qui est vérifié ici ; la liste elle-même
   * entre dans la signature du MORCEAU.
   */
  it("changer de partage entre espèces change la signature", () => {
    const ids = [DACTYLE, ANEMONE];
    const a = signatureCellule(quantifier({ ...base, tapis: { ids, parts: [1, 0] } }));
    const b = signatureCellule(quantifier({ ...base, tapis: { ids, parts: [0, 1] } }));
    const mi = signatureCellule(quantifier({ ...base, tapis: { ids, parts: [0.5, 0.5] } }));
    expect(a).not.toBe(b);
    expect(mi).not.toBe(a);
    expect(mi).not.toBe(b);
  });

  it("mais un centième d'emprise ne la change pas : c'est le palier qui compte", () => {
    const a = signatureCellule(
      quantifier({ ...base, tapis: { ids: [DACTYLE], parts: [0.50] } }),
    );
    const b = signatureCellule(
      quantifier({ ...base, tapis: { ids: [DACTYLE], parts: [0.51] } }),
    );
    expect(a).toBe(b);
  });
});
