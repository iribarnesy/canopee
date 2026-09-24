/**
 * ─── **les réserves glucidiques** : **mourir de faim**, **pas de passer sous un seuil** ──
 *
 * Ce que le moteur ne savait pas faire, et c'était le trou annoncé en tête de
 * `trees.ts` depuis l'origine — « le stress létal par carence viendra avec le
 * budget carbone ».
 *
 * **La mesure du manque.** Une cohorte de pins plantée à 2 m, suivie cent vingt
 * ans : elle s'éclaircit bien, de 361 à une cinquantaine de tiges, mais les
 * causes sont les mauvaises — 205 à 244 morts de ravageurs, 55 à 98 de chablis,
 * et **4 à 7 seulement de l'ombre**. La mortalité densité-dépendante du moteur
 * passait par la pression parasitaire et par le vent. C'est défendable — les
 * scolytes d'une pineraie serrée sont réels — mais ce n'est pas l'auto-éclaircie
 * de la sylviculture, qui est une course à la lumière que les dominés perdent.
 *
 * Et pour le hêtre c'était pire : 361 plantés, **361 vivants à cent vingt ans**,
 * à tous les réglages d'ombrage essayés. Pas une calibration à retoucher, une
 * impossibilité arithmétique — son seuil de stress (0,0090 de lumière) passe
 * **sous** le plancher que le moteur sait produire (0,0111). Le hêtre dominé était
 * hors d'atteinte, où qu'il soit et quoi qu'on plante autour.
 *
 * **Pourquoi un seuil ne pouvait pas y suffire.** Le point de compensation est
 * **instantané** : il dit si la feuille gagne ou perd à cet instant. Un arbre
 * dominé ne meurt pas parce que la lumière est passée sous une valeur ; il meurt
 * parce que, des années durant, il a dépensé plus qu'il n'a assimilé, que ses
 * réserves glucidiques se sont vidées, et qu'à la fin il n'a plus de quoi
 * refaire des feuilles au printemps. C'est la famine carbonée, et c'est un
 * **épuisement** — donc un stock, pas un seuil.
 *
 * ─── **ce qui fait que la taille décide** ────────────────────────────────────────
 *
 * Le contenu du mécanisme tient dans une phrase que le seuil ne pouvait pas
 * dire : **la même ombre qu'un semis traverse tue une perche.** Un semis est
 * presque tout feuille ; un arbre de vingt mètres traîne des tonnes de tissu
 * vivant non photosynthétique qu'il faut entretenir avant de pouvoir pousser.
 * L'ombre tolérable décroît donc avec la taille — c'est un fait d'écologie
 * forestière ordinaire, et c'est exactement ce qui fabrique l'auto-éclaircie.
 *
 * **Le modèle du tube donne la loi d'échelle** (Shinozaki et al. 1964) : la
 * section d'aubier est proportionnelle à la surface foliaire qu'elle alimente.
 * Le **volume** d'aubier — donc le tissu vivant à entretenir — vaut donc cette
 * section multipliée par la hauteur. La charge d'entretien par unité de feuille
 * croît ainsi **proportionnellement à la hauteur**, et rien d'autre n'est
 * supposé : ni biomasse totale (le bois de cœur est mort et ne respire pas), ni
 * forme de houppier.
 *
 * **Le niveau est ancré sur un résultat robuste** : dans une futaie tempérée
 * adulte, la respiration autotrophe consomme à peu près la moitié de la
 * production brute — `NPP/GPP ≈ 0,5` (Waring, Landsberg & Williams 1998 ; la
 * synthèse de DeLucia et al. 2007 donne 0,53 en moyenne sur un large corpus,
 * avec une vraie dispersion). On pose donc qu'un arbre de la hauteur d'une
 * futaie adulte dépense la moitié de ce qu'il gagnerait en plein soleil.
 *
 * ─── **ce que ça donne**, **et c'est le vrai test** ──────────────────────────────────
 *
 * Pour le hêtre, dont la réponse lumineuse sature à 0,35, le mécanisme sort tout
 * seul la lumière minimale de survie par taille :
 *
 * | taille | part d'entretien | lumière minimale |
 * |---|---|---|
 * | semis 0,3 m | 0,6 % | **1,2 %** |
 * | perche 10 m | 20 % | **8 %** |
 * | arbre 25 m | 50 % | **18 %** |
 *
 * Personne n'a choisi ces trois chiffres : ils tombent de deux constantes et de
 * la fiche d'espèce. Et ils disent ce que dit le terrain — un semis de hêtre
 * patiente une décennie sous couvert fermé, une perche de dix mètres n'y tient
 * pas trois ans.
 *
 * ─── **ce qu'on n'empile pas** ───────────────────────────────────────────────────
 *
 * L'issue prévenait : ajouter une mortalité de lumière **par-dessus** les ravageurs
 * donnerait un peuplement qui s'effondre deux fois. Deux dispositions
 * l'évitent, et aucune n'est un garde-fou artificiel.
 *
 * D'abord, ce mécanisme **remplace** l'ancien facteur de survie à l'ombre
 * (`fLumSurvival`) au lieu de s'y ajouter : il n'y a toujours qu'une seule
 * façon de mourir de l'ombre.
 *
 * Ensuite, la famine et les ravageurs **convergent sur le même état** — le
 * stress — au lieu de tuer chacun de leur côté. C'est physiquement juste : un
 * arbre affamé se défend mal, les ravageurs le trouvent, et l'acte de décès
 * porte leur nom alors que la cause est la famine. Le moteur le disait déjà
 * autrement, par `vigueur`, que `ravageurs.ts` lit pour choisir ses victimes.
 * Des risques **concurrents**, pas cumulés : un arbre mort ne meurt pas deux fois.
 */

