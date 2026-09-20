# Agent d'évolution du moteur

Lire d'abord [`README.md`](README.md) — assignation, labels, règles communes.

## Périmètre

Ajouter des mécanismes que le moteur ne sait pas faire. Issues portant
`moteur:évolution`.

Un correctif de calibration sur un mécanisme existant revient à l'agent de
maintenance. Si une évolution bute sur une calibration fausse, ouvrir une issue
`moteur:maintenance` et dire dans la sienne qu'elle en dépend.

## Les deux règles de conception, et elles ne se négocient pas

**Aucun cas particulier par espèce.** Un trait déclaré dans l'atlas, oui — un
`if (especeId === "juglans_regia")`, jamais. L'allélopathie est le modèle du
genre : le noyer a un champ `allelopathie` avec sa portée, et toute espèce qui
en déclare un inhibe ses voisines. Le mécanisme ne connaît pas le noyer.

**Tout se raisonne localement et par individu.** Pas de moyenne de parcelle
là où deux arbres voisins vivent des situations différentes.

Le meilleur signe qu'un découpage est bon : la règle **tombe** de mécanismes qui
existaient déjà, sans qu'on l'écrive. Le tassement en est un exemple — « une
parcelle plantée serré ne se tasse pas » n'est écrit nulle part, ça tombe de
`partMecanisable`, calculé à l'origine pour chiffrer le coût d'un chantier.

## Le flux aléatoire : le piège le plus coûteux du dépôt

Le moteur tire dans **un seul flux séquentiel**. Un mécanisme qui consomme un
tirage de plus par semaine décale tout ce qui suit et peut renverser des
conclusions écologiques sans qu'aucune cause physique n'ait bougé. C'est arrivé,
et trois conclusions ont dû être retirées.

**Dériver une graine locale** plutôt que puiser dans le flux. Deux précédents à
copier : `graineDeChute(idArbre, semaine)` dans `boisMort.ts`, et l'indice de
marché dans `marche.ts`, dérivé d'une graine de partie.

Quand c'est inévitable — la propagation du feu, par exemple, ne peut pas ne pas
tirer — le faire **d'un coup** et revérifier ensuite tous les scénarios de
réalisme. Poser le label `flux-aléatoire` sur l'issue.

## Chaque chiffre se justifie

Une constante porte sa source dans son commentaire, ou porte la mention
*(à calibrer)* / *(à confirmer)*. Une valeur inventée et présentée comme acquise
est le défaut le plus grave qu'on puisse laisser : le moteur devient faux sans
que rien ne le signale.

Un chiffre calé **sur le moteur** n'est pas une ancre. Les hauteurs ont été
calées sur les tables de production Jansen 1996 ; c'est le standard à viser.

## Mesurer avant de conclure

La variance entre graines est énorme sur ce moteur : un même peuplement brûle de
0 à 4 500 m² selon le tirage. **Une partie n'est pas une mesure.** Toute
conclusion écologique se prend sur plusieurs graines, et la direction vaut mieux
qu'un rapport (voir la note de maintenance).

Séparer calibration et validation : caler un paramètre sur un âge, garder
l'autre âge pour vérifier.

## Ce que le dernier lot a appris (la pompe à bases, #170)

`effetLitiereEq` créditait la surface du calcium d'une feuille qui se
décompose, sans que rien nulle part ne soit débité : le calcium arrivait de
nulle part. Le moteur tient maintenant un pool de bases de sous-sol, que les
racines vident. C15 passe de ❌ à 🟡.

**Le témoin à mécanisme neutralisé peut être un état, pas un drapeau.** L'issue
demandait « à prélèvement nul, trajectoires identiques au bit près ». Plutôt
qu'un paramètre de test qui n'existerait que pour le test, le banc met le
sous-sol à ZÉRO : il n'a plus rien à céder, le `Math.min` ramène tout
prélèvement à zéro, et rien d'autre du tick ne change. Résultat : même pH à
dix-sept chiffres, même hash d'état. Le témoin est dans le moteur, pas à côté.

**Et la prémisse se vérifie DANS le témoin.** Un « rien n'a bougé » passe tout
seul si le mécanisme n'a jamais tourné — c'est la faute que ce dépôt a commise
six fois. Le banc exige donc d'abord que la branche normale ait pompé quelque
chose, et seulement ensuite que la branche neutralisée soit identique.

**Un argument de cadrage se mesure, comme le reste.** L'issue justifiait
d'abord le périmètre additif par « la surface est inchangée, donc rien à
recalibrer ». C'était vrai mais creux : l'altération, elle, somme sur tout le
profil et crédite la surface, et 63 à 79 % de ce qu'elle libère vient d'en
dessous. J'ai cru rattraper l'argument avec un second, chiffré de mémoire — la
pompe pèserait un ordre de grandeur de plus que l'altération profonde. Mesuré
après coup, c'est FAUX : 8 100 eq/ha pompés par une hêtraie en cinquante ans
contre 9 400 d'altération profonde mal placée, châtaigneraie 11 400 contre
8 700. **Deux justifications écrites avant la mesure, deux fausses.** Ce qui
reste, et qui est vrai, est un énoncé de périmètre : stratifier l'altération
retire les deux tiers des apports minéraux de la surface et défait la
calibration de C10 — c'est un autre lot. Le pool profond est donc un COMPTEUR
DE POMPE, pas un budget de sous-sol, et le référentiel le dit.

**Ce qui sort d'un banc n'est pas toujours le contraste qu'on visait.** « Le
frêne est le pompeur de manuel » : à masse de litière égale, oui, deux fois le
hêtre. En partie, non — sa régénération de trouée lui laisse 25 tiges contre 46
au hêtre, et il pompe trois fois moins. Le contraste qui tient à l'échelle du
peuplement est un autre, et il est meilleur : le PIN descend deux fois plus bas
que le hêtre et porte plus de tiges, et il pompe cinquante fois moins. La
profondeur donne l'accès, la teneur donne la quantité.

**Une grandeur exposée que personne ne lit reste une grandeur exposée.** Aucun
arbre ne lit `basesProfondEq` : le moteur sait dire que le fond s'appauvrit,
pas encore ce que l'appauvrissement fait aux racines qui y poussent. C'est
écrit sur le champ lui-même, pour que le prochain lot n'ait pas à le deviner.

## Ce qu'un lot plus ancien a appris (la phénologie entre deux semaines, #164)

Un hêtre passait de nu à à-moitié-feuillu en un seul pas de temps, et le rendu
ne pouvait pas l'adoucir sans refaire la phénologie chez lui. Aucun critère de
`realisme.md` ne bouge : comme #139 et #153, ce lot ajoute une capacité de
LECTURE, pas une affirmation sur le monde.

**Reproduire la prémisse avant de construire.** L'issue annonçait 44,0 % et
51,3 % de part foliaire gagnés en une semaine. Vérifié en cinq minutes : les
deux chiffres tombent au dixième. Ça paraît une politesse ; c'est ce qui permet
d'affirmer ensuite que le lot corrige quelque chose, plutôt que de l'espérer.

**L'issue laissait le choix entre deux formes, et c'est une mesure qui a
tranché.** Livrer la semaine précédente et laisser le rendu interpoler aurait
coûté **0,00 point d'erreur à l'automne** — la chute est une rampe, la droite
est exacte — mais **11,27 points au printemps**, où le débourrement a des
coudes. Soit un cinquième du plus gros saut, précisément à la saison qu'on
voulait soigner. **Et mesurer la seule semaine du plus gros saut donnait 0,00 :
la bonne réponse était dans les semaines ordinaires, pas dans la spectaculaire.**

**Exposer une capacité que le consommateur ne peut pas alimenter, ce n'est pas
la livrer.** Avant d'écrire la signature, j'ai regardé ce que le jeu tient
vraiment : il reçoit le contexte phénologique, mais ni la latitude ni la semaine
de l'année. Une fonction à six paramètres l'aurait laissé sans deux d'entre eux.
Le contexte porte donc désormais ce dont il est FAIT, et la fonction ne prend
plus que deux contextes et un instant — sans une ligne de protocole à changer.
**La leçon de `causeLente`, appliquée à temps cette fois.**

**Recalculer plutôt qu'interpoler, dès que l'entrée est dérivable.** Interpoler
la durée du jour coûte jusqu'à 4,37 minutes, soit 6 % de la largeur de la porte
photopériodique — assez pour décaler un débourrement. La recalculer depuis le
jour de l'année ne coûte rien et ne se trompe pas. Seuls les degrés-jours sont
interpolés, et ce n'est pas une approximation : le tick les accumule par un
apport hebdomadaire unique tiré d'une seule température, donc l'incrément
journalier est constant et la droite EST la courbe.

**« Le même modèle lu plus fin » est une propriété qui se vérifie.** Aux deux
bouts, l'instant fractionnaire rend EXACTEMENT les semaines qu'il relie — zéro
d'écart, pas « proche ». C'est ce qui empêche le rendu et le tick de peindre
deux printemps différents, et c'est le premier essai du fichier.

## Ce qu'un lot plus ancien a appris (les deux seuils du pH, #161)

L'eau distingue depuis toujours un CONFORT, qui ralentit la croissance, et un
STRESS, qui tue. Le pH n'avait qu'un facteur pour les deux, si bien qu'une
espèce au bord de son amplitude ne pouvait pas pousser mal ET tenir. Aucun point
de réalisme n'est gagné : C7 était déjà ✅, il est réparé.

