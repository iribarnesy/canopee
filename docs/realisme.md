# Canopée — Critères de réalisme

> Référentiel de vérification du moteur, v1 (2026-09-01).
> **À quoi ça sert** : le jeu doit produire, pour *n'importe quelle* combinaison
> (sol × climat × espèces × voisinage), le résultat que produirait la réalité —
> y compris sur des stations générées, jamais écrites à la main. Ce document
> liste les comportements réels attendus, dit où on en est, et sert de feuille
> de route : chaque mécanisme ajouté doit faire basculer des critères.
>
> **Principe de non-régression conceptuelle** : aucun critère ne doit être
> satisfait par un cas particulier codé en dur. Tout passe par des paramètres
> continus et des lois générales — un critère « coché » par une exception ne
> compte pas.

## Comment lire

- ✅ **couvert** — mécanisme présent ET prouvé par un test automatisé
- 🟡 **partiel** — mécanisme présent mais grossier, ou non testé
- ❌ **absent** — le moteur ne sait pas faire

Chaque critère indique le mécanisme qui le porte et, quand il existe, le test.

## Ce qu'un test écologique a le droit d'affirmer

Trois pièges se sont refermés assez souvent sur ce dépôt pour mériter d'être
écrits une fois pour toutes.

**Un rapport entre deux quantités composites n'est pas une propriété du monde.**
« Le mélange perd deux fois moins d'aulnes », « le réchauffement double les
ravageurs », « épandre vaut +9 % » : ces rapports ont tous été rabaissés deux ou
trois fois, chaque fois pour une cause réelle et documentée — vitesses de
croissance calées sur les tables, allométrie corrigée, élancement individualisé.
Mais un seuil qu'on rabaisse à chaque changement de mécanisme n'enregistre plus
que le moteur : il a cessé de le contraindre. Ce qui résiste, c'est la
DIRECTION, et elle s'exige graine par graine plutôt qu'en moyenne — trois
directions concordantes valent mieux qu'un ratio moyen.

**Une ancre écrite d'après le moteur n'est pas une ancre.** Le seul test qui
confrontait le carbone à une valeur absolue exigeait qu'un hêtre de 25 m stocke
« quelques tonnes ». La borne avait été posée sur le volume du moteur, lequel
était faux d'un facteur cinq : elle entérinait l'erreur au lieu de l'attraper.
Une valeur absolue se cale sur une source extérieure, ou ne se cale pas.

**La conservation ne valide rien.** Un stock faux d'un facteur cinq se conserve
parfaitement. Les invariants attrapent les fuites, jamais les niveaux — c'est
d'ailleurs pour ça qu'ils sont précieux : ils ont trouvé, le jour même, une
fuite de 0,133 kg due à un grand livre de test qui mesurait le même arbre avec
deux règles. Mais un critère noté ✅ sur la seule foi d'un test de conservation
n'est pas prouvé.

**Et un invariant ne garde que le côté qu'il ferme.** Le bilan d'azote du tick
vérifiait « minéralisation = prélèvements + lessivage + Δstock » — un bilan du
SOL, où « prélèvements » compte ce qui SORT. Pendant tout ce temps, un huitième
de l'azote prélevé sur un limon pauvre sortait du sol et n'arrivait dans aucune
plante : la demande d'un arbre était gonflée par son réseau mycorhizien pour
vider la cellule, puis servie sans ce gain. Le bilan fermait parfaitement, C1
était ✅, et le mécanisme faisait PERDRE 12 % de son volume au peuplement
(#115). **Un transfert a deux côtés ; un invariant écrit sur un seul n'en garde
qu'un.** Quand une grandeur passe d'un pool à un autre, écrire l'égalité du
DÉPART et celle de l'ARRIVÉE.

Corollaire pratique : un seuil mesuré au milieu d'un lot périme avant la fin du
lot. Les chiffres cités dans les commentaires de test sont datés par le
mécanisme qui les a produits, et se remesurent quand il change.

Le même piège se referme sur les MESURES QU'ON CITE, et pas seulement sur les
seuils : un chiffre porté dans un commentaire, une PR ou ce référentiel doit
être remesuré sur le code qu'on LIVRE, pas sur celui qu'on avait à mi-parcours.
Une PR de ce dépôt a annoncé une amplitude d'élancement obtenue avec des
constantes annulées depuis — les chiffres étaient sincères et faux.

Corollaire de méthode : préférer partout les PROPORTIONS aux valeurs absolues.
« Plus de 0,9 × TOTAL » survit à un changement d'échelle, « plus de 900 kg » non.

**Additionner deux causes ne supprime pas le vase communicant, ça le déplace.**
Le premier piège a une suite, apprise en trois lots. « Le réchauffement tue » a
d'abord été mesuré sur les morts par ravageurs, puis — parce qu'un arbre ne
meurt qu'une fois et que la sécheresse lui volait ses victimes — sur la somme
soif + ravageurs. Le composite est tombé lui aussi, deux fois : le feu, les
chablis et l'ombre puisent dans le même bassin, et tout lot qui touche l'un des
trois rejoue le partage. La sortie n'est pas d'élargir la somme jusqu'à
l'épuisement des causes, c'est de changer de grandeur : **compter ce qui reste
DEBOUT**. Un arbre debout est debout quelle que soit la case qui l'aurait tué.

**Un témoin pris APRÈS le tri n'est pas un témoin.** Un essai de tempête posait
en hypothèse que deux peuplements « arrivent à taille comparable », et le
vérifiait sur la hauteur des SURVIVANTS — après que le vent a emporté les plus
grands. « Le pin était petit » et « le pin s'est fait coucher » y étaient la
même mesure, si bien que l'hypothèse tombait d'autant plus vite que la
conclusion était vraie. Quand un essai mesure un tri, sa prémisse se relève
avant le tri, ou sur un témoin que le tri n'a pas touché.

## Score actuel

| Domaine | ✅ | 🟡 | ❌ | Total |
|---|---|---|---|---|
| A. Sol, eau, atmosphère | 30 | 0 | 0 | 30 |
| B. Lumière et structure | 8 | 3 | 0 | 11 |
| C. Nutriments et cycles | 14 | 0 | 1 | 15 |
| D. Climat et phénologie | 9 | 4 | 0 | 13 |
| E. Interactions entre plantes | 8 | 4 | 0 | 12 |
| F. Dynamique des peuplements | 13 | 3 | 3 | 19 |
| G. Faune et santé | 11 | 0 | 0 | 11 |
| H. Gestion, économie, travail | 14 | 4 | 0 | 18 |
| I. Carbone | 9 | 0 | 0 | 9 |
| J. Biodiversité et structure | 8 | 0 | 0 | 8 |
| **Total** | **124** | **18** | **4** | **146** |

**Score de réalisme : 124 pleins + 18 partiels sur 146 → 91 %** *(un partiel compte 1/2)*.

> **La colonne des ❌ se rouvre, et c'est le lot des tempêtes qui la rouvre.**
> Le référentiel venait d'atteindre zéro absence ; l'avertissement écrit ce
> jour-là — « la colonne est vide parce que le référentiel ne liste que ce qu'on
> a pensé à écrire » — a été vérifié en un lot. Il n'existait AUCUNE ligne sur la
> tempête, le chablis ou la casse mécanique : le moteur ne savait pas coucher un
> arbre et personne ne comptait le point. En écrire six fait gagner trois ✅ et
> perdre deux points de score, parce que trois des six restent hors de portée
> (F17, F18, F19). Les deux points sont le prix d'un référentiel qui mesure
> encore quelque chose.

> **Ce tableau venait d'être recompté, et il était faux.** Il annonçait
> 80 / 26 / 16 sur 122 — soit 76 % — là où les lignes du document en portaient
> 104 / 28 / 2 sur 134. Personne n'a livré douze critères ce jour-là : l'en-tête
> était tenu à la main, chaque lot mettant à jour une case et le total, et la
> dérive s'est accumulée sur une trentaine de lots. Le référentiel s'est allongé
> de douze lignes sans que le total suive, et des critères sont passés de 🟡 ou
> ❌ à ✅ sans que leur colonne bouge.
>
> Deux critères portaient de surcroît un NUMÉRO DÉJÀ PRIS : le lot du relief
> avait réutilisé A13 et A14, qui désignaient déjà la structure du sol et la
> concurrence pour l'eau. Ils sont renumérotés A29 et A30 — aucun code ni aucun
> test n'y faisait référence.
>
> La leçon vaut pour la suite : **un compte tenu à la main diverge**. Il se
> recompte depuis les lignes à chaque lot, et pas seulement la case qu'on vient
> de changer.

*Historique : 47 % (référentiel initial) → 53 % (horizons de sol, dérivation
physique, profondeur et plasticité racinaires) → 55 % (strate herbacée) →
59 % (feu émergent + sylviculture) → 60 % (éclaircie outillée, liège,
récupération des bois brûlés, indice de biodiversité) → 62 % (gibier) →
65 % (ravageurs, auxiliaires et pollinisateurs — la diversité PAIE enfin) →
66 % (mécanisation déduite de la disposition des arbres) → 67 % (le climat
dérive enfin : trajectoires SSP et effet CO₂) → 69 % (le sol devient un
capital : humus ↔ azote, réserve utile dynamique, labour, dépôts
atmosphériques) → 70 % (faim d'azote, extrêmes climatiques amplifiés) → 71 % (tas de broyat : la fertilité se
transporte) → 71 % (réseaux mycorhiziens) → 72 % (cycles du phosphore et du
potassium) → 73 % (altération biologique : les cycles tiennent, P et K
limitent enfin, et les mycorhizes gagnent leur vie) → chasse et clôture, et
l'exigence minérale devient une propriété des espèces (ce qui ouvre la porte
aux cultures) → 74 % (frêne, trogne,
arbres-habitats, chalarose, mémoire hydraulique des sécheresses, frottis, geai) → 76 % (relief, écoulement
latéral, adret/ubac) → 75 % (hauteurs absolues calées sur les tables de
production) → 76 % (structure du sol : le tassement et sa réparation)
→ 88 % (aucun travail livré : l'en-tête a été recompté depuis les lignes)
→ 90 % (la strate herbacée a des espèces : trois calendriers, trois sols, et
la fenêtre de printemps) → 88 % (le vent devient un agent CASSANT : tempête,
chablis, et six critères là où il n'y en avait aucun) → 88 % (le pH cesse
d'être un état : il se lit sur un pool de bases que la litière fait pencher)
→ 88 % (le bois d'œuvre cesse d'être un puits éternel)
→ 88 % (le sanglier : un herbivore qui mange la régénération ET la favorise)
→ 89 % (la disposition paie : lisière, cœur, étagement local)
→ 89 % (l'infradensité : la biomasse cesse de se peser avec la densité du
commerce) → 90 % (les trouées et le bilan carbone d'une plantation sont enfin
mis à l'épreuve — F7 et I8 ; le domaine du carbone n'a plus une seule lacune)
→ 89 % (le plancher racinaire cesse de traiter un arbre mûr comme un semis :
l'ancrage revient à sa valeur mesurée, et E11 rend un ✅ qu'un essai tenait par
une coïncidence de dix centimètres)
→ 89 % (la place se dispute là où la graine tombe : le plafond de
recouvrement devient local, et une futaie vraiment dense redevient testable)
→ 90 % (une tige à l'ombre ne stagne pas, elle file : l'étiolement)
→ 90 % (on meurt de faim, pas de passer sous un seuil : le budget carbone —
entrée omise par son propre lot, rattrapée ici)
→ 90 % (le houppier suit le diamètre, pas la hauteur : le port serré, et
B10 est enfin complet)
→ 90 % (le réseau mycorhizien cesse de coûter 12 % du volume sur sol
pauvre — aucun point gagné, un ✅ qui était faux réparé)
→ **91 % (le calendrier des fleurs : fleurir cesse d'être fructifier, et sept
espèces qui nourrissent sans rien donner à récolter entrent au calendrier)**.*

*Le score a BAISSÉ en cours de route — au chantier du plancher racinaire comme
à celui des hauteurs, et pour la même raison. Le moteur sait faire strictement plus qu'hier ;
c'est le référentiel qui s'est mis à compter des points que personne ne comptait.
Un référentiel qui ne s'allonge jamais finit par ne plus mesurer que ce qu'on
sait déjà faire, et un score qui ne fait que monter est le symptôme de cette
maladie-là, pas une preuve de santé.*

---

## A. Sol, eau, atmosphère

| # | Critère de réalité | État | Porté par / manque |
|---|---|---|---|
| A1 | L'eau du sol suit un bilan conservatif (rien ne se perd, rien n'apparaît) | ✅ | `water.ts` ; `tick-conservation.test.ts` |
| A2 | Un sol à faible réserve utile se vide plus vite qu'un sol profond | ✅ | RU par station ; `determinism.test.ts` |
| A3 | L'évaporation d'un sol nu s'auto-limite quand la surface sèche | ✅ | `soilEvapFactor` quadratique |
| A4 | Un couvert végétal réduit l'évaporation du sol (microclimat) | ✅ | `CANOPY_EVAP_FLOOR` × ombrage au sol |
| A5 | Un paillis/litière au sol réduit encore l'évaporation | ✅ | `MULCH_MAX_EFFECT` sur le stock de litière |
| A18 | Un sol couvert d'herbe évapore moins qu'un sol nu | ✅ | couverture herbacée dans le bilan d'évaporation |
| A6 | Un sol engorgé asphyxie les racines des espèces sensibles | ✅ | `waterloggingFactor` ; `tolerances.test.ts` |
| A7 | Le vent augmente la demande évaporative ; un abri la réduit | ✅ | `windShelterAt` (portée 12 H) ; `nurse.test.ts` |
| A8 | Une nappe accessible soutient la végétation en été | ✅ | remontée capillaire décroissante avec la distance verticale ; hauteur capillaire déduite de la texture (`eau_surface.ts`) |
| A19 | Un ruisseau ou une mare tient une nappe locale : la ripisylve s'installe toute seule | ✅ | `profondeurNappeCm` (subordination au relief × portée d'influence) ; `eau-surface.test.ts` — au bord de l'eau l'aulne domine, le hêtre s'y noie |
| A20 | Sous la surface libre d'une nappe, le sol est saturé (ce n'est pas un flux, c'est un état) | ✅ | saturation imposée dans `profilHydro`, comptée comme un apport de nappe |
| A23 | Le terrain se donne cellule par cellule ; l'eau libre s'en DÉDUIT (cuvettes remplies, talwegs drainés) | ✅ | `terrain.ts` ; `terrain.test.ts` — creuser un trou fait une mare, le percer sur le côté ne fait plus rien |
| A24 | Une cuvette ne tient l'eau que si son bassin couvre l'évaporation et l'infiltration | ✅ | `assecherLesCuvettesQuiNeTiennentPas` — la même cuvette tient dans l'argile, pas dans le sable |
| A26 | Un terrain neuf peut vieillir sans joueur avant la partie (humus, herbe, colonisation, ripisylve) | ✅ | `faireVieillir` — rejoué à l'identique au chargement |
| A25 | L'eau d'amont entre par la bordure haute et traverse en s'infiltrant | ✅ | `entreesDAmont` ; `terrain.test.ts` |
| A22 | Une crue noie le bas de la parcelle quand le bassin d'amont verse, et reflue ensuite | ✅ | `hauteurDeCrueM` ; `eau-surface.test.ts` — même eau que le ruissellement d'amont, relue depuis le cours d'eau |
| A21 | Un orage sur un sol déjà plein ruisselle intégralement | ✅ | passe 1 de `profilHydro` : le refus reflue au lieu d'être perdu ; `profil-hydro-conservation.test.ts` |
| A9 | Les paramètres de sol sont **dérivés** de la texture, la profondeur, la pierrosité et la MO | ✅ | `soil.ts` ; `soil.test.ts` — **le générateur de sols est débloqué** |
| A10 | Le sol est stratifié en horizons ; les racines explorent en profondeur avec l'âge | ✅ | `profilHydro` + `profondeurRacinesCm` ; `racines.test.ts` |
| A17 | Un arbre n'investit vers le bas que s'il manque d'eau (plasticité racinaire) | ✅ | `nouvelleProfondeurRacines` ; `racines.test.ts` — et il faut distinguer DEUX choses que le moteur confondait (#84) : la plasticité, qui ne répond qu'à la soif, et le SQUELETTE d'ancrage, qu'un arbre bâtit en grandissant qu'il ait soif ou non. Le plancher `partPlancherRacines` croît donc avec la maturité (0,35 → 0,80 du potentiel), alors qu'il valait 0,35 à tout âge : un hêtre de vingt mètres jamais assoiffé avait les racines d'un semis, et c'est ce qui forçait le barème d'ancrage de `tempete.ts` à mentir (F15). L'extrémité jeune est inchangée — un semis démarre toujours en surface |
| A11 | La pente crée ruissellement, érosion et dessèchement d'adret | ✅ | `relief.ts` + `erosion.ts` ; `erosion.test.ts` — 4 t/ha/an à 15 % sur sol nu, quasi rien sous couvert |
| A27 | Ce que l'eau emporte est plus riche que le sol moyen, et se dépose plus bas | ✅ | enrichissement ×3, dépôt fonction du couvert de la cellule d'arrivée — le versant se déshabille par le sommet |
| A15 | Une nappe perchée engorge la profondeur sans asphyxier la surface | ✅ | engorgement par horizon ; drainage externe |
| A16 | Le drainage dépend de l'exutoire autant que de la texture | ✅ | `drainageExterneMmSemaine` |
| A29 | L'eau ruisselle d'une cellule à l'autre : bas de pente frais, crête sèche | ✅ | `relief.ts` ; `relief.test.ts` — le coefficient de ruissellement dépend de la pente, de la COUVERTURE DU SOL et de la saturation |
| A30 | L'altitude refroidit et l'exposition décide du rayonnement (adret/ubac) | ✅ | 0,6 °C/100 m ; ±25 % d'ETP ET ±1,5 °C entre adret et ubac — c'est la même énergie qui fait les deux, un versant sud n'est pas seulement plus sec |
| A28 | La nappe se voit : profondeur et engorgement, cellule par cellule | ✅ | calques « Nappe » et « Engorgement » alimentés par l'instantané |
| A12 | La MO du sol augmente la réserve utile (humus = éponge) | ✅ | `ruHorizonMm` + réserve de surface recalculée par cellule selon son humus ; `sol-vivant.test.ts` |
| A13 | La structure/compaction évolue (tassement, restauration par les racines) | ✅ | `tassement.ts` ; `tassement.test.ts` — un passage d'engin tasse la seule part MÉCANISABLE de la zone (`mecanisation.ts`) : une parcelle plantée serré ne se tasse pas. Le tassement ferme le sol à l'eau (ruissellement, donc érosion), coûte jusqu'à 30 % de croissance aux arbres ET à la strate herbacée (fourchette Arvalis 5–30 %), et se répare chaque année d'autant plus vite que l'enracinement est dense *(vitesse de retour à calibrer : aucune source consultée ne la chiffre)*. **Limite assumée** : toute partie démarre à structure intacte, y compris sur une parcelle de grande culture qui arriverait déjà tassée — l'historique de la parcelle n'est pas déclaré |
| A14 | Deux plantes voisines se disputent réellement l'eau de leurs cellules communes | ✅ | Allocation spatiale en 2 passes ; `nurse.test.ts` |

## B. Lumière et structure

| # | Critère de réalité | État | Porté par / manque |
|---|---|---|---|
| B1 | Un couvert dense intercepte la lumière (Beer-Lambert) | ✅ | `light.ts` |
| B2 | L'ombre est portée vers le nord (soleil au sud) : l'orientation des lignes compte | ✅ | `SHADOW_NORTH_OFFSET` |
| B3 | L'ombre est dégradée : pénombre en bordure de houppier | ✅ | atténuation en (1 − d²/r²) |
| B4 | Un héliophile meurt sous couvert fermé ; un sciaphile y patiente | ✅ | points de compensation ; `lumiere.test.ts` |
| B5 | Les caducs n'ombragent pas hors saison (fenêtre des vernales) | ✅ | `phenologie.ts` ; et la strate herbacée en profite enfin (E9) : sous la hêtraie mesurée, la lumière au sol passe de 0,69 à 0,30 entre la semaine 16 et la semaine 18 |
| B6 | Les arbres de même hauteur se gênent latéralement (auto-éclaircie) | 🟡 | `light.ts:extinctionAt` : un codominant ombrage au poids 0,4. Le terme est physiquement juste — un voisin de même taille ombrage bel et bien de côté — mais **il ne porte pas l'auto-éclaircie, et la campagne de #65 l'a mesuré** : terme ANNULÉ (poids 0), une pineraie plantée à 2 m passe quand même de 361 à 59-69 tiges en 120 ans, contre 47-54 au poids d'aujourd'hui. **Ce que l'ombrage latéral PRODUIT est désormais juste** — c'est lui qui affame les dominés, et l'auto-éclaircie tombe enfin de la lumière (cf. F6) — mais le coefficient qui le dose reste posé à la main, et il gouverne aussi la succession : le bouger mérite son propre lot. Reste 🟡 pour ça |
| B7 | La hauteur du soleil varie avec la saison et la latitude | 🟡 | décalage d'ombre constant, pas de course saisonnière |
| B8 | Les strates basses (arbustes, herbacées, couvre-sol) existent et se partagent la lumière | ✅ | `herbacees.ts` : trois herbacées, chacune avec son point de compensation, sa gamme de pH et son calendrier, se partagent le sol d'une cellule sur la place que les autres laissent ; `herbacees.test.ts` (le pH seul trie les deux graminées : molinie sur podzol à 4,5, dactyle sur limon à 7). **Limite** : pas de hiérarchie de hauteur DANS la strate — une graminée haute n'étouffe pas une rosette qui se maintient, elle n'occupe que la place lâchée |
| B9 | Une lisière reçoit plus de lumière latérale qu'un cœur de massif | 🟡 | `lisiere.ts` : l'entourage ombrage les bandes de bordure, à proportion de sa part boisée et de la distance. Géométrie NON symétrique — c'est le SUD qui ombrage, le nord ne coûte rien. Hauteur du bois voisin supposée (les bordures n'en portent pas) |
| B11 | Une tige ne peut pas être plus élancée que sa mécanique ne le permet | ✅ | `trees.ts` (`hauteurStableM`) ; `etiolement.test.ts`. Une colonne qui porte son propre poids flambe au-delà de `H ∝ D^(2/3)` (Greenhill 1881 ; exposant vérifié sur les arbres records par McMahon & Kronauer 1976), donc l'élancement maximal décroît en `D^(−1/3)` : 100 pour une perche de 12 cm, 74 pour 30 cm, 62 pour 50 cm. Le niveau est calé sur la sylviculture (la perche serrée monte à 90–100 et n'y reste pas) et recoupé par le flambage élastique du bois vert, qui donne 162 pour 12 cm — une marge de 1,6 *(à calibrer : la littérature donne une gamme)*. Ce n'est pas un couperet : la marge `H_stable − H` se referme progressivement, l'allongement s'étrangle tout seul et la tige grimpe le long de son enveloppe en s'épaississant. **C'est la mesure qui l'a rendue nécessaire** : sans elle, l'étiolement s'emballe jusqu'à H/D 295 |
| B10 | La forme du houppier réagit à la compétition (élagage naturel, port serré) | ✅ | Les DEUX moitiés y sont enfin. **L'élagage naturel** : `baseHouppierM` monte avec l'ombre, seuil = point de compensation de l'espèce (`light.ts:baseHouppierCible`, `elagage.test.ts`). **Le port serré** : le rayon du houppier suit le DIAMÈTRE et non la hauteur (`light.ts:crownRadiusM`, `port-serre.test.ts`), par le modèle du tube — la section d'aubier est proportionnelle à la surface foliaire, donc `r ∝ D` — qui est aussi l'allométrie des forestiers, dont les tables de largeur de houppier se lisent contre le diamètre. Calé pour redonner exactement l'ancienne formule à l'élancement d'une tige sans histoire (H/D 50), donc **l'identité pour un arbre normalement conformé** : le lot ne déplace que les tiges déformées. Gradient des deux côtés — 0,56 × pour une perche à H/D 90, 1,43 × pour un sujet de plein vent à 35, ce qui donne enfin au chêne isolé les vingt-cinq mètres de houppier que l'ancienne formule ne savait pas produire. **Et c'est une mesure qui l'a exigé** : `ravageurs.ts` épand la vulnérabilité de chaque hôte sur le disque de son houppier, si bien que l'étiolement (#97) avait fait tomber l'effet protecteur du mélange de 2,66–3,07 × à 1,88–2,24 × — une perche recevait le houppier d'un dominant. Le lot en rend l'essentiel : 2,79 / 2,53 / 2,35 ×. **Limite** : les racines et la transpiration restent sur l'ancienne loi, délibérément — qu'une tige dominée prospecte un disque plus petit est une affirmation distincte, qui demande sa propre mesure |

## C. Nutriments et cycles

