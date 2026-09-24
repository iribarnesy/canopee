# Les trois rôles

Le développement de Canopée se répartit entre trois agents dont les périmètres
ne se recouvrent pas. Chacun a sa note dans ce dossier. Ce fichier dit ce qui
vaut pour les trois.

**Ce que la version en cours doit contenir est dans [`../v1.md`](../v1.md).** Il
dit aussi ce qu'elle doit refuser, et c'est la partie qui compte : rien ne
s'ajoute entre deux versions, même une bonne idée, même petite.

Le rôle du jeu couvre **tout ce qui n'est pas `src/engine`** — niveaux,
objectifs, interface, couche visuelle. Il couvrait au départ le seul rendu ; il
a été élargi parce que ces trois choses se rejoignent dans `GameView.tsx`, et
que deux agents qui y travaillent en même temps se marchent dessus.

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
| `rendu` | agent du jeu | Tout ce qui n'est pas `src/engine` : niveaux, objectifs, interface, couche visuelle. |
| `moteur:maintenance` | agent de maintenance | Corriger un mécanisme existant : défaut, dérive de calibration, hygiène des tests. |
| `moteur:évolution` | agent d'évolution | Ajouter un mécanisme que le moteur ne sait pas faire. |
| `réalisme` | celui qui livre | Touche `docs/realisme.md` : un critère change d'état ou de justification. |
| `à-mesurer` | celui qui livre | Demande une campagne multi-graines **avant** d'écrire du code. |
| `flux-aléatoire` | celui qui livre | Déplace le flux du PRNG : toutes les parties changent, tous les scénarios sont à revérifier. |

Les trois derniers ne routent pas, ils avertissent. Ils se cumulent avec les
trois premiers.

### Une demande d'un périmètre à l'autre porte **deux** labels

`rendu` dit d'où vient le besoin ; il ne dit pas qui écrit le code. Quand le jeu
a besoin d'une grandeur que seul `src/engine` peut donner, l'issue porte `rendu`
**et** le label moteur qui route :

- `moteur:maintenance` si le mécanisme existe déjà et qu'il suffit de
  l'**exposer** — une grandeur que le moteur calcule mais ne met pas dans
  l'instantané, une action qui s'applique mais ne se rapporte pas ;
- `moteur:évolution` s'il faut **inventer** ce que le moteur ne sait pas faire.

Sans le second label, la demande atterrit dans la file de celui qui l'a écrite.
Ce n'est pas une hypothèse : **#86** et **#87** sont restées ouvertes et non
assignées parce qu'elles ne portaient que `rendu`, alors que tout le travail
était côté moteur. Les deux labels ne se contredisent pas — le premier dit
pourquoi on le demande, le second dit qui le fait.

La même règle vaut dans l'autre sens : un mécanisme du moteur qui ne se verra
que si le jeu l'affiche porte son label moteur **et** `rendu`.

## Où en est le projet

Le **moteur** est largement en avance sur ce que le jeu sait montrer : 109
critères de réalisme sur 140 sont acquis, et les issues ouvertes portent des
mécanismes de plus en plus fins.

Le **jeu**, lui, est un bac à sable sans jeu : une vingtaine de gestes jouables,
un HUD, une sauvegarde, une économie qui peut mener à la faillite — et aucune
notion d'objectif, de niveau, de progression ni de fin. C'est là qu'est l'écart,
et c'est ce que la V1 comble.

Conséquence pratique pour les deux agents du moteur : **le moteur n'est pas le
chemin critique.** Un mécanisme de plus ne rapproche pas d'une version finie.

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

**Le mot-clé de fermeture doit être en anglais.** GitHub ne reconnaît que
`close` / `closes` / `closed`, `fix` / `fixes` / `fixed` et `resolve` /
`resolves` / `resolved`. « Ferme #34 » ne ferme rien, où qu'on l'écrive.

C'est la vraie cause de l'issue #34 restée ouverte après le merge de la PR qui
la réglait — longtemps mise sur le compte du squash, à tort. Revérifié sur #80 :
« Ferme #78, #83 et #98 » figurait à la fois dans le corps de la PR **et** dans
le message du commit de squash, les trois issues sont restées ouvertes, et
`closed_by_pull_requests` était vide. Écrire `Closes #78`, ou fermer à la main
après la fusion.

D'après la documentation GitHub — pas mesuré ici, faute d'avoir écrit un
mot-clé anglais — un mot-clé valide est lu aussi bien dans le corps de la PR
que dans un message de commit de la branche par défaut. Le squash n'est donc
pas en cause.

**Merger une base avec `--delete-branch` ferme les PR empilées dessus.** Arrivé
deux fois (#24, #36). Repointer les filles d'abord : `gh pr edit <n> --base main`.
