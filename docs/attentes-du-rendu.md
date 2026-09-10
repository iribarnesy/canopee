# Ce que le rendu attend du moteur

> Référence de contrat entre l'agent qui construit la vue isométrique et celui
> qui tient le moteur. Ce fichier dit ce qui voyage déjà, ce que le rendu peut
> calculer seul, et ce qui sera discuté plutôt que livré. **Les demandes, elles,
> ne s'écrivent pas ici : elles s'ouvrent en issue** (voir plus bas).

Le principe est celui de tout le projet : le moteur est l'actif précieux, il
reste pur et testable, et l'UI ne reçoit que des instantanés (`docs/stack.md`).
Une conséquence pratique : le rendu ne peut pas aller chercher ce dont il a
besoin, il faut que ça VOYAGE. D'où ce contrat.

## Une demande = une issue

Le formulaire `.github/ISSUE_TEMPLATE/attente-du-rendu.yml` pose les questions
utiles. Le titre part avec le préfixe `[attente-rendu]`, ce qui suffit à les
retrouver même sans label.

Trois champs comptent, et le deuxième est le plus important :

1. **Ce qu'il me faut** — le champ ou la grandeur, avec sa maille (par arbre ?
   par cellule ? un scalaire par semaine ?) et son unité.
2. **Ce que ça donne à l'écran** — le visuel précis que ça débloque. Pas « ce
   serait plus juste » : « sans ça, les onze morts se ressemblent toutes ».
3. **Ce que j'ai essayé** — si tu as cherché à le recalculer depuis
   l'instantané et que ça ne marche pas, dis pourquoi. C'est ce qui fait gagner
   le plus de temps.

Plus une mention **bloquant** (le rendu ne peut pas démarrer sans) ou
**souhaitable** (il y a un contournement moche mais viable) : elle décide de
l'ordre, et un besoin bloquant passe devant un besoin plus élégant.

Ensuite : le moteur relève les issues ouvertes, livre ce qui est justifié, et la
PR qui livre ferme l'issue (`Closes #N`). L'état d'une demande, c'est donc
l'état de son issue — rien à tenir à jour à la main.

Une demande peut aussi être **discutée** plutôt que livrée. Dans ce cas la
réponse va dans le fil de l'issue, avec l'alternative, et l'issue reste ouverte
tant qu'on n'est pas d'accord. Les quatre motifs, pour qu'ils ne soient jamais
une surprise :

1. **Ça voyage déjà** — ou ça se déduit en une ligne de ce qui voyage.
2. **Ça casse le déterminisme** — l'aléa passe par un PRNG seedé, et l'ordre de
   consommation des tirages fait partie du résultat. Le parcours de
   `feu.ts:propager()` en particulier ne se réordonne pas : il dépile, et les
   tests de non-régression du feu en dépendent. Une grandeur dérivée se calcule
   toujours APRÈS coup, en passe pure.
3. **C'est de la calibration** — le besoin est réel, mais le satisfaire déplace
   des seuils écologiques. Ça se traite comme un chantier de calibration, avec
   des mesures, pas comme un champ à ajouter.
4. **C'est du rendu** — l'interpolation entre deux semaines, le lissage, le
   LOD, le choix des couleurs : le moteur donne des grandeurs, pas des pixels.

Si pour une raison quelconque tu ne peux pas ouvrir d'issue, écris la demande en
bas de ce fichier sous un titre `### `, pousse-la, et elle sera convertie en
issue au passage suivant.

## Ce qui voyage déjà

À vérifier avant d'ouvrir une issue — `src/game/protocol.ts` est la référence.

**Une fois, au lancement** (`StationInfo`) : `altitudesM` (le relief, maille du
tick), `nappeCm` (champ figé), `enEau`, `eau`, `coteM`, `ruMm`, `phInitial`,
`nappeEquilibreCm`, `ventExposition`, `meteoLabel`.

**À chaque instantané** (`Snapshot`) : la semaine, la météo, l'année civile, le
CO₂, l'économie, l'inventaire carbone, la biodiversité, les `fluxes` du tick, la
pression de gibier, le stock de BRF, le paysage, et le contexte phénologique
(`pheno`).

La météo (`weather`, un `WeekWeather` entier) porte depuis peu **le vent** :

| Champ | Ce qu'il porte |
|---|---|
| `ventVersRad` | cap vers lequel le vent SOUFFLE, radians, repère de la carte (+x = est, +y = nord) |
| `ventMoyMs` | vitesse moyenne de la semaine à 10 m, m/s |

