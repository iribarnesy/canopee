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

**Ouvrir la PR dès le premier commit poussé.** En brouillon si le travail n'est
pas fini : le but n'est pas d'annoncer une livraison, c'est qu'aucune branche ne
soit rattachée à rien. Plusieurs issues dans une même PR ne gênent personne —
une branche que rien ne relie à une issue, si.

Une branche sans PR est **invisible**. Elle n'apparaît dans aucune liste que
quelqu'un consulte, sa CI ne tourne sur la fusion de personne, et son écart avec
`main` grandit sans que ça se voie. La section suivante raconte ce que ça a
coûté la fois où ça n'a pas été fait ; le prix n'était pas du travail perdu,
c'était un jour d'attente et vingt et un conflits qui n'existaient pas la
veille.

## La branche d'un autre agent ne se touche pas

**Ce qui appartient à un agent : sa branche, ses PR, ses issues assignées.**
Personne d'autre n'y pousse un commit, n'y ouvre une PR, ne fusionne, ne ferme
ni ne rouvre. Même quand le travail est fini, mesuré, vert et manifestement en
attente : **c'est son auteur qui le propose, et lui seul.**

Ce qu'on fait à la place tient en une phrase : **on ouvre une issue avec le
label qui route vers lui**, on y écrit ce qu'on a vu, et on passe à autre chose.
Il la lira, et il décidera s'il finit, s'il complète ou s'il laisse.

C'est écrit ici parce que ça ne l'était pas, et que ça a coûté : le 23 septembre
2026, l'agent de maintenance a trouvé une branche du rendu finie depuis la
veille et sans PR — deux issues l'annonçaient livrée et en attente de fusion. Il
a ouvert la PR à sa place et allait la fusionner. Rien n'a été perdu, mais la
raison d'être de la règle est là : l'auteur d'une branche sait des choses que
son état Git ne dit pas. Ce qu'il allait encore y mettre, ce qu'il avait
délibérément laissé de côté, ce qu'il voulait remesurer après la fusion de
`main`. Quelqu'un qui fusionne à sa place lui retire cette décision et fabrique
un conflit là où il n'y en avait pas.

Le cas se reconnaît facilement : **une branche qui n'a pas de PR n'attend pas
qu'on l'aide, elle attend son auteur.** S'il faut vraiment qu'elle avance —
livraison bloquée, `main` rouge à cause d'elle — c'est une décision du
propriétaire du dépôt, à qui on la signale, pas une initiative d'agent.

Trois détails qui suivent de la même règle :

- **Ce qui est livré est fermé par celui qui l'a livré.** Une issue restée
  ouverte alors que son travail est dans `main`, on le signale ; on ne ferme pas
  à la place d'un autre, et surtout pas sur une déduction tirée d'un titre de
  commit.
- **Les branches mortes ne se suppriment pas non plus.** Le dépôt en porte des
  dizaines dont le contenu est déjà dans `main` par squash — une fusion les
  ferait *reculer*, pas avancer. Le ménage est une décision de propriétaire.
- **Signaler n'est pas se plaindre.** Une issue qui dit « voilà ce que j'ai vu,
  voilà ce que ça coûte, tu en fais ce que tu veux » est exactement ce qu'on
  attend d'un agent qui trouve quelque chose hors de son périmètre.

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

## Un commentaire de section est publié

**Ce que tu écris dans un commentaire finit sur le site.** L'onglet « Le
modèle » lit `docs/realisme.md` et les commentaires de section de
`src/engine/tick.ts` **au moment du build**, et les montre tels quels à un
visiteur qui n'ouvrira jamais le code. Les vingt-trois étapes d'une semaine
simulée, ce sont vos commentaires — pas une paraphrase, pas un résumé tenu à
côté.

Trois conséquences, et elles ne coûtent rien une fois sues :

- **Écris pour quelqu'un qui n'a pas le fichier sous les yeux.** « les rameaux
  de l'année lignifient peu à peu ; ce qui reste tendre est ce que le chevreuil
  mange » se lit sur la page. « cf. plus haut » ne se lit nulle part.
- **L'emphase s'écrit en gras markdown, jamais en capitales.** Le gras, la page
  le rend ; un mot mis en capitales pour insister arrive tel quel à l'écran et
  crie. Les sigles, eux, gardent leurs capitales — ce sont des sigles, pas des
  emphases.
- **Les renvois internes restent dans le code** et sont retirés à l'affichage :
  « (§7.4, ch5) », « (F18) », « (issue #55) » sont coupés par `extraction.ts`
  quand la parenthèse ne contient que ça. Une parenthèse qui dit quelque chose
  — « (en deux passes, ordre-indépendant) » — reste entière. Tu n'as donc pas à
  choisir entre référencer et être lisible.

Le greffon Vite refuse de construire sous cent critères ou quinze étapes : un
changement de convention casse le build au lieu de vider la page en silence.

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
