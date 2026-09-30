/**
 * Les fichiers de son, tels que Vite les sert (#129).
 *
 * Ils viennent de `scripts/sourcer-sons.py`, qui les tire de Wikimedia Commons
 * et en écrit la provenance et la licence dans `data/sons/PROVENANCE.md`.
 *
 * **Découverts, et non importés un par un** : un son absent du dossier ne
 * casse pas la construction, il se tait. C'est ce qui permet au jeu de tourner
 * — muet — tant que le sourcing n'a pas été fait, et à chaque son manquant de
 * manquer seul.
 */

import type { UrlsDesSons } from "./mixeur";

const trouves = import.meta.glob<string>("../../../data/sons/*.ogg", {
  query: "?url",
  import: "default",
  eager: true,
});

export const URLS_DES_SONS: UrlsDesSons = Object.fromEntries(
  Object.entries(trouves).map(([chemin, url]) => [
    chemin.replace(/^.*\//, "").replace(/\.ogg$/, ""),
    url,
  ]),
);
