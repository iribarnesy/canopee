/**
 * SÉRIALISER L'ÉTAT DU MOTEUR (issue #193).
 *
 * Jusqu'ici, une sauvegarde de Canopée est un JOURNAL : la station, la graine,
 * les actions datées, et le nombre de semaines. Charger une partie, c'est la
 * REJOUER depuis le premier tick (`game.ts:runJournal`). C'est élégant, c'est
 * compact, et ça repose sur une hypothèse que le moteur ne tient pas :
 *
 * > **que rejouer la même partie donne la même partie.**
 *
 * Mesuré en marge de #186, la même partie sur le même commit :
 *
 *     Node 20 (V8 11.3), Node 22 (V8 12.4)   empreinte 3 806 937 118
 *     Node 24 (V8 13.6)                      empreinte   633 354 304
 *
 * Les `Math.*` transcendantes ne sont pas spécifiées au bit près par
 * ECMAScript, et V8 en a changé l'implémentation. Un joueur qui change de
 * navigateur — ou dont le navigateur se met à jour — ne rejoue donc pas tout à
 * fait sa partie : un tirage bascule de l'autre côté d'un seuil, un arbre meurt
 * qui vivait, et les trajectoires s'écartent pour de bon. Ce n'est pas une
 * perte de réalisme (les 1 663 essais sont verts des deux côtés) ; c'est une
 * perte de la PARTIE DU JOUEUR, ce qui est pire.
 *
 * ── CE QUE CE MODULE FAIT ────────────────────────────────────────────────────
 *
 * Il écrit l'état complet du moteur dans un bloc d'octets, et il le relit à
 * l'identique. Pas « à peu près » : le `stateHash` d'un état relu est celui de
 * l'état écrit, et une partie reprise depuis un bloc continue exactement comme
 * la partie qui ne s'est jamais arrêtée. C'est ce que l'essai exige.
 *
 * **Ça ne remplace pas le journal, ça le double.** Le journal reste la mémoire
 * de ce que le joueur a FAIT — les niveaux le lisent, les statistiques aussi —
 * et il reste le seul recours quand le format d'état a changé. D'où la règle
 * d'usage : *charger l'état s'il se lit, rejouer le journal sinon.* Une version
 * inconnue, une liste de champs qui a bougé, un bloc tronqué : `lireEtat` rend
 * `undefined` plutôt que d'inventer, et l'appelant retombe sur le rejeu.
 *
 * ── POURQUOI CE FORMAT-LÀ ────────────────────────────────────────────────────
 *
 * Un état est fait de deux matières très différentes :
 *
 *  - des GRILLES de sol — une trentaine de tableaux d'un nombre par cellule.
 *    C'est 99 % du volume. En JSON, un flottant coûte une vingtaine de
 *    caractères pour huit octets d'information : une parcelle d'un hectare
 *    pèse 5 Mo, soit le quota entier de `localStorage`. En float64 brut, elle
 *    pèse 2,5 Mo, et gzip la ramène très bas parce que les cellules se
 *    ressemblent ;
 *  - tout le RESTE — les arbres, l'économie, le carbone, la banque de graines,
 *    l'état du tirage, la faune. Quelques dizaines de kilo-octets, une
 *    structure irrégulière, des chaînes de caractères. Le JSON y est le bon
 *    outil, et **il est exact** : `JSON.stringify` d'un flottant rend la plus
 *    courte écriture qui se relit à l'identique.
 *
 * D'où un bloc en deux parties : un en-tête JSON, puis les grilles en float64.
 * Et l'en-tête DÉCLARE les grilles qu'il porte, nom par nom et longueur par
 * longueur. `lireEtat` compare cette liste à celle qu'un sol NEUF de la version
 * courante produit : un champ ajouté depuis, une parcelle d'une autre taille, et
 * le bloc est refusé au lieu d'être relu de travers.
 *
 * ── CE QUE ÇA PÈSE, MESURÉ ───────────────────────────────────────────────────
 *
 *     parcelle              valeurs de grille   float64   gzip -9
 *     0,09 ha (30 m), 5 ans        42 300        0,32 Mo     79 Ko
 *     1 ha (100 m), 5 ans         470 000        3,59 Mo    796 Ko
 *     1 ha (100 m), 40 ans        470 000        3,59 Mo   1 370 Ko
 *     4 ha (200 m), 40 ans      1 880 000       14,34 Mo   5 425 Ko
 *
 * Le même état en JSON pèse 5 Mo pour l'hectare et 21 Mo pour les quatre : le
 * format binaire n'est pas une optimisation, c'est ce qui rend la chose
 * possible. Gzip fait le reste, et il fait d'autant mieux que la parcelle est
 * jeune — les cellules se ressemblent encore.
 *
 * **Conséquence pour la couche jeu** : au-delà d'une petite parcelle, ça ne
 * tient pas dans `localStorage` (cinq mégaoctets pour toutes les parties
 * réunies, et le base64 ajoute un tiers). IndexedDB range des octets tels
 * quels et n'a pas ce plafond. Le journal, lui, reste minuscule et peut rester
 * où il est.
 *
 * ── CE QUE CE MODULE NE FAIT PAS ─────────────────────────────────────────────
 *
 * Il ne RANGE rien. Où le bloc est stocké — `localStorage`, IndexedDB, un
 * fichier — et s'il est compressé au passage ne le regarde pas : c'est la
 * couche jeu qui décide, et c'est elle qui connaît les quotas du navigateur.
 * Le moteur rend des octets.
 *
 * Il ne sérialise pas la STATION non plus, et c'est volontaire : elle est une
 * donnée de configuration, la sauvegarde la porte déjà sous forme
 * d'identifiant et de réglages, et la recopier dans chaque bloc en ferait une
 * seconde source de vérité qui dériverait le jour où une station est corrigée.
 * `lireEtat` la reçoit donc de l'appelant.
 */

