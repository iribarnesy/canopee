/**
 * **La boîte qui demande avant de défaire** (#226).
 *
 * Écrite une fois parce que la règle vaut pour tous les écrans empilés — une
 * partie, le bac à sable, et ceux qui viendront. Ce qui change d'un écran à
 * l'autre est le **texte**, et lui seul : ce qui est en jeu n'est pas le même
 * partout, une partie est sauvegardée, un terrain à moitié dessiné peut-être
 * pas.
 *
 * **Notre boîte et pas celle du navigateur** : `confirm()` ne se traduit pas,
 * ne se met pas en français, et surtout ne sait pas dire ce qui est en jeu.
 * C'est pourtant toute la réponse à la question qu'on se pose à cet instant.
 */

import type React from "react";
import { btn, panel } from "./styles";

export function Confirmation({
  titre,
  children,
  confirmer,
  annuler,
  motConfirmer,
  motAnnuler = "↩ Continuer",
}: {
  titre: string;
  /** Ce qui est en jeu — une phrase, dans les mots de cet écran-là. */
  children: React.ReactNode;
  confirmer: () => void;
  annuler: () => void;
  motConfirmer: string;
  motAnnuler?: string;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "grid",
        placeItems: "center",
        background: "rgba(30, 26, 18, 0.55)",
        backdropFilter: "blur(2px)",
        zIndex: 45,
      }}
    >
      <section style={{ ...panel, maxWidth: 420, padding: "18px 22px" }} aria-label={titre}>
        <h2 style={{ margin: 0, fontSize: "1.1em" }}>{titre}</h2>
        <p style={{ margin: "8px 0 0", opacity: 0.85 }}>{children}</p>
        <div style={{ marginTop: 14 }}>
          <button type="button" style={btn(true)} onClick={confirmer}>
            {motConfirmer}
          </button>
          <button type="button" style={btn()} onClick={annuler}>
            {motAnnuler}
          </button>
        </div>
      </section>
    </div>
  );
}