**Le défaut était pire que l'issue ne le disait, et c'est le CONTRÔLE qui l'a
montré.** L'issue parlait de mort « à la borne déclarée ». En retirant le
mécanisme pour vérifier que l'essai tombe, j'ai vu mourir aussi les PINS — à
pH 4,2, c'est-à-dire confortablement à l'intérieur de leur gamme 4–7,5, où leur
facteur vaut 0,336 quand le seuil de stress est à 0,45. L'ancien moteur tuait
donc partout dans la rampe basse, jusqu'à 0,7 pH DANS l'amplitude. **Un contrôle
ne sert pas qu'à valider : il mesure l'ampleur de ce qu'on répare, et elle est
parfois plus grande que l'énoncé.**

**Un banc qui confond deux facteurs ne prouve rien.** Le cas évident était le
hêtre sur la lande sableuse, dont le pH (4,50) est pile sa borne. Avant le lot
il y mourait de `solHorsGamme` — parfait. Après, il y mourait toujours, de
`secheresse` : une lande SÈCHE tue un hêtre par l'eau avant de le tuer par
l'acidité, et le banc ne disait donc plus rien de mon mécanisme. Il a fallu
fabriquer une station qui ne diffère QUE par le pH — le limon riche, même
texture, même nappe, même azote, pH abaissé. **Quand un banc doit prouver
l'effet d'un facteur, il faut une station qui ne varie que par lui ; une station
réaliste en fait varier plusieurs à la fois.**

**Livrer l'énoncé, pas son approximation.** Mon premier jet séparait bien
croissance et survie, et passait tous les contrôles que j'avais prévus. Mesuré
par acquit de conscience à cinquante ans : le hêtre était vivant à 19 sur 20…
et toujours à ses 0,30 m de plantation, sans avoir grandi d'un millimètre ni
risquer de mourir. Des nains immortels. L'issue dit « pousse mal ET tient », pas
« ne pousse pas et tient » : il manquait une queue de croissance dans la marge.
**Relire ce que l'issue demande APRÈS avoir mesuré, pas seulement avant : un
mécanisme peut passer tous ses essais et rater sa phrase.**

**Une garantie structurelle vaut mieux qu'une mesure rassurante.** La crainte du
lot était de déplacer les tables de production, seul ancrage terrain du dépôt.
Plutôt que de mesurer et d'espérer, la conception la rend impossible : la queue
ne vit qu'HORS de l'amplitude déclarée, et aucune espèce n'est calée hors de la
sienne. Un essai le pose pour les 26 espèces sur toute leur gamme — `phFactor`
rend exactement l'ancienne valeur. La mesure a confirmé (16,31 / 16,56 / 16,77 /
17,49, identiques au bit près), mais elle n'était plus le garant. **Quand on
peut construire l'invariance au lieu de la constater, la construire.**

**Et une assertion qui testait la platitude en croyant tester la continuité.**
J'exigeais moins de 0,01 d'écart entre `min − 0,01` et `min + 0,01`, alors qu'une
rampe de pente 1/0,7 bouge de 0,014 sur cet intervalle rien qu'en étant continue.
Le seul essai qui tombait était le mien. La bonne formulation est celle qui
distingue un saut d'une pente : **un saut ne s'efface pas quand ε tend vers
zéro.** Un coude reste légitime ; une marche, non.

**Enfin, une imprudence de méthode à ne pas refaire** : j'ai lancé en tâche de
fond un contrôle qui MUTILE le moteur pendant que j'éditais les mêmes fichiers.
Pendant plusieurs minutes, l'arbre de travail portait deux amputations
volontaires, et un commit à cet instant les aurait figées. Un contrôle
destructeur tourne au premier plan, ou sur une copie.

## Ce qu'un lot plus ancien a appris (la brousse n'est pas un arbre, #154)

Né d'une question de partie : « ça bloque quand on veut planter à moins d'un
mètre d'un autre arbre — est-ce que ça fait ça même à côté d'une ronce ? ».
Oui, et deux autres symptômes tenaient à la même cause : `state.trees` mêle un
chêne de trente mètres et un brin de ronce, et presque tout le code les traite
pareil. Aucun point de `realisme.md` n'est gagné ; deux ✅ qui tenaient sur la
moitié de ce qu'ils annonçaient sont réparés.

**La meilleure ancre est parfois une constante du dépôt lui-même.** Débroussailler
335 ronces coûtait 822 h/ha. Inutile d'aller chercher une source : le fichier
d'à côté écrit `FAUCHE_HOURS_M2_MAIN = 0,006`, commenté « 60 h/ha, le vrai prix
d'un dégagement quand un engin ne peut pas entrer ». Le moteur se contredisait
d'un facteur quatorze sur le même geste. **Avant de chercher une ancre dehors,
regarder si le moteur en porte déjà une pour ce geste-là** — une contradiction
interne est plus facile à défendre qu'un chiffre importé, et plus difficile à
contester.

**Un modèle juste tombe sur l'ancre sans qu'on le règle.** Le débroussaillage
est facturé à la SURFACE de houppier, au tarif du dégagement. Sur la friche, les
houppiers de ronce couvrent 2 911 m² d'une parcelle de 2 500 : le modèle donne
17,5 h là où les 60 h/ha en donnent 15. Rien n'a été calé pour y tomber, et la
forme a les bonnes limites aux deux bouts — un tapis continu coûte le plein
tarif, des brins épars coûtent à proportion. **Quand un modèle atteint l'ancre
sans réglage, c'est le signe qu'on a trouvé la bonne grandeur ; quand il faut
tourner un bouton pour l'atteindre, on enregistre le moteur.**

**Deux questions voisines n'appellent pas la même grandeur.** J'avais d'abord
annoncé que TOUT devait se caler sur l'individu, au nom de la règle « on raisonne
par individu ». C'était faux pour l'une des deux : le seuil du mètre ne dit pas
« il y a un obstacle », il dit « on ne met pas deux futurs arbres l'un sur
l'autre » — donc un semis de chêne de trente centimètres doit bloquer, et une
ronce adulte non. C'est le POTENTIEL de l'essence qui décide là (`hauteurMaxM`,
un trait déclaré, donc permis), et la taille de l'INDIVIDU qui décide du prix du
geste. **Avant de choisir la grandeur, écrire ce que la règle affirme** ; deux
règles qui se ressemblent peuvent lire deux choses opposées.

**Une punition que la simulation produit déjà ne se réécrit pas.** Le surcoût de
dégagement d'un potet est d'une minute contre une heure de plantation, et la
tentation était de le gonfler pour « faire jeu ». Mesuré : à emplacements et
graine identiques, quinze ans plus tard, **29 % de survie dans les ronces contre
48 % après débroussaillage**. Le vrai prix d'une plantation dans un roncier est
l'étouffement, et le moteur le calcule tout seul par la lumière. **Gonfler un
coût pour créer une friction que la simulation produit déjà, c'est la compter
deux fois** — et remplacer un résultat par une affirmation.

**Et un banc qui mesurait la recolonisation.** Ma cohorte était « les arbres dont
l'id dépasse celui d'avant la plantation » : sur une friche, qui régénère seule,
ça comptait surtout les recrues spontanées — 83 emplacements, « 439 plantés ».
Puis, corrigé par les identifiants que l'action rend, le dénominateur restait
faux : je comptais les tiges encore PRÉSENTES, or un mort finit par être retiré
du tableau quand sa chandelle tombe, si bien que les morts disparaissaient du
calcul. **Sur une parcelle qui vit, une cohorte se désigne par ce que l'action a
rendu, et se compte sur ce qu'on a posé.**

## Ce qu'un lot plus ancien a appris (l'origine du stress, #153)

Trouvé en vérifiant une réserve de #149 — *« si en route un dégât s'avère muet
dans l'instantané »*. Il y en avait un : les ravageurs et les maladies
ajoutaient leurs dégâts au scalaire `stress` et n'étaient nommés qu'à la MORT de
l'arbre. Aucun critère de `realisme.md` ne bouge : le mal était déjà modélisé, il
était seulement anonyme.

**Un mécanisme juste mais muet ne vaut rien pour le joueur.** Soixante
abricotiers, vingt-cinq ans : 592 unités de dégâts infligées, **zéro nommée**,
parce qu'aucun arbre n'en mourait et que `causeMort` était la seule sortie. Le
moteur avait raison sur ce qui se passait et ne savait pas le dire. **Avant de
juger qu'un mécanisme est complet, demander ce que le joueur peut en LIRE** — un
effet qui n'atteint jamais l'instantané n'existe pas pour lui.

**La forme du signal dicte celle de l'interface, et elle se mesure.** 75 444
coups sur vingt-cinq ans et soixante arbres, soit environ un par arbre et par
semaine, médiane 0,0053, seuls 1,4 % au-dessus de 0,05. C'est une pression
CONTINUE avec des pointes, pas une suite d'épisodes — donc un niveau attribué,
pas un flux d'événements qui aurait produit 75 000 lignes de journal. **La
distribution d'un signal se regarde avant de décider comment l'exposer** ; le
cumul seul aurait fait choisir l'inverse.