import { rngStateFromSeed } from "./rng";
import { createGameState, type GameState, type SoilState, type Station } from "./state";

/** Le nombre magique en tête de bloc — de quoi reconnaître un état d'un autre fichier. */
const MAGIE = "CANOPEE\u0000";

/**
 * La version du FORMAT, pas celle du jeu.
 *
 * Elle ne monte que si la disposition du bloc change. Un changement de la
 * forme de l'état — un champ de sol ajouté, un champ d'arbre retiré — n'a pas
 * besoin d'elle : l'en-tête déclare ses grilles, et le reste est du JSON qui se
 * relit tel quel.
 *
 * **2 (issue #203)** : les grilles du sol sont des tableaux TYPÉS, et l'en-tête
 * déclare désormais la précision de chacune. Un bloc de version 1 porte des
 * grilles qui étaient toutes en double précision ; les relire dans un
 * `Float32Array` les tronquerait, donc l'état relu ne serait plus indiscernable
 * de l'état écrit. On refuse, et le journal reprend la main — c'est exactement
 * ce pour quoi cette version existe.
 */
export const VERSION_FORMAT = 2;

/** Une grille de sol, telle que l'en-tête la déclare. */
interface GrilleDeclaree {
  /** `mineralNG`, ou `mycorhizes.ectomycorhizien` pour un sous-objet */
  nom: string;
  n: number;
  /**
   * `b` pour un tableau de booléens, `f32` pour une grille en simple précision,
   * absent pour une grille en double précision (#203).
   *
   * **La précision est DÉCLARÉE et non devinée**, pour la même raison que les
   * noms et les longueurs le sont : le lecteur doit reconstruire le conteneur
   * que le moteur attend, et non celui qu'il croit deviner. Les VALEURS, elles,
   * restent écrites en float64 quelle que soit la grille — un nombre issu d'un
   * `Float32Array` est exactement représentable en double, donc l'aller-retour
   * est exact, et le bloc garde un pas d'alignement unique.
   */
  type?: "b" | "f32";
}

