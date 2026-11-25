/**
 * **Le sol depuis votre arrivée** (#509) : chaque grandeur que le moteur publie
 * du sol, maintenant et à l'arrivée, côte à côte.
 *
 * `v1.md` demande que le sol qui s'appauvrit se voie avant d'être
 * irréversible. La carte montrait l'état, jamais l'écart : « pH 6,4 » ne dit
 * rien à qui ne se souvient pas qu'il était à 7,0. Le relevé d'arrivée
 * (`StationInfo.solALArrivee`) donne le repère, et ce module met les deux
 * lectures en regard.
 *
 * **Rien n'est recalculé ici.** Les deux colonnes lisent la même grandeur par
 * la même fiche (`calquesDuSol.ts`) ou dans le même champ de l'instantané ; le
 * seul calcul est la différence, qui est un fait d'affichage. Les moyennes
 * écartent l'eau libre, comme la ligne « Sur la parcelle » sous la carte.
 */

import { moisDeLaSemaine } from "../mots";
import type { Snapshot, StationInfo } from "../protocol";
import {
  CALQUE_ECART_PH,
  ecartSigne,
  etendueALArrivee,
  etendueDuCalque,
  ficheDuCalque,
} from "./calquesDuSol";

/**
 * Le mois du relevé : l'arrivée est la semaine 0 du joueur, et chaque saut
 * d'un an retombe sur la même semaine de l'année.
 */
export const MOIS_DE_L_ARRIVEE = moisDeLaSemaine(0);

/** Une ligne du tableau : une grandeur, dans l'unité où le volet l'écrit. */
export interface GrandeurDepuisLArrivee {
  id: "ph" | "humus" | "azote" | "phosphore" | "potassium";
  libelle: string;
  unite: string;
  /** Maintenant, formatée ; absente tant que le moteur ne l'a pas mesurée. */
  maintenant: string | undefined;
  /** À l'arrivée, formatée. */
  aLArrivee: string;
  /** Maintenant moins à l'arrivée, signé ; absent avec `maintenant`. */
  ecart: string | undefined;
  /**
   * Les écarts extrêmes d'une cellule à l'autre, quand la grandeur a une grille
   * et que la moyenne les cache — le pH, que la litière abaisse sous les arbres
   * et nulle part ailleurs (#495).
   */
  selonLaCellule?: { bas: string; haut: string };
  /** Ce qu'il faut savoir pour lire l'écart sans se tromper. */
  note?: string;
}

/** Une moyenne de parcelle, maintenant et à l'arrivée, par la fiche de son calque. */
function moyennes(
  id: "ph" | "azote" | "potassium",
  snapshot: Snapshot,
  station: StationInfo,
  cellules: number,
): { maintenant: number; aLArrivee: number } | undefined {
  const fiche = ficheDuCalque(id);
  const maintenant = etendueDuCalque(fiche, snapshot, station, cellules);
  const aLArrivee = etendueALArrivee(fiche, station, cellules);
  if (!maintenant || !aLArrivee) return undefined;
  return { maintenant: maintenant.moyenne, aLArrivee: aLArrivee.moyenne };
}

/** Une ligne dont les deux valeurs sont déjà dans l'unité affichée. */
function ligne(
  base: Omit<GrandeurDepuisLArrivee, "maintenant" | "aLArrivee" | "ecart">,
  maintenant: number | undefined,
  aLArrivee: number,
  decimales: number,
  decimalesEcart = decimales,
): GrandeurDepuisLArrivee {
  return {
    ...base,
    maintenant: maintenant === undefined ? undefined : maintenant.toFixed(decimales),
    aLArrivee: aLArrivee.toFixed(decimales),
    ecart:
      maintenant === undefined ? undefined : ecartSigne(maintenant - aLArrivee, decimalesEcart),
  };
}

/**
 * Le tableau, ou `undefined` quand la partie n'a pas de relevé d'arrivée — une
 * partie reprise d'un bloc écrit avant lui : la carte montre alors l'état seul.
 */
export function solDepuisLArrivee(
  snapshot: Snapshot,
  station: StationInfo,
  cellules: number,
): GrandeurDepuisLArrivee[] | undefined {
  const arrivee = station.solALArrivee;
  if (!arrivee) return undefined;
  const lignes: GrandeurDepuisLArrivee[] = [];

  const ph = moyennes("ph", snapshot, station, cellules);
  if (ph) {
    const ecarts = etendueDuCalque(CALQUE_ECART_PH, snapshot, station, cellules);
    lignes.push({
      // Une décimale comme la carte, mais l'écart en a deux : les premières
      // années d'une plantation déplacent le pH de quelques centièmes.
      ...ligne({ id: "ph", libelle: "pH", unite: "" }, ph.maintenant, ph.aLArrivee, 1, 2),
      ...(ecarts
        ? { selonLaCellule: { bas: ecartSigne(ecarts.bas, 2), haut: ecartSigne(ecarts.haut, 2) } }
        : {}),
    });
  }

  // L'humus en carbone, comme le bilan de la parcelle le compte : la matière
  // organique stable du sol, celle qui retient l'eau et nourrit la vie du sol.
  lignes.push(
    ligne(
      { id: "humus", libelle: "Humus", unite: "t C/ha" },
      snapshot.inventory.humusTHa,
      arrivee.humusTHa,
      1,
    ),
  );

  const azote = moyennes("azote", snapshot, station, cellules);
  if (azote) {
    lignes.push(
      ligne(
        {
          id: "azote",
          libelle: "Azote minéral",
          unite: "kg/ha",
          // Mesuré sur la friche vieillie : de 0 à 22 kg/ha dans la même année.
          // Le relevé d'arrivée tombe sur la semaine où retombe chaque saut
          // d'un an : c'est là que les deux colonnes se comparent.
          note: `il suit les saisons : comparez-le en ${MOIS_DE_L_ARRIVEE}`,
        },
        azote.maintenant * 10,
        azote.aLArrivee * 10,
        1,
      ),
    );
  }

  // Le phosphore se lit dans les flux du dernier tick, comme la ligne « Sol » ;
  // une parcelle neuve n'en a pas avant sa première semaine.
  lignes.push(
    ligne(
      { id: "phosphore", libelle: "Phosphore assimilable", unite: "kg/ha" },
      snapshot.fluxes ? snapshot.fluxes.phosphoreMoyenGM2 * 10 : undefined,
      arrivee.phosphoreMoyenGM2 * 10,
      1,
    ),
  );

  const potassium = moyennes("potassium", snapshot, station, cellules);
  if (potassium) {
    lignes.push(
      ligne(
        { id: "potassium", libelle: "Potassium échangeable", unite: "mg K/kg" },
        potassium.maintenant,
        potassium.aLArrivee,
        0,
      ),
    );
  }
  return lignes;
}