Trois mises en garde, parce que chacune est un contresens possible à l'écran :

1. **`Vers`, pas « d'où »**. La météo nomme un vent par sa provenance — un
   « vent d'ouest » vient de l'ouest. Ici c'est la direction du MOUVEMENT, comme
   `directionRad` d'une tige tombée ou `versLAval` : un vent d'ouest vaut
   `ventVersRad = 0`, puisqu'il pousse vers l'est. Incliner un panache avec le
   signe inverse le ferait pencher face au feu.
2. **`ventMoyMs` n'est pas `ventExposition`.** Le premier est le vent régional,
   le second (dans `StationInfo`) un ABRI ∈ [0,1]. Ce que la parcelle reçoit,
   c'est le produit des deux — `ventRecuParLeSite()` dans `feu.ts` le calcule, et
   c'est cette valeur-là qui pousse le front. Pour l'amplitude d'un panache ou
   d'un balancement de houppier, c'est aussi le produit qu'il faut, pas la
   vitesse brute : un vallon fermé ne balance pas comme une lande.
3. **Le cap ne vire pas dans l'année, et la vitesse est un vent MOYEN
   hebdomadaire.** Le régime dominant est constant (flux d'ouest à sud-ouest,
   `VENT_DOMINANT_VERS_RAD`), la vitesse suit la saison — maximum en hiver,
   minimum fin juillet. Donc : un panache ne tournera pas pendant un acte, et un
   vent hebdomadaire moyen sous-estime toujours la rafale qui fait courir un vrai
   incendie. Ce que le vent règle, c'est que deux feux de la même parcelle
   penchent maintenant **du même côté** au lieu de s'éventer autour de leur
   origine.

Une rose des vents par station reste à faire : les quatre stations partagent
aujourd'hui le même régime, faute de données (`SyntheticClimate.ventDominantVersRad`
est là pour qu'une station le déclare quand on l'aura).

**Par cellule**, en `Float32Array`/`Uint8Array` transférés :

| Grille | Ce qu'elle porte |
|---|---|
| `soilWater` | eau de l'horizon de surface, mm |
| `soilPh` | pH |
| `soilN` | azote minéral, g/m² |
| `soilHerbe` | couverture herbacée ∈ [0,1] |
| `soilHerbeBiomasse` | herbe SUR PIED — elle reste quand l'herbe jaunit |
| `soilHerbeHumidite` | humidité VÉCUE du tapis ∈ [0,1] : la surface, lissée sur ~6 semaines — la pelouse grillée |
| `soilLitiereCG` | litière, gC/m² : le tapis de novembre, le paillage, les cendres |
| `soilBoisAuSol` | bois mort COUCHÉ, gC/m² : où poser des troncs |
| `soilBoisEnTravers` | part de ce bois qui BARRE l'eau ∈ [0,1] : le tronc en travers de la pente |
| `soilRavageurs` | pression de ravageurs — la TACHE de défoliation, pas sa moyenne |
| `soilEpaisseurPerdueCm` | érosion cumulée, signée : négatif = dépôt |
| `soilNappeCm` | profondeur de la nappe, cm |
| `soilEngorgement` | engorgement du profil ∈ [0,1] |
| `soilDebordementMm` | ce qui n'est pas rentré dans le sol cette semaine, mm |
| `soilLumiere` | lumière arrivant au sol ∈ [0,1] |
| `soilCloture` | cellules closes (1) |

**Par arbre** (`SnapshotTree`, chandelles comprises) : `id`, `especeId`, `x`,
`y`, `heightM`, `ageWeeks`, `stress`, `fruitsKg`, `hauteurElagueeM`,
`baseHouppierM`, `protege`, `chandelle`, `teteTrogneM`, `recepages`,
`diametreTeteCm`, `caviteTeteL`, `vigueur`,
`dommageHydraulique`, `mortSemaine`, `brulEeSemaine`, `causeMort`,
`derniereLeveeSemaine`, `floraison`, `fruitProgress`, `bloomFrosted`,
`pousseTendreM`, `frotteSemaine`, `brouteSemaine`.