/**
 * Est-ce une grille ? Un tableau simple ou un tableau TYPÉ.
 *
 * `Array.isArray` rend **faux** sur un `Float32Array`, et c'est le piège que ce
 * lot a failli poser : un champ converti aurait disparu du bloc écrit ET de la
 * liste attendue à la relecture, si bien que les deux côtés se seraient
 * accordés sur un état amputé au lieu de le refuser. Le contrôle de l'en-tête
 * ne l'aurait pas vu, puisqu'il compare deux listes produites par ce même test.
 */
function estGrille(v: unknown): v is ArrayLike<number> | boolean[] {
  return Array.isArray(v) || ArrayBuffer.isView(v);
}

/** La précision d'une grille, telle qu'elle se déclare dans l'en-tête. */
function typeDeGrille(tableau: ArrayLike<number> | boolean[]): "b" | "f32" | undefined {
  if (tableau instanceof Float32Array) return "f32";
  if (Array.isArray(tableau) && tableau.length > 0 && typeof tableau[0] === "boolean") return "b";
  return undefined;
}

/**
 * Les tableaux de sol, à plat et dans un ordre STABLE.
 *
 * Trouvés par parcours plutôt que listés à la main : une liste écrite en dur
 * serait une seconde copie de `SoilState`, et le jour où un lot y ajoute un
 * champ, la copie serait muette au lieu d'être fausse — donc pire. Le tri par
 * nom rend l'ordre indépendant de celui des déclarations.
 */
function grillesDuSol(soil: SoilState): { nom: string; tableau: ArrayLike<number> | boolean[] }[] {
  const out: { nom: string; tableau: ArrayLike<number> | boolean[] }[] = [];
  for (const [cle, valeur] of Object.entries(soil)) {
    if (estGrille(valeur)) {
      out.push({ nom: cle, tableau: valeur });
    } else if (valeur !== null && typeof valeur === "object") {
      for (const [sousCle, sousValeur] of Object.entries(valeur)) {
        if (estGrille(sousValeur)) out.push({ nom: `${cle}.${sousCle}`, tableau: sousValeur });
      }
    }
  }
  out.sort((a, b) => (a.nom < b.nom ? -1 : a.nom > b.nom ? 1 : 0));
  return out;
}

/** Ce que l'en-tête porte : tout l'état SAUF les grilles et la station. */
interface Entete {
  v: number;
  /** le sol privé de ses grilles — il n'y reste que les scalaires */
  sol: Record<string, unknown>;
  grilles: GrilleDeclaree[];
  /** tout le reste de `GameState`, tel quel */
  reste: Record<string, unknown>;
  /**
   * L'ordre des clés de `GameState`, tel qu'il était.
   *
   * Cosmétique et pourtant nécessaire : sans lui, l'état relu porte les mêmes
   * valeurs mais rangées autrement, donc son `JSON.stringify` diffère. On
   * perdrait le contrôle le plus simple qui soit — *l'état relu est-il
   * indiscernable de l'état écrit ?* — pour économiser trente octets. Il porte
   * aussi les champs FACULTATIFS (`faune`, `nextFauneId`), qu'un état neuf
   * n'aurait pas permis de retrouver.
   */
  ordre: string[];
}

/**
 * Écrit l'état dans un bloc d'octets.
 *
 * Le bloc se lit ainsi : la magie, la version sur deux octets, la longueur de
 * l'en-tête sur quatre, l'en-tête en UTF-8, puis les grilles en float64 les
 * unes derrière les autres, dans l'ordre que l'en-tête déclare.
 */
