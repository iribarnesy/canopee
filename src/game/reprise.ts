/**
 * **Reprendre une partie sans la rejouer** (#338).
 *
 * Une sauvegarde est un journal : la graine, les réglages, les actions datées.
 * La reprendre, c'était la **rejouer** semaine après semaine, et mesuré à la
 * recette v0.4 sous Node, une partie de vingt ans s'est fait attendre de 35 s
 * (friche de 50 m) à 276 s (lande sèche de 100 m). Le moteur savait pourtant
 * déjà écrire son état et le relire à l'identique (`serialisation.ts`, #193) ;
 * personne ne s'en servait.
 *
 * Ce module fabrique le **bloc de reprise** : l'état du moteur, plus ce que le
 * worker tient à côté de lui et que seul le rejeu savait refaire — le cumul
 * du niveau (#188), le bilan de la partie (#128), l'histoire de chaque arbre
 * et ce qu'on en a déjà dit (#225), les grandeurs du dernier tick que le
 * premier instantané affiche. La reprise repart de ce bloc s'il se relit, et
 * rejoue le journal sinon. **Le journal reste la vérité de secours** : rien ne
 * s'y retire, et un bloc absent, périmé, tronqué ou d'un format ancien n'est
 * qu'une reprise plus lente.
 *
 * ── **à quel instant le bloc saisit la partie** ───────────────────────────────────
 *
 * À l'**ouverture** de la semaine en cours, avant le moindre geste qu'on y a
 * posé : l'état tel que le dernier tick l'a rendu, et les cumuls tels qu'ils
 * étaient à cet instant. La reprise rouvre alors la semaine et y rejoue ses
 * gestes depuis le journal, exactement comme le fait le rejeu en arrivant au
 * bout (#336). Deux raisons à ce choix, et la seconde décide :
 *
 *  - les deux voies se rejoignent pour la fin, donc elles ne peuvent pas
 *    diverger sur la semaine ouverte ;
 *  - le bloc ne dépend pas de ce qu'on fait **pendant** la semaine. L'interface
 *    demande une sauvegarde après chaque geste (`useGame.ts`, `dispatch`) ;
 *    un bloc qui suivrait les gestes se réécrirait à chaque clic. Celui-ci se
 *    calcule une fois par semaine de jeu, au plus.
 *
 * ── **ce qui lie un bloc à sa sauvegarde** ───────────────────────────────────────
 *
 * Le bloc est rangé à part (IndexedDB, `blocs.ts`), la sauvegarde dans
 * `localStorage`. Les deux écritures peuvent donc se désaccorder : un quota
 * atteint d'un côté seulement, un onglet fermé entre les deux. Le bloc porte
 * de quoi le reconnaître — la semaine, une empreinte des réglages et des
 * actions des semaines **closes** (celles de la semaine ouverte sont rejouées
 * depuis la sauvegarde elle-même), et l'empreinte de l'état (`stateHash`).
 * Si l'une ne colle pas, le bloc est ignoré et le journal reprend la main.
 *
 * ── **pourquoi pas dans localStorage** — **mesuré** ──────────────────────────────
 *
 * `localStorage` tient environ cinq mégaoctets pour tout le site, et ne range
 * que du texte. Mesuré sur la sonde de la recette (#338), en fin de partie :
 *
 *     partie                         bloc brut   gzip     en base64
 *     friche, 50 m, 30 ans             2,1 Mo    0,72 Mo    0,96 Mo
 *     lande sèche, 100 m, 40 ans      10,9 Mo    3,7 Mo     4,9 Mo
 *
 * Une seule lande de quarante ans remplirait le quota, et la liste en garde
 * huit. IndexedDB range des octets tels quels et n'a pas ce plafond.
 */

import type { FrequentationDeGuilde } from "../engine/oiseaux";
import { ecrireEtat, lireEtat } from "../engine/serialisation";
import type { GameState, Station, TickFluxes } from "../engine/state";
import { stateHash } from "../engine/tick";
import type { Bilan, LigneDeBilan } from "./bilan";
import type { Cumuls } from "./niveaux";
import type { SaveGame } from "./protocol";
import type { EtatVu, LigneDeSuivi, MemoireDesSuivis } from "./suivis";

