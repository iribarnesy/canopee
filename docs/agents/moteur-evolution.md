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

## Ce que le dernier lot a appris (la strate herbacée, #70)

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

**Ce qui reste de #70 — le calendrier de floraison.** La strate a ses espèces,
E9 et B8 sont tombés, mais la fiche herbacée s'arrête au calendrier FOLIAIRE.
G4 et J6 attendent un `floraisonDJ` sur la fiche, une ressource florale par
cellule, et que `biodiversite.ts` la lise. Manquent aussi une rudérale
nitrophile — la capacité ne lit pas l'azote — et la CULTURE comme strate basse,
qui est le sujet de l'agroforesterie.

**#55 — les tempêtes.** Le gros morceau, et le plus embarrassant : `marche.ts`
explique longuement l'effondrement des prix après Lothar et Klaus, donc le
moteur enseigne la conséquence d'un événement qu'il est incapable de produire.
Le mot « chablis » est partout dans le vocabulaire et ne désigne jamais une
tempête.

L'issue pose elle-même son séquençage, et ses deux préalables sont **levés** :
le volume découle maintenant de la géométrie et l'élancement est porté par
l'individu, donc une tempête peut trier sur l'histoire du peuplement et pas
seulement sur la hauteur. Reste une réserve : l'amplitude de l'élancement est
bridée par #65 (`moteur:maintenance`). Une tempête calibrée sur un élancement
trop resserré trierait mal — traiter #65 d'abord, ou accepter et écrire la
limite.

Deux pièges nommés dans l'issue : ne pas étirer le vent **moyen** avec le
scénario climatique (c'est la variable la moins contrainte des projections
européennes), et ne pas faire de la tempête une loterie qui annule la stratégie
du joueur — l'essence, l'espacement, le sol et le moment de l'éclaircie doivent
changer l'issue.

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
