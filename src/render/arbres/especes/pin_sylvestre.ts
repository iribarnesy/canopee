/**
 * Pin sylvestre — *Pinus sylvestris*. Famille : **conifère**.
 *
 * Trois signatures, et la troisième est la meilleure : les **aiguilles par
 * deux**, courtes et vrillées, bleutées ; le **houppier en plateau** chez le
 * vieux sujet ; et surtout le **fût orangé dans sa partie haute**, gris
 * crevassé en bas. Aucun autre arbre de l'atlas n'a deux couleurs d'écorce —
 * c'est pour lui que `ecorceHaute` existe dans la structure de la fiche.
 *
 * **Le port est `etage` et non `conique`, et ce n'est pas un choix de goût.**
 * Le lot L0 a établi qu'*aucun réglage d'angle sur un port fourchu ne produit
 * le cône d'un pin* : il faut un port étagé distinct — axe droit, verticilles
 * presque horizontaux — et un écourtement explicite des étages, sans lequel ce
 * pin fait une boule. Les deux sont dans `port.ts`.
 *
 * Le jeune pin est conique et le vieux en plateau ; c'est le même profil étagé
 * vu à deux hauteurs, et c'est exactement ce que D4 promettait — les stades
 * sortent gratuitement.
 */
import type { FicheGraphique } from "../fiche";

export const PIN_SYLVESTRE: FicheGraphique = {
  especeId: "pinus_sylvestris",
  port: "etage",
  branchement: {
    // Grand angle : les verticilles partent presque à l'horizontale.
    angleDeg: 72,
    divergenceDeg: 90,
    ratioLongueur: 0.62,
    // Forte : l'axe reste rigoureusement droit, c'est un conifère.
    dominance: 0.74,
    branchesParNoeud: 3,
    conicite: 0.92,
    // Nulle ou presque : un pin ne tortille pas son axe.
    tortuosite: 0.05,
    // **Le trait qui en fait un conifère.** Une pousse de flèche par an, puis
    // une couronne de branches à son sommet ; entre deux couronnes, l'axe est
    // nu. Aucun réglage d'angle ne produit ça sur un branchement continu.
    verticille: true,
  },
  // Une aiguille est longue et fine ; le « bouquet » est ici la brosse de
  // l'année, d'où le compte élevé.
  feuillage: { forme: "aiguille", feuillesParBouquet: 9, longueurFeuilleM: 0.06, densite: 0.62 },
  couleurs: {
    // Persistant : les quatre saisons se ressemblent, et c'est le propos.
    printemps: { r: 92, g: 126, b: 88 },
    ete: { r: 76, g: 108, b: 78 },
    automne: { r: 74, g: 104, b: 76 },
    hiver: { r: 70, g: 98, b: 74 },
  },
  ecorce: { r: 96, g: 82, b: 68 },
  // LA signature. Sans elle on dessine un conifère quelconque.
  ecorceHaute: { r: 196, g: 122, b: 62 },
  references: [
    "Rameau et al., Flore forestière française, t. 1 — Pinus sylvestris",
    "Lot L0, planche de silhouettes : port étagé requis, écourtement explicite",
  ],
};
