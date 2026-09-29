/**
 * **Ce qu'une année de consignes a coûté et rapporté** (#117).
 *
 * > « Tiens, c'est la saison. Pas assez de main-d'œuvre — j'embauche un
 * > saisonnier. Je sélectionne tous les fruitiers. Je récolte. Pas assez de
 * > temps — je réembauche. Je récolte. » Et rebelote l'année d'après.
 *
 * La procédure se rejoue seule depuis deux lots : la récolte automatique, essence
 * par essence (#191), et la consigne des heures supplémentaires, « se souvenir
 * de mon choix » (#133). Ce qui manquait est l'autre moitié de la demande :
 * **qu'elle rende des comptes**. Chaque semaine écrivait sa ligne — une
 * cueillette ici, un saisonnier là —, et personne ne pouvait dire en fin
 * d'année si la stratégie avait payé.
 *
 * ── **ce qui entre dans le compte** ─────────────────────────────────────────
 *
 * Deux choses, et seulement celles qui se font **sans clic** :
 *
 * - les cueillettes de la **récolte automatique** — pas celles du joueur, qui
 *   sait ce qu'il vient de faire ;
 * - les **saisonniers de la facture horaire**, qu'on ait répondu à la main ou
 *   que la consigne ait répondu seule : ce sont les heures que la récolte
 *   automatique a fait déborder, et les séparer ferait deux comptes d'une même
 *   dépense.
 *
 * ── **les nombres viennent de ce qui s'est passé** ─────────────────────────
 *
 * Les euros sont le **mouvement de trésorerie** que l'action a produit, mesuré
 * autour d'elle, et non un prix multiplié par un poids : le moteur fixe le prix
 * d'une cueillette, et le jour où il fera baisser le cours quand la récolte
 * abonde — il le fait déjà pour le bois —, un produit recalculé ici mentirait.
 *
 * Module **pur** : le worker mesure, ce module additionne et dit.
 */

/** Une action automatique, mesurée au moment où elle s'est appliquée. */
export interface LigneDeCompte {
  /** mouvement de trésorerie de l'action, € (positif = recette) */
  eur: number;
  /** ce que la cueillette a pris, par essence, kg — absent pour une embauche */
  fruitsKg?: Readonly<Record<string, number>>;
  /** semaines de saisonnier payées — absent pour une cueillette */
  semainesDeSaisonnier?: number;
}

/** L'année en cours, telle que les consignes l'ont faite. */
export interface CompteDeLAnnee {
  /** ce que la récolte automatique a cueilli, par essence, kg */
  fruitsKg: Readonly<Record<string, number>>;
  /** ce que ces cueillettes ont rapporté, € */
  recetteEur: number;
  /** semaines de saisonnier payées pour couvrir les heures supplémentaires */
  semainesDeSaisonnier: number;
  /** ce qu'elles ont coûté, € (positif) */
  salairesEur: number;
}

export const COMPTE_VIDE: CompteDeLAnnee = {
  fruitsKg: {},
  recetteEur: 0,
  semainesDeSaisonnier: 0,
  salairesEur: 0,
};

/** Ajouter une action au compte de l'année. */
export function ajouterAuCompte(compte: CompteDeLAnnee, ligne: LigneDeCompte): CompteDeLAnnee {
  if (ligne.semainesDeSaisonnier !== undefined) {
    return {
      ...compte,
      semainesDeSaisonnier: compte.semainesDeSaisonnier + ligne.semainesDeSaisonnier,
      // Une embauche **coûte** : le mouvement est négatif, le salaire se compte
      // en positif pour que la phrase dise « 1 260 € de salaires ».
      salairesEur: compte.salairesEur - Math.min(0, ligne.eur),
    };
  }
  const fruitsKg = { ...compte.fruitsKg };
  for (const [espece, kg] of Object.entries(ligne.fruitsKg ?? {})) {
    fruitsKg[espece] = (fruitsKg[espece] ?? 0) + kg;
  }
  return { ...compte, fruitsKg, recetteEur: compte.recetteEur + Math.max(0, ligne.eur) };
}

/** Rien à raconter : ni cueillette, ni saisonnier. */
export function compteVide(compte: CompteDeLAnnee): boolean {
  return compte.semainesDeSaisonnier === 0 && Object.keys(compte.fruitsKg).length === 0;
}

/** En deçà, un fruit ne vaut pas d'être nommé dans la phrase de l'année, kg. */
export const KG_A_NOMMER = 1;

const euros = (v: number) => `${Math.round(v).toLocaleString("fr-FR")} €`;

/**
 * La phrase que le journal écrit en fin d'année.
 *
 * **Le solde est dit**, et c'est la question que la phrase existe pour
 * trancher : une stratégie qui embauche pour tout récolter peut coûter plus
 * qu'elle ne rapporte, et c'est exactement ce que le joueur ne pouvait pas voir
 * en lisant une ligne par semaine.
 */
export function direLeCompte(
  compte: CompteDeLAnnee,
  annee: number,
  nomEspece: (id: string) => string,
): string {
  const fruits = Object.entries(compte.fruitsKg)
    .filter(([, kg]) => kg >= KG_A_NOMMER)
    .sort((a, b) => b[1] - a[1])
    .map(([id, kg]) => `${Math.round(kg).toLocaleString("fr-FR")} kg de ${nomEspece(id)}`);
  const parties: string[] = [];
  if (fruits.length > 0) {
    parties.push(`récolte automatique : ${fruits.join(", ")} → ${euros(compte.recetteEur)}`);
  }
  if (compte.semainesDeSaisonnier > 0) {
    const n = compte.semainesDeSaisonnier;
    parties.push(
      `${n} semaine${n > 1 ? "s" : ""} de saisonnier pour les heures en trop → −${euros(compte.salairesEur)}`,
    );
  }
  const solde = compte.recetteEur - compte.salairesEur;
  const signe = solde >= 0 ? "+" : "−";
  return `Compte de ${annee} — ${parties.join(" · ")} · solde ${signe}${euros(Math.abs(solde))}`;
}