`baseHouppierM` mérite un mot : c'est la hauteur en dessous de laquelle il n'y a
plus de branches vivantes, donc du fût nu à dessiner. Elle ne se déduit de rien
— ni de l'espèce (le même chêne est branchu en pré et nu sur quinze mètres en
futaie), ni de `hauteurElagueeM`, qui ne compte que le coup de scie et pas
l'ombre. Elle remplace l'approximation que le rendu s'était faite
(`conifereBase`, 0,3 pour un caduc et 0,2 pour un conifère), laquelle dessinait
deux chênes voisins pareillement alors que le moteur ne les traite pas pareil.

`brouteSemaine` dit qu'un plant a été brouté, et QUAND. `pousseTendreM` ne le
dit pas : c'est un stock, qui baisse par lignification et par dormance autant
que par la dent du chevreuil — le peindre en « brouté » couvrirait surtout des
arbres en hiver. Même rôle que `frotteSemaine`, et pour la même raison.

`diametreTeteCm` et `caviteTeteL` (trogne.ts) disent la tête d'un têtard : le
renflement à dessiner, et le creux qu'il abrite. Le compteur `recepages` ne
suffit pas à les déduire — la part creusée n'est pas linéaire, et elle plafonne
— et surtout `biodiversite.ts` lit EXACTEMENT ces valeurs pour noter la
parcelle. Les recalculer au rendu, c'est prendre le risque de dessiner une tête
qui ne vaut pas ce que le moteur lui accorde.

**Ce qui s'est passé depuis le dernier instantané** : `events`, `refusals`,
`morts` (avec `id` et position), `naissances` (semis installés : `id`, position,
espèce, hauteur à la levée — la moitié positive de `morts`, même forme ; à ne
PAS confondre avec « arbre jeune », voir plus bas),
`franchissements` (`{ id, deStade, versStade }` : les tiges que la CROISSANCE a
fait changer de stade), `chutes` (chandelles abattues : direction et empreinte
du tronc), `incendie` (compteurs + `origine`, `brulees`, `rangs` et `charges` du front),
et `gestes`, qui ont DEUX mailles :

- `{ type, ids }` pour ce qui désigne des arbres — `couper`, `eclaircir`,
  `elaguer`, `trogner`, `receper`, `brouter`, `frotter` ;
- `{ type, cellules }` pour ce qui désigne du sol — `chauler`, `faucher`,
  `epandreBrf`, `labourer`, `ramasserBoisMort`, `cloturer`. Indices de cellule
  identiques à ceux des grilles.

Dans les deux cas, ce qui est nommé est ce qui a RÉELLEMENT été touché : le
plafond horaire arrête souvent un chantier en cours de route, et une pelouse
déjà rase ne se fauche pas. `estGesteSurArbres` et `estGesteSurZone` discriminent
les deux mailles (`find` rend l'union entière, que TypeScript ne rétrécit pas
sur le seul `type`).

Les cinq gestes du joueur qui retirent du bois portent en plus `retire`, un
`ArbreRetire[]` dans le même ordre que `ids` : `id`, `x`, `y`, `especeId`,
`hauteurAvantM` / `hauteurApresM`, `baseHouppierAvantM` / `baseHouppierApresM`,
et `directionRad`. C'est un enregistrement COMPLET, pas un delta, parce qu'un
arbre coupé quitte `state.trees` dans le même tick : son identifiant seul ne
mène plus à rien dans l'instantané. `hauteurApresM` à 0 signe ce départ ; sinon
c'est ce qui reste debout — tête de trogne, souche de recépage, tige intacte
d'un élagage. `directionRad` n'est présent que quand une tige ENTIÈRE est
tombée (`couper`, `eclaircir`, `receper`) : c'est l'orientation en travers de
la pente, la seule que le moteur sache justifier — il ne modélise ni
cloisonnement ni sens de débardage, et sur terrain plat elle ne veut rien dire.
Pour `elaguer` et `trogner` la charpente est démontée sur place, le moteur n'y
voit pas de direction unique et n'en invente pas. `brouter` et `frotter` n'ont
pas de `retire` : le gibier prélève un stock (`pousseTendreM`), pas un volume
géométrique, et sa date voyage par `brouteSemaine`.

Une **naissance n'est pas un arbre jeune**, et `ageWeeks` ne suffit pas à les
confondre impunément : les trois endroits qui créent un arbre — recrutement
naturel, geste `planter`, semis en vrac — posent tous `ageWeeks: 0` et
l'incrémentent d'un par tick. Un plant acheté et un semis levé la même semaine
portent donc le même âge pour toujours. Une règle du genre « `ageWeeks` plus
petit que le nombre de semaines écoulées » pointerait donc d'un point vert la
plantation du joueur au même titre qu'une recrue — ce n'est pas la même image,
et l'erreur ne se voit pas avant de planter deux cents tiges d'un coup.
`naissances` ne contient que ce que le recrutement a installé. Un test le fixe.