export function ecrireEtat(state: GameState): Uint8Array {
  const grilles = grillesDuSol(state.soil);

  // **LE SQUELETTE DU SOL** : sa forme exacte, grilles remplacées par `null`.
  // Garder les clés plutôt que les retirer n'est pas de la décoration — c'est ce
  // qui porte l'ORDRE, et l'ordre n'est pas connu d'avance : le sol que rend un
  // tick ne range pas ses champs comme celui que rend `createGameState`. Sans
  // le squelette, un état relu porterait les mêmes valeurs rangées autrement, et
  // on perdrait le contrôle le plus simple qui soit — *l'état relu est-il
  // indiscernable de l'état écrit ?*
  const sol: Record<string, unknown> = {};
  for (const [cle, valeur] of Object.entries(state.soil)) {
    if (estGrille(valeur)) {
      sol[cle] = null;
    } else if (valeur !== null && typeof valeur === "object") {
      const reduit: Record<string, unknown> = {};
      for (const [sousCle, sousValeur] of Object.entries(valeur)) {
        reduit[sousCle] = estGrille(sousValeur) ? null : sousValeur;
      }
      sol[cle] = reduit;
    } else {
      sol[cle] = valeur;
    }
  }

  const { soil: _soil, station: _station, ...reste } = state;

  const entete: Entete = {
    v: VERSION_FORMAT,
    sol,
    grilles: grilles.map(({ nom, tableau }) => {
      const type = typeDeGrille(tableau);
      return type === undefined ? { nom, n: tableau.length } : { nom, n: tableau.length, type };
    }),
    reste: reste as unknown as Record<string, unknown>,
    ordre: Object.keys(state),
  };

  const enteteOctets = new TextEncoder().encode(JSON.stringify(entete));
  const nValeurs = grilles.reduce((total, g) => total + g.tableau.length, 0);

  const debutGrilles = MAGIE.length + 2 + 4 + enteteOctets.length;
  // Les float64 doivent tomber sur un multiple de huit, sinon `DataView` peut
  // lire mais `Float64Array` ne peut pas se poser dessus. On complète.
  const bourrage = (8 - (debutGrilles % 8)) % 8;
  const octets = new Uint8Array(debutGrilles + bourrage + nValeurs * 8);
  const vue = new DataView(octets.buffer);

  for (let i = 0; i < MAGIE.length; i++) octets[i] = MAGIE.charCodeAt(i);
  vue.setUint16(MAGIE.length, VERSION_FORMAT);
  vue.setUint32(MAGIE.length + 2, enteteOctets.length);
  octets.set(enteteOctets, MAGIE.length + 6);

  const valeurs = new Float64Array(octets.buffer, debutGrilles + bourrage, nValeurs);
  let k = 0;
  for (const { tableau } of grilles) {
    for (let i = 0; i < tableau.length; i++) {
      const v = tableau[i];
      valeurs[k++] = typeof v === "boolean" ? (v ? 1 : 0) : ((v as number) ?? 0);
    }
  }
  return octets;
}

/**
 * Relit un état — ou rend `undefined`, et l'appelant rejoue le journal.
 *
 * **Rendre `undefined` est un résultat, pas un échec à cacher.** Le journal
 * existe pour ça : une partie ne se perd pas parce que le format a bougé. Les
 * cas de refus sont tous des « je ne sais pas lire ça », jamais des « je vais
 * essayer quand même » — un état relu de travers serait bien pire qu'un rejeu.
 */