**Le prorata se calcule UNE FOIS, pas par origine.** `stressLent` s'amortissait
déjà au prorata quand l'arbre cicatrise. En ajoutant deux origines, la tentation
était de recopier la formule trois fois. Un rapport unique, appliqué à chacune,
dit la vraie règle — « le stress a reculé d'autant, donc chaque provenance
recule d'autant » — et rend impossible d'en oublier une le jour où il y en aura
quatre. L'invariant qui en découle, `somme des origines ≤ stress`, est éprouvé
sur trois bancs, et il TOMBE dès l'an 1 si l'on soustrait une origine à
l'amortissement (vérifié).

**Deux champs plutôt qu'un registre, et la raison est écrite dans le code.** Un
`Partial<Record<CauseMort, number>>` serait extensible et se lirait mieux ; il
coûterait un objet de plus par arbre et par semaine dans la boucle la plus
chaude du moteur, pour nommer deux causes. Le choix est noté sur le champ avec
sa condition de révision, pour qu'on ne le repropose pas sans raison neuve.

**Et, pour la troisième fois de suite, un banc qui n'exécutait pas le code.**
Les trois bancs plantaient abricotier, pommier, aulne, saule — et la chalarose
du frêne est la SEULE maladie de l'atlas. La moitié « maladie » du lot allait
être livrée sans avoir jamais tourné, en vert. **Quand un mécanisme dépend d'une
table (espèces, maladies, cultures), lire la table avant d'écrire le banc** : la
question n'est pas « mon essai passe-t-il » mais « quelle ligne de la table
déclenche ce code, et est-elle dans mon banc ».

**Une frontière franchie exprès, et dite.** J'avais écrit dans #153 que relayer
`causeLente` jusqu'à l'instantané était un travail côté jeu. Je l'ai fait ici
quand même : livrer un journal capable de dire « attaqué par des ravageurs » et
muet sur « il dépérit de sécheresse » aurait été livrer la moitié la plus rare
en laissant la plus fréquente. **Une frontière se franchit quand la respecter
rendrait la livraison incohérente — à condition de le dire.**

## Ce qu'un lot plus ancien a appris (le préavis de refus, #139)

Un lot sans écologie : le jeu voulait dire « ce clic sera refusé, et voici
pourquoi » AVANT le clic, ce qui demande de savoir si `applyAction` refuserait
sans l'appliquer. Aucun critère de `realisme.md` ne bouge — ce lot n'affirme
rien sur le monde, et il vaut mieux l'écrire que de gonfler le référentiel d'une
ligne qui n'y a pas sa place.

**Mesurer avant de concevoir : la parade prudente était la seule à être
impossible.** Deux chemins s'offraient. Extraire de chaque `applyXxx` sa
décision de refus donnait une règle unique, au prix d'une réécriture des vingt
et une actions. Appeler `applyAction` et ne garder que les refus ne pouvait pas
se désynchroniser, mais supposait deux choses. Les deux ont été mesurées plutôt
que pariées : `applyAction` coûte 1,8 ms au pire sur une parcelle pleine, contre
**53 ms** pour copier l'état d'abord. La copie défensive — le réflexe — coûtait
trente fois le danger qu'elle écartait, et elle seule rendait le préavis
impossible. **Quand deux conceptions s'opposent sur un risque, le chiffre qui
tranche est souvent celui du coût, pas celui du risque.**

**Un chemin de refus ne prouve rien sur le chemin de travail.** Ma première
sonde déclarait les vingt-cinq actions pures. Elle mentait : onze d'entre elles
avaient été REFUSÉES — pas de broyat en stock, hors fenêtre de semis, l'engin
qui ne manœuvre pas — et une action refusée rend l'état d'entrée tel quel, donc
passe trivialement. Le code qui écrit, le seul qui pourrait muter, n'avait
jamais tourné. Il a fallu construire un état par action pour la faire
travailler : des charmes pour trogner, une lande sableuse et trente ans pour le
liège, un blé semé puis mûri pour la moisson. **Un essai de non-mutation qui ne
fait pas TRAVAILLER le code n'éprouve rien.**

**Un essai doit vérifier sa propre prémisse, et ça a servi dans l'heure.** Chaque
cas déclare ce qu'il attend — `travail` ou `refus` — et un premier essai vérifie
que c'est bien ce qui se produit. En réduisant la parcelle de 100 à 40 m pour
tenir le coût, le cas « labourer entre des arbres serrés » a cessé d'être
refusé : moins d'arbres, l'engin passe. Sans cette vérification il serait resté
vert en n'éprouvant plus rien. **Un cas qui cesse d'atteindre ce qu'il visait ne
se signale jamais tout seul.**

**Une propriété devient un contrat quand le compilateur et la suite la
tiennent.** La table des cas est un `Record<GameAction["type"], Cas[]>` : une
action neuve qu'on oublierait ne compile pas — vérifié en retirant une clé. Et
l'essai attrape bien une écriture en place — vérifié en en injectant une, qui
ressort nommée (`.soil.mineralNG[0] : 3,687 → 4,687`). **Les deux contrôles se
font dans les deux sens : qu'il échoue quand il doit, pas seulement qu'il passe.**

**Le pari change de nature quand il change de côté de la frontière.** L'issue
refusait que le jeu appelle `applyAction` et jette l'état : « le jeu n'a pas le
droit de parier sur du code dont il n'est pas responsable. » C'est juste, et
c'est pourquoi `prevoirAction` vit dans le moteur. Le pari n'a pas disparu, il a
changé de propriétaire — et celui-là peut le défendre, parce que c'est son code
et qu'il a une suite pour ça. **Une garantie qu'un module ne peut pas donner,
son voisin la donne parfois sans effort.**

## Ce qu'un lot plus ancien a appris (la fertilisation, #140)

**Une courbe de réponse ne s'écrit pas, elle se vérifie.** L'apport remplit le
pool d'azote, et le rendement y répond par la satisfaction de la strate — la
même que celle des arbres. Rien n'a été codé, et les paliers de Broadbalk
sortent monotones (1,01 / 2,40 / 3,21 / 3,92 / 4,88 t/ha) avec un point zéro
juste. **Quand un mécanisme amont existe déjà, la courbe aval est un RÉSULTAT :
l'écrire serait s'interdire de la mesurer.**

**Chercher le plafond, ne pas le supposer.** Le moteur s'arrêtait à 4,88 t/ha
là où Broadbalk monte à 8-9, et la tentation était d'accuser la culture ou la
dose. Le diagnostic — deux lignes de relevé sur l'état du sol — donne
`tassement = 1,000` : quatre passages d'engin par an contre 0,20 de réparation,
et le sol perd 30 % de croissance pour toujours. **Un plateau net dans une
mesure est presque toujours un facteur limitant qu'on n'a pas regardé**, et
c'est ce qu'il faut aller lire avant de toucher au mécanisme qu'on vient
d'écrire.

**Un proxy vieillit quand le moteur s'enrichit.** La densité racinaire qui
répare le tassement était lue sur `1 − groundLight`, c'est-à-dire sur le COUVERT
DES ARBRES. C'était défendable tant que seuls les arbres avaient des racines ;
mon lot précédent ajoute une plante enracinée SANS canopée, et le proxy s'est
mis à dire qu'un champ de blé ne répare rien. **Après un lot qui ajoute une
catégorie d'êtres, relire les proxys qui décrivaient les anciens** — ils
parlaient d'un monde où la nouvelle catégorie n'existait pas.

**Savoir s'arrêter à la frontière de son rôle, mais pas avant.** L'autre moitié
du même défaut — le labour qui ne décompacte jamais, et 0,25 de tassement par
passage — est une calibration, donc de la maintenance : issue ouverte, et la
dépendance écrite des deux côtés. Mais la moitié causée par MON lot (le proxy
racinaire) a été corrigée ici, parce que la passer à quelqu'un d'autre aurait
été lui demander de réparer ce que je venais de casser. **La règle route les
calibrations, pas les conséquences de son propre travail.**

**Et un lot peut en débloquer un autre pour de bon.** E13 était 🟡 parce que le
gradient d'une allée mesurait surtout l'azote que la litière rendait à un blé
qui s'épuisait — le rapport passait au-dessus de 1. Les deux côtés fertilisés,
c'est de l'ombre pure : monotone de 0,999 à 0,787, et le critère passe ✅. **Un
🟡 dont la justification nomme un manque précis est une dette qui s'éteint d'un
coup le jour où le manque est comblé** ; ça vaut la peine de les écrire ainsi.

## Ce qu'un lot plus ancien a appris (la culture, #136)

**Une heure de littérature AVANT d'écrire, et elle a changé le mécanisme.** Je
partais sur « moins de lumière, moins de grain ». La mesure dit l'inverse en
Méditerranée : blé et orge font +19 % de rendement à 50 % d'éclairement, et le
même +19 % à 90 % — un plateau, en serre IRRIGUÉE, donc pas une économie d'eau
mais un excès de lumière au départ. Le moteur portait déjà la forme qu'il
fallait, la SATURATION de la fiche herbacée, et il n'y avait aucun mécanisme à
ajouter. **Chercher la réponse d'une espèce dans la littérature de l'espèce, pas
dans le dispositif qu'on veut reproduire.**

