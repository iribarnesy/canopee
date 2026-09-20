/**
 * Le journal du jeu, joué comme une ellipse (§5.11).
 *
 * **Le chaînon qui manquait.** Toute la machinerie est écrite et mesurée — le
 * plan (`temps/ellipse.ts`), le lecteur, les trois canaux de la vue — mais elle
 * n'était branchée que sur le harnais d'aperçu, qui relit des scènes cuites. Le
 * jeu recevait pourtant tout ce qu'il faut à chaque instantané : `morts`,
 * `chutes`, `gestes`, `naissances`, `franchissements`, `incendie`. Il ne les
 * lisait pas, et la parcelle était vivante sans être animée.
 *
 * **Un instantané = un journal.** Le worker accumule ce qui a changé depuis le
 * précédent puis vide ses listes (`worker.ts`), ce qui est exactement la
 * sémantique de `JournalDeSemaine`. Il n'y a donc rien à accumuler ici, et
 * surtout rien à déduire d'un état : la règle de `docs/agents/jeu.md` tient
 * jusqu'au bout.
 *
 * **Le budget suit la vitesse, et c'est la politique du §5.11.** « Passer d'une
 * semaine à la suivante est INSTANTANÉ » : à grande vitesse, les instantanés
 * arrivent plus vite qu'une ellipse ne se joue, et une animation qu'on remplace
 * avant sa fin est pire que pas d'animation — elle bouge sans rien dire. Le
 * temps d'écran d'une semaine est donc le plafond, et la pause a droit au
 * budget entier. C'est là que le §6.2 se joue de toute façon : on clique
 * « abattre » à l'arrêt, l'action s'applique sur-le-champ et son instantané
 * arrive aussitôt.
 */

import { useMemo, useRef } from "react";
import { getEspece } from "../engine/especes";
import { ventRecuParLeSite } from "../engine/feu";
import { partFoliaireOmbrageanteDans, senescenceDans } from "../engine/phenologie";
import type { Vue } from "../render/camera";
import { type Marqueur, marqueursDuJournal } from "../render/temps/changements";
import { combiner, DEBOUT, type Deformation } from "../render/temps/chute";
import {
  dureeBloquanteMs,
  type JournalDeSemaine,
  planAuRythmeNaturel,
  planDEllipse,
} from "../render/temps/ellipse";
import { SANS_VENT, type VentAPencher } from "../render/temps/feu";
import type { ArbreRemodele, TigeAbattue } from "../render/temps/geste";
import {
  type ArbreATorcher,
  AUCUNE_TORCHE,
  chandellesTombees,
  chuteDeLaChandelle,
  chuteDeLaTige,
  deformationDe,
  etatDuTorchage,
  etatMourantDe,
  feuEnCours,
  type IncendieAPoser,
  indexerLesChandellesTombees,
  indexerLesChutes,
  indexerLesGestes,
  indexerLesMorts,
  indexerLesTorches,
  indexerLesVoiles,
  particulesDuFeu,
  poseDeLaMort,
  poseDeLaRafale,
  poseDuPlant,
  RIEN_NE_BRULE,
  remodelageDe,
  tigesAbattues,
  trouverLaTempete,
  trouverLeFeu,
  voilesEnCours,
} from "../render/temps/lecteur";
import type { ArbreVivant, EtatMourant } from "../render/temps/mort";
import type { CelluleVoilee } from "../render/temps/voile";
import type { Snapshot, StationInfo } from "./protocol";

/**
 * Temps d'écran d'une ellipse à l'arrêt, ms.
 *
 * Deux secondes et demie, et c'est un BUDGET au sens du §5.11 : le joueur qui
 * saute une semaine et celui qui saute dix ans attendent le même temps, l'un
 * voyant quatre actes et l'autre quarante.
 */
export const DUREE_ELLIPSE_MS = 2500;

/**
 * Vitesse à partir de laquelle on ne retient plus l'horloge, semaines/seconde.
 *
 * **Le seuil n'est pas choisi au doigt mouillé : il est déjà dans le produit.**
 * Le bandeau offre deux sauts (#146) — « +1 mois » qui traverse à ×4 « pour
 * voir la parcelle changer pendant le mois », et « +1 an » qui traverse à ×13.
 * La ligne entre VIVRE le temps et le TRAVERSER est donc posée entre ces deux
 * vitesses-là, et c'est celle qu'on reprend.
 *
 * En deçà, une animation bloquante va jusqu'au bout et le temps l'attend : le
 * joueur regarde. Au-delà, les actes se rangent dans le temps d'écran d'une
 * semaine comme avant, quitte à être comprimés ou omis : le joueur traverse,
 * et une traversée d'un an qui durerait cinq minutes ne serait pas une
 * traversée.
 */
