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
 * semaine à la suivante est **instantané** » : à grande vitesse, les instantanés
 * arrivent plus vite qu'une ellipse ne se joue, et une animation qu'on remplace
 * avant sa fin est pire que pas d'animation — elle bouge sans rien dire. Le
 * temps d'écran d'une semaine est donc le plafond, et la pause a droit au
 * budget entier. C'est là que le §6.2 se joue de toute façon : on clique
 * « abattre » à l'arrêt, l'action s'applique sur-le-champ et son instantané
 * arrive aussitôt.
 */

import { useMemo, useRef } from "react";
import { ESPECES_V0, type EspeceV0, getEspece } from "../engine/especes";
import { ventRecuParLeSite } from "../engine/feu";
import {
  type ContextePhenologique,
  contextePhenologiqueFractionnaire,
  partFoliaireOmbrageanteDans,
  senescenceDans,
} from "../engine/phenologie";
import type { Vue } from "../render/camera";
import {
  type Marqueur,
  marqueursDuJournal,
  OPACITE_HORS_SUJET,
  PLAFOND_DE_MARQUEURS,
  sujetsDuJournal,
} from "../render/temps/changements";
import { combiner, DEBOUT, type Deformation } from "../render/temps/chute";
import { dureeBloquanteMs, planAuRythmeNaturel, planDEllipse } from "../render/temps/ellipse";
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
import { journalDe } from "./journal";
import type { Snapshot, StationInfo } from "./protocol";

/**
 * Temps d'écran d'une ellipse à l'arrêt, ms.
 *
 * Deux secondes et demie, et c'est un **budget** au sens du §5.11 : le joueur qui
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
 * La ligne entre **vivre** le temps et le **traverser** est donc posée entre ces deux
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
 * Temps d'écran d'une **relecture**, secondes (#128).
 *
 * **C'est le mode cinéma**, et il tombe du même principe que le budget
 * d'ellipse : le §5.11 dit qu'une durée d'animation est une durée de
 * **présentation** et non de jeu. Une relecture d'un an et une relecture de vingt
 * ans durent donc le même temps à l'écran ; ce qui change est la densité de ce
 * qu'on y voit.
 *
 * Quarante-cinq secondes : assez pour qu'une année se lise, assez court pour
 * qu'on ne quitte pas la pièce. La première version laissait la vitesse à ×4
 * quelle que soit la période, et l'essai dans le navigateur l'a montrée
 * inutilisable — cinq ans à ×4, animations bloquantes comprises, tenaient
 * encore après deux minutes et demie.
 */
export const DUREE_RELECTURE_S = 45;

/**
 * À quelle vitesse revoir une période de tant de semaines.
 *
 * Bornée par le bas à ×1 — en dessous, on ne revoit plus, on attend — et par le
 * haut à ×52, la plus grande vitesse du bandeau. Entre les deux, le §5.11
 * décide de ce qui se perd : sous `VITESSE_SANS_ATTENTE` l'horloge attend les
 * animations bloquantes et l'on voit tout ; au-delà, les actes se compriment
 * dans le temps d'écran d'une semaine. Une relecture de vingt ans est donc
 * forcément une traversée, et c'est la seule réponse honnête.
 */
export function vitesseDeRelecture(semaines: number): number {
  return Math.max(1, Math.min(52, Math.round(semaines / DUREE_RELECTURE_S)));
}

/**
 * Ce que la vue reçoit d'une ellipse en cours.
 *
 * Les noms sont ceux des propriétés de `VueParcelle` : l'appelant les étale, il
 * n'a pas à savoir comment elles sont faites.
 */
