/**
 * **Ce que le simulateur prend en compte**, lu à la source (#224).
 *
 * Deux extractions, et la même exigence derrière les deux : **la page ne tient
 * aucune liste**. Le dépôt porte déjà ces informations à un endroit, et une
 * seconde copie tenue à la main divergerait — le référentiel de réalisme en a
 * fait l'expérience sur son propre en-tête, tenu case par case, qui a fini par
 * annoncer 122 critères là où le document en portait 134.
 *
 * - **Les critères** viennent de `docs/realisme.md`, qui les porte avec leur
 *   état et le mécanisme qui les tient. `scripts/recompte-realisme.py` garde
 *   déjà son tableau de score honnête ; on lit les mêmes lignes que lui.
 * - **Les étapes de la semaine** viennent des commentaires de section de
 *   `src/engine/tick.ts`, **dans l'ordre du fichier** — c'est-à-dire dans l'ordre
 *   où elles s'exécutent.
 *
 * Module **pur** : il ne lit aucun fichier, on lui donne du texte. C'est ce qui
 * permet de l'éprouver sur des cas écrits à la main, et c'est le greffon Vite
 * qui va chercher les fichiers.
 */

/** Ce qu'un critère de réalisme dit, et où il en est. */
export interface Critere {
  /** le code du référentiel : A1, B3, H12… */
  code: string;
  /** la lettre du domaine */
  domaine: string;
  /** le comportement du monde réel que le moteur doit reproduire */
  quoi: string;
  etat: "couvert" | "partiel" | "absent";
  /** le mécanisme qui le porte, et l'essai qui le prouve quand il existe */
  porte: string;
}

export interface Domaine {
  lettre: string;
  nom: string;
  criteres: Critere[];
}

const ETATS: Record<string, Critere["etat"]> = {
  "✅": "couvert",
  "🟡": "partiel",
  "❌": "absent",
};

/**
 * Découpe une ligne de tableau sur ses barres, en épargnant celles des blocs
 * de code.
 *
 * Les cellules du référentiel citent des noms de fichiers et des expressions
 * entre accents graves, et rien n'interdit qu'une barre s'y trouve. Un
 * `split("|")` naïf couperait au milieu.
 */
function cellules(ligne: string): string[] {
  const sortie: string[] = [];
  let courante = "";
  let dansDuCode = false;
  for (const c of ligne) {
    if (c === "`") dansDuCode = !dansDuCode;
    if (c === "|" && !dansDuCode) {
      sortie.push(courante.trim());
      courante = "";
    } else {
      courante += c;
    }
  }
  sortie.push(courante.trim());
  return sortie;
}

/**
 * Les critères du référentiel, groupés par domaine et dans l'ordre du document.
 *
 * Un domaine sans critère n'est pas rendu : le document porte aussi des titres
 * de section qui ne sont pas des domaines.
 */
export function criteresDuReferentiel(markdown: string): Domaine[] {
  const domaines: Domaine[] = [];
  let courant: Domaine | undefined;
  for (const ligne of markdown.split("\n")) {
    const titre = /^## ([A-Z])\. (.+?)\s*$/.exec(ligne);
    if (titre?.[1] && titre[2]) {
      courant = { lettre: titre[1], nom: titre[2], criteres: [] };
      domaines.push(courant);
      continue;
    }
    if (!courant || !ligne.startsWith("|")) continue;
    const cases = cellules(ligne);
    // `cellules` rend une case vide de part et d'autre des barres extérieures.
    const [, code, quoi, etat, porte] = cases;
    if (!code || !quoi || !etat) continue;
    if (!new RegExp(`^${courant.lettre}\\d+$`).test(code)) continue;
    const lu = ETATS[etat];
    if (!lu) continue;
    courant.criteres.push({ code, domaine: courant.lettre, quoi, etat: lu, porte: porte ?? "" });
  }
  return domaines.filter((d) => d.criteres.length > 0);
}

/** Une étape d'une semaine simulée. */
export interface Etape {
  /** son rang réel dans le tick, à partir de 1 */
  rang: number;
  titre: string;
  /**
   * Ce que le commentaire de section en dit — souvent le mécanisme en clair,
   * de soixante-dix à six cents caractères. Vide pour les quatre étapes dont
   * le titre se suffit.
   */
  detail: string;
  /** sa ligne dans `tick.ts`, pour aller lire le code qui la fait */
  ligne: number;
}