export const VITESSE_SANS_ATTENTE = 13;

/**
 * Ce que la vue reçoit d'une ellipse en cours.
 *
 * Les noms sont ceux des propriétés de `VueParcelle` : l'appelant les étale, il
 * n'a pas à savoir comment elles sont faites.
 */
export interface EllipseDuJeu {
  /**
   * Les fûts à poser EN PLUS des arbres de l'instantané : les tiges qu'un
   * geste vient d'abattre, et les chandelles qui s'abattent d'elles-mêmes.
   *
   * Les deux ont quitté `state.trees` dans le tick où ils tombent : sans ça,
   * ils s'escamotent entre deux images. La liste ne change pas pendant que le
   * plan se joue — c'est la déformation qui la fait tomber — pour que le
   * tableau d'arbres reste une clé de cache stable.
   */
  tiges: readonly TigeAbattue[];
  /** vrai pour un arbre que le front est en train de torcher */
  seTorche: (id: number) => boolean;
  deformer: (idArbre: number, maintenantMs: number, vue: Vue) => Deformation;
  mourant: (idArbre: number, maintenantMs: number, vivant: ArbreVivant) => EtatMourant | undefined;
  remodeler: (idArbre: number, maintenantMs: number, especeId: string) => ArbreRemodele | undefined;
  voiler: (maintenantMs: number) => readonly CelluleVoilee[];
  feu: (maintenantMs: number) => IncendieAPoser;
  marqueurs: readonly Marqueur[];
  /** le départ d'un incendie, le seul événement qui mérite qu'on cadre */
  cadrerSur?: { x: number; y: number };
  /**
   * Combien de temps le jeu doit ATTENDRE avant la semaine suivante, ms (#163).
   *
   * Zéro quand rien ne bloque — plan vide, ou traversée à grande vitesse. Le
   * calcul est ici et non dans la vue parce que c'est une propriété du plan,
   * pas du dessin.
   */
  attenteMs: number;
  /**
   * REJOUER l'ellipse depuis son début (#157).
   *
   * « L'incendie est déjà fini quand on lève les yeux » : une ellipse se joue
   * une fois, à l'instant précis où le bandeau d'autopause apparaît —
   * c'est-à-dire au moment où le joueur lit le bandeau et non la parcelle.
   * Allonger l'acte ne suffit pas, parce que le problème n'est pas sa durée
   * mais le fait qu'il n'a lieu qu'une fois.
   *
   * Rejouer ne recalcule RIEN : le plan est déjà là, seule l'horloge revient à
   * zéro. C'est pour ça que ça coûte une référence et pas un rembobinage
   * (#128) — l'instantané courant porte encore son journal.
   */
  rejouer: () => void;
  /** Y a-t-il quelque chose à rejouer ? Faux sur une semaine sans journal. */
  rejouable: boolean;
}

/** Le journal que porte un instantané, dans la forme que le plan attend. */
function journalDe(snapshot: Snapshot): JournalDeSemaine {
  return {
    morts: snapshot.morts,
    chutes: snapshot.chutes,
    gestes: snapshot.gestes,
    naissances: snapshot.naissances,
    franchissements: snapshot.franchissements,
    ...(snapshot.incendie ? { incendie: snapshot.incendie } : {}),
    ...(snapshot.tempete ? { tempete: snapshot.tempete } : {}),
  };
}

/**
 * Le vent que la parcelle reçoit vraiment, pour incliner le panache.
 *
 * Le produit de la vitesse régionale de la semaine et de l'abri du site, et
 * c'est le moteur qui le calcule (`ventRecuParLeSite`) : le rendu ne refait pas
 * le produit, il appelle la fonction.
 */
function ventDuSite(snapshot: Snapshot, station: StationInfo): VentAPencher {
  const w = snapshot.weather;
  if (w.ventVersRad === undefined || w.ventMoyMs === undefined) return SANS_VENT;
  return {
    versRad: w.ventVersRad,
    recuMs: ventRecuParLeSite(w.ventMoyMs, station.ventExposition),
  };
}

