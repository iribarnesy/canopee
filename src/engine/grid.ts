/**
 * Grille spatiale 1 m² (docs/regles.md §1.2). Les positions des arbres sont
 * continues (m) ; les cellules de sol sont indexées `i = y*width + x`.
 * Les itérations de disque passent par un callback pour rester sans allocation
 * dans les boucles chaudes du tick.
 */

export interface GridDims {
  /** largeur et hauteur en mètres (= en cellules de 1 m²) */
  widthM: number;
  heightM: number;
}

export function cellCount(dims: GridDims): number {
  return dims.widthM * dims.heightM;
}

export function cellIndexAt(dims: GridDims, xM: number, yM: number): number {
  const x = Math.min(dims.widthM - 1, Math.max(0, Math.floor(xM)));
  const y = Math.min(dims.heightM - 1, Math.max(0, Math.floor(yM)));
  return y * dims.widthM + x;
}

/**
 * Appelle `fn(index)` pour chaque cellule dont le centre est dans le disque
 * (cx, cy, r). Garantit au moins une cellule (celle du centre) — un semis a
 * toujours un sol sous les pieds.
 */
export function forEachDiscCell(
  dims: GridDims,
  cx: number,
  cy: number,
  r: number,
  fn: (index: number) => void,
): void {
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(dims.widthM - 1, Math.floor(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(dims.heightM - 1, Math.floor(cy + r));
  const r2 = r * r;
  let found = false;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r2) {
        fn(y * dims.widthM + x);
        found = true;
      }
    }
  }
  if (!found) fn(cellIndexAt(dims, cx, cy));
}

/** Nombre de cellules du disque (même règle que forEachDiscCell). */
export function discCellCount(dims: GridDims, cx: number, cy: number, r: number): number {
  let n = 0;
  forEachDiscCell(dims, cx, cy, r, () => {
    n++;
  });
  return n;
}
