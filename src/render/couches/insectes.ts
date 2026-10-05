/**
 * **Papillons et abeilles, dessinés** (#129).
 *
 * Deux figures par sorte, ailes ouvertes et ailes fermées : le battement est
 * leur alternance. Cuites une fois, à quatre fois leur taille à l'écran, pour
 * rester nettes une fois réduites. À six pixels, un papillon a une couleur et
 * deux ailes ; une abeille, un point jaune barré de brun.
 *
 * **Une seule robe par sorte**, et c'est voulu : le moteur a une guilde de
 * pollinisateurs, pas des espèces. Un piéride blanc pour les papillons — le plus
 * commun des jardins et des haies —, une abeille sauvage pour les autres.
 */

/** Côté d'une figure cuite, pixels. */
const COTE_PX = 24;

type Fabrique = (largeur: number, hauteur: number) => HTMLCanvasElement;

function papillon(fabriquer: Fabrique, ouvert: boolean): HTMLCanvasElement {
  const c = fabriquer(COTE_PX, COTE_PX);
  const g = c.getContext("2d");
  if (!g) return c;
  const m = COTE_PX / 2;
  // Les ailes : ouvertes, deux grands lobes ; fermées, un seul relevé.
  g.fillStyle = "#f4f1e4";
  g.strokeStyle = "rgba(60, 54, 40, 0.55)";
  g.lineWidth = 1.2;
  if (ouvert) {
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(m + s * 5.5, m - 2, 5.5, 4.5, s * 0.5, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.beginPath();
      g.ellipse(m + s * 4, m + 3.5, 3.5, 3, -s * 0.4, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    // La pointe noire de l'aile antérieure, le trait du piéride.
    g.fillStyle = "#2c2a26";
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(m + s * 9, m - 4.5, 1.6, 1.3, 0, 0, Math.PI * 2);
      g.fill();
    }
  } else {
    g.beginPath();
    g.ellipse(m + 1, m - 4, 3, 6, 0.25, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
  // Le corps.
  g.fillStyle = "#2c2a26";
  g.beginPath();
  g.ellipse(m, m, 1, 4.5, 0, 0, Math.PI * 2);
  g.fill();
  return c;
}

function abeille(fabriquer: Fabrique, ouvert: boolean): HTMLCanvasElement {
  const c = fabriquer(COTE_PX, COTE_PX);
  const g = c.getContext("2d");
  if (!g) return c;
  const m = COTE_PX / 2;
  // Les ailes, un voile clair : visible ouvert, presque rien en battement.
  g.fillStyle = ouvert ? "rgba(236, 244, 250, 0.85)" : "rgba(236, 244, 250, 0.35)";
  g.beginPath();
  g.ellipse(m - 2, m - 5, 3.5, 5, -0.4, 0, Math.PI * 2);
  g.ellipse(m + 3, m - 5, 3.5, 5, 0.4, 0, Math.PI * 2);
  g.fill();
  // Le corps : jaune, barré de brun.
  g.fillStyle = "#e0a826";
  g.beginPath();
  g.ellipse(m, m, 7, 5, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#3a2a18";
  for (const x of [-2.5, 1.5]) g.fillRect(m + x, m - 4.5, 2, 9);
  g.beginPath();
  g.ellipse(m + 6.5, m, 2.5, 2.5, 0, 0, Math.PI * 2);
  g.fill();
  return c;
}

/** Les quatre figures, indexées par `sorte:ouvert`. */
export function cuireLesInsectes(fabriquer: Fabrique): Record<string, HTMLCanvasElement> {
  return {
    "papillon:1": papillon(fabriquer, true),
    "papillon:0": papillon(fabriquer, false),
    "abeille:1": abeille(fabriquer, true),
    "abeille:0": abeille(fabriquer, false),
  };
}