**Caler sur un chiffre, valider sur un AUTRE chiffre de la même source.**
Broadbalk donne les deux bouts du blé : 8-9 t/ha pleinement fumé, ~1 t/ha sans
aucun apport, tenu sur cent soixante-dix ans. Le plafond de la fiche est calé
sur le premier ; le moteur n'ayant pas de fertilisation, il doit descendre de
lui-même vers le second — mesuré 1,02 t/ha à l'an 24, sans que rien ne l'y
pousse. La même source, deux chiffres, et la validation ne doit rien au calage.

**Une normalisation peut rendre un plafond INATTEIGNABLE par construction.** Le
grain était l'intégrale de l'assimilation divisée par le nombre de semaines de
culture — ce qui suppose un feuillage plein toute la saison, que nul blé ne
fait. Le plafond de 7 t/ha devenait donc hors d'atteinte quoi qu'il arrive, et
le champ ne voulait plus dire ce que son commentaire promettait. La forme juste
est un RAPPORT — ce qui a été assimilé sur ce qui l'aurait été sans limite — et
elle ne demande aucune constante. **Quand un maximum déclaré n'est jamais
approché, suspecter le dénominateur avant la physique.**

**Un mécanisme qui échoue en SILENCE est pire qu'un mécanisme absent.** Semer
dans un tapis fermé posait une emprise nulle, réussissait, et la moisson
annonçait « rien à moissonner » neuf mois plus tard sans que rien n'ait dit
pourquoi. Le refus existe maintenant et il dit quoi faire. **Un geste dont
l'échec ne se voit qu'à la saison suivante doit refuser tout de suite.**

**Et mon dispositif a manqué son témoin, deux fois dans le même lot.** Le banc
du gradient comparait une allée à un blé pur qui S'ÉPUISAIT : je mesurais donc
l'apport d'azote des noyers bien plus que leur ombre, et l'allée passait
au-dessus du témoin. Puis l'essai du refus de semis semait sur une parcelle
NEUVE, qui n'est pas un tapis fermé — il ne créait pas la condition qu'il
testait. **Avant de lire un rapport, vérifier que le dénominateur est dans
l'état qu'on croit.**

**Retrouver le bon chiffre pour la mauvaise raison reste un résultat, à
condition de le dire.** L'observation de Dupraz — « pas beaucoup affecté sous
H/L 0,8 » — est reproduite : 1,007 à H/L 0,84. Mais chez lui l'allée est
fertilisée, donc son seuil est de l'ombre pure, quand le nôtre est une
compensation entre l'ombre qui coûte et la litière qui rend. Le critère reste
🟡 pour cette raison, et pas parce que le chiffre serait mauvais. **Un accord
numérique dont on ne sait pas décomposer les termes n'est pas une validation.**

## Ce qu'un lot plus ancien a appris (le calendrier des fleurs, #70)

**Le verrou était un DÉCOUPAGE, et il se voyait en listant les fiches.** La
date de floraison vivait dans le bloc `fruits`, réservé aux essences dont on
récolte quelque chose. Sept espèces qui nourrissent réellement les
pollinisateurs n'en avaient donc aucune — aubépine, saule, ajonc, genêt,
callune, houx, fusain — et bâtir la ressource florale là-dessus aurait fabriqué
des trous qui n'existent pas : le moteur aurait dit qu'une lande girondine ne
nourrit personne, alors que l'ajonc et la callune en font une pâture d'abeilles
presque toute l'année. **Avant d'écrire un mécanisme qui lit un champ, lister
qui le porte et qui ne le porte pas** : l'absence dessine le découpage mieux que
la présence.

**Un champ dont le contenu est le ZÉRO.** `nectar` vaut zéro pour le noisetier
et le noyer, qui fleurissent abondamment et dont le pollen part au vent. Ce
n'est pas une valeur par défaut faute de mieux, c'est l'information : l'indice
de biodiversité les comptait comme une ressource, si bien qu'une noiseraie
affichait des floraisons étalées sans nourrir personne. **Quand un trait vaut
zéro pour une raison qu'on sait nommer, le déclarer plutôt que l'omettre** —
l'omission se lit « pas encore instruit », le zéro se lit « et voici pourquoi ».

**Le thermomètre, QUATRIÈME lot de suite, et cette fois deux fois dans le même
lot.** La ressource florale mesurait d'abord une QUANTITÉ de nectar là où il
fallait une ADÉQUATION : `min(habitat, florale)` avec un habitat à 0,5 et une
ressource à 0,10 ne départageait rien, il remplaçait silencieusement le premier
facteur par le second. Puis elle mesurait le nectar du seul DISQUE DE HOUPPIER
là où il fallait une portée de butinage. Les deux fois, la relecture ne disait
rien et la mesure disait tout. **Quand un facteur limitant nouveau est
systématiquement plus petit que celui qu'il accompagne, ce n'est pas un facteur
de plus : c'est un remplacement, et l'échelle est fausse.**

**Écrire à côté d'une solution que le dépôt possède déjà.** La portée de
butinage était résolue depuis longtemps, à trois fichiers de là, commentaire
compris : `ravageurs.ts` agrège par blocs de 10 m sur une fenêtre de 3×3 « parce
qu'évaluer la richesse cellule par cellule donnait toujours une seule essence ».
La note connaissait la faute inverse — réutiliser une fonction sans relire sa
définition ; celle-ci est sa jumelle. **Avant d'écrire une agrégation spatiale,
chercher si le moteur en a déjà une, et à quelle échelle.**

**Un étalon de temps mesuré AILLEURS n'est pas un étalon.** Le coût du lot a
d'abord été annoncé à +30 %, mesuré contre un arbre de travail séparé dont le
`node_modules` était un lien symbolique. Ce seul changement d'environnement
déplaçait le chiffre de 25 % — cinq fois l'effet cherché. Mesuré dans le même
répertoire avec le même script : +6 %, et ça recoupe le témoin par
neutralisation du bloc. **Un chronométrage se prend dans le même processus, le
même répertoire et la même arborescence de modules**, ou il ne se prend pas.

**Un dispositif peut passer pour la raison qu'on veut réfuter.** L'essai
historique de G4 — « un verger nu produit moins que le même verger dans un
environnement diversifié » — plantait une haie de noisetier, chêne pubescent et
bouleau. Les TROIS sont anémophiles. Il passait parce que le service ne lisait
que l'habitat, qui compte la richesse en essences : le moteur affirmait donc que
planter trois arbres pollinisés par le vent améliore la nouaison d'un verger de
15 %. Le lot l'a fait tomber à +0,9 %, et c'est la correction d'une affirmation
fausse, pas une régression. L'essai garde son énoncé, se donne une haie
mellifère (+28,0 %) et **conserve la haie anémophile comme TÉMOIN** : c'est elle
qui sépare « des voisins » de « des voisins qui nourrissent ». **Quand un lot
fait tomber un essai qui défendait le critère qu'il renforce, regarder d'abord
le dispositif de cet essai** — il mesurait peut-être ce que le lot vient
justement de réfuter.

**Et trois mesures concurrentes ne font pas trois mesures.** J'ai lancé deux
chronométrages et une suite d'essais en parallèle ; les trois sont invalides, et
la suite a failli expirer pour une raison qui n'avait rien à voir avec elle. Le
corollaire de « ne pas modifier le moteur pendant qu'une suite tourne », et il
mérite d'être écrit à part : **une mesure de TEMPS veut la machine pour elle
seule.**

## Ce qu'un lot plus ancien a appris (les mycorhizes, #115)

**Un invariant ne garde que le côté qu'il ferme.** Le bilan d'azote du tick
vérifiait « minéralisation = prélèvements + lessivage + Δstock » depuis toujours,
C1 était ✅, et 11,6 % de l'azote prélevé sur un limon pauvre sortait du sol pour
n'arriver dans aucune plante. Le bilan était EXACT : « prélèvements » compte ce
qui sort, et ce qui sort sortait bien. **Un transfert a deux côtés ; l'invariant
n'était écrit que sur celui du départ.** Quand une grandeur passe d'un pool à un
autre, écrire l'égalité du départ ET celle de l'arrivée — ici deux flux de plus
(`uptakeArbresKgHa`, `uptakeHerbeKgHa`) et une ligne d'essai.

**Le défaut n'était pas celui que l'issue décrivait, et l'issue était de moi.**
Elle diagnostiquait un mécanisme mal placé — un gain porté sur une fraction
d'accès ne crée rien, il accélère une course — et proposait de le déplacer vers
la minéralisation. Vrai, et hors sujet : la cause était que le gain figurait dans
la passe de DEMANDE et pas dans celle de SERVICE. Le peuplement vidait la cellule
à hauteur d'une demande gonflée et se servait sur une demande non gonflée.
**Relire le code avant d'appliquer le remède que l'issue propose, même quand
c'est soi qui l'a écrite** : une issue est un signalement, pas un diagnostic.

**La même grandeur calculée deux fois est un défaut en attente.** Le correctif
n'ajoute pas le facteur manquant au second endroit : il RANGE le gain une fois
par arbre (`gainMyco[t]`, à côté de `rootCells` et `rootFractions`) et fait lire
les deux passes dans le tableau. La différence compte — la première forme se
remet à diverger au prochain qui touche une passe, la seconde ne le peut plus.
La demande d'azote du tapis a été rangée de la même façon, parce qu'elle avait
exactement la même faille en germe.

