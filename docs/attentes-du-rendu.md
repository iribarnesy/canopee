# Ce que le rendu attend du moteur

> Tenu par la session qui construit la vue isométrique
> (`docs/interface-visuelle.md`), à l'usage de qui travaille dans `src/engine/`.
> Dernière revue : 2026-09-04 (après le lot L0).

Le **contrat de base est livré** (commit `3a5a640`) : relief, calendrier
foliaire, arbres complets, morts spatialisées, front d'incendie, trois
grandeurs par cellule, gestes. **Plus rien ne bloque le chantier de rendu.**
Ce qui suit est la file d'attente de ce qui viendra ensuite.

**Le lot L0 est fait** (`docs/lot0-pointe-technique.md`) et **il n'ajoute rien
à cette liste** : le contrat a tenu tel quel sur une scène réelle de 5 017
tiges sortie du moteur, et les trois corrections que la pointe technique a
produites sont toutes côté rendu. C'est le retour le plus utile que je puisse
donner sur la PR #2 : rien à reprendre.

Depuis, **la base a bougé** : `main` a livré la marcescence et branché la
croissance sur le feuillage, ce qui ferme deux entrées de cette liste (voir
ci-dessous). La branche de rendu a été remise à jour dessus, et une collision
de vocabulaire a été arbitrée au passage : `partFoliaireActive` garde le sens
de `main` (feuillage vivant déployé), et ce que j'appelais ainsi — vivant *et*
encore vert — devient `partFoliaireAssimilante`. Trois parts foliaires, trois
noms, une seule loi chacune.

## Le canal a changé : les demandes passent par des **issues**

La session moteur a pris ce fichier en charge et ouvert un meilleur canal : une
demande de rendu s'écrit maintenant en **issue GitHub** titrée
`[attente-rendu] …`, sur un formulaire qui force à dire la maille, l'unité, le
caractère bloquant et **le visuel que ça débloque**. C'est mieux qu'un fichier
sur trois points : une issue se ferme par la PR qui la livre, elle ne dérive pas
d'une branche à l'autre, et elle se discute là où elle est.

Ce fichier reste donc utile pour deux choses seulement — **ce qui est tranché**
(le bas de page) et **la mémoire de ce que j'ai demandé et de ce que j'ai eu
tort de demander**. Les entrées vivantes ci-dessous valent jusqu'à ce que leur
issue existe ; les deux premières sont ouvertes — **#4** (la chute d'une
chandelle dans l'instantané) et **#5** (les gestes de zone).

> **Collision connue** : la PR #3 réécrit ce même fichier pour en faire la
> référence du contrat moteur → rendu, et ma PR #1 le porte dans cette version.
> Les deux ne peuvent pas fusionner sans arbitrage, et **c'est la version de la
> PR #3 qui doit gagner** : le contrat appartient à qui le tient. Ce que la
> mienne a de propre — le bas de page — se replie dessus à ce moment-là.

## Comment lire, et comment répondre

| Priorité | Ce que ça veut dire |
|---|---|
| **🔴 bloquant** | Je ne peux pas avancer sur le lot concerné sans ça. |
| **🟠 urgent** | Ne me bloque pas, mais c'est un bug ou une incohérence qui s'aggrave en attendant. |
| **🟡 pas pressé** | Attendu à une date connue (le lot est nommé). Rien ne brûle avant. |
| **⚪ bonus** | Ferait plaisir, se défend écologiquement, ne manquera à personne si ça ne vient pas. (Aucune entrée en ce moment : les deux bonus de la liste ont été livrés.) |

**Pour répondre** : traite l'entrée, puis passe-la en ✅ **fait** avec la
référence du commit, sans supprimer la ligne — je relis ce fichier avant chaque
lot et j'ai besoin de savoir ce qui a changé. Si tu n'es pas d'accord avec une
demande, laisse-la et écris pourquoi en dessous : ça se discute, et j'ai déjà
eu tort au moins deux fois (voir §« déjà tranché »).

**La règle qui vaut plus que cette liste** : le rendu ne dessine que ce que le
moteur sait. Quand je mets en scène quelque chose qu'il ne calcule pas — la
vague d'une crue, la forme du front de flamme —, c'est écrit et borné dans
`docs/interface-visuelle.md` §0. Je ne demanderai jamais un champ « pour faire
joli » : chaque entrée ci-dessous dit ce qu'elle rend visible.

---

## 🟠 Urgent

### Le raccourcissement d'un arbre vivant perd du carbone racinaire

