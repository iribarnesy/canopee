# Canopée — L'interface visuelle (vue isométrique)

> Inventaire, v0.4 (2026-09-04). **Le lot L0 est développé, le reste non.** Ce
> document est la liste de tout ce qu'il faut construire, dans quel ordre, et ce
> que le moteur devra apprendre à dire pour que ce soit possible. Les estimations
> de charge sont en journées d'un développeur qui connaît le dépôt (S ≈ ½ j,
> M ≈ 1–2 j, L ≈ 3–5 j, XL ≈ une semaine et plus).
>
> **v0.2** — les décisions sont prises (§1 : Pixi, dimétrique 2:1, **relief à
> l'échelle vraie**, **essences reconnaissables une par une**, phénologie dans
> le moteur). Le périmètre s'ouvre : **la faune visible, la pluie et le son
> entrent** ; la vraie 3D et la météo volumétrique restent dehors, avec les
> raisons. Ces choix changent la charge : voir §9.
>
> **v0.3** — le **contrat moteur → rendu est livré** (§2), et le catalogue est
> passé à vingt-cinq essences, ce qui renchérit D4. Il n'y a plus de blocage
> côté moteur : le chantier peut commencer au lot L0.
>
> **v0.4** — **le lot L0 est fait, et il a corrigé ce document** : D1 est
> renversée (Canvas 2D d'abord — *annulé en v0.5, la mesure était fausse*),
> l'enveloppe du houppier ne peut pas émerger du branchement, et deux règles
> d'architecture apparaissent. Tout est mesuré et chiffré dans
> `docs/lot0-pointe-technique.md` ; les passages touchés ci-dessous portent la
> mention **(L0)**.
>
> **v0.5** — **le banc L0 a été rejoué sur une machine avec carte graphique, et
> D1 est tranchée pour Pixi.** La réserve est levée dans les deux sens : la
> première mesure était fausse (elle chronométrait la soumission du dessin et
> non l'image, sur un WebGL rendu en logiciel), et la marge de Canvas 2D
> n'existait pas — sa capacité valait exactement la scène. Pixi porte 4 à 8×
> plus de tiges, `pixi.js` passe en dépendance de production, le banc est
> supprimé et L1 démarre dessus. Une exigence nouvelle pour L1 : **découper par
> emprise visible**, le zoom rapproché étant le point de rupture. Deux constats
> de plus : le pire cas de la friche est l'**an 30** et non l'an 50, et la
> crainte d'une explosion du coût de l'atlas ne s'est pas réalisée.

---

## 0. Ce qu'on construit, et ce qu'on laisse dehors

L'écran de jeu actuel (`src/game/GameView.tsx`) est un **tableau de bord** :
une carte en vue oblique, six calques de sol, un HUD dense, un fil
d'événements, tous les leviers. Il est fait pour comprendre et pour régler.
Il ne bouge pas — c'est l'instrument de mesure, et c'est aussi la vue de
débogage dont on aura besoin pour développer l'autre.

On ajoute une **vue parcelle** : isométrique, en diagonale vue d'en haut,
animée, **habitée**. Elle est faite pour *regarder* la parcelle vivre, pas pour
la piloter au gramme d'azote près. Les deux vues partagent la même partie :
même worker, même instantané, une bascule dans l'écran de jeu (pas un troisième
onglet à côté du labo — sinon on jouerait deux parties).

Un mot sur « minimaliste », parce que la v0.1 s'était trompée dessus : le
**style** est sobre (aplats, une source de lumière, palette courte, pas de
texture bruitée), mais le **dessin est détaillé** — on doit reconnaître un
bouleau d'un aulne (D4). Sobriété du traitement, richesse du contenu : ce n'est
pas contradictoire, c'est exactement ce que fait une planche botanique.

### Trois principes non négociables

1. **Le rendu n'invente rien que le moteur ne sache.** Un arbre jaunit à
   l'écran parce que sa `vigueur` a baissé, pas parce que c'est joli en
   septembre. Quand on *met en scène* quelque chose que le moteur ne calcule
   pas — la vague d'une crue, la forme exacte du front de flamme — on le dit
   ici, explicitement, et la mise en scène ne doit jamais contredire l'état :
   la vague monte là où `soilNappeCm ≤ 5`, nulle part ailleurs. C'est la même
   exigence que le « proxy honnête » de l'indice de biodiversité
   (docs/regles.md §13).

   **Et quand le moteur ne sait pas, on ouvre une ISSUE — on ne comble pas le
   trou côté rendu.** C'est la règle de procédure, et elle a manqué une fois :
   pour montrer une pelouse sèche j'ai décrété dans `palette.ts` un seuil de
   grillage sur la réserve utile, alors qu'un seuil qui décide qu'une herbe
   souffre est une affirmation de modèle. Elle était fausse en plus d'être
   déplacée — le moteur travaille sur l'humidité de l'horizon de SURFACE lissée
   sur six semaines (`humiditeVecue` dans `herbe.ts`, seuil 0,35), pas sur la
   réserve du profil sans inertie.
   Le coût réel de la faute n'est pas la valeur : c'est qu'**une teinte inventée
   pour compenser une donnée absente rend le manque permanent**. Plus personne
   ne voit qu'il manque quelque chose, puisque l'écran montre quelque chose. Le
   défaut se fige en fonctionnalité, et il faudra le rétro-trouver.
   La marche à suivre, donc : le rendu choisit COMMENT montrer ce que le moteur
   dit ; il ne choisit jamais CE QUE le moteur dit. Le manque part en issue,
   avec la grandeur qu'il faudrait et l'usage visuel qui la réclame.
2. **Aucun asset graphique binaire.** Pas de PNG dessinés à la main, pas de
   pipeline d'art. Les silhouettes sont **générées au démarrage** par du code
   vectoriel dans un atlas de textures — y compris les feuilles et les fruits,
   qui sont des **tracés SVG écrits en TypeScript** d'après des références
   botaniques (§4). Conséquences : le style est paramétrable d'un seul endroit,
   chaque combinaison (essence × stade × saison × gestion) est gratuite, et le
   dépôt ne grossit pas. C'est ce qui rend tenable l'exigence de **reconnaître
   chaque essence** sur vingt-cinq espèces (et quarante à terme).
   *Une seule exception, assumée* : le **son** (§5.10) suppose des fichiers
   audio. Ils vivront dans `data/sons/` avec leur licence et leur provenance,
   au même titre que les valeurs écologiques sont sourcées.
3. **Le moteur reste pur.** `src/render/` peut lire `src/engine/` (types et
   fonctions pures) ; l'inverse est déjà interdit par
   `scripts/check-boundaries.sh`. À ajouter au même script : **pas de
   `Math.random` dans `src/render/`** non plus (§8).

### Ce qui est dedans, ce qui est dehors, et pourquoi

**Dedans, et c'était une erreur de l'exclure** :

- **La faune visible** (§5.10, lot L9). Des brocards qui se grattent, des
  oiseaux, des papillons sur les floraisons. Le moteur ne simule aucun animal
  individuellement — il connaît une `pressionGibier` (un scalaire), un
  `broutageKg` hebdomadaire, un `frotteSemaine` par arbre, une densité de
  cervidés du paysage et un indice de biodiversité. La règle : **le nombre et
  le comportement des bêtes lisent l'état du moteur, les individus ne sont pas
  simulés.** Trois brocards à l'écran parce que `pressionGibier` est haute, et
  celui qui frotte le fait sur un arbre dont `frotteSemaine` vient d'être
  posée. C'est de la figuration honnête, et ça rend enfin *visible* un indice
  de biodiversité qui ne se lit aujourd'hui qu'en chiffre.
- **La pluie, la neige, le gel, la brume** (§5.7). Une animation de pluie la
  semaine où il a plu, c'est `weather.rainMm` qui est déjà dans l'instantané :
  rien à demander au moteur, un grand effet.
- **Le son** (§5.10, lot L9). Le vent dans les feuilles dont l'intensité suit
  `ventExposition` et la densité du couvert, les oiseaux selon la saison et
  l'indice de biodiversité, la pluie, la tronçonneuse, le ronflement de
  l'incendie. Web Audio, quelques boucles courtes. Rapport effet/coût
  excellent, et c'est ce qui fait qu'on reste devant l'écran.

**Les poules** (et les animaux d'élevage) sont un cas à part, et il faut le
dire franchement : **le moteur ne les connaît pas du tout**.
`docs/regles.md` §14 met « animaux d'élevage complets » en v2. Une poule
purement décorative se retournerait contre nous — on voudrait tout de suite la
déplacer, la nourrir, compter ses œufs, et voir son azote au sol. Ce n'est pas
une grosse brique (un parcours, un aliment, une déposition d'azote localisée,
des œufs, un peu de travail hebdomadaire) et c'est très à sa place dans un jeu
d'agroforesterie — la volaille en verger est un classique. Mais c'est **un
module moteur**, pas un sprite. **Décidé (Q7) : plus tard, quand le moteur l'aura
prévu.** Ça reste un beau chantier — mais dans la file du moteur, pas dans
celle du rendu.

**Dehors, avec les raisons** :

- **La vraie 3D.** Trois raisons, dans l'ordre d'importance.
  1. *La qualité d'illustration par jour de travail est bien plus haute en 2D.*
     Tu veux reconnaître un frêne d'un châtaignier : en 2D c'est une
     silhouette et des feuilles dessinées ; en 3D c'est un maillage, des
     textures, des cartes de normales, des niveaux de détail, du feuillage
     alpha — et le résultat « low poly » d'un solo est presque toujours **moins**
     lisible qu'une bonne illustration plate.
  2. *Le moteur est plat.* Une grille de cellules de 1 m², une couronne
     modélisée comme un disque, aucune structure verticale dans le houppier,
     des ombres portées calculées comme des disques décalés vers le nord
     (`light.ts`). La 3D afficherait une précision que le modèle n'a pas — et
     ce serait la première entorse au principe 1.
  3. *C'est un autre métier* (caméra, matériaux, éclairage, pipeline d'assets),
     et le capital du projet est le moteur écologique, pas le rendu — c'est
     déjà l'arbitrage de `docs/stack.md`.
  Ce qu'on garde de l'envie de 3D : le **relief à l'échelle vraie** (D3), les
  quatre rotations autour de la parcelle (§7), les ombres qui tournent avec la
  saison. C'est-à-dire l'essentiel de ce que la 3D apporterait ici.
- **La météo volumétrique.** C'est le nom de la simulation de l'atmosphère
  comme un *volume* : nuages en trois dimensions traversés par la lumière,
  rayons de soleil qui percent la canopée, ombres de nuages qui glissent sur la
  parcelle, brouillard qui s'épaissit avec la distance. Ça se fait en 3D avec
  des shaders de diffusion, ça coûte très cher, et ça n'a pas de sens sans la
  3D. **Ce qui est exclu, c'est la simulation** — pas l'effet : la pluie, la
  neige, la brume de fond de vallon et un voile de chaleur sont dedans (§5.7),
  faits en 2D, pour presque rien.
- **Vue première personne** — confirmé dehors.
- **Éditeur de terrain isométrique** — confirmé dehors, l'éditeur actuel suffit.
- **Cycle jour/nuit** : le tick est la semaine, il n'y a pas d'heure dans le
  modèle. La lumière change avec la **saison**, pas avec l'heure.

---

## 1. Les sept décisions — **prises** (2026-09-03)

| # | Décision | Retenu | Ce que ça implique |
|---|---|---|---|
| **D1** | Moteur de rendu | ✅ **PixiJS v8 (WebGL)**, tranché par la mesure sur GPU | **Mesuré sur carte graphique** (`ANGLE Metal, Apple M4 Pro`) et sur le vrai pire cas — l'**an 30** d'une friche, 5 436 tiges, h max 16,5 m, la charge culminant là et non à l'an 50. **Pixi porte 4 à 8 fois plus de tiges à 60 img/s** (43 488 contre 5 436) et coûte **6 fois moins de temps de fil principal** (0,3 ms contre 1,8) — or c'est sur le même budget de 16,7 ms qu'il faut aussi financer la simulation, l'interface et les particules du lot L8. Canvas 2D *tenait* le budget (60–63 img/s), mais sa capacité valait **exactement** la scène : à charge doublée il tombait à 40 img/s, et au zoom rapproché à 30. C'est ce qui a renversé l'arbitrage : zéro dépendance ne pèse pas contre un facteur huit et un point de rupture déjà atteint. `pixi.js` est donc une **dépendance de production**. **Ce que ça impose à L1** : le point de rupture est le **zoom rapproché**, pas la parcelle entière, donc **le rendu doit découper par emprise visible**. Et une garantie acquise au passage : en pur logiciel, sans GPU, la scène reste *affichable* (10 img/s en Canvas 2D) — il y a un filet. **Et la marge n'est pas un luxe** : la cible annoncée est « une machine même nulle » pour un hectare, les grandes parcelles venant plus tard et pour les bonnes machines. C'est cette contrainte, autant que la mesure, qui fixe le budget des silhouettes du lot L2. `docs/lot0-pointe-technique.md`. |
| **D2** | Projection | ✅ **dimétrique 2:1** | Diagonales sur pentes entières, profondeur triée par `x + y`, picking inversible analytiquement. Un cube unité a une hauteur écran égale à la demi-largeur de tuile — c'est ce qui rend D3 gratuit. |
| **D3** | Échelle verticale | ✅ **tout à l'échelle vraie** — relief compris | **Et ça ne coûte presque rien** : les cinq stations livrées ont 1 à 6 % de pente, soit **1 à 6 m de dénivelé sur 100 m**. À 1 m = 8 px, c'est 8 à 48 px sur une parcelle qui en fait 800 de haut : lisible, jamais gênant. L'exagération que j'avais proposée était une prudence mal placée. **Le vrai coût est ailleurs** : dès que le terrain a du relief, une butte peut masquer ce qui est derrière, donc le tri en profondeur doit **entrelacer le sol et les arbres** au lieu de cuire le terrain en une seule couche sous tout le reste (§3). C'est `+M` sur L1/L2. Le seul cas à surveiller est un terrain **modelé à la main** (l'éditeur laisse creuser sans limite) : prévoir un avertissement au-delà de ~25 % de pente moyenne, pas un plafond. |
| **D4** | Silhouettes par espèce | ✅ **une essence = une silhouette reconnaissable**, niveau illustration | Renversement complet de la v0.1, et c'est la bonne exigence : **c'est le seul moyen que le joueur apprenne les essences**, ce qui est l'objectif pédagogique du §0.6 des règles. La technique qui le permet sans devenir illustrateur : **squelette généré par branchement récursif** (angle, ratio, divergence, dominance apicale — paramétrés par espèce) + **feuilles, fleurs et fruits en tracés SVG écrits à la main dans le code**, d'après des références botaniques. Voir §4 et §5.4. **Coût honnête : c'est ce qui double le chantier** (§9). **(L0)** Validé sur trois essences — bouleau, chêne pubescent, pin sylvestre se distinguent au premier coup d'œil, y compris nus — avec une correction de méthode importante : **l'enveloppe du houppier ne sort pas du branchement**, elle doit être un paramètre explicite de la fiche (§4). |
| **D5** | Composition ou sprites entiers | ✅ **composition en pièces** (souche/tronc, charpente, feuillage, accessoires) | Un arbre élagué **et** trogné **et** fruité **et** en train de brûler est une combinaison légitime. En sprites entiers c'est un produit cartésien ; en pièces, quelques dessins. D'autant plus vrai avec D4 : le squelette généré *est* la composition. |
| **D6** | Où vit l'état d'animation | ✅ **dans le rendu** | Le rendu tient une scène persistante entre deux instantanés : valeurs interpolées, animations en cours, marqueurs de changement. Le moteur n'apprend jamais le mot « frame ». Les chandelles, elles, sont bien dans le moteur — et c'est fait. |
| **D7** | Le temps | ✅ **horloge d'animation découplée du tick + politique de vitesse** | Le worker tourne à 10 Hz et avale **jusqu'à 26 semaines par pas** (`worker.ts:startLoop`), en ne postant qu'un instantané par lot. À ×512, une année passe entre deux images. La politique — et la réponse à « je veux voir ce qui a changé même à ×64 » — est au §6.8, revue en v0.2. |

---

## 2. Le contrat de données : **livré** (PR #2, commit `3a5a640`)

Ce chapitre listait, version après version, ce que le moteur calculait et
gardait pour lui. Il n'a plus cet objet : le contrat est en place. On le garde
ici comme **référence de ce que le rendu peut lire**, et comme trace de ce qui
manque encore.

La règle d'architecture qui en sort, et qui vaut plus que la liste : la
traduction état → instantané vit dans `src/game/snapshot.ts`, pure et testée.
**Le worker assemble, il ne décide pas.** Tout nouveau champ passe par là, et
un test échoue si un tampon typé manque à la liste de transfert
(`transferablesDuSnapshot`) — un oubli se paierait en une copie complète par
semaine simulée.

### 2.1 Ce que le rendu peut lire aujourd'hui

