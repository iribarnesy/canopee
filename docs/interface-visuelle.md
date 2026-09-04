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
> renversée (Canvas 2D d'abord), l'enveloppe du houppier ne peut pas émerger du
> branchement, et deux règles d'architecture apparaissent. Tout est mesuré et
> chiffré dans `docs/lot0-pointe-technique.md` ; les passages touchés ci-dessous
> portent la mention **(L0)**.

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
| **D1** | Moteur de rendu | ⚠️ **renversé par L0 : Canvas 2D en couches d'abord**, Pixi v8 en option de montée en charge | Mesuré sur le pire cas réel (5 017 tiges, an 50 d'une friche) : **Canvas 2D tient 9 ms par image au zoom 1 et 7,9 ms au zoom 4, en pur logiciel** — le budget est de 16,7 ms. Le rendu ne dépend donc pas d'un GPU pour être fluide, et c'est un résultat de sécurité qu'on ne veut pas perdre : zéro dépendance, contrôle total sur des formes procédurales de toute façon. Pixi garde son seul argument mesuré, et il est réel : les milliers de sprites par image (ombres, particules du lot L8) où il gagne un facteur trente. **À rejouer**, pour deux raisons cumulées : le conteneur de mesure rend WebGL en logiciel (SwiftShader), donc le bras Pixi n'y a pas été mesuré à son avantage ; et le recalibrage des hauteurs sur les tables de production est arrivé après la mesure, donc la scène testée porte une forêt deux fois trop courte — ce qui sous-mesure le remplissage par image. Les 9 ms sont un plancher. `docs/lot0-pointe-technique.md`. |
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
- **Le pire cas, mesuré (L0)** : une friche en pleine succession fait
  **5 017 tiges à l'an 50** (dont 1 059 chandelles), et la charge **plafonne
  vers l'an 25** — la friche se sature à cinq mille tiges et s'y tient.
  L'estimation était juste. Un **cinquième des tiges fait moins d'un mètre**,
  donc moins de trois pixels à la parcelle entière : le LOD n'est pas une
  optimisation tardive, c'est une part importante de la scène dès le premier
  jour.

**Deux règles d'architecture que L0 a produites, et qui ne se voient sur aucune
capture :**

- **Aucune primitive vectorielle par image.** Dessiner 5 017 ellipses d'ombre
  par image coûte **73,9 ms** à Canvas 2D contre 2,2 ms à Pixi, où ce sont des
  sprites. Le facteur trente ne doit rien au GPU : il vient du coût d'une
  primitive vectorielle appelée cinq mille fois. Ombres, halos, liserés,
  marqueurs de changement (§6.8) : **tout est cuit une fois dans un bitmap ou
  posé en sprite**. La règle vaut pour les deux bras de D1.
