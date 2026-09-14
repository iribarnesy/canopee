# Les trois rôles

Le développement de Canopée se répartit entre trois agents dont les périmètres
ne se recouvrent pas. Chacun a sa note dans ce dossier. Ce fichier dit ce qui
vaut pour les trois.

## La règle qui vient avant les autres

**S'assigner l'issue avant de commencer.** `gh issue edit <n> --add-assignee @me`.
Pour un travail sans issue, en ouvrir une d'abord — même courte.

Ce n'est pas de la bureaucratie : en septembre 2026, deux sessions ont produit
**quatre fois le même travail** (le seuil du pin, les identités de l'incendie,
l'allométrie du volume, l'élancement individuel) parce que rien ne disait qui
prenait quoi. Deux PR ont fini fermées en doublon après avoir été écrites,
mesurées et relues.

## Les labels, qui disent à qui revient quoi

| Label | Pour qui | Sens |
|---|---|---|
| `rendu` | agent de rendu | Couche visuelle. N'entre jamais dans `src/engine`. |
| `moteur:maintenance` | agent de maintenance | Corriger un mécanisme existant : défaut, dérive de calibration, hygiène des tests. |
| `moteur:évolution` | agent d'évolution | Ajouter un mécanisme que le moteur ne sait pas faire. |
| `réalisme` | celui qui livre | Touche `docs/realisme.md` : un critère change d'état ou de justification. |
| `à-mesurer` | celui qui livre | Demande une campagne multi-graines AVANT d'écrire du code. |
| `flux-aléatoire` | celui qui livre | Déplace le flux du PRNG : toutes les parties changent, tous les scénarios sont à revérifier. |

Les trois derniers ne routent pas, ils avertissent. Ils se cumulent avec les
trois premiers.

## Ce que personne n'a le droit de casser

- **La CI reste verte.** Si elle est rouge sur `main`, c'est la priorité, avant
  tout autre travail.
- **`docs/realisme.md` est la mémoire du projet.** Une PR qui change un
  mécanisme sans mettre le référentiel à jour le laisse mentir. C'est arrivé :
  le score affiché a déjà été faux.
- **La frontière du moteur** (`scripts/check-boundaries.sh`) : `src/engine` ne
  connaît ni React, ni le DOM, ni `src/ui`.
- **Pas d'attribution Claude** dans les messages de commit ni dans les corps de
  PR.

## Deux pièges de procédure, vérifiés à nos dépens

**Le mot-clé de fermeture doit être dans le message de commit**, pas seulement
dans le corps de la PR : le squash reprend le message du commit. L'issue #34 est
restée ouverte après le merge de la PR qui la réglait.

**Merger une base avec `--delete-branch` ferme les PR empilées dessus.** Arrivé
deux fois (#24, #36). Repointer les filles d'abord : `gh pr edit <n> --base main`.