| Besoin | Où | Ce qu'on en dessine |
|---|---|---|
| **Relief** | `StationInfo.altitudesM` | le terrain isométrique, ses flancs, l'ombrage de pente |
| **Calendrier foliaire** | `Snapshot.pheno` (`ContextePhenologique` : 5 scalaires) | les couleurs de saison, via `partFoliaireDans`, `senescenceDans` et `partFoliaireActiveDans` — une seule loi, deux appelants, aucune dérive possible entre l'écran et le moteur |
| **Trogne** | `teteTrogneM`, `recepages` | tête renflée, faisceau de rejets, cavité qui se creuse aux étêtages |
| **Santé** | `vigueur`, `dommageHydraulique` | feuillage clairsemé et pâle ; **cime sèche** des sécheresses passées |
| **Chandelles** | `chandelle`, `mortSemaine`, `brulEeSemaine` | le fût qui grisonne et se creuse ; la **noire** du feu contre la **grise** du temps |
| **Morts** | `Snapshot.morts` (`MortDeLaSemaine{id,x,y,especeId,cause,heightM}`) | les onze animations de mort, chacune à sa place — et elles **s'accumulent** entre deux instantanés, donc rien ne passe à la trappe à grande vitesse |
| **Gestes** | `Snapshot.gestes` (`GesteVisible`) | l'arbre qui **tombe** au lieu de s'escamoter ; élagage, étêtage, recépage, broutage, frottis. Ils disent ce qui a été *réellement* touché — le plafond horaire arrête souvent le chantier en cours de route |
| **Incendie** | `Snapshot.incendie` (`IncendieResult{origine,brulees,rangs}`) | le front qui court : les cellules sont rangées **par rang croissant**, le rendu n'a qu'à les découper en tranches |
| **Eau de surface** | `soilDebordementMm` | la crue, la lame d'eau qui court, les ravines |
| **Ambiance** | `soilLumiere` | le sous-bois sombre, les taches de lumière, la clairière |
| **Tapis** | `soilLitiereCG` | les feuilles de novembre, le paillage, le noir des cendres |
| **Floraison, gel, brout, liège** | `fruitProgress`, `bloomFrosted`, `pousseTendreM`, `frotteSemaine`, `derniereLeveeSemaine` | voile de fleurs, fleurs brunies par le gel, rameaux coupés net, écorce arrachée, tronc ocre-rouge |
| **Météo** | `Snapshot.weather` (déjà là avant) | pluie, neige, gel, canicule — `rainMm` suffit |

Trois choses qui ont été faites **mieux** que ce que ce document demandait, et
qui méritent d'être sues avant de coder :

- **`litterCG` est de l'état, pas une grandeur de tick** : elle s'accumule et
  se décompose, donc elle se lit comme `soilPh`, sans être dupliquée dans le
  résultat du tick.
- **Les grilles sont copiées à l'assemblage** : le transfert les détache, et
  une action reçue en pause déclenche un instantané sans qu'aucune semaine
  n'ait été simulée — sinon la crue disparaîtrait entre deux clics.
- **Le front de feu ne coûte pas le déterminisme** : `propager()` dépile
  toujours (l'ordre de consommation du PRNG en dépend), et `rangsDuFront()`
  calcule les distances après coup, en BFS pur sur le seul ensemble brûlé. Un
  test compare l'état du PRNG pour le prouver.

### 2.2 Deux pièges de timing à ne pas déclencher

- **La mort au feu arrive en retard dans `morts`.** Un arbre tué par le feu
  n'y entre qu'un an après l'incendie : le versement au pool de bois mort est
  différé de `CHABLIS_RECUPERABLE_SEMAINES`, le temps qu'on puisse encore le
  récolter. **Ne pas brancher l'animation de torchage sur `morts`** : elle se
  lit tout de suite sur `causeMort`/`brulEeSemaine` et sur `incendie`.
- **La sénescence n'est pas la chute.** `partFoliaire` dit combien de feuillage
  reste accroché, `senescenceFoliaire` à quel point il a jauni. Le second
  devance le premier de deux à trois semaines : c'est ce décalage qui donne le
  houppier plein et doré d'octobre. Ne pas les confondre — et attention à
  `senescenceEnCoursDans`, qui est un oui/non (« le compteur tourne »), pas un
  avancement.

### 2.3 Les deux cartes de tâche laissées ouvertes : traitées

**Le carbone d'une chandelle coupée (~933 kgC créés de rien).** Passé le délai
de récupération, couper une chandelle brûlée exportait son bois *et* rajoutait
ses racines au pool où tout était déjà compté. La cause était le garde de
`applyCouper`, posé sur `brulEeSemaine` : il laissait passer un brûlé de plus
d'un an, dont `mortSemaine` était pourtant déjà posée. Le garde est maintenant
sur **`mortSemaine`**, la seule question qui compte — « ce bois est-il déjà dans
le pool ? » —, et l'abattage devient alors un **transfert** hors du pool, borné
par ce qu'il en reste (une chandelle de dix ans en a déjà rendu l'essentiel).
Deux tests le couvrent, dont le cas du pool presque vide.

**L'asymétrie du froid dans la chute des feuilles (27,8 % d'azote foliaire
versé au printemps).** Ce n'était pas un arbitrage entre correction et
calibration : l'asymétrie n'était qu'un symptôme. Le calcul de la chute
tournait **toutes les semaines**, y compris au printemps, où les deux appels à
`partFoliaire` partagent le même compteur de sénescence (zéro) — leur seule
différence était le besoin de froid, passé d'un côté et pas de l'autre. Un
hêtre dont la dormance n'était pas levée « lâchait » donc de l'azote en pleine
feuillaison, alors qu'il ne faisait que sortir ses feuilles. Ce n'était pas une
chute, c'étaient deux lois comparées l'une à l'autre.

Le garde manquant est celui que le moteur avait déjà sous la main :
`senescenceEnCoursDans(pheno)`. Une fois posé, on est toujours dans la branche
d'automne de `partFoliaire`, qui ne regarde pas le froid — les deux appels
peuvent partager le même contexte et l'asymétrie disparaît d'elle-même, sans
qu'il faille arbitrer quoi que ce soit. En automne, le comportement est
inchangé au chiffre près (test).

### 2.4 Ce qui manque encore, et qui ne me bloque pas

> **Le canal a changé** : une demande au moteur s'ouvre maintenant en **issue
> GitHub** titrée `[attente-rendu]`, sur un formulaire qui force à dire la
> maille, l'unité et le visuel que ça débloque
> (`.github/ISSUE_TEMPLATE/attente-du-rendu.yml`). L'état d'une demande est
> l'état de son issue, il n'y a rien à tenir à jour à la main.
> **[attentes-du-rendu.md](attentes-du-rendu.md)** reste la référence de ce qui
> voyage déjà et des quatre motifs pour lesquels une demande peut être discutée
> plutôt que livrée. Le tableau ci-dessous n'est qu'un résumé daté.

| Manque | Ce que le rendu ne pourra pas faire | À qui |
|---|---|---|
| ~~La saison de végétation est encore thermique~~ | ✅ **fait côté moteur** : la croissance suit `partFoliaireActive` et `GROWING_WEEKS` a été recalibré. Un caduc nu de janvier ne puise plus. Reste un écart de deux semaines par an — un houppier doré produit encore, la sénescence n'étant pas dans la boucle. Invisible à l'écran, contrairement au précédent. | — |
| ~~La marcescence~~ | ✅ **faite côté moteur** (`partFoliaireOmbrageante`, `OPACITE_FEUILLE_MORTE`) : le charme et le jeune chêne gardent leurs feuilles mortes, qui ombragent encore sans travailler. Silhouette d'hiver garnie et rousse — c'est directement du D4, et c'est offert. | — |
| ~~La chute d'une chandelle~~ | ✅ **livré** (issue #4) : `Snapshot.chutes` porte direction, masse et empreinte au sol, `soilBoisAuSol` dit où le tronc repose, et la trouée s'ouvre d'elle-même puisque `soilLumiere` est recalculée. La chute est donc animable, pas seulement son résultat. | — |
| ~~Les gestes de ZONE ne voyagent pas~~ | ✅ **livré** (issue #5) : `GesteVisible` s'est ouvert en `{ type, cellules }` à côté de `{ type, ids }` — `chauler`, `faucher`, `epandreBrf`, `labourer`, `ramasserBoisMort`, `cloturer`. Et ce qui est nommé est ce qui a **réellement** été touché, plafond horaire compris. | — |
| **Le tas de BRF n'a pas de position** | À poser conventionnellement au bord de la parcelle. | rendu |
| **Le rembobinage** | Cadré, pas fait : il faudra un instantané **par semaine simulée** quand l'enregistrement est actif, au lieu d'un par lot de 26. Le budget est dans `docs/stack.md` (« Le contrat moteur → rendu »). | worker, au lot L8 |

## 3. Architecture de rendu

```
src/render/
  projection.ts      # ✅ écrit au lot L0 : parcelle (m) ↔ écran (px), aller ET retour. Pur, 14 tests.
  camera.ts          # pan, zoom, orientation (4 quarts de tour), limites
  scene.ts           # la scène persistante : ce qui est à l'écran, entre deux instantanés
  interpolation.ts   # lissage d'un instantané au suivant (hauteurs, fruits, eau)
  couches/
    terrain.ts       # sol cuit en tuiles, reconstruit par morceaux quand ça change
    eau.ts           # ruisseau, mare, nappe affleurante, ruissellement
    tapis.ts         # herbe, litière, cendres, labour
    arbres.ts        # tri en profondeur, composition tronc/couronne/accessoires
    particules.ts    # braises, feuilles, embruns, poussière, fumée
    ciel.ts          # fond, lumière de saison, pluie, neige, brume
  atlas/
    generateur.ts    # dessin vectoriel → textures, au démarrage
    silhouettes.ts   # le générateur de squelette (branchement récursif)
    especes/         # une fiche graphique par essence : port, feuille, fruit, écorce, saisons
    troncs.ts        # droit, bille élaguée, trogne, cépée, chandelle
    palette.ts       # LA palette (partagée avec ui/couleurs.ts)
  animations/
    registre.ts      # une animation = { déclencheur, durée, ce qu'elle lit, ce qu'elle dessine }
    morts.ts  feu.ts  crue.ts  gestion.ts  meteo.ts
    changements.ts   # le calque des changements, pour les grandes vitesses (§6.8)
  faune/
    peuplement.ts    # combien de bêtes, où, d'après l'état du moteur (§5.10)
    comportements.ts # brocard qui frotte, oiseau qui se pose, papillon sur une floraison
  son/
    ambiances.ts     # couches sonores pilotées par l'état (vent, oiseaux, pluie, feu)
  VueParcelle.tsx    # le composant React : monte le canvas, branche useGame()
```

**Boucle par image** (cible 60 fps, budget 16 ms) :

1. `camera` → rectangle visible en coordonnées parcelle ;
2. terrain : rien à faire si aucun morceau n'est sale (il ne change qu'au tick) ;
3. `interpolation` : avancer les valeurs vers l'instantané courant ;
4. `animations` : faire progresser les animations en cours, en retirer les finies ;
5. arbres : filtrer au rectangle visible, trier par profondeur, composer ;
6. particules, ciel, curseur d'action.

**Ce qui coûte, et comment on paie** :

- **10 000 tuiles de sol.** Jamais dessinées une par une par image : le
  terrain est **cuit** en morceaux de 16×16 m dans des textures, et un morceau
  n'est reconstruit que quand une de ses cellules a changé de tranche de
  valeur. Un tick change l'humidité de tout le monde d'un poil → il faut
  **quantifier** (8 niveaux, pas 256) pour ne pas tout invalider chaque
  semaine. Sinon, on recuit 10 000 tuiles par tick et le jeu rame à ×512.
- **Le tri en profondeur, revu pour D3.** Avec un relief à l'échelle vraie, le
  raccourci « le terrain est une seule couche sous tout le reste » **ne tient
  plus** : une butte au premier plan doit masquer le pied des arbres qui sont
  derrière elle. Il faut donc **entrelacer** sol et arbres dans un même ordre
  du peintre : on trie les *morceaux* de terrain par profondeur, et dans chaque
  morceau on dessine le sol puis les arbres qui s'y trouvent, rangée par
  rangée. Le tri des arbres reste incrémental (l'ordre ne change que si un
  arbre naît ou meurt). C'est le `+M` annoncé en D3, et c'est structurel : à
  faire dès L1, pas à rattraper.
- **Les arbres sont des panneaux face caméra.** Ils ne tournent pas avec les
  quatre rotations (§7) : un arbre a la même allure de tous les côtés, donc une
  seule texture sert aux quatre orientations. C'est ce qui rend la rotation
  presque gratuite. **Les ombres, elles, doivent tourner** : le soleil est au
  sud dans le moteur (`light.ts`), donc l'ombre part au nord *de la parcelle*,
  et à l'écran sa direction change à chaque quart de tour.
- **LOD.** Dézoomé, un semis n'est qu'un point ; sous ~3 px, un arbre devient
  une tache de couleur ; les fourrés (ronce, ajonc, genêt, callune) sont
  dessinés **par cellule agrégée**, pas par individu — c'est aussi ainsi qu'on
  lit un fourré sur le terrain. Avec D4, le LOD devient **plus** important, pas
  moins : le détail d'illustration ne se justifie qu'au zoom, et il faut
  basculer proprement entre l'arbre dessiné et la tache.
- **Le pire cas, mesuré (L0, rejoué)** : une friche en pleine succession
  **culmine à 5 436 tiges vers l'an 30** (dont 2 004 chandelles, h max 16,5 m),
  puis **s'auto-éclaircit de moitié** — 2 198 tiges à l'an 50, le couvert
  fermé ayant tué ce qui poussait dessous. L'estimation de « ~5 000 tiges »
  était juste, mais **le pic est à l'an 30, pas à l'an 50**. La signature de
  la fermeture est la ronce : 753 tiges à l'an 50, dont zéro vivante.
- **Le LOD, en revanche, n'a rien économisé (L0, rejoué)** : la coupure sous
  1,5 px **ne se déclenche jamais**, ni sur la nouvelle scène ni sur
  l'ancienne. Au zoom 1 un mètre vaut 8 px, donc il faudrait une tige de moins
  de 19 cm pour tomber dessous. Il reste une bonne idée pour le zoom
  rapproché — où le vrai enjeu est le **découpage par emprise visible**, pas la
  substitution par une tache — mais ce n'est pas lui qui tient le budget.

**Deux règles d'architecture que L0 a produites, et qui ne se voient sur aucune
capture :**

- **Aucune primitive vectorielle par image.** Dessiner 5 436 ellipses d'ombre
  à chaque image coûtait **4,1 ms de plus** que le même dessin en aplats
  (16,7 contre 12,6 ms sur GPU), et **411 ms** en rendu logiciel — un facteur
  cent. Ombres, halos, liserés, marqueurs de changement (§6.8) : **tout est
  cuit une fois dans un bitmap, puis posé en sprite**. **Le choix de Pixi ne
  dispense pas de la règle** : sous Pixi la tentation prend la forme d'un
  `Graphics` reconstruit à chaque image, le coût est le même, et la différence
  est qu'on ne le verra pas venir — un sprite batché et un `Graphics` se
  ressemblent dans le code, pas dans le profil.
- **L'atlas cuit à UNE taille de référence**, mis à l'échelle ensuite, et non
  par palier de hauteur. L'atlas à la demande est validé, et **la crainte
  d'une explosion avec des arbres plus hauts ne s'est pas réalisée** :
  398 silhouettes suffisent aux 5 436 arbres de l'an 30 (13,7 arbres par
  texture) et 240 aux 2 198 de l'an 50, contre 474 pour l'ancienne scène. Le
  nombre BAISSE, parce que les paliers sont logarithmiques et que le squelette
  est invariant d'échelle. Reste **182 à 200 ms de cuisson au premier
  affichage** (372 ms au zoom 4) : encore trop, mais loin des trois secondes
  redoutées. Le remède qui reste clairement rentable est de cuire à une seule
  taille (÷12) ; étaler la cuisson vient ensuite ; plafonner le nombre de
  segments n'est plus qu'un garde-fou. Le terrain, lui, se cuit en 13 à 29 ms
  pour 10 000 cellules en 49 morceaux : D3 est confirmé bon marché.

---

## 4. Direction artistique

**Le niveau visé est l'illustration botanique, pas le pictogramme.** On doit
pouvoir reconnaître un bouleau d'un aulne, un chêne d'un châtaignier, sans
info-bulle — c'est l'objectif pédagogique des règles (§0.6 : « chaque
info-bulle peut renvoyer à la notion du cours ») porté à l'image. Le style
reste sobre — aplats, peu de tons par forme, une seule source de lumière au
sud-ouest, ombres longues et douces, pas de texture bruitée — mais **le dessin
est détaillé** : on lit la feuille, la fissure de l'écorce, le port.

### Comment on obtient ça sans devenir illustrateur

Trois couches, et c'est là qu'est toute l'astuce :

