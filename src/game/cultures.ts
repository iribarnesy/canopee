/**
 * **Labourer, semer, moissonner** (#451) : les trois gestes du champ, ce qu'on
 * en dit au joueur avant le clic, et les lignes que le journal écrit après.
 *
 * Le moteur sait faire pousser une culture depuis #136 — `labourer` ouvre le
 * sol, `semer` pose une culture sur la place libre, `moissonner` vend le grain
 * et rend la paille au champ —, et le protocole acceptait déjà les trois
 * actions ; `prevoir` y répondait. **Aucun bouton ne les demandait** : le labour
 * n'apparaissait qu'au journal, le semis et la moisson nulle part côté jeu. Le
 * thème de la v0.6 — les dispositifs des essais du blé — commence par là :
 * préparer une parcelle, la semer, la récolter.
 *
 * **Rien de ce qui décide n'est écrit ici.** Les cultures sont celles du moteur
 * (`INDEX_CULTURES`), dans son ordre ; leurs semaines de semis et de moisson,
 * leur semence et leur prix sont ceux de leur fiche (`herbacees.ts`) ; la
 * fenêtre de semis est `FENETRE_SEMIS_SEMAINES`, et ce qui passe ou non se
 * demande à `prevoir`. Le grain d'une moisson se lit par `grainRecoltableT`, la
 * fonction même dont la moisson vend le résultat : aucun rendement n'est refait
 * à côté. Ce module ne choisit que ce que le moteur ne choisit pas — la façon
 * de le dire.
 */

import {
  COUT_ENGIN_EUR_M2,
  FENETRE_SEMIS_SEMAINES,
  type GameAction,
  LABOUR_ENFOUISSEMENT,
  LABOUR_EUR_M2,
  LABOUR_HAUTEUR_DETRUITE_M,
  LABOUR_PERTE_HUMUS,
  PLACE_MINIMALE_SEMIS,
} from "../engine/actions";
import { HERBACEES, type HerbaceeV0, INDEX_CULTURES, N_HERBACEES } from "../engine/herbacees";
import { SURVIE_APRES_LABOUR } from "../engine/mycorhizes";
import type { Zone } from "../engine/zone";
import { surface } from "./bilan";
import { eurosLus } from "./fertilisation";
import { auFilDuTexte, de, moisDeLaSemaine } from "./mots";
import type { ActionSansSemaine } from "./protocol";

/** Les trois gestes du champ, dans l'ordre où on les fait. */
export type GesteDuChamp = Extract<GameAction["type"], "labourer" | "semer" | "moissonner">;

/** L'ordre des boutons : on prépare le lit, on sème, on récolte. */
export const GESTES_DU_CHAMP: readonly GesteDuChamp[] = ["labourer", "semer", "moissonner"];

/** Le geste armé est-il un geste du champ ? */
export function estGesteDuChamp(mode: string): mode is GesteDuChamp {
  return (GESTES_DU_CHAMP as readonly string[]).includes(mode);
}

/** La fiche de culture d'une herbacée, telle que le moteur la déclare. */
type FicheDeCulture = NonNullable<HerbaceeV0["culture"]>;

/** Une culture que le moteur sait semer, et ce que le panneau en lit. */
export interface CultureDuMoteur {
  /** l'identifiant que `semer` attend (`cultureId`) */
  id: string;
  nom: string;
  nomLatin: string;
  /** la fiche du moteur, **elle-même** et non une copie : semaines, semence, prix */
  culture: FicheDeCulture;
}

/**
 * **Le catalogue des cultures, celui du moteur** : les herbacées qui portent une
 * fiche `culture`, dans l'ordre d'`INDEX_CULTURES`. Aucune liste n'est tenue
 * ici — le jour où le moteur apprend l'orge, le bouton apparaît.
 *
 * Aujourd'hui, une seule : le blé tendre d'hiver.
 */
export const CULTURES: readonly CultureDuMoteur[] = INDEX_CULTURES.flatMap((s) => {
  const h = HERBACEES[s];
  return h?.culture ? [{ id: h.id, nom: h.nom, nomLatin: h.nomLatin, culture: h.culture }] : [];
});

