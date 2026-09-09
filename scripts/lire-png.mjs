/**
 * Lit un PNG et rend un accès aux pixels — pour MESURER une capture au lieu de
 * la juger à l'œil.
 *
 * **Ce fichier existe parce que juger à l'œil m'a fait me tromper trois fois de
 * suite** sur le hors-parcelle : une explication convaincante n'a pas survécu à
 * la mesure, trois fois. Un liseré de deux pixels, un damier, une bande pâle :
 * ce sont des questions à réponse numérique, et le navigateur ne rend pas ses
 * pixels une fois l'image présentée (le tampon est effacé). Un décodeur PNG de
 * trente lignes règle ça pour de bon.
 *
 * Ne gère que ce que Playwright produit : 8 bits par canal, couleur RVB ou
 * RVBA, non entrelacé. Tout le reste jette.
 */

import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

/**
 * @param {string} chemin
 * @returns {{largeur: number, hauteur: number, pixel: (x: number, y: number) => [number, number, number, number]}}
 */
export function lirePng(chemin) {
  const brut = readFileSync(chemin);
  if (brut.readUInt32BE(0) !== 0x89504e47) throw new Error("pas un PNG");
  let i = 8;
  let largeur = 0;
  let hauteur = 0;
  let canaux = 0;
  const morceaux = [];
  while (i < brut.length) {
    const taille = brut.readUInt32BE(i);
    const type = brut.toString("ascii", i + 4, i + 8);
    const donnees = brut.subarray(i + 8, i + 8 + taille);
    if (type === "IHDR") {
      largeur = donnees.readUInt32BE(0);
      hauteur = donnees.readUInt32BE(4);
      const profondeur = donnees[8];
      const couleur = donnees[9];
      const entrelace = donnees[12];
      if (profondeur !== 8) throw new Error(`profondeur ${profondeur} non gérée`);
      if (entrelace !== 0) throw new Error("entrelacé non géré");
      if (couleur === 2) canaux = 3;
      else if (couleur === 6) canaux = 4;
      else throw new Error(`type de couleur ${couleur} non géré`);
    } else if (type === "IDAT") {
      morceaux.push(donnees);
    } else if (type === "IEND") {
      break;
    }
    i += 12 + taille;
  }
  const flux = inflateSync(Buffer.concat(morceaux));
  const parLigne = largeur * canaux;
  const pixels = Buffer.alloc(hauteur * parLigne);
  // Défiltrage : chaque ligne PNG porte son propre filtre, et le défaire
  // demande la ligne précédente déjà défiltrée.
  for (let y = 0; y < hauteur; y++) {
    const filtre = flux[y * (parLigne + 1)];
    const source = flux.subarray(y * (parLigne + 1) + 1, (y + 1) * (parLigne + 1));
    const ligne = pixels.subarray(y * parLigne, (y + 1) * parLigne);
    const dessus = y > 0 ? pixels.subarray((y - 1) * parLigne, y * parLigne) : null;
    for (let x = 0; x < parLigne; x++) {
      const a = x >= canaux ? (ligne[x - canaux] ?? 0) : 0;
      const b = dessus ? (dessus[x] ?? 0) : 0;
      const c = dessus && x >= canaux ? (dessus[x - canaux] ?? 0) : 0;
      const brut2 = source[x] ?? 0;
      let v;
      if (filtre === 0) v = brut2;
      else if (filtre === 1) v = brut2 + a;
      else if (filtre === 2) v = brut2 + b;
      else if (filtre === 3) v = brut2 + ((a + b) >> 1);
      else if (filtre === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v = brut2 + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      } else throw new Error(`filtre ${filtre} inconnu`);
      ligne[x] = v & 0xff;
    }
  }
  return {
    largeur,
    hauteur,
    pixel: (x, y) => {
      const o = y * parLigne + x * canaux;
      return [
        pixels[o] ?? 0,
        pixels[o + 1] ?? 0,
        pixels[o + 2] ?? 0,
        canaux === 4 ? (pixels[o + 3] ?? 255) : 255,
      ];
    },
  };
}

/** Clarté perçue d'un pixel, pour comparer deux teintes sans les nommer. */
export function clarte([r, g, b]) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}