1. **Le squelette est généré** par branchement récursif, paramétré par espèce :
   angle de branchement, ratio de longueur entre un axe et sa fille,
   divergence, dominance apicale, conicité du fût, tortuosité. Six ou sept
   nombres suffisent à séparer le port d'un bouleau (fin, retombant, dominance
   forte) de celui d'un chêne pubescent (trapu, tortueux, dominance faible).
   **Bénéfice majeur** : les stades de croissance sortent gratuitement — on
   déroule le même squelette moins loin, et un gaulis *est* un jeune arbre, pas
   un sprite séparé. L'élagage, l'étêtage et le recépage aussi : ce sont des
   coupes dans le squelette.
   **(L0) Mais l'enveloppe du houppier n'émerge PAS du branchement** : elle doit
   être un **paramètre explicite** de la fiche — cône, boule, gobelet, étagé,
   fastigié, retombant — avec la décroissance des étages vers le sommet imposée,
   pas espérée. Trois exemples mesurés : à 0,85 de dominance apicale le bouleau
   fait une touffe au sommet d'un bâton (il a fallu descendre à 0,62 et ajouter
   un ordre) ; aucun réglage d'angle sur un port fourchu ne produit le cône d'un
   pin, il faut un port **étagé** distinct (axe droit, verticilles presque
   horizontaux) ; et sans écourtement explicite des étages, ce pin fait une
   boule. À écrire dans la structure de la fiche **avant** les vingt-cinq
   fiches, sinon on les écrit deux fois.
   **(L0) Plafonner le nombre de segments**, quel que soit le paramétrage : il
   croît en (branches par nœud)^(ordres), et c'est ce qui a fait passer la
   cuisson d'une silhouette de 0,3 à 13,3 ms.
2. **Les feuilles, fleurs et fruits sont dessinés à la main, en tracés SVG
   écrits dans le code**, d'après des références botaniques. C'est **ce qui
   identifie une espèce** — la feuille palmée du platane, la composée du frêne,
   l'aiguille par deux du pin sylvestre, le gland, la châtaigne dans sa bogue,
   l'akène de l'aulne. Une feuille est un tracé de dix à trente points : une
   heure de travail par espèce, pas une journée, et zéro fichier binaire.
3. **Le feuillage est un semis de ces tracés** le long des rameaux, avec une
   densité et une teinte par espèce et par saison. Vu de loin ça fait une
   masse ; vu de près on distingue les feuilles. **(L0) Un bouquet par rameau
   terminal, pas une feuille** : une feuille par rameau donne une brindille
   décorée, pas une masse foliaire. Et le feuillage s'accroche à **tout rameau
   terminal**, pas au dernier ordre de récursion — une branche devient trop
   courte avant d'atteindre l'ordre maximal, et l'arbre sort nu.

### La fiche graphique par espèce