**Le témoin par neutralisation a donné un ZÉRO EXACT, et c'est ce qui a permis de
conclure.** Avec `GAIN_ABSORPTION = 0`, le manquant tombe à 0,0 g sur quatre
campagnes — pas « petit », nul. Un écart résiduel aurait voulu dire qu'une
seconde cause traînait. **Quand un témoin peut rendre un zéro exact plutôt qu'un
petit nombre, le construire ainsi** : il transforme une corrélation en
démonstration.

**Reproduire la panne AVANT d'écrire le garde-fou.** La nouvelle propriété a été
lancée dans les deux sens : elle passe avec le correctif, et elle échoue sur les
quatre stations sans lui (écarts de 8·10⁻⁷ à 4·10⁻⁵ kg/ha). Un essai qu'on n'a
jamais vu rouge ne garde rien de démontré.

**Et ma propre mesure intermédiaire était fausse, sur deux graines.** J'avais
annoncé un volume « bruité, +1,6 % et −1,2 % » sur sol pauvre, sur un banc de
trente-six tiges avec une formule de volume écrite à la main. Refait sur le banc
de l'issue — vingt-cinq tiges, `volumeTigeM3` du moteur, cinq graines — c'est
+2,33 à +3,27 %, cinq fois sur cinq. **Deux graines et un thermomètre improvisé
ne font pas une mesure**, même pour se faire une idée : l'idée qu'on s'en fait
survit ensuite à la vraie mesure si on ne la refait pas.

## Ce qu'un lot plus ancien a appris (le port serré, #105)

**Mesurer la grandeur candidate AVANT de la choisir, et accepter qu'elle perde.**
Le premier jet faisait porter le resserrement sur la PROFONDEUR de houppier
(`baseHouppierM`), qui est la variable que le moteur fait déjà réagir à l'ombre
— c'était élégant, et c'était le mécanisme voisin. Relevé sur une hêtraie serrée
de quatre-vingts ans : 0,90 pour le dominant, 0,90 pour la tige médiane, 0,90
pour la perche. Elle ne discrimine RIEN, parce qu'une essence tolérante garde son
houppier bas. L'élancement, lui, donne 49 / 46 / 90 sur les trois mêmes tiges.
**Une variable candidate ne se juge pas sur sa signification mais sur son
étendue mesurée dans le peuplement du moteur** : trois lignes de relevé avant
d'écrire la formule.

**Un manque connu du référentiel peut n'avoir aucun coût, jusqu'au lot qui le
lui donne.** B10 traînait en 🟡 depuis l'origine et personne n'y perdait rien :
tant que l'ombre ne faisait pas filer les dominés, un houppier calculé sur la
hauteur ne mentait pas beaucoup. L'étiolement (#97) l'a rendu cher du jour au
lendemain — l'effet protecteur du mélange contre les ravageurs est tombé de
2,66–3,07 × à 1,88–2,24 ×, parce que `ravageurs.ts` épand la vulnérabilité sur le
disque du houppier et qu'une perche recevait celui d'un dominant. **Après un lot
qui change une grandeur, relire la liste des MANQUES, pas seulement celle des
essais** : la file d'attente se réordonne toute seule, et le suivant était déjà
écrit dans le référentiel.

**La garantie d'identité, deuxième fois de suite — et cette fois elle était
offerte.** `diametreInitialCm` pose `D = 2 h`, donc H/D 50 ; caler la nouvelle
loi pour croiser l'ancienne à cet élancement-là ne coûte aucune constante
calibrée et rend le lot rigoureusement neutre sur toute tige normalement
conformée. Le rayon d'explosion d'un changement qui touche seize appels est
ainsi borné aux tiges déformées, et ça se démontre au lieu de s'espérer
(`toBeCloseTo(..., 10)`). **Chercher l'élancement, le pH, l'âge où la nouvelle
loi doit rendre l'ancienne : le moteur pose presque toujours ce point
quelque part.**

**Refuser ce que la formule emporte gratuitement.** `crownRadiusM` est aussi
appelée par `rootRadiusM` et par `treeWaterDemandL` : il aurait suffi de ne rien
faire pour qu'une perche prospecte un disque racinaire plus petit et transpire
moins. Ce sont deux affirmations DISTINCTES de la largeur de sa couronne, chacune
avec sa propre littérature, et les empiler rendait le lot immesurable — le disque
racinaire commande l'eau et tous les nutriments. Les deux appels sont restés sur
la forme de référence, avec le refus écrit dans le code à l'endroit où la
tentation reviendra. **Quand un lot modifie une fonction que plusieurs mécanismes
appellent, l'affirmation se vérifie appel par appel** ; « ça vient tout seul »
n'est pas un argument, c'est l'absence d'un.

**Un garde-fou se reconnaît à ce qu'il ne mord sur rien, et ça se teste.** Le
plafond d'élargissement (1,6 ×, soit H/D 31) existe pour qu'un recépage ou une
trogne rabattue ne reçoive pas une couronne absurde. L'essai n'affirme pas sa
valeur — il affirme qu'il est **sous** tout ce que le moteur produit aujourd'hui
(le plus trapu mesuré est à 35). Le jour où il se met à mordre, l'essai tombe et
dit la vraie nouvelle : une tige anormalement courte est apparue. **Un plafond
qu'on ne sait pas ancrer reste honnête tant qu'on épingle son inactivité** ;
sinon c'est une calibration déguisée en sécurité.

**Et le thermomètre, quatrième lot de suite — sauf qu'ici le thermomètre était le
SEUIL.** Trois essais écologiques sont tombés, tous marginalement, et aucun n'a
été rattrapé en ajustant le chiffre. Celui de la succession avait déjà descendu
deux fois (0,70 → 0,65, puis 0,68 → 0,57 mesuré) : **un seuil qui descend trois
fois n'enregistre pas le monde, il enregistre le moteur.** Il a été remplacé par
l'affirmation de son propre titre — la canopée est MAJORITAIREMENT pionnière,
donc 0,5 — qui ne se renégociera plus. Les deux autres ont suivi la même règle :
on garde l'AVANTAGE de l'aulne (marge 5 %) et l'ORDRE de l'aubépine (1,5 ×), pas
leur ampleur. Quand un essai tombe pour une raison juste, se demander si son
énoncé a besoin du chiffre.

## Ce qu'un lot plus ancien a appris (le budget carbone, #96)

**Construire le TÉMOIN, et pas seulement la mesure.** Le résultat du lot n'est
pas « la hêtraie tombe à 415 tiges/ha », c'est l'écart entre 415 et les 2 231 du
même banc avec la seule constante du mécanisme mise à zéro. Sans ce témoin, on ne
sait pas si le mécanisme fait le travail ou si c'est le reste du moteur. Ici il a
tranché une vraie question : les ravageurs signant 293 morts sur 295, on pouvait
croire que le budget carbone ne faisait qu'accompagner une mortalité qui existait
déjà. Le témoin montre qu'elle n'existait pas — deux chablis, et rien d'autre.
**Neutraliser une constante est presque toujours possible, et ça coûte une
mesure de plus.**