/**
 * Les arbres que l'incendie a emportés, prêts à être torchés.
 *
 * Les identités viennent de l'incendie lui-même (`IncendieResult.victimes`) :
 * le rendu ne les reconnaît plus à leur `brulEeSemaine`, une jointure fausse
 * dès qu'un arbre a brûlé lors d'un incendie précédent.
 *
 * L'état d'AVANT le feu est recalculé par la phénologie du moteur, et il le
 * faut : l'instantané décrit l'arbre après — tronc charbonné, sans feuilles — et
 * une mise en scène qui partirait de là interpolerait du néant vers le néant.
 */
function candidatsAuTorchage(snapshot: Snapshot): ArbreATorcher[] {
  const victimes = snapshot.incendie?.victimes;
  if (!victimes || victimes.length === 0) return [];
  const ids = new Set(victimes.map((v) => v.id));
  const candidats: ArbreATorcher[] = [];
  for (const t of snapshot.trees) {
    if (!ids.has(t.id)) continue;
    const espece = getEspece(t.especeId);
    const ratio = espece?.lumiere.houppierRatio ?? 0.4;
    candidats.push({
      id: t.id,
      x: t.x,
      y: t.y,
      hauteurM: t.heightM,
      baseHouppierM: t.baseHouppierM ?? 0,
      rayonHouppierM: Math.max(0.3, t.heightM * ratio * 0.5),
      avantLeFeu: {
        partFoliaire: espece ? partFoliaireOmbrageanteDans(espece, snapshot.pheno) : 1,
        senescence: espece ? senescenceDans(espece, snapshot.pheno) : 0,
        vigueur: 1,
        dommageHydraulique: 0,
      },
    });
  }
  return candidats;
}

/** Rien ne se passe : les rappels neutres, partagés — donc sans allocation. */
const RIEN: EllipseDuJeu = {
  tiges: [],
  seTorche: () => false,
  deformer: () => DEBOUT,
  mourant: () => undefined,
  remodeler: () => undefined,
  voiler: () => [],
  feu: () => RIEN_NE_BRULE,
  marqueurs: [],
  attenteMs: 0,
  rejouer: () => {},
  rejouable: false,
};

/**
 * Le journal du dernier instantané, indexé et prêt à être joué.
 *
 * `vitesse` est en semaines par seconde, comme le HUD la donne ; zéro = en
 * pause.
 */
