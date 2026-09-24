/**
 * Les styles de l'écran de jeu : la scène qui prend la fenêtre, les volets
 * qu'on y pose, et les deux briques — un cadre, un bouton — dont tous les
 * panneaux se servent.
 */

import type * as React from "react";

/**
 * La scène : toute la fenêtre, et rien qui dépasse. `fixed` et non `absolute`
 * parce que l'écran de jeu ne vit plus dans la colonne centrée du site — il
 * **est** la page.
 */
export const SCENE: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  overflow: "hidden",
  background: "var(--carte)",
};

/**
 * Un volet posé sur la parcelle. Fond presque opaque : dessous il y a une vue
 * en mouvement, et du texte sur des feuillages qui bougent ne se lit pas.
 */
export const VOLET: React.CSSProperties = {
  position: "absolute",
  border: "1px solid var(--trait)",
  borderRadius: 10,
  padding: "8px 12px",
  background: "rgba(255, 253, 247, 0.94)",
  boxShadow: "0 2px 12px rgba(60, 50, 30, 0.16)",
  backdropFilter: "blur(3px)",
};

/**
 * La colonne de droite, le temps que ses morceaux trouvent leurs coins. Elle
 * recouvre la vue au lieu de la rogner.
 */
export const PANNEAU_DROIT: React.CSSProperties = {
  position: "absolute",
  top: 0,
  right: 0,
  bottom: 0,
  width: 380,
  overflowY: "auto",
  padding: "12px 14px",
  display: "flex",
  flexDirection: "column",
  gap: 10,
  background: "rgba(255, 253, 247, 0.94)",
  borderLeft: "1px solid var(--trait)",
  boxShadow: "-2px 0 14px rgba(60, 50, 30, 0.16)",
  backdropFilter: "blur(3px)",
};

export const panel: React.CSSProperties = {
  border: "1px solid var(--trait)",
  borderRadius: 8,
  padding: "8px 12px",
  background: "var(--carte)",
};

export const btn = (active = false): React.CSSProperties => ({
  padding: "4px 11px",
  marginRight: 5,
  marginBottom: 4,
  border: "1px solid",
  borderColor: active ? "var(--foret)" : "var(--trait)",
  borderRadius: 6,
  background: active ? "var(--foret)" : "#fff",
  color: active ? "#fff" : "var(--encre)",
  cursor: "pointer",
});