Le **stade** d'une tige (`semis`, `gaulis`, `perchis`, `futaie`) ne voyage PAS
par arbre, et c'est volontaire : `stadeDe(heightM)` est pure et importable
depuis l'UI (`src/engine/stades.ts`), donc le rendu la calcule sans rien
demander. Seul le FRANCHISSEMENT voyage, parce que lui seul demande de comparer
deux instants. Il ne couvre que la croissance : un arbre rabattu par une trogne
ou un recépage descend l'échelle, et cette chute-là se lit déjà dans `retire`
(`hauteurAvantM` / `hauteurApresM`), dont le rendu tire les deux stades. Les
bornes sont celles de la sylviculture française, en DIAMÈTRE (2,5 / 7,5 /
17,5 cm), et passent par `diametreCm` — un proxy assumé, dont elles héritent
l'approximation. Le module le dit en détail, fourré compris.

**Et ce que le rendu peut calculer lui-même**, sans rien demander : tout ce qui
est une fonction pure de l'instantané et des fiches d'espèces, puisque le moteur
est importable depuis l'UI. En particulier le rayon de houppier depuis la
hauteur (`light.ts:crownRadiusM`), et le feuillage de n'importe quelle espèce
depuis `Snapshot.pheno` — mais il y en a **TROIS**, et pour une fois c'est le
rendu que la distinction concerne le plus :

- `partFoliaireOmbrageanteDans(espece, pheno)` — ce qui intercepte la lumière,
  feuilles mortes d'un marcescent comprises. C'est la silhouette : la masse à
  dessiner, et l'ombre qu'elle porte. La plus grande des trois.
- `partFoliaireActiveDans(espece, pheno)` — le feuillage vivant déployé, celui
  qui commande la croissance et la transpiration.
- `partFoliaireAssimilanteDans(espece, pheno)` — le vivant **encore vert**. La
  plus petite des trois.

**Les deux écarts sont ce que le rendu vient chercher**, et aucun champ n'a à
voyager pour les dire :

| écart | ce que ça donne à l'écran |
|---|---|
| ombrageante − active | la part de feuillage **mort** encore accroché : le charme brun-roux de février, à colorer en brun plutôt qu'en vert |
| active − assimilante | la part **jaunie mais toujours attachée** : le houppier entièrement doré d'octobre, garni et à l'arrêt |

Deux fonctions séparent l'oui/non de l'avancement, et il ne faut pas les
confondre — la confusion a déjà coûté un bug ici :
`senescenceEnCoursDans(pheno)` dit si la chute est enclenchée ;
`senescenceDans(espece, pheno)` dit **à quel point** le feuillage a jauni,
∈ [0,1]. C'est la seconde qu'il faut pour colorer un houppier.

L'assimilante n'est branchée sur rien côté moteur, et c'est délibéré : brancher
la sénescence sur la croissance suppose de recalibrer une seconde fois
(`docs/realisme.md`, « le houppier doré produit encore »). L'écart vaut deux
semaines par an sur vingt-six.

## Deux limites connues

- **Les arbres sont sérialisés, pas transférés.** Au-delà de ~20 000 arbres il
  faudra passer en tableaux typés parallèles (un `Float32Array` par champ). Si
  tu vois le coût monter sur une friche en pleine succession, ouvre une issue.
- **Le rembobinage n'est pas fait.** Rejouer une période à ×1 après avoir joué à
  ×64 demande un instantané par semaine SIMULÉE quand l'enregistrement est
  actif, au lieu d'un par lot (`startLoop` avale jusqu'à 26 semaines par pas).
  ~280 ko par instantané sur 1 ha, ~15 Mo l'année : tenable, à cadrer avant de
  figer le protocole.

---

# Ce qui est tranché, et ce sur quoi je me suis trompé

> Cette partie vient de la version que la branche de rendu portait avant que ce
> fichier ne devienne la référence du contrat. Ce ne sont **pas** des demandes —
> aucune n'attend quoi que ce soit du moteur. C'est de la mémoire : ce qu'il ne
> faut pas rouvrir sans raison neuve, et ce que j'ai affirmé à tort.

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