export function lireEtat(octets: Uint8Array, station: Station): GameState | undefined {
  if (octets.length < MAGIE.length + 6) return undefined;
  for (let i = 0; i < MAGIE.length; i++) {
    if (octets[i] !== MAGIE.charCodeAt(i)) return undefined;
  }
  const vue = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
  if (vue.getUint16(MAGIE.length) !== VERSION_FORMAT) return undefined;

  const longueurEntete = vue.getUint32(MAGIE.length + 2);
  const debutEntete = MAGIE.length + 6;
  if (debutEntete + longueurEntete > octets.length) return undefined;

  let entete: Entete;
  try {
    entete = JSON.parse(
      new TextDecoder().decode(octets.subarray(debutEntete, debutEntete + longueurEntete)),
    ) as Entete;
  } catch {
    return undefined;
  }
  if (!Array.isArray(entete.grilles) || typeof entete.reste !== "object") return undefined;

  // **LE CONTRÔLE QUI ÉVITE DE RELIRE DE TRAVERS.** Un bloc écrit par une
  // version du moteur dont le sol n'avait pas les mêmes champs se reconstruirait
  // en un état incomplet — un tableau manquant, et le premier tick lit
  // `undefined`. Plutôt que de le découvrir en jeu, on compare la liste
  // déclarée à celle qu'un sol NEUF de cette version produit. Les longueurs
  // aussi : une parcelle de 30 m ne se relit pas sur une station de 100.
  const solDeCetteVersion = createGameState(station, rngStateFromSeed(1)).soil;
  const attendues = grillesDuSol(solDeCetteVersion).map(
    (g) => `${g.nom}:${g.tableau.length}:${typeDeGrille(g.tableau) ?? "f64"}`,
  );
  const trouvees = entete.grilles.map((g) => `${g.nom}:${g.n}:${g.type ?? "f64"}`);
  if (attendues.length !== trouvees.length) return undefined;
  for (let i = 0; i < attendues.length; i++) {
    if (attendues[i] !== trouvees[i]) return undefined;
  }

  const debutGrilles = debutEntete + longueurEntete;
  const bourrage = (8 - (debutGrilles % 8)) % 8;
  const nValeurs = entete.grilles.reduce((total, g) => total + g.n, 0);
  if (debutGrilles + bourrage + nValeurs * 8 > octets.length) return undefined;

  // `Float64Array` exige que son décalage soit un multiple de huit DANS SON
  // TAMPON. Un bloc reçu par tranches peut ne pas l'être ; on recopie alors.
  const depart = octets.byteOffset + debutGrilles + bourrage;
  const valeurs =
    depart % 8 === 0
      ? new Float64Array(octets.buffer, depart, nValeurs)
      : new Float64Array(
          octets.slice(debutGrilles + bourrage, debutGrilles + bourrage + nValeurs * 8).buffer,
        );

  const lus: Record<string, unknown> = {};
  let k = 0;
  for (const g of entete.grilles) {
    if (g.type === "b") {
      const tableau: boolean[] = new Array(g.n);
      for (let i = 0; i < g.n; i++) tableau[i] = (valeurs[k++] ?? 0) !== 0;
      lus[g.nom] = tableau;
      continue;
    }
    // Le conteneur est celui que l'en-tête déclare, pas celui qu'on devine.
    const tableau = g.type === "f32" ? new Float32Array(g.n) : new Float64Array(g.n);
    for (let i = 0; i < g.n; i++) tableau[i] = valeurs[k++] ?? 0;
    lus[g.nom] = tableau;
  }

  // On rebâtit le sol EN MARCHANT SON SQUELETTE : les clés y sont dans l'ordre
  // qu'elles avaient, et chaque `null` marque la place d'une grille.
  const soil: Record<string, unknown> = {};
  for (const [cle, valeur] of Object.entries(entete.sol)) {
    if (cle in lus) {
      soil[cle] = lus[cle];
    } else if (valeur !== null && typeof valeur === "object") {
      const objet: Record<string, unknown> = {};
      for (const [sousCle, sousValeur] of Object.entries(valeur)) {
        const nom = `${cle}.${sousCle}`;
        objet[sousCle] = nom in lus ? lus[nom] : sousValeur;
      }
      soil[cle] = objet;
    } else {
      soil[cle] = valeur;
    }
  }

  // Rebâti dans l'ordre d'origine, pour la même raison que le sol : un état
  // relu doit être indiscernable de l'état écrit, jusqu'à sa sérialisation.
  const etat: Record<string, unknown> = {};
  const ordre = Array.isArray(entete.ordre) ? entete.ordre : Object.keys(entete.reste);
  for (const cle of ordre) {
    if (cle === "station") etat[cle] = station;
    else if (cle === "soil") etat[cle] = soil;
    else etat[cle] = entete.reste[cle];
  }
  return etat as unknown as GameState;
}
