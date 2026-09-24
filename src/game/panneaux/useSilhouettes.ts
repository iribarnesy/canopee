/**
 * **Les silhouettes des arbres suivis**, cuites une par image (#149).
 *
 * **Parce qu'une cuisson coûte 175 ms.** Mesuré dans le navigateur, volet
 * ouvert à ×13 sur quinze arbres suivis : le fil principal restait bloqué
 * **5,3 s par instantané** (81 ms volet fermé). Trente silhouettes redessinées
 * à chaque semaine de jeu, voilà ce que « montrer le sprite » coûte si on le
 * fait pendant le rendu.
 *
 * Deux règles suffisent à le ramener à rien :
 *
 * 1. **Hors du rendu, et une par image.** Un effet cuit au plus une silhouette
 *    par `requestAnimationFrame` : la dépense s'étale au lieu de figer une
 *    image sur cinq secondes, et le volet se remplit sous les yeux.
 * 2. **Rien à refaire tant que la clé n'a pas bougé.** `cleDuPortrait` dit si
 *    la silhouette a changé sans la cuire — un arbre qui pousse de dix
 *    centimètres garde la sienne.
 * 3. **On ne rafraîchit que le temps arrêté.** C'est un portrait, pas une
 *    fenêtre : on le regarde quand le jeu s'arrête — et il s'arrête tout seul
 *    quand un suivi meurt, c'est-à-dire au moment précis où l'on vient voir.
 *    Pendant que les semaines filent, la silhouette déjà cuite reste ; sinon
 *    chaque changement de saison en redemande quatre, et la mesure ci-dessus
 *    dit ce que ça coûte. Un arbre qui n'en a pas encore reçoit la sienne, en
 *    marche comme à l'arrêt : un cadre vide ne se justifie jamais.
 */

import { useEffect, useRef, useState } from "react";
import type { ArbreAPoser } from "../../render/couches/arbres";
import { cleDuPortrait, portraitDeLArbre, portraitEnPleineForme } from "./portraits";

export interface Silhouette {
  /** l'arbre tel qu'il est */
  sien: string;
  /** le même, même espèce et même taille, mais en pleine forme */
  temoin?: string;
}

export function useSilhouettes(
  poses: readonly ArbreAPoser[],
  hauteurMaxDe: (especeId: string) => number,
  /** le temps est-il à l'arrêt ? seul l'arrêt vaut un rafraîchissement */
  aLArret: boolean,
): ReadonlyMap<number, Silhouette> {
  const [faites, setFaites] = useState<ReadonlyMap<number, Silhouette>>(new Map());
  /** la clé de ce qu'on a cuit, par arbre : ce qui évite de recuire pour rien */
  const cles = useRef(new Map<number, string>());

  /**
   * **l'empreinte, et non le tableau, fait la dépendance de l'effet.**
   *
   * Sans elle, rien ne se cuisait jamais, et le défaut méritait d'être mesuré
   * pour être cru : l'écran de jeu se rend plusieurs fois par seconde, chaque
   * rendu refabrique le tableau des poses, donc l'effet se relançait — son
   * nettoyage annulant l'image demandée avant même qu'elle n'arrive. Un
   * `requestAnimationFrame` annulé à chaque rendu ne s'exécute pas une seule
   * fois. Relevé dans le navigateur : `<details open>`, l'état React d'accord,
   * et zéro silhouette.
   *
   * Une chaîne de caractères, elle, ne change que si le **contenu** change.
   */
  const empreinte = poses
    .map((p) => `${p.id}:${cleDuPortrait(p, hauteurMaxDe(p.especeId))}`)
    .join("|");
  const dernieres = useRef(poses);
  dernieres.current = poses;

  useEffect(() => {
    let vivant = true;
    let image: number | undefined;
    // L'empreinte **est** la liste de ce qu'il faut : un identifiant, sa clé.
    const voulues = new Map<number, string>();
    for (const morceau of empreinte.split("|")) {
      const sep = morceau.indexOf(":");
      if (sep > 0) voulues.set(Number(morceau.slice(0, sep)), morceau.slice(sep + 1));
    }
    // La file des arbres à cuire, dans l'ordre où le panneau les montre.
    const aFaire = dernieres.current.filter((p) => {
      const voulue = voulues.get(p.id);
      if (voulue === undefined) return false;
      const deja = cles.current.get(p.id);
      return deja === undefined || (aLArret && deja !== voulue);
    });
    const suivante = () => {
      if (!vivant) return;
      const pose = aFaire.shift();
      if (!pose) return;
      const hauteurMaxM = hauteurMaxDe(pose.especeId);
      const sien = portraitDeLArbre(pose, hauteurMaxM);
      if (sien) {
        const temoin = portraitEnPleineForme(pose, hauteurMaxM);
        cles.current.set(pose.id, voulues.get(pose.id) ?? "");
        setFaites((avant) => {
          const suite = new Map(avant);
          suite.set(pose.id, { sien, ...(temoin ? { temoin } : {}) });
          return suite;
        });
      }
      image = requestAnimationFrame(suivante);
    };
    image = requestAnimationFrame(suivante);
    return () => {
      vivant = false;
      if (image !== undefined) cancelAnimationFrame(image);
    };
  }, [empreinte, hauteurMaxDe, aLArret]);

  return faites;
}
