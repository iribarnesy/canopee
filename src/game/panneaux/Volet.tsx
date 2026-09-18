/**
 * Les VOLETS et les COINS de l'écran de jeu.
 *
 * La parcelle occupe toute la fenêtre ; tout le reste se range dans ses
 * angles, qu'une vue isométrique laisse vides. Un coin porte une rangée de
 * boutons, et au plus UN volet ouvert : deux volets côte à côte dans le même
 * angle, c'est la colonne de droite qu'on vient de démonter.
 *
 * **Un clic à côté ne ferme rien.** C'était l'idée de départ, et elle est
 * fausse ici : « à côté », c'est la parcelle, et cliquer la parcelle EST le
 * geste qu'on est en train de faire. On ferme par le bouton, par la croix, ou
 * par Échap.
 */

import { useEffect, useState } from "react";
import { btn, VOLET } from "./styles";

export type Coin = "hg" | "hd" | "bg" | "bd";

/** Marge entre un coin et le bord de la fenêtre, px. */
const MARGE = 12;

const ANCRE: Record<Coin, React.CSSProperties> = {
  hg: { top: MARGE, left: MARGE },
  hd: { top: MARGE, right: MARGE },
  bg: { bottom: MARGE, left: MARGE },
  bd: { bottom: MARGE, right: MARGE },
};

/**
 * Un angle de l'écran : sa rangée de boutons, et le volet qu'elle ouvre.
 *
 * En bas, le volet se déplie AU-DESSUS de ses boutons ; en haut, au-dessous.
 * Dans les deux cas les boutons ne bougent pas quand un volet s'ouvre —
 * sinon on viserait une cible qui se dérobe.
 */
export function Angle({
  coin,
  volet,
  children,
}: {
  coin: Coin;
  volet?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const enBas = coin === "bg" || coin === "bd";
  const aDroite = coin === "hd" || coin === "bd";
  return (
    <div
      style={{
        position: "absolute",
        ...ANCRE[coin],
        display: "flex",
        flexDirection: enBas ? "column" : "column-reverse",
        alignItems: aDroite ? "flex-end" : "flex-start",
        gap: 8,
        maxHeight: `calc(100vh - ${2 * MARGE}px)`,
      }}
    >
      {volet}
      {children && (
        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            justifyContent: aDroite ? "flex-end" : "flex-start",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** Un volet ouvert : un titre, une croix, et ce qu'il y a dedans. */
export function Volet({
  titre,
  largeur = 360,
  surFermer,
  children,
}: {
  titre: string;
  largeur?: number;
  surFermer: () => void;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        ...VOLET,
        position: "relative",
        width: largeur,
        maxHeight: "calc(100vh - 140px)",
        overflowY: "auto",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
          position: "sticky",
          top: -8,
          background: "inherit",
        }}
      >
        <strong
          style={{
            flex: 1,
            fontFamily: "system-ui, sans-serif",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.09em",
            textTransform: "uppercase",
            color: "var(--foret)",
          }}
        >
          {titre}
        </strong>
        <button
          type="button"
          onClick={surFermer}
          title="Fermer (Échap)"
          style={{ ...btn(), marginRight: 0, marginBottom: 0, padding: "2px 8px" }}
        >
          ✕
        </button>
      </header>
      {children}
    </section>
  );
}

/** Le bouton qui ouvre un volet : allumé tant que son volet est ouvert. */
export function BoutonDeVolet({
  ouvert,
  surClic,
  children,
}: {
  ouvert: boolean;
  surClic: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      style={{ ...btn(ouvert), marginRight: 0, marginBottom: 0 }}
      onClick={surClic}
    >
      {children}
    </button>
  );
}

export interface Volets {
  estOuvert: (coin: Coin, nom: string) => boolean;
  basculer: (coin: Coin, nom: string) => void;
  fermer: (coin: Coin) => void;
}

/**
 * Qui est ouvert, coin par coin. Échap referme tout : c'est la seule touche
 * qui sorte d'un volet, et la parcelle n'en fait rien.
 */
export function useVolets(depart: Partial<Record<Coin, string>> = {}): Volets {
  const [ouverts, setOuverts] = useState<Partial<Record<Coin, string>>>(depart);

  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOuverts({});
    };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, []);

  return {
    estOuvert: (coin, nom) => ouverts[coin] === nom,
    basculer: (coin, nom) =>
      setOuverts((o) => ({ ...o, [coin]: o[coin] === nom ? undefined : nom })),
    fermer: (coin) => setOuverts((o) => ({ ...o, [coin]: undefined })),
  };
}