export interface EllipseDuJeu {
  /**
   * Les fûts à poser **en plus** des arbres de l'instantané : les tiges qu'un
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
   * Combien de temps le jeu doit **attendre** avant la semaine suivante, ms (#163).
   *
   * Zéro quand rien ne bloque — plan vide, ou traversée à grande vitesse. Le
   * calcul est ici et non dans la vue parce que c'est une propriété du plan,
   * pas du dessin.
   */
  attenteMs: number;
  /**
   * **rejouer** l'ellipse depuis son début (#157).
   *
   * « L'incendie est déjà fini quand on lève les yeux » : une ellipse se joue
   * une fois, à l'instant précis où le bandeau d'autopause apparaît —
   * c'est-à-dire au moment où le joueur lit le bandeau et non la parcelle.
   * Allonger l'acte ne suffit pas, parce que le problème n'est pas sa durée
   * mais le fait qu'il n'a lieu qu'une fois.
   *
   * Rejouer ne recalcule **rien** : le plan est déjà là, seule l'horloge revient à
   * zéro. C'est pour ça que ça coûte une référence et pas un rembobinage
   * (#128) — l'instantané courant porte encore son journal.
   */
  rejouer: () => void;
  /** Y a-t-il quelque chose à rejouer ? Faux sur une semaine sans journal. */
  rejouable: boolean;
  /**
   * La **saison** à cet instant, par essence — le canal continu de la semaine
   * (#163, débloqué par #164).
   *
   * **Un hêtre gagne 51 % de sa feuille en un pas de temps**, mesuré ; c'est
   * la résolution hebdomadaire du moteur, pas une quantification du rendu. Le
   * moteur livre maintenant `contextePhenologiqueFractionnaire`, qui **recalcule**
   * le modèle à un instant intermédiaire — il ne l'interpole pas, parce que le
   * débourrement a des coudes et qu'une droite s'en écarte de 11 points au
   * printemps. Le rendu n'invente donc rien : il demande.
   *
   * Par **essence** et non par arbre : à un instant donné, deux hêtres portent la
   * même feuille. Une dizaine d'appels par image au lieu de trois mille.
   *
   * **Non bloquant** : la saison court en fond, elle ne retient pas l'horloge.
   * C'est le second cas de la distinction que porte `Acte.bloquant`, et le
   * premier qui ne vient pas du journal.
   */
  saison: (maintenantMs: number) => ReadonlyMap<string, SaisonDUneEssence> | undefined;
}

/** Ce que la saison fait à une essence, à un instant donné. */
export interface SaisonDUneEssence {
  partFoliaire: number;
  senescence: number;
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
 * L'état d'**avant** le feu est recalculé par la phénologie du moteur, et il le
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
  saison: () => undefined,
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

  // L'origine des temps. Posée **dans** le mémo et non dans un effet : la boucle
  // d'images de la vue peut tourner avant qu'un effet ne soit appliqué, et elle
  // lirait alors l'ellipse neuve avec l'horloge de l'ancienne — c'est-à-dire au
  // milieu, ou déjà finie.
  const debut = useRef(0);
  // **Posée pour toute semaine et plus seulement pour celles qui ont un
  // journal.** La saison court sur les semaines vides aussi — c'est même leur
  // seul mouvement — et une horloge restée sur la semaine d'avant lui ferait
  // lire une fraction déjà supérieure à un.
  // biome-ignore lint/correctness/useExhaustiveDependencies: c'est l'identité de l'instantané qu'on guette
  useMemo(() => {
    debut.current = performance.now();
  }, [snapshot]);

