/**
 * **La chaîne entière** du tapis : de l'instantané à la couleur du sol.
 *
 * Les autres essais portent sur la palette seule. Celui-ci vérifie ce que la
 * palette seule ne peut pas dire : que les grilles d'emprise traversent
 * réellement `donneesSolDe` puis la signature du morceau, et qu'une parcelle
 * de molinie ne se peint **pas** comme une parcelle de dactyle.
 *
 * Il existe parce qu'une vérification au navigateur n'a rien montré — et la
 * mesure a tranché : sur la lande, le moteur donne bien 100 % de molinie et un
 * couvert plein, donc l'écart devait se voir. Une capture de jeu compare trop
 * de choses à la fois pour répondre à ça.
 */

import { describe, expect, it } from "vitest";
import { donneesSolDe } from "../../src/game/parcelle";
import { signatureMorceau } from "../../src/render/couches/terrain";
import { couleurSol, quantifier, type Teinte } from "../../src/render/palette";

const COTE = 8;
const N = COTE * COTE;
const IDS = ["anemone_nemorosa", "dactylis_glomerata", "molinia_caerulea"];

/** Une parcelle plate, bien arrosée, entièrement tenue par **une** espèce. */
function solTenuPar(rang: number) {
  const plein = new Uint8Array(N).fill(255);
  const vide = new Uint8Array(N);
  return donneesSolDe({
    coteM: COTE,
    ruMm: 100,
    altitudesM: new Array(N).fill(0),
    waterMm: new Float32Array(N).fill(60),
    herbe: new Float32Array(N).fill(1),
    herbeBiomasse: new Float32Array(N).fill(0.5),
    litiereCG: new Float32Array(N),
    herbeHumidite: new Float32Array(N).fill(0.8),
    herbeEmprises: [0, 1, 2].map((k) => (k === rang ? plein : vide)),
    herbesIds: IDS,
  });
}

const ecart = (a: Teinte, b: Teinte) =>
  Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);

/** La couleur du sol d'une cellule, par le chemin que le terrain emprunte. */
function couleurDe(donnees: ReturnType<typeof donneesSolDe>, semaine: number): Teinte {
  return couleurSol(
    quantifier({
      humidite: donnees.humidite[0] ?? 0,
      herbe: donnees.herbe[0] ?? 0,
      herbeBiomasse: donnees.herbeBiomasse[0] ?? 0,
      litiereCG: donnees.litiereCG[0] ?? 0,
      herbeHumidite: donnees.herbeHumidite?.[0] ?? 1,
      ...(donnees.herbesIds && donnees.herbeEmprises
        ? {
            tapis: {
              ids: donnees.herbesIds,
              parts: donnees.herbeEmprises.map((g) => (g[0] ?? 0) / 255),
            },
          }
        : {}),
    }),
    semaine,
  );
}

describe("les grilles d'emprise traversent la chaîne", () => {
  it("`donneesSolDe` les transporte", () => {
    const sol = solTenuPar(2);
    expect(sol.herbesIds).toEqual(IDS);
    expect(sol.herbeEmprises?.length).toBe(3);
    expect(sol.herbeEmprises?.[2]?.[0]).toBe(255);
  });

  it("une lande de molinie ne se peint pas comme un pré de dactyle", () => {
    const molinie = couleurDe(solTenuPar(2), 26);
    const dactyle = couleurDe(solTenuPar(1), 26);
    // Le seuil : plus qu'un arrondi de quantification, moins qu'un changement
    // de saison. Douze niveaux cumulés sur trois canaux se voient à l'écran.
    expect(ecart(molinie, dactyle)).toBeGreaterThan(12);
    // *Molinia caerulea* : c'est le bleu qui porte l'écart.
    expect(molinie.b).toBeGreaterThan(dactyle.b + 8);
  });

  it("et une anémonaie non plus", () => {
    const anemone = couleurDe(solTenuPar(0), 26);
    const dactyle = couleurDe(solTenuPar(1), 26);
    expect(ecart(anemone, dactyle)).toBeGreaterThan(12);
  });

  it("le morceau se recuit quand l'espèce qui le tient change", () => {
    const a = signatureMorceau(solTenuPar(2), 0, 0, 26);
    const b = signatureMorceau(solTenuPar(1), 0, 0, 26);
    expect(a).not.toBe(b);
  });

  it("sans grilles, rien ne change de ce qui existait", () => {
    const sansGrilles = donneesSolDe({
      coteM: COTE,
      ruMm: 100,
      altitudesM: new Array(N).fill(0),
      waterMm: new Float32Array(N).fill(60),
      herbe: new Float32Array(N).fill(1),
      herbeBiomasse: new Float32Array(N).fill(0.5),
      litiereCG: new Float32Array(N),
      herbeHumidite: new Float32Array(N).fill(0.8),
    });
    expect(couleurDe(sansGrilles, 26)).toEqual(couleurDe(solTenuPar(1), 26));
  });
});