/**
 * Le nombre magique en tête de bloc. Celui du moteur finit par un zéro
 * (`serialisation.ts`) ; celui-ci par un un, pour qu'on ne prenne jamais l'un
 * pour l'autre.
 */
const MAGIE = "CANOPEE\u0001";

/**
 * La version de **ce** conteneur, pas celle du moteur.
 *
 * Le bloc du moteur qu'il emporte a sa propre version (`VERSION_FORMAT`), que
 * `lireEtat` vérifie : quand le moteur change de format, ce conteneur-ci ne
 * bouge pas, et l'ancien bloc est refusé là-bas. Celle-ci ne monte que si ce
 * que le worker range à côté de l'état change de forme.
 */
export const VERSION_REPRISE = 1;

/** Ce que le worker tient à côté de l'état, et que le rejeu refaisait. */
export interface AnnexesDeReprise {
  cumuls: Cumuls;
  bilan: Bilan;
  histoires: Map<number, LigneDeSuivi[]>;
  memoire: MemoireDesSuivis;
  /** grandeurs du dernier tick : elles ne sont pas dans l'état (`tick.ts`) */
  fluxes?: TickFluxes;
  debordement?: Float32Array;
  lumiereAuSol?: Float32Array;
  pollinisateurs?: Float32Array;
  oiseauxDePassage?: readonly FrequentationDeGuilde[];
}

/** Les grilles du dernier tick, rangées en binaire : en JSON, un flottant en coûterait cinq. */
const GRILLES = ["debordement", "lumiereAuSol", "pollinisateurs"] as const;

interface Entete {
  v: number;
  /** la semaine ouverte au moment de la sauvegarde */
  semaine: number;
  /** `empreinteDeLaPartie` : les réglages et les actions des semaines closes */
  partie: number;
  /** `stateHash` de l'état emporté */
  etat: number;
  cumuls: Cumuls;
  bilan: [string, LigneDeBilan][];
  histoires: HistoiresSerrees;
  memoire: [number, EtatVu][];
  fluxes?: TickFluxes;
  oiseaux?: readonly FrequentationDeGuilde[];
  /** les morceaux binaires qui suivent l'en-tête, dans l'ordre, en octets */
  sections: { nom: string; n: number }[];
}

/**
 * **L'histoire des arbres, serrée.** C'est, de loin, ce que le worker tient de
 * plus gros à côté de l'état : sur une lande sèche de quarante ans (sonde de la
 * recette, #338), 86 248 lignes pour 10 171 arbres ayant vécu, 9,4 Mo en JSON
 * objet par objet — autant que l'état du moteur tout entier, 9,0 Mo. Serrée,
 * elle tient dans 1,4 Mo environ (déduit du bloc de 10,9 Mo, état compris).
 * Chaque ligne y répète ses six noms de champ,
 * l'identifiant de l'arbre que la clé porte déjà, et sa phrase, alors qu'il n'y
 * a que quelques dizaines de phrases différentes.
 *
 * Serrée, une ligne tient en quatre nombres : la semaine, le rang de sa phrase
 * dans `phrases`, le compte, la première semaine. Rien ne se perd : l'arbre est
 * la clé (`ecrireDansLHistoire` range chaque ligne sous son propre arbre), et la
 * ligne se rebâtit champ par champ dans l'ordre où le worker l'écrit.
 */
interface HistoiresSerrees {
  /** les couples [rubrique, phrase], dans l'ordre où on les rencontre */
  phrases: [string, string][];
  arbres: [number, [number, number, number, number][]][];
}

function serrerLesHistoires(histoires: Map<number, LigneDeSuivi[]>): HistoiresSerrees {
  const phrases: [string, string][] = [];
  const rang = new Map<string, number>();
  const arbres: HistoiresSerrees["arbres"] = [];
  for (const [id, lignes] of histoires) {
    arbres.push([
      id,
      lignes.map((l) => {
        const cle = `${l.quoi}\u0000${l.texte}`;
        let r = rang.get(cle);
        if (r === undefined) {
          r = phrases.length;
          rang.set(cle, r);
          phrases.push([l.quoi, l.texte]);
        }
        return [l.semaine, r, l.fois, l.depuisSemaine];
      }),
    ]);
  }
  return { phrases, arbres };
}

