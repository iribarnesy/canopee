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

Une seule nuance, et elle joue *contre* une de mes demandes : les silhouettes
d'hiver **nues** se distinguent déjà au premier coup d'œil (bouleau, chêne
pubescent et pin sylvestre, capture à l'appui). La marcescence reste donc bien
un ⚪ bonus et je ne la remonte pas.

## Comment lire, et comment répondre

| Priorité | Ce que ça veut dire |
|---|---|
| **🔴 bloquant** | Je ne peux pas avancer sur le lot concerné sans ça. |
| **🟠 urgent** | Ne me bloque pas, mais c'est un bug ou une incohérence qui s'aggrave en attendant. |
| **🟡 pas pressé** | Attendu à une date connue (le lot est nommé). Rien ne brûle avant. |
| **⚪ bonus** | Ferait plaisir, se défend écologiquement, ne manquera à personne si ça ne vient pas. |

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

### La saison de végétation est encore thermique — **avant le lot L3**

La croissance et la transpiration passent toujours par `seasonFactor`, un
seuil de température, alors que `phenologie.ts` sait maintenant, espèce par
espèce, quand les feuilles sortent et quand elles cessent de travailler
(`partFoliaireActive`).

Conséquence pour moi : au lot L3, quand les saisons seront animées, **un
houppier entièrement doré d'octobre continuera de grandir à l'écran**, et un
caduc nu de janvier continuera de puiser dans le sol. L'incohérence sera
visible, pas seulement théorique.

Ce n'est pas une correction à faire à la légère : j'ai essayé, mesuré et
retiré. Le détail chiffré, les deux seuils écologiques qui bougent et l'ordre
des trois étapes sont dans **`docs/realisme.md`, « la saison de végétation est
encore thermique »**. En résumé : `GROWING_WEEKS` et les `pousseMaxMAn` ont été
calés AVEC cette saison-là, donc brancher la vraie phénologie par-dessus la
compte deux fois — il faut recalibrer, pas substituer.

### `ravageurs` par cellule dans l'instantané — **lots L2/L5**

La population de ravageurs par cellule existe (`state.soil.ravageurs`) et ne
voyage pas. C'est ce qui permet de dessiner une **défoliation qui s'étend en
tache** plutôt qu'un arbre qui dépérit sans raison lisible — et l'une des onze
causes de mort (`ravageurs`) en dépend pour être racontée autrement qu'en
faisant simplement disparaître l'arbre.

Un `Float32Array` de plus, à joindre à la liste de transfert.

### La chute d'une chandelle ne fait pas de trouée — **lot L5**

Quand une chandelle s'abat, elle quitte la carte sans rien changer au couvert.
Rien à animer, donc : pas de tache de lumière qui s'ouvre au sol, alors que
c'est précisément le moment intéressant du cycle sylvigénétique. Noté comme
conséquence ouverte dans le commit des chandelles.

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

## ⚪ Bonus

### La marcescence

Le chêne et le charme gardent leurs feuilles mortes et brunes une partie de
l'hiver, au lieu de les lâcher. `senescenceFoliaire` va au bout et la feuille
tombe.

Ça compte plus qu'il n'y paraît pour la décision D4 (« une essence = une
silhouette reconnaissable ») : une silhouette d'hiver garnie et rousse est un
critère de reconnaissance très fort sur le terrain, et il n'y en a pas
beaucoup en janvier. Un champ booléen par espèce suffirait.

### `herbeBiomasse` par cellule

`soilHerbe` transporte la couverture ; la biomasse présente, elle, ne suit pas.
Or l'une jaunit et l'autre reste : le **foin sur pied** de l'été est jaune et
abondant là où la couverture a déjà chuté. Deux nuances de tapis au lieu d'une,
pour un `Float32Array`.

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
