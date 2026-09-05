/**
 * La lumière du dessin : l'ombrage de pente, et la direction des ombres portées
 * (docs/interface-visuelle.md §4).
 *
 * **Le soleil vient du moteur, pas de la direction artistique.** `light.ts`
 * décale l'ombre d'une couronne vers le NORD, de `SHADOW_NORTH_OFFSET` fois sa
 * hauteur : le soleil est au sud, comme en France. Le §4 du document parlait
 * d'une lumière au sud-OUEST, ce qui est plus flatteur — et faux ici. Une ombre
 * qui part au nord-est à l'écran pendant que le moteur calcule la concurrence
 * plein nord mentirait sur qui ombrage qui, et c'est exactement ce que le §0
 * interdit. Le sud gagne, et il a l'avantage d'être plus simple.
 *
 * **Deux effets distincts**, qu'il ne faut pas confondre :
 *
 * - l'**ombrage de pente** : un versant tourné vers le soleil est plus clair
 *   qu'un versant à l'ombre. C'est ce qui rend le relief LISIBLE — sans lui, le
 *   relief à l'échelle vraie (D3) ne se voit presque pas sur une station à 1 à
 *   6 % de pente, parce que le décalage vertical y est de quelques pixels ;
 * - l'**ombre portée** : la tache qu'un objet projette au sol. Elle a une
 *   direction à l'écran, et cette direction TOURNE avec la caméra (§3), alors
 *   que le panneau de l'arbre, lui, ne tourne pas.
 *
 * Module **pur** : pas de canvas, pas de DOM, aucun état.
 */

import { SHADOW_NORTH_OFFSET } from "../engine/light";
import { type Camera, versEcran } from "./projection";

export { SHADOW_NORTH_OFFSET };

/**
 * Hauteur du soleil au-dessus de l'horizon, en degrés.
 *
 * **C'est une convention de dessin, et il faut le dire** : le moteur n'a pas
 * d'angle solaire — il a un décalage d'ombre vers le nord, moyenné sur l'année
 * (`SHADOW_NORTH_OFFSET = 0,4`). Un décalage de 0,4 fois la hauteur correspond
 * à un soleil à `atan(1 / 0,4)` ≈ 68°, ce qui est le midi de juin et non une
 * moyenne. On retient donc l'angle qui rend le même décalage que le moteur, de
 * façon à ce que l'ombre dessinée tombe exactement là où le modèle la met.
 *
 * Conséquence assumée : les ombres ne s'allongent pas en hiver. Les allonger
 * demanderait un angle solaire dans le moteur, et alors la concurrence pour la
 * lumière changerait avec la saison — c'est un chantier d'écologie, pas de
 * rendu. À demander en issue le jour où on le veut vraiment.
 */
export const SOLEIL_HAUTEUR_DEG = (Math.atan(1 / SHADOW_NORTH_OFFSET) * 180) / Math.PI;

/**
 * Amplitude de l'ombrage de pente : ±22 % de clarté autour du terrain plat, au
 * maximum.
 *
 * **C'est une exagération, et elle est nécessaire.** Le produit scalaire
 * physique donnait ±4 % sur les stations livrées — invisible. La raison est
 * géométrique : 6 m de dénivelé sur 100 m font une inclinaison de 3,4°, que
 * n'importe quel modèle d'éclairement rend imperceptible. Or c'est le SEUL
 * canal qui rend le relief lisible en vue isométrique, puisque D3 interdit
 * d'exagérer les altitudes elles-mêmes. On exagère donc ce canal-là, une fois,
 * en le disant.
 */
export const AMPLITUDE_PENTE = 0.22;

/**
 * Pente à laquelle l'ombrage sature, en mètres par mètre.
 *
 * 8 % : au-delà, un versant est « au soleil » ou « à l'ombre » sans nuance. Les
 * cinq stations livrées font 1 à 6 %, donc elles utilisent toute la plage sans
 * jamais la saturer — et un terrain modelé à la main, qui peut aller bien plus
 * loin, ne produit pas pour autant un aplat blanc ou noir.
 */
export const PENTE_SATURATION = 0.08;

