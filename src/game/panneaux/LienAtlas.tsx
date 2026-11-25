/**
 * Un lien vers l'atlas des espèces (#513), le même partout où on le pose : le
 * volet « Qu'est-ce qu'on plante ? » et la fiche d'un arbre sélectionné.
 *
 * **Dans un nouvel onglet**, et c'est le point : la partie est la page. La
 * quitter pour lire une fiche déclencherait l'avertissement de sortie, et
 * coûterait au pire trente secondes de jeu (le dernier autosave).
 */

import type React from "react";
import { lienAtlas } from "../atlas";

export function LienAtlas({
  especeId,
  titre,
  children,
}: {
  /** l'essence à chercher dans l'atlas ; absente, la liste entière */
  especeId?: string;
  /** l'infobulle */
  titre: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={lienAtlas(especeId)}
      target="_blank"
      rel="noopener noreferrer"
      title={`${titre} (nouvel onglet)`}
      style={{ color: "var(--foret)", whiteSpace: "nowrap" }}
    >
      📖 {children} ↗
    </a>
  );
}