function desserrerLesHistoires(s: HistoiresSerrees): Map<number, LigneDeSuivi[]> | undefined {
  if (!Array.isArray(s?.phrases) || !Array.isArray(s.arbres)) return undefined;
  const histoires = new Map<number, LigneDeSuivi[]>();
  for (const [idArbre, lignes] of s.arbres) {
    const rebaties: LigneDeSuivi[] = [];
    for (const [semaine, r, fois, depuisSemaine] of lignes) {
      const phrase = s.phrases[r];
      if (!phrase) return undefined;
      const [quoi, texte] = phrase;
      rebaties.push({
        semaine,
        idArbre,
        quoi: quoi as LigneDeSuivi["quoi"],
        texte,
        fois,
        depuisSemaine,
      });
    }
    histoires.set(idArbre, rebaties);
  }
  return histoires;
}

/** FNV-1a sur 32 bits, le même que `stateHash`. */
function fnv1a(texte: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < texte.length; i++) {
    hash ^= texte.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Ce qui fait **cette** partie jusqu'à l'ouverture de la semaine `semaine` :
 * ses réglages, et les actions des semaines déjà closes.
 *
 * Calculée sur la sauvegarde elle-même, des deux côtés — à l'écriture sur
 * celle que le worker envoie, à la lecture sur celle que `localStorage` rend.
 * Le passage par le JSON ne la change pas : `JSON.stringify` d'un objet relu
 * rend la chaîne d'où il a été lu.
 */
export function empreinteDeLaPartie(save: SaveGame, semaine: number): number {
  const reglages = [
    save.stationId,
    save.seed,
    save.meteo,
    save.scenario,
    save.paysageId,
    save.bordures,
    save.relief,
    save.eau,
    save.nappeCm,
    save.partBassin,
    save.maturationAns ?? 0,
    save.economie ?? true,
    save.faune ?? false,
    save.anneeDepart,
  ];
  const closes = save.actions.filter((a) => a.week < semaine);
  return fnv1a(JSON.stringify([reglages, closes]));
}

/** Arrondit au multiple de huit : un `Float64Array` ne se pose que là. */
const aligne = (n: number) => Math.ceil(n / 8) * 8;

/**
 * Écrit le bloc de reprise.
 *
 * `etat` est l'état **avant** l'ouverture de la semaine — celui que le dernier
 * tick a rendu, que `beginWeek` n'a pas encore touché. `beginWeek` paie les
 * salaires : l'appliquer deux fois les paierait deux fois.
 */
export function ecrireReprise(
  etat: GameState,
  annexes: AnnexesDeReprise,
  partie: number,
): Uint8Array {
  const sections: { nom: string; octets: Uint8Array }[] = [
    { nom: "etat", octets: ecrireEtat(etat) },
  ];
  for (const nom of GRILLES) {
    const grille = annexes[nom];
    if (grille)
      sections.push({
        nom,
        octets: new Uint8Array(grille.buffer, grille.byteOffset, grille.byteLength),
      });
  }
  const entete: Entete = {
    v: VERSION_REPRISE,
    semaine: etat.week,
    partie,
    etat: stateHash(etat),
    cumuls: annexes.cumuls,
    bilan: [...annexes.bilan],
    histoires: serrerLesHistoires(annexes.histoires),
    memoire: [...annexes.memoire],
    ...(annexes.fluxes ? { fluxes: annexes.fluxes } : {}),
    ...(annexes.oiseauxDePassage ? { oiseaux: annexes.oiseauxDePassage } : {}),
    sections: sections.map(({ nom, octets }) => ({ nom, n: octets.length })),
  };
  const enteteOctets = new TextEncoder().encode(JSON.stringify(entete));

  let taille = aligne(MAGIE.length + 6 + enteteOctets.length);
  for (const { octets } of sections) taille += aligne(octets.length);
  const bloc = new Uint8Array(taille);
  const vue = new DataView(bloc.buffer);
  for (let i = 0; i < MAGIE.length; i++) bloc[i] = MAGIE.charCodeAt(i);
  vue.setUint16(MAGIE.length, VERSION_REPRISE);
  vue.setUint32(MAGIE.length + 2, enteteOctets.length);
  bloc.set(enteteOctets, MAGIE.length + 6);
  // Chaque section commence sur un multiple de huit : le bloc du moteur pose
  // ses grilles en float64 sans recopie quand il est aligné (`lireEtat`).
  let k = aligne(MAGIE.length + 6 + enteteOctets.length);
  for (const { octets } of sections) {
    bloc.set(octets, k);
    k += aligne(octets.length);
  }
  return bloc;
}

/**
 * Relit un bloc de reprise pour **cette** sauvegarde — ou rend `undefined`, et
 * la reprise rejoue le journal.
 *
 * Aucune exception ne sort d'ici : un bloc illisible est un résultat, pas une
 * panne. Le refuser coûte un rejeu ; le relire de travers coûterait la partie.
 */
export function lireReprise(
  octets: Uint8Array,
  save: SaveGame,
  station: Station,
): { etat: GameState; annexes: AnnexesDeReprise } | undefined {
  try {
    if (octets.length < MAGIE.length + 6) return undefined;
    for (let i = 0; i < MAGIE.length; i++) {
      if (octets[i] !== MAGIE.charCodeAt(i)) return undefined;
    }
    const vue = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
    if (vue.getUint16(MAGIE.length) !== VERSION_REPRISE) return undefined;
    const longueur = vue.getUint32(MAGIE.length + 2);
    if (MAGIE.length + 6 + longueur > octets.length) return undefined;
    const entete = JSON.parse(
      new TextDecoder().decode(octets.subarray(MAGIE.length + 6, MAGIE.length + 6 + longueur)),
    ) as Entete;
    if (entete.v !== VERSION_REPRISE || !Array.isArray(entete.sections)) return undefined;
    // **La bonne partie, à la bonne semaine.** Un bloc d'un autosave plus ancien
    // que la sauvegarde — l'écriture d'IndexedDB a échoué, pas celle de
    // `localStorage` — se reconnaît ici, et on rejoue plutôt que de reprendre
    // une partie qui aurait perdu ses dernières semaines.
    if (entete.semaine !== save.weeks) return undefined;
    if (entete.partie !== empreinteDeLaPartie(save, save.weeks)) return undefined;

    const morceaux = new Map<string, Uint8Array>();
    let k = aligne(MAGIE.length + 6 + longueur);
    for (const { nom, n } of entete.sections) {
      if (typeof nom !== "string" || !Number.isInteger(n) || n < 0) return undefined;
      if (k + n > octets.length) return undefined;
      morceaux.set(nom, octets.subarray(k, k + n));
      k += aligne(n);
    }
    const moteur = morceaux.get("etat");
    if (!moteur) return undefined;
    const etat = lireEtat(moteur, station);
    if (!etat || etat.week !== entete.semaine || stateHash(etat) !== entete.etat) return undefined;

    const grilles: Partial<Record<(typeof GRILLES)[number], Float32Array>> = {};
    for (const nom of GRILLES) {
      const m = morceaux.get(nom);
      if (!m) continue;
      if (m.length % 4 !== 0) return undefined;
      // Recopiée : la section n'est pas forcément posée sur un multiple de quatre
      // dans le tampon qu'on a reçu.
      grilles[nom] = new Float32Array(m.slice().buffer);
    }
    const histoires = desserrerLesHistoires(entete.histoires);
    if (
      typeof entete.cumuls !== "object" ||
      !Array.isArray(entete.bilan) ||
      !histoires ||
      !Array.isArray(entete.memoire)
    )
      return undefined;
    return {
      etat,
      annexes: {
        cumuls: entete.cumuls,
        bilan: new Map(entete.bilan),
        histoires,
        memoire: new Map(entete.memoire),
        ...(entete.fluxes ? { fluxes: entete.fluxes } : {}),
        ...(entete.oiseaux ? { oiseauxDePassage: entete.oiseaux } : {}),
        ...grilles,
      },
    };
  } catch {
    return undefined;
  }
}