/**
 * Retire d'un intitulé les renvois qui ne parlent qu'au dépôt.
 *
 * Les commentaires du tick renvoient aux règles, aux issues et aux critères —
 * « Le feu (§7.4, ch5) », « La mémoire d'abri, une fois l'an (F18) ». Ces
 * renvois sont précieux dans le code et muets pour qui lit la page. On ne coupe
 * que les parenthèses qui n'en contiennent **que** : « en deux passes
 * (ordre-indépendant) » reste entière.
 *
 * `issue ` est dans la liste parce qu'un essai a trouvé le trou : tous les
 * renvois du tick portent aujourd'hui un « § » en tête — « (§7.4, issue #55) »
 * — et la règle passait donc, mais « (issue #55) » seul lui échappait.
 */
function sansRenvoiInterne(titre: string): string {
  return titre.replace(/\s*\((?:[§#]|issue |docs\/|ch\d|[A-J]\d)[^)]*\)/g, "").trim();
}

/**
 * Les étapes d'une semaine, dans l'ordre où le tick les exécute.
 *
 * **Le rang est celui du fichier, pas celui du commentaire**, et il fallait
 * choisir : les étiquettes écrites à la main (« 5 ter ter », « 6 ter bis »)
 * ont dérivé de l'ordre réel à force d'insertions — « 7. Régénération » est
 * écrite avant « 6 ter bis » dans le fichier. L'ordre du fichier, lui, est
 * celui de l'exécution : c'est le seul qui soit vrai sans qu'on le tienne.
 */
const MARQUEUR = /^\s*\/\/ ── (?:\d+(?: \w+)*)\.\s*(.*?)\s*─*\s*$/;

export function etapesDuTick(source: string): Etape[] {
  const lignes = source.split("\n");
  const etapes: Etape[] = [];
  for (let i = 0; i < lignes.length; i++) {
    const l = lignes[i] ?? "";
    const m = MARQUEUR.exec(l);
    if (!m?.[1]) continue;
    let titre = m[1];
    // Tout le commentaire qui suit le marqueur, jusqu'au code. C'est là que le
    // mécanisme est expliqué en clair — « les rameaux de l'année lignifient
    // peu à peu ; ce qui reste tendre est ce que le chevreuil mange ».
    //
    // **On s'arrête au marqueur suivant**, et il a fallu le dire : deux
    // sections se touchent dans le fichier (la régénération et la mémoire
    // d'abri), et sans cette garde la première avalait le titre de la seconde.
    //
    // **Deux morceaux, et pas un.** Un titre trop long **déborde** sur la ligne
    // suivante, indentée sous le « // » — c'est la même phrase, coupée. Le
    // paragraphe qui suit, lui, en est une autre. Les fondre ensemble
    // recollait « au sol et par arbre » à « **et** transpiration » avec un point
    // au milieu, et un essai l'a attrapé.
    const suiteDuTitre: string[] = [];
    const paragraphe: string[] = [];
    let encoreDansLeTitre = true;
    for (let j = i + 1; j < lignes.length; j++) {
      const suivante = lignes[j] ?? "";
      if (MARQUEUR.test(suivante)) break;
      const suite = /^\s*\/\/(\s*)(.*?)\s*$/.exec(suivante);
      if (!suite) break;
      const [, blancs, texte] = suite;
      if (!texte) continue;
      if (encoreDansLeTitre && (blancs?.length ?? 0) >= 4) suiteDuTitre.push(texte);
      else {
        encoreDansLeTitre = false;
        paragraphe.push(texte);
      }
    }
    // Ce qui précède le premier « : » fait un intitulé court ; le reste est du
    // détail. Sans ça, la première étape s'appelle « Lumière : au sol
    // (microclimat, évaporation) et par arbre ».
    titre = sansRenvoiInterne(titre);
    const deuxPoints = titre.indexOf(" : ");
    let reste = "";
    if (deuxPoints > 0) {
      reste = titre.slice(deuxPoints + 3);
      titre = titre.slice(0, deuxPoints);
    }
    etapes.push({
      rang: etapes.length + 1,
      titre,
      detail: sansRenvoiInterne(
        [[reste, ...suiteDuTitre].join(" ").trim(), paragraphe.join(" ")]
          .filter(Boolean)
          .join(". "),
      )
        .replace(/\s+/g, " ")
        .trim(),
      ligne: i + 1,
    });
  }
  return etapes;
}
