/**
 * **L'avis « Sécheresse »** : la réserve du sol presque à sec en saison de
 * végétation (#343).
 *
 * `soil.waterMm` est une grille **cellule × horizon**. L'avis prenait sa
 * moyenne sur toutes les cases — une moyenne **par horizon** — et la comparait
 * à la réserve utile du **profil entier** : à deux horizons il se déclenchait
 * sous 40 % de la réserve, à trois sous 60 %. Mesuré sur la lande sèche, sol
 * nu : affiché 31 semaines d'été sur 42 alors que le profil ne descendait
 * jamais sous 47 %, et jamais affiché sur les stations à deux horizons.
 *
 * On somme donc l'eau de tous les horizons, et on divise par le nombre de
 * **cellules** : c'est l'eau d'un profil moyen, la même grandeur que `ruMm`.
 */

import { getEspece } from "../engine/especes";
import { nomEspeces, s } from "./mots";

/** Part de la réserve utile sous laquelle le profil est « presque à sec ». */
export const PART_A_SEC = 0.2;

/** L'eau d'un profil moyen de la parcelle, mm — tous horizons confondus. */
export function eauDuProfilMoyenMm(waterMm: ArrayLike<number>, nCellules: number): number {
  let somme = 0;
  for (let k = 0; k < waterMm.length; k++) somme += waterMm[k] ?? 0;
  return somme / Math.max(1, nCellules);
}

/** Le profil moyen est-il presque à sec ? */
export function solPresqueASec(
  waterMm: ArrayLike<number>,
  nCellules: number,
  ruProfilMm: number,
): boolean {
  return eauDuProfilMoyenMm(waterMm, nCellules) < PART_A_SEC * ruProfilMm;
}

/**
 * **Qui a soif, et combien** (#429, suite de #372).
 *
 * La ligne disait « les sensibles souffrent » sans rien en savoir : le moteur
 * jetait la soif de chaque arbre. Il la publie maintenant (`satisfactionEau`,
 * #413), et **avoir soif se lit sur la fiche de l'espèce** : sous
 * `seuilConfortSecheresse`, la croissance ralentit ; sous `seuilStressSecheresse`,
 * l'arbre puise dans ses réserves et risque la mort. Un même 0,4 laisse un pin
 * sylvestre tranquille et met un aulne en danger — d'où un compte arbre par
 * arbre, chacun contre la sienne.
 *
 * Seule la **détresse** est nommée : en plein été sec, presque tous les jeunes
 * plants passent sous leur confort (97 à 100 % sur la lande, mesuré dans #413),
 * et les nommer tous ne dirait rien.
 */
export interface SoifDesArbres {
  /** l'essence de chaque arbre en détresse */
  enDetresse: string[];
  /** les arbres sous leur confort, sans être en détresse */
  ralentis: number;
}

/** Les vivants dont la soif est connue, comptés contre leur essence. */
export function compterLaSoif(
  arbres: readonly { id: number; especeId: string; alive: boolean }[],
  satisfactionEau: ReadonlyMap<number, number>,
): SoifDesArbres {
  const enDetresse: string[] = [];
  let ralentis = 0;
  for (const a of arbres) {
    if (!a.alive) continue;
    const sat = satisfactionEau.get(a.id);
    if (sat === undefined) continue;
    const { seuilConfortSecheresse, seuilStressSecheresse } = getEspece(a.especeId).eau;
    if (sat < seuilStressSecheresse) enDetresse.push(a.especeId);
    else if (sat < seuilConfortSecheresse) ralentis++;
  }
  return { enDetresse, ralentis };
}

/** Combien d'essences la ligne nomme, au plus. */
export const ESSENCES_NOMMEES = 3;

/** La ligne « Sécheresse » du journal. */
export function direLaSecheresse(soif: SoifDesArbres): string {
  const debut = "Sécheresse : la réserve du sol est presque à sec";
  const n = soif.enDetresse.length;
  const r = soif.ralentis;
  const ralentis =
    r > 0
      ? `${r} ${n > 0 ? "autre" : "arbre"}${s(r)} ${r >= 2 ? "ralentissent leur" : "ralentit sa"} croissance`
      : "";
  if (n === 0) {
    return ralentis
      ? `${debut} — aucun arbre en détresse ; ${ralentis}`
      : `${debut} — les arbres tiennent encore`;
  }
  const parEspece = new Map<string, number>();
  for (const id of soif.enDetresse) parEspece.set(id, (parEspece.get(id) ?? 0) + 1);
  const triees = [...parEspece].sort((a, b) => b[1] - a[1]);
  const nommees = triees.slice(0, ESSENCES_NOMMEES).map(([id, k]) => `${k} ${nomEspeces(id, k)}`);
  const reste = triees.slice(ESSENCES_NOMMEES).reduce((t, [, k]) => t + k, 0);
  if (reste > 0) nommees.push(`${reste} d'autre${s(reste)} essence${s(reste)}`);
  return (
    `${debut} — ${n} arbre${s(n)} en détresse, qui puise${n >= 2 ? "nt" : ""} dans ${n >= 2 ? "leurs" : "ses"} réserves (${nommees.join(", ")})` +
    (ralentis ? ` ; ${ralentis}` : "")
  );
}