| # | Critère de réalité | État | Porté par / manque |
|---|---|---|---|
| C1 | L'azote suit un bilan conservatif | ✅ | `tick-conservation.test.ts`, et il ferme désormais **les deux côtés du transfert**. L'ancien bilan (minéralisation = prélèvements + lessivage + Δstock) ne voyait que le sol : `uptakeKgHa` compte ce qui SORT, si bien qu'un azote prélevé et livré à personne le laissait exact. Il l'était, et 11,6 % de l'azote d'un limon pauvre s'évaporait ainsi (#115). La propriété ajoutée dit l'autre moitié : `uptakeArbresKgHa + uptakeHerbeKgHa = uptakeKgHa`, au milliardième |
| C2 | La minéralisation dépend de la température, de l'humidité et de l'anoxie | ✅ | `decompositionClimateFactor` |
| C3 | Les nitrates sont lessivés par le drainage | ✅ | `cellLeachedG` |
| C4 | Une litière à C/N bas se décompose vite ; les aiguilles, lentement | ✅ | `litterDecayRate` ; `litiere.test.ts` |
| C5 | Les fixateurs enrichissent réellement leur voisinage | ✅ | fixation → litière ; `litiere.test.ts` |
| C6 | Un frugal se contente d'un sol pauvre là où un exigeant a faim | ✅ | besoin en g/individu ; `nitrogen-conservation.test.ts` |
| C7 | Le pH exclut les espèces hors de leur gamme (calcicoles / acidiphiles) | ✅ | `phFactor` ; `embauche-chaulage.test.ts` |
| C8 | Le carbone du sol et l'azote sont couplés (retourner une prairie libère N et C) | ✅ | la minéralisation de l'humus rend C ET N au C/N de l'humus ; action `labourer` ; `sol-vivant.test.ts` |
| C13 | Les dépôts atmosphériques apportent de l'azote (et fertilisent les milieux pauvres) | ✅ | `station.depositionNKgHaAn` ; 9 à 20 kg/ha/an selon la région |
| C9 | Enfouir un matériau à C/N élevé provoque une faim d'azote | ✅ | `azoteNetDecomposition` (bascule vers C/N 27) ; l'azote est immobilisé, pas perdu ; `sol-vivant.test.ts` |
| C10 | Le pH dérive lentement (litières acidifiantes, lessivage, chaulage) | ✅ | `bases.ts` ; `bases.test.ts` — **le pH cesse d'être un état** : il se lit sur le taux de saturation d'un pool de bases échangeables, alimenté par l'altération et les dépôts, vidé par le lessivage, et penché par la teneur en CALCIUM de la litière (un trait de l'atlas, mesuré, aucune espèce nommée). Mesuré sur cinquante ans : un châtaignier fait passer un limon acide de 5,00 à 4,76, un hêtre un limon riche de 7,00 à 6,77, un frêne le même de 7,00 à 7,14 — des dixièmes, comme la podzolisation réelle. Et le chaulage cesse d'être un geste à effet fixe : la même chaux déplace un sable bien plus qu'une argile, parce que le complexe est au dénominateur |
| C14 | Les bases échangeables suivent un bilan conservatif | ✅ | `bases.test.ts` — la variation du pool vaut altération + dépôts + litière − lessivage − charge acide, à l'arrondi près. Comme pour N, P et K, et avec la même réserve : la conservation ne valide pas le NIVEAU |
| C15 | La POMPE À BASES : un feuillu remonte les bases du sous-sol et les dépose en surface, appauvrissant la profondeur | ❌ | le moteur ne tient qu'un pool de bases de SURFACE, comme pour N, P et K. Il dit donc qu'un frêne entretient son horizon de surface, et rien de ce qu'il prend en dessous. Ce n'est pas un détail : c'est par là que Foltran et al. mesurent un hêtre acidifiant le sol minéral profond PLUS qu'un épicéa (−0,5 unité en vingt ans) — l'intuition « les résineux acidifient » est une demi-vérité, et c'est la moitié que ce lot ne dit pas |
| C11 | Phosphore et potassium peuvent limiter la croissance | ✅ | `pk.ts` ; `pk.test.ts` — cycles conservatifs, flux réalistes, branchés sur la loi du minimum : rien sur un limon profond, décisifs sur un podzol acide |
| C12 | Les mycorhizes améliorent l'absorption et se construisent avec le temps | ✅ | `mycorhizes.ts` : trois réseaux incompatibles, ~5 ans à se tisser, détruits par le labour ; gain sur l'azote dilué ET **altération biologique de la roche**. **Ce ✅ était faux et personne ne pouvait le voir** : le gain gonflait la demande qui vide la cellule sans gonfler le service, si bien que le réseau COÛTAIT 11,8 % du volume sur limon pauvre et 0,7 % sur limon riche — il nuisait le plus là où il devait aider le plus. Corrigé en rangeant le gain une fois par arbre pour que les deux passes ne PUISSENT plus diverger (#115). Mesuré sur cinq graines et deux stations : **+2,79 % de volume sur limon pauvre, +0,09 % sur limon riche** (azote reçu +5,7 % et +0,7 %), gradient enfin dans le bon sens. **Limite** : le réseau fait GAGNER l'arbre dans la compétition pour l'azote minéral, il n'en AJOUTE pas — le service réel (capter l'azote organique et les pores qu'une racine n'atteint pas) demande un pool organique accessible, et le gain sur l'eau et le phosphore attend toujours |

## D. Climat et phénologie

| # | Critère de réalité | État | Porté par / manque |
|---|---|---|---|
| D1 | Le climat est réel, variable d'une année à l'autre, avec vraies sécheresses | ✅ | séries Météo-France ; `meteo-reelle.test.ts` |
| D2 | L'ETP suit le rayonnement, la latitude et l'amplitude thermique | ✅ | Hargreaves/FAO-56 ; `etp.test.ts` |
| D3 | La floraison suit un cumul de degrés-jours | ✅ | `ddYearBase5` ; `fruits.test.ts` |
| D4 | Un gel tardif détruit les fleurs ouvertes : les précoces sont un pari | ✅ | `tMinAbsC` ; `fruits.test.ts` |
| D5 | La variabilité climatique ouvre des fenêtres d'installation | 🟡 | visible (`fenetres-installation.test.ts`), non piloté par un mécanisme dédié |
| D6 | Le couvert tamponne la température (moins de gel, moins de canicule) | 🟡 | `microclimat.ts` : les trois offsets de De Frenne et al. 2019 (max −4,1 °C, moyenne −1,7, min **+1,1**), appliqués à proportion de la fermeture. Branché sur le GEL DE FLORAISON — un fruitier abrité échappe au gel tardif qui tue celui d'à côté. Pas encore sur la phénologie ni sur le stress thermique |
| D7 | Les espèces ont un besoin de froid hivernal (vernalisation) | ✅ | `besoinFroidSemaines` par espèce ; un hiver doux gonfle le forçage exigé (`debourrementExigeDJ`), `phenologie.test.ts` |
| D12 | Le feuillage a un calendrier par espèce : forçage, photopériode, déploiement progressif | ✅ | `phenologie.ts` ; `phenologie.test.ts` |
| D13 | L'automne se joue en deux temps : la feuille jaunit et cesse d'assimiler AVANT de tomber | 🟡 | `senescenceFoliaire` existe et se mesure ; elle ne commande pas encore la croissance ni la transpiration — voir ci-dessous |
| D8 | Le climat dérive au fil de la partie (trajectoires SSP) | ✅ | `climat.ts` ; `climat.test.ts` — anomalie AR6 superposée aux observations, amplification française plus forte en été, étés qui s'assèchent. Deux conséquences sont épinglées GRAINE PAR GRAINE : la pullulation de ravageurs (1,45 / 1,35 / 1,31 ×) et la MORTALITÉ, qui se lit sur ce qui reste debout de la cohorte plantée à soixante ans — 88 → 43, 49 → 38, 80 → 38 tiges sur 120, et pour le seul hêtre mésophile 55 → 21, 20 → 4, 56 → 22. **Cet instrument-là est le troisième, et les deux premiers étaient faux de la même manière** : compter les morts par ravageurs seuls (#68), puis les morts « soif + ravageurs » ensemble (#93, #84). Additionner deux causes ne supprime pas le vase communicant, ça le déplace — le feu, les chablis et l'ombre puisent dans le même bassin de victimes, et le rapport composite est tombé à trois lots de mécanisme d'affilée sans que le lien entre chaleur et mortalité ait bougé. Un arbre DEBOUT est debout quelle que soit la case qui l'aurait tué |
| D9 | La hausse du CO₂ augmente la production et l'efficience hydrique, en saturant | ✅ | réponse logarithmique sur le potentiel (donc bornée par Liebig) + fermeture stomatique testée |
| D11 | Les extrêmes s'aggravent plus vite que les moyennes (canicules, sécheresses) | ✅ | écarts chauds et déficits de pluie amplifiés (`normalesHebdo`) ; et la mémoire pluriannuelle existe — non dans le sol (qui se recharge chaque hiver, mesuré à 94-100 %) mais dans l'arbre, par la cavitation (`dommageHydraulique`) |
| D10 | L'altitude et l'exposition modifient températures et rayonnement | 🟡 | latitude seule ; pas d'altitude ni d'adret/ubac |

## E. Interactions entre plantes

| # | Critère de réalité | État | Porté par / manque |
|---|---|---|---|
| E1 | Une nurse protège (vent, rayonnement) mais concurrence (eau) : tout est dans la distance | ✅ | `nurse.test.ts` |
| E2 | Un fixateur voisin profite aux autres | ✅ | `litiere.test.ts` |
| E3 | La facilitation domine en milieu contraint, la compétition en milieu riche | 🟡 | émergent, non testé comme tel |
| E4 | Les espèces xérophiles transpirent moins par unité de feuillage (WUE) | 🟡 | dérivé du tempérament, à calibrer sur données |
| E11 | Un pivot résiste à la sécheresse là où un traçant souffre | 🟡 | `racines.test.ts` — **l'essai qui portait ce ✅ affirmait une mort que ni le moteur ni la réalité ne produisent (#84)**. Il faisait mourir un bouleau sous 25 cm de sable sur limon profond ; or le bouleau est LE pionnier des sables, l'essentiel de ses racines tient dans les soixante premiers centimètres, et sous 750 mm comme sous 320 mm aucun des deux arbres n'accumule le moindre stress sur ce profil — le bouleau y dépasse même le chêne (11,8 m contre 7,2), ce qui est juste pour un pionnier rapide contre un chêne lent. Il ne passait que parce que le plancher racinaire du bouleau tombait par hasard À L'INTÉRIEUR de la couche de sable (19 cm pour 25) : une conclusion écologique portée par une coïncidence de dix centimètres. Ce qui est mesuré, et qui est le mécanisme lui-même : sous un manteau de sable de 120 cm, **le pivot CONVERTIT la sécheresse en profondeur et le traçant ne le peut pas** — 122 → 147 cm quand on passe de 750 à 320 mm/an, contre 81 → 81, PAS UN CENTIMÈTRE, le traçant étant déjà collé au potentiel que sa taille et son espèce lui accordent quand le pivot en a encore trente devant lui. **Reste 🟡 sur la CONSÉQUENCE** : que le traçant en SOUFFRE demanderait une station où sa profondeur plafond ne suffit pas à passer l'été, et le moteur n'en produit pas encore sur laquelle l'essai reste honnête |
| E5 | Une haie brise-vent améliore la production sur 10-20 fois sa hauteur | ✅ | `windShelterAt` |
| E6 | L'allélopathie (juglone du noyer) pénalise les sensibles | 🟡 | `allelopathie.ts` + le NOYER entre à l'atlas. Portée 17,5 m (littérature : 15-20), intensité décroissante, sensibilité par espèce — pommier, pin et bouleau documentés sensibles. Et le SOL décide autant que l'arbre : le sable lessive la juglone, le limon lourd la retient. Sensibilité médiane par défaut là où la littérature ne dit rien |
| E7 | Les racines se stratifient : deux espèces peuvent puiser à des profondeurs différentes | ✅ | `fractionsRacinairesParHorizon` ; `racines.test.ts` |
| E8 | Un couvert nurse peut être « levé » (coupe progressive) au bon moment | ✅ | coupe/recépage sélectifs de la nurse |
| E9 | Les plantes de sous-bois profitent de la fenêtre de printemps | ✅ | `herbacees.ts` : une vernale ne bouge son emprise que pendant SA saison, donc elle juge la station en mars ; `herbacees.test.ts`. Sous hêtraie, la couverture du sol vaut 3 fois plus mi-avril que fin juillet et la vernale tient 36-40 % de l'emprise ; sous pinède, 1,25 et 19 % ; à découvert, 1,04 et 3 % — gradient monotone, deux graines. **Limite** : le moteur ne produit pas, sur cette station, de peuplement sempervirent assez sombre pour l'exclure tout à fait (le pin sylvestre s'auto-éclaircit) ; ce que vaut la fenêtre se lit alors sur la capacité, nulle à 4 % de lumière |
| E12 | La concurrence herbacée fait échouer les plantations non entretenues | ✅ | `herbe.ts`, `herbacees.ts` ; `herbe.test.ts` — d'autant plus forte que le sol est pauvre. La fauche emporte le FEUILLAGE et laisse l'emprise : la repousse est celle d'un chaume, pas d'une réinstallation |
| E10 | La densité de plantation modifie la forme et la vitesse (serré = élancé) | ✅ | `trees.ts` (`allocationDiametreCmParM` + le partage de l'étiolement) ; `elancement.test.ts`, `etiolement.test.ts`. Le diamètre est porté par l'INDIVIDU, et la lumière décide de l'ARBITRAGE avant de raboter la pousse : l'allongement se sert d'abord, le diamètre encaisse le résidu. Rien n'est déclaré par essence. **L'amplitude est enfin là**, et il a fallu innocenter deux coupables avant d'y arriver — ni le poids des codominants (#65 : le porter à 1 déplace les dominants serrés de 42,1 à 41,7), ni la paire d'allocation (#79 : ouvrir sa fenêtre à [40 ; 200] plafonne à 62). Le verrou était que l'ombre rabotait la pousse au lieu de la rediriger. Mesuré depuis #97 : gradient MONOTONE des dominants à 2 / 4 / 10 m d'écartement, et la tige la plus élancée du peuplement passe de 49 à **87** à 2 m, contre 38 à 10 m ; la hêtraie serrée monte à 129 à quatre-vingts ans, là où la sylviculture mesure 25–40 au large et 90–100 en perche. Et c'est bien une PERCHE, pas un nabot : elle est à 62 % de la hauteur du plus haut, là où le moteur d'avant faisait des dominés TRAPUS. **Ce que ça débloque** : `ELANCEMENT_CRITIQUE` (tempete.ts) vaut 100 et était inatteignable — la moitié haute de la rampe de chablis n'est plus du code mort. **Réserve** : le bas de gamme reste court, au large le moteur donne 35–38 quand le réel descend à 25, ce que l'allocation plafonnée à 2,5 cm/m interdit |

## F. Dynamique des peuplements

| # | Critère de réalité | État | Porté par / manque |
|---|---|---|---|
| F1 | Une friche abandonnée se boise selon la succession pionniers → climaciques | ✅ | `succession.test.ts` (200 ans) |
| F2 | La dissémination dépend du mode (vent, oiseaux, gravité) | ✅ | `regeneration.ts` |
| F3 | Les semis ne s'installent que dans leurs conditions (lumière, pH) | ✅ | filtres d'installation |
| F4 | Les arbres vieillissent et meurent (sénescence) | ✅ | `fAge` ; `succession.test.ts` |
| F5 | Le voisinage hors-parcelle ensemence en continu | ✅ | `station.voisinage` |
| F6 | L'auto-éclaircie régule la densité d'un peuplement dense | ✅ | `reserves.ts` (budget carbone) ; `reserves.test.ts`. Elle se régulait déjà — mais par les RAVAGEURS et les CHABLIS, pas par la lumière (#65) ; et une cohorte de HÊTRES ne s'éclaircissait pas du tout, 361 plantées et 361 vivantes à cent vingt ans, parce que son seuil de stress d'ombre (0,0090) passait sous le plancher de lumière du moteur (0,0111). Ce qui manquait était la famine carbonée, un budget CUMULÉ et non un seuil instantané mieux placé. Mesuré depuis, hêtraie à 2 m, deux graines, cent vingt ans — **361 tiges tombent à 413 et 419/ha**, contre 2 231/ha avec le mécanisme neutralisé. Et la trajectoire suit une **ligne d'auto-éclaircie** : pente de −1,48 et −1,52 en moindres carrés de 40 à 120 ans, à comparer au −1,605 de Reineke (1933) — dans la gamme des pentes mesurées essence par essence, plus plate que la valeur canonique. Rien dans le mécanisme ne connaît Reineke, et cette pente ne dépend pas du niveau SDI, la seule constante qu'on ne saurait pas ancrer. L'autre réserve de cette ligne, le plafond de recouvrement PARCELLAIRE, a été levée par #95 : il se lit maintenant dans un voisinage de six mètres. **Ce qui reste est l'ATTRIBUTION**, et elle est fausse : les ravageurs portent le coup final dans 293 cas sur 295, parce qu'un arbre affamé ne répare plus — c'est le syndrome réel, mais le journal du jeu dira « ravageurs » là où la cause est l'ombre (#103) |
| F7 | Les trouées déclenchent une régénération (cycle sylvigénétique) | ✅ | `regeneration.ts` + `light.ts` ; `trouees.test.ts` — comparateur APPARIÉ, la même zone avec et sans trouée sur cinq graines : 17 / 17 / 14 / 23 / 17 recrues contre 6 / 9 / 12 / 10 / 5 (et 8/8 sur la campagne élargie). Et ce n'est pas « plus de semis » mais un TRI — le bouleau (compensation 0,25) n'entre que par l'ouverture, le charme (0,03) recrute jusque sous le couvert. **Une limite est tombée, l'autre tient.** Le plafond de recouvrement était PARCELLAIRE : au-delà, plus rien ne s'installait nulle part, trouée comprise, et l'essai avait dû se replier sur un écartement de huit mètres — le seul qui reste sous le plafond — donc sur un couvert perméable au lieu de la futaie dense qui est le cas intéressant. Le plafond est devenu local (#95), et l'essai porte désormais un second banc à TROIS mètres d'écartement, recouvrement 6,8 à 9,5 : **le témoin fermé n'y recrute rien du tout — 0 sur les cinq graines — et la trouée recrute 3 / 2 / 4 / 6 / 4.** C'est F7 sans détour, et sans garde-fou. Ce qui tient, c'est qu'un point quelconque du peuplement ne fait PAS un témoin fermé — et l'auto-éclaircie (#96) l'a confirmé en troublant le dernier comparateur croisé qui restait, retiré à son tour pour prémisse fausse |
| F8 | Certaines espèces rejettent de souche ou drageonnent | 🟡 | Rejet de souche : `rejetteDeSouche`, éprouvé après feu et après recépage. DRAGEONNEMENT : `regeneration.drageonne` (prunellier), un drageon sort dans un anneau serré autour de sa mère ET échappe au filtre de lumière, parce qu'elle le nourrit. Reste sans drageonnement : robinier et peuplier, absents de l'atlas |
| F9 | La banque de graines du sol garde une mémoire du passé | 🟡 | `banqueGraines.ts` : ajonc, genêt, callune et ronce gardent une banque de 15 à 30 ans que le FEU réveille (il scarifie sans détruire, le sol isole). Une lande rasée revient en lande depuis le sol, sans voisinage pour la réensemencer — et le témoin sans banque reste nu. Banque tenue à l'échelle de la parcelle, pas de la cellule |
| F10 | Le feu tue, sélectionne et régénère (espèces pyrophytes) | ✅ | `feu.ts` ; `feu.test.ts` |
| F11 | Le risque d'incendie ÉMERGE du climat (il remontera vers le nord) | ✅ | `indiceRisqueFeu` : sécheresse × chaleur × combustible × vent, aucune station déclarée « à feu » |
| F12 | Le feu se propage selon ce qui brûle : une coupure ou un feuillu frais l'arrêtent | ✅ | `probabilitePropagation` ; `feu.test.ts` |
| F14 | Une tempête couche des arbres : le chablis existe, et il est l'accident le plus brutal de la vie d'un peuplement | ✅ | `tempete.ts` ; `tempete.test.ts` — une rafale hebdomadaire dérivée de la graine de partie (queue exponentielle sur le vent moyen), cinquantennale à 40-45 m/s. Le seuil de dégât est celui de l'ARBRE, pas celui de la rafale : les coups de vent ordinaires reviennent chaque hiver et ne couchent rien |
| F15 | La vulnérabilité au vent se trie par INDIVIDU, et rien n'est déclaré espèce par espèce | ✅ | `vitesseCritiqueMs` : élancement H/D, ancrage rapporté au bras de levier (`rootDepthCm / hauteur`), sol gorgé au-delà de ce que l'espèce tolère, prise au vent foliaire de la semaine, souplesse des jeunes tiges. Aucun trait nouveau à l'atlas — tout se lit sur l'état de l'arbre. Deux faits de terrain TOMBENT de là sans être écrits : les tempêtes sont hivernales (le vent moyen l'est), et le caduc nu paie moins que le sempervirent (mesuré à 60 ans : 4-11 tiges couchées contre 65-88). Un des cinq facteurs trie mal, et le dit : l'élancement, parce que le moteur n'en produit qu'un cinquième de la gamme réelle (#79). **L'ancrage, lui, ne triait mal que par ricochet, et c'est réparé (#84)** : la profondeur racinaire d'un arbre mûr était fausse — le plancher `RACINES_PLANCHER` traitait un hêtre de vingt mètres comme un semis — ce qui forçait le seuil d'ancrage à descendre à 4 % pour ne pas coucher toute une population légitime. Plancher corrigé, les deux régimes hydriques du moteur tiennent maintenant dans un rapport de 1,5 (0,039 sur site jamais sec, 0,059 sur été sec) au lieu de 2,7, et le seuil est revenu à la valeur mesurée sur de vraies hêtraies, 6 % |
| F16 | Ce qui dépasse prend le vent : un sous-étage est abrité, une futaie régulière ne s'abrite pas elle-même | ✅ | `abriAuVent` ne somme que le DÉPASSEMENT des voisins plus hauts, là où l'abri de haie (`windShelterAt`, E5) sature à 1 dans n'importe quel peuplement. C'est Klaus dans les pins landais alignés |
| F17 | La casse partielle existe à côté du déracinement : volis, bris de cime, branches arrachées | ❌ | le moteur ne connaît qu'un renversement entier — un arbre tient ou il verse. Ni cime cassée, ni arbre penché qui survit avec une plaie, alors que c'est la moitié des dégâts d'une tempête réelle |
| F18 | Un peuplement qu'on vient d'ouvrir (éclaircie, lisière neuve) verse pendant quelques années | ❌ | `abriAuVent` recalcule l'abri dans la semaine qui suit la coupe : les survivants sont réputés adaptés instantanément. Il y faudrait une mémoire par arbre de l'ouverture récente |
| F19 | La fréquence des tempêtes suit la dérive du climat | ❌ | `AMPLIFICATION_EXTREMES` (D11) joue sur la chaleur et la pluie, pas sur le vent. Les deux moitiés sont dans deux fonctions qui ne se voient pas : `meteoDerivee` connaît le scénario mais pas la graine de partie, donc ne peut tirer de rafale ; `tick` la tire et ignore le scénario |
| F13 | Les hauteurs à un âge donné tombent dans les tables de production | 🟡 | `hauteurs.test.ts` : six essences contre des tables (Jansen 1996 aux Pays-Bas, Lockow 2009 pour le charme, Lemaire 2005 pour le châtaignier) et quatre arbustes contre des mesures de terrain britanniques et bretonnes, faute de table. Deux essences seulement y sont CALÉES (hêtre, charme) : l'essai les garde plus qu'il ne les valide. Les huit autres sont une validation entière, et la vérification tenue à l'écart est à vingt ans (−13 % à +10 %). Restent hors référence, et le disent : bouleau, chêne pubescent, saule blanc, prunellier — plus le chêne-liège, faute de station méditerranéenne où le confronter |

## G. Faune et santé

| # | Critère de réalité | État | Porté par / manque |
|---|---|---|---|
| G1 | Le gibier abroutit les jeunes plants non protégés | ✅ | `gibier.ts` ; `gibier.test.ts` — au-dessus de ~0,35 cervidé/ha, une plantation appétente ne sort jamais de la hauteur de dent |
| G9 | Passer la hauteur de dent ne met pas à l'abri : frottis et écorçage | ✅ | `frottisDeLaSemaine` — le brocard vise les tiges ISOLÉES, à écorce lisse, entre 1,2 et 5 m ; sous 1,6 m la blessure annelle |
| G7 | Sa sélectivité réoriente la composition (le noisetier trinque, le pin passe) | ✅ | `especes.gibier.appetence` ; émergent, rien n'est codé espèce par espèce |
| G8 | Un herbivore ne détruit rien : il déplace et concentre le C et l'azote | ✅ | déjections rendues à la cellule broutée ; conservation C et N testée |
| G2 | Les ravageurs apparaissent quand les hôtes s'affaiblissent | ✅ | `ravageurs.ts` ; `ravageurs.test.ts` — sans seuil scripté : vigueur → ressource → pullulation, avec hivernage donc crises pluriannuelles |
| G3 | Les auxiliaires régulent les ravageurs selon l'habitat offert | ✅ | prédation ∝ habitat du voisinage (essences, strates, herbe, bois mort) ; l'aulnaie pure se fait décimer sur chacune des trois graines, le mélange y perd trois à quatre fois moins d'aulnes (0,34 / 0,34 / 0,23) et y écrête la pullulation d'un facteur 2,8 à 3,1. Les deux sont épinglés GRAINE PAR GRAINE depuis #68, et non plus en moyenne : l'écart de mortalité avait failli s'annuler sur une graine sans que la moyenne le dise |
| G4 | Les pollinisateurs conditionnent la fructification | ✅ | Le service demande désormais **un gîte ET une table**, et le plus rare décide : `min(habitat, ressourceFlorale)` (`tick.ts`, `floraison.test.ts`). L'habitat dit où l'insecte vit — essences, strates, herbe, bois mort ; la ressource florale dit ce qu'il a eu à manger, par une MÉMOIRE de sept semaines agrégée sur la fenêtre de butinage (blocs de 10 m, voisinage 3×3, celle-là même que `ravageurs.ts` emploie pour l'habitat). **Le témoin est le résultat** : neuf pommiers, vingt-deux ans, trois graines, et deux haies rigoureusement égales — même nombre de tiges, mêmes espèces mellifères, même couvert. Celle qui fleurit de février à l'automne rend 327,6 kg, celle qui fleurit toute en mai 263,4 kg, le verger nu 255,6 kg : **+28 % pour le calendrier, +3 % pour la seule présence de voisins**. Coût mesuré : +6 % de temps par semaine simulée. **Et un second banc, tout différent, donne le même chiffre** : deux pommiers entourés de six arbustes, douze ans — une haie MELLIFÈRE (prunellier, aubépine, ronce) rend 14,74 kg contre 11,52 kg pour le verger nu, soit +28,0 %, quand la même haie ANÉMOPHILE (noisetier, chêne, bouleau) n'en rend que 11,62 kg, +0,9 %. Cet essai-là passait AVANT le lot avec la seule haie anémophile : le moteur affirmait que trois arbres pollinisés par le vent améliorent la nouaison d'un verger de 15 %, parce que le service ne lisait que la richesse en essences. **Limite** : pas d'insectes individualisés — ni espèces, ni populations, ni distance de butinage propre à chacune ; la fenêtre est celle des auxiliaires, faute d'en avoir mesuré une autre |
| G5 | Les disséminateurs (geai) transportent les grosses graines | ✅ | mode `geai` : loin du parent ET **en découvert**, parce que l'oiseau doit retrouver ses caches. C'est ce biais qui fait coloniser les friches par les chênes et explique leur mauvaise régénération sous leur propre couvert (`geai.test.ts`) |
| G10 | Le sanglier retourne le sol et mange la glandée — un herbivore qui FAVORISE aussi la régénération | ✅ | `sanglier.ts` ; `sanglier.test.ts` — 5 % de la parcelle retournée par an à densité de référence (relevés : 0,2-0,7 %/an en prairie, 7-11 %/an en forêt), en automne et en hiver, sur les cellules qui offrent de la glandée, du couvert et un sol humide. **Deux effets de signe opposé, et aucun n'est écrit par espèce** : il mange ce qui tombe et reste (les graines dont le mode de dissémination est `geai` ou `gravite`), il ouvre un lit de germination pour ce qu'apporte le vent. Mesuré sur quarante ans : 97 recrues de chêne sans sanglier, 60 à densité ordinaire, 22 sous forte densité — difficile, jamais impossible |
| G11 | Un boutis est un ENFOUISSEMENT, pas une destruction : la litière passe au pool lent | ✅ | le carbone enfoui rejoint l'humus et l'azote le pool minéral ; le stock d'humus MONTE avec la densité de sangliers. Et la structure y gagne — un boutis casse la croûte, ce qu'on n'attend pas d'un dégât. Ce qu'il coûte est ailleurs : la terre est à nu, donc elle part |
| G6 | Les maladies datées frappent (chalarose du frêne) | ✅ | `maladies.ts` ; `maladies.test.ts` — mieux qu'une date : une année d'arrivée historique, puis une pression qui suit la densité d'hôtes et l'humidité. Une frênaie pure perd un tiers de ses tiges en trente ans, le même nombre de frênes en mélange s'en tire deux fois mieux |

## H. Gestion, économie, travail

| # | Critère de réalité | État | Porté par / manque |
|---|---|---|---|
| H1 | Chaque action coûte du temps de travail et de l'argent | ✅ | `actions.ts` ; `actions.test.ts` |
| H2 | Le temps de travail est plafonné par semaine et budgété à l'année (UTH) | ✅ | `WEEK_HOURS_CAP` |
| H3 | Saisonnier vs CDI : coûts, durées et ruptures réalistes | ✅ | `embauche-chaulage.test.ts` |
| H4 | La cadence de récolte dépend de l'espèce (pommes vs noisettes) | ✅ | `fruits.recolteHKg` |
| H5 | Une récolte non faite dans sa fenêtre est perdue | ✅ | `fruits.test.ts` |
| H6 | Le bois d'œuvre vaut beaucoup plus que le bois énergie (qualité, diamètre) | ✅ | `valeurSurPied` ; `sylviculture.test.ts` — il faut une bille élaguée ET du diamètre |
| H7 | Les prix varient (marché, saturation locale) | 🟡 | `marche.ts` : indice annuel (cycle de 11 ans + bruit, borné 0,6-1,5) calé sur la volatilité réelle des bois sur pied, et DÉCOTE D'ENGORGEMENT du débouché local — vendre tout la même année rapporte moins. Ne joue que si l'économie compte |
| H8 | Éclaircies, élagage, taillis, trognes : la sylviculture a des gestes distincts | ✅ | élagage, recépage, éclaircie par critère et **trogne** (`trogner` ; `trogne.test.ts`) — quatre gestes qui ne se confondent pas |
| H14 | Certaines récoltes ne tuent pas l'arbre et suivent une rotation (liège) | ✅ | `leverEcorce` ; `especes.ecorce` ; `sylviculture.test.ts` |
| H15 | Un bois tué sur pied reste valorisable un temps, avec décote | ✅ | `DECOTE_CHABLIS`, `CHABLIS_RECUPERABLE_SEMAINES` ; qualité d'œuvre perdue. Les deux constantes s'appelaient « chablis » quand seul le FEU savait en produire ; depuis `tempete.ts` elles portent enfin leur nom. Et la ruine des cours après une tempête est là sans qu'on l'écrive : sortir d'un coup tout ce que le vent a couché tombe sous la décote d'engorgement du débouché (H7) |
| H9 | Irrigation, fertilisation, protections individuelles, clôtures | 🟡 | chaulage, fauche, protections individuelles et **clôtures** ; irrigation et fertilisation absentes |
| H18 | Le gibier se régule aussi par la chasse — et l'immigration compense | ✅ | `chasser` ; `gibier.test.ts` — une journée fait reculer la pression, un an plus tard elle est revenue |
| H16 | Un chantier se mécanise ou non selon la disposition des arbres, et la machine se paie | ✅ | `mecanisation.ts` ; `mecanisation.test.ts` — la part accessible se déduit des positions, aucune parcelle n'est déclarée mécanisable |
| H17 | La fertilité se TRANSPORTE : on récolte la biomasse ici et on l'épand là | ✅ | tas de broyat (`stockBrf`) + action `epandreBrf` ; `epandre-vs-vendre.test.ts` |
| H13 | Entretenir une plantation (dégagements) change son sort | ✅ | action `faucher` ; `herbe.test.ts` |
| H10 | Les aides publiques et paiements pour services existent | 🟡 | `aides.ts` : aide de base au revenu (127 €/ha), écorégime (54 ou 76 €/ha selon la part d'infrastructures agroécologiques), bonus haies (7 €/ha). Et surtout le PLAFOND DE 100 ARBRES/HA au-delà duquel la parcelle n'est plus agricole et perd tout. Règles FIGÉES sur la programmation 2023-2027, ce que la réalité n'est pas |
| H11 | La trésorerie peut plonger jusqu'à la faillite | ✅ | découvert plafonné |
| H12 | Le sol se découvre par observation ou analyse payante | 🟡 | tout est visible dans l'UI (calques) |

## I. Carbone

| # | Critère de réalité | État | Porté par / manque |
|---|---|---|---|
| I1 | Le carbone suit un bilan conservatif entre tous les pools | ✅ | `carbon-conservation.test.ts` |
| I2 | Le sol est le plus gros stock en tempéré | ✅ | `carbon.test.ts` |
| I3 | Le bois énergie vendu est émis immédiatement (il ne stocke rien) | ✅ | `epandre-vs-vendre.test.ts` |
| I4 | Le bois d'œuvre stocke pendant la durée de vie du produit | ✅ | `DEMI_VIE_OEUVRE_ANS` ; `produits-bois.test.ts` — décroissance de premier ordre sur la demi-vie par défaut de l'IPCC pour les sciages (35 ans ; 25 pour les panneaux, 2 pour le papier, mais le moteur ne produit que du sciage). Le crédit au bilan net est le STOCK et non le cumul : **un puits qui ne se vide jamais n'est pas un puits**. Et le carbone se partage enfin comme la CAISSE — seule la bille élaguée part en scierie, le houppier part en bûches et brûle, là où un arbre classé « œuvre » envoyait auparavant tout son carbone au produit |
| I5 | Le bois mort et la litière s'humifient partiellement | ✅ | coefficients d'humification |
| I6 | Le travail du sol déstocke massivement le carbone | ✅ | `labourer` : 5 % de l'humus par passage, émis et comptés dans le bilan |
| I9 | Un incendie renvoie d'un coup le carbone accumulé | ✅ | `feu.ts` ; `feu.test.ts` |
| I7 | L'allométrie biomasse→carbone est plausible par espèce | ✅ | `trees.ts` : le volume découle de la géométrie, `V = f × g × h` avec un facteur de forme de 0,5 et une expansion de branchage de 1,3. L'ancien proxy en `0,015·H²`, confronté au diamètre, impliquait un tronc jusqu'à 9,6 fois plus plein que son propre cylindre — impossible par construction. La densité qui convertit ce volume en matière sèche est désormais une INFRADENSITÉ (masse anhydre / volume vert) et non plus une densité du commerce à 12 % d'humidité : 17 des 26 espèces la tiennent d'une source ouverte — table IGN d'après Dupouey 2002 (annexe 3 de la méthode CNPF du label bas-carbone) pour les feuillus français, Global Wood Density Database (Zanne et al. 2009, doi:10.5061/dryad.234) pour le reste — et les 9 autres, sous-arbrisseaux de lande et de haie qu'aucune des deux ne couvre, gardent leur valeur d'avant en le disant dans leur fiche. Aucun facteur global : le troène MONTE (0,75 → 0,81), le chêne-liège ne bouge pas, le charme perd un quart (#68). Un hêtre de 25 m et 50 cm stocke 1 078 kg C contre 1 333 avant et 3 917 avant #62. **L'ancre discrimine enfin** : elle porte sur la TIGE, dont le volume ne fait pas débat (2,454 m³ ici, 2,528 par le tarif français EMERGE), et la borne à 1 307–1 624 kg de matière sèche — enveloppe des quatre équations de biomasse de tige applicables à cet arbre dans Zianis et al. 2005, Silva Fennica Monographs 4. Le moteur y place 1 350 kg ; à l'ancienne densité il en plaçait 1 669 et l'essai TOMBE, ce qui est la preuve que le correctif en est un |
| I8 | Le bilan peut être négatif au début d'une plantation | ✅ | `bilan-carbone-plantation.test.ts` — le total des stocks perd 11,6 à 11,8 t C/ha après labour, creux aux 12ᵉ–13ᵉ années, retour au-dessus du départ aux 25ᵉ–26ᵉ. **Et la mesure corrige l'énoncé** : le creux existe SANS labour (−8,2 à −8,5 t C/ha, croisement aux 23ᵉ–24ᵉ années). Ce n'est pas le travail du sol qui rend le bilan négatif — c'est la jeunesse du peuplement, qui ne rend rien à la litière pendant que l'humus se minéralise à 1,5 %/an. Le labour aggrave de 40 % et retarde de deux ans |

---

## J. Biodiversité et structure

Ce que vaut un peuplement au-delà de sa récolte. L'indice est un proxy assumé :
il classe des situations les unes par rapport aux autres, il ne remplace pas un
inventaire.

| # | Critère de réalité | État | Porté par / manque |
|---|---|---|---|
| J1 | La richesse en essences ET leur équilibre comptent (une essence à 95 % est un désert) | ✅ | `biodiversite.ts` équitabilité de Shannon ; `biodiversite.test.ts` |
| J2 | Le bois mort est un habitat, pas un déchet | ✅ | pool `deadWoodKgC` intégré à l'indice (ch4-A) |
| J3 | Les gros arbres et les arbres à cavités valent plusieurs jeunes | ✅ | gros sujets, trognes recoupées ET chandelles (`biodiversite.ts` ; `trogne.test.ts`, `chandelles.test.ts`) |
| J8 | Un arbre mort reste debout des années : c'est LE bois mort qui compte pour la faune | ✅ | `dureeChandelleSemaines` (densité du bois × 15 ans) ; `chandelles.test.ts` |
| J4 | Un couvert étagé et permanent abrite plus qu'une strate unique | ✅ | strates, sempervirence, et depuis l'issue #75 l'ÉTAGEMENT LOCAL (`heterogeneiteVerticale`) — l'écart-type des hauteurs dans un voisinage de 3 m, qui distingue enfin une forêt étagée d'un damier de blocs monostrates que le décompte de strates notait pareil : 0,00 contre 0,68 |
| J9 | L'ARRANGEMENT compte autant que la composition : lisière, cœur, mosaïque | ✅ | `structureHorizontale` ; `mosaique.test.ts` — à espèces, nombre et âge identiques, une mosaïque de bosquets note mieux qu'un bloc et qu'une plantation régulière (0,79 / 0,23 / 0,00). **Et le mitage ne paie pas** : des houppiers disjoints donnent 94 % de lisière et zéro cœur, donc zéro. La courbe n'est pas ajustée — c'est le PRODUIT lisière × cœur, qui tombe de l'énoncé « il faut les deux » |
| J5 | La diversité rétroagit sur le peuplement (régulation, pollinisation, résilience) | ✅ | c'est le cœur de `ravageurs.ts` : la diversité du voisinage nourrit les auxiliaires, qui écrêtent les pullulations, et les pollinisateurs, qui font la nouaison |
| J6 | Des floraisons étalées nourrissent les pollinisateurs sans rupture | ✅ | `biodiversite.ts:etalementDesFloraisons` balaie la saison de vol par pas de 30 °C·j et demande, à chaque pas, ce qui est OUVERT et ce que ça offre. Quatre défauts de la mesure d'avant tombent ensemble : elle comptait les **anémophiles** (une noiseraie affichait des floraisons étalées sans nourrir personne — le noisetier et le noyer déclarent maintenant `nectar: 0`), elle ignorait la **strate basse**, elle ignorait la **durée** (l'ajonc tient six mois, l'abricotier dix jours), et elle comptait des espèces au lieu d'une couverture (un pommier isolé parmi trois cents hêtres valait une tranche pleine). **Ce qui a débloqué le critère est un découpage** : la floraison a quitté le bloc `fruits`, si bien que sept espèces qui nourrissent sans rien donner à récolter — aubépine, saule, ajonc, genêt, callune, houx, fusain — cessent d'être invisibles. À elles deux, l'ajonc et la callune nourrissent une lande atlantique presque toute l'année. **Limite** : la strate basse n'apporte que sa vernale, les deux autres herbacées étant des graminées ; la soudure d'ÉTÉ reste donc à la charge des ligneux, faute d'une herbacée entomophile tardive |

## Ce qui débloquerait le plus de critères

*Cette liste a été réécrite depuis les lignes du tableau. La précédente
proposait quatre chantiers dont trois étaient faits — la dérive climatique, le
couplage humus ↔ azote, la variabilité individuelle — et sa numérotation allait
de 2 à 4 sans passer par 1. Une feuille de route qui ne se relit pas devient un
piège pour celui qui la suit.*

### 1. Le calendrier de floraison de la strate basse

Ce qui reste du plus gros verrou du référentiel. La strate herbacée a
maintenant des espèces (`herbacees.ts`), et E9 comme B8 sont tombés avec — mais
la fiche herbacée s'arrête au calendrier FOLIAIRE. Aucune des trois espèces ne
déclare de floraison, si bien que les deux critères qui en dépendaient restent
où ils étaient :

- **G4** (🟡) — les pollinisateurs manquent d'un calendrier de floraison.
- **J6** (🟡) — des floraisons étalées nourrissent sans rupture. Et c'est
  précisément la strate basse qui nourrit pendant les deux périodes de soudure
  (ch4-C), là où `indiceBiodiversite` ne compte encore que les ligneux.

Le chemin est court : les ligneux ont déjà un `floraisonDJ` et
`partFloraison` (`phenologie.ts`) sait en faire une part de couronne en fleur.
Il faut le même champ sur la fiche herbacée, une ressource florale par cellule
— l'emprise multipliée par cette part —, et que `biodiversite.ts` et le service
de pollinisation la lisent.

Ce qui manque ENCORE à la strate, par ordre de gain :

- **une rudérale nitrophile** — l'ortie. La capacité d'une herbacée lit la
  lumière et le pH, pas l'azote : un épandage ne se voit donc pas au sol, alors
  que c'est la bio-indication la plus lisible qui soit.
- **la hiérarchie de hauteur** dans la strate, seule limite écrite de B8.
- **la CULTURE comme strate basse**, ce qui est le sujet de l'agroforesterie :
  une fiche herbacée avec un rendement et une exigence minérale ferait poser au
  jeu sa question centrale — quelle culture sous quels arbres, à quel
  écartement.

### 2. L'écart de la paire d'allocation (issue #79)

Cette section promettait « un seul coefficient, quatre critères » : le poids 0,4
des codominants dans `extinctionAt` (`light.ts`, #65), qui atténue la
concurrence latérale précisément là où la plantation régulière la rend maximale.
C'était plausible. **La campagne de #65 l'a réfuté**, et c'est le meilleur
argument qu'on ait pour la règle `à-mesurer` : porter ce poids à 1 fait passer
les dominants d'une hêtraie serrée de H/D 42,1 à 41,7 ; poids 1, seuil 0 et
plafond d'extinction doublé n'atteignent que 45,0. Le code n'a pas été touché,
et c'est la campagne qui l'a évité.

Ce qui borne E10 est ARITHMÉTIQUE et vit dans `trees.ts` : le diamètre gagne
entre 1,25 et 2,5 cm par mètre de hauteur selon la lumière, donc un arbre qui
pousse à l'allocation `a` porte H/D = 100/a, et la fenêtre atteignable est
[40 ; 79]. Les 90–100 de la perche sont hors d'atteinte quelle que soit
l'ombre. Écarter la paire en gardant sa médiane à 2 — l'ancre de volume —
ouvrirait la fenêtre : c'est **#79**, et c'est `à-mesurer` parce que la médiane
tient le volume du peuplement pendant que l'écart tient l'amplitude.

Restent, sur le poids des codominants lui-même :

- **B6** (🟡) — l'auto-éclaircie repose directement dessus. **Non mesuré** : la
  campagne n'a regardé que l'élancement, et une hêtraie de trente ans ne
  s'éclaircit pas assez pour trancher. Ce que le poids fait à la mortalité reste
  entier.
- **F6** (🟡) — « plafond de densité arbitraire + ombrage codominant ».
- **B10** (🟡) — le port serré, qui demande un rayon de houppier réactif et pas
  un coefficient.
- **E10** — plus ici : son verrou est #79.

### 3. Ce que la tempête n'a pas emporté (suites de l'issue #55)

Les critères existent maintenant (F14 à F19), le vent couche des arbres, et
trois des six lignes écrites sont des ❌ assumés. Par ordre de gain :

- **F19, l'amplification climatique** — c'est le plus important des trois,
  parce que la fréquence des tempêtes est le bon endroit où brancher la dérive
  du climat, et le vent moyen le mauvais. Le blocage est de PLOMBERIE, pas
  d'écologie : `meteoDerivee` connaît le scénario et pas la graine de partie,
  `tick` tire la rafale et ignore le scénario. Réunir les deux moitiés est un
  petit lot, et il rend D11 vrai du vent aussi.
- **F18, la fragilité d'après-éclaircie** — il y faut une mémoire par arbre de
  l'ouverture récente. C'est ce qui rendrait DANGEREUSE une éclaircie tardive et
  forte, ce qui est la leçon sylvicole la plus chère de Lothar.
- **F17, la casse partielle** — un arbre penché qui survit avec une plaie est
  aussi une porte d'entrée pour les maladies (G6) et une branche arrachée est du
  bois mort au sol (`boisMort.ts`). Le mécanisme existerait presque ; c'est
  l'état « blessé » qui manque à l'arbre.

### 4. Les moins chers : un test, et le critère passe

Il n'en reste plus qu'un. **F13** — les hauteurs tombent dans les tables de
production : le test existe, c'est la couverture par essence qui est partielle.

**F7** et **I8** étaient les deux autres ; ils sont passés ✅ (issue #74), et ce
qu'ils ont appris mérite d'être retenu pour le suivant.

Un test de ce genre COÛTE ce qu'il vaut. Celui de F7 a échoué dans sa première
version, et pas à cause du mécanisme visé : la hêtraie serrée qui devait servir
de couvert atteignait un recouvrement de couronnes de 9 pour un plafond de 2,5,
et le plafond étant PARCELLAIRE, plus aucun semis ne s'installait nulle part —
trouée comprise. Un « zéro recrue sous couvert » aurait décroché le ✅ pour la
mauvaise raison. D'où le témoin qui est resté dans l'essai : une seconde espèce,
tolérante à l'ombre, dont la présence prouve qu'il y avait quelque chose à
mesurer.

*Et le défaut trouvé par cet échec a fini par être corrigé* (#95) : le plafond
se lit désormais dans un voisinage de six mètres. L'essai porte depuis un second
banc à trois mètres d'écartement — la futaie dense qui lui était interdite — où
le témoin fermé ne recrute RIEN sur les cinq graines et la trouée recrute. Le
banc de repli à huit mètres reste en place, parce qu'il mesure autre chose et le
mesure bien : sous un couvert perméable, la trouée concentre et TRIE.

Celui de I8 a CORRIGÉ son propre critère. L'énoncé attribuait le bilan négatif
au travail du sol ; le témoin sans labour montre que le creux existe quand même,
et que le labour ne fait que l'aggraver d'un tiers. La cause est la jeunesse du
peuplement, pas la charrue.

Attention, donc, à la règle de la section « ce qu'un test écologique a le droit
d'affirmer » : un test écrit vite fait pour décrocher un ✅ vaut moins que le 🟡
qu'il remplace.

### 5. Les chantiers autonomes, sans dépendance

- **C10** — la dérive du pH. « Chaulage seul ; pas de dérive » : les litières
  acidifiantes et le lessivage ne font rien bouger. Autonome, bien borné.
- **I4** — la fin de vie des produits bois. Le stock est compté
  (`oeuvreCumKgC`), sa restitution non.
- **Le sanglier** — retournement du sol, consommation des glands et des
  châtaignes. Le dernier grand absent du module biotique, et il ne dépend de
  rien.

## Le paysage : ce que l'entourage décide

`paysage.ts` regroupe en un objet nommé ce qui était éparpillé — gibier, dépôts
d'azote, semenciers, vent, fréquentation humaine. C'est ce qui permet de dire
« au milieu des champs » ou « en lisière de banlieue » et d'en tirer des
conséquences cohérentes, au lieu de saisir quatre nombres indépendants.

## Le relief : l'eau circule enfin

`relief.ts`. Le bilan hydrique était strictement vertical — chaque mètre carré
recevait sa pluie et ne parlait jamais à ses voisins. Désormais une parcelle a
une **altitude**, une **pente**, une **exposition** et une **forme** (plan,
vallon en entonnoir, croupe), et l'eau descend : ce qui ruisselle en haut a une
seconde chance de s'infiltrer en bas, ce qui fait les bas de pente frais et les
crêtes sèches sur la même parcelle.

Le relief se **choisit au lancement** — altitude, pente, exposition, forme,
bassin d'amont — au lieu d'être figé par station : la même terre peut se jouer
à 60 m sur du plat ou à 1 200 m sur un ubac à 30 %.

## L'eau de surface : la ripisylve, sans règle sur les espèces

`eau_surface.ts`. Un ruisseau qui longe un côté, une mare creusée dans la
parcelle. Ce qui compte n'est pas le plan d'eau mais la **nappe** qu'il tient :
elle affleure à la berge et s'enfonce en s'éloignant, selon deux termes qui
disent deux choses différentes — le **relief** (plus une cellule domine le plan
d'eau, plus la nappe est loin sous ses pieds, d'autant plus que le sol conduit
bien l'eau) et la **portée d'influence** (un cours d'eau draine tout un versant,
une mare ne mouille que ses abords).

Trois conséquences, toutes déjà connues du bilan hydrique : une **remontée
capillaire** d'autant plus forte que la nappe est proche, un **exutoire bouché**
là où elle est dans le profil, et surtout la **saturation imposée** sous la
surface libre — le point qui manquait, et sans lequel le ruisseau ne changeait
presque rien. Résultat mesuré à douze ans, ruisseau au sud : au bord de l'eau
l'aulne pousse un peu mieux (6,22 m contre 6,03) et le hêtre s'effondre (1,27 m
contre 2,73) ; à vingt mètres, plus aucune différence. Aucune espèce n'est
nommée nulle part.

**La crue** en découle sans mécanisme neuf : le cours d'eau reçoit le même
ruissellement d'amont que la parcelle, monte d'autant, et sa nappe affleure
dans le bas. Elle reflue dès que l'amont ne verse plus. Sans bassin d'amont,
pas de crue ; sans plan d'eau, la pluie ruisselle et s'en va.

## Les trajectoires climatiques sont françaises

Le moteur partait du réchauffement mondial et l'amplifiait (×1,4 l'hiver,
×1,9 l'été). L'été tombait juste ; l'hiver était trop chaud, et la moyenne
annuelle française sortait à +4,5 °C au lieu de +3,8 sous SSP2-4.5. Il part
maintenant des trajectoires FRANÇAISES — estimation observationnellement
contrainte de Ribes et al., base des paliers TRACC — et ne fait que les
répartir dans l'année, avec une forme saisonnière de moyenne 1 qui concentre
l'excès sur juillet-août. L'interface affiche les deux : monde et France.

## Cas d'étude : après l'incendie, l'inondation

*Notes d'un conseil d'administration d'urgence après les feux de Gironde
(Saumos, Landiras, 2022), transmises par l'auteur du jeu.* Le raisonnement des
gestionnaires est le suivant : **la forêt fait baisser le niveau de la nappe**
en transpirant ; là où elle a brûlé, elle ne pompe plus, la nappe remonte, et
l'hiver suivant les zones brûlées s'inondent. S'y ajoute la perte de rugosité
du terrain, qui accélère le ruissellement, et un exutoire — le canal des étangs
— qu'on ne peut pas charger davantage sans inonder Lège.

**Ce que le simulateur voyait, et ce qu'il ne voyait pas.** Premier essai :
pinède de quarante ans, puis deux futurs à partir du même état, l'un intact,
l'autre brûlé. Il voyait la CAUSE — la transpiration s'effondrait, l'eau
qu'elle prenait percolait — et la rugosité perdue. Mais rien n'était inondé,
parce que l'eau qui percolait **quittait le système** : la profondeur de nappe
était un champ figé, aucun stock ne la recevait.

**La nappe est maintenant un stock** (`nappe.ts`), et la chaîne s'établit
d'elle-même. Aulnaie de fond de vallée, quarante ans, puis incendie :

| | transpiration | nappe d'hiver | parcelle inondée |
|---|---|---|---|
| intacte | 730 mm/an | 0,74 m sous la surface | 0 % |
| brûlée | **196 mm/an** | **0,20 m** | **9 %** |

La forêt tenait la nappe un demi-mètre plus bas ; brûlée, elle la relâche, et
la nappe affleure. Sur un limon planté de hêtres, le même essai donne 3,94 m
→ 3,49 m : le mécanisme est là aussi, simplement la nappe part de trop bas
pour affleurer. Rien de tout cela n'est écrit nulle part — ce sont la
transpiration, la percolation et la remontée capillaire, déjà présentes, qui
se rejoignent une fois qu'un stock les relie.

**Ce que la recalibration a demandé.** Mettre une nappe sous le sol change le
régime hydrique de toutes les stations, et il a fallu :

- **déclarer** la profondeur d'équilibre de chaque station au lieu de la
  déduire de proxys — c'est un relevé de terrain, pas un calcul ;
- un **échange régional dans les deux sens** : à l'échelle d'une parcelle, le
  niveau d'une nappe est décidé par le réseau qui la draine à des kilomètres.
  Une parcelle plus chargée se vide vers la région, un fond de vallée en
  REÇOIT — et c'est pour cela qu'il est engorgé ;
- de laisser la nappe **monter dans le sol** et pas seulement jusqu'à sa base,
  sans quoi l'inondation restait structurellement impossible ;
- de **plafonner la transpiration par l'énergie disponible**. Le défaut est
  apparu avec la nappe : tant que l'eau manquait, c'est elle qui bridait. Une
  aulnaie alimentée par la nappe transpirait 1 021 mm par an, soit bien plus
  que le soleil n'en permet. La demande d'un arbre est proportionnelle à son
  houppier ; quand les couronnes se superposent, la somme dépassait plusieurs
  fois l'ETP. Un mètre carré ne reçoit qu'un mètre carré d'énergie.

Cinq tests ont bougé. Aucun ne portait sur la nappe : ils mesuraient des
équilibres que la nappe déplace, et tous disaient moins que ce qu'ils
croyaient.

### Ce que l'essai a donné : planter autrement atténue, sans protéger

Profil « Saumos 2022 » — sable landais, nappe perchée, bassin entier logé à la
même enseigne — deux compositions plantées, et le moteur laissé libre de
déclencher ses propres incendies. Seize graines par composition, cinquante ans :

| composition | brûlé moyen | gros feux | peuplement tué | remontée de nappe |
|---|---|---|---|---|
| pinède pure | 1 928 m² | 12/16 | 86 % | **52 cm** |
| feuillus (bouleau, châtaignier) | 1 470 m² | 8/16 | 101 % | **32 cm** |
| chêne-liège dominant | 2 058 m² | 12/16 | 81 % | 47 cm |

Planter des feuillus réduit d'un tiers le nombre de gros incendies et de 38 %
la remontée de nappe qui suit. C'est la seule atténuation trouvée, et elle est
modeste. Le chêne-liège suit une autre stratégie : il ne réduit ni la surface
parcourue ni la remontée, il perd simplement moins d'arbres à chaque passage —
son écorce est faite pour ça — et c'est lui qui porte le peuplement le plus
haut à la fin. Survivre au feu et l'empêcher sont deux choses différentes.

**Une conclusion retirée.** On avait mesuré ici que replanter en aulne après le
feu raccourcissait d'un tiers la durée pendant laquelle la nappe reste haute,
et on l'avait écrit comme un résultat. C'en était un artefact : le feuillage
était alors commandé par un seul booléen — `tMean > 6 °C` — vrai presque tout
l'hiver dans les Landes, si bien que TOUS les caducs y transpiraient en
janvier. Un aulne sans feuilles ne rabat pas une nappe hivernale. Depuis que
chaque espèce a son calendrier (`phenologie.ts`), cette transpiration fantôme a
disparu, et l'avantage de l'aulne avec elle. Remesuré : aucune essence de
replantation ne se détache, les écarts sont du même ordre que le bruit d'un
incendie à l'autre.

**Une précision de vocabulaire** : « remontée de nappe » ne veut pas dire
inondation de surface. Sur ce sable, la part de parcelle réellement sous eau
reste nulle dans tous les essais ; ce que la remontée produit, c'est de
l'ENGORGEMENT (0,48 à 0,90 de la macroporosité noyée) et du RUISSELLEMENT en
plus — et c'est ce dernier qui inonde en aval, dans le canal des étangs.

**Et un résultat contre-intuitif** : mieux faire pousser n'est pas une
protection. Le peuplement qui transpire le plus tient la nappe le plus bas ;
quand il brûle, elle remonte d'autant. La productivité aggrave le rebond.

**La leçon de méthode compte autant que le résultat.** D'une graine à l'autre,
la même composition brûle de 0 à 4 500 m², et trois à cinq parties sur seize ne
connaissent aucun incendie. Le premier essai, fait sur un seul tirage par
composition, concluait « les feuillus ne brûlent jamais » — ce que seize
répétitions ont démenti. Un simulateur de ce genre ne se lit qu'en
répétitions.

**L'échelle de l'incendie compte, et elle se règle.** Le niveau régional est
exogène tant que la parcelle est seule à brûler. Mais quand tout un massif
part, les alentours cessent eux aussi de transpirer et le niveau régional monte
avec : un paramètre dit quelle part du bassin subit le même sort que la
parcelle. Mesuré sur l'aulnaie de vallée :

| bassin semblable | nappe, forêt intacte | après le feu | remontée |
|---|---|---|---|
| 0 % (parcelle isolée) | 0,75 m | 0,20 m | 55 cm |
| 100 % (tout le massif) | **1,62 m** | 0,35 m | **127 cm** |

À 100 %, la forêt tient la nappe régionale un mètre plus bas ; quand elle brûle
en entier, la nappe remonte de plus d'un mètre. C'est la différence entre
l'incendie d'une parcelle et celui d'un massif.

*Une « limite » qui n'en était pas.* On avait noté ici que le ruissellement d'un
fond de vallée saturé semblait surestimé — 8 700 mm par an, huit fois la pluie —
en soupçonnant des allers-retours entre nappe et surface. Instrumentation faite,
le bilan est exact et l'explication est ailleurs : l'essai faisait déverser les
**6 ha de bassin d'amont** de la station sur une parcelle d'essai réduite à
30 m, soit 0,09 ha. Deux cents millimètres par semaine arrivent alors du dehors
et repartent : c'est ce que reçoit réellement une parcelle placée sous un
bassin soixante fois plus grand qu'elle. À la taille réelle de la station
(100 m), le même bassin n'apporte que 18 mm par semaine.

La leçon porte sur les ESSAIS, pas sur le moteur : réduire `coteM` sans réduire
`bassinAmontHa` change la physique de la station. L'interface, elle, affiche
l'apport d'amont en clair au moment du réglage.


## L'érosion : ce qui part d'un versant

`erosion.ts`. Le ruissellement circulait sans rien emporter. Il emporte
maintenant l'horizon de surface — celui qui porte l'humus, l'azote, le
phosphore assimilable —, en gardant la structure de l'équation universelle de
perte en terre ramenée à la semaine : *érosivité × ruissellement × √pente ×
(1 − couverture)²*.

Le carré sur le couvert n'est pas cosmétique : il dit que les premiers
pourcents de sol nu coûtent peu et que les derniers coûtent tout. Mesuré sur
dix ans de limon : **4 t/ha/an arrachées à 15 % de pente sur sol nu, 9 t/ha/an
à 30 %, et pratiquement rien dès que l'herbe couvre** — les ordres de grandeur
européens pour un sol cultivé nu.

Deux choses distinguent l'érosion d'une simple perte de masse, et toutes deux
sont modélisées : ce qui part est **plus riche** que le sol moyen (l'eau
emporte les fines et les matières organiques, pas les cailloux : enrichissement
×3), et ce qui part **se dépose plus bas** dès que l'eau ralentit, d'autant
mieux que la cellule d'arrivée est couverte. C'est le colluvium de bas de
versant, et c'est aussi pourquoi une bande enherbée ou une haie sur courbe de
niveau arrête le sédiment. Seul un cinquième de la terre arrachée quitte
réellement la parcelle — le rapport d'export classique à l'échelle de la
parcelle.

Ce qui franchit la limite est **perdu pour de bon**, et compté comme tel dans
les bilans carbone et azote : sans ce compteur, l'humus emporté aurait disparu
des livres.

**Le sol s'amincit**, et c'est la conséquence longue — la plus grave, parce
qu'elle boucle sur elle-même : un horizon qui maigrit retient moins d'eau, donc
ruisselle davantage, donc s'érode plus vite. C'est ainsi que des versants
cultivés finissent sur la roche en un siècle ou deux. La réserve utile de
surface se calcule désormais sur l'épaisseur RESTANTE, avec un plancher de
trois centimètres — même décapé, il reste toujours un peu de terre.

Mesuré sur vingt-cinq ans à 30 % de pente : 0,14 cm perdus en moyenne sur un
sol laissé nu au départ, jusqu'à 0,33 cm en haut de versant, et 2,3 cm
d'accumulation en bas — le colluvium. C'est peu, et pour une bonne raison : sur
une parcelle abandonnée, l'herbe reprend en quelques années et l'érosion
s'arrête. Un versant labouré tous les ans, lui, ne referme jamais cette
fenêtre.

## La strate arbustive : quatre espèces qui changent la succession

Le noisetier occupait à lui seul 48 % des tiges des soixante premières années.
Deux causes, corrigées l'une après l'autre : un taux de régénération qui ne
savait pas descendre sous 1 semis par pied et par an (alors que la noisette est
mangée par tout le monde), puis surtout l'absence de ses concurrents.

L'atlas les avait, le moteur non : **prunellier**, **aubépine**, **ronce** et
**sureau noir** — tous notés « pionniers » et trois d'entre eux « nurse ». Ce
sont eux qui prennent une friche, pas un arbuste de sous-étage. Avec eux, la
succession se lit enfin comme sur le terrain (limon, lisière forestière) :

| | fourré | arbres | noisetier |
|---|---|---|---|
| an 15 | ronce 42 %, prunellier 11 % | bouleau 17 % | — |
| an 40 | prunellier 17 %, aubépine 13 % | bouleau 35 % | — |
| an 120 | aubépine 18 %, ronce 3 % | bouleau 26 %, hêtre 24 % | 10 % |

La ronce prend tout et s'efface (héliophile, quinze ans de vie) ; l'aubépine,
bicentenaire, tient le sous-étage jusqu'au bout ; les épineux, que le gibier
délaisse, sont ce sous quoi les semis d'arbres passent leurs premières années.

Le plafond d'auto-éclaircie ne compte plus des tiges mais du **recouvrement** :
un peuplement sature quand la somme des couronnes atteint deux fois et demie la
surface au sol. Un nombre fixe était faux aux deux bouts ; celui-ci donne
1 160 tiges/ha à cinq ans, **3 900 en plein fourré à quinze ans**, 956 à
quatre-vingts après auto-éclaircie — les ordres de grandeur réels, sans qu'on
ait eu à choisir un chiffre par étape.

**Quatre essences de plus, prises dans l'atlas** — et choisies pour ce qu'elles
comblent, non pour faire nombre :

- le **charme**, sciaphile climacique : le hêtre était jusque-là la SEULE
  essence d'ombre du moteur, et une forêt n'a jamais un seul candidat au
  sous-étage. Sur limon en massif, la composition à cent cinquante ans devient
  une hêtraie-charmaie (hêtre 56 %, charme 29 %), ce qui est le climax du nord
  de la France ;
- le **houx**, sempervirent sciaphile : le seul couvert PERMANENT de sous-bois,
  celui qui abrite et nourrit en janvier sous une hêtraie nue ;
- le **saule blanc**, pionnier des bords d'eau, qui tolère l'engorgement à 0,95
  — avec l'aulne, c'est l'essence des ripisylves ;
- le **cornouiller mâle**, calcicole, qui fleurit en février sur bois nu : la
  première ressource de l'année pour les pollinisateurs.

*Le fusain et le troène ne figurent pas dans l'atlas* : on ne les a pas
inventés.

**Un bug que ces ajouts ont révélé.** La substitution des semenciers était
tout-ou-rien : on ne remplaçait la liste d'un paysage que si elle ressortait
ENTIÈREMENT vide sur la station. Il a suffi que le houx (pH 4-7) tolère le
podzol landais pour qu'un massif forestier y devienne une forêt de houx pur,
les autres essences étant écartées et le repli jamais déclenché. Le voisinage
sème maintenant autant quel que soit le sol — ce qui change, c'est QUI : on
garde les espèces qui tiennent et on complète avec celles qui poussent là.

## La strate herbacée : trois espèces, deux grandeurs, une fenêtre

La strate existait comme une COUVERTURE : un taux par cellule, qui montait avec
la lumière et l'humidité. Un bon mécanisme, qui rendait déjà des services — il
freinait l'évaporation, nourrissait le feu, concurrençait les semis. Mais
c'était **une seule plante moyenne**, et un taux de couverture n'a pas de
printemps.

### Deux grandeurs, parce qu'une seule ne suffisait pas

`herbacees.ts` sépare ce que la couverture confondait :

- **l'emprise**, la place qu'une espèce TIENT au sol, bulbes et rhizomes
  compris. Elle est pérenne et lente ;
- **le feuillage**, ce qui est VERT cette semaine. Il vise l'emprise, ramenée à
  ce que la saison et la sécheresse en laissent, et il y monte à une vitesse de
  repousse — freinée par le froid, sans quoi une pelouse rasée en décembre se
  referme en janvier.

La distinction n'est pas cosmétique, et on l'a apprise en la ratant : avec une
seule variable, chaque bouchée de chevreuil était prise sur les rhizomes, et la
lande mesurée perdait son tapis en un hiver. Une fauche, un feu, une dent
emportent le feuillage ; seule la charrue va chercher l'emprise.

### La règle de la fenêtre TOMBE du découpage

Une espèce ne fait bouger son emprise que **pendant sa saison de croissance** :
dormante, elle est gelée. Donc chacune juge sa station au moment où elle pousse.
L'anémone la juge en mars, sous un couvert caduc encore nu ; le dactyle la juge
en mai, sous le même couvert refermé. Rien de cela n'est écrit : ça sort de la
phénologie de chaque fiche et de la lumière hebdomadaire que `light.ts`
calculait déjà (B5).

Mesuré en année 40 sur limon riche, parcelle de 20 m, semaines 16 et 30, deux
graines :

| couvert | lumière au sol | couverture | rapport | part de la vernale |
|---|---|---|---|---|
| hêtraie | 0,68 → 0,28 | 0,99 → 0,31 | **2,98-3,45** | **36-40 %** |
| pinède | 0,50 → 0,49 | 0,95 → 0,76 | 1,24-1,25 | 19 % |
| découvert | 0,96 → 0,96 | 1,00 → 0,96 | 1,04 | 3 % |

Le sol d'une hêtraie est vert mi-avril et nu fin juillet ; celui d'une pinède ne
connaît pas ce rythme. Et plus l'été est sombre, plus la strate appartient à la
vernale — gradient monotone sur les trois couverts, graine par graine.

**Ce que le dispositif ne montre pas**, et il faut le dire : le moteur ne
produit pas, sur cette station, de peuplement sempervirent assez SOMBRE pour
exclure la vernale tout à fait. Le pin sylvestre est une essence de lumière et
s'auto-éclaircit ; le houx ne s'installe pas en plein découvert ; le chêne-liège
et le châtaignier, sur la lande où ils poussent, plafonnent à trois et cinq
mètres en quarante ans. Ce que vaudrait une pessière se lit donc sur la capacité
seule, qui tombe sous 0,1 à 4 % de lumière.

### La bio-indication descend d'un étage

Le pH décide, comme il décide déjà pour les ligneux (`soil.ts:facteurGammePh`,
la même bordure douce de ±0,7). À découvert, en année 11 : sur le limon neutre,
dactyle 0,96 et molinie 0 ; sur le podzol landais à 4,5, molinie 1,00 et les
deux autres 0. Aucune ligne du moteur ne nomme d'espèce — c'est la gamme
déclarée dans l'atlas, confrontée au pH de la cellule.

Le calendrier suit : la lande girondine reste à 0,46 de couverture mi-avril
quand le limon est à 0,99, parce que la molinie démarre notoirement tard. La
protection du sol au printemps n'est plus la même partout.

**Une borne de pH vaut un mécanisme.** L'anémone acceptait d'abord jusqu'à
pH 4,0, ce qui l'installait sous les ajoncs d'une lande girondine — et y
RENVERSAIT l'effet nurse (critère E1), le pin abrité passant sous le pin à
découvert parce qu'une vernale lui disputait son printemps. Ramenée à 4,5, elle
reste ce que sa source en dit : une plante de mull et de moder, pas de podzol.
Un trait mal borné dans l'atlas fait plus de dégâts qu'une formule fausse dans
le moteur, parce qu'il ne ressemble pas à un bug.

### Le tapis d'avant ce lot était un dactyle qui s'ignorait

Les seuils du dactyle — lumière 0,12 et 0,47, humidité 0,35, reconquête 0,12 par
semaine — sont ceux que `herbe.ts` appliquait au tapis entier, repris tels
quels. Ce lot AJOUTE des espèces sous ce plancher et à côté de lui ; il ne le
déplace pas. Les relever « parce que le tapis moyennait aussi des plantes
d'ombre » était tentant, et c'était déplacer une calibration acquise sans la
remesurer.

Une seule chose distingue vraiment le dactyle de ce tapis : il n'a **ni porte
photopériodique ni sénescence d'automne**, parce qu'une hémicryptophyte n'a pas
de bourgeon en dormance à lever — elle repart au premier redoux. Lui en donner
une, par imitation des ligneux, lui coûtait un cinquième de sa couverture
annuelle sous futaie feuillue (0,61 contre 0,77 sur soixante ans, mesuré) : la
fenêtre qui compte pour une graminée de sous-bois n'est pas celle d'avril mais
celle d'**octobre à mars**, quand le couvert caduc est ouvert et qu'il fait
encore assez doux pour pousser. C'est le défaut qui a coûté le plus cher de ce
lot, et il ne se voyait pas à la lecture : il a fallu tracer la couverture
semaine par semaine, sur soixante ans, avant et après.

### Ce que ce lot a déplacé ailleurs, et de combien

Un mécanisme qui touche l'eau, l'azote et la couverture du sol de toutes les
cellules déplace ce qui en dépend. Quatre seuils ont été remesurés, et ils sont
listés ici pour qu'on puisse en juger d'un coup d'œil :

| Test | Avant | Après | Ce qui a bougé |
|---|---|---|---|
| `litiere` — l'aulne fait pousser le hêtre | 1,1006 pour un seuil à 1,1 | 1,095, seuil à 1,08 | le témoin isolé profite un peu plus de l'azote que le tapis n'éponge plus |
| `succession` — la banque de hêtres à 120 ans | 19 ≥ 19 | 17 ≥ 0,85 × 19 | la vernale prélève en avril, au même endroit que les semis |
| `bois-en-travers` — la terre piégée | 0,135 | 0,093, seuil de 0,1 à 0,08 | « un piège ne retient que ce qui passe », pour la quatrième fois |
| `feu` — conservation du carbone au feu | passait | passe | le grand livre du TEST oubliait l'érosion ; corrigé, pas contourné |

Les trois premiers gardent leur direction ; aucun ne la doit à son seuil. Le
quatrième n'était pas un seuil mais un trou dans un test, resté invisible tant
qu'aucune érosion notable ne tombait la semaine d'un incendie.

Et un cinquième a été rattrapé en cours de route plutôt que remesuré : le
rapport « le réchauffement fait flamber les ravageurs » était tombé de 1,6 à
1,06 — c'est-à-dire annulé — parce que la strate herbacée fournit un cinquième
de l'habitat des auxiliaires et que la sénescence d'automne de trop la faisait
disparaître tout l'hiver. Il est revenu au-dessus de son seuil une fois le
dactyle rendu à sa vraie phénologie. **C'est ce genre de conclusion qu'un lot de
mécanisme peut annuler sans le dire**, et c'est pour ça qu'on relance la suite
entière plutôt que les tests du lot.

### Trois espèces, et pourquoi trois

Une vernale (anémone des bois), une graminée sociale de sol riche (dactyle) et
son homologue de sol acide (molinie) — trois STRATÉGIES qu'on voulait pouvoir
opposer, pas trois espèces représentatives. Chaque fiche porte sa source
(Biological Flora of the British Isles) et les valeurs traduites en paramètres
portent leur *(à calibrer)*.

Trois, et pas trente, parce que la strate tourne sur toutes les cellules toutes
les semaines. **Coût mesuré** : 6,8 → 7,6 ms par semaine sur une hêtraie 30 × 30
de quarante ans, soit **+11 %**, machine au repos, médiane de cinq passes. C'est le prix à connaître
avant d'ajouter la quatrième.

## La mosaïque : un sommet de courbe qu'on n'a pas eu à choisir

L'indice de biodiversité comptait ce qu'il Y A — les espèces, leur équilibre,
les strates, le bois mort, les gros sujets — et jamais COMMENT C'EST ARRANGÉ.
Deux parcelles portant les mêmes espèces aux mêmes hauteurs recevaient la même
note qu'elles forment un bloc plein ou une mosaïque de bosquets.

### La difficulté que l'issue pose et laisse ouverte

« Ne pas récompenser le mitage. Une lisière a de la valeur, un peuplement qui
n'est QUE de la lisière n'en a pas — les espèces de cœur de massif existent
aussi. La forme de la courbe est le vrai sujet de ce lot. »

Il fallait donc une courbe qui monte puis redescend. Tailler une cloche aurait
demandé d'en choisir le sommet à la main — un chiffre de plus sans ancre. Le
**produit** de deux parts mesurées l'évite :

- la part de cellules en LISIÈRE — voisinage contrasté entre couvert et ouvert ;
- la part de cellules de CŒUR — voisinage entièrement couvert.

Il vaut zéro quand il n'y a que de la lisière, zéro quand il n'y a que du bloc,
et il est maximal quand les deux s'équilibrent. **Le sommet n'est pas choisi, il
tombe** de l'énoncé « il faut les deux », qui est ce que dit l'écologie du
paysage.

Mesuré sur trente-six chênes de 14 m, même espèce, même nombre, même âge :

| disposition | lisière | cœur | mosaïque |
|---|---|---|---|
| quatre bosquets | 0,72 | 0,28 | **0,79** |
| bloc serré | 0,23 | 0,25 | 0,23 |
| plantation régulière pleine | 0,00 | 1,00 | **0,00** |
| mitage (houppiers disjoints) | 0,94 | 0,00 | **0,00** |

Les deux extrêmes tombent à zéro, et le mitage aussi franchement que le bloc.

### Ce que le décompte des strates confondait

L'indice comptait les étages à l'échelle de la PARCELLE. Il notait donc
identiquement une forêt où chaque mètre carré porte trois strates et un damier
où un tiers porte des arbres, un tiers des arbustes, un tiers de l'herbe.
L'écart-type local des hauteurs les sépare : **0,00 pour un peuplement équienne,
0,68 pour trois hauteurs entremêlées**. Les sept points que cette grandeur prend
au décompte de strates ne sont pas un arbitrage de place — c'est `etagement` qui
mesure ce que `strates` croyait mesurer.

### Ce que l'issue disait de vérifier, et qui était faux

Elle demandait de regarder J3 et B9 avant d'écrire, « qui voisinent ». Vérifié :
**J3 ne parle pas de mosaïque** mais des gros arbres et des cavités, et B9 parle
de la LUMIÈRE latérale d'une bordure, pas de son habitat. Aucun recouvrement —
la structure horizontale était bien un trou, et c'est J9 qui le comble.

## Le sanglier : le seul herbivore qui mange la régénération ET la favorise

Le chevreuil était complet depuis longtemps. Le sanglier manquait, et l'issue
suggérait de généraliser l'architecture du gibier pour l'y loger. **Après
lecture, non.** `gibier.ts` est bâti de bout en bout sur le BROUTAGE — hauteur
de dent, fourrage par cellule, appétence, longueur de pousse mangée — et un
sanglier ne broute pas. Généraliser aurait produit une abstraction qui ne décrit
ni l'un ni l'autre. Ce qui se partage n'est pas le code mais le PATRON : une
densité de contexte imposée par le paysage (domaine vital de 500 à 2000 ha selon
l'OFB — la parcelle n'a pas de population, elle en reçoit une part), une
répartition locale au prorata de ce que chaque cellule offre, une comptabilité
qui tient.

### Deux effets de signe opposé, et aucun n'est écrit par espèce

C'est ce qui fait de cet animal autre chose qu'un décor, et les deux tombent de
traits que l'atlas déclarait déjà :

- **il mange ce qui tombe et reste.** Le mode de dissémination distingue depuis
  toujours `geai` et `gravite` — les grosses graines lourdes — de `vent` et
  `oiseaux`. Un sanglier mange les premières au sol ;
- **il ouvre un lit de germination.** Un boutis enlève le matelas de feuilles et
  met la terre à nu, ce dont profitent précisément les petites graines, celles
  qui ne lèvent pas sous une litière fermée.

D'où la tension que l'issue espérait, sans qu'on ait eu à l'écrire : **le geai
plante les chênes, le sanglier les mange**, et pendant ce temps il prépare le lit
du bouleau. Mesuré sur quarante ans : 97 recrues de chêne sans sanglier, 60 à
densité ordinaire, 22 sous forte densité.

### Le sanglier annule l'atténuation qu'apporte la plantation feuillue

C'est le résultat le plus fort du lot, et personne ne l'a demandé. Le cas
d'étude de Saumos compare, sur seize graines et vingt-six ans, une pinède et un
mélange bouleau-châtaignier sur la même lande. Mesuré :

| | pin | feuillus | écart |
|---|---|---|---|
| sans sanglier | 821 m² | 525 m² | **296 m²** |
| à la densité du paysage | 720 m² | 747 m² | **27 m²** |

Sans sanglier, les feuillus brûlent un bon tiers de moins. Avec, **l'avantage
disparaît entièrement**. La chaîne est celle que le fichier d'essai annonçait
depuis longtemps sans pouvoir la refermer : l'atténuation feuillue repose sur la
capacité à FERMER LE COUVERT vite, ce qui étouffe la lande qui porte le feu ; le
châtaignier est en `geai`, donc le sanglier mange sa châtaigne, donc le mélange
ne se ressème pas, donc il ne referme pas, donc il n'étouffe plus rien.

Un gestionnaire qui plante des feuillus pour réduire le risque d'incendie et qui
ne compte pas ses sangliers plante donc pour rien. L'essai de Saumos met
maintenant le sanglier de côté pour continuer de mesurer la composition seule ;
l'interaction, elle, est ici.

### Ce qu'on n'attend pas d'un dégât

Un boutis est un **enfouissement**, pas une destruction. La litière passe au pool
lent, l'azote au pool minéral, et le stock d'humus MONTE avec la densité de
sangliers. La structure y gagne aussi — la croûte est cassée, la porosité
revient dans les dix premiers centimètres, ce qui est d'ailleurs la raison pour
laquelle les sites de germination s'ouvrent. Ce que le sanglier coûte est
ailleurs : la terre est à nu, donc elle part.

### Un trait qui porte le bon nom et ne dit pas la bonne chose

Le premier jet faisait manger au sanglier tout ce dont le mode de dissémination
valait `geai` OU `gravite`, en croyant lire « graine lourde ». Mais `gravite` ne
dit pas le poids : il dit que la graine **tombe sous sa mère**, ce qui range
l'ajonc et le genêt — graines dures de deux millimètres — à côté de la faîne.

Le sanglier s'est donc mis à manger des graines d'ajonc, les landes ont cessé de
se ressemer, et l'effet nurse est tombé : un pin abrité par six ajoncs passait
de 1,38 m à 0,92 m en huit ans, sous celui d'un pin nu. Un test d'abri au vent,
cassé par un sanglier mangeant ce qu'aucun sanglier ne mange.

`geai` seul est le bon marqueur, et ce n'est pas un hasard : un geai ne cache que
de grosses graines nutritives, si bien que l'atlas le pose exactement sur les
chênes, le chêne-liège, le châtaignier et le noisetier — les glands et les
châtaignes que l'issue nommait. **Ce que ça laisse de côté** : la faîne du hêtre,
classée `gravite`, est bien mangée. La rattraper proprement demanderait un trait
de TAILLE DE GRAINE dans l'atlas.

C'est la deuxième fois de la session qu'une réutilisation échoue ainsi — après
`windShelterAt`, qui calculait bien un abri, mais celui d'une haie pour un jeune
plant. **Relire la DÉFINITION de ce qu'on réutilise, jamais son nom.**

### Le couperet évité, pour la troisième fois

La consommation de la glandée soustrayait d'abord linéairement. Résultat mesuré :
à 1,8 fois la densité de référence il ne restait **exactement rien**, et la
régénération du chêne s'éteignait d'un coup — zéro recrue en quarante ans. Une
forme exponentielle garde la bonne écologie (sous forte densité la glandée ne
passe presque plus) sans jamais promettre l'extinction.

Ce dépôt a maintenant payé trois fois le même défaut : l'anémone à pH 4,0, le
chêne-liège à pH 4,50, et cette glandée. **Une grandeur qui touche un zéro dur
bascule d'un extrême à l'autre pour un centième de rien.** À chercher
systématiquement dans tout nouveau mécanisme.

## Le bois d'œuvre : un puits qui ne se vide jamais n'est pas un puits

Le carbone vendu en scierie entrait dans `oeuvreCumKgC` et n'en sortait jamais.
Une palette stockait autant qu'une charpente, pour toujours, et vendre du bois
devenait un geste climatique gratuit et définitif — faux dans le sens qui flatte
le joueur, ce qui est la pire direction pour une erreur de comptabilité.

Le stock sort maintenant d'usage en décroissance de premier ordre, la méthode
des inventaires nationaux, sur la **demi-vie par défaut de l'IPCC pour les
sciages : trente-cinq ans** (la même table donne 25 ans pour les panneaux et
2 ans pour le papier ; le moteur ne produit que du sciage). Le crédit au bilan
net devient le STOCK et non le cumul.

### Le carbone se partage enfin comme la caisse

En ouvrant le dossier, un défaut plus ancien est apparu, et il était silencieux.
`valeurSurPied` facture depuis toujours un arbre d'œuvre en DEUX parts : la
bille élaguée au prix de la scierie, le houppier au prix des bûches. La
comptabilité carbone, elle, envoyait **tout** l'arbre au stock de produits dès
lors qu'il était classé « œuvre ». Le prix disait 60 % d'œuvre et le carbone
disait 100 %. Les deux partages sont maintenant le même.

C'est aussi ce qui donne au lot sa leçon sylvicole sans qu'on ait à l'écrire :
la part qui devient un produit durable est celle qu'on a ÉLAGUÉE. Tailler tôt,
c'est fabriquer du carbone qui dure — et le moteur n'a pas eu besoin d'une
décision de jeu supplémentaire pour le dire, ce que l'issue redoutait.

### L'issue se trompait sur ce qu'on verrait, et la mesure le dit

Elle prévenait : « une charpente centenaire ne rendra rien pendant la partie, ce
qui est le bon comportement — ne pas raccourcir les durées pour que ça se voie ».
La mise en garde est juste, mais sa prémisse ne l'est pas. Elle demandait dans le
même paragraphe **une seule durée moyenne**, et une moyenne sur charpente, meuble
et emballage ne vaut pas un siècle : l'IPCC la place à trente-cinq ans.

Mesuré : un produit vendu au début d'une partie de cinquante ans en a rendu
**63 %** à la fin. On voit donc le puits se vider, sans avoir rien raccourci — et
la leçon est plus dure que celle que l'issue imaginait. **À l'échelle d'une vie
de gestionnaire, vendre du bois n'est pas un geste climatique définitif. Ce qui
reste définitif, c'est ce qu'on laisse pousser.**

## Le pH : un état de moins, une lecture de plus

Le pH était une constante que seul le joueur pouvait changer. Le moteur savait
pourtant déjà exclure une espèce hors de sa gamme (C7) : la conséquence était en
place, c'est la cause qui manquait.

Le lot ne fait pas dériver le pH par incréments. Il tient un pool de **bases
échangeables** — le calcium, le magnésium, le potassium et le sodium fixés sur
le complexe argilo-humique — et le pH s'y LIT, comme taux de saturation de ce
complexe. C'est le sens physique du pH d'un sol, et le gain n'est pas
esthétique : trois règles tombent de ce choix sans qu'on les écrive.

- **Le chaulage cesse d'être un geste à effet fixe.** Il montait de 0,5 partout ;
  il apporte maintenant des bases, et le pH suit. La même chaux déplace donc
  beaucoup un podzol sableux — petit complexe, donc grand dénominateur — et peu
  un limon argileux. Mesuré, et c'est un test.
- **Un sol déjà acide s'acidifie de moins en moins**, parce que la courbe
  s'aplatit par le bas. Ce n'est pas un garde-fou de programmeur : c'est la
  gamme tampon de l'aluminium d'Ulrich, où les hydroxydes prennent le relais du
  complexe.
- **Une partie démarre exactement au pH que sa station déclare**, parce que la
  saturation initiale est INVERSÉE depuis ce pH. Une dérive qui commence par
  déplacer son point de départ n'est pas une dérive, c'est un bug.

### La littérature dit le contraire de l'intuition, et il a fallu la suivre

L'issue posait « une pessière podzolise, un feuillu maintient le pH ». C'est une
demi-vérité, et la moitié fausse valait le détour :

- Foltran et al. mesurent, après 63 et 82 ans de conversion en Allemagne
  centrale, que le **hêtre acidifie le sol minéral profond PLUS que l'épicéa**
  (−0,5 unité en vingt ans) — précisément à cause de la pompe à bases, qui les
  remonte en surface et appauvrit la profondeur.
- Dans des peuplements appariés, la litière d'**épicéa contient deux fois plus
  de calcium que celle du pin sylvestre**, et la pruche se place au-dessus du
  chêne rouge. « Résineux » n'est pas une grandeur chimique.

D'où le trait retenu : non pas un « pouvoir acidifiant » par type de feuillage,
mais la **teneur en calcium de la litière**, qui se mesure et se publie. Et la
chaîne causale entière a été mesurée en jardin commun — Reich et al. 2005,
quatorze essences en Pologne centrale, trente ans : le calcium de la litière
varie du simple au quadruple entre essences, et c'est lui qui explique le pH du
sol, le calcium échangeable, le taux de saturation, la vitesse de dégradation du
plancher forestier et jusqu'aux vers de terre. Le mécanisme de ce lot n'est donc
pas une hypothèse : il a été observé.

**Ce que ça coûte en honnêteté** : sur vingt-six fiches, quatre valeurs sont
ancrées (frêne, hêtre, chêne par un congénère nord-américain ; pin par le
rapport épicéa/pin) et vingt-deux sont des placements dans une gamme mesurée.
Le tableau de `bases.ts` le dit fiche par fiche.

### Le pin s'acidifie le sol jusqu'à s'y trouver bien

C'est le résultat que ce lot n'a pas écrit, et le seul qu'on n'aurait pas pu
prévoir. Le versant du test `bois-en-travers` est un limon riche à pH 7,0 planté
de hêtre et de pin. Les deux litières sont pauvres en calcium, donc le
peuplement acidifie son propre sol : **7,00 → 6,94 → 6,82 → 6,62** sur soixante
ans. Or le pin sylvestre était à la limite HAUTE de sa gamme (4 à 7,5, soit un
facteur de 0,80 à pH 7). Au fil de la dérive, ce facteur monte : **0,80 → 0,97 →
1,00**. Le pin pousse mieux, monte à 23 m au lieu de rester bridé, et domine le
peuplement.

Personne n'a écrit « le pin améliore son sort en l'acidifiant ». Ça tombe de la
rencontre de la dérive du pH (C10, neuf) et du filtre de gamme (C7, ancien), qui
ne se connaissaient pas. Et c'est de la bonne écologie : c'est exactement ce que
fait un pin sur un sol qui n'est pas le sien.

La conséquence s'est propagée jusqu'à un test qui ne parle ni de pH ni de pin —
le bois en travers piège moins de terre, parce qu'un versant mieux couvert en
laisse moins passer. Son seuil bouge pour la cinquième fois, et pour la
cinquième fois avec sa raison écrite.

### Trois erreurs d'échelle, toutes trouvées en mesurant

**Le lessivage repris du potassium.** Même forme, même fonction, même
signature — et trois ordres de grandeur d'écart. Le potassium échangeable du
moteur est un petit pool mobile ; les bases du complexe font un demi-million
d'eq/ha. Au taux du potassium, un limon neutre tombait au plancher d'acidité en
**vingt-cinq ans**, et une hêtraie de test perdait son sol sous elle. Recalé sur
le flux, qui lui est mesuré — quelques centaines d'eq/ha/an sous forêt tempérée.

**Les embruns comptés comme un apport de bases.** Le premier jet retenait
300 eq/ha/an de dépôts atmosphériques, poussières et embruns confondus. Mais le
sel marin n'apporte AUCUNE alcalinité nette : le sodium et le magnésium arrivent
avec leurs chlorures, traversent le complexe et ressortent au drainage. Seule la
fraction non marine compte, et 120 eq/ha/an est l'ordre de grandeur honnête. Ce
que l'erreur faisait : la lande sèche REMONTAIT de 4,50 à 4,56 en cinquante ans,
alors que c'est le type même du sol qui s'acidifie tout seul. Et ce n'était pas
cosmétique — le chêne-liège est exactement à sa borne sur cette station (gamme
4,5-8, donc facteur NUL à pH 4,50) : deux centièmes de pH le faisaient passer
d'exclu à viable, ce qui changeait le peuplement, donc le combustible, donc les
incendies. Cinq tests du feu sont tombés là-dessus, et ils avaient raison.

**L'altération créditée de ce que les racines lui arrachent.** Le phosphore et
le potassium bénéficient d'un facteur rhizosphère (les mycorhizes dissolvent la
roche, ×2 à ×5). Appliqué aux bases, il faisait **remonter le pH sous un
peuplement de hêtres** — l'inverse exact de ce qu'un hêtre fait. La raison est
comptable : ce fichier ne débite pas le prélèvement des arbres, donc créditer
l'accélération qui le nourrit fabrique des bases à partir de rien. Le facteur a
sauté, et c'est écrit à l'endroit où il aurait été tentant de le remettre.

Une fois les deux corrigées, le budget minéral d'un sol forestier se retrouve
**proche de l'équilibre** — 290 eq/ha/an d'altération et 300 de dépôts contre
650 de lessivage sur le limon riche — et c'est la végétation qui le fait
pencher. C'est le résultat qu'on cherchait sans le savoir : si l'altération
dominait, aucune essence ne pourrait acidifier quoi que ce soit.

## La tempête : le vent cesse d'être seulement desséchant

Le moteur connaissait trois vents. Celui qui gonfle la demande évaporative (A7),
celui qu'une haie brise (E5), celui qui pousse le feu (F12). Aucun ne cassait
quoi que ce soit. Un arbre pouvait mourir de soif à cause du vent ; il ne
pouvait pas verser. Les seules façons de se retrouver au sol étaient le joueur
qui abat et la chandelle déjà morte qui finit par tomber.

Le symptôme était lexical, et il traînait depuis longtemps : le mot **chablis**
est partout dans le vocabulaire du moteur et n'y désignait jamais une tempête.
`DECOTE_CHABLIS` était la décote d'un bois BRÛLÉ, `CHABLIS_RECUPERABLE_SEMAINES`
le délai de récupération d'un arbre tué par le FEU. Pire : `marche.ts` explique
sur dix lignes l'effondrement des cours après Lothar et Klaus. **Le moteur
enseignait la conséquence d'un événement qu'il ne savait pas produire.**

### La rafale, et non le vent moyen

Le choix de grandeur décide de tout le reste. La casse mécanique ne se joue pas
sur une moyenne hebdomadaire — c'est structurellement la mauvaise variable —
mais sur la RAFALE, le pic de quelques secondes. `tempete.ts` tire donc pour
chaque semaine un maximum de rafale dont le vent moyen fixe le pied et dont une
queue exponentielle fait le sommet, calée sur la cinquantennale française de
40-45 m/s (la classe de Klaus dans les Landes, de Lothar sur le Bassin
parisien).

Deux faits de terrain TOMBENT de ce seul choix, sans qu'on ait eu à les écrire :

- **les tempêtes sont hivernales**, parce que le vent moyen l'est déjà
  (`meteo.ts` : maximum en janvier, plancher fin juillet). Une rafale de 40 m/s
  demande un tirage sur mille en janvier et un sur un million en juillet. Sur
  quatre parties de soixante ans, aucun chablis entre les semaines 23 et 37 ;
- **le caduc nu paie moins que le sempervirent**, parce que la prise au vent se
  lit sur la part foliaire ombrageante et que les tempêtes atlantiques arrivent
  quand les feuillus sont dénudés. Mesuré, soixante ans sur limon riche : la
  pinède couche 65 à 88 tiges, la hêtraie 4 à 11.

Un troisième tombe d'un mécanisme qui n'avait rien à voir : **les hivers doux et
humides font des arbres qui versent un peu plus**. Un arbre qui n'a jamais eu
soif n'est jamais descendu chercher l'eau (`nouvelleProfondeurRacines`), donc il
s'ancre moins bien que son voisin des étés secs. Ça n'est écrit nulle part ;
c'est la rencontre de la plasticité racinaire et du bras de levier. L'effet a
été RAMENÉ À SA TAILLE depuis (#84) : il valait un rapport de 2,7 entre les deux
régimes, dont les deux tiers venaient d'un plancher racinaire fautif et non de
la plasticité. Il en reste 1,5 — sept points de résistance, pas la moitié.

### Ce que quatre erreurs de conception ont appris

Aucune n'a été vue en relisant le code. Les quatre ont été trouvées en mesurant,
et la dernière seulement en relançant la suite ENTIÈRE.

**Zéro tempête en soixante ans.** Le premier jet réutilisait `windShelterAt`, qui
existait déjà et calculait un abri. Mais il répond à une AUTRE question : il a
été écrit pour la haie brise-vent — de quoi un jeune plant est-il protégé, près
du sol — et compte tout voisin d'une certaine taille, où qu'il soit. Dans un
peuplement il sature donc à 1 pour tout le monde : chacun s'abrite de ses
semblables, et plus rien ne verse. Ce qui abrite une CIME, c'est ce qui la
dépasse. `abriAuVent` ne somme que le dépassement des voisins plus hauts, et de
là sortent trois comportements de terrain qu'on n'a pas eu à écrire : une futaie
régulière ne s'abrite pas elle-même (c'est Klaus dans les pins alignés), un
sous-étage est protégé par sa canopée, un dominant qui émerge prend tout.

**Les semis couchés, les dominants épargnés.** Cent vingt-deux arbres pour
2,4 m³, soit l'exact inverse d'une tempête. L'ancrage était écrit comme une
profondeur ABSOLUE — trente centimètres de racines, mal ancré. Or le
renversement est une affaire de MOMENTS : le vent pousse sur la cime avec un
bras de levier qui est la hauteur, la motte résiste avec un bras qui est sa
profondeur. Le rapport `profondeur / hauteur` a remis le tri à l'endroit.

**Et le seuil de ce rapport a été calé sur un échantillon qui n'en était pas
un** — c'est la quatrième erreur, et la seule que la suite entière a trouvée
alors que les tests du lot passaient tous. Six pour cent semblaient être le
niveau normal : c'est ce que tiennent les hêtraies et les aulnaies de quarante
ans mesurées sur la série de Limon-riche (0,054 à 0,073). Mais ces racines-là
sont descendues parce que l'ÉTÉ LES Y A FORCÉES. Le même hêtre poussé
quatre-vingt-dix ans sur un site jamais sec tenait 0,019 à 0,035 : il n'a jamais
eu soif, il n'est jamais descendu, et la plasticité racinaire fait exactement
ce qu'on lui demande. Toute une population légitime se retrouvait donc au fond
du barème, et le test de lumière — une futaie de soixante-quatre hêtres de 25 m
sur limon frais, qui ne parle pas du tout de vent — perdait seize arbres en
cinq ans, ouvrait sa canopée et laissait survivre un semis de pin qui devait
mourir d'ombre.

Deux corrections, et la seconde compte autant que la première : le seuil est
descendu à 4 % pour couvrir les deux régimes hydriques, et **l'ancrage a cessé
d'être le terme dominant** de la vitesse critique. Un enracinement superficiel
retire un cinquième de la résistance et non deux, ce qui est l'ordre de grandeur
des classes d'enracinement de la famille ForestGALES. Le tri, lui, survit :
65-88 pins couchés contre 4-11 hêtres, et zéro sur un site abrité.

### Le seuil est revenu à six, et c'est la mesure qui l'a ramené

Ce fichier posait lui-même la question qu'il ne pouvait pas trancher : « que le
moteur donne 44 cm de racines à un hêtre de vingt mètres sur sol frais est une
calibration de `RACINES_PLANCHER`, pas de ce fichier ». **C'était le vrai
défaut, et le 4 % n'était que le pansement** (#84).

`RACINES_PLANCHER` valait 0,35 pour tout le monde, à tout âge : un arbre qui
n'a jamais eu soif ne construisait qu'un tiers du squelette racinaire que son
espèce et son sol autorisent — ce qui est vrai d'un semis, et faux d'un arbre
mûr. Un arbre ne descend en profondeur que s'il a soif (`nouvelleProfondeurRacines`,
A17), mais il BÂTIT son ancrage en grandissant, soif ou pas. Le plancher croît
donc maintenant avec la maturité, de 0,35 à 0,80 (`partPlancherRacines`), et
l'extrémité jeune n'a pas bougé : un semis démarre toujours en surface.

Ce que ça change, mesuré sur un hêtre isolé, graine 7, quatre-vingt-dix ans :

| | 30 ans | 60 ans | 90 ans |
|---|---|---|---|
| série (été sec) | 5,9 m / 60 cm — 0,101 | 13,3 m / 87 cm — 0,065 | 16,4 m / 96 cm — 0,059 |
| site jamais sec | 9,0 m / 43 cm — 0,048 | 16,9 m / 72 cm — 0,043 | 20,5 m / 79 cm — 0,039 |

Les deux régimes se tiennent dans un rapport de 1,5 au lieu de 2,7. Le seuil
d'ancrage complet est donc revenu à **6 %**, la valeur mesurée sur de vraies
hêtraies, et le hêtre jamais assoiffé y perd sept points de résistance au lieu
d'être condamné. **ForestGALES recoupe** : ces modèles classent un sol
superficiel à 80 cm ou moins, ce qui vaut exactement un ratio de 0,04 pour un
arbre de vingt mètres — l'ancien seuil déclarait donc « parfaitement ancré » ce
que la littérature appelle superficiel. À 0,06, l'ancrage complet demande 120 cm
au même arbre, soit la classe profonde.

**Et trois essais d'autres lots sont tombés avec la correction**, ce qui est le
signe qu'ils s'appuyaient sur le défaut :

- `tempete.test.ts` posait en hypothèse que pinède et hêtraie « arrivent à
  taille comparable » et le vérifiait sur la hauteur des SURVIVANTS à soixante
  ans, c'est-à-dire après que la tempête a emporté les plus grands : la
  conclusion de l'essai déguisée en son hypothèse. Se lit désormais sur la
  hauteur ATTEINTE, relevée semaine après semaine ;
- `feu.test.ts` exigeait « plus de 300 rejets » d'un incendie cherché sur cinq
  graines — le compte exact d'un tirage. Un ajonc qui pousse un peu autrement
  retient un autre incendie, et le compte tombe à 205. Le garde dit maintenant
  ce qu'il voulait dire : que la branche « rejet » du bilan carbone est
  vraiment empruntée, en masse ;
- `climat.test.ts` comptait le rapport des morts « soif + ravageurs » — voir D8 :
  troisième instrument en trois lots, et le premier qui ne soit pas un composite.

**L'aulnaie rasée tous les deux ans.** L'engorgement est LE facteur des grandes
tempêtes : Lothar et Klaus se sont concentrés là où le sol était gorgé. Mais
appliqué brut, il couchait l'aulne du fond de vallée — une espèce dont c'est
l'habitat. Ce qui compte est l'engorgement AU-DELÀ de ce que l'espèce supporte,
la forme même que `waterloggingFactor` utilise déjà pour la croissance. Un arbre
qui vit là a des racines faites pour ce sol ; c'est le hêtre égaré dans le
bas-fond qui verse.

### Le label `flux-aléatoire` n'a pas eu lieu d'être

L'issue prévoyait que le mécanisme déplace le flux du PRNG, ce qui aurait obligé
à revérifier tous les scénarios. Il n'en a rien été : la rafale dérive de la
graine de partie et de la semaine (comme l'indice du marché, `marche.ts`), le
renversement de l'identité de l'arbre et de la semaine (comme la direction de
chute, `boisMort.ts`). **Aucune partie sans tempête ne change d'un cheveu.** La
règle vaut d'être généralisée : un mécanisme qui tire au sort n'a presque jamais
besoin du flux séquentiel, et le prix d'une graine dérivée est deux lignes.

### Ce que ça coûte

Le tirage de rafale tourne à chaque semaine de chaque partie : **0,2 µs**. Le
balayage du peuplement, lui, ne tourne que les semaines où la rafale dépasse
25 m/s — `RAFALE_MINIMALE_MS` n'est pas un seuil de dégât mais un filtre de
calcul, et il doit rester SOUS le plus fragile des cas possibles. Il coûte
**0,15 ms** sur une hêtraie de quarante ans (96 tiges, 30 × 30 m), et il est
quadratique en nombre d'arbres parce que `abriAuVent` regarde tous les voisins.

Au niveau du tick complet, la différence ne se mesure pas : 8,17 ms/semaine sur
un site exposé contre 8,11 sur le même site abrité, quand l'écart entre deux
passes de la même configuration va de 7,75 à 8,70. **Le mécanisme est gratuit à
cette échelle**, et le dire ainsi vaut mieux que d'annoncer un +0,7 % qui n'est
que du bruit. À surveiller le jour où une parcelle portera mille tiges : c'est
le balayage quadratique qui parlera le premier.

## La phénologie : chaque espèce a son calendrier

Le feuillage était commandé par un booléen — `leavesOn = tMean > 6 °C` — et
toute la litière tombait en une semaine. Deux couperets, et le premier était de
surcroît identique pour toutes les espèces : un bouleau et un frêne
débourraient le même jour, ce qui est faux de six semaines. Or l'ordre de
débourrement décide de qui profite de la lumière d'avril sous un couvert encore
nu.

Le modèle combine les deux commandes que la littérature donne comme
indissociables : le **forçage**, un cumul de degrés-jours base 5 propre à chaque
espèce, et la **photopériode**, un seuil de durée du jour sous lequel rien ne
part. Le second n'est pas un raffinement — notre série le montre : au 12 avril,
la lande girondine a cumulé 341 °C·j quand le limon du Nord n'en a que 123. Un
seuil de forçage seul ferait débourrer les Landes six semaines avant le Nord, là
où l'écart réel est de deux à trois.

S'y ajoute le **besoin de froid** : un bourgeon ne sort de dormance qu'après des
semaines fraîches, et un hiver trop doux enfle le cumul de chaleur exigé. Hêtre
sur limon : onze semaines de froid à climat figé contre quatre sous SSP5-8.5 en
2090, ce qui porte son exigence de 315 à 420 °C·j. L'effet **amortit l'avance
sans la renverser** à nos latitudes.

**La croissance suit désormais le feuillage**, et plus seulement la température :
un caduc poussait en janvier quand l'hiver était doux, et transpirait sans avoir
une feuille. La transpiration hivernale d'un hêtre tombe à 3 mm par an quand le
pin, sempervirent, en garde 8. Le nombre de semaines de végétation est passé de
trente à vingt-six, ce qui n'est pas un rattrapage : la constante signifie « le
nombre de semaines sur lesquelles la pousse annuelle se répartit », et la
phénologie en donne le vrai compte.

**Ce que la correction a coûté** : une conclusion. L'avantage mesuré de l'aulne
en replantation d'après-feu n'était qu'un effet de la transpiration hivernale
fantôme qu'autorisait le booléen. Voir « une conclusion retirée » plus haut.

*Cette section laissait une limite ouverte* — « les hauteurs absolues sont
faibles, un hêtre de plaine plafonne autour de quatre mètres à quarante ans » —
et c'est le chantier suivant qui l'a levée.

## Les hauteurs absolues : le moteur se cale sur les tables de production

Le constat était juste ; la cause n'était pas là où on la cherchait. Un hêtre
planté sur la station confort faisait 2,1 m à dix ans, 3,0 m à vingt et 4,8 m à
quarante. Les rapports tenaient — le bouleau devant le hêtre, le limon riche
devant le limon pauvre — mais aucun niveau n'était présentable, et le rendu
visuel allait se calibrer là-dessus.

**La vérité terrain d'abord.** On a retenu les tables néerlandaises de
**Jansen, Sevenster & Faber (1996)**, *Opbrengsttabellen voor belangrijke
boomsoorten in Nederland* (IBN-DLO rapport 221, <https://edepot.wur.nl/174739>),
classe de croissance **médiane** de chaque essence. C'est la seule source du
corpus consulté qui donne directement la **hauteur dominante** — les cent plus
gros arbres à l'hectare — avec un âge compté depuis la germination et de
nombreuses classes de fertilité ; et le **CNPF (2025)**, *Faciliter
l'utilisation des tables de production forestières dans le cadre du Label Bas
Carbone*, la juge parmi les mieux adaptées au contexte français pour plusieurs
de ces essences.

| Essence (classe médiane) | 20 ans | 40 ans | 60 ans |
|---|---|---|---|
| Hêtre — *Beuk* GK 8 (gamme 4→12) | 7,7 m | **16,0 m** | 22,9 m |
| Pin sylvestre — *Groveden* GK 8 (4→12) | 8,1 m | **15,5 m** | 19,8 m |
| Bouleau — *Berk* GK 5 (3→6), Braastad 1967 | 8,6 m | **14,8 m** | 19,6 m |
| Aulne — *Zwarte els* GK 6 (4→8), Mitscherlich 1945 | 12,6 m | **18,0 m** | 21,3 m |
| Frêne — *Es* GK 6 (4→9), Volquardts 1958 | 9,0 m | **16,5 m** | 21,4 m |

*Deux pièges de lecture, signalés parce qu'ils changent les chiffres.* Les
tables allemandes classiques (Schober, Wiedemann, Jüttner) donnent la
*Mittelhöhe*, hauteur MOYENNE du peuplement, plus basse que la hauteur
dominante — le seul écart chiffré qu'on ait trouvé est de 0,8 m à 80 ans sur
l'épicéa, ce qui ne fait pas une règle de conversion *(à confirmer)*. Et l'âge
n'a pas la même origine partout : germination chez Jansen, hauteur de 0,30 m
chez Bontemps. Les valeurs à dix ans qu'on lit ici et là sont des
extrapolations sous le premier âge tabulé (quinze ans) : on ne s'y cale pas.

**La cause : un besoin d'azote quinze fois trop gros, qui s'affamait
lui-même.** Sur la station confort, le facteur limitant d'un hêtre était
l'azote 93 % des semaines de végétation, et sa satisfaction moyenne valait
**0,39** — toute sa vie. La loi du minimum multipliait donc la croissance par
0,4 en permanence. Le sol n'y était pour rien : ce limon minéralise 60 à
80 kg N/ha/an, ce qui est un chiffre de terrain honnête. C'est la DEMANDE qui
était fausse. Elle s'écrivait `60 × h^1,5` grammes par an : un hêtre de quinze
mètres y réclamait 3,5 kg d'azote **à lui seul**, quand un hectare de hêtraie
fermée en prélève 50 à 100.

Et le mécanisme se mordait la queue. Les arbres raflaient chaque semaine tout
l'azote minéral de leur zone racinaire ; le stock du sol restait donc collé à
zéro ; le frein de dilution — `nitrogenAvailabilityFactor`, saturé à 30 kg N/ha
— voyait ce stock nul et bridait l'extraction ; les arbres se retrouvaient
affamés par leur propre voracité. **Un sol pauvre en azote minéral n'est pas un
sol pauvre : c'est un sol où l'azote est consommé aussi vite qu'il apparaît.**

Le besoin est maintenant accroché à la seule grandeur qui le porte
physiquement, la **surface de houppier** : `AZOTE_HOUPPIER_G_M2_AN` = 8 g/m²/an
pour une essence d'exigence maximale. Le compte se refait à la main — un
couvert feuillu ferme porte 5 à 6 m² de feuilles par m² de sol, une feuille
titre 2 à 2,5 % d'azote, l'arbre en retransloque la moitié avant la chute — et
retombe sur 50 à 100 kg N/ha/an au houppier fermé, la fourchette des bilans de
peuplements tempérés. Un hêtre de trois mètres demande désormais une quinzaine
de grammes par an, pas deux cents. Sa satisfaction en azote est passée de
**0,39 à 0,86**, et le facteur maître a changé de nature : c'est maintenant
l'EAU qui prend la main, sept semaines de végétation sur dix.

**Ce qu'on a écarté en chemin**, parce qu'un diagnostic sans réfutation n'en est
pas un :

- **`GROWING_WEEKS`** (26) était soupçonné d'avoir été mal recalé après le
  passage à la phénologie. Mesure : le hêtre cumule **24,1** semaines-équivalentes
  de végétation par an sur cette station, le pin 32,6. L'écart au diviseur coûte
  7 %, pas 60 %. Hors de cause.
- **Lumière, pH, phosphore, potassium** : facteurs moyens à 1,00 sur la station
  confort. Ils ne bridaient rien.
- **L'eau**, en revanche, est bien limitante, mais en second : 0,83 en moyenne
  pour le hêtre. Elle est devenue le facteur maître une fois l'azote corrigé, et
  c'est elle qui explique le retard qui subsiste (voir plus bas).

**La deuxième cause : la courbe n'avait pas la bonne forme.** La croissance
s'écrivait `pousse × (1 − h/hmax)`. C'est la forme différentielle de
Chapman-Richards `H = A·(1 − e^(−kt))^c` avec **c = 1** — la seule valeur de la
famille qui ne soit pas sigmoïde : la pousse annuelle y est maximale à la
germination et ne fait que décroître. Aucune essence ne pousse comme ça. Un
hêtre fait quinze centimètres par an sous son couvert d'origine, accélère vers
vingt ans, et ne culmine qu'entre dix et vingt mètres.

`FORME_CROISSANCE` vaut maintenant **1,5**, ce qui déplace le maximum de pousse
à 19 % de la hauteur adulte. La valeur n'est pas inventée : **Bouchon & Trencia
(1990)**, « Sylviculture et production du Chêne », *Rev. For. Fr.* XLII-2,
publient pour le chêne sessile des `c` de **1,14 à 2,07** selon la classe de
fertilité ; **Patrício et al.** (iForest, châtaignier en futaie) un exposant de
**1,62**. Une normalisation garde à `pousseMaxMAn` son sens — « la pousse
annuelle maximale » — quel que soit l'exposant.

**Avant / après**, hauteur moyenne de douze sujets plantés au large sur le limon
riche, moyennée sur trois graines (la variabilité individuelle est de ±20 % :
un individu, une graine, ne prouvent rien) :

| Essence | 10 ans | 20 ans | 40 ans | Table à 40 ans |
|---|---|---|---|---|
| Hêtre | 2,1 → **2,6** | 3,0 → **5,3** | 4,8 → **10,6** | 16,0 |
| Pin sylvestre | 3,1 → **3,9** | 4,3 → **8,2** | 6,1 → **15,0** | 15,5 |
| Bouleau | 4,2 → **6,2** | 7,1 → **11,9** | 9,8 → **17,8** | 14,8 |
| Aulne | 5,0 → **5,0** | 8,9 → **10,1** | 14,5 → **17,2** | 18,0 |
| Frêne | 2,4 → **3,8** | 3,4 → **8,0** | 5,4 → **14,6** | 16,5 |
| Charme | 2,3 → **3,1** | 3,3 → **6,3** | 5,2 → **11,6** | pas de table |
| Chêne pubescent | 2,1 → **2,7** | 3,0 → **5,3** | 4,4 → **9,5** | pas de table |

*L'aulne bouge peu, et c'est cohérent : il FIXE son azote, donc il était le
seul à ne pas souffrir du besoin surdimensionné. C'est d'ailleurs ce contraste
qui a mis sur la piste — un aulne à 14,5 m à quarante ans quand le hêtre voisin
plafonnait à 4,8 m, sur la même station, ne pouvait pas venir de l'eau ni de la
lumière.*

`hauteurs.test.ts` fige la comparaison, aux deux âges réellement TABULÉS
(20 et 40 ans), avec une tolérance de ±45 % qui y est justifiée : les classes de
fertilité de la table s'étalent déjà de −18 % à +16 % autour de la médiane, nos
stations ne sont calées sur aucune classe, et chaque arbre porte ±20 % de
vigueur propre. La bande certifie « la bonne classe de fertilité, à une classe
près » — elle aurait hurlé sur le hêtre à 0,30 fois la table.

**Ce qui reste faux, et il en reste.**

- ~~**Le hêtre est encore un tiers trop bas**, et c'est l'eau.~~ **Faux, et
  vérifié** : de 750 à 1100 mm de pluie annuelle, le hêtre à quarante ans passe
  de 11,5 à 11,9 m. Quarante centimètres. L'eau ne le bridait pas — son
  `pousseMaxMAn` de 0,45 m/an le bridait, et la hauteur suit ce plafond presque
  linéairement (0,45 → 11,5 m ; 0,60 → 15,0 ; 0,75 → 18,0). Ce paramètre n'était
  d'ailleurs sourcé nulle part : **l'atlas de référence ne contient aucune
  donnée de croissance**, seulement des traits écologiques. Les vitesses ont été
  inventées pendant le développement.
- ~~**Le bouleau dépasse la meilleure classe publiée**, et il devance l'aulne à
  tort.~~ **Écarté après vérification de la source.** La seule table de bouleau
  du corpus est Braastad 1967, *Produksjonstabeller for bjørk* — **norvégienne**,
  donc boréale. La transposer à un bocage à 11,5 °C de moyenne serait une erreur
  de catégorie, et en tirer un rang contre un aulne calé sur une table allemande
  (Mitscherlich 1945) en serait une seconde : on comparerait deux climats, pas
  deux essences. Le bouleau reste donc à 0,9 m/an — une estimation, mais une
  estimation honnête, et il est sorti du tableau de calage. Ce n'est pas une
  décision de confort : ralentir le bouleau sur cette autorité-là cassait cinq
  conclusions écologiques du dépôt sans qu'aucune preuve ne l'exige. *(À
  confirmer : il manque une table française ou allemande de bouleau.)*
**Un calage n'est pas une validation, et le dire change la façon de tester.**
Le moteur n'a pas de notion d'indice de fertilité : caler une essence sur une
classe de table oblige donc à décréter qu'une station la représente — ici, le
limon riche VAUT la classe médiane. Une fois ce choix fait, un essai qui
compare à la table les espèces qu'on vient d'y caler ne prouve plus rien. D'où
le partage : **un seul paramètre par espèce ajusté, sur un seul âge (quarante
ans), et le second âge (vingt ans) laissé de côté**. Les hauteurs à vingt ans
ne sont donc pas un ajustement mais une prédiction de la forme de la courbe —
et elles tombent entre −13 % et +10 % des tables. C'est ce chiffre-là qui dit
quelque chose du moteur. Les trois essences non recalées (pin, aulne, frêne)
restent, elles, une validation à part entière aux deux âges.

### Vingt vitesses posées à la main, passées à la littérature

Le constat de la section précédente — « l'atlas de référence ne contient aucune
donnée de croissance, les vitesses ont été inventées pendant le développement »
— valait pour vingt fiches sur vingt-cinq. On les a toutes reprises, une par
une, avec une règle et une méthode.

**La règle est géographique**, et c'est la leçon du bouleau : une mesure n'est
recevable que si elle vient d'un climat tempéré océanique ou semi-continental
comparable au nord de la France — France, Belgique, Pays-Bas, Allemagne de
l'Ouest, sud de l'Angleterre, et nord de l'Espagne pour les méditerranéennes.
Sont écartées, explicitement et en le disant : la Scandinavie, l'Amérique du
Nord, la Nouvelle-Zélande (où l'ajonc est étudié comme invasive), la haute
montagne, le bassin méditerranéen sec.

**La méthode est celle déjà établie** : un seul paramètre ajusté, sur un seul
âge, le reste tenu à l'écart. Résultat : **une seule valeur a bougé.**

| Espèce | Avant | Après | Référence retenue (pays) | Statut |
|---|---|---|---|---|
| Charme | 0,40 | **0,53** | Lockow & Lockow 2009, première table de production du charme, bonité médiane HO100 = 25 m (Brandebourg) | **CALÉ** sur 16,3 m à 40 ans |
| Châtaignier | 0,65 | 0,65 | Lemaire 2005, faisceau des taillis, publié par le CRPF IDF-Centre (France) | VALIDÉ : 19,0 m simulés contre ~18,7 |
| Genêt à balais | 0,50 | 0,50 | Waloff & Richards 1977, via la *Biological Flora* 2025 (Londres) | VALIDÉ : 1,55 et 2,26 m contre 1,60 et 2,20 |
| Houx | 0,15 | 0,15 | Peterken & Lloyd 1967 (Grande-Bretagne) | VALIDÉ : 2,02 m à 10 ans contre 1,5-3,0 m à 8-15 |
| Fusain | 0,30 | 0,30 | Willoughby 2007, plantations des Midlands (Angleterre) | VALIDÉ : 29 cm/an contre 27 |
| Aubépine | 0,30 | 0,30 | Grubb 1999 et Willoughby 2007 (Angleterre) | ENCADRÉ : 28,4 cm/an dans la bande 28-37 |
| Ajonc | 0,45 | 0,45 | Hornoy 2011, jardin commun près de Rennes (Bretagne) | ENCADRÉ : 118 cm à 2 ans contre 110-130 |
| Callune | 0,12 | 0,12 | Schellenberg 2021 (Allemagne du Nord), classes JNCC (R.-U.) | ENCADRÉ : 6 cm/an de hauteur sous 10 cm/an d'allongement |
| Noisetier | 0,60 | 0,60 | Harmer 2004, taillis du Hampshire (Angleterre) | ENCADRÉ, mais sur des REJETS de cépée |
| Pommier | 0,50 | 0,50 | LfL Bayern 2022 et guides de pré-verger (Allemagne) | ENCADRÉ : 7,6 m à 40 ans contre 7,5 m mesurés (10-70 ans) |
| Sureau | 0,90 | 0,90 | Gilbert 1991, via Atkinson 2002 (Angleterre) | PLANCHER seulement : 37 cm/an sur gravats, le moteur en fait 58 |
| Cornouiller mâle | 0,25 | 0,25 | catalogues de pépiniéristes allemands | 24-26 cm/an dans la fourchette 10-30 — du commerce, pas de la mesure |
| Ronce | 1,40 | 1,40 | bases horticoles allemandes | plafond à 2,5 m en trois ans, cohérent avec 1-3 m |
| Abricotier | 0,50 | 0,50 | fiche RHS (Royaume-Uni) | 4-8 m en 10-20 ans : le moteur y est, mais c'est une base horticole |
| Troène | 0,35 | 0,35 | Grubb 1999 (Angleterre) | ORDINAL seulement : « groupe rapide », devant le fusain |
| Prunellier | 0,40 | 0,40 | — | ORDINAL seulement (même essai) : **reste inventé** |
| Chêne pubescent | 0,35 | 0,35 | — | **reste inventé** : aucune table hors Roumanie, Croatie, Provence |
| Saule blanc | 1,20 | 1,20 | — | **reste inventé** : aucune table de saule de plein vent nulle part |
| Chêne-liège | 0,30 | 0,30 | Sánchez-González 2010 (Espagne, Tunisie) | **NON VÉRIFIABLE** : pas de station méditerranéenne au moteur |
| Arbousier | 0,25 | 0,25 | Asensio 2008, plantation en Galice (nord de l'Espagne) | première année seulement : 25 cm/an contre 29-42 mesurés |

**Le charme était sous TOUTES ses références, et c'est ce qui a décidé.** La
seule table qui existe pour lui vient du Brandebourg, plaine subcontinentale
plus sèche que le bocage — géographie à décoter, donc. Mais l'équivalence que
le CNPF (2025) recommande pour le charme français, les tables *néerlandaises*
de chêne, donne 15,4 m à quarante ans, à 6 % de la table allemande. Le moteur
était à 13,4 m, sous les deux : le monter ne demande pas de choisir une source
contre l'autre. Sa hauteur à vingt ans, tenue à l'écart du calage, tombe alors
à **−2,7 %** de la table.

**Trois pièges que la littérature signale, et qu'on aurait mangés sans elle.**

1. **Les courbes de châtaignier sont des courbes de TAILLIS.** Un rejet de
   souche part sur un système racinaire déjà fait ; le moteur, dont la forme de
   croissance dépend de la taille et non de l'âge, ne sait pas rendre cette
   avance. On ne compare donc pas le châtaignier à vingt ans — on vérifie le
   SIGNE de l'écart (le semis simulé doit rester derrière, et il l'est :
   10,5 m contre 13).
2. **Un turion de ronce s'allonge de trois à six mètres par saison, et la
   roncière fait un mètre cinquante.** Les cannes s'arquent et se marcottent :
   l'allongement n'est pas un gain de hauteur. Caler la ronce sur le premier
   chiffre l'aurait rendue trois fois trop haute.
3. **Un chiffre de *Biological Flora* attribué à la Grande-Bretagne peut venir
   de Catalogne.** La monographie 2025 du genêt donne « 80 cm à 24 mois, 210 cm
   à 63 mois » comme britannique ; la source primaire (Paynter 2003) n'a de
   placettes européennes qu'en Catalogne et dans les Cévennes. C'est la même
   erreur que Braastad, en plus discrète — vérifier la géographie veut dire
   remonter d'un cran.

**Ce que la confrontation a révélé du moteur, et qui n'était pas cherché.**

- **Tous les semis naissent à trente centimètres** (`SEEDLING_HEIGHT_M`,
  regeneration.ts), plantations comprises. Pour un chêne, c'est un plant de
  pépinière ; pour la callune, dont la hauteur adulte est de soixante
  centimètres, c'est la moitié de sa taille finale — la callune du jeu saute sa
  phase pionnière, celle qui dure six ans dans la nature. Sa vitesse n'est pas
  en cause ; la hauteur de semis unique l'est *(à confirmer : il faudrait la
  dériver de la taille adulte)*.
- **Le houx et le châtaignier meurent sur le limon riche.** Il titre pH 7,0 en
  surface, et leurs gammes s'arrêtent à 7 et 6,5. C'est cohérent avec leur
  autécologie — ce sont des calcifuges — mais cela veut dire que la station
  phare du dépôt ne peut pas les héberger, et que les mesurer demande un limon
  ACIDE, que `hauteurs.test.ts` construit pour eux.

**Le coût est resté tenu** : l'essai passe de 110 à **112 secondes** en
gagnant six espèces et sept assertions. Deux leviers, aucun compromis sur la
statistique (toujours huit sujets × deux graines) : la mémoïsation des parties
— le hêtre servait trois fois, il n'est calculé qu'une — et des jalons courts,
un arbuste dont la mesure de terrain s'arrête à cinq ans ne coûtant plus une
partie de quarante ans.

### L'exposant de forme se déduit de la longévité

Les tables de production distinguent trois profils de croissance en hauteur —
démarrage rapide et plateau précoce (aulne, bouleau, merisier), démarrage lent
et croissance longue (hêtre, chênes, sapin), intermédiaire (frêne, pin,
douglas) — qu'un exposant unique ne savait pas rendre.

Plutôt qu'un exposant par fiche, qui serait un réglage libre de plus, on le
**déduit de la longévité**, déjà dans l'atlas. Et la correspondance n'est pas
une commodité : les trois profils des tables sont exactement les trois classes
de longévité. Un arbre qui vit un siècle ne peut pas se permettre d'attendre
pour occuper l'espace ; un chêne de quatre siècles le peut, et c'est la même
stratégie qui fait son bois dense et son ombre profonde. La courbe de
croissance et la durée de vie sont deux faces du même arbitrage.

**Ce que ça corrige** : le hêtre passe de +6 % à **+1 %** de la table à vingt
ans — et cette hauteur-là est tenue à l'écart du calage, donc c'est une
prédiction qui s'améliore, pas un ajustement.

**Ce que ça ne corrige pas, et je l'ai vérifié plutôt que supposé** : l'aulne
reste 13 % sous la table à vingt ans alors qu'il y est à quarante. En le
forçant au profil le plus front-chargé possible (exposant 1,05), il DESCEND à
10,2 m au lieu de 10,9. Son retard de jeunesse vient donc de son plafond de
pousse, qui n'est calé sur aucune table — comme vingt autres de l'atlas.

**Et ça a réveillé un défaut du feu, corrigé depuis.** En changeant la vitesse
de l'ajonc, un essai de conservation du carbone s'est mis à ne plus trouver
d'incendie du tout. En creusant, deux vrais défauts — voir la section suivante.

- **L'exposant de forme est global.** Les tables distinguent trois profils —
  démarrage rapide et plateau précoce (aulne, bouleau, merisier, robinier),
  démarrage lent et croissance longue (hêtre, chênes, sapin), intermédiaire
  (frêne, pin, douglas) — qu'un paramètre unique ne sait pas rendre. C'est
  pourquoi l'aulne reste un peu lent en jeunesse et le bouleau un peu vif.
### Le frein d'azote : une rampe là où il fallait une saturation

C'était le dernier défaut physique connu et non traité, et il était double.

**L'échelle.** Le frein s'écrivait `min(1, stock / 3 g/m²)` : au-delà de 30 kg
N/ha, plus de bridage. Or un sol forestier ne porte jamais 30 kg N/ha de
minéral en même temps — le nôtre plafonne à 1,9 g/m² sur le limon riche et 0,5
sur la lande. **Le frein était donc actif en permanence, partout, sur toutes les
stations** : jamais une racine ne prélevait librement.

**La forme.** Un prélèvement racinaire sature, il ne monte pas linéairement
jusqu'à un couperet. Et la mesure de terrain dit mieux : dans neuf forêts
tempérées suivies sur une saison (Nadelhoffer et al., *Plant and Soil*), le
nitrate est prélevé à un rythme RÉGULIER alors que les stocks d'ammonium et la
minéralisation nette fluctuent fortement d'un mois sur l'autre. L'arbre vit du
FLUX qu'il intercepte ; le stock debout est petit parce que le prélèvement est
rapide. Brider le prélèvement à proportion du stock inverse la causalité.

Michaelis-Menten, donc, avec une demi-saturation à 0,5 g/m² — 5 kg N/ha, le bas
de la gamme observée. **Le changement a été soumis à une réfutation avant d'être
retenu** : les trois essences dont la vitesse n'est PAS calée sur les tables
(pin, aulne, frêne) auraient dû se mettre à les dépasser si le frein compensait
autre chose. Elles restent à +6 %, +1 % et +2 % à quarante ans. Le hêtre, seul
calé, voit son plafond redérivé de 0,65 à 0,57 — et sa hauteur à vingt ans,
tenue à l'écart du calage, s'AMÉLIORE au passage (8,2 m contre 8,5, pour 7,7
dans la table).

Le contraste entre stations, lui, tient : le frein vaut 0,76 sur limon riche
contre 0,51 sur limon pauvre, et un hêtre de trente ans y fait 12,3 m contre
8,0. L'azote n'est pas devenu décoratif.

**Cinq conclusions du dépôt ont changé, et une seule est une mauvaise
nouvelle.**

1. *La fertilisation par l'aulne est RETARDÉE, pas morte.* À seize ans — huit
   ans après la coupe — épandre vaut 0,99 fois vendre. Ce n'est pas une panne,
   c'est la **faim d'azote** du broyat : le bois raméal a un C/N élevé, les
   décomposeurs puisent d'abord l'azote du sol pour bâtir leur biomasse. À
   trente-cinq ans le gain est de **+9 %**, régulier sur quatre parties. Les
   mesures précédentes (+5 %, puis +2 %) lisaient le mécanisme pendant son
   creux. C'est la meilleure surprise de ce chantier.
2. *Le pin sylvestre perd un tiers de ses tiges sur la lande sèche, de SOIF.*
   Plus vigoureux, il transpire plus, et le sable ne suit pas. Une mortalité
   d'un tiers en trente ans sur une lande n'a rien d'anormal ; c'est le test
   qui exigeait zéro mort.
3. *L'effet nurse s'inverse une seconde fois.* Abrité à trois mètres bat
   maintenant collé à la nurse, même pour un sciaphile : quand l'azote cesse de
   décider de tout, la concurrence pour l'eau reprend la main. C'est
   l'optimum de distance de la littérature sur les plantes nurses. Ce qui
   survit aux trois versions du test : abrité à bonne distance bat toujours
   découvert.
4. *Le noisetier non protégé sort de la dent un peu plus tôt* — 1,59 m à douze
   ans pour une dent à 1,50.
5. *Le prélèvement de potasse monte à 70 kg/ha/an* sur limon riche. Ce chiffre
   m'avait gêné ; **il tient**. Le piège est qu'on lit partout des valeurs bien
   plus basses — 3 à 16 kg K/ha/an sous une hêtraie — mais ce sont des RETOURS
   PAR LITIÈRE, pas des prélèvements : le potassium est le plus mobile des
   cations, l'arbre en retransloque une grande part avant la chute des feuilles
   et la pluie lessive le reste du feuillage avant qu'il ne tombe. Les bilans
   qui mesurent le prélèvement montent à 80 kg/ha/an en peuplement feuillu
   productif. *(À confirmer : pas de bilan français de hêtraie directement
   citable, seulement des ordres de grandeur concordants.)*

- **Le vrai réglage du frein d'extraction est ailleurs.**
  `AVAILABILITY_SATURATION_G_M2` = 3 g/m², soit 30 kg N/ha, est le stock
  au-dessus duquel une racine prélève sans entrave. Un sol forestier n'en tient
  jamais autant : le nôtre plafonne à 1,9 g/m² sur le limon riche et 0,5 sur le
  limon pauvre. Ce seuil est donc trop haut, et il vit dans `nitrogen.ts` — hors
  du périmètre de ce chantier. On ne l'a pas touché.
- **Le lessivage reste énorme** — 55 à 75 kg N/ha/an — mais c'est un artefact du
  protocole d'essai : douze arbres sur un hectare ne couvrent que 2 % du sol de
  leurs racines, et tout le reste draine. Un peuplement fermé n'a pas ce
  comportement.
- **Deux essences sans référence** : le châtaignier meurt sur le limon riche
  (pH 7, il est acidiphile) et n'a de toute façon aucune table de futaie en
  France ; le chêne pubescent n'a **qu'une seule** table au monde (Giurgiu &
  Draghici 2004, Roumanie), et le CNPF écarte explicitement l'équivalence avec
  le chêne sessile, qui surestime.

**Ce que la correction a coûté**, c'est-à-dire les conclusions qu'elle a
changées :

- **L'effet nurse a changé de verdict.** On lisait « collé à la nurse, l'abri et
  l'ombre s'annulent » — 0,38 m collé contre 0,39 m à découvert. C'était
  l'égalité de deux zéros : l'azote bridait tout le monde à 0,4 et rien ne
  poussait, ni à l'abri ni au soleil. L'essai mesure maintenant ce qu'il
  prétendait mesurer, et il retrouve ce que son propre en-tête annonçait : le
  chêne-liège tolère l'ombre en jeunesse, donc **plus il est près de la nurse,
  mieux il pousse** (0,53 m collé, 0,44 m à trois mètres, 0,37 m à découvert).
  L'héliophile, lui, paie toujours l'ombre.
- **La fertilisation par l'aulne rapporte moins.** Le gain du hêtre voisin
  quand on épand les aulnes coupés au lieu de les vendre est passé de +5 % à
  +2 %. Le mécanisme tient ; c'est son ampleur qui était gonflée par un hêtre
  affamé en permanence.
- **Le creux mycorhizien de la première décennie a disparu.** Les bouleaux
  couvrent le sol en dix ans au lieu de vingt, et le réseau se tisse plus vite
  qu'il ne reflue. Ce n'était pas un fait de terrain, c'était la signature
  d'arbres trois fois trop lents.

## Les chandelles : un arbre mort ne disparaît pas

Un arbre tué par la sécheresse quittait la parcelle le tick même. Un tronc mort
sèche pourtant sur pied et tient des années, il occupe la place, et c'est le
bois mort **debout** qui compte pour la faune : les pics l'attaquent en premier,
et le trou qu'ils abandonnent sert ensuite à des dizaines d'espèces qui ne
savent pas creuser.

Une chandelle tient d'autant plus longtemps que son bois est dense — une
décennie pour un chêne, trois ans pour un sureau. Elle ne fait plus d'ombre,
compte comme arbre-habitat au-dessus de huit mètres, et charge le feu **×1,4**
par rapport au même arbre vivant : c'est du bois sec, et c'est pourquoi une
parcelle déjà passée au feu rebrûle mieux que celle d'à côté.

Le transfert de carbone a lieu à la MORT et une seule fois : la chandelle n'est
ensuite qu'un objet de jeu et d'habitat. C'est ce qui a permis d'ajouter le
mécanisme sans toucher aux bilans.

### Et quand elle tombe : le bois couché

La chandelle finissait par quitter la parcelle sans rien laisser, son bois
dissous dans un pool global indifférent à l'endroit où l'arbre avait vécu.
C'est deux fois faux. Un tronc s'abat **quelque part**, dans une direction ; et
ce qu'il devient — humus, abri, obstacle à l'eau, écrasement de ce qui poussait
dessous — se joue sur les quelques mètres carrés qu'il recouvre, pas sur la
parcelle entière.

Le bois mort **au sol** est désormais un stock par cellule, distinct du bois
debout, parce que ce sont deux objets différents :

| | debout | couché |
|---|---|---|
| décomposition | 5 %/an | **9 %/an** — il touche la terre et reste humide |
| humus | dilué sur la parcelle | **sur place**, sous le tronc |
| faune | pics, puis tout ce qui occupe leurs loges | carabes, salamandres, saproxyliques du sol |
| sol | rien | protège la terre sous lui comme un paillage — et **barre l'eau** s'il est en travers (voir plus bas) |

La direction de chute suit l'aval, d'autant plus franchement que la pente est
raide : au-delà de 30 %, la gravité tranche ; à plat, l'arbre tombe où son
défaut le porte. Une seule formule, resserrée par la pente, plutôt qu'un cas
« pente » et un cas « plat » — et le test compare deux nuages de deux cents
tirages, parce qu'une chute unique ne prouverait rien.

Ce qui poussait dessous casse selon une règle de masse : **ce qui reçoit plus
lourd que soi casse**. Un semis disparaît sous n'importe quel tronc, un arbre
fait encaisse, et aucun seuil par espèce n'est écrit nulle part — la masse des
deux protagonistes se lit déjà dans leur carbone.

*Approximation assumée* : le pool des morts debout ne sait pas quel bois
appartient à quel arbre. Ce qu'une chandelle dépose en tombant est donc
**estimé** par sa décroissance depuis sa mort, borné au pool restant. La borne
garantit qu'aucun carbone n'est créé ; en revanche, si le pool a été entamé
ailleurs, la chute dépose moins qu'elle ne le devrait. Le test de conservation
compte maintenant le bois couché parmi les stocks, sans quoi une chute aurait
fait apparaître du carbone venu de nulle part.

Le bois couché est enfin du **combustible**, et pas le même que l'herbe : le
gros bois s'allume mal et porte mal le front, il fait durer et chauffer plutôt
que courir. Il pèse donc moins par unité de masse et sature bien plus haut —
un tronc dépose des kilos de carbone sur son mètre carré là où la litière s'y
compte en centaines de grammes.

D'où une décision, plutôt qu'un réglage : **ramasser le bois mort**. Le joueur
y gagne du chauffage — décoté de moitié, un tronc piqué ne vaut pas une bille
fraîche — et un peu moins de gros combustible. Il y perd de l'humus en devenir,
un abri pour la faune du sol, et la protection que le tronc offrait à la terre
sous lui. Le moteur ne tranche pas à sa place ; il fait seulement que les deux
plateaux existent.

**Le flux aléatoire de la chute est séparé du flux principal**, et c'est une
leçon plus large que le bois mort. Le hasard du moteur est une suite unique et
séquentielle : un mécanisme qui y ajoute un seul tirage décale tous les
suivants. Le jour où les chandelles ont commencé à tirer un angle, trois
conclusions écologiques du dépôt ont basculé — l'aulnaie décimée par les
ravageurs, le hêtre qui meurt de soif, les feuillus qui brûlent moins. Aucune
n'avait changé de nature : elles lisaient un jet de dés particulier. La chute
tire donc désormais sur une graine dérivée de l'arbre et de la semaine, ce qui
la garde rejouable sans rebattre les cartes des autres. Et le test des
ravageurs, lui, moyenne sur trois graines au lieu d'en croire une.

### Le tronc en travers : il barre, ou il fait gouttière

Le tronc couché protégeait la terre **sous lui**, comme un paillage, et rien
de plus. Il manquait le mécanisme qui compte pour un versant : un tronc posé
en travers d'un thalweg **barre**. L'eau s'y met en flaque et a le temps de
rentrer dans la terre ; le sédiment se dépose derrière lui. C'est le principe
des *log erosion barriers* de la restauration après incendie, et c'est un des
rares leviers réels dont dispose un propriétaire contre le ruissellement de sa
parcelle.

Tout tient à l'**orientation**, et c'est pour ça qu'il a fallu ajouter un champ
plutôt qu'un coefficient : une masse de bois par cellule ne dit pas si le tronc
barre ou s'il fait gouttière.

**La grandeur retenue n'est pas de nous.** Adams, Dixon, Wilcox & McWethy
(2023, *Earth Surface Processes and Landforms* 48 : 1665-1678), reprenant
Myronidis et al. (2010), définissent la **longueur efficace** d'un tronc
Lₑ = sin φ × L, où φ est l'angle entre son axe et la direction de l'écoulement.
C'est exactement la projection du tronc sur la courbe de niveau. Et leurs
essais sur table basculante — dix-huit passages, six orientations, trois
inclinaisons — donnent le **seuil** : *aucune* accumulation derrière un tronc
orienté à moins de 30° du courant, rien du tout sous 15° de la ligne de plus
grande pente. Smith & Swanson (1987) disent la même chose sur le terrain, au
mont Saint Helens : plus de 90 % des troncs qui stockent quelque chose font au
moins 45° avec l'écoulement. Le sol retient donc, par cellule, la moyenne
pondérée par les masses de cette efficacité barrante — pas un simple sinus, un
sinus **seuillé tronc par tronc**, parce que deux troncs à 25° ne barrent rien
alors que leur moyenne, elle, ne serait pas nulle.

**Deux effets distincts, et il ne faut pas les confondre.**

| | ce qui se passe | où c'est branché |
|---|---|---|
| l'eau | une part du ruissellement qui traverse la cellule est mise en flaque, puis **offerte au sol** ; ce que le sol ne prend pas percole vers la **nappe** | avant le calcul d'érosion, donc moins de lame ⇒ moins d'arrachement |
| la terre | une part du sédiment en transit se **dépose derrière le tronc**, sur sa propre cellule, avec toute sa charge (humus, litière, N, P, K) | après l'arrachement, avant le passage à l'aval |

Le passage à la nappe n'est pas un artifice comptable, c'est le mécanisme même :
un tronc ne **supprime** pas l'eau, il la **retarde**. Ce qui courait en surface
et traversait la parcelle dans la semaine devient de l'eau de nappe, qui met des
mois à rejoindre l'aval. C'est cela, hydrauliquement, « lutter contre une
inondation ». À un pas de temps hebdomadaire on ne sait pas représenter le
décalage du pic lui-même — seulement le volume qui change de chemin.

**La capacité, et c'est elle qui empêche le mécanisme d'être une baguette
magique.** Le coin amont d'un tronc contient un volume fini, donné par
l'équation (3) d'Adams et al. :

    S = (d·Lₑ/2) · (d/tanθ − πd/4)

un coin triangulaire de hauteur *d* (le diamètre du tronc) qui remonte d/tanθ
vers l'amont, moins le demi-cylindre qu'occupe le tronc. On n'a rien choisi là
non plus, et deux conséquences en sortent seules : **plus la pente est raide,
moins le tronc retient**, et au-delà de 127 % de pente il ne retient plus rien
— le tronc surplombe son propre tas. Le volume obtenu, 0,065 m³ par mètre
efficace à 40 % de pente, est du bon ordre : Wagenbrenner, MacDonald & Rough
(2006) mesurent 0,049 m³ par mètre efficace sur 210 troncs du Colorado ;
Robichaud, Pierson, Brown & Wagenbrenner (2008) 0,020 m³ par mètre posé.

Ce coin géométrique est ensuite **ramené à 30 %**, parce que le terrain dit
qu'il ne sert jamais en entier. Robichaud et al. (2008) sont formels : « runoff
and sediment were observed going over the top and around the ends of the
barriers **even when the barriers were less than half filled** » — sur
vingt-neuf franchissements observés, trois seulement portaient sur un barrage
plein. Leur pluie simulée n'a mobilisé que 7 % de la capacité des troncs.
Enfin, le coin **s'ensevelit** : le colluvium accumulé sur la cellule se lit
déjà dans l'état (`epaisseurPerdueCm` négative), et quand il atteint le haut du
tronc, le tronc ne sert plus. Aucun champ nouveau pour cela.

**Ce que ça donne, mesuré.** Versant nu à 25 %, vallon, 0,5 ha d'amont, une
ligne continue de billes en bas de pente, cinq ans, moyenne de cinq graines :

| | eau de surface sortie | terre exportée |
|---|---|---|
| pas de bois | 1133 mm | 1,96 kg/m² |
| bois **dans le sens de la pente** | 1133 mm | 1,92 kg/m² |
| bois **en travers** | 1095 mm (**−3,4 %**) | 1,75 kg/m² (**−11 %**) |

La ligne du milieu est le résultat qui compte : à masse égale, à paillage égal,
le bois couché dans le sens de la pente ne détourne **pas une goutte** et ne
retient **pas un gramme**. Les 2 % qu'il gagne quand même sur la terre sont
l'ancien effet de paillage, qui lui se moque de l'orientation.

**Et le plafond fonctionne.** Sur la même parcelle, en faisant grossir le
bassin d'amont — donc la crue :

| bassin amont | terre exportée en moins |
|---|---|
| 0,5 ha | −11 % |
| 12 ha | −4 % |

C'est exactement ce que trouvent Robichaud et al. (2008, *International Journal
of Wildland Fire* 17 : 255-273) sur six paires de bassins suivis quatre à six
ans : un effet sur les petites pluies, **aucun effet au-delà du temps de retour
deux ans**. Trois troncs n'arrêtent pas une inondation, et le moteur le dit
maintenant tout seul.

**La conséquence gênante, et elle tient — moins fort qu'annoncé.** La chute
suit l'aval d'autant plus franchement que la pente est raide, donc **là où
l'érosion fait le plus de dégâts, le chablis naturel sert le moins**. Mais
l'ampleur a été corrigée à la baisse le jour même : le modèle affichait une
transversalité **nulle** au-delà de 30 % de pente, et ce zéro était un artefact
de forme — la contrainte de pente atteignait exactement 1 et alignait tous les
arbres au cordeau. Aucune forêt ne fait ça. Rentch et al. (*J. Torrey Bot.
Soc.* 137, huit peuplements de chênes anciens) concluent que « la forte
variation des directions de chute » empêche d'établir une relation constante
avec la pente ou le vent, l'asymétrie du houppier s'en mêlant ; côté ripisylve,
la tendance vers l'aval ne devient nettement plus marquée qu'**au-dessus de
40 %** de pente — d'où ce seuil, qui valait 30 sans source.

Avec une dispersion résiduelle de ±63°, la transversalité passe de 0,37 à plat
à 0,27 sur un versant à 60 % : **un quart de barrage en moins, pas la
disparition du barrage**. Le conseil de gestion ne change pas — abattre sur
courbe de niveau reste le geste qui arme un versant, et c'est celui de la
restauration post-incendie — mais un versant raide n'est plus décrit comme nu.
Sur un versant doux à 15 %, le bois mort d'un peuplement laissé à lui-même est
barrant à 37 % en moyenne et détourne 3,9 % de l'eau de surface.

Le TONNAGE piégé, lui, dépend d'abord de ce que le versant a à donner :
1,6 kg/m² sur soixante ans avant que les vitesses de croissance ne soient
calées sur les tables de production, 0,8 après. Ce n'est pas le mécanisme qui a
faibli, c'est la forêt qui, poussant à son rythme réel, couvre plus vite et
laisse moins partir. **Un piège ne retient que ce qui passe.**

**Un tronc qui ne touche pas le sol ne barre rien**, et c'est ce qui sépare
l'accident du geste. Un chablis tombe avec son houppier et repose dessus :
l'eau passe dessous. Un suivi boréal sur cinq saisons de végétation (Šamonil et
al., *PLoS ONE*, « Surface covering of downed logs ») mesure le contact
longitudinal à **4,4 points sur 7 pour un tronc sans branches contre 1,6 pour
un tronc qui en a gardé** — « structural support delays settling ». Presque
trois fois moins, et Adams et al. donnent d'ailleurs une capacité de stockage
NULLE en classe de décomposition I : le bois frais ne barre pas.

Le champ d'orientation compte donc maintenant deux choses et non une : la
direction du tronc ET son contact au sol. Conséquence, et elle change le sens
du mécanisme : **une forêt livrée à elle-même arme mal son versant**. Le bois
mort naturel d'un peuplement de soixante ans est barrant à 0,13 au lieu de 0,37,
et piège quatre fois moins de terre. Ce n'est pas une mauvaise nouvelle pour le
jeu, au contraire : c'est ce qui donne son sens au geste ci-dessous.

*(Simplification assumée : le contact est figé au dépôt alors qu'il croît avec
les années — le tronc s'enfonce, la mousse le recouvre. Les toutes premières
années d'un chablis sont donc surestimées, ce qui joue sur cinq ans dans une
partie qui en dure deux cents.)*

**Et le joueur peut enfin armer son versant.** Le mécanisme existait sans
qu'aucune action ne permette de s'en servir : couper un arbre, c'était le
vendre, le broyer ou l'épandre — dans les trois cas le fût quittait le sol. Or
la restauration post-incendie ne fait pas autre chose qu'abattre et **coucher
en travers**. D'où un quatrième devenir, `laisser` : le fût reste sur place,
posé perpendiculairement à la plus grande pente. Ça ne rapporte rien, ça coûte
un quart de travail en moins que d'aller chercher le bois (on abat, on ébranche
pour que le tronc porte au sol — sans ce contact il ne barre rien — et on
s'arrête là), et c'est le seul geste qui arme un versant. Le moteur suppose que
celui qui choisit de laisser le bois le pose correctement : on ne simule pas la
maladresse *(hypothèse assumée)*.

**Un bug attrapé au passage, et il valait le voyage.** `versLAval` indexait le
champ d'altitudes avec les coordonnées **flottantes** de l'arbre. L'index
tombait entre deux cases, le tableau rendait `undefined` pour les quatre
voisines, la pente sortait nulle — et la chute était donc **tirée au hasard sur
un versant à 60 % comme à plat**. Le mécanisme d'orientation existait sur le
papier et ne s'était jamais déclenché en partie. Le test unitaire ne pouvait
pas le voir : il appelait la fonction avec des entiers.

*Ce qui reste faux* :

- **Le contact au sol n'est pas modélisé.** Un chablis frais repose sur ses
  branches et surplombe la terre : Adams et al. décrivent une capacité de
  stockage nulle en classe de décomposition I, maximale en classe III quand le
  tronc s'est affaissé au ras du sol. Le moteur suppose le contact acquis dès
  la chute, donc il est **trop généreux les premières années**.
- **Le pic de crue n'est pas décalé, seulement réduit en volume.** C'est
  pourtant l'effet principal d'un obstacle sur une inondation. Un pas de temps
  hebdomadaire ne sait pas le porter.
- **Au-delà de 30 % de pente, la transversalité tombe à zéro exactement**,
  parce que `directionDeChute` aligne alors la chute sur l'aval sans dispersion
  résiduelle. La vraie forêt garde de la dispersion, et donc quelques troncs
  utiles même sur un versant raide *(à confirmer)*.
- **La part utile du coin (30 %) est la constante la plus fragile du lot** :
  elle décide à elle seule de la force du mécanisme, et elle est calée sur une
  seule campagne de mesure.
- **Aucune littérature ne donne de rugosité de Manning mesurée pour un tronc
  couché sur un versant.** C'est pourquoi le tronc est traité ici comme un
  réservoir fini à seuil de débordement, et non comme une rugosité — ce que
  fait aussi WEPP, qui note explicitement qu'il ne modélise pas la formation
  des barrages de débris.

## Le calendrier des fleurs : on ne récolte pas l'ajonc

Le moteur savait qu'un arbre fleurit — il en tirait un gel tardif et un fruit.
Il ne savait pas que cette fleur NOURRIT quelqu'un, ni que ce quelqu'un doit
manger le reste de l'année pour être là le jour venu.

### Le verrou était un découpage, pas un mécanisme manquant

La date de floraison vivait dans le bloc `fruits`, réservé aux essences dont on
récolte quelque chose. Onze espèces en portaient une. Sept qui nourrissent
réellement les pollinisateurs n'en avaient **aucune** : aubépine, saule blanc,
ajonc, genêt, callune, houx, fusain.

Ce ne sont pas des oublis de saisie, c'est la conséquence du découpage. L'ajonc
fleurit de décembre à juin et la callune en août ; à eux deux ils nourrissent
les abeilles d'une lande atlantique presque toute l'année, et le moteur n'en
savait rien **parce qu'on n'en récolte rien**. Le saule est la ressource de
sortie d'hiver, l'aubépine la nappe blanche de mai — entre le pommier (fin
avril) et la ronce (juin), le calendrier ne connaissait que le noyer, qui est
anémophile. Bâtir la ressource florale là-dessus aurait fabriqué des trous qui
n'existent pas.

### Le nectar est le contenu du lot

Le champ vaut **zéro pour le noisetier et le noyer**. Ils fleurissent
abondamment, leur pollen part au vent, aucun insecte ne se déplace pour eux — et
`indiceBiodiversite` les comptait comme une ressource. Une noiseraie affichait
des floraisons étalées sans nourrir personne. Deux des trois herbacées sont dans
le même cas : ce sont des graminées, et c'est pourquoi la strate basse
n'apporte ici que sa vernale.

La **durée** sépare de la même façon une ressource ponctuelle d'une ressource de
fond : l'abricotier passe en dix jours, l'ajonc tient six mois. La constante
unique de 100 °C·j ne savait pas le dire.

### Le témoin est le résultat

Neuf pommiers, vingt-deux ans, trois graines, trois voisinages. Les deux haies
sont rigoureusement comparables — même nombre de tiges, mêmes espèces
mellifères, même couvert, même habitat ; seul le calendrier change.

| voisinage | récolte | ressource florale au centre |
|---|---|---|
| aucun | 255,6 kg | 0,029 |
| haie fleurissant **toute en mai** | 263,4 kg — +3,1 % | 0,059 |
| haie fleurissant **de février à l'automne** | **327,6 kg — +28,2 %** | 0,159 |

C'est le calendrier qui travaille, pas la présence de voisins.

### Deux grandeurs fausses, que seule la mesure pouvait dire

**La ressource mesurait une quantité, pas une adéquation.** `min(habitat,
florale)` prétend arbitrer entre un gîte et une table ; mesuré, l'habitat
tournait à 0,5 et la ressource à 0,10 dans le meilleur cas. Le minimum ne
départageait donc rien, il remplaçait silencieusement l'habitat — un facteur de
moins, pas un de plus. Un seuil d'adéquation la rend sans dimension : la mémoire
devient « quelle part de la saison cette cellule a-t-elle eu de quoi nourrir »,
ce qui est comparable à l'habitat, et ce qui est aussi, mot pour mot, ce que J6
appelle « sans rupture ».

**Et le nectar ne portait pas plus loin qu'un houppier.** Même après le seuil,
la ressource plafonnait à 0,15 au centre du verger : la haie est à seize mètres
et un disque d'aubépine fait quatre mètres, donc elle ne comptait pour rien.
Le moteur avait pourtant déjà appris cela et l'avait écrit — `ravageurs.ts`,
`BLOC_AUXILIAIRES_M` : « les auxiliaires ne perçoivent pas leur environnement au
mètre carré ; évaluer la richesse cellule par cellule donnait toujours une seule
essence ». La ressource florale reprend donc la même fenêtre, qui est de surcroît
celle de l'habitat avec lequel on la compare.

### Ce que ça coûte, et une mesure qui a failli mentir

**+6 % de temps par semaine simulée** (8,02 → 8,52 ms, hêtraie-aubépine 30 × 30
de quarante ans, médiane de cinq passes). Le premier relevé annonçait +30 %, et
il était faux : l'étalon avait été mesuré dans un ARBRE DE TRAVAIL SÉPARÉ, avec
son `node_modules` en lien symbolique. Ce seul changement d'environnement
déplaçait le chiffre de 25 % — cinq fois l'effet cherché. Mesuré dans le même
répertoire, avec le même script, l'écart tombe à +6 %, et il recoupe exactement
le témoin par neutralisation du bloc (+0,43 ms). **Un étalon de temps mesuré
ailleurs n'est pas un étalon.**

## Le réseau mycorhizien rendait moins que rien, et le bilan était exact

L'expérience « Planter dans un labour » du labo concluait que détruire 95 % du
réseau ne coûte rien aux plants. C'était vrai dans le moteur, et pour une raison
que personne ne pouvait deviner : le réseau ne rapportait pas, il **coûtait**.

### La mesure d'abord

Bouleaux en grille de vingt-cinq, vingt-cinq ans, **cinq graines**, avec pour
témoin le même banc dont la seule constante du mécanisme (`GAIN_ABSORPTION`) est
mise à zéro. Volume de tige du peuplement, écart au témoin :

| | limon riche | limon pauvre en N |
|---|---|---|
| le réseau, avant ce lot | **−0,72 %** | **−11,78 %** |
| le réseau, après | **+0,09 %** | **+2,79 %** |

Cinq graines sur cinq dans le même sens, aux deux stations. Et l'azote reçu par
les arbres suit : +0,7 % sur riche, +5,7 % sur pauvre — le gradient que
`tick.ts` promettait en toutes lettres (« il compte sur les sols pauvres et pas
sur les riches ») et qu'il produisait à l'envers.

### Le défaut n'était pas où l'issue le cherchait

L'issue supposait un mécanisme mal placé : un gain porté sur la fraction d'accès
à un pool minéral ne crée rien, il accélère une course. C'est vrai, mais ce
n'était pas la cause. Le prélèvement d'azote se fait en **deux passes** — une qui
déclare ce que chaque plante veut, une qui sert ce que la cellule a pu donner.
Le gain mycorhizien était appliqué dans la première et absent de la seconde :

```
passe 1   dispo = min(1, availFactor × gainMyco)     ← vide la cellule
passe 2   dispo = min(1,  availFactor           )     ← sert l'arbre
```

La cellule était donc vidée à hauteur d'une demande gonflée, et le partage servi
au prorata de cette même demande gonflée — mais chaque arbre réclamait sa part
sur une demande, elle, non gonflée. **L'écart sortait du sol et n'arrivait à
personne.** Mesuré sur le bilan complet : 11,6 % de l'azote prélevé sur limon
pauvre, 3,1 % sur limon riche. Avec `GAIN_ABSORPTION = 0`, exactement zéro sur
les quatre campagnes, au gramme près.

Pourquoi le sol riche s'en tirait : `min(1, availFactor × gain)` sature quand le
sol est riche, donc le gain n'y gonfle rien. Sur sol pauvre il gonfle à plein.
**Le mécanisme nuisait exactement là où il devait aider, et c'était
arithmétique.**

### Ce que le correctif fait, et ce qu'il ne fait pas

Le gain est désormais **rangé une fois par arbre** (`gainMyco[t]`, à côté de
`rootCells` et `rootFractions`) et relu par les deux passes. Ce n'est pas un
détail d'écriture : le défaut était que la même grandeur était calculée deux
fois, et la ranger fait que les deux passes ne PEUVENT plus diverger. La demande
d'azote du tapis herbacé est rangée pour la même raison.

**Le réseau fait maintenant gagner l'arbre, il ne crée toujours pas d'azote.**
Ce que les arbres reçoivent en plus vient du tapis (−5 % pour lui) et du
lessivage évité. C'est un service réel — un arbre mycorhizé prend de vitesse
l'herbe qui l'entoure — mais ce n'est pas le service que la littérature met en
avant : les hyphes atteignent l'azote **organique** et les pores où une racine
n'entre pas, ce qui ajoute au peuplement au lieu de redistribuer. Il y faudrait
un pool organique accessible, et c'est la moitié de l'issue que ce lot ne fait
pas. C12 le dit.

### Et le labo va changer d'avis

L'expérience « Planter dans un labour » conclura désormais que le labour coûte
quelque chose aux plants, ce qui est le fait qu'elle voulait montrer depuis le
début.

## Le port serré : le houppier suit le diamètre, pas la hauteur

Le rayon du houppier valait `houppierRatio × hauteur`, et rien d'autre. Une
perche étiolée de dix mètres et onze centimètres recevait donc le houppier d'un
dominant de dix mètres — un parasol sur un fil. Tant que l'ombre ne faisait pas
filer les dominés, ça ne se voyait pas ; depuis l'étiolement, si.

**Ce qui a rendu le manque mesurable.** `ravageurs.ts` épand la vulnérabilité de
chaque hôte sur le disque de son houppier. Quand #97 s'est mis à faire monter
les dominés, le moteur leur a attribué des couronnes de dominants — davantage en
mélange, où l'essence focale est plus ombragée — et l'effet protecteur du mélange
est tombé de 2,66–3,07 × à 1,88–2,24 ×. Une conclusion du dépôt perdait un tiers
de son amplitude à cause d'une formule, pas d'une écologie.

**La loi est celle du tube** (Shinozaki et al. 1964), la même qui gouverne la
charge d'entretien du budget carbone : la section d'aubier est proportionnelle à
la surface foliaire qu'elle alimente. Une couronne de rayon `r` et d'indice
foliaire `λ` porte `π r² λ` de feuille, alimentée par une section `∝ D²` — donc
**`r ∝ D`**. C'est aussi ce que font les forestiers depuis toujours : les tables
de largeur de houppier se lisent contre le DIAMÈTRE, jamais contre la hauteur.

**Et le lot est l'identité pour un arbre normalement conformé**, ce qui borne son
rayon d'explosion alors qu'il touche seize appels. Le rayon vaut exactement
l'ancienne formule quand la tige porte l'élancement d'une tige sans histoire
(`diametreInitialCm` pose `D = 2 h`, soit H/D 50) :

| H/D | 35 (au large) | 50 (référence) | 90 (perche) | 129 (extrême) |
|---|---|---|---|---|
| rayon / ancien | 1,43 × | **1,00 ×** | 0,56 × | 0,39 × |

Le gradient va dans le bon sens des deux côtés, et le côté « large » est un gain
qu'on n'avait pas cherché : un chêne isolé de vingt mètres porte enfin
vingt-cinq mètres de houppier, ce que l'ancienne formule ne savait pas produire.

### Ce que ça rend, et ce qu'on a choisi de ne pas emporter

L'effet mélange remonte à **2,79 / 2,53 / 2,35 ×** sur les trois graines. L'écart
qui subsiste avec l'origine est attendu et défendable : l'auto-éclaircie fait
qu'une aulnaie pure présente moins d'hôtes au pic.

**Les racines et la transpiration restent sur l'ancienne loi, délibérément.**
Qu'une tige dominée prospecte un disque racinaire plus petit et transpire moins
sont deux affirmations distinctes de la largeur de sa couronne. Les empiler ici
aurait rendu le lot immesurable — le disque racinaire commande l'eau et tous les
nutriments. C'est écrit dans le code à l'endroit où la tentation reviendra.

### Trois seuils qui enregistraient le moteur, remplacés par leur énoncé

Le lot déplace qui ombrage qui, donc il déplace la succession. Trois essais sont
tombés, tous marginalement, et aucun n'a été rattrapé par un seuil ajusté.

*La canopée pionnière à soixante ans* passe de 0,68 à 0,57. La cause est juste :
les pionniers sont des essences élancées — le bouleau le premier — et un bouleau
a bel et bien une couronne étroite quand un chêne de même hauteur l'a large. Mais
ce seuil avait **déjà descendu deux fois** (0,70 puis 0,65), ce qui est le signe
qu'il enregistrait le moteur. Il devient donc l'affirmation du titre : la canopée
est MAJORITAIREMENT pionnière, c'est-à-dire 0,5, et ça ne se renégocie plus.

*La facilitation de l'aulne sur le hêtre* retombe de 1,095 à 1,077 — troisième
glissement du même montant. On garde l'avantage, qui est l'énoncé, avec une marge
de 5 % qui absorbe le tirage sans prétendre mesurer l'ampleur.

*L'aubépine, dernière debout*, garde son rang mais la ronce revient de 0,0 à
1,9 % : une canopée d'arbres élancés laisse un peu plus de lumière au sol. On
garde l'ORDRE, pas le multiple.

## Le budget carbone : on meurt de faim, pas de passer sous un seuil

Rien ne mourait de manquer de lumière. Sur une cohorte de pins suivie cent vingt
ans, l'ombre tuait 4 à 7 tiges quand les ravageurs en prenaient 205 à 244. Et le
hêtre ne mourait **jamais** d'ombre : 361 plantés, 361 vivants à cent vingt ans,
à tous les réglages d'ombrage essayés. Ce n'était pas une calibration à
retoucher, c'était une impossibilité arithmétique — son seuil de stress (0,0090
de lumière) passait sous le plancher que le moteur sait produire (0,0111).

**Pourquoi un seuil ne pouvait pas y suffire.** Le point de compensation est
instantané : il dit si la feuille gagne ou perd à cet instant. Un arbre dominé ne
meurt pas parce que la lumière est passée sous une valeur ; il meurt d'avoir
dépensé plus qu'il n'assimilait des années durant, jusqu'à ne plus avoir de quoi
refaire des feuilles au printemps. C'est un stock qui se vide.

**Deux constantes, ancrées hors du moteur.** La respiration autotrophe consomme
la moitié de la production brute d'une futaie tempérée adulte — `NPP/GPP ≈ 0,5`
(Waring, Landsberg & Williams 1998 ; DeLucia et al. 2007 donnent 0,53 de moyenne
sur un large corpus). Et un arbre entièrement défolié meurt à la deuxième ou
troisième année consécutive, ce que font les gradations de bombyx : d'où des
réserves de deux ans et demi de revenu nul.

**La loi d'échelle vient du modèle du tube** (Shinozaki et al. 1964) : la section
d'aubier suit la surface foliaire, donc le volume d'aubier à entretenir par unité
de feuille croît comme la HAUTEUR. D'où le seul contenu qui compte, et qu'un
seuil ne pouvait pas dire — **la même ombre qu'un semis traverse tue une
perche.** Pour le hêtre, la lumière minimale de survie tombe toute seule :

| taille | part d'entretien | lumière minimale |
|---|---|---|
| semis 0,3 m | 0,6 % | **1,2 %** |
| perche 10 m | 20 % | **8 %** |
| arbre 25 m | 50 % | **18 %** |

### Le résultat qui n'a pas été demandé : la pente de Reineke

La validation ne porte pas sur le niveau de densité, qu'on ne saurait pas ancrer
(l'indice SDI maximal du hêtre est un chiffre qu'on trouve mal), mais sur la
PENTE de l'auto-éclaircie, qui est le vrai contenu de la loi. Hêtraie plantée à
2 m, deux graines, de quarante à cent vingt ans :

| | témoin (mécanisme neutralisé) | avec le budget carbone |
|---|---|---|
| tiges vivantes à 120 ans | **357 / 361** | **66 et 67 / 361** |
| densité | 2 231/ha | **413 et 419/ha** |
| rapport à la densité maximale | 0,79 → **1,63** (il s'en éloigne) | 0,79 → **0,90** (il s'y tient) |
| pente d'auto-éclaircie | — | **−1,48** et **−1,52** |

Reineke (1933) donne −1,605. Rien dans le mécanisme ne connaît Reineke, et cette
pente ne dépend pas de la constante incertaine — c'est le genre de résultat qui
vaut plus que le mécanisme lui-même, parce qu'il n'a pas été visé.

**Mais il ne faut pas le sur-vendre, et j'ai failli le faire.** Une version
intermédiaire du lot donnait −1,606 et −1,591, une coïncidence à trois décimales
avec la valeur canonique ; la correction de la cicatrisation hivernale, qui était
nécessaire pour une tout autre raison, l'a ramenée à −1,48 et −1,52. Ce qui est
solide, c'est que le peuplement suit une ligne d'auto-éclaircie au lieu de
dériver, et que sa pente tombe dans la gamme que la littérature mesure essence
par essence autour de −1,605. Ce qui ne l'était pas, c'est la troisième décimale.

### Ce qu'on n'a pas empilé, et la réserve qui reste

L'issue prévenait qu'ajouter une mortalité de lumière par-dessus celle des
ravageurs donnerait un peuplement qui s'effondre deux fois. Deux dispositions
l'évitent : le mécanisme **remplace** l'ancien facteur de survie à l'ombre au
lieu de s'y ajouter, et la famine converge avec les ravageurs sur le même état —
le stress — plutôt que de tuer de son côté.

**Mais la réserve est là, et il faut l'écrire** : sur 295 morts de la hêtraie,
293 portent l'étiquette « ravageurs » et deux « chablis ». Aucune ne dit
« ombre ». C'est physiquement juste — un arbre affamé ne refait plus ses tanins,
les ravageurs le trouvent, et l'acte de décès porte leur nom — et le témoin
ci-dessus montre que la cause est bien la famine, puisque sans elle il ne reste
que deux chablis. Mais le journal du jeu dira « achevés par les ravageurs » là
où le joueur avait besoin d'entendre « ils manquaient de lumière ». Distinguer la
cause du coup final demanderait de retenir, par arbre, d'où son stress est venu :
c'est de la maintenance, et c'est écrit dans une issue.

### Et deux essais changent de thermomètre sans changer de conclusion

Même famille que l'effet nurse de #97, et c'est la troisième fois de suite.

*Le réchauffement et les ravageurs.* L'essai comptait les MORTS de ravageurs.
Ce compte a cessé de mesurer le climat : l'auto-éclaircie le remplit dans les
deux scénarios, il est passé de 22,7 à 65,3 morts à climat figé, et le signal s'y
est noyé (65,3 contre 72,3, soit 1,1). La PULLULATION, elle, dit toujours la même
chose : 0,3205 figé contre 0,4332 chaud, soit **1,35**.

*Le frêne et son sol.* L'essai lisait « le frêne remonte son pH au-dessus de son
point de départ », ce qui mêlait l'effet de la litière — qu'il visait — et la
biomasse que la parcelle porte — qu'il ne contrôlait pas. Le frêne étant
héliophile, sa régénération ne passe plus sous couvert : la parcelle est passée
de 35 à 11 recrues et sa litière cumulée de 15 200 à 7 000 eq/ha. Le témoin
manquait, et il est éloquent : cette station s'acidifie **toute seule**, 7,00 →
6,87 sans un arbre. Comparée à lui, la conclusion est plus nette qu'avant —
frêne 6,94 au-dessus du sol nu, hêtre 6,75 en dessous.

## L'étiolement : l'ombre déplace l'arbitrage avant de raboter la pousse

Le moteur mettait la lumière dans la loi du minimum. Un arbre à l'ombre poussait
donc moins **des deux côtés à la fois**, et son élancement ne bougeait
quasiment pas : il stagnait au lieu de filer. Mesuré, une hêtraie plantée à 2 m
tenait H/D 39–56 à quatre-vingts ans — et, retournement révélateur, les tiges
les MOINS élancées y étaient les plus dominées (3,7 m de haut pour un H/D de
39). La perche de plantation serrée, celle que la sylviculture mesure à 90–100,
n'existait pas.

**Deux faits de terrain gouvernent la correction, et aucun n'est un réglage.**
D'abord, *la hauteur ne dépend presque pas de la densité* : c'est le fondement
de la dendrométrie, l'indice de fertilité se lit sur la hauteur dominante
précisément parce qu'elle y est insensible dans de larges limites, là où la
surface terrière en dépend entièrement (Assmann 1970). Ensuite, *le diamètre est
le dernier servi* : la hiérarchie des puits de carbone place l'entretien, le
feuillage, les racines fines et l'allongement du plus haut rameau avant
l'épaississement du tronc — c'est le cerne manquant des tiges dominées, un fait
de dendrochronologie ordinaire.

D'où le mécanisme, en une phrase : **la lumière décide combien de bois l'arbre
fait ; l'allongement se sert d'abord ; le diamètre prend ce qui reste.**

**Et le bois se compte exactement**, parce que le moteur avait déjà sa fonction
de volume. En dérivant `V = f (π/4) D² H`, puis en divisant par `f (π/4) D²` —
on compte donc le bois en « mètres d'allongement pur » — il vient
`bois = dH + 2 (H/D) dD`. Un mètre coûte peu à une tige fine ; un centimètre de
diamètre coûte cher à une tige haute, puisqu'il faut l'ajouter sur toute la
longueur. Ce n'est pas une hypothèse de plus : c'est la dérivée de la fonction
avec laquelle le moteur vend le bois.

**Ce lot n'ajoute pas un gramme de matière**, et c'est sa garantie : le budget
vaut exactement ce que l'ancienne formule produisait. En particulier, dès que
la lumière n'est pas le facteur limitant — tout dominant, et tous les sujets au
large sur lesquels les hauteurs sont calées (Jansen 1996) — le calcul redonne
l'identité au dernier chiffre près. Un seul essai du dépôt a bougé sur 870.

### Ce que la mesure a refusé : mon point fixe était le mauvais

Écrit seul, le partage s'emballe. J'avais calculé l'élancement d'équilibre en
posant « la tige cesse de filer quand son bois suffit à payer l'allongement
plein », ce qui donnait H/D 75. La mesure a donné **166 en quarante ans, et ça
montait encore**. Le vrai point fixe n'est pas là où un terme change de régime,
c'est là où les croissances **relatives** s'égalisent — soit `H/D = (3/f_lum −
1) × 50 / allocation`, c'est-à-dire **295** sous une ombre ordinaire.

Une tige pareille n'existe pas : elle flambe. C'est donc la mécanique qui ferme
le mécanisme, et elle a sa loi — `H ∝ D^(2/3)` (Greenhill 1881, exposant vérifié
sur les arbres records par McMahon & Kronauer 1976). Voir B11.

### Ce que ça donne, et ce que ça révèle ailleurs

Hêtraie plantée à 2 m, quatre-vingts ans : H/D **39–129** contre 39–56, médiane
65 contre 47. À trente ans, la tige la plus élancée vaut 87 à 2 m d'écartement,
59 à 4 m, 38 à 10 m — et elle est à **62 %** de la hauteur du plus haut, donc
c'est bien un arbre de milieu de canopée et non un rabougri. Cinq tiges sont
tombées au vent là où aucune ne tombait : le cadran de `facteurElancement`
(tempete.ts), qui ne descendait jamais sous 0,84, parle enfin.

**Et un essai a changé de verdict pour la quatrième fois, sans changer de
conclusion.** L'effet nurse lisait la HAUTEUR du chêne-liège, en la prenant pour
de la vigueur. Les deux grandeurs viennent de se séparer : collé à sa nurse, le
liège est désormais le plus HAUT des trois traitements (0,80 m contre 0,76 à
trois mètres) et de loin le plus chétif — 0,89 cm de diamètre contre 2,66, huit
fois moins de bois, H/D 90 contre 29. C'est une perche d'ombre, pas un arbre qui
prospère. Mesuré en volume, le classement est le même avant et après le lot :
**la conclusion écologique tenait, c'est le thermomètre qui était faux.** À
retenir bien au-delà de cet essai — une conclusion n'est pas robuste tant qu'on
n'a pas vérifié que sa grandeur de mesure dit encore ce qu'on croit.

## La variabilité individuelle : la fin des clones

Deux arbres de même essence étaient des clones parfaits : à conditions égales
ils poussaient exactement pareil. Ce n'est pas cosmétique — c'est cette
dispersion qui crée les dominants et les dominés, donc l'auto-éclaircie, donc
le sens même d'une éclaircie par le haut ou par le bas.

Chaque arbre porte sa **vigueur individuelle** (±20 %, tirée dans le générateur
de la partie, donc reproductible). Elle module uniquement ce que l'arbre TIRE de
conditions données : deux voisins ont la même eau et la même lumière, l'un en
fait plus que l'autre.

**Ce que ça a coûté en tests, et c'est la partie instructive.** Quatre essais ont
cassé, tous du même genre : ils comparaient un individu à un individu. Avec
±20 % de dispersion, c'est le tirage qui décide et non le mécanisme — le travers
des incendies, à l'échelle de l'arbre. L'effet nurse neutralise donc la vigueur
et moyenne sur trois graines ; et l'un de ses résultats s'est nuancé au passage :
collé à la nurse, le chêne-liège ne gagne plus rien (0,38 m contre 0,39 m à
découvert). Ce qu'on gagne sur le vent, on le perd sur la lumière — c'est
l'ombre portée qui fixe la bonne distance.

## Générateur de stations : ce qu'il reste à faire

La dérivation (A9) est en place : une station se décrit par un profil
d'horizons, tout le reste est calculé. Pour générer des stations quelconques,
il manque seulement le tirage cohérent des profils (une texture, une
profondeur et une MO plausibles ensemble, et cohérentes avec le climat et la
position topographique) — pas de nouveau mécanisme moteur.

## Le houppier doré produit encore

Ce chantier était intitulé « la saison de végétation est encore thermique ». Il
a été fait entre-temps, et cette entrée enregistre ce qui reste.

**Ce qui est fait.** La croissance et la transpiration ne passent plus par le
seul thermomètre : elles sont commandées par `partFoliaireActive` — le feuillage
vivant déployé, espèce par espèce — en produit avec un facteur thermique qui ne
porte plus que la vitesse du métabolisme. Et `GROWING_WEEKS` est passé de trente
à vingt-six, ce qui est la contrepartie indispensable : la constante veut dire
« sur combien de semaines la pousse annuelle se répartit », et c'est la
phénologie qui en donne le compte. Un caduc nu de janvier ne transpire donc plus
dans les Landes, et l'ordre de débourrement compte enfin dans le bilan annuel.

**Ce qui reste, et c'est un cran plus fin.** L'automne se joue en deux temps : la
feuille jaunit d'abord, elle tombe deux à trois semaines plus tard. Entre les
deux, elle est accrochée, vivante, et ne produit plus rien —
`partFoliaireAssimilante` mesure exactement cet écart. Elle n'est **pas** branchée
sur la croissance, donc un houppier entièrement doré d'octobre produit encore
pendant deux semaines par an.

**Pourquoi elle ne l'est pas.** Le premier essai, fait *avant* le recalibrage
ci-dessus, coûtait deux seuils écologiques calibrés :

| | avant | avec la sénescence |
|---|---|---|
| bouleau à 10 ans, limon riche (`lumiere.test.ts`) | 4,0 m | **3,8 m** |
| morts par ravageurs, climat figé vs SSP5-8.5 (`climat.test.ts`) | 2 → 4 | 3 → 5 |

Cette mesure ne vaut plus telle quelle : elle a été prise sur `GROWING_WEEKS =
30` et sur une croissance encore thermique. **À remesurer sur la calibration
actuelle**, et l'enjeu est petit — deux semaines par an sur une saison de
vingt-six, soit de l'ordre de 8 % de la production d'automne, pas de l'année.
C'est le genre de raffinement qu'on branche quand on recalibre pour une autre
raison, pas pour lui seul.

*Cette entrée fermait sur une limite* — les hauteurs absolues trop faibles, un
hêtre de plaine à quatre mètres à quarante ans — en disant qu'il faudrait la
reprendre sur des tables de production. C'est fait : voir « les hauteurs
absolues : le moteur se cale sur les tables de production » plus haut. Ce qui reste ici,
la sénescence hors de la boucle, est un raffinement à côté.

## Le combustible a deux étages, et l'ombre n'agit que sur un

La charge de combustible d'une cellule était fausse de deux façons, et
ensemble elles donnaient la conclusion inverse de la réalité française : **le
moteur faisait porter à une hêtraie fermée quatre fois plus de feu qu'à une
lande d'ajoncs** (3,34 contre 0,83, à couvert égal). Or les incendies courent
en pinède, en maquis et en lande, presque jamais en hêtraie.

1. **La charge des houppiers s'ADDITIONNAIT à chaque recouvrement**, sans
   plafond. Dans un peuplement fermé les couronnes se chevauchent, et une
   cellule finissait par porter plusieurs fois la charge d'une lande —
   uniquement à cause du chevauchement, pas de ce dont le couvert est fait.
2. **L'ombre amortissait AUSSI la charge des houppiers.** C'était circulaire :
   plus un peuplement portait de combustible, plus il faisait d'ombre, moins il
   pouvait brûler. Un fourré d'ajoncs finissait par ne plus s'enflammer du tout.

Le modèle sépare donc maintenant deux compartiments, comme le font les modèles
de comportement du feu (Rothermel 1983 ; Scott & Burgan 2005) : le combustible
de **surface** — herbe, litière, bois couché — et celui du **houppier**. Le
couvert maintient le premier humide et à l'abri du vent ; il EST le second, et
ne se protège donc pas lui-même. La charge en hauteur sature en `1 − e^(−n)`
avec `n` le nombre de couronnes couvrant la cellule, multipliée par leur
inflammabilité MOYENNE.

**Le coefficient de saturation est choisi pour qu'une couronne isolée porte
exactement ce qu'elle portait avant.** C'est ce qui permet de corriger la forme
sans déplacer l'échelle sur laquelle la propagation est calibrée : seuls les
peuplements denses changent, et c'est le but. Résultat, à couvert égal, la
lande porte **1,48 fois** la charge de la hêtraie au lieu de 0,25 — un
basculement d'un facteur six, dans le bon sens.

### Et la constante d'ombrage cesse d'être « à calibrer »

`PORTANCE_SOUS_COUVERT` valait 0,3 sans justification depuis le début. La
littérature opérationnelle du feu la chiffre par deux voies indépendantes, qui
tombent au même endroit.

**Le vent.** Les modèles appliquent au vent de référence un *wind adjustment
factor* pour obtenir le vent à hauteur de flamme. Rothermel (1983, USDA
GTR INT-143, table II-6 p. 33) donne **0,4 à 0,6 pour un combustible exposé** et
**0,1 sous une futaie dense** — un rapport de 0,17 à 0,25. Scott (2007), repris
par Andrews (2012, RMRS-GTR-266, table 7), le tabule sur le taux de couvert :
0,30 entre 5 et 10 % de couvert, **0,10 au-delà de 50 %**, soit 0,33. L'effet
sur la vitesse est fort : à combustible et vent égaux, GTR-266 (p. 5) donne
37,9 ch/h à découvert contre 12,5 sous couvert — **trois fois moins**.

**L'humidité.** Les mêmes tables corrigent l'humidité du combustible fin mort
selon l'ombrage : **+3 points au cœur de la journée d'été** pour un combustible
ombragé à plus de moitié, contre 0 pour un combustible exposé. Mesuré en forêt
tempérée, l'écart est du même ordre — 8 points d'humidité de moins en
peuplement ouvert, avec 7,8 °C de plus et 24 points d'humidité de l'air en
moins (Breigenzer et al. 2026, *Fire Ecology* 22:72).

Trois dixièmes, donc : le rapport des vents, qui est le mécanisme le plus
fiable des deux. *L'humidité, elle, s'efface au bout d'une longue sécheresse —
Estes et al. ne mesurent aucune différence entre peuplements éclaircis et non
éclaircis pendant l'été californien. C'est une raison de ne pas empiler les
deux effets.*

### Ce que la correction change au cas Saumos

Les conclusions du cas d'étude avaient été mesurées avec le modèle inversé. Elles
ont été REMESURÉES sur deux lots indépendants de seize graines, cinquante ans.

| composition | lot A | lot B | gros feux A/B |
|---|---|---|---|
| pinède pure | 1 825 m² | 1 311 m² | 15/16 · 12/16 |
| feuillus | 1 715 m² | 1 342 m² | 16/16 · 13/16 |
| chêne-liège | **1 166 m²** | **1 059 m²** | 13/16 · 13/16 |

**Une conclusion est retirée.** « Planter des feuillus réduit d'un tiers les
gros incendies et de 38 % la remontée de nappe » ne réplique pas : l'écart
change de signe d'un lot à l'autre (−6 % puis +2 %). Ce n'est pas une mesure
ratée, c'est un effet qui n'existe pas à cet horizon — une fois que tout est
passé au feu au moins une fois, c'est la LANDE qui porte le feu suivant, pas ce
qu'on avait planté dessus. À vingt-six ans, en revanche, les feuillus brûlent
bien un tiers de moins : **planter des feuillus achète du temps, ça ne change
pas le régime de long terme.**

**Une conclusion s'inverse.** On avait écrit que le chêne-liège « ne réduit ni
la surface parcourue ni la remontée » et que « survivre au feu et l'empêcher
sont deux stratégies différentes ». C'était l'artefact. Le chêne-liège est la
seule composition dont l'avantage réplique aux deux horizons, et le mécanisme
est émergent : son écorce résiste au feu, donc le peuplement reste debout, donc
le couvert reste fermé, donc la litière reste humide et à l'abri du vent — et le
feu suivant trouve moins à brûler. **Survivre au feu est ce qui empêche le
suivant.**

**Et une limite de méthode, chiffrée.** Seize graines ne suffisent pas pour les
petits écarts : la pinède brûle 1 825 m² dans un lot et 1 311 dans l'autre, soit
28 % de différence entre deux mesures du même dispositif. C'est pourquoi
l'avantage des feuillus, qui vaut moins que cela, ne peut pas être affirmé,
alors que celui du chêne-liège, qui vaut le double, le peut.

### L'amorçage de feu de cime

La charge du houppier entrait directement dans la propagation, comme si un feu
rampant dans la litière pouvait enflammer une cime à vingt mètres. Van Wagner
(1977) a posé le critère qui fait référence : le feu de surface doit dépasser
une intensité critique pour atteindre le houppier, et cette intensité croît
comme la **puissance 3/2 de la hauteur de base du houppier**. C'est la raison
pour laquelle une futaie élaguée haut ne passe pas en feu de cime là où un
fourré s'embrase — et c'est aussi pourquoi l'élagage est une mesure de
prévention.

Le moteur avait déjà ce qu'il fallait sans le savoir : la hauteur de base du
houppier n'y est pas un trait d'espèce, elle se calcule par arbre, celui-ci
élaguant lui-même les branches passées sous leur point de compensation
(`baseHouppierCible`, light.ts). Un fourré d'ajoncs a donc son houppier au ras
du sol et le porte entièrement ; une futaie qui s'est élaguée en grandissant met
le sien hors d'atteinte d'un feu rampant.

L'effet sur le contraste qui nous occupe est net : à couvert égal, la lande
d'ajoncs porte maintenant **5,96 fois** la charge d'une hêtraie. Le chemin
complet de ce chantier :

| état | lande / hêtraie |
|---|---|
| avant toute correction | **0,25** — le modèle disait l'inverse de la réalité |
| deux compartiments de combustible | 1,48 |
| + amorçage de feu de cime | **5,96** |

*Ce qui reste faux.* La structure — l'exposant 3/2 — est celle de Van Wagner et
elle est solide ; ses coefficients d'origine s'expriment en kW/m et en teneur en
eau du feuillage, deux grandeurs que ce moteur n'a pas, et je n'ai pas pu
récupérer la publication d'origine pour les transcrire. La constante est donc
**calée, pas transcrite**, sur un repère qu'on peut discuter : une charge de
surface de 1 — une lande sèche en plein soleil — atteint un houppier dont la
base est à quatre mètres. *(À confirmer.)*

*Et une conséquence contre-intuitive n'est toujours pas rendue* : Banerjee et
al. (2020) mesurent en simulation fine qu'ouvrir un sous-étage ACCÉLÈRE la
propagation en laissant entrer le vent, même si l'intensité baisse.

**Une conséquence de jeu que personne n'a écrite.** Trois mécanismes existaient
chacun de leur côté : l'élagage relève la base du houppier (`hauteurElagueeM`
entre dans `baseHouppierM`) ; la base du houppier décide de l'amorçage de feu de
cime ; donc **élaguer met le couvert hors d'atteinte d'un feu rampant**. Mesuré,
un peuplement élagué à six mètres porte un tiers de charge en moins que le même
peuplement branchu jusqu'à un mètre. C'est exactement ce que prescrit le
débroussaillement réglementaire dans les Landes, et le moteur y arrive tout
seul — aucune règle « élaguer réduit le feu » n'est écrite nulle part.

Ce qui ne bouge pas, et l'essai le vérifie aussi : le combustible de SURFACE.
Un pin élagué sur une lande d'herbe sèche brûle toujours au sol ; ce qu'il ne
fait plus, c'est passer en cime.

## Le couvert ne fait pas que de l'ombre : il tamponne la température

Le moteur savait qu'une litière reste humide sous les arbres. Il ignorait
l'autre moitié du microclimat forestier, pourtant la mieux mesurée de toutes :
sous un couvert, les jours sont plus frais, les nuits plus douces, et les
extrêmes rabotés des deux côtés.

De Frenne et al. (2019), *Nature Ecology & Evolution* 3:744-749 — méta-analyse
de **98 sites, 74 études, cinq continents, 714 paires** intérieur de forêt /
milieu ouvert adjacent :

| | écart forêt − ouvert |
|---|---|
| température **maximale** | **−4,1 ± 0,5 °C** — la forêt est plus fraîche le jour |
| température **moyenne** | −1,7 ± 0,3 °C |
| température **minimale** | **+1,1 ± 0,2 °C** — la forêt est plus douce la nuit |

Toutes à p < 0,001, et l'écart se creuse à mesure que le climat général devient
plus extrême — ce qui en fait un mécanisme d'autant plus important quand le
scénario climatique se réchauffe. Un suivi indépendant en forêt tempérée donne
le même ordre : +7,8 °C de maximum journalier en peuplement ouvert (Breigenzer
et al. 2026).

Le tampon s'applique **à proportion de la fermeture du couvert au-dessus du
point considéré** : pas de seuil, pas de palier. Un arbre en plein découvert ne
gagne rien, un semis sous futaie fermée gagne tout, et à mi-ombre exactement la
moitié — l'essai le vérifie, parce que c'est ce qui garantit qu'aucun cas
particulier n'est codé en dur.

**Ce qu'on en fait pour l'instant : le gel de floraison.** Le gel se juge
désormais sous le couvert de CHAQUE arbre, pas au-dessus de la parcelle. La
nuit, un couvert renvoie vers le sol le rayonnement que le ciel clair
emporterait, et la floraison qu'il abrite y échappe. C'est l'argument
agroforestier pour mettre les fruitiers à l'abri d'une haie plutôt qu'en plein
découvert, et il n'est écrit nulle part dans le moteur : il tombe de la
composition du tampon nocturne et du seuil de gel de l'espèce. Mesuré, un
abricotier entouré de charmes garde sa floraison là où celui d'à côté la perd.

*Ce qui reste à faire* : le tampon n'agit encore ni sur la phénologie — un
débourrement retardé sous couvert, ce qui est justement une protection
supplémentaire contre le gel tardif — ni sur le stress thermique d'été, où
−4,1 °C sur les maxima devraient compter beaucoup.

*Limite assumée* : les chiffres de De Frenne portent sur des moyennes de maxima
et de minima, pas sur les extrêmes absolus. Pour un gel radiatif — la nuit
claire et calme où le couvert compte le plus — le tampon réel est probablement
PLUS grand que 1,1 °C, puisque c'est précisément le rayonnement nocturne que le
couvert intercepte. On reste sur la valeur publiée plutôt que d'extrapoler.

## Les aides publiques, et l'hypothèse qu'on gèle pour pouvoir en parler

**L'avertissement d'abord.** Les règles simulées sont FIGÉES, et la réalité ne
l'est pas : la PAC se renégocie tous les cinq à sept ans, ses montants sont
révisés en cours de programmation, les enveloppes régionales varient. Ce module
prend les règles françaises 2023-2027, suppose qu'elles ne bougent plus, et le
dit — parce qu'un jeu qui simule deux siècles avec la PAC de 2023 ment
forcément, et qu'il vaut mieux mentir en le disant.

Ce qui reste vrai malgré le gel, c'est la **structure de l'arbitrage** : une
aide à l'hectare conditionnée à un plafond d'arbres, un bonus pour les
infrastructures agroécologiques, un autre pour les haies. Ces trois leviers
existent sous une forme ou une autre depuis vingt ans et existeront encore ; ce
sont les montants qui bougent.

### La règle qui fait la décision

Une parcelle agroforestière reste éligible aux aides surfaciques tant qu'elle
porte **au plus 100 arbres par hectare** — plafond maintenu pour 2023-2027.
Au-delà, ce n'est plus une parcelle agricole avec des arbres, c'est un
boisement : elle sort du régime, et l'aide avec elle.

**C'est le seul endroit du jeu où planter un arbre de plus peut coûter de
l'argent**, et c'est un vrai arbitrage de terrain. L'essai le vérifie dans les
deux sens : cent arbres passent, cent un ne passent pas, et la moitié de la
parcelle en infrastructures agroécologiques ne rattrape rien — l'éligibilité
vient AVANT les bonus.

### Les montants retenus

| aide | montant | condition |
|---|---|---|
| aide de base au revenu (ex-DPB) | **127 €/ha/an** | moyenne visée 2023, contre 114 en 2021 |
| écorégime, niveau de base | 54 €/ha/an | — |
| écorégime, niveau supérieur | **76 €/ha/an** | ≥ 10 % d'infrastructures agroécologiques |
| bonus haies | 7 €/ha/an | ≥ 6 % de haies, sous certification |

*(Sur le bonus haies, une source donne 20 €/ha et les documents départementaux
consultés 7 €/ha sous certification. On retient 7 et on signale l'écart — à
confirmer.)*

*Approximation assumée* : la part d'infrastructures agroécologiques est mesurée
par le couvert arboré, alors que la PAC compte des LINÉAIRES de haies convertis
en surface équivalente. Ce n'est pas la même chose.

**Les aides ne tombent que si l'économie compte** dans la partie (voir l'option
de démarrage). Sans elle, le compte tourne pour information seulement, et y
verser des aides le fausserait : on montrerait une trésorerie qui monte sans que
rien de ce qui la fait monter ne compte.

## Un semis n'a pas la même taille selon ce qu'il deviendra

Tous les semis naissaient à **trente centimètres**. C'est la bonne taille pour
un chêne, dont le gland porte les réserves qu'il faut. C'est la MOITIÉ de sa
taille adulte pour la callune, qui plafonne à soixante : elle naissait presque
faite, et sautait entièrement sa phase pionnière — celle qui dure des années
dans la nature, et pendant laquelle un sous-arbrisseau est vulnérable au
broutage, à la concurrence herbacée et au piétinement. Le défaut touchait tous
les sous-arbrisseaux de l'atlas, et il faussait **dans le sens de la facilité**.

Un semis naît maintenant à un dixième de sa taille adulte, **borné à trente
centimètres**. Le plafond joue dès trois mètres d'adulte, donc pour tous les
arbres : eux ne bougent pas d'un centimètre, et c'est cette borne qui permet de
corriger les arbustes sans toucher au reste.

| espèce | adulte | semis avant | semis après |
|---|---|---|---|
| callune | 0,6 m | 0,30 m | **0,06 m** |
| ajonc | 2,5 m | 0,30 m | 0,25 m |
| chêne pubescent | 20 m | 0,30 m | 0,30 m |

**Les deux moitiés du résultat comptent.** Une callune met désormais quinze ans
à faire sa taille au lieu de partir presque faite — c'est le correctif. Mais
elle y arrive, et vingt sur vingt survivent sur la lande : on n'a pas rendu les
sous-arbrisseaux incapables de s'installer sur leur propre terrain. L'essai
vérifie les deux.

*Approximation assumée* : on passe par la taille ADULTE faute de mieux. Ce qui
détermine vraiment la taille d'une plantule, c'est la réserve de la GRAINE — un
gland fait un semis de vingt centimètres, une graine de callune, qui est une
poussière, fait une plantule de quelques millimètres. La taille des graines
n'est pas dans l'atlas, et elle suit grossièrement celle de la plante. C'est
une approximation, mais elle corrige le SENS de l'erreur.

## Le marché : un prix qui bouge, et qui s'effondre quand tout le monde vend

Les prix étaient FIXES — 35 €/m³ pour le chauffage, une valeur par espèce pour
l'œuvre, quelle que soit l'année et quelle que soit la quantité mise sur le
marché. C'est faux de deux façons, et les deux comptent pour un gestionnaire.

### Le cycle

L'indice des prix des bois sur pied en forêt privée française a fait **+7 % en
2024, −4 % en 2025, et +46 % depuis 2020** (Observatoire économique France Bois
Forêt). Les écarts par essence sont plus larges encore sur une seule année : le
douglas a pris 24 % et le peuplier 26 % en 2024, quand le chêne reculait de 3 %.
Des variations annuelles de l'ordre de ±10 %, avec des cycles pluriannuels qui
s'additionnent, sont donc la norme et non l'accident.

L'indice du moteur combine un cycle de onze ans et un bruit annuel, borné entre
0,6 et 1,5 : le marché bouge, il ne s'envole pas. Il est **déterministe et
dérivé de la graine de la partie** — deux parties identiques voient le même
marché — et il ne puise PAS dans le flux aléatoire principal, un tirage de plus
y décalant tous les suivants.

### L'engorgement, qui est le vrai levier

**Le prix s'effondre quand tout le monde vend en même temps.** C'est ce que la
France a vécu après Lothar en 1999 et Klaus en 2009 : des millions de m³ de
chablis jetés d'un coup sur un marché qui ne pouvait pas les absorber, et des
cours divisés par deux.

Le moteur ne simule pas le marché national — il simule une parcelle. Ce qu'on
modélise est donc l'engorgement du débouché **local** : au-delà d'une trentaine
de m³ vendus dans l'année, le prix baisse, jusqu'à la moitié. Le même bois vendu
en quatre fois rapporte plus qu'en une seule, et l'essai le vérifie sur une
partie complète.

**C'est la raison d'étaler ses coupes, et elle n'est écrite nulle part
ailleurs.** La décote est continue, sans falaise qu'un joueur pourrait raser au
m³ près.

*(À calibrer : l'ampleur des chutes post-tempête est documentée, le seuil local
ne l'est pas — une parcelle d'un hectare n'a pas de marché à elle.)*

## Le drageonnement : la conquête par la racine

La fiche du prunellier le disait elle-même : « faute de savoir modéliser le
drageonnement, on compense par un taux de semis généreux ». La compensation
donnait à peu près le bon NOMBRE de prunelliers et la mauvaise MANIÈRE — des
semis d'oiseaux essaimés au hasard au lieu d'un fourré qui s'épaissit.

Un drageon n'est pas un semis, et deux choses le distinguent :

- il naît sur une **racine traçante**, donc à quelques mètres de sa mère — la
  tache avance par son bord au lieu d'essaimer au loin ;
- il reste **relié** à elle, qui le nourrit le temps qu'il s'installe, donc il
  n'a pas besoin de trouver sa lumière tout seul.

**C'est la seconde qui fait le fourré.** Un drageon s'installe sous le couvert
de sa propre espèce, là où aucune graine de la même espèce ne lèverait. C'est
aussi ce qui fait du prunellier un problème de gestion dans une haie : le
fourré ne tient pas sa place.

Le drageon échappe au filtre de lumière, et à lui seul : le pH du sol où il
sort, la place disponible et la concurrence immédiate le concernent autant qu'un
semis.

**Mesuré**, cinq pieds au milieu d'une parcelle nue et vingt-cinq ans : le
prunellier fait **423 pieds contre 170** à l'aubépine, et les serre plus — 1,36 m
entre voisins contre 1,78. Le nombre de TENTATIVES est pourtant le même qu'avant
(0,4 semis + 0,8 drageons contre 1,2 semis) : ce qui change est le taux de
RÉUSSITE.

*Ce que l'essai ne montre pas, et qu'il vaut mieux dire* : sur quarante mètres
et en vingt-cinq ans, les oiseaux ont le temps de semer partout. La différence
n'est donc pas dans l'emprise mais dans la DENSITÉ. Mesurer une tache qui avance
demanderait une parcelle plus grande et une partie plus longue que ce qu'une
suite d'essais peut se payer.

## L'allélopathie : empêcher les autres de pousser chez soi

Le moteur ne connaissait que la CONCURRENCE — pour la lumière, l'eau, les
minéraux. Or certaines plantes ne se contentent pas de prendre : elles
**émettent**. Le noyer libère de la juglone par ses racines et sa litière, et
elle inhibe la germination et la croissance dans un rayon de **quinze à vingt
mètres**.

C'est la contrainte classique de l'agroforesterie au noyer, et la première
chose qu'on apprend en plantant un verger à côté. Pour ce jeu, elle rend le
choix des **voisins** décisif là où, ailleurs, seule la lumière compte.

**Le noyer entre donc à l'atlas** — il y était déjà côté fiches, pas côté
moteur. C'est l'arbre emblématique de l'agroforesterie française, et sa
phénologie très tardive n'est pas un détail : il feuille en mai, ce qui laisse
à la culture intercalaire le temps de pousser avant que l'ombre n'arrive.

### Le sol décide autant que l'arbre

> « Dans un sol lourd et peu drainé, les concentrations peuvent rester élevées
> près des racines pendant de longues périodes, tandis qu'un sol sableux
> facilitera le lessivage et une moindre accumulation. »

C'est ce qui permet d'en faire une **règle** plutôt qu'une constante :
l'intensité dépend de la texture, que le moteur connaît déjà. Un noyer sur limon
lourd stérilise autour de lui ; le même sur sable gêne beaucoup moins.

### Ce que la littérature ne donne pas

Elle donne un rayon et des **listes** — pommier, pin, bouleau et myrtillier
souffrent ; la plupart des graminées ne bronchent pas. Elle ne donne pas de
courbe dose-réponse espèce par espèce, et on ne l'invente pas : les fiches où
l'on ne sait pas portent une sensibilité **médiane**, marquée comme telle.

**Mesuré** : un pommier planté à trois mètres d'un noyer de dix-huit mètres
reste sous 70 % de la taille du même pommier à trente mètres — au-delà de la
portée de la juglone, la distance que conseille tout guide de plantation. Le
moteur y arrive sans qu'on l'écrive : le pommier n'a pas de règle « éviter le
noyer », il a une sensibilité, et le noyer une portée.

## L'effet de bord : la parcelle n'est pas seule au monde

Le moteur traitait la limite de parcelle comme une limite du monde : au-delà,
rien. Un carré de bocage au milieu d'un massif forestier recevait donc autant de
lumière sur ses bords qu'une clairière isolée — faux, et faux dans le sens qui
compte, puisque la lisière est justement l'endroit où l'agroforesterie se joue.

### La géométrie n'est pas symétrique

**Ce qui vous ombrage est ce qui est au SUD.** Le soleil est au sud en France,
les ombres tombent vers le nord (`SHADOW_NORTH_OFFSET`), et un bois planté au
NORD d'une parcelle ne lui coûte pas une heure de soleil — c'est elle qui
l'ombrage.

Les quatre bordures ne pèsent donc pas pareil : le sud à plein, l'est et l'ouest
au tiers (le soleil y est bas et son rayonnement faible), le nord pas du tout.
La profondeur de la bande ombragée reprend la géométrie du moteur plutôt qu'un
chiffre importé — un peuplement projette son ombre sur `SHADOW_NORTH_OFFSET`
fois sa hauteur, comme un arbre.

*Hypothèse assumée* : le modèle de paysage ne dit pas la HAUTEUR du bois voisin,
seulement sa part boisée. On prend une futaie mûre, à lever le jour où les
bordures porteront une hauteur.

### Un résultat contre-intuitif, et il est juste

Le premier essai attendait qu'un arbre de lisière sud pousse MOINS à l'ombre
d'un massif. C'est vrai d'un héliophile — le pin y perd. Mais le hêtre, lui,
**y gagne** : 8,7 m contre 7,4 en plaine découverte.

La raison tient en une ligne : sur le limon riche, à 750 mm de pluie, le hêtre
est limité par l'**eau** et non par la lumière. Moins de rayonnement, c'est
moins de transpiration, donc moins de stress hydrique — et il supporte l'ombre
par tempérament. C'est exactement le mécanisme de l'effet nurse, appliqué à une
lisière.

Les deux sont éprouvés, le second surtout : pour qu'il ne passe pas pour une
régression le jour où quelqu'un le remarquera.

### Et il retire une conclusion du cas Saumos, pour la deuxième fois

« Les feuillus achètent du temps » ne tient plus. On l'avait déjà réduit une
fois — l'avantage de long terme ne répliquait pas, seul celui à vingt-six ans
restait. Avec l'effet de bord, ce dernier s'inverse : sur seize graines, les
feuillus brûlent **656 m² contre 431 au pin**, soit la moitié DE PLUS.

Le changement a été isolé — en désactivant le seul ombrage de l'entourage,
l'ancien ordre revient. L'explication qui tient, et elle n'est pas vérifiée pour
elle-même : l'atténuation par les feuillus reposait sur leur capacité à FERMER
LE COUVERT vite, ce qui étouffe la lande qui porte le feu. Tout ce qui les
ralentit défait donc l'atténuation, et l'ombre de la lisière les ralentit.

Ce qui survit : le chêne-liège brûle toujours moins que le pin — 344 m² contre
431, soit 20 % de moins au lieu de 30. C'est le seul résultat de ce cas d'étude
qui garde le même sens à travers tous les états du moteur qu'a connus ce dépôt.

*Une inconsistance à noter* : le profil Saumos suppose un incendie de MASSIF,
tout le bassin logé à la même enseigne. Or l'ombrage de bordure suppose un
entourage boisé intact et permanent — après un feu de massif, les voisins ont
brûlé aussi. Le moteur ne le sait pas.

## Les profils livrés : un cas réel, prêt à éprouver

Décrire une situation réelle demande de poser une vingtaine de réglages —
terrain, entourage, relief, nappe, part du bassin, scénario climatique — et la
moindre erreur entre deux essais invalide la comparaison. Le jeu livre donc des
profils tout faits, à côté de ceux qu'on enregistre soi-même.

Le premier est **Saumos 2022 (Gironde)** : sable landais acide, nappe perchée à
quatre mètres, tout le bassin logé à la même enseigne — c'est un incendie de
massif, pas un feu de parcelle entourée de vert — et une trajectoire SSP2-4.5.
Ce sont exactement les paramètres de `saumos.test.ts`, qui annonçait d'ailleurs
« le profil de départ, celui qu'on enregistre sous *Saumos 2022* » sans que
personne ne puisse le charger.

**La graine n'en fait pas partie**, et c'est délibéré : sur ce cas-là, la même
composition brûle de 0 à 4 500 m² selon le tirage. C'est en changeant la graine
qu'on distingue ce qui tient du terrain de ce qui tient de la chance, et le
profil est fait pour être rejoué.

## L'infradensité : la biomasse se pesait avec la densité du commerce

`bois.densite` valait 0,68 pour le hêtre. La valeur est juste — pour la
mauvaise grandeur : c'est la densité à 12 % d'humidité, celle des tables de
menuiserie. La biomasse demande l'**infradensité**, masse anhydre rapportée au
volume VERT, de l'ordre de 0,55 pour le hêtre. Le champ se décrivait déjà comme
une infradensité : le code se mentait à lui-même depuis le début (#68).

### Un champ, pas deux

Le recensement des lecteurs a tranché la première question. `bois.densite` n'en
a que deux : `treeAboveCarbonKg` (`carbon.ts`), qui veut l'infradensité, et
`dureeChandelleSemaines` (`trees.ts`), qui n'y lit qu'un proxy de dureté — et
les deux grandeurs classent les essences dans le même ordre. Le prix ne lit pas
ce champ : il se compte au m³ (`prixOeuvreEurM3`). Personne ne réclamait une
densité commerciale, donc le champ garde son nom et reçoit l'infradensité.

### Deux sources, et aucun facteur global

Les valeurs ont été saisies essence par essence depuis deux sources ouvertes,
dans cet ordre :

1. la table **IGN d'après Dupouey 2002** — infradensités des essences
   françaises de taillis, reproduite en annexe 3 de la méthode CNPF
   « conversion de taillis en futaie sur souches » v2 du label bas-carbone, et
   celle qu'emploie l'inventaire national des gaz à effet de serre. Huit
   espèces du référentiel y figurent ;
2. la **Global Wood Density Database** (Zanne et al. 2009, Dryad
   doi:10.5061/dryad.234), dont la mesure est littéralement « oven dry mass /
   fresh volume ». Neuf espèces de plus.

Les deux se recoupent là où elles se rencontrent : sept des huit espèces que
l'IGN couvre ici figurent aussi au GWDD, et les valeurs s'y accordent à moins de
0,09 t/m³ près (le pire écart est le charme, 0,61 contre 0,69). C'est ce
recoupement qui les valide l'une par l'autre, plutôt que leur seule autorité.

Les neuf restantes — pommier cultivé, prunellier, aubépine, ronce, sureau,
cornouiller mâle, ajonc, genêt, callune — ne sont dans aucune des deux. Elles
**gardent leur valeur d'avant et leur fiche le dit**, plutôt que d'emprunter
celle d'un congénère ou d'être inventées.

Surtout, **aucun facteur global n'a été appliqué**. C'était la tentation, et
elle aurait remplacé une erreur par une autre : l'écart entre densité à 12 % et
infradensité n'est pas le même d'une essence à l'autre. Le charme perd un quart
(0,80 → 0,61), le chêne-liège ne bouge pas (0,70), et le troène **monte**
(0,75 → 0,81). Un coefficient unique se serait trompé sur les trois.

### L'ancre, et pourquoi elle porte sur la tige

C'est le point qui rendait le correctif démontrable ou pas. L'unique ancre
extérieure du dépôt exigeait qu'un hêtre de 25 m et 50 cm pèse entre 1 000 et
1 500 kg C. Le moteur en donnait 1 333 avec 0,68 et 1 078 avec 0,55 : **les
deux passaient**. Une ancre que la correction ne fait pas basculer ne prouve
rien, et c'est exactement pour ça que le défaut a pu vivre si longtemps sous un
essai vert.

L'ancre a donc été déplacée sur la **tige**, parce que son volume ne fait pas
débat : le moteur en donne 2,454 m³ pour cet arbre et le tarif français EMERGE
(Deleuze et al. 2014, constante Fagus sylvatica 0,515) 2,528 m³, soit 3 %
d'écart. Sur un volume aussi bien tenu, la masse sèche ne mesure plus qu'une
chose : l'infradensité.

Les bornes viennent de Zianis, Muukkonen, Mäkipää & Mencuccini 2005, *Biomass
and Stem Volume Equations for Tree Species in Europe*, Silva Fennica
Monographs 4, annexe A — les quatre équations de biomasse de tige applicables à
un hêtre adulte de cette dimension, c'est-à-dire ni hors de leur plage de
diamètre ni calées sur une autre classe d'âge :

| Équation | Tige sèche à 50 cm et 25 m |
|---|---|
| Cienciala 2005 (Tchéquie, D 5,7–62,1, n=20) | 1 624 kg |
| Calamini & Gregori 2001 (Italie, adultes) | 1 512 kg |
| Bartelink 1997 (Pays-Bas, D seul, n=38) | 1 474 kg |
| Bartelink 1997 (Pays-Bas, D et H, n=38) | 1 307 kg |

Rapportée au volume de tige, cette enveloppe borne l'infradensité du hêtre
entre 0,53 et 0,66 : elle contient les 0,55 de l'IGN et les 0,585 du GWDD, et
**exclut les 0,68 d'avant**. Le moteur place 1 350 kg ; à l'ancienne valeur il
en plaçait 1 669 et l'essai tombe. C'est cette bascule, et elle seule, qui
prouve que le correctif en est un.

L'ancre sur l'arbre entier est conservée, mais rebaptisée pour ce qu'elle est :
un garde-fou d'ordre de grandeur, qui ne discrimine pas l'infradensité.

### Ce que ça déplace ailleurs

La durée des chandelles vaut `densite × 15 × 52` : baisser les densités les a
raccourcies d'environ un cinquième. L'éventail reste dans la fourchette de
terrain annoncée par le commentaire (2 à 20 ans) — du saule blanc à 4,2 ans au
cornouiller mâle à 13,5 ans. `chandelles.test.ts` et `bois-en-travers.test.ts`
passent sans retouche, et c'était attendu : le changement ne consomme aucun
tirage, il ne peut donc pas décaler le flux aléatoire.

### Les essais d'écologie : ce qui s'exige par graine, et ce qui ne s'exige plus

Le changement ne consomme aucun tirage : il ne peut donc pas décaler le flux
aléatoire, et toute bascule est causale. Deux essais ont basculé — et les deux
étaient des **rapports entre quantités composites**, exactement ceux que la
section « ce qu'un test écologique a le droit d'affirmer » cite en exemple.

**`ravageurs`, le mélange contre le peuplement pur.** Ce rapport avait déjà été
rabaissé deux fois (de trois à 1,4 lors de la correction du volume, #62). Sur la
base d'avant les tempêtes, l'infradensité l'a fait passer à 1,03 / 0,76 / 0,88 :
**une graine sur trois donnait le mélange perdant**, et seule la moyenne le
cachait. Le lot des tempêtes (#85) l'a rétabli largement — mesuré sur le code
livré, 0,34 / 0,34 / 0,23. L'écart est donc de nouveau épinglé, mais désormais
**par graine** : une moyenne ne pourra plus masquer une partie qui dit le
contraire des deux autres.

**`climat`, le réchauffement contre le climat figé.** Celui-là ne s'est pas
rétabli, et il ne le méritait pas. Son seuil était déjà descendu de ×2 à ×1,3 ;
sur soixante ans une partie compte entre vingt et quarante-cinq morts par
ravageurs, et le bruit de graine mange le signal. Mesuré sur le code livré :
34 → 40, **32 → 21**, 25 → 38. Une graine dit l'inverse des deux autres et la
moyenne ne franchit plus l'ancien seuil. Un troisième rabais en aurait fait un
enregistrement du moteur.

Il est donc reporté sur la grandeur que le mécanisme produit **directement** —
la pullulation — là où le compte de morts mélange pullulation, vigueur et
sécheresse concurrente :

| Essai | Grandeur épinglée | Mesuré sur le code livré |
|---|---|---|
| `ravageurs` — pullulation pur / mélange | `ravageurMoyen` max | 2,82 × / 3,02 × / 3,06 × |
| `climat` — pullulation chaud / figé | `ravageurMoyen` max | 1,45 × / 1,35 × / 1,31 × |

Directionnelles sur les trois graines, et **éprouvées en neutralisant leur
cause** — `facteurChaleur` pour l'une, le lien habitat → prédation pour
l'autre : les deux tombent. Elles lisent le mécanisme, pas le jet de dés.

#### Et le maillon qui manquait : compter les causes ENSEMBLE (#93)

Reporter l'essai du climat sur la pullulation laissait un trou : il affirmait
que le réchauffement fait pulluler les ravageurs, plus qu'il **tue** des arbres.
La campagne de #93 a montré comment le combler, et au passage pourquoi le compte
par cause unique était condamné d'avance.

**Un arbre ne meurt qu'une fois, et sa mort n'est imputée qu'à UNE cause.**
Compter la seule case « ravageurs » revient donc à soustraire les arbres que la
sécheresse a pris de vitesse — le réchauffement pousse ce compte dans les deux
sens à la fois. Ce n'est pas une hypothèse : le même chiffre, mesuré à trois
lots d'écart, a inversé sa direction sur une graine puis l'a retrouvée, sans que
le lien entre chaleur et mortalité ait bougé.

| morts par ravageurs | graine 11 | graine 23 | graine 37 |
|---|---|---|---|
| avant sanglier / lisière | 34 → 40 (1,18 ×) | 32 → 21 (**0,66 ×**) | 25 → 38 (1,52 ×) |
| après | 24 → 33 (1,38 ×) | 23 → 31 (1,35 ×) | 19 → 37 (1,95 ×) |

Comptées **ensemble**, les deux voies par lesquelles la chaleur tue donnent au
contraire un signal franc et stable :

| morts soif + ravageurs | graine 11 | graine 23 | graine 37 |
|---|---|---|---|
| figé → chauffé | 26 → 49 (1,88 ×) | 23 → 92 (4,00 ×) | 21 → 69 (3,29 ×) |

Le seuil est posé à 1,5 : sous le minimum mesuré, très au-dessus de 1. Il ne
demande plus le garde contre la division par zéro que le compte par ravageurs
seuls exigeait — le dénominateur combiné ne descend jamais sous vingt.

**Une hypothèse est tombée en chemin, et il faut le dire :** on soupçonnait
l'ombre d'être un troisième puits concurrent, l'auto-éclaircie se renforçant
avec la saison de végétation. C'est l'inverse — les morts par ombre BAISSENT
sous réchauffement (0,80 / 0,25 / 0,87). L'ajouter au compte ne ferait que
diluer le signal (1,09 / 1,16 / 1,49), donc on ne l'ajoute pas. `maladie` et
`vieillesse` sont à zéro dans toutes les parties.

### Ce que ce lot n'a PAS fait

Le carbone total du hêtre tombe à 1 078 kg C, soit 3 % sous le plancher de ce
que les équations de biomasse aérienne de Zianis donnent pour cet arbre (1 819
à 2 302 kg de matière sèche, soit 1 118 à 1 414 kg C une fois les racines
ajoutées). L'écart ne vient pas de l'infradensité : il vient de ce que
l'expansion de branchage (1,30) et la valeur de l'IGN (0,55) sont toutes deux
au bas de leur fourchette et que les deux se cumulent. Le garde-fou sur l'arbre
entier a donc été élargi vers le bas jusqu'à la plus petite tige publiée
augmentée du plus faible rapport aérien/tige observé (1 307 × 1,20), plutôt que
resserré sur un plancher que le moteur ne tient pas. C'est à regarder — séparément, et pas dans le même lot
qu'une autre correction de biomasse, faute de quoi les deux se masqueraient.


## Règle de travail

À chaque ajout au moteur, mettre ce document à jour : cocher, recompter, et
vérifier qu'aucun critère n'a été coché par un cas particulier. Le score n'est
pas une note — c'est une carte de ce qui reste à rendre vrai.