/** La culture que le panneau propose d'abord : la première du moteur. */
export const CULTURE_PAR_DEFAUT: string = CULTURES[0]?.id ?? "";

/** La culture du moteur qui porte cet identifiant, s'il en connaît une. */
export function cultureDuMoteur(id: string): CultureDuMoteur | undefined {
  return CULTURES.find((c) => c.id === id);
}

/**
 * L'action à envoyer. Les trois gestes demandent une zone — disque ou bande,
 * comme les autres gestes de zone (#205) — et le semis, sa culture.
 */
export function actionDuChamp(
  geste: GesteDuChamp,
  zone: Zone,
  cultureId: string,
): ActionSansSemaine {
  switch (geste) {
    case "labourer":
      return { type: "labourer", ...zone };
    case "semer":
      return { type: "semer", ...zone, cultureId };
    case "moissonner":
      return { type: "moissonner", ...zone };
  }
}

// ── **ce que le moteur dit des saisons** ───────────────────────────────────────

/** Une semaine ramenée dans l'année, 0 à 51 : celle que le moteur lit (`week % 52`). */
function dansLAnnee(semaine: number): number {
  return ((Math.round(semaine) % 52) + 52) % 52;
}

/** « semaine 41, en octobre » : le nombre du moteur, et le mois du bandeau. */
export function semaineDite(semaine: number): string {
  const s = dansLAnnee(semaine);
  return `semaine ${s}, en ${moisDeLaSemaine(s)}`;
}

/**
 * Les deux semaines extrêmes où le moteur accepte de semer cette culture, dans
 * l'année : `semisWeek ± FENETRE_SEMIS_SEMAINES`, bornes comprises — l'écart
 * que `applySemer` mesure passe par le plus court, d'une année à l'autre.
 *
 * Ce n'est pas une règle refaite : c'est la phrase de son propre refus
 * (« hors fenêtre de semis (semaine 41 ± 4) ») dite en semaines de début et de
 * fin, pour pouvoir la nommer en mois. L'essai éprouve les cinquante-deux
 * semaines contre `prevoirAction` : le jour où les deux divergent, il le dit.
 */
export function bornesDuSemis(c: CultureDuMoteur): { debut: number; fin: number } {
  const { semisWeek } = c.culture;
  return {
    debut: dansLAnnee(semisWeek - FENETRE_SEMIS_SEMAINES),
    fin: dansLAnnee(semisWeek + FENETRE_SEMIS_SEMAINES),
  };
}

/**
 * La fenêtre de semis telle que le moteur la publie, et en mois : « semaine
 * 41 ± 4, de septembre à novembre ». Le bandeau ne montre que le mois, et une
 * fenêtre en semaines seules ne se comparerait à rien.
 */
export function fenetreDeSemisDite(c: CultureDuMoteur): string {
  const { debut, fin } = bornesDuSemis(c);
  const premier = moisDeLaSemaine(debut);
  const dernier = moisDeLaSemaine(fin);
  const enMois = premier === dernier ? `en ${premier}` : `${de(premier)} à ${dernier}`;
  return `semaine ${c.culture.semisWeek} ± ${FENETRE_SEMIS_SEMAINES}, ${enMois}`;
}

/**
 * Ce que la fiche dit de la moisson : « semaine 28, en juillet ».
 *
 * **Une date, pas une fenêtre** : la fiche déclare `recolteWeek`, la date de sa
 * station de calage. Ce que `moissonner` lit, depuis #455, c'est la maturité de
 * la culture sur le calendrier de la parcelle, qui suit l'année et la station :
 * avant, il refuse (« … n'est pas mûr »). Le panneau ne dit donc pas « hors
 * saison » de lui-même : il montre la date de la fiche, au survol le grain que
 * la moisson emporterait là (`grainRecoltableT`), et le refus du moteur tel
 * quel quand il y en a un.
 */
export function moissonDite(c: CultureDuMoteur): string {
  return semaineDite(c.culture.recolteWeek);
}

// ── **ce que le panneau dit avant le clic** ────────────────────────────────────