import type { EspeceV0 } from "./especes";

/**
 * Part de la production brute que l'entretien consomme, pour un arbre de
 * `HAUTEUR_FUTAIE_ADULTE_M`. Ancré sur `NPP/GPP ≈ 0,5` en futaie tempérée
 * (Waring, Landsberg & Williams 1998 ; DeLucia et al. 2007 : 0,53 de moyenne,
 * étendue 0,23–0,83 — la dispersion est réelle) *(à calibrer)*.
 */
export const PART_ENTRETIEN_ADULTE = 0.5;

/**
 * La hauteur à laquelle cette part vaut. C'est la canopée d'une futaie
 * tempérée adulte, celle des peuplements où le rapport ci-dessus a été mesuré,
 * m *(à calibrer : les sites du corpus vont de 15 à 35 m)*.
 */
export const HAUTEUR_FUTAIE_ADULTE_M = 25;

/**
 * Combien d'années de saison de végétation les réserves tiennent quand le
 * revenu est **nul**.
 *
 * Ancré sur la défoliation totale, qui est le cas de revenu nul qu'on sait
 * observer : un arbre feuillu supporte une défoliation complète, en refait des
 * feuilles sur ses réserves, et meurt à la **deuxième ou troisième année
 * consécutive** — c'est ce que font les gradations de bombyx et de
 * processionnaire. On retient deux ans et demi *(à calibrer : la gamme
 * observée est 2 à 3 ans, et dépend de l'essence et de son état de départ)*.
 */
export const RESERVES_ANS = 2.5;

/**
 * Ce que l'entretien coûte à **cet** arbre, en part de ce qu'il gagnerait sous une
 * lumière saturante. Croît avec la hauteur (modèle du tube) : le volume
 * d'aubier à entretenir par unité de feuille est proportionnel à la longueur
 * des tuyaux.
 *
 * Pas de cas particulier d'espèce, et pas non plus de normalisation par la
 * hauteur maximale de l'essence : la charge dépend de la taille **réelle** de
 * l'individu, pas de son ambition. C'est ce qui fait qu'une callune de
 * cinquante centimètres ne paie presque rien là où un hêtre de vingt mètres
 * paie cher — et non l'inverse, qu'une normalisation par espèce aurait produit.
 */
export function partEntretien(heightM: number): number {
  return (PART_ENTRETIEN_ADULTE * Math.max(0, heightM)) / HAUTEUR_FUTAIE_ADULTE_M;
}

/**
 * Lumière en dessous de laquelle **cet** arbre ne couvre plus son entretien : sa
 * compensation **à l'échelle de l'arbre entier**, par opposition à celle de la
 * feuille que porte l'atlas. Elle monte avec la taille, et c'est tout le
 * mécanisme.
 *
 * Au-delà de la saturation de l'espèce, l'arbre ne peut plus gagner davantage :
 * un sujet assez grand pour que son entretien dépasse son revenu de plein
 * soleil est condamné où qu'il soit, ce que la fonction rend en renvoyant une
 * valeur supérieure à 1 — impossible à satisfaire.
 */
export function compensationDeLArbre(espece: EspeceV0, heightM: number): number {
  const { compensation, saturation } = espece.lumiere;
  return compensation + partEntretien(heightM) * (saturation - compensation);
}

/**
 * Part de son entretien que l'arbre doit payer sur ses réserves cette semaine,
 * ∈ [0,1]. Zéro tant qu'il gagne sa vie ; un quand il ne gagne rien.
 *
 * Le revenu suit la **même** courbe de réponse lumineuse que la croissance — celle
 * de l'atlas, entre le point de compensation de la feuille et la saturation.
 * Aucune courbe nouvelle : la lumière ne se lit pas de deux façons selon qu'on
 * parle de pousser ou de survivre.
 */
export function partPuiseeSurLesReserves(espece: EspeceV0, heightM: number, light: number): number {
  const depense = partEntretien(heightM);
  if (depense <= 0) return 0;
  const { compensation, saturation } = espece.lumiere;
  const revenu = Math.min(1, Math.max(0, (light - compensation) / (saturation - compensation)));
  return Math.min(1, Math.max(0, 1 - revenu / depense));
}

/**
 * Points de stress par semaine pour un puisement complet. Dérivé de
 * `RESERVES_ANS` et de la létalité du stress : les réserves sont exactement ce
 * compteur-là, vu par l'autre bout.
 *
 * Le nombre de semaines se compte en **saison de végétation** (`GROWING_WEEKS`),
 * pas en semaines calendaires : un arbre dormant ne consomme presque rien, et
 * c'est déjà la convention du moteur pour l'ombre.
 */
export function usureParSemaine(stressLetal: number, semainesDeVegetation: number): number {
  return stressLetal / (RESERVES_ANS * semainesDeVegetation);
}