export function useEllipse(
  snapshot: Snapshot | undefined,
  station: StationInfo | undefined,
  vitesse: number,
): EllipseDuJeu {
  // Le temps d'écran d'une semaine borne l'ellipse : une animation remplacée
  // avant sa fin bouge sans rien dire.
  // **Deux régimes, et c'est le renversement demandé en #163.** En deçà du
  // seuil, chaque acte prend le temps qu'il lui faut et le jeu l'attend ;
  // au-delà, on retombe sur l'ancienne politique — le temps d'écran d'une
  // semaine est le plafond, et ce qui n'y tient pas est comprimé ou omis.
  const auRythmeNaturel = vitesse < VITESSE_SANS_ATTENTE;
  /** Le temps coule-t-il ? À l'arrêt il n'y a pas de semaine suivante à retenir. */
  const enMarche = vitesse > 0;
  const budgetMs = vitesse > 0 ? Math.min(DUREE_ELLIPSE_MS, 1000 / vitesse) : DUREE_ELLIPSE_MS;

  // L'origine des temps. Posée DANS le mémo et non dans un effet : la boucle
  // d'images de la vue peut tourner avant qu'un effet ne soit appliqué, et elle
  // lirait alors l'ellipse neuve avec l'horloge de l'ancienne — c'est-à-dire au
  // milieu, ou déjà finie.
  const debut = useRef(0);

  return useMemo(() => {
    if (!snapshot || !station) return RIEN;
    const journal = journalDe(snapshot);
    const plan = auRythmeNaturel
      ? planAuRythmeNaturel([journal])
      : planDEllipse([journal], budgetMs);
    if (plan.actes.length === 0) return RIEN;
    debut.current = performance.now();

    const coteM = station.coteM;
    const chutes = indexerLesChutes(plan);
    // Les chandelles qui tombent, reposées : elles ne sont plus dans
    // l'instantané de la semaine où elles tombent (#163).
    const chandelles = indexerLesChandellesTombees(plan);
    const morts = indexerLesMorts(plan);
    const voiles = indexerLesVoiles(plan, coteM);
    const gestes = indexerLesGestes(plan);
    const feu = trouverLeFeu(plan);
    const torches = feu
      ? indexerLesTorches(feu, candidatsAuTorchage(snapshot), coteM)
      : AUCUNE_TORCHE;
    const vent = ventDuSite(snapshot, station);

    // Le doigt qui montre (§6.8) : sur deux mille tiges de dix pixels, une
    // semaine ordinaire ne se VOIT pas sans lui. L'estompe, elle, reste
    // éteinte — elle est faite pour les grands sauts, et griser la parcelle
    // entière parce que trois arbres sont morts serait violent pour rien.
    const ou = new Map(snapshot.trees.map((t) => [t.id, { x: t.x, y: t.y }]));
    // La tempête ne dit que « qui » et « de quelle hauteur » : le reste se lit
    // dans l'instantané, où les victimes sont encore là — un chablis devient
    // chandelle sur-le-champ et n'est rapporté mort qu'un an plus tard.
    const arbres = new Map(
      snapshot.trees.map((t) => [t.id, { x: t.x, y: t.y, heightM: t.heightM }]),
    );
    const tempete = trouverLaTempete(plan, (id) => arbres.get(id));
    const calque = marqueursDuJournal(journal, (id) => ou.get(id), coteM);

    const depuis = (maintenantMs: number) => maintenantMs - debut.current;

    return {
      tiges: [...tigesAbattues(gestes), ...chandellesTombees(plan)],
      seTorche: (id) => torches.arbres.has(id),
      deformer: (id, maintenantMs, vue) => {
        const ecoule = depuis(maintenantMs);
        // Un fût reposé n'est pas un arbre de l'instantané : son identifiant
        // est négatif. Deux origines possibles — un geste l'a couché, ou
        // c'était une chandelle qui s'est abattue — et l'index qui ne le
        // connaît pas rend `DEBOUT`, qui est neutre.
        if (id < 0) {
          return combiner(
            chuteDeLaTige(gestes, ecoule, id, vue),
            chuteDeLaChandelle(chandelles, ecoule, id, vue),
          );
        }
        // Les canaux de POSE se composent : franchir dix ans, c'est voir un
        // arbre mourir puis tomber, et `DEBOUT` est neutre pour cette
        // composition.
        // Trois canaux de POSE qui se composent : tomber, mourir, et sortir de
        // terre. `DEBOUT` est neutre pour cette composition, donc on les
        // additionne sans se demander lequel a lieu.
        // Quatre canaux de POSE qui se composent : tomber, mourir, sortir de
        // terre, et plier sous la rafale. `DEBOUT` est neutre pour cette
        // composition, donc on les additionne sans se demander lequel a lieu.
        return combiner(
          combiner(
            combiner(deformationDe(chutes, ecoule, id, vue), poseDeLaMort(morts, ecoule, id)),
            poseDuPlant(gestes, ecoule, id),
          ),
          poseDeLaRafale(tempete, ecoule, id, vue),
        );
      },
      mourant: (id, maintenantMs, vivant) => {
        const ecoule = depuis(maintenantMs);
        // L'incendie décide de ce qu'il a tué : les deux ne se croisent jamais
        // sur un même arbre, mais l'ordre est écrit quand même.
        return etatDuTorchage(torches, ecoule, id) ?? etatMourantDe(morts, ecoule, id, vivant);
      },
      remodeler: (id, maintenantMs, especeId) =>
        remodelageDe(gestes, depuis(maintenantMs), id, especeId),
      voiler: (maintenantMs) => {
        const ecoule = depuis(maintenantMs);
        // Le front d'incendie et le voile d'un geste passent par la MÊME
        // couche : deux choses différentes qui se dessinent pareil.
        return [...voilesEnCours(voiles, ecoule), ...feuEnCours(feu, ecoule)];
      },
      feu: (maintenantMs) => particulesDuFeu(feu, depuis(maintenantMs), coteM, vent, torches),
      marqueurs: calque.marqueurs,
      // On n'attend que si le temps COULE : à l'arrêt il n'y a pas de semaine
      // suivante à retenir, et retenir une horloge arrêtée n'a pas de sens.
      attenteMs: auRythmeNaturel && enMarche ? dureeBloquanteMs(plan) : 0,
      // Remettre l'horloge à zéro suffit : la boucle d'images lit `debut` à
      // chaque frame, et le plan n'a pas bougé.
      rejouer: () => {
        debut.current = performance.now();
      },
      rejouable: true,
      ...(feu
        ? {
            cadrerSur: {
              x: (feu.origine % coteM) + 0.5,
              y: Math.floor(feu.origine / coteM) + 0.5,
            },
          }
        : {}),
    };
  }, [snapshot, station, budgetMs, auRythmeNaturel, enMarche]);
}
