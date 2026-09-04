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

**Par cellule**, en `Float32Array`/`Uint8Array` transférés :

| Grille | Ce qu'elle porte |
|---|---|
| `soilWater` | eau de l'horizon de surface, mm |
| `soilPh` | pH |
| `soilN` | azote minéral, g/m² |
| `soilHerbe` | couverture herbacée ∈ [0,1] |
| `soilHerbeBiomasse` | herbe SUR PIED — elle reste quand l'herbe jaunit |
| `soilLitiereCG` | litière, gC/m² : le tapis de novembre, le paillage, les cendres |
| `soilBoisAuSol` | bois mort COUCHÉ, gC/m² : où poser des troncs |
| `soilRavageurs` | pression de ravageurs — la TACHE de défoliation, pas sa moyenne |
| `soilEpaisseurPerdueCm` | érosion cumulée, signée : négatif = dépôt |
| `soilNappeCm` | profondeur de la nappe, cm |
| `soilEngorgement` | engorgement du profil ∈ [0,1] |
| `soilDebordementMm` | ce qui n'est pas rentré dans le sol cette semaine, mm |
| `soilLumiere` | lumière arrivant au sol ∈ [0,1] |
| `soilCloture` | cellules closes (1) |

**Par arbre** (`SnapshotTree`, chandelles comprises) : `id`, `especeId`, `x`,
`y`, `heightM`, `ageWeeks`, `stress`, `fruitsKg`, `hauteurElagueeM`, `protege`,
`chandelle`, `teteTrogneM`, `recepages`, `vigueur`, `dommageHydraulique`,
`mortSemaine`, `brulEeSemaine`, `causeMort`, `derniereLeveeSemaine`,
`fruitProgress`, `bloomFrosted`, `pousseTendreM`, `frotteSemaine`.

**Ce qui s'est passé depuis le dernier instantané** : `events`, `refusals`,
`morts` (avec `id` et position), `chutes` (chandelles abattues : direction et
empreinte du tronc), `incendie` (compteurs + `origine`, `brulees` et `rangs` du
front), et `gestes`, qui ont DEUX mailles :

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

**Et ce que le rendu peut calculer lui-même**, sans rien demander : tout ce qui
est une fonction pure de l'instantané et des fiches d'espèces, puisque le moteur
est importable depuis l'UI. En particulier le rayon de houppier depuis la
hauteur (`light.ts:crownRadiusM`), et le feuillage de n'importe quelle espèce
depuis `Snapshot.pheno` — mais il y en a DEUX, et pour une fois c'est le rendu
que la distinction concerne le plus :

- `partFoliaireOmbrageanteDans(espece, pheno)` — ce qui intercepte la lumière,
  feuilles mortes d'un marcescent comprises. C'est la silhouette : la masse à
  dessiner, et l'ombre qu'elle porte.
- `partFoliaireActiveDans(espece, pheno)` — ce qui travaille. Un chêne de
  février garde ses feuilles brunes mais ne pousse plus.

L'écart entre les deux est donc directement la part de feuillage MORT encore
accroché : un houppier à colorer en brun-roux plutôt qu'en vert, sans qu'aucun
champ n'ait à voyager pour le dire. `senescenceFoliaire(pheno)` dit, lui, si la
chute est enclenchée.

## Deux limites connues

- **Les arbres sont sérialisés, pas transférés.** Au-delà de ~20 000 arbres il
  faudra passer en tableaux typés parallèles (un `Float32Array` par champ). Si
  tu vois le coût monter sur une friche en pleine succession, ouvre une issue.
- **Le rembobinage n'est pas fait.** Rejouer une période à ×1 après avoir joué à
  ×64 demande un instantané par semaine SIMULÉE quand l'enregistrement est
  actif, au lieu d'un par lot (`startLoop` avale jusqu'à 26 semaines par pas).
  ~280 ko par instantané sur 1 ha, ~15 Mo l'année : tenable, à cadrer avant de
  figer le protocole.