/** Un nombre du moteur, à la française et sans zéro inutile : « 1,2 », « 200 ». */
const fr = (v: number) => v.toLocaleString("fr-FR", { maximumFractionDigits: 2 });

/** Une part ∈ [0,1], en pour cent entiers : « 95 % ». */
const pourCent = (v: number) => `${Math.round(v * 100)} %`;

/**
 * Ce que fait le labour, chiffré par les constantes du moteur
 * (`applyLabourer`) : son prix à l'hectare, puis ce qu'il coûte au sol. C'est
 * l'arbitrage du geste — le lit de semence contre l'humus et les mycorhizes —,
 * et le joueur doit le lire **avant** de cliquer.
 */
export const LABOUR_EXPLIQUE = `${fr(LABOUR_EUR_M2 * 10_000)} €/ha. La charrue enfouit l'herbe et ${pourCent(LABOUR_ENFOUISSEMENT)} de la litière : le sol est nu, prêt pour un semis. Elle brûle ${pourCent(LABOUR_PERTE_HUMUS)} de l'humus, dont l'azote est libéré, tranche les mycorhizes — ${pourCent(SURVIE_APRES_LABOUR)} en réchappent — et détruit tout plant de ${fr(LABOUR_HAUTEUR_DETRUITE_M)} m ou moins.`;

/** Le passage d'un engin à l'hectare, €, là où il entre — la constante du moteur. */
const ENGIN_EUR_HA = COUT_ENGIN_EUR_M2 * 10_000;

/**
 * Ce que coûte un semis et ce qu'il demande, pour la culture choisie : la
 * semence de sa fiche, l'engin, et **la place libre** — un semis ne pose que ce
 * que le tapis laisse, et sous `PLACE_MINIMALE_SEMIS` le moteur le refuse. Le
 * conseil est celui de son refus, mot pour mot : labourer ou faucher d'abord.
 */
export function semisExplique(c: CultureDuMoteur): string {
  return `Semence ${fr(c.culture.semenceEurHa)} €/ha, et ${fr(ENGIN_EUR_HA)} €/ha d'engin là où il passe. La culture ne prend que la place libre : sous ${pourCent(PLACE_MINIMALE_SEMIS)} de sol libre, le moteur refuse le semis — labourer ou faucher avant de semer.`;
}

/** Ce que la moisson vend et ce qu'elle laisse, pour une culture. */
export function moissonExpliquee(c: CultureDuMoteur): string {
  return `${c.nom} : moisson datée par sa fiche de la ${moissonDite(c)} ; le grain se vend ${fr(c.culture.prixEurT)} €/t.`;
}

/** Ce qui vaut pour toute moisson : l'engin, et la paille. */
export const MOISSON_EXPLIQUEE = `La moissonneuse coûte ${fr(ENGIN_EUR_HA)} €/ha là où elle passe ; la paille et le chaume restent au champ, en litière.`;

// ── **ce que le journal écrit après** ──────────────────────────────────────────

/**
 * Des heures telles qu'on les lit : en minutes sous l'heure — un disque de huit
 * mètres se laboure en deux minutes, et « 0.0 h » le disait gratuit —, en
 * heures au-delà.
 */
export function heuresLues(h: number): string {
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  return `${h.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} h`;
}

/**
 * Du grain tel qu'on le lit : en kilos sous la tonne — un disque de huit mètres
 * rend une soixantaine de kilos, et « 0,1 t » ne se lit pas —, en tonnes au-delà.
 */
export function grainLu(tonnes: number): string {
  if (tonnes < 1) return `${Math.round(tonnes * 1000)} kg`;
  return `${tonnes.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} t`;
}

/**
 * Y a-t-il de quoi dire un grain — au moins un kilo, ce que `grainLu` écrit ?
 * En dessous, « 0 kg de grain vendu » se lirait comme une erreur : un blé en
 * mars porte quelques dizaines de grammes sur un disque, et c'est « pas un
 * kilo » qu'il faut dire.
 */
export function auMoinsUnKilo(tonnes: number): boolean {
  return Math.round(tonnes * 1000) >= 1;
}