**Valider sur ce qui ne dépend PAS de la constante qu'on ne sait pas ancrer.**
Le niveau de densité maximale (l'indice SDI) est un chiffre qu'on trouve mal, et
s'y comparer aurait fait reposer la validation dessus. La PENTE de
l'auto-éclaircie, elle, est le vrai contenu de la loi de Reineke et ne dépend pas
du niveau : mesurée à −1,48 et −1,52 contre −1,605, donc dans la gamme des pentes
relevées essence par essence. **Chercher, dans la loi de référence, la partie qui
survit à l'ignorance de ses constantes.**

**Et ne pas s'attacher à un chiffre qu'une correction peut emporter.** Une
version intermédiaire donnait −1,606 et −1,591 — une coïncidence à trois
décimales avec la valeur canonique, que j'avais écrite partout, jusque dans un
message de commit. La correction de la cicatrisation hivernale, faite pour une
tout autre raison, l'a ramenée à −1,48. Le résultat n'a pas changé de nature, mon
récit de ce résultat si. **Refaire la mesure après le DERNIER correctif, jamais
avant.**

**Une échelle physique vaut mieux qu'une normalisation par espèce.** La charge
d'entretien suit la hauteur RÉELLE de l'individu (modèle du tube), pas sa hauteur
rapportée au maximum de son essence. La normalisation par espèce, essayée
d'abord, disait qu'une callune adulte dépense autant qu'un hêtre adulte — c'est
l'inverse du fait qu'on veut. **Quand une grandeur se rapporte à « un adulte »,
se demander adulte DE QUOI.**

**L'attribution n'est pas la cause, et le moteur ne les distingue pas.**
`causeMort` retient qui a franchi le seuil, pas qui a rempli le compteur : 293
morts de famine sortent étiquetées « ravageurs ». Physiquement juste comme coup
final, faux comme rapport au joueur. Issue de maintenance ouverte. **Un mécanisme
qui tue LENTEMENT ne récoltera jamais l'étiquette : la vérifier explicitement.**

**Le zéro dur, cinquième occurrence.** La cicatrisation conditionnée à
« puisement nul » basculait de 0,25/semaine à rien pour un centième de lumière.
Remplacée par une rampe. Mais la règle s'affine encore : le lot porte aussi un
zéro dur **volontaire** — le résidu de diamètre nul de #97 — et ce qui distingue
les deux est la PORTE DE SORTIE. Le zéro du cerne manquant est borné par
l'enveloppe de flambage ; celui de la cicatrisation ne l'était pas.

**La saison commande le DÉBIT, pas la position du budget.** Avoir mis le
puisement à zéro hors saison rendait la cicatrisation à plein régime six mois par
an — assez pour effacer chaque hiver la famine de l'été, sous un couvert CADUC
qui rouvre la lumière en janvier. Un semis de pin sous hêtraie survivait
indéfiniment, et c'est un essai existant qui l'a attrapé, pas une relecture.
**Un arbre dormant ne répare pas : la réparation se paie en carbone comme le
reste.**

**Et le thermomètre, pour la troisième fois de suite.** Deux essais de plus ont
dû changer de grandeur sans changer de conclusion — le réchauffement mesuré sur
la pullulation au lieu des morts, le frêne comparé au sol nu au lieu de son point
de départ. Ce n'est plus un accident, c'est une étape : **après un lot qui
change qui meurt, relire tous les essais qui COMPTENT des morts.**

**Ne pas modifier le moteur pendant qu'une suite tourne.** J'ai neutralisé une
constante pour un témoin alors que la suite complète était en cours : son
résultat était sans valeur et a dû être refait. Coût : une demi-heure. Copier le
fichier, ou attendre.

## Ce qu'un lot plus ancien a appris (l'étiolement, #97)

**Chercher la GARANTIE D'IDENTITÉ avant d'écrire le mécanisme.** Le partage
hauteur/diamètre a été construit pour redonner l'ancien calcul, au dernier
chiffre près, dès que la lumière n'est pas le facteur limitant. Ce n'est pas une
élégance : c'est ce qui borne le rayon d'explosion à la population visée, et ça
se teste (`toBeCloseTo(..., 9)`). Un seul essai du dépôt a bougé sur 870, sur un
lot qui touche la croissance de tous les arbres. **Se demander systématiquement
sur quel sous-ensemble le nouveau mécanisme doit être l'identité, et l'épingler
par un essai.**

**Dériver le mécanisme d'une fonction que le moteur possède déjà, plutôt
qu'inventer une loi.** Le budget de bois n'est pas approché : c'est la dérivée
de `volumeTigeM3`, avec laquelle le moteur vend déjà le bois. Zéro constante
nouvelle pour la partie « partage », et une propriété qui se démontre au lieu de
se calibrer — le lot n'ajoute pas un gramme de matière.

**Un équilibre de FLUX n'est pas un équilibre de RATIO, et je me suis trompé
de point fixe.** J'avais calculé l'élancement d'équilibre en annulant le terme
qui change de régime (« le bois suffit à payer l'allongement plein ») : H/D 75.
La mesure a donné 166 et ça montait. Le bon calcul annule la dérivée du
RAPPORT, c'est-à-dire égalise les croissances *relatives* : H/D 295. **Quand on
cherche où une proportion se stabilise, dériver la proportion — pas repérer où
un minimum bascule.** Et, comme toujours ici : mesurer avant de croire son
propre calcul.

**Un mécanisme qui REDIRIGE a besoin de sa butée.** Le partage seul s'emballe.
La butée n'était pas dans l'issue, elle est venue de la mesure, et elle est
physique : une tige trop élancée flambe. Un mécanisme qui déplace une ressource
d'un puits vers un autre doit se demander ce qui arrête le puits favorisé.

**Le zéro dur, quatrième occurrence — et cette fois il est VOULU.** Sous l'ombre,
le résidu laissé au diamètre est exactement nul, et c'est juste : c'est le cerne
manquant d'une tige dominée. La règle s'affine donc au lieu de s'appliquer en
bloc : **un zéro dur est acceptable quand il a une porte de sortie.** Ici
l'enveloppe de flambage : la tige finit par la rencontrer, et tout son bois
repart alors au diamètre. Vérifier la porte, pas seulement le zéro.

**Un essai peut mesurer la bonne chose avec la mauvaise grandeur.** L'effet
nurse lisait la HAUTEUR du chêne-liège en la prenant pour de la vigueur. Le lot
a séparé les deux : le sujet collé à sa nurse est devenu le plus HAUT des trois
et huit fois plus chétif (H/D 90). La conclusion écologique tenait — mesurée en
volume, elle est identique avant et après — mais le thermomètre était faux.
**Quand un mécanisme change ce que signifie une grandeur, relire les essais qui
la lisent, pas seulement ceux qui échouent.** Celui-là échouait ; combien
passaient pour la mauvaise raison ?

## Ce qu'un lot plus ancien a appris (le sanglier, #73)

**Refuser la généralisation que l'issue demande, quand elle ne décrirait rien.**
L'issue proposait d'élargir `gibier.ts` pour y loger le sanglier. Ce module est
bâti sur le broutage ; un sanglier ne broute pas. Un module à part, et le PATRON
partagé plutôt que le code : densité de contexte venue du paysage, répartition
au prorata de ce que la cellule offre, comptabilité qui tient. **Une abstraction
qui couvre deux cas en n'en décrivant aucun coûte plus cher que deux modules.**

**Chercher le trait qui existe déjà avant d'en ajouter un.** Les deux effets du
sanglier se lisent sur `regeneration.dissemination`, qui distinguait depuis
toujours les graines lourdes (`geai`, `gravite`) des légères. Aucun trait neuf,
aucune espèce nommée, et la tension geai ↔ sanglier sur le chêne tombe toute
seule. Le bon découpage se reconnaît à ça.

**Un trait qui porte le bon nom et ne dit pas la bonne chose.** Le sanglier
mangeait d'abord tout ce qui se disséminait par `geai` OU `gravite`, lu comme
« graine lourde ». Or `gravite` dit seulement que la graine tombe sous sa mère :
l'ajonc et le genêt y sont, avec leurs graines de deux millimètres. Le sanglier
s'est mis à manger de l'ajonc, les landes ont cessé de se ressemer, et un test
d'effet nurse est tombé — un pin abrité passait sous un pin nu. C'est la
deuxième fois de la session, après `windShelterAt` : **relire la DÉFINITION de
ce qu'on réutilise, jamais son nom.**

**Une normalisation au prorata concentre sans limite si on ne la plafonne pas.**
La part de parcelle retournée par an restait exacte — c'est une somme — mais sur
une lande sèche où deux cellules sur cent retiennent l'humidité, ces deux-là
étaient retournées 2,6 fois par an, indéfiniment : la strate herbacée n'y
repoussait plus et la callune disparaissait. Six conclusions écologiques sont
tombées ensemble. **Quand un effort se redistribue au prorata d'un attrait,
vérifier ce que devient la cellule la plus attirante**, pas seulement le total.

**Un anchor tiré de populations INVASIVES n'est pas un anchor pour la France.**
Les 7 à 11 %/an de sol retourné venaient de porcs féraux de Californie et
d'Argentine — sans prédateurs, sans chasse, à des densités sans rapport. La
prairie européenne donne 0,2 à 0,7 %. Deux pour cent situe un massif français
entre les deux. Même famille d'erreur que le seuil d'ancrage calé sur une seule
station : **vérifier d'où vient la population mesurée, pas seulement le milieu.**

**Le zéro dur, pour la TROISIÈME fois.** La consommation de la glandée
soustrayait linéairement : passé 1,8 fois la densité de référence il ne restait
exactement rien, et la régénération du chêne s'éteignait d'un coup. Avant, c'était
l'anémone à pH 4,0, puis le chêne-liège à pH 4,50 — dont le facteur de gamme vaut
zéro PILE à la borne. **Une grandeur qui peut atteindre un zéro dur bascule d'un
extrême à l'autre pour un centième de rien.** Préférer une forme exponentielle,
qui dit « presque plus rien » sans dire « plus jamais », et la chercher
systématiquement dans tout nouveau mécanisme.

## Ce qu'un lot plus ancien a appris (la dérive du pH, #71)

**Remplacer un ÉTAT par une LECTURE, quand c'en est une.** Le pH était une
variable libre ; il est devenu le taux de saturation d'un pool de bases. Le
refactor coûte peu — le tableau `soil.ph` reste, plus personne ne l'écrit sauf
un endroit — et il rend gratuites trois règles qu'il aurait fallu écrire, dont
« le même chaulage déplace un sable plus qu'une argile ». **Avant d'ajouter une
dérive à une grandeur, se demander si cette grandeur n'est pas déjà la
conséquence d'autre chose.** Et inverser la relation au démarrage, pour que les
stations partent exactement où elles déclarent partir.

**Reprendre une fonction voisine sans reprendre son ÉCHELLE.** Le lessivage des
bases a été copié de celui du potassium : bonne forme, bonne physique, trois
ordres de grandeur d'écart, parce que les deux pools n'ont pas la même taille.
Un limon neutre tombait au plancher d'acidité en vingt-cinq ans. **Quand on
copie une loi d'un autre élément, recaler sa constante sur un FLUX mesuré, pas
sur la ressemblance des formules.**

**Un facteur d'accélération n'est gratuit que si son débit l'est aussi.** Les
mycorhizes accélèrent l'altération de la roche (×2 à ×5) et le moteur en
crédite le phosphore et le potassium — qu'il débite aussi au prélèvement.
Appliqué aux bases, qui ne sont pas débitées, le même facteur fabriquait de la
matière : une hêtraie faisait REMONTER le pH de son sol. **Un crédit sans
débit est un bug, même quand le mécanisme physique existe.**

**L'issue peut se tromper sur l'écologie, et il faut le vérifier avant de
coder.** Celle-ci posait « les résineux acidifient, les feuillus maintiennent ».
Les mesures disent que le hêtre acidifie la profondeur plus que l'épicéa, et que
la litière d'épicéa porte deux fois le calcium de celle du pin sylvestre. Le
trait retenu n'est donc pas un type de feuillage mais une teneur en calcium —
une grandeur qui se mesure, et dont toute la chaîne causale a été mesurée
(Reich et al. 2005, jardin commun de quatorze essences). **Une heure de
littérature avant d'écrire a changé le découpage, pas seulement les chiffres.**

## Ce qu'un lot plus ancien a appris (les tempêtes, #55)

**Réutiliser une fonction qui porte le bon NOM et répond à une autre question.**
`windShelterAt` calculait déjà un abri au vent, et le premier jet s'en est servi
— zéro tempête en soixante ans. Il avait été écrit pour la haie brise-vent (de
quoi un jeune plant est-il protégé près du sol) et compte tout voisin d'une
certaine taille, donc il sature à 1 dans n'importe quel peuplement : chacun
s'abrite de ses semblables. Ce qui abrite une CIME, c'est ce qui la dépasse.
Avant de réutiliser, relire la question à laquelle la fonction répond, pas son
nom.

**Une profondeur absolue là où il fallait un rapport.** L'ancrage écrit en
centimètres couchait les semis et épargnait les dominants — l'exact inverse
d'une tempête, et visible seulement en comptant les victimes par classe de
taille. Le renversement est une affaire de moments : le vent pousse avec un bras
de levier qui est la hauteur, la motte résiste avec un bras qui est sa
profondeur. Le rapport a remis le tri à l'endroit du premier coup. **Quand un
mécanisme compare deux forces, chercher la grandeur SANS DIMENSION avant
d'écrire un seuil.**

**Un échantillon de calibration qui n'en est pas un.** Le seuil d'ancrage a été
calé sur les arbres du moteur mesurés à quarante ans, ce qui semblait
irréprochable — sauf qu'ils venaient tous de la même station, où l'été sec force
les racines vers le bas. Le même hêtre poussé sur un site jamais sec tient un
rapport trois fois plus faible, sans rien d'anormal : la plasticité racinaire
fait son travail. Une futaie de test perdait donc seize arbres sur
soixante-quatre en cinq ans, dans un fichier qui ne parle pas de vent. **Caler
un seuil sur le moteur demande de balayer les RÉGIMES, pas seulement les
graines** : plusieurs stations, plusieurs climats, plusieurs âges. Et quand le
mécanisme lit une variable d'état existante, regarder d'abord toute l'étendue
que cette variable prend en jeu.

**Un facteur d'habitat rendu brutal faute de lire la tolérance.** L'engorgement
est le bon levier — les grandes tempêtes couchent là où le sol est gorgé — mais
appliqué brut il rasait l'aulnaie de fond de vallée tous les deux ans. Ce qui
compte est l'excès AU-DELÀ de ce que l'espèce tolère, la forme que
`waterloggingFactor` utilisait déjà. La bonne forme existait à trois fichiers de
là.

**Le label `flux-aléatoire` ne s'impose presque jamais.** L'issue l'annonçait ;
deux graines dérivées (rafale ← graine de partie + semaine, renversement ←
identité de l'arbre + semaine) l'ont rendu inutile. Aucune partie sans tempête
ne bouge. Avant d'accepter de décaler le flux, chercher la graine locale — le
prix est de deux lignes.

**Écrire les critères manquants fait BAISSER le score, et c'est le travail.** Le
référentiel n'avait aucune ligne sur la tempête : le moteur ne savait pas
coucher un arbre et personne ne comptait le point. Six lignes plus tard, trois
✅ et trois ❌ assumés, et deux points de moins. La colonne des absences venait
d'atteindre zéro ; elle était vide parce qu'on n'avait pas regardé.

## Ce qu'un lot plus ancien a appris (la strate herbacée, #70)

**Une variable d'état ne suffisait pas.** On a d'abord tenu une seule grandeur
par espèce et par cellule — la place occupée — en calculant la couverture comme
son produit par l'activité de la saison. C'est faux dès qu'un geste rabat le
tapis : chaque bouchée de chevreuil était alors prise sur les rhizomes, et la
lande mesurée perdait son tapis en un hiver. Il en faut deux, l'emprise pérenne
et le feuillage de l'année, et alors une règle tombe toute seule — une fauche de
juin n'atteint pas une vernale déjà rentrée sous terre.

**La mesure a tranché quatre fois**, et chaque fois contre le premier jet : la
sécheresse devait porter sur le feuillage et non sur l'emprise, la repousse
devait être freinée par le froid, le partage de la place libre devait se faire
au prorata des vitesses — et surtout, une graminée ne devait avoir NI porte
photopériodique NI sénescence d'automne. Copier la phénologie des ligneux sur
une hémicryptophyte lui coûtait un cinquième de sa couverture annuelle sous
futaie feuillue, parce que la fenêtre qui compte pour elle n'est pas avril mais
octobre-mars. Aucun de ces quatre défauts ne se voyait à la lecture.

**Reprendre les constantes acquises plutôt que les réinventer.** Les seuils du
dactyle sont ceux que `herbe.ts` appliquait au tapis entier, repris tels quels :
le tapis d'avant était un dactyle qui s'ignorait. Les relever de quelques
centièmes « parce que ce tapis moyennait aussi des plantes d'ombre » se défend
en une phrase et déplace une calibration acquise sans la remesurer. Un lot qui
AJOUTE des espèces ajoute sous le plancher ; il ne bouge pas le plancher.

**Relancer la suite ENTIÈRE, et lire ce qu'elle dit.** Six tests écologiques ont
bougé, dont un qui annulait une conclusion : le rapport « le réchauffement fait
flamber les ravageurs » était passé de 1,6 à 1,06, parce que la strate fournit
un cinquième de l'habitat des auxiliaires. Il est revenu de lui-même une fois la
phénologie du dactyle corrigée. Les tests du lot, eux, passaient tous.

**Le coût se mesure aussi** : trois espèces au lieu d'une moyenne, c'est +11 %
de temps par semaine (6,8 → 7,6 ms sur une hêtraie 30 × 30 de quarante ans,
médiane de cinq passes, machine au repos). À savoir avant d'ajouter la
quatrième — et le délai des tests est passé de 120 à 180 s pour la même raison.

**Une borne de trait mal posée fait plus de dégâts qu'une formule fausse.**
L'anémone acceptait pH 4,0 : elle s'installait donc sous les ajoncs d'une lande
girondine et y renversait l'effet nurse (E1), le pin abrité passant sous le pin
à découvert. Ramenée à 4,5 — ce que sa source dit —, tout rentre dans l'ordre.
Une formule fausse ressemble à un bug ; une borne trop large ressemble à une
fiche.

**Un dispositif expérimental peut manquer son témoin.** Comparer une vernale
sous couvert caduc et sous couvert sempervirent supposait un sempervirent
SOMBRE : le moteur n'en produit pas sur ces stations (le pin s'auto-éclaircit,
le houx ne s'installe pas à découvert, le chêne-liège plafonne à trois mètres
sur la lande). La conclusion a été réécrite pour dire ce que le dispositif
montre — un gradient monotone sur trois couverts — et non ce qu'on espérait.

## File d'attente

**Ce que #164 laisse au rendu.** `contextePhenologiqueFractionnaire(debut, fin, t)`
rend le calendrier à n'importe quel instant entre deux semaines, et le `pheno`
de l'instantané porte maintenant sa latitude et sa semaine, donc rien à changer
au protocole. Découpé en huit, le plus gros saut de feuillage tombe de 51,3 % à
6,4 %.

**#156 — éclaircir par essence est inatteignable.** Ouvert au passage : le
moteur accepte `critere: "espece"` depuis toujours et prélève toutes les tiges
d'une essence, mais l'interface n'expose que `parLeBas` et `parLeHaut`. Une
capacité entière du moteur qu'on ne peut pas demander. Rien à faire côté moteur
— le snapshot porte les `especeId` et le jeu importe déjà l'atlas.

**Ce que #153 laisse à #149.** L'origine du stress est nommée et relayée
jusqu'à `SnapshotTree` : le journal par arbre peut dire « attaqué par des
ravageurs », « malade », « il dépérit de sécheresse », et doser sa notification
sur un niveau plutôt que sur 75 000 événements. Rien d'autre à attendre du
moteur de ce côté.

**#154 — la ronce bloque la plantation comme un chêne.** Ouverte en répondant à
une question de partie. Deux règles confondues en une : l'encombrement du point
(une affaire de potet) et le fourré (une affaire de densité, que
`partMecanisable` sait déjà lire pour les engins). Mesuré : 78 % d'une friche de
dix ans est inplantable, et pourtant on peut faufiler un plant au milieu de neuf
ronces. La règle se trompe dans les deux sens.

**Ce que #139 a débloqué chez le voisin.** `prevoirAction` existe : la seconde
moitié de #120 — le viseur qui passe au rouge avec la raison sous le curseur —
ne dépend plus du moteur. Rien à faire de ce côté, sinon ne pas casser le
contrat de non-mutation que `tests/unit/prevoir.test.ts` tient.

**Ce qui reste de #140 — le LER, enfin faisable.** La fertilisation lève le
verrou : une monoculture de blé fertilisée EST un témoin valable, et le gradient
est désormais de l'ombre pure. H21 (❌) demande maintenant le dispositif
complet — blé pur, forêt pure, et l'allée — sur la même station et le même
climat. Cible de validation : le noyer-céréale de Restinclières dépasse 1,2.

Dépend de **#141** (maintenance) pour le niveau : tant que le tassement
s'épingle à 1, le blé pur plafonne à 4,88 t/ha au lieu de 8-9, et un LER
calculé sur deux termes également rabotés serait juste par accident.

**Ce qui reste de #136 après la fertilisation.** Le verrou que cette entrée
annonçait — aucun geste pour apporter de l'azote — est levé depuis #140, et E13
est passé ✅. Restent trois manques, dans l'ordre où ils se paient : le retour de
la PAILLE, qui explique probablement que le moteur glisse sous la parcelle nue
de Broadbalk ; une saturation lumineuse rapportée au rayonnement de la STATION,
sans quoi le blé du plateau picard reste aussi tolérant à l'ombre que celui du
Midi ; et une seconde culture, dont le coût se mesure avant de l'ajouter.

**Ce qui reste de #70 — la soudure d'ÉTÉ, et l'ortie.** Le calendrier est là et
G4/J6 sont tombés, mais la strate basse n'y apporte que sa vernale : les deux
autres herbacées sont des graminées anémophiles. La soudure de fin d'été reste
donc à la charge des ligneux (ronce, troène, callune), et il manque une
herbacée entomophile tardive — un trèfle, une centaurée — pour que la strate
basse tienne les deux soudures. Manquent aussi, inchangés : **l'ortie
nitrophile**, qui demande que la capacité d'une herbacée lise l'azote et ferait
de l'épandage un choix visible au sol ; **la hiérarchie de hauteur** dans la
strate, seule limite écrite de B8 ; et **la culture comme strate basse**, qui
est le sujet de l'agroforesterie — une fiche herbacée avec un rendement et une
exigence minérale ferait poser au jeu sa question centrale.

Côté pollinisation, la limite de G4 est nommée : pas d'insectes individualisés,
et la fenêtre de butinage est celle des auxiliaires faute d'en avoir mesuré une
autre. Une distance propre aux pollinisateurs demanderait une mesure, pas un
chiffre choisi.

**Ce qui reste de #115 — le réseau n'AJOUTE toujours pas d'azote.** Le correctif
lui rend un signe juste (+2,79 % de volume sur limon pauvre, +0,09 % sur riche)
mais le mécanisme reste redistributif : ce que l'arbre gagne vient du tapis
(−5 %) et du lessivage évité. Le service que la littérature met en avant est
autre — les hyphes atteignent l'azote ORGANIQUE et les pores qu'une racine
n'occupe pas, ce qui ajoute au peuplement. Il y faudrait un pool organique
accessible au prélèvement, que le moteur ne tient pas : la litière se
minéralise, elle ne se prospecte pas. Et le gain sur l'EAU et le PHOSPHORE, que
`mycorhizes.ts` diffère depuis l'origine, attend toujours — relire dans ce
module pourquoi la première tentative (élargir le rayon prospecté de 15 %) a été
refusée, elle diluait l'asymétrie entre dominants et dominés au point que le
hêtre n'atteignait plus la canopée.

**Un second banc pour « Planter dans un labour ».** Le verdict a été corrigé
dans ce lot, mais l'expérience elle-même tourne sur un limon RICHE, où l'azote
ne limite pas : la hauteur des plants y est identique au centimètre avec et sans
labour (4,96 m à cinq ans), et elle l'était déjà avant le correctif. La courbe
montre donc la moitié de la question — le réseau se coupe vite et revient
lentement — et le verdict le dit désormais au lieu de conclure que labourer est
gratuit. L'autre moitié demande le même banc sur limon pauvre en azote, où le
réseau vaut +2,8 % de volume. C'est une expérience à ajouter, pas une phrase à
réécrire, donc ça ne tenait pas dans ce lot.

**Ce qui reste de #105 — la racine et la transpiration de la perche.** Le
houppier suit le diamètre ; le disque racinaire et la demande en eau restent sur
la forme de référence, délibérément (le refus est écrit dans `trees.ts`). Ce sont
deux affirmations à instruire séparément, et la racinaire est la plus lourde de
conséquences : elle commande l'eau et tous les nutriments, donc elle se prend
seule, avec son témoin. La littérature ne dit d'ailleurs pas la même chose des
deux — une tige dominée réduit sa transpiration bien plus que son emprise
racinaire, qui persiste après que la couronne a cédé.

Reste aussi, côté rendu : `ArbreOmbre.diametreCm` est posé et optionnel, donc
l'ombre portée garde la forme de référence tant que L2 ne câble pas le champ
depuis `Snapshot.diametreCm`, qui le porte déjà. Une ligne, et les ombres des
perches se resserrent comme celles du moteur.

**Ce qui reste de #96 — l'attribution de la cause de mort (issue #103).** Le
mécanisme est là et F6 est tombé, mais 293 morts de famine sur 295 sortent
étiquetées « ravageurs » : `causeMort` retient qui franchit le seuil, pas qui
remplit le compteur. C'est de la maintenance, et c'est un défaut ANTÉRIEUR au
lot — il n'était simplement pas visible tant que rien ne tuait lentement. Il
compte pour le jeu plus que pour le moteur : le journal envoie le joueur vers un
traitement sanitaire là où il fallait éclaircir.

Et B6 reste 🟡 : ce que l'ombrage latéral produit est désormais juste, mais le
poids 0,4 des codominants qui le dose est toujours posé à la main, et il gouverne
aussi la succession.

**Ce qui reste de #71 — l'altération n'est pas stratifiée (C15, 🟡).** La pompe
à bases est écrite (#170) : les racines débitent un pool de sous-sol, et le
contraste entre essences se lit sur deux traits de l'atlas. Mais ce pool n'a que
ce terme-là. L'altération, qui devrait l'alimenter, somme encore sur tout le
profil et crédite la seule surface — 9 400 eq/ha sur cinquante ans en limon
riche, le même ordre de grandeur que la pompe. La stratifier retire les deux
tiers des apports minéraux de la surface : il faudra recalibrer
`AMPLIFICATION_CHARGE` et refaire tous les chiffres de dérive de C10, donc c'est
un lot à part entière et pas un correctif. Personne ne LIT encore le pool
profond non plus : ce serait le second morceau. Manque aussi une litière
herbacée porteuse de calcium (la strate basse ne pèse pas sur le complexe) et
l'ortie nitrophile, qui rendrait la bio-indication lisible.

**Ce qui reste de #70 — le calendrier de floraison.** La strate a ses espèces,
E9 et B8 sont tombés, mais la fiche herbacée s'arrête au calendrier FOLIAIRE.
G4 et J6 attendent un `floraisonDJ` sur la fiche, une ressource florale par
cellule, et que `biodiversite.ts` la lise. Manquent aussi une rudérale
nitrophile — la capacité ne lit pas l'azote — et la CULTURE comme strate basse,
qui est le sujet de l'agroforesterie.

**Ce qui reste de #55 — les trois ❌ que le lot a écrits.** Par ordre de gain :
**F19**, la fréquence des tempêtes sous dérive climatique — le blocage est de
plomberie, `meteoDerivee` connaît le scénario et pas la graine de partie,
`tick` tire la rafale et ignore le scénario ; **F18**, la fragilité
d'après-éclaircie, qui demande une mémoire par arbre de l'ouverture récente et
rendrait dangereuse une éclaircie tardive et forte ; **F17**, la casse
partielle, qui demande un état « blessé » sur l'arbre.

La réserve héritée sur l'élancement, elle, est **levée** : #97 a ouvert
l'amplitude (H/D 39–129 en hêtraie serrée à quatre-vingts ans), et le tri par le
vent s'est mis à parler tout seul, comme annoncé — cinq tiges couchées là où
aucune ne tombait. Ce qui reste est l'autre bout de la gamme : au large le
moteur donne 35–38 quand le réel descend à 25, ce que l'allocation de pleine
lumière (2,5 cm/m) interdit. C'est une calibration, donc de la maintenance, et
elle déplace le VOLUME du peuplement autant que la forme — à ne pas toucher sans
refaire le calage du volume.

**#58 — le vent dans la propagation et dans la chute.** Deux endroits où le vent
existe désormais (`src/engine/vent.ts`) mais n'agit pas : `propager` s'étale en
tache circulaire au lieu de s'allonger en ellipse, et `directionDeChute`
n'oriente que par la pente. Le premier point touche le flux aléatoire de plein
fouet — l'issue le dit et explique pourquoi le rendu, lui, suivrait sans une
ligne à changer.

## Tenir le référentiel à jour

Une évolution qui fait passer un critère de ❌ à 🟡 ou ✅ met à jour
`docs/realisme.md` : la ligne du critère avec sa justification et son test, le
tableau de score, le total et la ligne d'historique. Sinon le document ment, et
c'est la seule mémoire du projet.

Écrire aussi ce que le mécanisme **n'atteint pas**. Les meilleures lignes du
référentiel sont celles qui disent leur limite : « reste 🟡 parce que
l'élancement ne dépend pas encore de l'histoire du peuplement » vaut mieux qu'un
✅ optimiste.
