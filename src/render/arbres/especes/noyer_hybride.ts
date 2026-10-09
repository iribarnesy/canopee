/**
 * Noyer hybride — *Juglans × intermedia*. Famille : **feuillu de futaie**.
 *
 * **Une fiche d'attente, pas un dessin.** L'hybride est entré à l'atlas du moteur
 * (#213) et l'essai du catalogue refuse une espèce sans fiche : il reprend donc
 * le dessin du noyer commun, avec les deux seuls écarts que le moteur et les
 * sources imposent. Le vrai dessin revient au rendu (#376).
 *
 *  - **pas de fruit** : le moteur ne suit pas sa fructification — il est planté
 *    pour le bois, rien ne s'y récolte —, et une fiche ne dessine un fruit que
 *    si le moteur en suit un ;
 *  - **une flèche qui domine plus longtemps** : les hybrides ont « une meilleure
 *    dominance de la cime » que le commun (Coello et al. 2013), qui fourche tôt.
 *    La valeur est un réglage de rendu, pas une mesure.
 *
 * Ce qui reste à dessiner, et que les sources donnent : une feuille de onze à
 * vingt-trois folioles au lieu de cinq à neuf, la terminale très marquée, un
 * contour plus progressivement denté que celui du noyer noir ; une écorce lisse
 * dans le jeune âge, qui rappelle celle du commun (CNPF 2023).
 */
import type { FicheGraphique } from "../fiche";
import { NOYER } from "./noyer";

const { fruit: _sansFruit, ...dessinDuCommun } = NOYER;

export const NOYER_HYBRIDE: FicheGraphique = {
  ...dessinDuCommun,
  especeId: "juglans_x_intermedia",
  branchement: { ...NOYER.branchement, dominance: 0.45 },
  references: [
    "Le Mesle & Trembleau (2023), Les noyers à bois, fiche essence 4, CNPF — feuille et écorce de l'hybride",
    "Coello, Becquey et al. (2013), Le noyer hybride et le noyer commun à bois, CPF Catalogne — dominance de la cime",
  ],
};