- **L'atlas cuit à UNE taille de référence**, mis à l'échelle ensuite, et non
  par palier de hauteur. L'atlas à la demande est validé — **474 silhouettes
  suffisent aux 5 017 arbres**, soit 10,6 arbres par texture — mais le coût de
  cuisson est passé de 46 ms à **1 740–3 369 ms** à mesure que les silhouettes
  devenaient reconnaissables (4 à 13,3 ms l'unité). Trois secondes de gel au
  premier affichage : inacceptable. Les remèdes sont connus — plafonner le
  nombre de segments par arbre, cuire à une seule taille (÷12), étaler la
  cuisson sur plusieurs images. Le terrain, lui, se cuit en 62 à 114 ms pour
  10 000 cellules en 49 morceaux : D3 est confirmé bon marché.

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

### Ce qui doit se lire sans info-bulle

1. l'**essence** — promue au premier rang par D4 (elle était dernière en v0.1) ;
2. le **stade** (semis, gaulis, perchis, futaie, sénescent, chandelle) ;
3. la **gestion** subie (élagué, trogné, recépé, manchonné, démasclé) ;
4. la **souffrance** (vigueur basse, cime sèche, feuillage jauni hors saison) ;
5. la **structure** du peuplement (qui domine, les trous, la lisière).

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
| Vigueur basse | feuillage clairsemé, ton pâle et jauni | `vigueur` |
| Cime sèche | branches mortes en haut du houppier, en proportion du dommage | `dommageHydraulique` |
| Défoliation | couronne mangée par les ravageurs | `ravageurs` par cellule — **pas encore envoyé** |
| Brouté | rameaux coupés net, plant rabougri en boule | `pousseTendreM` |
| Frotté | écorce arrachée en bas du tronc | `frotteSemaine` |
| Mort sur pied | chandelle grise, sans feuille | `chandelle`, `mortSemaine` |
| Brûlé sur pied | chandelle noire | `brulEeSemaine` |

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

### 6.8 Voir ce qui a changé, même à grande vitesse (revu en v0.2)

**Le problème, posé franchement.** Le worker avale jusqu'à 26 semaines entre
deux instantanés. À ×64, c'est un trimestre par image ; à ×512, une année. On
ne peut donc pas *animer* ce qui s'est passé — l'animation d'une mort de
sécheresse dure trois semaines de jeu, elle n'a pas de place. Mais « je veux
voir ce qui a changé » n'est **pas** la même demande que « je veux voir les
animations », et c'est ça qui débloque la solution : suivre le journal texte
est effectivement pénible, donc **c'est la carte qui doit porter le changement**.

Trois mécanismes, qui se complètent :

#### 1. Le calque des changements (`animations/changements.ts`)

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
| **L0** | ✅ **fait** (`docs/lot0-pointe-technique.md`) — pire cas mesuré (5 017 tiges), les deux moteurs de rendu comparés, `src/render/projection.ts` écrit et testé, trois essences générées par branchement, trois styles rendus. A renversé D1, corrigé D4, répondu à Q6 et produit deux règles d'architecture. **Reste** : rejouer le bras Pixi sur une machine avec GPU. | un prototype jetable + une décision écrite | `M` |
| **L1** | Terrain isométrique : tuiles, **relief à l'échelle vraie**, flancs, ombrage de pente, eau libre, **tri entrelacé sol/arbres**, **rotation**, zoom, picking avec altitude | on tourne autour d'une parcelle vide et belle | `L` |
| **L2** | **Le générateur d'arbres** : squelette par branchement, stades continus, LOD, atlas à la demande, + **les 6 premières fiches d'espèce** | on reconnaît six essences | `XL` |
| **L2b** | **Les 19 fiches restantes**, par vagues (fourré, fruitiers, le reste) | on reconnaît tout | `XL` |
| **L3** | Le temps : interpolation entre instantanés, croissance douce, **phénologie** (débourrement, coloration, chute), saisons, vent, herbe | la parcelle vit | `L` |
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
2. ~~**La perf sur la friche en succession.**~~ **Mesuré au lot L0, et ce
   n'est plus le risque principal** : 5 017 tiges se dessinent en 9 ms par
   image en Canvas 2D pur logiciel. Le risque s'est **déplacé** : ce n'est pas
   le dessin par image, c'est la **cuisson** de l'atlas (jusqu'à 3,4 s de gel
   au premier affichage) et le coût d'une primitive vectorielle répétée cinq
   mille fois. Les deux règles du §3 y répondent, et elles sont structurelles :
   à tenir dès L1, pas à rattraper.
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
| Q1 | Pixi ou Canvas 2D ? | ~~**Pixi**, avec Canvas 2D mesuré en témoin au lot 0~~ → **retourné par la mesure : Canvas 2D**, parce qu'il tient le pire cas sans GPU (9 ms/image). Voir D1. Un point reste à vérifier sur une machine avec carte graphique. |
| Q2 | Une vue ou deux ? | **Bascule** dans l'écran de jeu |
| Q3 | Niveau de mise en scène ? | **Le niveau acceptable** : vague de crue et front de flamme restent des mises en scène ordonnées d'un état hebdomadaire, explicitement bornées. Pas de routage d'eau de surface dans le moteur. |
| Q4 | Chandelles dans le moteur ? | **Fait**, et leurs conséquences aussi : combustible sur pied, obstacle pour un engin, fût sec qui se coupe |
| Q5 | Phénologie continue ? | **Faite**, sénescence séparée comprise. Le rendu la lit dans `Snapshot.pheno` (§2.1). |
| Q6 | Le style (contour ou pas) ? | **Aplats + liseré** — mesuré au lot L0 : le liseré ne coûte rien de plus que l'aplat en médiane (9,1 contre 9 ms) et a un p95 bien meilleur (18 contre 141 ms). L'ombre portée est à **cuire**, pas à dessiner. Et le sol ne peut pas être clair, sinon le bouleau disparaît (§4). |
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
