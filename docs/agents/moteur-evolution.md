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

## Ce que le dernier lot a appris (la dérive du pH, #71)

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

## Ce que l'avant-dernier lot a appris (les tempêtes, #55)

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

**Ce qui reste de #71 — la pompe à bases (C15, ❌).** Le pool de bases est de
SURFACE, comme ceux de N, P et K. Le moteur dit donc qu'un frêne entretient son
horizon de surface, et rien de ce qu'il prend en dessous — alors que c'est par
là que le hêtre acidifie la profondeur plus que l'épicéa. Il y faudrait un pool
par horizon, ce que le moteur ne fait pour aucun nutriment : le lot dépasse #71.
Manque aussi une litière herbacée porteuse de calcium (la strate basse ne pèse
pas sur le complexe) et l'ortie nitrophile, qui rendrait la bio-indication
lisible.

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

Et une réserve héritée : le tri par l'élancement est écrit sur toute la gamme
réelle (H/D de 25 à 100) mais le moteur n'en produit qu'un cinquième, 35 à 49
(#79, et #65 pour la cause). Le jour où l'amplitude s'ouvre, ce tri se met à
parler sans qu'on y touche.

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