/**
 * La ligne du labour : « Labour : 208 m², 4,02 € (2 min) — le sol est nu,
 * l'azote est libéré ».
 *
 * `m2` est la surface **que le moteur a retournée** — les cellules de son geste
 * `labourer`, pas l'aire du disque demandé —, et `coutEur` ce que la trésorerie
 * a perdu. La fin de phrase est celle que le journal écrivait déjà.
 */
export function direLeLabour(m2: number, coutEur: number, heures: number): string {
  return `Labour : ${surface(m2)}, ${eurosLus(coutEur)} (${heuresLues(heures)}) — le sol est nu, l'azote est libéré`;
}

/**
 * La part de la place que la culture tient sur les cellules semées, ∈ [0,1] :
 * son emprise **telle que le moteur l'a posée**, en moyenne.
 *
 * C'est la règle du semis vue après coup, pas refaite : le moteur pose la place
 * que le tapis laisse (`applySemer`), et un blé semé une semaine après le
 * labour n'a déjà plus tout — l'herbe a repris. Le dire au semis évite de le
 * découvrir à la moisson.
 */
export function partDeLaPlace(
  herbeEmprise: ArrayLike<number>,
  cellules: readonly number[],
  cultureId: string,
): number {
  const s = HERBACEES.findIndex((h) => h.id === cultureId);
  if (s < 0 || cellules.length === 0) return 0;
  let somme = 0;
  for (const i of cellules) somme += herbeEmprise[i * N_HERBACEES + s] ?? 0;
  return somme / cellules.length;
}

/** Au-delà, la culture « a toute la place » : l'arrondi en dirait 100 %. */
const TOUTE_LA_PLACE = 0.995;

/**
 * La ligne du semis : « Semis de blé tendre d'hiver : 201 m², 4,22 € (2 min) —
 * il n'a que 88 % de la place, le tapis tient le reste ».
 *
 * La surface est celle que le moteur a semée (`cellulesDeLaZone`), le prix ce
 * que la trésorerie a perdu, la part de la place celle qu'il a posée.
 */
export function direLeSemis(
  cultureId: string,
  m2: number,
  coutEur: number,
  heures: number,
  part: number,
): string {
  const nom = auFilDuTexte(cultureDuMoteur(cultureId)?.nom ?? cultureId);
  const place =
    part >= TOUTE_LA_PLACE
      ? "il a toute la place"
      : `il n'a que ${pourCent(part)} de la place, le tapis tient le reste`;
  return `Semis ${de(nom)} : ${surface(m2)}, ${eurosLus(coutEur)} (${heuresLues(heures)}) — ${place}`;
}

/**
 * La ligne de la moisson : « Moisson : 63 kg de grain vendu, +10,18 € net de
 * la moissonneuse (1 min) — la paille reste au champ ».
 *
 * `tonnes` est ce que le moteur a vendu — `grainRecoltableT` sur la parcelle
 * d'avant le geste, la somme même que `moissonner` crédite —, et `dEur` le
 * mouvement de la trésorerie : la recette **moins** le passage d'engin, comme le
 * moteur le compte. Aucun rendement n'est refait ici.
 *
 * Une moisson acceptée sans même un kilo de grain — un blé fauché en mars — se
 * dit aussi : le moteur l'a faite, a fait payer l'engin, et la culture a
 * quitté le champ.
 */
export function direLaMoisson(tonnes: number, dEur: number, heures: number): string {
  const duree = heuresLues(heures);
  if (!auMoinsUnKilo(tonnes)) {
    return `Moisson : pas un kilo de grain à vendre, ${eurosLus(dEur)} de moissonneuse (${duree}) — la culture a quitté le champ`;
  }
  // « vendu » s'accorde au grain, pas à l'unité : « 63 kg de grain vendu »,
  // « 1,4 t de grain vendu » — rien à accorder au compte.
  const signe = dEur >= 0 ? "+" : "−";
  return `Moisson : ${grainLu(tonnes)} de grain vendu, ${signe}${eurosLus(dEur)} net de la moissonneuse (${duree}) — la paille reste au champ`;
}
