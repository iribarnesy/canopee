/**
 * LE BILAN DE PÉRIODE, CLIQUABLE (#128, §6.8 №2).
 *
 * *« Un panneau qui remplace le fil texte quand la vitesse est haute : les
 * changements regroupés, chaque ligne cliquable pour que la caméra aille se
 * poser sur l'endroit concerné, avec ses marqueurs. C'est ce qui fait le lien
 * entre "il s'est passé quelque chose" et "voilà où". »*
 *
 * Deux choix de forme, et ils viennent tous les deux de cette phrase :
 *
 * - **la ligne EST le bouton**, et pas un texte suivi d'une loupe. Ce qu'on
 *   veut du joueur qui lit « 34 bouleaux morts de sécheresse », c'est qu'il
 *   aille voir ; mettre la cible ailleurs que sur la phrase, c'est lui demander
 *   de viser ;
 * - **une ligne sans endroit ne fait pas semblant d'en avoir un.** Elle reste
 *   lisible, elle ne réagit pas au survol, et elle ne prend pas le curseur de
 *   la main. C'est le cas d'un franchissement de stade dont l'arbre a disparu
 *   de l'instantané depuis — le bilan sait COMBIEN, pas OÙ, et il le montre.
 *
 * Il ne compte rien lui-même : `bilan.ts` tient le pli et la phrase, ici on
 * dessine. La fin de niveau affiche le même composant avec le bilan de la
 * partie entière.
 */

import type { LigneLue } from "../bilan";

/** L'année de jeu d'une semaine, telle que le reste de l'écran la compte. */
function an(semaine: number): number {
  return Math.floor(semaine / 52) + 1;
}

/** Quand ça s'est passé : une date, ou une durée quand la ligne en couvre une. */
function quand(ligne: LigneLue): string {
  const a = an(ligne.premiereSemaine);
  const b = an(ligne.derniereSemaine);
  return a === b ? `an ${a}` : `an ${a} → ${b}`;
}

export function PanneauBilan({
  lignes,
  surCadrer,
  quandVide = "Rien à signaler sur cette période.",
}: {
  lignes: readonly LigneLue[];
  /** aller voir : la caméra se pose là, sans changer le zoom */
  surCadrer?: (ou: { x: number; y: number }) => void;
  quandVide?: string;
}) {
  if (lignes.length === 0) {
    return <div style={{ color: "var(--encre-douce)", fontSize: 13 }}>{quandVide}</div>;
  }
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, fontSize: 13 }}>
      {lignes.map((ligne) => {
        const ou = ligne.ou;
        const cliquable = ou !== undefined && surCadrer !== undefined;
        return (
          <li key={ligne.cle}>
            <button
              type="button"
              disabled={!cliquable}
              onClick={cliquable ? () => surCadrer(ou) : undefined}
              title={cliquable ? "Aller voir" : undefined}
              style={{
                display: "flex",
                gap: 8,
                alignItems: "baseline",
                width: "100%",
                textAlign: "left",
                padding: "3px 6px",
                margin: 0,
                border: "none",
                borderRadius: 6,
                background: "transparent",
                color: "var(--encre)",
                font: "inherit",
                cursor: cliquable ? "pointer" : "default",
              }}
            >
              <span aria-hidden="true">{ligne.icone}</span>
              <span style={{ flex: 1 }}>{ligne.texte}</span>
              <span style={{ opacity: 0.6, whiteSpace: "nowrap" }}>{quand(ligne)}</span>
              {/* Le doigt n'apparaît que là où il mène quelque part. */}
              <span aria-hidden="true" style={{ opacity: cliquable ? 0.6 : 0 }}>
                ↗
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