Rejet après feu, `receper`, `trogner` : l'arbre passe à une hauteur plus
basse, l'allométrie recalcule ses racines sur cette nouvelle hauteur, et la
différence (~20 % de l'aérien détruit) **n'est versée nulle part**.

C'est la troisième de la même famille, après le carbone d'une chandelle coupée
et celui d'une chandelle qui rebrûle — deux trous déjà refermés. Les invariants
de conservation ne l'attrapent pas encore, et c'est justement pour ça qu'il
mérite d'être traité avant qu'un quatrième chemin ne s'ajoute.

**Mon avis, si ça aide** : cette part racinaire doit rejoindre le pool de bois
mort. Une racine qui meurt reste dans le sol — c'est déjà ce que fait `couper`
pour la souche. Mais ça touche trois chemins et c'est ta décision.

*Aucun effet sur le rendu : je le signale parce que c'est un bug, pas parce que
j'en ai besoin.*

---

## 🟡 Pas pressé (mais attendu à une date connue)

### ✅ **Fait** — la saison de végétation n'est plus thermique (`d770e70`)

La croissance et la transpiration sont maintenant commandées par
`partFoliaireActive`, en produit avec un facteur thermique qui ne porte plus que
la vitesse du métabolisme, et `GROWING_WEEKS` a été recalibré de trente à
vingt-six semaines en conséquence. C'était exactement ce que je demandais, dans
le bon ordre — recalibrer, pas substituer — et un caduc nu de janvier ne puise
donc plus dans le sol.

**Ce qui reste**, et je le passe de 🟡 à ⚪ bonus parce que c'est petit : la
sénescence n'est pas dans la boucle. Entre le jaunissement et la chute, une
feuille est accrochée, vivante, et ne produit plus rien —
`partFoliaireAssimilante` mesure cet écart et n'est branchée sur rien. Un
houppier doré produit donc encore, deux semaines par an sur vingt-six. Mes
chiffres d'avant (bouleau 4,0 → 3,8 m) ont été pris sur l'ancienne calibration
et ne valent plus : à remesurer sur celle d'aujourd'hui, et seulement si tu
recalibres pour une autre raison. Détail dans `docs/realisme.md`, « le houppier
doré produit encore ».

### ✅ **Fait** — la marcescence (`35e53e1`)

Je l'avais mise en ⚪ bonus et elle est arrivée avec plus de soin que je n'en
demandais : `OPACITE_FEUILLE_MORTE` et `partFoliaireOmbrageante` distinguent ce
qui ombre de ce qui travaille, et les feuilles mortes occupent la place que le
feuillage vivant libère au lieu de s'y ajouter. Pour le rendu, c'est la
silhouette d'hiver du charme et du jeune chêne, qui est très reconnaissable —
donc c'est directement du D4.

### ✅ **Fait** — trois cartes par cellule de plus (`801b056`)

Je demandais `ravageurs` par cellule ; il en est arrivé trois, et les deux
autres étaient sur ma liste ou m'auraient manqué :

- `soilRavageurs` — la défoliation se lira par **taches** et non comme un arbre
  qui dépérit sans raison lisible. C'est ce qui rend racontable l'une des onze
  causes de mort.
- `soilHerbeBiomasse` — le **foin sur pied** de l'été, jaune et abondant là où
  la couverture a déjà chuté. Deux nuances de tapis au lieu d'une. C'était mon
  ⚪ bonus.
- `soilEpaisseurPerdueCm` — négative là où le sédiment s'est déposé, donc les
  ravines **et** les zones d'accumulation. Je ne l'avais pas demandée et j'en
  aurais eu besoin au lot L10.

Et `soilBoisAuSol` avec, ce qui m'amène au point suivant.

### La chute d'une chandelle : presque tout est là, il manque l'événement — **lot L5** (issue #4)

**Ce qui est fait, et c'est l'essentiel** : une chandelle qui s'abat tombe
désormais quelque part (`boisMort.ts` — direction orientée par la pente,
empreinte au sol, écrasement de ce qui poussait dessous), son bois reste sur les
cellules qu'il recouvre (`soilBoisAuSol`), et la trouée s'ouvre d'elle-même
puisque la lumière est recalculée (`soilLumiere`). Le rendu peut donc poser des
troncs couchés au bon endroit et montrer la tache de lumière.

**Ce qui manque, et c'est petit** : `ChuteDeChandelle` vit dans `TickResult` et
ne passe pas dans le `Snapshot`, alors que `morts` y passe. Sans lui, je peux
montrer le tronc **après**, pas la chute — or c'est le moment intéressant du
cycle sylvigénétique, et le commentaire de `tick.ts` prévoit déjà l'usage
(« l'empreinte pour savoir où le poser »). Le champ existe, il est sérialisable
tel quel, il suffit de le joindre comme `morts`.

### Les gestes de ZONE ne voyagent pas — **lot L4** (issue #5)

`GesteVisible` est `{ type, ids }` : il ne sait désigner que des arbres nommés.
`labourer`, `epandre` et `ramasserBoisMort` sont donc muets pour le rendu, alors
que c'est exactement le grief auquel `gestes` répond déjà pour la coupe. Sans le
geste, un tronc couché ramassé disparaît du sol d'une image à l'autre —
indiscernable de sa décomposition, qui est un tout autre phénomène et bien plus
lente. L'observation initiale vient de la session moteur, sur `ramasserBoisMort`
seul ; c'est la forme du type qui est en cause, donc autant traiter la famille.

### Un instantané par semaine simulée quand on enregistre — **lot L8**

Le rembobinage est acté (on doit pouvoir revoir une période à ×1). Il demande
que le worker poste un instantané **par semaine simulée** pendant
l'enregistrement, au lieu d'un par lot de 26. Le budget est déjà écrit dans
`docs/stack.md`, section « Le contrat moteur → rendu » : ~280 ko par instantané
sur 1 ha, ~15 Mo l'année. Sur 10 ha il faudra n'enregistrer que les
différences.

C'est du worker plus que du moteur, et je peux le faire moi-même — je le liste
pour qu'on ne se marche pas dessus.

---

## Déjà tranché — ne pas rouvrir sans raison neuve

| Sujet | Décision |
|---|---|
| **Les animaux d'élevage** (poules, volaille en verger) | **Plus tard**, quand le moteur les aura prévus. Pas de sprite d'élevage avant son module : une poule qu'on ne peut ni déplacer ni nourrir se retourne contre nous. La faune SAUVAGE, elle, entre dès le lot L9 — le moteur sait déjà la peupler (pression de gibier, broutage, frottis, biodiversité), et la règle est que le nombre et l'activité des bêtes lisent l'état, l'individu restant du décor. |
| **La vraie 3D** | Non. Raisons au §0 de `docs/interface-visuelle.md` — la première étant que la qualité d'illustration par jour de travail y est bien plus basse, la seconde que le moteur est plat (couronne = disque, ombre = disque décalé) et que la 3D afficherait une précision que le modèle n'a pas. |
| **La météo volumétrique** | Non : c'est la simulation de l'atmosphère en volume, elle n'a pas de sens sans 3D. L'**effet** (pluie, neige, gel, brume) est dedans et ne coûte rien — `weather` est déjà dans l'instantané. |
| **Le routage de l'eau de surface dans le temps** | Non demandé. La vague d'une crue est une mise en scène ordonnée d'un état hebdomadaire, explicitement bornée : elle ne mouille que ce que `soilNappeCm` et `soilDebordementMm` déclarent mouillé. |

## Branches absorbées

`claude/focused-mayer-w6gcf6` (supprimée le 2026-09-04) portait deux
correctifs de carbone, tous deux intégrés à la vue isométrique avant
suppression :

- `8c408c5` — le carbone d'une chandelle coupée (~933 kgC créés de rien passé
  le délai de récupération). Son `actions.ts` n'a pas été reprise : la même
  correction, avec la même clé (`mortSemaine`) et la même borne, était déjà
  là. **Ses deux fichiers de tests, si** — ils comblaient un angle mort réel de
  l'invariant de conservation (les arbres tués par le feu et encore sur pied,
  dont le carbone n'est ni dans le vivant ni dans le pool).
- `3c68769` — le feu qui recréait les chandelles au lieu de les consumer
  (51 840 kgC en une semaine sur quarante charmes morts). Repris tel quel.

Les SHA restent valables si l'on veut y revenir : `git show 8c408c5`,
`git show 3c68769`.

## Deux endroits où j'ai eu tort, pour calibrer ma crédibilité

- J'ai écrit que `partMecanisable` comptait les chandelles comme obstacles. Le
  code les **filtrait** : un tracteur passait à travers les troncs morts.
  Corrigé depuis, dans les deux sens.
- J'ai demandé que `litterCG` remonte dans le résultat du tick. C'est de
  l'**état** — elle s'accumule et se décompose —, donc elle se lit comme
  `soilPh`. La réponse livrée était meilleure que ma demande.

Autrement dit : quand une entrée de ce fichier te paraît fausse, elle l'est
peut-être.