/**
 * Azimut de la lumière qui MODÈLE le terrain, en degrés depuis le nord.
 *
 * **Deux lumières, deux métiers, et il a fallu se tromper une fois pour le
 * voir.** J'avais aligné l'ombrage de pente sur le soleil du moteur — plein sud,
 * comme le décalage d'ombre de `light.ts` — en refusant le sud-ouest que le §4
 * demandait. Le raisonnement était bon pour l'OMBRE PORTÉE et faux pour
 * l'ombrage.
 *
 * Ce qui l'a montré : mesuré sur les reliefs que le moteur produit, `dz/dy` vaut
 * 0,0900 sur toutes les cellules, pour les trois formes — `plan`, `croupe` et
 * `vallon`. La forme ne joue QUE sur le profil est-ouest. Un ombrage plein sud
 * est donc aveugle à la seule variation de relief qui existe : croupe et vallon
 * y rendaient exactement la même image.
 *
 * La distinction qui résout ça : l'ombre portée **affirme un mécanisme** — elle
 * dit qui ombrage qui, et doit tomber là où le moteur la calcule. L'ombrage de
 * pente n'affirme rien de tel : il donne du volume à une surface. Lui donner un
 * azimut oblique ne ment sur rien, et c'est la seule façon de voir une croupe.
 *
 * 225° — sud-ouest, comme le §4 le demandait dès le début.
 */
export const AZIMUT_MODELE_DEG = 225;

/**
 * Gradient du terrain en une cellule : (dz/dx, dz/dy), mètres par mètre.
 *
 * Différences centrées, avec repli sur la différence simple au bord. Les
 * cellules font un mètre, donc la division est implicite.
 *
 * `altitudesM` voyage dans `StationInfo` et ne change jamais en cours de partie
 * — sauf si l'éditeur de terrain modifie la station, et alors tout est
 * reconstruit de toute façon.
 */
export function gradient(
  altitudesM: readonly number[],
  coteM: number,
  x: number,
  y: number,
): [number, number] {
  const z = (cx: number, cy: number): number => {
    const bx = Math.min(coteM - 1, Math.max(0, cx));
    const by = Math.min(coteM - 1, Math.max(0, cy));
    return altitudesM[by * coteM + bx] ?? 0;
  };
  // Au bord, `z` replie sur la cellule du bord : la différence centrée devient
  // alors une différence simple sur un pas de 1 au lieu de 2, d'où le diviseur
  // qui suit le nombre de pas réellement franchis.
  const pasX = (x > 0 ? 1 : 0) + (x < coteM - 1 ? 1 : 0);
  const pasY = (y > 0 ? 1 : 0) + (y < coteM - 1 ? 1 : 0);
  const dx = pasX === 0 ? 0 : (z(x + 1, y) - z(x - 1, y)) / pasX;
  const dy = pasY === 0 ? 0 : (z(x, y + 1) - z(x, y - 1)) / pasY;
  return [dx, dy];
}

/**
 * Facteur d'éclairement d'une cellule par sa pente : 1 sur le plat, plus sur un
 * versant exposé, moins sur un versant à l'ombre.
 *
 * Le soleil est plein sud et haut : seule l'inclinaison NORD-SUD change quelque
 * chose. Un versant qui monte vers le nord (`dz/dy > 0`) lui fait face et
 * s'éclaircit ; un versant qui descend vers le nord s'assombrit. La réponse est
 * linéaire jusqu'à `PENTE_SATURATION`, puis plate.
 *
 * **Ce n'est pas un modèle photométrique, et c'est délibéré.** Le produit
 * scalaire exact entre la normale et la direction du soleil donnait ±4 % sur
 * nos stations : juste, et invisible. Voir `AMPLITUDE_PENTE`.
 *
 * Ne dépend pas de l'orientation de la caméra, et c'est correct : tourner
 * autour d'une butte ne déplace pas le soleil. C'est ce qui distingue cet effet
 * de l'ombre portée, dont la direction écran tourne, elle.
 */
/**
 * Exposition d'une cellule à la lumière qui modèle : la composante de la pente
 * dans la direction opposée au soleil, en mètres par mètre.
 *
 * Séparée de `facteurPente` parce que la moyenne de la parcelle se calcule sur
 * cette même grandeur — et qu'elles doivent rester d'accord.
 */