  // Tout sauf la saison, qui se calcule après pour pouvoir lire l'attente.
  const noyau = useMemo<Omit<EllipseDuJeu, "saison">>(() => {
    if (!snapshot || !station) return RIEN;
    const journal = journalDe(snapshot);
    const plan = auRythmeNaturel
      ? planAuRythmeNaturel([journal])
      : planDEllipse([journal], budgetMs);
    if (plan.actes.length === 0) return RIEN;

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
    // semaine ordinaire ne se **voit** pas sans lui.
    const ou = new Map(snapshot.trees.map((t) => [t.id, { x: t.x, y: t.y }]));
    /**
     * **L'estompe, enfin branchée dans le jeu** (#233).
     *
     * Elle existait, mesurée et documentée, et n'était appelée que par le banc
     * d'aperçu : ce qui n'a pas changé s'efface pour laisser voir ce qui a
     * changé. Le jeu, lui, ne s'en servait pas — d'où la plainte qui ouvre
     * l'issue, « ça se met en pause pour dire qu'il y a eu des événements, et
     * je n'ai vu aucune animation ».
     *
     * **Elle ne s'allume pas toujours, et c'est le cœur du correctif.** Deux
     * mesures la bornent, et aucune n'est choisie ici :
     *
     * - **par la taille**, dans `sujetsDuJournal` : un fût de trois pixels ne se
     *   cherche pas, et en garder neuf cents nets délave l'image entière ;
     * - **par le nombre**, avec le plafond du calque : au-delà, le module dit
     *   lui-même qu'un phénomène de masse « ne se cherche pas, il se lit dans
     *   une phrase », et c'est le bilan de période qui prend le relais.
     *
     * Le même seuil que les marqueurs, et pas un second à tenir d'accord.
     */
    const sujets = sujetsDuJournal(journal);
    const estompe = sujets.size > 0 && sujets.size <= PLAFOND_DE_MARQUEURS;
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
        // Les canaux de **pose** se composent : franchir dix ans, c'est voir un
        // arbre mourir puis tomber, et `DEBOUT` est neutre pour cette
        // composition.
        // Trois canaux de **pose** qui se composent : tomber, mourir, et sortir de
        // terre. `DEBOUT` est neutre pour cette composition, donc on les
        // additionne sans se demander lequel a lieu.
        // Quatre canaux de **pose** qui se composent : tomber, mourir, sortir de
        // terre, et plier sous la rafale. `DEBOUT` est neutre pour cette
        // composition, donc on les additionne sans se demander lequel a lieu.
        //
        // L'estompe est un **cinquième** canal, et elle se compose comme les
        // autres : ce qui n'est pas sujet du journal s'efface.
        const pose = combiner(
          combiner(
            combiner(deformationDe(chutes, ecoule, id, vue), poseDeLaMort(morts, ecoule, id)),
            poseDuPlant(gestes, ecoule, id),
          ),
          poseDeLaRafale(tempete, ecoule, id, vue),
        );
        if (!estompe || sujets.has(id)) return pose;
        return combiner(pose, { rotationRad: 0, hauteur: 1, opacite: OPACITE_HORS_SUJET });
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
        // Le front d'incendie et le voile d'un geste passent par la **même**
        // couche : deux choses différentes qui se dessinent pareil.
        return [...voilesEnCours(voiles, ecoule), ...feuEnCours(feu, ecoule)];
      },
      feu: (maintenantMs) => particulesDuFeu(feu, depuis(maintenantMs), coteM, vent, torches),
      marqueurs: calque.marqueurs,
      // On n'attend que si le temps **coule** : à l'arrêt il n'y a pas de semaine
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

  /**
   * Le contexte de la semaine **précédente**, pour avoir d'où l'on part.
   *
   * L'instantané ne porte que l'état d'**arrivée** — c'est la même inversion que
   * pour les morts et les gestes : la mise en scène remonte le temps au début
   * de la semaine et redescend.
   */
  const phenoPrecedent = useRef<ContextePhenologique | undefined>(undefined);
  const phenoCourant = useRef<ContextePhenologique | undefined>(undefined);

  /** Le temps d'écran d'une semaine : ce qu'on met à la traverser pour de vrai. */
  const semaineMs = enMarche ? 1000 / vitesse + noyau.attenteMs : 0;

  const saison = useMemo(() => {
    if (!snapshot) return () => undefined;
    // On décale d'un cran à chaque instantané. Dans le mémo et non dans un
    // effet, pour la raison déjà écrite plus haut : la boucle d'images peut
    // tourner avant qu'un effet ne soit appliqué.
    if (phenoCourant.current !== snapshot.pheno) {
      phenoPrecedent.current = phenoCourant.current;
      phenoCourant.current = snapshot.pheno;
    }
    const depart = phenoPrecedent.current;
    const arrivee = snapshot.pheno;
    // Première semaine d'une partie : rien à interpoler, l'instantané fait foi.
    if (!depart || semaineMs <= 0) return () => undefined;
    // Les essences présentes, une fois par instantané : à un instant donné,
    // deux hêtres portent la même feuille.
    const especes = [...new Set(snapshot.trees.map((t) => t.especeId))]
      .map((id) => ESPECES_V0.find((e) => e.id === id))
      .filter((e): e is EspeceV0 => e !== undefined);
    if (especes.length === 0) return () => undefined;
    return (maintenantMs: number): ReadonlyMap<string, SaisonDUneEssence> | undefined => {
      const t = Math.min(1, Math.max(0, (maintenantMs - debut.current) / semaineMs));
      // **Arrivé au bout, on ne remplace plus rien**, et ce n'est pas une
      // économie : à `t = 1` l'état de la semaine **est** celui de l'instantané.
      // Rendre la table quand même laisserait l'arbre sur la valeur du dernier
      // franchissement de palier — une grandeur que le moteur n'a jamais dite,
      // et que l'ombre portée lit.
      if (t >= 1) return undefined;
      const ctx = contextePhenologiqueFractionnaire(depart, arrivee, t);
      const par = new Map<string, SaisonDUneEssence>();
      for (const e of especes) {
        par.set(e.id, {
          partFoliaire: partFoliaireOmbrageanteDans(e, ctx),
          senescence: senescenceDans(e, ctx),
        });
      }
      return par;
    };
  }, [snapshot, semaineMs]);

  return useMemo(() => ({ ...noyau, saison }), [noyau, saison]);
}