Chaque espèce reçoit, à côté de sa fiche écologique, une **fiche graphique**
dans `render/atlas/especes/` : les paramètres de branchement, le tracé de la
feuille (et de l'aiguille, du fruit, de la fleur), les couleurs de feuillage
aux quatre saisons, la couleur et le motif d'écorce, la silhouette d'hiver, et
un champ `references` — **les sources du dessin, au même titre que les valeurs
du moteur sont sourcées**. C'est la même discipline appliquée à l'image.

### Quatre grandeurs qui manquaient, et ce que ça a appris

Le retour du 6 septembre a produit trois issues moteur, toutes traitées, plus
une quatrième trouvée en chemin. Le tableau vaut mieux qu'un récit, parce que la
colonne de droite est la même à chaque fois :

| Grandeur | Ce que le rendu faisait | Ce qu'il fait |
|---|---|---|
| `soilHerbeHumidite` (#12) | un seuil de grillage décrété dans `palette.ts`, sur la réserve utile | lit la grandeur, et lit le SEUIL en appelant `couvertureMax` |
| `hauteurElagueeM` → lumière (#13) | rien, faute de pouvoir le dire honnêtement | rien non plus — `soilLumiere` s'en charge tout seul |
| `floraison` (#14) | rien ; `fruitProgress` ne permet pas de l'inférer | dessine la fleur, sans connaître aucune date |
| `baseHouppierM` | `1 − 2 × houppierRatio`, une formule maison | lit la grandeur, et perd un champ au passage |
| **taille de tête de trogne** (#19) | une allométrie maison sur le rayon du fût, identique à 3 coupes et à 25 | lit `diametreTeteCm` et `caviteTeteL`, et l'allométrie a disparu |
| **abroutissement** (#21) | rien ; `pousseTendreM` est un stock, pas un événement | lit `brouteSemaine`, et le premier dégât de gibier lisible du modèle apparaît |

**Ce que les quatre ont en commun** : dans les quatre cas le rendu ne pouvait
pas obtenir la grandeur en réfléchissant plus fort, parce qu'elle dépend de
choses qu'il ne voit pas — la compétition subie, l'inertie d'un tapis sur six
semaines, un cumul de degrés-jours. Deux des quatre avaient été « résolus » par
une approximation locale, et les deux approximations étaient fausses de la même
façon : elles ne connaissaient que l'espèce, là où la grandeur dit une
HISTOIRE.

**Et la leçon inverse, qui compte autant** : #13 n'a demandé aucun travail de
dessin. Une fois l'élagage entré dans `computeGroundLight`, le sol s'est
assombri au bon endroit tout seul, parce que le rendu lisait déjà `soilLumiere`.
Brancher une grandeur bien placée fait souvent apparaître plusieurs effets sans
qu'on ait rien à peindre — c'est le meilleur argument pour ouvrir l'issue plutôt
que pour combler le trou sur place.

**Le cinquième cas est le plus instructif, et il est résolu depuis — ce qui le
rend meilleur encore.** Le
moteur sait qu'une trogne d'au moins deux étêtages porte de l'habitat
(`biodiversite.ts`), mais pas combien : une tête de trois coupes et une de
quinze comptent pareil. Le rendu, lui, aurait pu faire grossir joliment le
bourrelet à chaque coupe — personne ne s'en serait plaint, et l'image aurait
menti d'une façon particulièrement propre, en donnant à voir une ressource qui
ne compte nulle part. Le dessin s'en tient donc au rayon du fût. **Un manque
visible vaut mieux qu'un manque comblé au mauvais endroit**.

Et la suite a donné raison à ce refus deux fois : le moteur a répondu par un
module entier (`trogne.ts`) qui porte un diamètre croissant, un volume de
cavité, et une note d'habitat CONTINUE remplaçant le seuil binaire —
`biodiversite.ts` compte désormais les litres de creux. Une valeur inventée au
rendu aurait donné une jolie tête qui grossit devant une biodiversité restée
plate, et personne n'aurait cherché. Le rendu lit maintenant les deux
grandeurs, et l'écart qu'on voit est celui que la simulation compte.

**Deux façons de se tromper, pas une.** Inventer un seuil est la première.
Recopier celui du moteur est la seconde, et elle est plus discrète : deux copies
d'une règle dérivent, et rien ne le signale (§2.1). D'où la forme finale, qui
évite les deux — `satisfactionEnEau` APPELLE `couvertureMax` avec une lumière
pleine, puisque ce que cette fonction rend alors est exactement le facteur
d'eau. Un essai vérifie l'égalité aux deux bouts de l'échelle : il casse si l'un
des deux bouge sans l'autre.

### La bonne UNITÉ de dessin, et pourquoi la question revient sans cesse

Trois fois de suite, le même arbitrage a décidé si une fonctionnalité marchait
ou non, et il vaut d'être énoncé une fois pour toutes :

| Ce qu'on croit dessiner | Ce qu'on dessine en fait | Pourquoi |
|---|---|---|
| une feuille | un **bouquet** par rameau | une feuille par rameau donne une brindille décorée, pas une masse foliaire (L0) |
| une touffe d'herbe | un **grain** serré et continu | sept marques au m² font une lande ; un gazon est un couvert, pas des objets posés dessus |
| une baie | un **corymbe**, une grappe, un amas | une baie de sureau fait un sixième de pixel ; son corymbe en fait cinq — et c'est le corymbe que l'œil voit |

La règle : **dessiner l'objet que l'œil perçoit à la distance considérée, pas
l'objet que la botanique nomme.** Ce n'est pas une approximation qu'on
s'autorise faute de mieux — à cette distance, l'amas EST la perception, et
dessiner une baie isolée de deux pixels serait le mensonge.

**Et le quatrième cas, qui est le retournement du même arbitrage.** Poser que
l'unité est le bouquet ne suffit pas : il faut ensuite que le BOUQUET porte
l'identité de l'espèce, sinon on a simplement déplacé le problème d'un cran.
C'était le cas — le bouquet était le seul élément du houppier sans caractère
d'espèce. Chaque essence recevait le même disque déchiqueté, et seules la
couleur et la densité les séparaient : sur la planche des trois sujets vus de
près, un hêtre et un bouleau portaient exactement le même objet, et le pin
sylvestre — dont le code croyait dessiner une brosse, avec un commentaire pour
l'affirmer — sortait en boules rondes.

Le bouquet a donc maintenant deux caractères : de combien il s'ALLONGE le long
du rameau, et de combien son bord est DÉCOUPÉ. Une fronde de frêne s'étire et
se perce entre ses folioles ; une rosette de hêtre est une boule à bord doux ;
une brosse de pin n'est que son axe. **Rien de nouveau n'est déclaré pour
autant** : le port d'un bouquet est une conséquence de la feuille qui le
compose, et la fiche déclare déjà sa forme — on lit la conséquence plutôt que
d'ajouter une déclaration qui pourrait la contredire (§2.1).

Deux détails qui ont chacun coûté une passe, et qui se généralisent :

- **l'aire est conservée quand le bouquet s'allonge.** Le calibre est calculé
  pour qu'un nombre donné de taches couvre la part voulue du houppier ; étirer
  sans compenser aurait changé la transparence de chaque espèce au passage, et
  un pin serait devenu plus clair qu'un hêtre pour une raison qui n'a rien à
  voir avec sa densité.
- **l'irrégularité d'un fuseau est TRANSVERSE.** Appliquée aussi au grand axe,
  elle découpait la brosse dans sa longueur : le pin sortait en feuilles
  d'érable dentelées, une silhouette de feuillu là où on voulait l'inverse. Des
  aiguilles sortent du rameau perpendiculairement — la frange est sur les
  flancs, la pointe reste une pointe.

Il y avait aussi, avant, DEUX branches de dessin — la brosse du conifère et la
boule du feuillu — et c'était un faux partage. Entre les deux il y a un
continuum, et c'est lui qui porte l'identité : une fronde est à mi-chemin. Deux
branches ne pouvaient pas le dire, et la boule gagnait par défaut pour tout le
monde sauf le pin.

Son corollaire pratique : quand un détail « ne marche que pour deux espèces »,
la cause est presque toujours qu'on a pris l'unité trop fine. Le fruit ne
marchait que pour la pomme et l'abricot ; il marche pour neuf espèces depuis
qu'on dessine le groupe. Et il a fallu pour ça déclarer la taille RÉELLE du
groupe dans la fiche (`grappeM`), parce que la déduire de la taille du fruit la
sous-estime d'un facteur deux à trois — un corymbe de sureau fait dix
centimètres, que ses baies fassent cinq ou huit millimètres.

### Ce qui doit se lire sans info-bulle

1. l'**essence** — promue au premier rang par D4 (elle était dernière en v0.1) ;
2. le **stade** (semis, gaulis, perchis, futaie, sénescent, chandelle) ;
3. la **gestion** subie (élagué, trogné, recépé, manchonné, démasclé) ;
4. la **souffrance** (vigueur basse, cime sèche, feuillage jauni hors saison) ;
5. la **structure** du peuplement (qui domine, les trous, la lisière).

### Ce que la première passe de rendu a appris (retour du 2026-09-06)

Le verdict était : « on dirait pas une forêt, on dirait vraiment trop un
ordinateur qui simule une forêt ». La consigne qui l'accompagne tranche un
arbitrage qu'il faut écrire, parce qu'il commande tous les choix suivants :

> Quitte à choisir entre réalisme (trop de détails) et minimalisme (pas assez),
> je préfère le minimalisme avec juste ce qu'il faut pour que ce soit joli. Il
> faut mettre en avant ce qui est FONCTIONNEL.

Ce qui est fonctionnel est énuméré, et c'est la hiérarchie de dessin :

- le **feuillage** dit si l'arbre sèche ;
- le **branchage** dit s'il faut élaguer ;
- un arbre **élagué** fait moins d'ombre en dessous ;
- les **fruits** quand il y en a ;
- les **ombres aux bons endroits**.

Et ce qui ne l'est pas : « les taches d'ombre autour de la parcelle, c'est pas
important ».

**Le diagnostic, et il vaut plus que la liste des corrections.** Quatre des cinq
défauts trouvés n'étaient pas des défauts de goût : c'étaient des grandeurs du
moteur qui n'arrivaient pas jusqu'au pixel. La lumière au sol était calculée,
transportée, jamais lue. La sécheresse ne colorait que le sol nu, donc jamais
l'herbe qui le couvre. Les paliers étaient lus comme des parts, si bien qu'une
couverture de 100 % gardait de la terre nue. Le modelé du feuillage était un
tirage au sort, c'est-à-dire du bruit là où on attendait une direction de
lumière.

D'où la règle de méthode : **quand une scène « fait synthétique », chercher
d'abord la grandeur débranchée, pas le réglage à retoucher.** Un rendu qui
n'affiche pas ce que le moteur sait ne se corrige pas en changeant une teinte.

**Le bois mort couché : six jets pour une ligne, et chacun réfuté par une
capture.** Le protocole demandait ce dessin en toutes lettres —
« le rendu peut y poser des troncs », « le rendu doit pouvoir le montrer » —
et deux `Float32Array` traversaient le worker sans lecteur. L'histoire vaut
d'être gardée, parce que l'erreur se déplaçait à chaque fois d'un cran :

| Jet | Ce qu'on dessinait | Ce que la capture a montré |
|---|---|---|
| 1 | un segment par cellule, orienté par `asin(transversalité)` | des échelles de tirets en travers du vrai tronc |
| 2 | une tache par cellule, sans direction, à la couverture du moteur | une chaîne de losanges : la couverture réelle est de 30 %, les taches ne se soudent pas |
| 3 | l'axe du voisinage, quantifié à 45° | un tuyau en marches, avec un trou à chaque décrochement |
| 4 | le graphe de l'empreinte, cellule à cellule | l'escalier de la rastérisation, fidèlement reproduit |
| 5 | la direction ajustée par le moment d'ordre deux | des traits parallèles décalés : une direction ne suffit pas à poser une droite |
| 6 | la droite des moindres carrés — centroïde ET inclinaison | un tronc |

**La leçon n'est pas « il a fallu six essais »**, c'est que la première
explication était la plus séduisante et la plus fausse. `transversalite` rend
`|sin(tronc − aval)|` : l'arc sinus semblait l'inverser, et il laisse en
réalité quatre directions candidates — la valeur absolue est délibérée dans le
moteur (« un tronc n'a pas de sens »). La direction n'était pas dans cette
grandeur du tout : elle était dans l'EMPREINTE, que le moteur écrit le long
des cellules couvertes par la chute. Chercher la grandeur qui porte
l'information, encore.

Et un dernier détour instructif : le jet 1 avait aussi un banc fautif. Il
chargeait une rangée de cellules en forçant une transversalité sans rapport,
donc un état que la simulation ne produit jamais — le moteur tire les deux de
la même chute. Le banc pose maintenant un azimut de tronc et laisse
`transversalite` dire ce que ça barre. **Un banc qui fabrique un état
inatteignable accuse le rendu à tort**, et c'est la deuxième fois (la première
était la trogne, §5.5).

**Le décor cuisait quatre fois trop.** `Decor.morceauxVisibles` élargissait
l'emprise de la parcelle d'une PORTÉE scalaire dans les deux axes — donc un
carré, là où la région visible d'une projection dimétrique est un losange. Les
quatre coins du carré sont entièrement hors écran et font la majorité de sa
surface : mesuré à la vue par défaut d'un hectare, **729 morceaux demandés pour
150 réellement à l'écran**. Quatre sur cinq étaient cuits, gardés en mémoire,
transformés en texture GPU et posés à chaque image pour rien — à la vue que le
joueur voit en premier, celle dont la ceinture apparaissait par plaques pendant
trois secondes. La découpe teste maintenant chaque morceau contre le cadre,
comme `posesDesArbres` le fait pour les arbres : 336 demandés, image vérifiée
identique au pixel près.

Là encore une explication plausible a coûté une passe. La première découpe, sur
les quatre coins au sol, laissait des entailles de ciel en haut du cadre ; j'ai
accusé les MASSES du décor — un bois monte à seize mètres, donc un morceau dont
le sol passe au-dessus du bord garderait ses masses visibles. Remonter le bord
n'a rien changé, au pixel près : une masse se dessine vers le haut, ce qui
l'éloigne du cadre. Ce qui débordait était l'IMAGE du morceau, cuite avec sa
propre marge. On gonfle donc l'emprise dans les quatre directions plutôt que de
chercher de quel côté — large exprès, et toujours très gagnant.

**Et la grandeur débranchée n'est pas toujours du moteur** : elle peut venir du
rendu lui-même. Les houppiers à ramure opposée sortaient en chapelets de perles
— des bouquets empilés en colonnes verticales — parce que la projection de la
vignette ne lisait que `x` et `y` du squelette et jetait `z`. Une ramure opposée
ne prend que quatre azimuts, dont le cosinus n'a que trois valeurs : les
décalages horizontaux se quantifiaient et les bouts tombaient sur un réseau.
Replier la profondeur dans la largeur du panneau, en projection oblique, ajoute
le sinus et démultiplie ce réseau — mesuré : 35 colonnes distinctes avant, 59
après, sur les 243 bouts d'un cornouiller.

Le chemin pour y arriver vaut la conclusion. **Deux explications ont été
proposées et mesurées fausses avant celle-là** : l'allongement du bouquet
(le cornouiller déclare une feuille ovale, son bouquet est une rosette ronde et
n'avait aucun allongement à baisser) puis « les branches vers l'objectif
s'écrasent sur l'axe du tronc » (2 % des bouts seulement passaient près de
l'axe, et le repli fait plutôt monter ce chiffre). Ce qui s'écrasait n'était pas
la position absolue mais l'ÉCART. La leçon : **une explication plausible d'un
défaut visible n'est pas une explication vérifiée**, et le coût de ne pas
vérifier est de régler la mauvaise molette.

Et son corollaire, qui est le principe n° 1 du §0 et que cette passe a enfreint
une fois : **si la grandeur n'existe pas dans le moteur, elle part en issue.**
On ne la fabrique pas côté rendu, même « en attendant », même quand on croit
connaître le bon ordre de grandeur. Le cas vécu : un seuil de grillage de
l'herbe décrété dans `palette.ts`, faux de valeur ET de grandeur, et surtout
faux de nature. Une teinte inventée pour compenser une donnée absente rend le
manque permanent — l'écran montre quelque chose, donc personne ne cherche plus.

**Ce qui reste ouvert après cette passe :**

- **Un arbre élagué ne fait pas moins d'ombre**, et le rendu ne peut pas le
  décider seul : `hauteurElagueeM` n'entre dans aucun calcul de lumière du
  moteur (vérifié sur `light.ts`, `trees.ts`, `tick.ts`). Le dessiner serait
  inventer une différence que la simulation ne fait pas — exactement la
  « fausse réalité » que le retour reproche. C'est donc une carte MOTEUR :
  l'élagage relève la base du houppier, la lumière passe dessous.
- **Trois manques sont comblés depuis** (issues #12, #13, #14 — le moteur a
  répondu, le rendu a branché) : la pelouse grille sur `soilHerbeHumidite`,
  l'arbre élagué rend de la lumière au sous-étage sans une ligne de dessin de
  plus, et le verger fleurit sur `floraison`. Voir « quatre grandeurs qui
  manquaient » ci-dessous.
- **`bloomFrosted` part au lot ANIMATION — tranché.** Le champ voyage, mais un
  arbre dont la floraison a gelé ne se distingue que par une absence de fruit,
  trois mois plus tard, et une absence ne se lit pas comme une cause : le joueur
  voit un pommier sans pommes, pas pourquoi. Les deux façons de le peindre sur
  une vignette échouent pour la même raison — un gel est un ÉVÉNEMENT d'une
  semaine, une vignette est un ÉTAT : ou les fleurs brunes restent accrochées
  jusqu'en novembre (faux), ou elles disparaissent au bout d'une semaine et
  personne n'aura regardé cette semaine-là. Une fleur qui brunit et tombe au
  moment du tick, en revanche, se voit — et c'est exactement le modèle du temps
  du §5.11 : un gel est de ces événements pour lesquels on repasse en temps
  réel, comme un feu.
- **Trois espèces qui portent des fruits bien visibles n'en auront pas** :
  l'aubépine, le houx, le fusain. Aucune n'a de bloc `fruits` dans `especes.ts`,
  donc le moteur ne suit pas leur fructification, et leur en dessiner serait
  inventer un état. C'est dommage à l'œil et c'est la bonne décision — un fruit
  peint sans état derrière ne mûrit jamais, ne se récolte pas, et masque le
  manque. Un essai le vérifie dans les deux sens.
- **Deux manques de plus sont comblés** (issues #19 et #21, ouvertes par le
  rendu et traitées côté moteur) : `trogne.ts` donne le diamètre de tête et le
  volume de cavité, si bien qu'un têtard de trois coupes et un têtard
  centenaire n'ont plus la même silhouette ; et `brouteSemaine` rend visible le
  seul dégât du modèle qui ne l'était pas du tout. Les deux sont branchés.
  L'allométrie maison du bourrelet (`rayonAuPiedM × 2,2`) a disparu du rendu,
  et le seuil binaire de cavité avec elle.
- ~~Le hors-parcelle disparaît au dézoom lointain~~ — **le défaut n'existait
  pas, et il faut le dire aussi.** Vérifié : `vueInitiale` démarre à `zoomMin`
  et `zoomer` s'y arrête, donc **il n'y a pas de dézoom au-delà de la parcelle
  entière**. Ce que j'avais pris pour un dézoom était un recentrage borné — au
  zoom minimal, `zoomer` recentre la vue — dans une séquence de gestes où un
  glissement avait précédé. Deux captures comparées venaient en réalité de deux
  cadrages différents.
  La mesure a en revanche trouvé un vrai gâchis au même endroit : voir la
  découpe du décor ci-dessous. À reprendre avec le
  décor, pas avec le poseur.
- **Le canal de la POSE ne peut montrer que ce qui bouge.** Une chute passe par
  lui ; une mort de sécheresse, non — elle jaunit puis se défeuille, ce qui est
  un changement de COULEUR et de part foliaire, donc de cuisson, et la classe le
  porte déjà. Les deux canaux existent exprès et il ne faut pas les confondre :
  faire passer un jaunissement par la pose ne marcherait pas, et faire passer
  une chute par la cuisson recuirait l'atlas au milieu d'une animation. Les
  actes du plan qui ne sont pas des chutes ne produisent donc aucune
  déformation, pour l'instant.
- **Une masse de fourré ne peut pas être animée individuellement**, et ça a
  coûté une demi-journée à comprendre. `separerLeFourre` agrège les tiges de
  fourré par carreau : elles perdent leur identité, donc rien ne peut les
  déformer une par une. Or **sur une friche à trente ans, 1 874 des 1 918
  chandelles sont des ronces** — la mort sur pied y est presque entièrement du
  fourré. La chute ne s'appliquera donc qu'aux 44 autres, hautes de six mètres
  au plus. Ce n'est pas un défaut : une ronce morte ne tombe pas, elle
  s'affaisse. Mais il faut le savoir avant de chercher une animation qui ne
  vient pas.
- **Aucun tronc ne barre l'eau sur le versant à 12 %** : les 2 027 cellules de
  bois couché que la simulation y produit ont toutes une transversalité sous le
  seuil des 30°. La couleur du tronc barrant ne se voit donc que sur le banc,
  pour l'instant. À revoir avec le moteur : soit les directions de chute
  s'alignent trop sur la pente, soit c'est juste et un tronc en travers est
  rare.
- **Le vent, les oiseaux** : §5.11, et volontairement en dernier.
- **Le modelé latéral des houppiers reste faible**, parce que la vignette est un
  panneau face caméra : un côté éclairé franc mentirait dès la première
  rotation. La sortie serait de cuire deux variantes par orientation, ce qui
  double l'atlas — à peser quand le reste sera fait.

### La palette

Les couleurs de `ui/couleurs.ts` sont des couleurs **catégorielles de
graphique** (violet, rouge brique, rose) : elles restent aux courbes et aux
étiquettes. Avec D4, la vue visuelle n'en a plus besoin du tout — chaque espèce
porte **ses vraies couleurs de feuillage et d'écorce**, saison par saison, et
c'est ce qui la rend reconnaissable. Les deux jeux cohabitent sans se marcher
dessus, la correspondance est dans `atlas/palette.ts`.

Les **saisons** décalent la palette entière (sol, herbe, feuillage, ciel,
lumière), interpolée en continu sur l'année à partir de la phénologie du moteur
(`Snapshot.pheno`). C'est l'effet le plus rentable du chantier.

**(L0) Une contrainte qu'aucun chiffre ne donnait : la palette de sol ne peut
pas être claire.** Sur un fond blanc cassé, **le bouleau disparaît** — son
écorce blanche est sa signature la plus forte, et elle ne se lit pas sur un sol
clair. Il a fallu passer la planche d'essai à un vert-gris moyen pour que les
trois essences se distinguent. Ou bien le sol reste soutenu, ou bien le bouleau
reçoit un liseré sombre ; il n'y a pas de troisième option. C'est le genre de
chose qu'on ne trouve qu'en regardant une capture.

## 5. Inventaire des visuels

### 5.1 Le terrain

| Élément | Détail | Charge |
|---|---|---|
| Tuile de sol | losange, teinte selon humidité de surface (quantifiée), ton du sol dérivé du profil (limon brun, sable clair, argile ocre) | `M` |
| Falaises / flancs | le côté vertical d'une tuile plus haute que sa voisine : c'est ce qui *fait* le relief | `M` |
| Ombrage de pente | assombrir selon l'orientation face à la lumière — l'adret et l'ubac, visibles | `S` |
| Sol nu / labouré | sillons, après `labourer` | `S` |
| Chaulage | voile clair sur le disque chaulé, qui s'estompe en quelques semaines | `S` |
| BRF épandu | tapis de plaquettes clair sous l'ancienne couronne | `S` |
| Cendres | noir profond après un feu, qui verdit au printemps suivant | `S` |
| Ravines | traces d'érosion là où `erosionArrachee` s'accumule | `M` |
| Bordures hors parcelle | les 4 côtés : forêt, prairie, grande culture, route, lotissement, lande (`paysage.ts`) — une bande de 10 m au-delà du bord, floue, qui cadre la parcelle | `M` |

### 5.2 L'eau

| Élément | Charge |
|---|---|
| Ruisseau en bord de parcelle (lit, berge selon `bergeM`) | `M` |
| Mare (disque, rive, reflet) | `S` |
| Nappe affleurante (`soilNappeCm ≤ 5`) : sol miroitant, jonchaie | `S` |
| Ruissellement en nappe (`debordement`) : lame d'eau qui court dans le sens de la pente | `M` |
| Reflet du ciel / de la végétation sur l'eau | `M` |

### 5.3 Les objets

Clôture (`S`, grillage sur les bords du clos — déjà résolu dans la vue
actuelle), manchon de plant (`S`), tas de BRF (`S`, mais il n'a pas de
position dans le moteur : à poser conventionnellement au bord), piquets
d'éclaircie ? (non).

### 5.4 Les arbres — vingt-cinq essences, vingt-cinq silhouettes

Les huit archétypes de la v0.1 ne disparaissent pas : ils deviennent des
**familles de port**, c'est-à-dire un jeu de paramètres de départ qu'on
spécialise ensuite espèce par espèce. On ne repart pas de zéro vingt-cinq fois,
et on n'accepte pas non plus que quatre espèces se ressemblent.

| Famille de port | Espèces | Ce qui les sépare *entre elles* |
|---|---|---|
| **Feuillu de futaie** | hêtre, chêne pubescent, châtaignier, frêne | Hêtre : fût lisse gris argenté, houppier dense et bas branchu, feuille ovale luisante. Chêne pubescent : trapu, tortueux, écorce crevassée, feuille lobée à revers duveteux. Châtaignier : fût sillonné en spirale, longue feuille dentée en scie, bogues. Frêne : rameaux gris à bourgeons **noirs**, feuille composée, port en éventail, dernière essence à débourrer. |
| **Pionnier léger** | bouleau | Écorce **blanche à lenticelles noires**, rameaux retombants, petite feuille triangulaire, houppier transparent. Le plus facile à reconnaître de la liste. |
| **Ripisylve** | aulne glutineux | Port dressé étroit, souvent en cépée, écorce brun foncé écailleuse, feuille arrondie tronquée au sommet, petits cônes ligneux persistants l'hiver. |
| **Conifère** | pin sylvestre | Aiguilles **par deux**, houppier en plateau chez le vieux sujet, et le **fût orangé dans sa partie haute** — la signature. |
| **Sempervirent méditerranéen** | chêne-liège, arbousier | Liège : écorce épaisse crevassée gris clair (ocre-rouge vif après démasclage), feuille petite coriace. Arbousier : **tronc rouge lisse**, feuille dentée luisante, fruits rouges granuleux et fleurs blanches **en même temps**. |
| **Fruitier greffé** | pommier, abricotier | Pommier : houppier en gobelet, floraison blanc-rosé, fruits ronds. Abricotier : port plus dressé, floraison **avant les feuilles** (d'où le gel tardif), fruits orangés. |
| **Arbuste en cépée** | noisetier, sureau, prunellier, aubépine | Noisetier : brins arqués, grande feuille cordée, chatons. Sureau : rameaux épais à moelle, feuille composée, corymbes blancs puis baies noires. Prunellier : **épineux**, floraison blanche sur bois nu, prunelles bleu-noir. Aubépine : épineux, feuille lobée, cenelles rouges. |
| **Fourré bas / lande** | ronce, ajonc, genêt, callune | Dessinés **par cellule agrégée**. Ronce : masse hérissée, mûres. Ajonc : boule épineuse jaune vif en fleur. Genêt : rameaux verts dressés, fleurs jaunes. Callune : tapis violet ras en fin d'été. |

**Les stades** restent une fonction continue de `heightM / hauteurMaxM`, mais
avec D4 c'est le squelette qui les porte : semis (< 0,5 m), gaulis (0,5–3 m),
perchis (3–10 m), futaie (10 m–max), sénescent (`fAge < 1` : cime dégarnie,
grosses charpentières mortes, houppier étalé), **chandelle** (fût gris ou noir,
qui se creuse puis tombe, `mortSemaine`).

**Toutes les fiches, sans ordre de faveur** (Q8) : les vingt-cinq essences
doivent être reconnaissables, aucune ne reste en port générique. Ça ne veut pas
dire qu'on les écrit dans le désordre — l'ordre de travail suit ce qui
**mutualise** le plus, pas ce qui est le plus utile :

1. **une fiche par famille de port** d'abord (8 fiches), pour éprouver le
   générateur sur les huit géométries et faire remonter ses manques ;
2. puis **les dix-sept restantes**, chacune dans une famille déjà défrichée, donc
   plus rapide — c'est là que le paramétrage par espèce paie.

Aucune des deux vagues ne bloque le reste du chantier : la vue tourne avec les
fiches déjà écrites, et une essence sans fiche prend le port de sa famille en
attendant la sienne. Le critère de fin est le même pour toutes : **une essence
n'est finie que si quelqu'un d'autre la reconnaît sans étiquette.**

### 5.5 Les états de gestion — le cœur de la demande

| État | Ce qu'on voit | Donnée |
|---|---|---|
| **Élagué** | bille nue jusqu'à `hauteurElagueeM`, houppier au-dessus. La silhouette de la futaie, opposée au branchu de plein vent. | ✅ déjà envoyé |
| **Trogne** | tronc court, **tête renflée** à `teteTrogneM`, faisceau de rejets dressés au-dessus. La tête grossit et se creuse avec `recepages` → cavité visible au-delà de 3–4 étêtages. | ✅ |
| **Juste étêtée** | tête nue, moignons de coupe clairs, aucun rejet — pendant une saison | ✅ |
| **Cépée recépée** | souche large, brins courts et nombreux (`heightM = 0,5` après l'action), qui repartent | ✅ |
| **Démasclé** | tronc **ocre-rouge** sur les 2–3 premiers mètres pendant quelques années, puis grisonnant | ✅ |
| **Manchonné** | fût blanc translucide au pied | ✅ |
| **Fruits mûrs** | ponctuation orange sur la couronne | ✅ (à raffiner : `fruitProgress`) |
| **En fleurs** | voile blanc/rose sur la couronne du fruitier | ✅ |
| **Fleurs gelées** | fleurs brunes, chute rapide, pas de fruits cette année | ✅ |

### 5.6 Les états de santé

| État | Ce qu'on voit | Donnée |
|---|---|---|
| Vigueur basse | feuillage clairsemé, ton pâle et jauni | `vigueur` ✅ |
| Cime sèche | branches mortes en haut du houppier, en proportion du dommage | `dommageHydraulique` ✅ |
| Défoliation | couronne mangée par les ravageurs | `ravageurs` par cellule — **pas encore envoyé** |
| Brouté | sections claires au bout des rameaux à portée, la flèche d'abord | `brouteSemaine` ✅ (issue #21) |
| Bois couché | un tronc au sol, plus sombre s'il barre l'eau | `soilBoisAuSol` + `soilBoisEnTravers` ✅ |
| Frotté | plaie de bois à nu sur un côté du fût, cernée du lambeau d'écorce | `frotteSemaine` ✅ |
| Mort sur pied | chandelle grise, sans feuille | `chandelle` ✅ |
| Brûlé sur pied | chandelle noire | `brulEeSemaine` ✅ |
| Trogne | tête renflée à son diamètre, creusée à son volume | `teteTrogneM`, `diametreTeteCm`, `caviteTeteL` ✅ (issue #19) |
| Protégé | manchon translucide, monté à la hauteur de dent | `protege` ✅ |
| Démasclé | bande ocre-rouge sur le bas du fût, qui grisonne sur la rotation | `derniereLeveeSemaine` + `ecorce.rotationAns` ✅ |

**Le liège est le seul état de cette table dont le moteur donne la DURÉE**, et
ça change tout ce qu'on peut en dire. Un fût brûlé, une plaie de frottis : le
moteur pose une semaine et n'en fait rien, donc le rendu ne lit que la présence
— il ne sait pas à quelle vitesse un charbon pâlit ni une blessure se referme.
Le liège, lui, a `ecorce.rotationAns`, et `ecorceRecoltable` s'en sert pour
refuser une levée trop rapprochée : le rapport « où en est l'écorce » est
exactement celui que le moteur compare à 1. Le rendu peut donc montrer un
GRADIENT sans rien inventer — et le bout du gradient est directement
actionnable, puisque « le liège est refait » veut dire « récoltable ». C'est le
même signal qu'un fruit mûr.

**Deux grandeurs, et il faut les deux** — les confondre serait perdre
l'essentiel de ce qu'elles disent. La **vigueur** est réversible : elle dit
« cet arbre ne pousse pas à son potentiel », et le moteur souligne qu'elle
descend bien avant le moindre stress, donc c'est l'alerte qui laisse encore le
temps d'agir. Le **dommage hydraulique** ne se répare pas : l'embolie tue des
vaisseaux, et l'arbre ne récupère qu'en fabriquant du bois neuf, ce qui prend
des années. C'est ce qui explique les mortalités DIFFÉRÉES — un arbre meurt deux
ou trois ans après la sécheresse, un été qui n'a rien d'exceptionnel — et un
joueur qui ne voit pas la cime sèche ne comprend pas pourquoi.

D'où deux dessins distincts : la vigueur éclaircit et PÂLIT le houppier
entier ; le dommage le décapite. Et la cime sèche sèche par le HAUT, parce que
c'est une histoire de distance hydraulique aux racines — un arbre qui perdrait
son feuillage bas serait un arbre broutté ou élagué, ce que l'œil sait
distinguer.

**La cime sèche DÉPLACE les fruits, elle n'en retire aucun** — et la première
version faisait l'inverse, ce qui vaut d'être écrit parce que c'est une
troisième façon de fauter, distincte des deux autres.

Le moteur calcule `fruitsKg` sans le moindre terme de dommage hydraulique :
`rendementMaxKg × sizeFactor × fruitProgress × gel × pollinisation × service`.
Il dit donc qu'un arbre à cime sèche porte sa charge ENTIÈRE. En filtrant les
rameaux secs puis en parcourant le reste avec la même probabilité, je dessinais
45 % de fruits en moins sur un arbre à 45 % de cime sèche : j'atténuais le
signal de RÉCOLTE, le seul de l'arbre qui appelle un geste, au nom d'un
mécanisme que le moteur ne modélise pas.

Et le « bois mort » n'existe même pas côté moteur — `dommageHydraulique` est un
scalaire sur l'arbre, le squelette est une construction du rendu. L'incohérence
à résoudre était donc interne au dessin, et elle n'avait aucune raison de se
payer sur une donnée. On compense le taux d'acceptation par le taux de survie
des rameaux : la charge dessinée ne bouge pas, seule sa place change — et la
place a toujours été l'affaire du rendu.

**Les trois façons de fauter, donc**, et il a fallu les trois pour les voir :
inventer une grandeur que le moteur n'a pas (le seuil de grillage de l'herbe) ;
recopier une règle qu'il a déjà (son seuil d'eau, s'il n'était pas appelé) ; et
ÉDITER une grandeur qu'il donne, en la rabotant au passage. La troisième est la
plus discrète des trois, parce qu'elle se déguise en souci de cohérence.

### 5.7 Saisons, météo, lumière

Tout se lit dans l'instantané, qui transporte déjà la `WeekWeather` complète —
il n'y a **rien à demander au moteur** pour cette section.

| Élément | Donnée | Charge |
|---|---|---|
| Quatre palettes de saison interpolées en continu | `Snapshot.pheno` | `M` |
| **Pluie** : rideau de gouttes obliques, intensité ∝ `rainMm`, sol qui foncit, gouttes qui rebondissent, flaques dans les creux | `weather.rainMm` ✅ | `M` |
| **Neige** : tuiles blanchies, couronnes chargées, fonte progressive | `tMean`, `tMinAbsC` ✅ | `M` |
| **Gel** : givre blanc au sol au petit matin, et les fleurs qui brunissent quand `bloomFrosted` passe | `tMinAbsC` ✅ + `bloomFrosted` ✅ | `S` |
| **Brume** : nappe basse dans les creux quand la nappe affleure — le fond de vallon respire | `soilNappeCm` ✅ | `M` |
| **Voile de chaleur** : l'air tremble au-dessus du sol nu en canicule | `tMaxC` ✅ | `S` |
| Ciel : teinte selon saison, couvert selon la pluie, orangé pendant un incendie | ✅ | `S` |
| Ombres qui s'allongent et tournent avec la saison | semaine ✅ | `S` |

### 5.8 Le hors-parcelle

Une bande de contexte sur les quatre côtés, dérivée de `bordures` : ça ancre
la parcelle dans un paysage au lieu de la faire flotter, et ça rend visible une
donnée qui décide de tout (semis, gibier, vent, feu). `M`.

**Refait le 2026-09-07, sur un signalement en trois mots** : « je vois encore
plein de taches sur l'extérieur de la parcelle, c'est quoi ? ». C'étaient les
bosquets du décor, et le diagnostic tient en une phrase — un bois dessiné comme
une COLLECTION D'OBJETS ne peut pas se lire autrement que comme des taches.

**Cinq réglages, cinq échecs, et le même échec cinq fois.**

| essai | ce qu'on voyait |
|---|---|
| rayon 2–5 m, hauteur `6 + hasard × 10` | des ovales isolés d'un seul aplat : des **taches** |
| rayon = 0,38 × hauteur d'essence | des boules de 20 m à peine recouvrantes : un **éboulis de galets** |
| rayon d'une cime + hauteur d'essence | un hêtre de 30 m dans 4 m de large : des **quilles** |
| rayon dérivé d'un aplatissement voulu | des **nénuphars** qui se chevauchent, encore dénombrables |
| modelé presque supprimé | les **taches** du départ, en plus large |

Le §0 de `couches/decor.ts` portait pourtant la réponse depuis le premier
jour : « de loin, une forêt n'a pas d'arbres, elle a une **lisière et une
surface** ». Le dessin contredisait son propre principe. Une surface n'a pas de
contour à compter : elle a une altitude et un bord.

**Ce qui est dessiné maintenant** : un champ de canopée (`canopee`), tracé par
les mêmes quads de quatre mètres que la nappe, à quatre coins et trié par
profondeur — donc continu par construction. La hauteur s'annule avec la
couverture, ce qui fait de la lisière une PENTE et non un mur. Deux passes par
quad : la jupe (la face verticale, l'ombre du sous-bois) puis le dessus, avec le
grain du sol. Les masses ne portent plus que les BÂTIMENTS, seule chose du
décor qui soit vraiment un objet posé sur le sol et qui se compte.

**La cohérence avec le voisinage choisi**, qui était la deuxième demande. Elle
existait à moitié et je l'avais niée à tort : `GameState` porte un `paysageId`
par côté (`paysage.ts`, `Bordures`), et les trois parts — boisé, cultivé,
urbanisé — arrivaient déjà au rendu. Ce qui était jeté en route, ce sont les
**semenciers** : `apercu-scene.ts` réduisait chaque côté à trois nombres, donc
un massif de pins de lande se dessinait comme une hêtraie. Ils voyagent
maintenant, et la canopée en tire son essence (couleur de la fiche graphique) et
sa hauteur (`hauteurMaxM` du moteur) par peuplement de vingt-six mètres. C'est
la même leçon que les houppiers du §4 : **l'unité de dessin doit porter
l'identité de l'espèce**, sinon le problème n'a fait que monter d'un cran.

**Rester hors du focus**, la troisième demande — « faut trouver un moyen pour
pas que le joueur croie que c'est à lui ». Trois moyens existaient (brume,
désaturation, contraste écrasé) et ils disent tous « c'est loin », aucun ne dit
« c'est à quelqu'un d'autre ». Le quatrième, ajouté, est une **opacité de 0,78
sur la couche** : ce qu'il y a derrière le décor est le fond de brume de
l'interface, donc le hors-parcelle se lit comme vu à travers quelque chose, et
la limite de la parcelle devient une frontière entre deux natures d'image. Posée
sur la couche Pixi, donc gratuite et sans recuisson.

**Deux corrections de découpe** trouvées en chemin :

- la **levée est plafonnée à sept mètres**. Dessinée à sa hauteur vraie, une
  canopée de trente mètres présentait au bord du bois une jupe de cent dix
  pixels d'un seul ton, et le décor sortait en facettes de cristal. La hauteur
  vraie n'apporte rien au joueur et coûte un mur autour de sa parcelle ; ce qui
  survit du plafonnement, c'est l'ORDRE (une haie se soulève de trois mètres, un
  massif du maximum) et la couleur, qui est là où est la cohérence ;
- chaque morceau de décor **redessine la canopée de ses voisins** sur neuf
  mètres. Une canopée soulevée se projette dans la zone d'écran du morceau d'à
  côté, et la nappe opaque de celui-là l'effaçait : le hors-parcelle sortait en
  filet régulier de bandes pâles, à la période exacte des morceaux de seize
  mètres.

**Et deux fausses pistes, mesurées fausses** avant celle-là : la variation des
champs (éteinte, image identique au pixel) et le réseau du bruit de grumeau
(une octave ajoutée pour rien — elle est restée, elle ne nuit pas). C'est la
troisième fois de ce chantier qu'une explication convaincante ne survit pas à la
mesure, et la troisième fois que mesurer coûte moins cher que raisonner.

**Ce qui reste ouvert sur le décor :**

- ~~un liseré pâle sur les deux bords lointains de la parcelle~~ —
  **trouvé et corrigé, et par la mesure.** J'ai soupçonné à tort la variation
  des champs, le réseau du bruit, le joint entre les images, puis le masque
  d'ombre. La réponse est venue d'un décodeur PNG de trente lignes
  (`scripts/lire-png.mjs`) : en descendant une colonne de pixels à travers le
  bord, la clarté passait de 78 à 109 sur cinq pixels avant de tomber sur la
  parcelle. Une bande PLUS CLAIRE que le décor autour, large d'un mètre ou
  deux : c'était une bande SANS CANOPÉE, et sa cause est un quad à cheval sur
  la limite dont le CENTRE tombe dans la parcelle, là où la couverture est
  nulle par définition. La canopée se décide donc sur les quatre coins, et un
  quad de bord se dessine avec ses coins intérieurs au sol — ce qui donne au
  passage la lisière qu'on veut voir là. Après correction : 100 des deux côtés
  du point suspect, plus de marche. **Quatre explications convaincantes, une
  seule vraie, et c'est la mesure qui a tranché à chaque fois** — d'où l'outil,
  qui restera.
- **le décor ignore la saison.** Sa cuisson ne reçoit pas la semaine, donc les
  bois voisins sont verts en janvier. Les couleurs d'automne et d'hiver sont
  dans les fiches ; c'est un branchement, pas une inconnue.
- **le moteur ne distingue pas une haie d'un peuplement.** `partBoisee` et
  `semenciers` ne disent pas si les 35 % boisés d'un bocage sont des haies de
  trois mètres ou des bosquets de vingt. Le rendu s'en tire par l'essence, ce
  qui est une approximation défendable — une haie de bocage est faite d'épine
  noire et d'aubépine, un massif de hêtres et de charmes.
- **`semisParAn` sert de classement d'abondance**, faute de mieux : c'est un
  taux de semis, pas une part de couvert. Une ronce qui sème beaucoup pèse donc
  autant qu'un hêtre qui sème peu.

### 5.9 Compte de ce qu'il faut produire (révisé pour D4)

La composition en pièces (D5) et le squelette généré (D4) changent la nature du
compte : on ne produit plus des *sprites*, on produit des **fiches et des
tracés**, et les textures sont cuites au démarrage à partir de là.

**À écrire à la main** (le vrai travail) :

- **25 fiches graphiques d'espèce** : ~7 paramètres de port + 1 à 4 tracés SVG
  (feuille, fleur, fruit, aiguille) + 4 couleurs de feuillage + écorce +
  `references`. **≈ 0,5 à 1 j par espèce**, la première coûtant plus cher que
  les suivantes.
- **1 générateur de squelette** paramétrable, avec les coupes (élagage,
  étêtage, recépage) et les stades. **≈ 5 j.**
- **~15 tracés d'accessoires** partagés : manchon, moignon de coupe, cavité,
  flamme, goutte, flocon, andain, plaquette de BRF, piquet, grillage.

**Cuit au démarrage** (gratuit ensuite) : pour chaque espèce, chaque stade,
chaque état foliaire et chaque état de gestion, une texture d'arbre composée ;
plus ~60 textures de terrain, d'eau et de tapis. L'atlas monte à quelques
milliers de textures selon le zoom — donc **il se cuit à la demande, pas
d'avance** : on ne génère que les combinaisons présentes sur la parcelle, avec
un cache LRU. C'est un point que le lot 0 doit valider (temps de cuisson d'un
arbre : viser < 2 ms, sinon l'apparition d'une essence fait un à-coup).

### 5.10 La faune et le son (nouveau en v0.2)

#### La faune visible

Le moteur ne simule aucun animal individuellement. Ce qu'il sait : une
`pressionGibier ∈ [0,1]`, un `broutageKg` hebdomadaire, un `frotteSemaine` par
arbre, une densité de cervidés du paysage (`gibierParHa`), une population de
ravageurs par cellule, un indice de biodiversité avec l'étalement des
floraisons. C'est assez pour peupler honnêtement la parcelle, à condition de
tenir la règle : **le nombre, l'emplacement et l'activité des bêtes dérivent de
l'état ; l'individu, lui, est de la figuration.**

| Animal | Ce qui le fait apparaître | Ce qu'il fait | Charge |
|---|---|---|---|
| **Brocard / chevreuil** | `pressionGibier` × surface, et il évite les cellules closes (`soilCloture`) | broute un plant dont `pousseTendreM` a baissé, **se frotte** contre un arbre dont `frotteSemaine` vient d'être posée, lève la tête, s'en va | `L` |
| **Oiseaux** | indice de biodiversité + saison ; plus nombreux avec les strates et le bois mort | se posent sur les branches, sur les **chandelles** en priorité (les pics y creusent), s'envolent au passage | `M` |
| **Geai** | l'espèce est déjà dans le moteur comme **disséminateur** (`dissemination: "geai"`) | enterre un gland en terrain découvert à la semaine du recrutement — c'est littéralement le mécanisme du moteur, rendu visible | `M` |
| **Papillons, abeilles** | floraisons en cours (`fruitProgress`) | tournent autour des arbres en fleurs, disparaissent hors floraison | `S` |
| **Insectes ravageurs** | `ravageurs` par cellule au-delà d'un seuil | nuée discrète sur les couronnes défoliées | `S` |

Le geai est le meilleur de la liste : il ne décore pas, il **explique** pourquoi
les chênes colonisent les friches et se régénèrent mal sous leur propre
couvert. C'est le genre de figuration qui vaut un paragraphe de cours.

**Les poules** : voir §0 — pas de sprite sans module d'élevage (Q7).

#### Le son

Des couches d'ambiance pilotées par l'état, mixées en continu (Web Audio) :

| Couche | Pilotée par | Charge |
|---|---|---|
| Vent dans les feuilles | `ventExposition` de la station × densité du couvert × feuillaison (un couvert nu siffle, un couvert plein bruisse) | `M` |
| Oiseaux | saison + indice de biodiversité (une parcelle riche est bruyante ; une pinède pure, silencieuse) | `M` |
| Pluie, grêle, vent fort | `rainMm`, `tMinAbsC` | `S` |
| Ruisseau, mare | proximité de l'eau libre à la caméra | `S` |
| Incendie | ronflement qui monte avec la surface du front | `M` |
| Chantiers | tronçonneuse, sécateur, débroussailleuse, tracteur — sur l'action jouée | `M` |

**Coût annexe** : c'est la seule entorse au « pas d'asset binaire ». Quelques
boucles courtes en `.ogg` (< 500 ko au total), dans `data/sons/`, avec licence
et provenance documentées — la même exigence de sourcing que pour les valeurs
écologiques. Un réglage de volume et un bouton muet sont obligatoires.

### 5.11 Le temps qui passe : un seul rendu, plusieurs vitesses

**Précisé par le commanditaire (2026-09-06), et ça change l'ordre des lots plus
que leur contenu.** La §6.8 décrivait déjà une politique de vitesse — bilan de
période, calque des changements, rembobinage — mais elle partait du rendu
au tick et ajoutait des dispositifs pour compenser ce qu'on ne voit pas. La
demande prend le problème par l'autre bout, et elle est plus simple :

1. **Le rendu TEMPS RÉEL est la brique de base**, pas une option de fin. On y
   voit le vent sur l'herbe et les feuillages, les oiseaux qui s'envolent —
   l'ambiance continue de la §6.1. C'est le BONUS au sens du calendrier : il
   vient quand le reste est fait. Mais c'est la brique dont tout le reste
   découle, et il ne faut donc rien construire qui l'empêche.
2. **Passer d'une semaine à la suivante est INSTANTANÉ.** Un tick, et la scène
   est celle de la semaine d'après. Il n'y a aucun sens à faire souffler le
   vent pendant cette transition-là : on ne regarde pas le temps s'écouler, on
   change de semaine.
3. **Une fois le temps réel acquis, l'ellipse n'est plus un cas particulier :
   c'est une ANIMATION.** Sauter un mois, c'est jouer l'animation de ce qui a
   changé dans le mois — par exemple tous les arbres morts pendant la période,
   animés ensemble. Et le principe ne dépend pas de la durée : une semaine, un
   mois, dix ans, c'est la même mécanique avec plus ou moins à montrer. C'est
   ce que la §6.8 appelait « fusionner les animations », mais posé comme la
   règle générale au lieu d'un palier de vitesse.
4. **Un feu, une crue : on repasse en temps réel.** Ce sont les moments où le
   joueur doit voir se dérouler, pas résumer. L'`autopause` existante et le
   « mode cinéma » de la §6.8 sont la même idée, et deviennent le comportement
   par défaut de la catastrophe.

**Ce que ça impose au rendu, dès maintenant.** Rien de neuf, et c'est
rassurant : la règle « aucune primitive vectorielle par image » va déjà dans ce
sens, puisque du temps réel demande un budget par image tenu, pas un rendu
étalé sur plusieurs images. Deux points à surveiller quand même :

- **Une animation continue ne doit pas invalider un cache de cuisson.** Le vent
  sur les feuillages ne peut pas passer par une recuisson des vignettes : ce
  sera une déformation à la POSE (un sprite qu'on incline), pas un redessin.
  C'est exactement ce que le montage Pixi rend gratuit et que le Canvas 2D
  rendrait impossible — une raison de plus pour D1.
- **L'ellipse a besoin de savoir CE QUI a changé**, pas seulement de l'état
  d'arrivée. C'est déjà ce que le protocole prépare avec les gestes rapportés
  par les actions (`actions.ts`) et ce que la §6.8 demande au worker pour le
  rembobinage. Il faudra la même chose pour les morts et les naissances.

**Ce qui est construit (2026-09-07), et par où ça passe.** Quatre modules, et la
frontière entre eux est celle du paragraphe ci-dessus — ce qui BOUGE passe par
la pose, ce qui CHANGE DE COULEUR passe par la cuisson :

| Module | Ce qu'il fait | Pur ? |
|---|---|---|
| `render/temps/ellipse.ts` | le PLAN : un journal de changements devient une suite d'actes rangés dans un budget de temps d'écran | oui |
| `render/temps/chute.ts` | la DÉFORMATION d'un arbre qui tombe, à un avancement donné et pour une vue donnée | oui |
| `render/temps/lecteur.ts` | OÙ EN EST le plan à un instant, et ce que ça fait à chaque arbre | oui |
| `render/temps/voile.ts` | le VOILE d'un geste de zone : quelles cellules sont travaillées, et à quelle force | oui |
| `pixi/scene.ts` `deformerLesArbres` / `voilerLesCellules` | applique la déformation et le voile à la POSE | non (Pixi) |

L'horloge n'est dans aucun des quatre : elle est dans la boucle d'images de
`game/VueParcelle.tsx`, qui interroge le lecteur avec `performance.now()`. C'est
ce qui garde `render/temps` testable sans navigateur.

**La propriété qui compte est mesurée, pas supposée.** Sur une friche à
2 713 sprites, avec le banc `npm run apercu:ellipse` qui fait tomber tous les
arbres à la fois : **zéro classe recuite** sur trois secondes d'animation, à
tous les avancements de lecture. Le coût de pose ne dépend pas de ce qui tombe
— 9,9 ms de médiane avec tout debout, 8,2 ms avec tout par terre (min 5,0,
max 10,7 sur douze relevés). Un premier relevé unique avait donné 25,7 ms à la
fin de l'ellipse et je l'avais mis sur le compte des sprites pivotés :
l'échantillonnage dit que c'était une image malchanceuse et rien d'autre. **Un
relevé par condition ne distingue pas un surcoût d'une malchance**, et c'est la
deuxième fois dans ce chantier qu'il fallait l'apprendre.

**Le GESTE, et ce qu'il a fallu séparer.** Les treize gestes du moteur ne se
mettent pas en scène de la même façon, et le tri ne suit pas leur type mais ce
que le moteur en DIT :

| geste | mise en scène | où |
|---|---|---|
| `chauler` `epandreBrf` `labourer` `faucher` `ramasserBoisMort` `cloturer` | ✅ un voile qui couvre les cellules nommées, puis retombe | pose |
| `brouter` `frotter` | ✅ une marque d'écorce, déjà dans la classe de vignette | cuisson |
| `couper` `eclaircir` `elaguer` `trogner` `receper` | ❌ il faudrait savoir ce qui TOMBE — [#37](https://github.com/iribarnesy/canopee/issues/37) | — |

**Le voile ne laisse rien derrière lui, et c'est ce qui garde les deux canaux
étanches.** Ce qu'un chaulage change durablement est dans les grilles de
l'instantané, donc dans la cuisson du morceau de terrain ; si le voile
persistait, la même information serait dessinée deux fois par deux chemins
différents — le §2.1 dit ce qui arrive alors. À la fin de l'acte, l'opacité est
donc nulle partout, et c'est un essai et non une intention.

**Deux corrections que seule la capture pouvait donner.** Le premier jet
faisait suivre le front d'une traîne courte : ça donnait un ANNEAU qui
s'éloignait du centre, le centre redevenu nu derrière lui — une onde de choc,
pas un chaulage. Un geste de zone COUVRE une surface, puis la poussière
retombe. Et le losange du voile, réduit sans mipmap d'une texture de soixante
pixels à neuf, sortait en DAMIER : le voile se lisait comme un grillage posé
sur le sol. C'est le seul endroit du rendu qui ait besoin de mipmaps — partout
ailleurs, les images sont cuites au zoom où elles sont posées.

Le coût, mesuré sur le pire cas atteignable (une fauche d'un hectare, toutes
les cellules allumées à la fois) : **10 349 losanges pour 5,3 ms de pose
médiane** (min 2,7, max 6,1) et zéro classe recuite. J'allais grossir la maille
du voile pour borner ce coût ; la mesure dit que ce n'était pas la peine.

**Le journal est RÉEL depuis le 2026-09-09.** Il l'était déjà de bout en bout
dans le moteur — `advanceWeek` rend `{morts, gestes, chutes, incendie}` chaque
semaine et le worker les accumule d'un instantané au suivant (`pendingMorts`) —
mais les scènes du banc étaient des instantanés muets, et le rendu se
fabriquait un journal pour avoir quelque chose à animer. `apercu-scene.ts`
accumule maintenant le vrai, avec la même sémantique que le worker : ce qui a
changé DEPUIS le dernier instantané. Les deux bancs de mécanisme
(`?ellipse-tout=1`, `?mort=`) le remplacent toujours, exprès, et leur nom dit
qu'ils forcent quelque chose.

Ce que le vrai journal donne sur la friche de référence, à l'an trente :

| scène | morts | chutes | gestes |
|---|---|---|---|
| `friche-s4` | 81 (78 de vieillesse, 2 ravageurs, 1 écrasé) | 3 | 5 |
| `friche-s13` | 153, toutes de vieillesse | 3 | 10 |
| `friche-s28` | 45 (41 écrasés, 4 d'ombre) | 54 | 4 |

**Et une conséquence mesurée qu'il faut regarder en face** : sur `friche-s28`,
une ellipse entière ne change que **196 pixels sur 880 000 — 0,02 % de
l'image** (comparaison pixel à pixel du début et de la fin, `lire-png.mjs`).
Le mécanisme marche, les quarante-cinq morts et les cinquante-quatre chutes
sont bien jouées ; simplement, sur deux mille huit cents tiges de dix pixels,
une semaine ordinaire ne se VOIT pas.

Ça ne condamne pas le §5.11, mais ça dit ce qui lui manque : **une ellipse a
besoin d'un doigt qui montre**. C'est exactement le « calque des changements »
du §6.8, rangé au lot L8 — et il passe du statut de repli à celui de pièce
nécessaire. À grande vitesse le plan le signale déjà (`deborde`) ; ce qu'on
découvre ici, c'est qu'à vitesse NORMALE le problème est le même pour la raison
inverse : il n'y a pas trop à montrer, il y en a trop peu pour qu'on le trouve.

**Ce qui manque encore.** Les cinq gestes de l'issue #37 (ce qui tombe d'une
coupe, d'un étêtage, d'un recépage), le front de feu (§6.4), et le calque des
changements ci-dessus. Une clôture n'est pas DESSINÉE non plus — le moteur
donne ses cellules, le rendu n'a pas encore de piquets ; le voile en montre le
tracé, ce qui est un pis-aller assumé. Enfin, seules les scènes `friche-*` ont
été régénérées avec leur journal : les autres tombent sur le repli, et
`apercu-scenes.sh` sait les refaire.

**Le fourré ne peut pas s'animer, et il faut le savoir.** `separerLeFourre`
agrège les ronces par carreau : elles n'ont pas d'identité individuelle, donc
rien ne peut les faire tomber une par une. Sur une friche à trente ans, 1 874
des 1 918 chandelles sont des ronces. Ce n'est pas un défaut du rendu — c'est
un choix du moteur, et le bon — mais ça veut dire que l'ellipse d'une friche
montre les quelques dizaines d'arbres et pas le fourré.

## 6. Inventaire des animations

Chaque animation est une entrée de registre : `{ déclencheur, durée réelle,
données lues, ce qu'elle dessine, priorité }`.

### 6.1 Continues (l'ambiance)

| Animation | Durée | Données | Charge |
|---|---|---|---|
| Croissance interpolée (l'arbre grandit en douceur entre deux instantanés) | continu | `heightM` | `M` |
| Balancement au vent (amplitude ∝ `ventExposition`, plus fort sur les cimes libres) | continu | station + hauteur | `M` |
| Débourrement (la couronne se remplit au printemps) | 2–3 semaines | `Snapshot.pheno` | `M` |
| Coloration d'automne | 3–4 semaines | phénologie | `S` |
| **Chute des feuilles** | 2–3 semaines, particules | phénologie + `LITTERFALL_WEEK` | `M` |
| Herbe qui pousse, jaunit, est fauchée | continu | `soilHerbe`, `herbeBiomasse` | `S` |
| Eau qui ondule, reflets | continu | — | `M` |
| Ombres qui tournent avec la saison | continu | semaine | `S` |
| Fumée / brume | continu | nappe, feu | `M` |

### 6.2 Croissance et gestion (retour d'action immédiat)

| Animation | Durée | Charge |
|---|---|---|
| Plantation : le plant apparaît, la terre est retournée autour | 0,5 s | `S` |
| **Élagage** : les branches basses tombent, la bille devient nette | 1 s | `M` |
| **Étêtage (trogne)** : la charpente tombe, la tête reste, les rejets partent au printemps suivant | 1 s + une saison | `L` |
| **Recépage** : la cépée tombe, la souche reste, les brins repartent | 1 s + une saison | `M` |
| Coupe / éclaircie : **l'arbre tombe** (rotation autour du pied, poussière), il ne s'escamote pas | 1,5 s | `M` |
| Démasclage : le tronc change de couleur, planches de liège empilées | 1 s | `S` |
| Fauche : l'herbe se couche en andains | 1 s | `S` |
| Chaulage / BRF : un voile s'étale sur le disque traité | 1 s | `S` |
| Clôture : les piquets se posent | 1 s | `S` |
| Récolte : les fruits quittent la couronne | 0,5 s | `S` |

### 6.3 Les morts — une animation par cause

`CauseMort` a onze valeurs. Chacune raconte quelque chose de différent, et
c'est exactement ce que le joueur doit comprendre.

| Cause | Mise en scène | Durée | Charge |
|---|---|---|---|
| **`secheresse`** | le feuillage jaunit puis roussit → **les feuilles tombent** (particules) → squelette gris → chute quelques semaines/années plus tard. C'est la demande explicite. | 3–4 semaines puis chandelle | `L` |
| **`engorgement`** | jaunissement **par le bas**, feuillage terne, sol miroitant au pied, l'arbre penche | 3–4 semaines | `M` |
| **`ombre`** | étiolement : l'arbre s'étire, pâlit, se dégarnit, puis s'efface sans bruit. Une mort discrète — c'est la plus fréquente en régénération, elle ne doit pas voler la vedette. | 4 semaines | `M` |
| **`vieillesse`** | cime dégarnie progressive sur des années, grosses branches mortes, puis la chandelle | des années | `M` |
| **`solHorsGamme`** | chlorose : le feuillage **jaunit entre les nervures** en gardant sa forme, la croissance s'arrête | 6–8 semaines | `M` |
| **`feu`** | voir §6.4 | — | — |
| **`abroutissement`** | le plant rapetisse par paliers, en boule, puis disparaît | quelques semaines | `S` |
| **`ravageurs`** | défoliation qui progresse, couronne trouée | quelques semaines | `M` |
| **`labour`** | disparition immédiate, terre retournée | 0,5 s | `S` |
| **`maladie`** | dessèchement d'une branche puis de l'ensemble, feuilles qui restent accrochées et brunes | quelques semaines | `M` |
| **`frottis`** | écorce arrachée au pied, l'arbre garde ses feuilles puis s'effondre d'un coup (annelé) | une saison | `M` |

**Tout est là** : `Snapshot.morts` porte l'`id`, la position et la cause, les
chandelles voyagent avec les vivants, et les morts **s'accumulent** entre deux
instantanés. Seule réserve, et elle compte : la mort au feu arrive un an en
retard dans `morts` (§2.2) — le torchage se lit sur `causeMort` et `incendie`,
pas là.

**Construit le 2026-09-09 (`render/temps/mort.ts`), et par la CUISSON.** C'est
la décision qui a tout déterminé : une chute est un mouvement, donc un panneau
qu'on incline ; une mort de sécheresse n'est pas un mouvement, c'est un
feuillage qui jaunit puis tombe, et ça ne s'obtient pas en déformant une image
déjà cuite. Ce qui rend l'exercice honnête est que les quatre grandeurs qu'une
mort fait bouger — `partFoliaire`, `senescence`, `vigueur`,
`dommageHydraulique` — sont des champs du MOTEUR que la classe de vignette
quantifie déjà. Une mort part d'un état que le moteur donne et arrive à un
état qu'il donne aussi ; le rendu ne fabrique que l'entre-deux.

Les onze mises en scène de la table ci-dessus sont traduites en « quelle
grandeur bouge, dans quelle fenêtre de l'acte ». Trois d'entre elles décrivent
une DISPARITION (labour, abroutissement, écrasement) : la classe n'y peut
rien, et celles-là passent par la pose — une opacité, une hauteur.

**Le coût, compté exactement** (`npm run apercu:classes`, hors navigateur) sur
un banc de 1 868 arbres vivants, 659 classes au repos :

| cause | classes ajoutées |
|---|---|
| sécheresse, vieillesse | 4 × le repos |
| ravageurs, solHorsGamme | 3 × |
| engorgement, maladie | 2,7 × |
| ombre | 2 × |
| feu, frottis | 1 × |
| **labour, abroutissement, écrasement** | **0** |

Trois leçons, et aucune ne venait du raisonnement :

1. **L'avancement d'une mort doit être QUANTIFIÉ** (`PALIERS_DE_MORT = 5`).
   J'avais écrit dans le module que la cuisson serait « bon marché, contre
   toute attente », au motif que la classe est déjà quantifiée. Faux : la clé
   de classe est un PRODUIT, et une grandeur continue qui y entre annule le
   cache. Quantifiée, la mort ne traverse que cinq états et le facteur
   ci-dessus est exactement le nombre d'états que la cause traverse.
2. **Les trois morts qui font disparaître l'arbre coûtent ZÉRO classe.** La
   séparation des deux canaux ne relève donc pas que du principe : elle se
   paie ou se gagne.
3. **Le coût ne dépend pas du nombre de morts** mais du nombre d'ESPÈCES qui
   meurent. Le cas pathologique est un banc qui tue toute la parcelle, pas une
   semaine de jeu.

**Et une mesure qu'il fallait savoir ne pas croire** : j'ai d'abord compté « les
classes recuites » au navigateur en échantillonnant seize images sur soixante
et en additionnant. Deux variantes du même code ont donné 965 puis 1 364 — la
somme d'un échantillon n'est pas un total. Le compte exact énumère les clés, et
il tient dans un script sans navigateur.

**Un défaut à connaître, découvert en mesurant** : `AtlasArbres` n'évince
jamais rien. Le cache de vignettes est une `Map` qui grandit pour la partie
entière — ce qui est très bien pour une friche stable, et discutable dès qu'une
ellipse en ajoute quatre mille. Personne ne l'a encore payé ; c'est écrit ici
pour que ce soit une décision et non une surprise.

### 6.4 L'incendie

Le morceau le plus spectaculaire, et le mieux servi par le moteur — `feu.ts`
sait déjà où le feu part, où il passe, qui il tue, qui rejette.

| Étape | Mise en scène | Charge |
|---|---|---|
| Conditions | l'herbe jaunit, l'air tremble, le ciel se charge (le risque est calculable : `indiceRisqueFeu`) | `M` |
| Départ | une lueur sur la cellule d'origine, un filet de fumée | `S` |
| **Le front** | une ligne de flammes qui court de cellule en cellule dans l'ordre du rang d'arrivée, s'essouffle dans le feuillu frais, fonce dans la lande. **C'est la carte de combustibilité qui devient visible** — donc la pédagogie des coupures et du choix d'essences. | `L` |
| **Arbres qui brûlent** | torchage : la couronne s'embrase, les particules montent, il reste une chandelle noire. Un chêne-liège, lui, **survit** : écorce noircie, houppier intact — la démonstration de l'adaptation, gratuite. | `L` |
| Fumée | colonne au-dessus du front, panache incliné par le vent, ciel orangé | `M` |
| Après | sol noir, cendres, chandelles, puis **rejets de souche verts au printemps suivant** (`rejetteApresFeu`) — le feu n'élimine pas, il trie | `M` |
| Caméra | le moteur met déjà le jeu en pause (`autopause`) sur incendie : la vue peut cadrer le départ | `S` |

**Le front, construit le 2026-09-10** (`render/temps/feu.ts`). Le moteur avait
tout préparé et l'avait écrit noir sur blanc — le commentaire de `rangsDuFront`
dit « c'est ce qui permet de faire COURIR une ligne de flammes au lieu de
noircir un patch d'un coup ». Le rendu ne refait aucune propagation : il compare
un rang d'arrivée à l'avancement de l'acte.

**Et il n'a presque aucune machinerie à ajouter**, ce qui est le signe que le
découpage précédent était bon : un front est un ensemble de cellules teintées
animées à la pose, c'est-à-dire exactement ce que le voile des gestes de zone
dessine déjà. Les deux passent par la même couche de losanges. Une flamme au sol
et un nuage de chaux ne sont pas la même chose, mais ils se DESSINENT de la même
façon.

Deux défauts attrapés, l'un par un essai et l'autre par le moteur lui-même :

- **le sujet « feu » du plan laissait tomber les rangs.** `ellipse.ts` ne
  portait que les cellules brûlées : le dessin aurait été obligé de noircir d'un
  coup, c'est-à-dire de perdre la seule chose qui rend un incendie pédagogique.
  Corrigé dans le plan ;
- **les dernières cellules atteintes finissaient en BRAISE et non en cendre**,
  parce que le front ne dépassait le dernier rang que de sa largeur, sans le
  rang de refroidissement. L'état final doit être celui que l'instantané
  d'après décrira : du sol brûlé.

**La scène de démonstration a appris quelque chose avant qu'on regarde
l'image** : à huit ans, le couvert s'est refermé, le combustible de surface
reste humide (`PORTANCE_SOUS_COUVERT`) et **l'allumage ne prend pas** — zéro
cellule brûlée. À trois ans, friche herbeuse et ouverte : 6 505 cellules et un
front de 116 rangs. C'est la pédagogie du tableau ci-dessus — « s'essouffle
dans le feuillu frais, fonce dans la lande » — obtenue sans une ligne de dessin,
et le banc la porte (`bash scripts/apercu-scenes.sh feu`).

Ce qui reste du §6.4 : la **fumée** (un système de particules, donc un autre
lot), et le cadrage caméra sur le départ. Le torchage, lui, est déjà là par la
cuisson : la vignette porte `brulee`, et la mort de cause `feu` la met en place
dès le premier instant.

### 6.5 La crue

| Étape | Mise en scène | Honnêteté |
|---|---|---|
| Montée | l'eau **entre par le côté du ruisseau** (`eau.cote`) et gagne les cellules dans l'ordre des altitudes croissantes | ⚠️ **mise en scène** : le moteur ne route pas d'eau de surface dans le temps, il calcule un état hebdomadaire. La vague est une *interpolation ordonnée* de l'état, pas une simulation. À afficher comme telle (elle ne mouille que ce que l'état déclare mouillé). |
| Nappe d'eau | lame d'eau réfléchissante sur les cellules à `soilNappeCm ≤ 5`, profondeur ∝ `debordement` | ✅ données réelles |
| Courant | le ruissellement suit la pente (`penteParCellule`) | ✅ |
| Retrait | l'eau redescend, laisse du limon clair et des débris à la ligne de crue | `M` |
| Victimes | les arbres noyés meurent d'`engorgement` — donc §6.3, pas d'animation spécifique | — |

Charge totale : `L`.

### 6.6 Les autres coups durs

Gel tardif (givre une nuit, fleurs qui brunissent, `S`) · canicule et
sécheresse (herbe grillée, feuillages ternes, voile de chaleur, `M`) · érosion
(ravines qui se creusent après un gros ruissellement, `M`) · pullulation de
ravageurs (défoliation qui s'étend en tache, `M`) · arrivée du gibier (rameaux
coupés, écorces frottées — jamais de sprite d'animal, `S`).

### 6.7 Le curseur d'action

Prévisualisation avant clic : le disque de chaulage, la trace de la fauche, la
position du plant avec son ombre et sa couronne à maturité (celle-là est
pédagogique : elle montre l'emprise future), l'emprise de la clôture, la
sélection d'arbres. `M`.

### 6.8 Voir ce qui a changé, même à grande vitesse (revu en v0.2, corrigé en v0.5)

> **La prémisse de cette section était fausse, et le §5.11 la corrige.** Elle
> partait de « on ne peut pas ANIMER ce qui s'est passé » et en tirait trois
> mécanismes de remplacement. Le commanditaire a relu son propre §5.11 dans
> l'autre sens : « quand on saute d'un temps à l'autre, on a les animations
> pour montrer ce qui a changé ».
>
> **Les deux se réconcilient sur un mot** : la durée de l'animation est une
> durée de PRÉSENTATION, pas une durée de jeu. Une mort de sécheresse ne prend
> pas trois semaines à montrer — elle prend le temps qu'on lui donne. D'où
> `src/render/temps/ellipse.ts` : les changements rangés dans un BUDGET de
> temps d'écran, groupés par cause et par type, dans un ordre où les causes
> précèdent leurs conséquences. Une semaine et dix ans tiennent dans le même
> budget ; l'un montre quatre actes, l'autre quarante.
>
> Les trois mécanismes ci-dessous ne disparaissent pas : ils deviennent le
> **repli** de l'animation, et le plan dit lui-même quand il faut y basculer
> (`deborde`).
>
> **La chaîne est branchée de bout en bout** : `ellipse.ts` range le journal
> dans un budget, `lecteur.ts` dit où on en est et ce que ça fait à chaque
> arbre, `chute.ts` calcule la déformation, et le poseur Pixi l'applique au
> sprite déjà cuit. Deux décisions du lecteur ne sont pas évidentes et sont
> tenues par des essais : **un arbre déjà tombé reste tombé** (sinon chaque
> arbre se relève à l'acte suivant, et l'ellipse devient une suite de choses
> qui se défont), et **les sujets d'un acte s'échelonnent** (trente-quatre
> arbres qui tombent au même millième de seconde font une chorégraphie, pas une
> forêt).
>
> **Une seule chose reste postiche** : l'origine du journal. `jeu.tsx` charge un
> instantané figé, pas un flux, donc la démonstration se fabrique des chutes à
> partir des chandelles de la scène. Le jour où le worker livrera
> `Snapshot.chutes` à la vue, deux champs inventés — la direction et la masse —
> laisseront place à ceux du message, qui les porte déjà, et rien d'autre ne
> changera. Mille arbres morts ne tiennent pas dans deux secondes en restant
> lisibles ; à ce moment-là, et à ce moment-là seulement, c'est la carte qui
> porte le changement.

**Le problème, tel qu'il était posé.** Le worker avale jusqu'à 26 semaines entre
deux instantanés. À ×64, c'est un trimestre par image ; à ×512, une année. Et
« je veux voir ce qui a changé » n'est **pas** la même demande que « je veux
voir les animations » : suivre le journal texte est effectivement pénible, donc
**la carte doit pouvoir porter le changement** quand l'animation déborde.

Trois mécanismes, qui se complètent :

#### 1. Le calque des changements — **construit le 2026-09-10**

`src/render/temps/changements.ts` (pur) + `couches/marqueurs.ts` (les trois
formes) + une couche Pixi au-dessus de tout.

**Il a changé de statut en cours de route.** Cette section le rangeait au REPLI
de l'animation, pour quand celle-ci déborde : mille morts ne tiennent pas dans
deux secondes. La mesure du §6.3 a montré le problème SYMÉTRIQUE, et il est
plus gênant : en jouant le vrai journal, une ellipse entière ne change que
**196 pixels sur 880 000**. À grande vitesse il y a trop à montrer ; à vitesse
normale il y en a trop peu pour qu'on le TROUVE. Le calque n'est donc pas un
repli, c'est la moitié manquante.

**Ce qui distingue un marqueur d'un objet du monde** — et c'est tout ce qui
compte : il a une taille en PIXELS, pas en mètres. Dix-huit pixels au zoom de
parcelle comme au zoom rapproché ; s'il grandissait avec le zoom, il serait
invisible là où on en a le plus besoin. Chaque forme est tracée deux fois — un
liseré sombre puis un trait clair — pour porter son propre contraste : les
premiers halos beiges se fondaient dans le feuillage.

La forme dit la NATURE du changement, la teinte en dit la cause : un **halo**
(anneau ouvert) sur un arbre mort, teinté par la cause ; un **liseré** (arc
bas) sur un arbre travaillé ; un **repère** (croix ajourée) au centre d'une
zone. Deux canaux, parce qu'un joueur sur deux ne distingue pas le roux du
brun. Les douze teintes de cause sont distinctes deux à deux, et un essai le
tient.

**Ce qu'il refuse de pointer, et c'est le point de conception le plus utile.**
Le premier jet rendait **7 966 marqueurs** sur une semaine de friche : la
cause est que `brouter` rapporte deux mille tiges par geste, et une semaine en
porte quatre. Ce ne sont pas huit mille événements, c'est « le gibier a brouté
partout, encore » — et ça se dit en trois mots. Au-delà de vingt-quatre tiges,
un geste n'est donc plus pointé tige par tige, et le compte des changements
non pointés (`Calque.omis`) revient à l'appelant : c'est le même aveu que
`PlanDEllipse.deborde`, et c'est lui qui désigne le bilan de période (№2) comme
le bon outil dans ce cas. Sur `friche-s28` : **45 marqueurs, 7 966 changements
non pointés**.

**Une chute n'est PAS marquée**, délibérément : c'est le seul changement de la
liste qui se voit tout seul — vingt mètres de mouvement. Le marquer ajouterait
un repère là où l'œil va déjà.

**L'ESTOMPE, ajoutée le lendemain sur une remarque du commanditaire, et c'est
un meilleur mécanisme que le mien.** Devant les halos il a demandé : « ce serait
pas mieux de rendre tout ce qui est moins pertinent transparent pour permettre
de bien voir les variations et animations ? ». Oui, et pour trois raisons qui
n'étaient pas évidentes avant qu'il le dise : ça n'ajoute AUCUN objet à une
image qui en compte trois mille (c'est un travail de soustraction, comme la
brume du §5.8) ; ça marche pour les ANIMATIONS et pas seulement pour les
positions — le seul arbre net qui bouge est celui qui tombe ; et ça ne demande
aucun vocabulaire, là où un anneau ouvert doit s'apprendre. Elle passe par
l'opacité de la POSE, donc par un canal qui existait déjà.

**Mais elle ne suffit pas seule, et c'est la mesure qui le dit.** L'estompe rend
trouvable ce qui est CLAIR ou COLORÉ — 359 semis verts sur un peuplement éteint
sautent aux yeux — et échoue sur ce qui est SOMBRE ou MINUSCULE : les
quarante-cinq chandelles nues d'une semaine restent invisibles parmi du
feuillage éteint. Le calque garde donc les deux, avec une règle simple :
**l'estompe pour trouver, un marqueur là où le contraste ne peut pas suffire.**

Trois erreurs en chemin, toutes attrapées par la capture :

- **le sol ne doit PAS s'estomper.** Je lui ai baissé l'opacité à 0,62 puis à
  0,88 : derrière lui il y a le fond de brume, qui est PÂLE, donc baisser
  l'alpha ne le fait pas reculer mais BLANCHIR. La parcelle sortait comme sous
  un voile de lait. Le sol n'a de toute façon pas changé — c'est la référence
  sur laquelle on lit les positions. Leçon générale : dans cette scène,
  l'opacité fait reculer ce qui est posé sur du sombre et blanchir ce qui est
  posé sur le fond de scène ;
- **0,3 était trop fort** : à 0,14, le peuplement recule vraiment ;
- **l'estompe s'est fait défaire par le broutage**, exactement comme les
  marqueurs. En gardant nets tous les sujets du journal, 2 058 arbres sur 2 831
  restaient nets et l'image était uniformément délavée. Même seuil, même
  raison : un phénomène de masse ne se cherche pas, il se lit dans une phrase.

**Les RECRUES sont là, et il a fallu me corriger pour ça.** J'avais ouvert
[#46](https://github.com/iribarnesy/canopee/issues/46) en affirmant que les
naissances ne voyageaient pas — sans avoir cherché le champ.
`Snapshot.trees[].ageWeeks` existe et arrive au rendu : une recrue est un arbre
plus jeune que l'intervalle du journal, ce qui se lit dans l'instantané SEUL,
sans diff et sans état gardé. C'est même plus robuste qu'une liste de
naissances, qui se perdrait si un message était sauté. Sur `friche-s17` — la
seule scène dont la fenêtre contient la semaine 14, celle du recrutement
annuel — **359 semis**, et ils se voient. L'issue ne porte plus que sur les
franchissements de stade, qui n'existent nulle part dans le protocole et dont
il n'est pas sûr que le moteur veuille les porter.

#### La demande d'origine (v0.2)

Un calque qui **marque tout ce qui a changé depuis la dernière fois que le
joueur a regardé**, et qui *persiste* au lieu de défiler :

- un **halo coloré par cause** sur chaque arbre mort (roux = sécheresse,
  bleu-violet = engorgement, gris = ombre, noir = feu, brun = vieillesse…) ;
- un **point vert** sur chaque nouvelle recrue, un **anneau** sur chaque arbre
  qui a franchi un stade (gaulis → perchis → futaie) ;
- les **cellules brûlées** en surbrillance, les **cellules inondées** aussi ;
- un liseré sur les arbres récoltés, coupés, élagués, trognés.

Les marqueurs s'accumulent tant qu'on avance vite, et **ne s'effacent qu'à la
pause** (ou par un clic « vu »). Résultat : on peut lancer vingt ans à ×512,
mettre en pause, et lire d'un coup d'œil **où** la parcelle a changé — pas dans
quel ordre, mais où et pourquoi. Charge `L`.

#### 2. Le bilan de période, cliquable

Un panneau qui remplace le fil texte quand la vitesse est haute : les
changements **regroupés** (« 34 bouleaux morts de sécheresse », « 1,2 ha
brûlé », « 210 semis installés »), chaque ligne cliquable pour que la caméra
aille se poser sur l'endroit concerné, avec ses marqueurs. C'est ce qui fait le
lien entre « il s'est passé quelque chose » et « voilà où ». Charge `M`.

#### 3. Le rembobinage — la vraie réponse

Garder les instantanés récents en mémoire et **pouvoir revenir en arrière pour
rejouer la période à ×1, avec toutes les animations**. C'est la seule façon
honnête de tout voir : on ne montre pas une année en une image, on offre de la
revoir.

Le chiffre, pour savoir si c'est réaliste : un instantané fait ~10 000 cellules
× 7 tableaux × 4 octets ≈ **280 ko**, plus les arbres. Une année (52 semaines)
tient donc dans **~15 Mo** — parfaitement tenable. On garde une fenêtre
glissante d'un an à plein détail, et au-delà on ne conserve que les
**événements** (morts, feux, crues, actions), qui pèsent presque rien. Le
worker devra poster un instantané **par semaine simulée** quand
l'enregistrement est actif, au lieu d'un par lot de 26 — c'est le seul
changement côté worker, et il ne coûte que de la mémoire, pas du calcul.
**Acté (Q9) : le rembobinage est toujours possible**, donc l'enregistrement
tourne en permanence ; sur une parcelle de 10 ha il faudra n'enregistrer que
les différences entre semaines, ou raccourcir la fenêtre. Charge `L`.

#### La politique de vitesse qui en découle

| Vitesse | Ce qu'on voit |
|---|---|
| Pause | animations continues seules (vent, eau, faune). On contemple. |
| ×1 à ×4 | tout se joue, en temps réel étiré. |
| ×8 à ×64 | animations ponctuelles **raccourcies** (×4) et **fusionnées** (dix morts = une animation groupée), **et le calque des changements est actif**. |
| > ×64 | plus d'animations ponctuelles ; le calque des changements et le bilan de période portent toute l'information, le rembobinage permet de tout revoir. |
| Catastrophe | l'`autopause` existe déjà pour l'incendie et la faillite ; on l'étend (en option) à la crue et aux mortalités de masse, puis on **rejoue la scène** à ×1 — le « mode cinéma ». |

## 7. Caméra et interaction

**Les quatre rotations sont l'essentiel** (et elles le deviennent d'autant plus
avec le relief à l'échelle vraie : une butte masque ce qu'il y a derrière, et
tourner est la façon d'aller voir).

| Besoin | Détail | Charge |
|---|---|---|
| **Rotation** | quatre quarts de tour autour de la parcelle, transition animée (le joueur doit garder ses repères). Les arbres sont des panneaux face caméra, donc rien à redessiner ; **les ombres, elles, tournent** (§3), et le nord affiché change. | `M` |
| Zoom | molette vers le curseur, de la parcelle entière jusqu'à ~15 m de large — **nécessaire pour D4** : le détail d'illustration ne sert à rien si on ne peut pas s'approcher. | `M` |
| ~~Pan~~ → **recadrage** | Tu le dis inutile, et c'est vrai *si* la vue reste à la parcelle entière. Mais dès qu'on zoome sur une trogne, il faut bien pouvoir se déplacer. Compromis : pas de pan libre à défendre comme une fonctionnalité, mais le **déplacement suit le zoom** (on zoome vers le curseur, donc on se déplace en zoomant) et la caméra sait **se poser sur un point** (un clic dans le bilan de période, §6.8). Le pan au glisser tombe alors en prime, pour une dizaine de lignes. | `S` |
| Picking | écran → cellule (inverse analytique de la projection, avec l'altitude) et écran → arbre (test dans l'ordre inverse du tri, la couronne d'abord) | `M` |
| Survol | l'arbre sous le curseur s'éclaircit, étiquette courte (essence, hauteur, état) | `S` |
| Sélection | partagée avec l'autre vue (même `selectedIds`), rectangle de sélection | `M` |
| Modes d'action | les modes existants (`planter`, `chauler`, `faucher`, `eclaircir`, `brf`, `cloturer`) réutilisés tels quels — la vue visuelle **dispatche les mêmes actions** | `S` |
| HUD minimal | date, saison, météo du moment, trésorerie, vitesse, bouton muet. Le reste est dans l'autre vue. | `M` |
| Bascule des vues | un bouton, la même partie, la même sélection, le même worker (Q2 : bascule, confirmé) | `S` |

**Une conséquence du picking avec relief** : l'inverse de la projection n'est
plus analytique tout seul, parce qu'un point de l'écran peut correspondre à
plusieurs cellules d'altitudes différentes. La méthode : inverser à plat, puis
remonter le rayon de vue cellule par cellule jusqu'à trouver la première dont
l'altitude colle. C'est une boucle de quelques dizaines d'itérations au pire,
négligeable — mais il faut y penser, et c'est testable (§8).

## 8. Tests et garde-fous

Un rendu ne se teste pas comme un moteur, mais il n'est pas intestable :

- **Projection** : test de propriété (fast-check) — `écran(parcelle(p)) == p`
  pour tout point, à toutes les orientations et tous les zooms. `S`
- **Tri en profondeur** : un arbre devant en cache un derrière, jamais
  l'inverse ; l'ordre est stable d'une image à l'autre. `S`
- **Atlas** : le générateur rend le nombre attendu de textures, aux bonnes
  dimensions ; une empreinte des pixels détecte une régression de style
  involontaire. `M`
- **Registre d'animations** : chaque animation déclare les champs
  d'instantané qu'elle lit → un test vérifie que **le protocole les fournit
  tous**. C'est ce qui empêche une animation d'inventer une donnée (principe 1,
  vérifié par la machine). `M`
- **La traduction état → instantané** : elle vit dans `src/game/snapshot.ts`,
  pure, et non plus en ligne dans le worker. Toute donnée que l'UI reçoit passe
  par là et est donc testable — c'est ce qui a manqué aux chandelles (§2.1).
  Règle : **aucune sélection, aucun filtre dans le worker** ; il assemble, il ne
  décide pas. `S`
- **Peuplement de la faune** : même principe, appliqué au §5.10 — un test
  vérifie que le nombre de bêtes de chaque espèce est bien une **fonction de
  l'état** (zéro chevreuil quand `pressionGibier` est nulle, zéro papillon hors
  floraison, aucune bête dans une cellule close pour celles que la clôture
  arrête). C'est ce qui distingue la figuration honnête de la décoration. `S`
- **Picking avec relief** : test de propriété — pour tout point d'une cellule,
  `cellule(écran(cellule))` retombe sur elle, sur un terrain accidenté et aux
  quatre orientations. C'est là que les bugs de projection se cachent. `S`
- **Déterminisme du rendu** : toute variation « organique » (le penchant d'un
  arbre, la phase de son balancement, la forme de sa couronne) dérive de son
  `id` via `engine/rng.ts`, pas de `Math.random`. Deux parties de même graine
  donnent **la même image**. ✅ **fait au lot L0** : `scripts/check-boundaries.sh`
  interdit `Math.random` dans `src/render/`. `S`
- **Budget d'image** : un test headless qui monte la scène du pire cas et
  vérifie le temps de la boucle. Fragile en CI — plutôt un script de mesure
  qu'un test bloquant. `M`

---

## 9. Découpage en lots

| Lot | Contenu | Livre | Charge |
|---|---|---|---|
| **L0** | ✅ **clos** (`docs/lot0-pointe-technique.md`) — pire cas mesuré (5 436 tiges à l'an 30, le pic), les deux moteurs comparés sur carte graphique, `src/render/projection.ts` écrit et testé, trois essences générées par branchement, trois styles rendus. **A tranché D1 pour Pixi**, corrigé D4, répondu à Q6 et produit quatre règles d'architecture. Le banc a été **supprimé** — il ne reste que `projection.ts`, le garde-fou de `check-boundaries.sh` et la décision écrite. | un prototype jetable + une décision écrite | `M` |
| **L1** | Terrain isométrique : tuiles, **relief à l'échelle vraie**, flancs, ombrage de pente, eau libre, **tri entrelacé sol/arbres**, **rotation**, zoom, picking avec altitude | on tourne autour d'une parcelle vide et belle | `L` |
| **L2** | **Le générateur d'arbres** : squelette par branchement, stades continus, LOD, atlas à la demande, + **les 6 premières fiches d'espèce** | on reconnaît six essences | `XL` |
| **L2b** | **Les 19 fiches restantes**, par vagues (fourré, fruitiers, le reste) | on reconnaît tout | `XL` |
| **L3** | **L'ELLIPSE : animer ce qui a CHANGÉ entre deux temps** — le journal des changements (morts par cause, chutes, gestes, front de feu) rangé dans un budget de temps d'écran, puis joué. La phénologie et les saisons sont faites ; l'interpolation entre instantanés, non — elle n'a pas d'objet (§5.11). **La chaîne est branchée de bout en bout et la chute est jouée** (`render/temps/`, banc `apercu:ellipse`, zéro recuisson mesurée) ; restent les autres mises en scène et le journal réel du worker (§5.11) | on voit ce qui s'est passé pendant qu'on ne regardait pas | `L` |
| **L4** | Gestion : élagage, **trogne**, recépage, démasclage, manchon, coupe qui tombe, fleurs et fruits, retours d'action | **la demande centrale : on voit ce qu'on fait aux arbres** | `L` |
| **L5** | **Les morts** : les onze causes, les chandelles qui vieillissent, la chute des feuilles de sécheresse | on comprend pourquoi ça meurt | `L` |
| **L6** | **L'incendie** : front, torchage, fumée, cendres, rejets, cadrage caméra | l'événement mémorable d'une partie | `L` |
| **L7** | **La crue** : montée, lame d'eau, courant, retrait, limon | l'autre catastrophe | `M` |
| **L8** | **Voir les changements** : calque des changements, bilan de période cliquable, **rembobinage** et mode cinéma, politique de vitesse | on peut jouer vite sans rien perdre (demande l'instantané hebdomadaire, §2.4) | `L` |
| **L9** | **La faune et le son** : brocard, oiseaux, geai, papillons ; couches sonores | la parcelle est habitée | `L` |
| **L10** | Finition : météo (pluie, neige, gel, brume), hors-parcelle, ciel, HUD minimal | ça devient un jeu qu'on montre | `L` |

**Ordre imposé** : L0 → L1 → L2 en série (rien ne se dessine sans projection ni
terrain, et rien ne s'anime sans arbres). Ensuite L3 et L4 en parallèle. L5,
L6, L7 indépendants entre eux, tous après L2 et L3. L2b se déroule **en fond**,
fiche par fiche, sans bloquer personne. L8, L9, L10 à la fin, en continu.

### Ce que les décisions de la v0.2 coûtent

| | v0.1 | v0.2 | Cause |
|---|---|---|---|
| Protocole | ~2,5 j | **0** | livré par la PR #2 |
| Terrain et caméra | `L` | `L` + `M` | relief à l'échelle → tri entrelacé (D3) |
| Arbres | `L` | `XL` + `XL` | **essences reconnaissables** (D4) : générateur + 25 fiches |
| Voir les changements | `M` | `L` | calque + bilan + rembobinage (§6.8) |
| Faune et son | hors périmètre | `L` | nouveau (§5.10) |
| **Total** | **25–35 j** | **55–70 j** | |

C'est **le double**, et la quasi-totalité de l'écart vient de D4 : reconnaître
vingt-cinq essences est de loin la décision la plus chère du lot — et c'est
probablement celle qui compte le plus pour ce jeu-là. Le compte a d'ailleurs
déjà bougé : le catalogue est passé de 19 à 25 essences pendant que j'écrivais
ce document (charme, houx, saule blanc, cornouiller mâle, fusain, troène). Le
chantier des fiches graphiques **suit la croissance du catalogue** — c'est un
coût récurrent, pas un lot qu'on ferme. Autant le savoir : chaque essence
ajoutée au moteur coûtera désormais une demi-journée à une journée de dessin
pour rester reconnaissable. Trois choses rendent le
chiffre supportable :

1. **rien n'est bloquant** : la vue tourne avec six essences finies et dix-neuf
   en port générique, et chaque fiche est un incrément livrable ;
2. **L0 → L4 (≈ 20 j) donnent déjà le jeu que tu décris** — vue isométrique,
   arbres reconnaissables, croissance, élagage, trogne, recépage ;
3. les lots L5 à L10 sont chacun un morceau **autonome** : on peut s'arrêter,
   changer d'avis, ou intercaler du moteur entre deux.

## 10. Risques

1. **Le volume de dessin de D4.** Vingt-cinq fiches graphiques, c'est le gros du
   chantier et le plus facile à sous-estimer : la tentation sera de bâcler les
   dernières et de se retrouver avec six belles essences et dix-neuf
   génériques — c'est-à-dire l'exigence à moitié tenue. Mitigation : le
   générateur d'abord (L2), les fiches en fond (L2b), et une règle simple —
   **une essence n'est « finie » que si un joueur la reconnaît sans étiquette**.
   Ça se teste sur quelqu'un d'autre.
2. ~~**La perf sur la friche en succession.**~~ **Mesuré au lot L0 sur GPU, et
   c'est ce qui a fait choisir Pixi** : il porte 43 488 tiges à 60 img/s, huit
   fois le pic de la friche, et tient 120 img/s dans les trois styles comme au
   zoom 4. La marge existe donc, et elle est large. Ce que le lot a **déplacé**,
   c'est où regarder : le point de rupture n'est pas la parcelle saturée mais
   le **zoom rapproché**, d'où l'exigence de **découper par emprise visible**
   dès L1. Et les règles du §3 restent structurelles — un `Graphics` redessiné
   à chaque image coûte sous Pixi ce qu'une ellipse coûtait à Canvas 2D, la
   différence étant qu'on ne le verra pas venir. À tenir dès L1, pas à
   rattraper.
3. **Le terrain recuit à chaque tick.** Si la quantification des valeurs de sol
   est trop fine, chaque semaine invalide tous les morceaux et le cache ne sert
   à rien. À traiter dès L1.
4. **Le tri entrelacé sol/arbres** (conséquence de D3). C'est le morceau
   d'architecture le plus délicat de L1 : un bug s'y voit comme un arbre qui
   passe *devant* une butte. Testable (§8), donc à tester tôt.
5. **La mémoire du rembobinage.** ~15 Mo pour un an, mais il faut poster un
   instantané par semaine quand l'enregistrement est actif : à surveiller sur
   une parcelle de 10 ha, où une cellule coûte cent fois plus.
6. **Deux vues à maintenir.** Chaque mécanique nouvelle devra être racontée
   deux fois. Mitigation : la vue visuelle ne montre **pas** tout — elle montre
   ce qui a une forme. Un flux d'azote n'en a pas.
7. **L'honnêteté sous pression du joli.** Le jour où on voudra une vague
   spectaculaire ou un troupeau de chevreuils, on aura envie de mouiller des
   cellules sèches et d'inventer des bêtes que le moteur ne connaît pas. La
   règle du §0, la règle de figuration du §5.10 et le test du registre
   d'animations (§8) sont là pour ça.
8. **Le son est une pente glissante côté licences.** Une boucle mal sourcée et
   le dépôt devient impubliable. D'où `data/sons/` avec licence et provenance,
   au même titre que les valeurs écologiques.

---

## 11. Questions ouvertes

### Tranchées le 2026-09-03

| | Question | Réponse |
|---|---|---|
| Q1 | Pixi ou Canvas 2D ? | **Pixi**, et cette fois c'est mesuré et non supposé : sur GPU il porte 4 à 8× plus de tiges que Canvas 2D à 60 img/s, pour 6× moins de temps de fil principal. Canvas 2D tenait le budget, mais sans marge — capacité égale à la scène, 30 img/s au zoom rapproché. Voir D1. **Tranché, banc supprimé.** |
| Q2 | Une vue ou deux ? | **Bascule** dans l'écran de jeu |
| Q3 | Niveau de mise en scène ? | **Le niveau acceptable** : vague de crue et front de flamme restent des mises en scène ordonnées d'un état hebdomadaire, explicitement bornées. Pas de routage d'eau de surface dans le moteur. |
| Q4 | Chandelles dans le moteur ? | **Fait**, et leurs conséquences aussi : combustible sur pied, obstacle pour un engin, fût sec qui se coupe |
| Q5 | Phénologie continue ? | **Faite**, sénescence séparée comprise. Le rendu la lit dans `Snapshot.pheno` (§2.1). |
| Q6 | Le style (contour ou pas) ? | **Aplats + liseré** — mesuré au lot L0 et confirmé au rejeu sur GPU : le liseré ne coûte quasiment rien de plus que l'aplat (13,0 contre 12,6 ms par image, 60 contre 63 img/s), là où l'ombre portée par image coûte 4,1 ms et ramène la cadence pile sur le budget. L'ombre est à **cuire**, pas à dessiner. Et le sol ne peut pas être clair, sinon le bouleau disparaît (§4). |
| — | La 3D ? | **Non**, raisons au §0 |
| — | Les animaux ? | **Oui** (§5.10, lot L9) — sauf l'élevage, voir Q7 |
| — | Le son ? | **Oui** (§5.10, lot L9) |
| — | La pluie ? | **Oui** (§5.7), et c'est gratuit — `rainMm` est déjà dans l'instantané |
| — | Météo volumétrique ? | **Non** — c'est la simulation de l'atmosphère en volume, elle n'a pas de sens sans 3D. L'effet, lui, est dedans. |

### Aussi tranchées

| | Question | Réponse |
|---|---|---|
| Q7 | Les poules et l'élevage ? | **Plus tard**, quand le moteur l'aura prévu. Pas de sprite d'animal d'élevage avant son module — la règle de figuration du §5.10 s'applique : la faune sauvage entre parce que le moteur sait déjà la peupler (pression de gibier, broutage, frottis, biodiversité) ; l'élevage, non. |
| Q8 | L'ordre des fiches d'espèce ? | **Pas d'ordre de faveur : il faut les faire toutes.** L'ordre de travail suit la mutualisation (une fiche par famille de port, puis les onze autres) — voir §5.4. |
| Q9 | Le rembobinage ? | **Toujours possible.** L'enregistrement de la fenêtre glissante est donc actif en permanence, quelle que soit la taille de la parcelle. Conséquence à porter : sur 10 ha, une cellule coûte cent fois plus que sur 1 ha — il faudra alors n'enregistrer que les **différences** entre semaines et non les instantanés entiers, ou raccourcir la fenêtre. À dimensionner au lot 8, pas avant. |

### Encore ouvertes

- **Le combustible sur pied.** Une chandelle est du bois sec et debout que
  `chargeCombustible` (feu.ts) ignore encore — c'est la conséquence que le
  commit des chandelles laissait ouverte, et elle est du ressort du moteur.
  Visuellement, ça veut dire qu'une chandelle ne brûlera pas dans l'incendie
  du lot L6 alors qu'elle devrait être la première à partir.
- **La chute d'une chandelle ne fait pas de trouée** dans le couvert : pas de
  tache de lumière au sol à animer le jour où elle s'abat.
- **La marcescence** : le chêne et le charme gardent leurs feuilles mortes et
  brunes une partie de l'hiver au lieu de les lâcher. `senescenceFoliaire` va
  au bout et la feuille tombe ; il faudrait un champ par espèce. C'est une
  silhouette d'hiver très reconnaissable, donc ça compte pour D4.