export function expositionPente(
  altitudesM: readonly number[],
  coteM: number,
  x: number,
  y: number,
): number {
  const [dzdx, dzdy] = gradient(altitudesM, coteM, x, y);
  const azimut = (AZIMUT_MODELE_DEG * Math.PI) / 180;
  // Vecteur horizontal pointant VERS le soleil, dans le repère parcelle
  // (+x est, +y nord) : l'azimut se compte depuis le nord, dans le sens des
  // aiguilles.
  const versEst = Math.sin(azimut);
  const versNord = Math.cos(azimut);
  // Une pente qui S'ÉLÈVE à l'opposé du soleil lui fait face.
  return -(dzdx * versEst + dzdy * versNord);
}

export function facteurPente(
  altitudesM: readonly number[],
  coteM: number,
  x: number,
  y: number,
  reference = 0,
): number {
  const expose = Math.min(
    1,
    Math.max(-1, (expositionPente(altitudesM, coteM, x, y) - reference) / PENTE_SATURATION),
  );
  return 1 + AMPLITUDE_PENTE * expose;
}

/**
 * Exposition MOYENNE de la parcelle, en mètres par mètre.
 *
 * **À passer en référence à `facteurPente`, et voici pourquoi.** Les reliefs que
 * le moteur produit sont largement PLANAIRES dans le sens de la pente : mesuré
 * sur une station à 9 %, l'exposition est constante sur les dix mille cellules.
 * Ombrer par rapport à l'horizontale y donnait donc le même facteur PARTOUT —
 * autrement dit, non pas du relief mais une parcelle uniformément éclaircie,
 * ce qui virait la palette entière au jaune acide sans rien apprendre à
 * personne.
 *
 * En prenant la pente moyenne pour référence, une parcelle uniformément inclinée
 * redevient neutre et seuls les ÉCARTS à cette pente — une butte, un talweg, une
 * rupture — s'éclairent ou s'assombrissent. C'est exactement l'information utile.
 *
 * Ce qui est perdu, et c'est assumé : une parcelle plein sud n'a pas l'air plus
 * ensoleillée qu'une parcelle plein nord. Le niveau absolu ne dit rien qu'un
 * joueur puisse utiliser — il n'a pas les deux sous les yeux — alors qu'il
 * corrompt toute la palette.
 */
export function expositionMoyenne(altitudesM: readonly number[], coteM: number): number {
  let somme = 0;
  let n = 0;
  // Un échantillon suffit largement, et évite de parcourir dix mille cellules
  // à chaque cuisson de morceau.
  const pas = Math.max(1, Math.floor(coteM / 24));
  for (let y = 0; y < coteM; y += pas) {
    for (let x = 0; x < coteM; x += pas) {
      somme += expositionPente(altitudesM, coteM, x, y);
      n++;
    }
  }
  return n === 0 ? 0 : somme / n;
}

/**
 * Direction écran de l'ombre portée, pour une caméra donnée : le vecteur unité
 * qui va du pied d'un objet vers son ombre.
 *
 * Calculée en PROJETANT le décalage nord du moteur, plutôt qu'en codant quatre
 * vecteurs à la main : c'est juste par construction, ça suit automatiquement si
 * la projection change, et ça ne peut pas se désynchroniser de `tourner()`.
 */
export function directionOmbreEcran(cam: Camera): { sx: number; sy: number } {
  const pied = versEcran({ x: 0, y: 0, z: 0 }, cam);
  // Un mètre vers le nord, dans le repère de la parcelle.
  const vers = versEcran({ x: 0, y: 1, z: 0 }, cam);
  const dx = vers.sx - pied.sx;
  const dy = vers.sy - pied.sy;
  const norme = Math.hypot(dx, dy) || 1;
  return { sx: dx / norme, sy: dy / norme };
}

/**
 * Longueur écran de l'ombre d'un objet de hauteur `hauteurM`, en pixels.
 *
 * Le décalage est de `SHADOW_NORTH_OFFSET × hauteur` MÈTRES vers le nord ; on
 * le projette pour obtenir des pixels, ce qui tient compte du zoom et de
 * l'écrasement isométrique sans qu'on ait à les répéter ici.
 */
export function longueurOmbreEcran(hauteurM: number, cam: Camera): number {
  const decalageM = SHADOW_NORTH_OFFSET * hauteurM;
  const pied = versEcran({ x: 0, y: 0, z: 0 }, cam);
  const bout = versEcran({ x: 0, y: decalageM, z: 0 }, cam);
  return Math.hypot(bout.sx - pied.sx, bout.sy - pied.sy);
}
