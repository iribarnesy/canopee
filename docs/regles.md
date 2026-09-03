# Canopée — Règles du simulateur d'agroforesterie

> Document de game design, v0.2 (2026-09-01) — intègre les premières décisions (voir §15). Nom de code « Canopée » (à changer si tu veux).
> Sources principales : `Notes/Agroforesterie - auto cours.md` (ch. 1–8) et `Notes/atlas-especes/` (~70 ligneux, ~100 herbacées, faune). Les valeurs chiffrées données ici sont des ordres de grandeur **à calibrer** ; celles marquées *(à confirmer)* sont des inférences non sourcées.

---

## 0. Vision et principes de conception

1. **Scientifique d'abord** : chaque mécanisme du jeu correspond à un mécanisme réel documenté dans le cours (le doc cite le chapitre). Pas de règle « gamey » sans justification écologique.
2. **Déterministe en v1** : mêmes conditions → même croissance, toujours. La météo est une **série scriptée** rejouée à l'identique (voir §3) — déterministe ne veut pas dire constant : il y a des années sèches, des gels tardifs, mais toujours les mêmes aux mêmes dates. La variabilité inter-individus (v2) viendra s'ajouter par-dessus sans casser ce socle.
3. **Loi du minimum (Liebig)** comme moteur central : la croissance est bridée par la ressource la plus rare (cours ch1-C, atlas : « c'est le facteur le plus défavorable qui décide »).
4. **Le système vit sans le joueur** : si on ne fait rien, la succession écologique se déroule (friche → fruticée → boisement pionnier → forêt, ch1-A). Le joueur infléchit une dynamique, il ne « pose » pas des objets inertes.
5. **Simulation séparée du rendu** : le moteur est une fonction pure `état(t) + actions → état(t+1)`, testable sans navigateur. L'UI n'est qu'une vue.
6. **Pédagogique** : chaque info-bulle peut renvoyer à la notion du cours (réutilisation directe de tes notes et du glossaire).

---

## 1. Temps et espace

### 1.1 Pas de temps
- **Tick de simulation : 1 semaine** (52/an). Justification : assez fin pour la phénologie (gel tardif d'avril sur fleurs de fruitiers, pic de sécheresse d'août), assez gros pour simuler des décennies sans exploser les calculs.
- **Horizon de jeu : 30–60 ans** minimum. Un chêne ne se joue pas en 5 ans ; c'est un choix fort de gameplay (vitesse ×1 → ×512, pause).
- Chaque tick : météo → bilan hydrique → cycle N → lumière → croissance/phénologie de chaque individu → interactions biotiques → économie.

### 1.2 Espace
- **Parcelle = grille de cellules de 1 m²**. Taille par défaut **1 ha** (100×100) — assez pour un vrai design (lignes, îlots-guildes, lisières) sans noyer le joueur — mais c'est un **paramètre de la station**, pas une limite du moteur : on dimensionne pour tenir ~10 ha × 52 ticks/an fluide, des scénarios plus grands viendront.
- Un **ligneux** occupe une cellule (son pied) et projette :
  - une **couronne** (disque de rayon `r_houppier(âge)`) qui intercepte la lumière,
  - une **zone racinaire** (disque de rayon ~1–1,5× la couronne *(à confirmer)*, sur `profondeur_racinaire(âge)`) qui prélève eau et nutriments.
- Les **herbacées** se gèrent par cellule (une culture/couvert par cellule), pas par individu.
- La parcelle a un **contexte hors-carte** non jouable (§8) : occupations voisines sur les 4 bords (forêt, prairie, grande culture, route…).

---

## 2. La station (« biome ») — paramètres fixes au démarrage

C'est le concept central du cours (ch3-C : « le tempérament est en toi, la station est le lieu »). Une station = un jeu de paramètres **immuables** + un état initial du sol + une série météo + un contexte paysager. Chaque station correspond à un terrain réel de France.

### 2.1 Paramètres statiques
| Paramètre | Rôle dans le moteur |
|---|---|
| Latitude | durée du jour par semaine (photopériode → photosynthèse, phénologie) |
| Altitude | correction de température (−0,6 °C / 100 m) |
| Pente (°) et exposition (N/S/E/O) | rayonnement reçu (adret/ubac), ruissellement/érosion, drainage |
| Profondeur jusqu'à la roche mère | plafond du volume prospectable par les racines |
| Horizons du sol (2–3 couches) | pour chacun : épaisseur, texture (% sable/limon/argile), pierrosité, pH, % CaCO₃, % MO initiale |
| Eau libre : ruisseau longeant un côté, ou mare (§2 bis) | tient une nappe locale → engorgement au bord, remontée capillaire en été |
| Occupation initiale | prairie / grande culture / friche / taillis / pinède… → stock initial de C, banque de graines, structure du sol |
| Contexte paysager | ce qui entoure la parcelle (§8) |

De la texture et de la profondeur on **dérive** (pas de saisie redondante) : réserve utile (RU, mm), CEC, sensibilité à la battance, vitesse de drainage. Ordres de grandeur RU : sable ~0,8 mm/cm, limon ~1,8 mm/cm, argile ~1,6 mm/cm de sol *(à calibrer sur références agro)*.

### 2 bis. L'eau de surface (implémenté)

Un plan d'eau ne se décrit pas par ce qu'on en voit mais par la **nappe** qu'il
tient sous la parcelle. `eau_surface.ts` en dérive, cellule par cellule, une
profondeur de nappe à partir de deux termes :

- **le relief** — plus une cellule domine le plan d'eau, plus la nappe est
  profonde sous elle ; l'ampleur dépend du sol (*subordination au relief* : un
  sable très conducteur laisse la nappe suivre le terrain, une argile la garde
  perchée près de la surface) ;
- **la distance** — passé la portée d'influence (60 m pour un cours d'eau, six
  fois le rayon pour une mare), la cellule ne sent plus rien et retrouve le
  régime de la station.

Trois effets, tous exprimés dans le bilan hydrique existant :

1. **saturation imposée** — sous la surface libre, réserve utile ET
   macroporosité sont pleines. Ce n'est pas un flux qu'on choisit, c'est un
   état ; l'eau ainsi ajoutée est comptée comme venue de la nappe, sinon le
   bilan ne bouclerait pas ;
2. **remontée capillaire** — décroissance exponentielle avec la distance
   verticale, sur une hauteur capillaire déduite de la texture (30 cm dans un
   sable, ~1,8 m dans un limon) ;
3. **exutoire bouché** — un sol dont la nappe est dans le profil n'a nulle part
   où envoyer son eau ; à nappe affleurante, plus rien ne part (marais). Un
   exutoire déclaré « illimité » redevient fini dès que la nappe monte.

**La crue** n'a pas de cause à part : c'est la même eau qui, ailleurs sur la
parcelle, arrive de l'amont par ruissellement (§2, relief). On la relit du
point de vue du cours d'eau — plus son bassin lui verse d'eau dans la semaine,
plus il monte, et sa nappe avec lui, jusqu'à affleurer dans le bas. Sans bassin
d'amont, pas de crue ; sans plan d'eau non plus, la pluie ruisselle et s'en va.
Elle reflue dès que l'amont ne verse plus.

La ripisylve en découle sans qu'aucune espèce ne soit nommée : au bord de l'eau
l'aulne (tolérance à l'engorgement 1) prospère là où le hêtre (0,1) s'asphyxie,
et l'écart disparaît à vingt mètres.

### 2 ter. Le terrain comme donnée (implémenté)

Le relief pouvait se choisir, mais parmi trois silhouettes (plan, vallon,
croupe). `Relief.altitudesM` permet de fournir **l'altitude de chaque cellule**
— dessinée, générée ou importée —, auquel cas la silhouette paramétrique ne
sert plus à rien.

Avec un terrain quelconque, on ne peut plus *déclarer* l'eau : il faut la
**déduire** (`terrain.ts`), avec les deux algorithmes classiques de
l'hydrologie numérique.

- **Remplissage des cuvettes** (priority-flood) : on part des bords, par où
  l'eau sort, et on progresse toujours par le point le plus bas encore
  atteignable. Une cellule ne peut pas être plus basse que le col qu'il a
  fallu franchir pour l'atteindre, et cet écart est exactement la hauteur
  d'eau. Un trou creusé se remplit ; le même trou percé jusqu'au bord ne
  retient plus rien.
- **Accumulation d'écoulement**, en deux versions, et il faut les deux :
  celle qui suit l'ARBRE du remplissage donne à chaque cellule son bassin
  versant, y compris sur une surface parfaitement plane où aucune voisine
  n'est plus basse ; celle qui suit la voisine la plus PENTUE ne donne rien sur
  un plat, et c'est elle qui repère les talwegs — sans quoi on inventerait des
  rivières au milieu d'une prairie plane. Au-delà de cinq hectares drainés, le
  talweg porte un cours d'eau permanent : aucune parcelle d'un hectare n'en
  fabrique donc toute seule, il vient forcément du bassin d'amont, et il entre
  par un point — l'encoche de la bordure haute — au lieu d'arriver en nappe.

Et une cuvette ne devient pas une mare parce qu'elle est creuse : il faut
qu'il y arrive plus d'eau qu'il n'en part. Ce qui arrive, c'est la pluie
entière sur le plan d'eau (une surface libre ne transpire pas) plus la part
efficace de son bassin ; ce qui part, c'est l'évaporation et l'infiltration
par le fond, que le colmatage ralentit beaucoup. D'où une règle qui vaut leçon
d'agroforesterie : **on ne creuse pas une mare dans du sable**.

Ensuite, `eau_surface.ts` ne voit que des cellules en eau, leur cote et leur
portée : une mare creusée et une mare déclarée produisent la même nappe, donc
la même ripisylve.

### 2 ter bis. Faire passer le temps avant d'arriver

Un terrain qu'on vient de modeler n'est pas un lieu, c'est une topographie.
L'humus accumulé, l'herbe installée, les semis venus du voisinage, la ceinture
d'arbres autour du trou qui s'est rempli : tout cela demande du temps. Le
**vieillissement** le donne d'avance — le moteur simule N années sans joueur,
avec le climat de ces années-là (2026 moins N), puis le compteur repart à zéro.
Rien n'est scripté : ce qui a poussé a poussé tout seul. Le vieillissement fait
partie de l'histoire de la parcelle, donc il se rejoue à l'identique au
chargement d'une sauvegarde.

### 2 quater. Les bords de la parcelle

Une parcelle n'est pas un monde clos. Ce qui sort est compté
(`ruissellementSortantMm`, par le point bas). Ce qui entre vient du bassin
d'amont, et **entre par la bordure haute** — pas en pluie uniforme sur toute la
parcelle, ce qui en ferait de la pluie et non du ruissellement (`entreesDAmont`).
L'eau traverse ensuite le terrain en s'infiltrant à chaque cellule.

Ce qui reste une approximation assumée : on ne sait rien du terrain *hors* de
la parcelle. Le remplissage des cuvettes suppose que l'eau peut sortir par
n'importe quel bord ; une mare creusée à cheval sur la limite se viderait donc
chez le voisin, ce qui est vrai si le voisin est plus bas et faux sinon.

### 2.2 Stations proposées pour la v1 (terrains français réels)
1. **Lande du Sud-Gironde** — reprend l'étude de cas du cours (ch5) : sable podzolique acide (pH ~4,5), nappe hivernale, RU faible, climat océanique aquitain, contexte = pinède de pin maritime en monoculture. Difficulté : pauvreté, feu, acidité.
2. **Plateau limoneux picard** — limon profond (>1,5 m), pH ~7, ancienne grande culture : sol riche mais MO effondrée (~1,5 %), vie du sol à reconstruire, vent, pas de nappe. Le « bon élève » apparent.
3. **Coteau calcaire bourguignon** — rendzine de 30–40 cm sur calcaire, pH 8, pente 15°, exposition sud, sécheresse estivale marquée. Pour les calcicoles thermophiles (chêne pubescent, cormier, amandier…).
4. **Bocage breton** — limon sablo-argileux acide (pH 5,5), climat doux et humide, haies existantes en bordure, engorgement ponctuel. Confort hydrique, mais lumière limitante et pression limaces/campagnols.
5. **Moyenne montagne (Massif central, ~900 m)** — sol sur granite, saison courte, gels tardifs fréquents, forte RU. Pour sorbier, myrtille, mélèze ; les fruitiers exigeants y échouent.
6. **Vallée alluviale ligérienne** — sol profond eutrophe, nappe accessible, risque de crue hivernale scriptée. Peupliers, noyers, frênes ; engorgement à gérer.

Chaque station embarque ses **normales climatiques mensuelles réelles** (Météo-France, à collecter en phase données) et un **réchauffement en trajectoire, pas en décor statique** : la série de 60 ans suit un scénario du GIEC (**SSP1-2.6 / SSP2-4.5 / SSP5-8.5**), régionalisé France via les projections **DRIAS / Météo-France** (la France se réchauffe ~2× plus vite que la moyenne globale). Le joueur choisit le scénario **et l'année de départ** (2026 ou 2040) : même en SSP2 démarré aujourd'hui, la fin de partie est nettement plus chaude que le début — planter en 2026 un arbre qui produira en 2070, c'est LE problème du jeu (ch8). Le CO₂ (ppm) suit la même trajectoire.

---

## 3. Climat et météo (déterministe)

- Par station : une **série météo hebdomadaire scriptée sur 60 ans**, construite à partir des normales mensuelles + événements datés (canicule de l'an 12, gel tardif semaine 16 de l'an 4, tempête de l'an 27…). Rejouable à l'identique → même partie, mêmes résultats.
- Variables par semaine : T° moyenne/min/max, précipitations (mm), rayonnement (dérivé latitude + nébulosité), vent (événements).
- **ETP** (évapotranspiration potentielle) calculée par Hargreaves : `ETP = 0,0023 × Ra × (Tmoy + 17,8) × √(Tmax − Tmin)` — **validé**.
- Dérivés phénologiques : **degrés-jours** (base 5 °C ou 10 °C selon espèce), **heures de froid** hivernales (besoin de vernalisation des fruitiers), **dates de gel** (dernier gel de printemps = risque pour fleurs précoces type abricotier — atlas : « gel des fleurs = risque »).
- **CO₂ atmosphérique** : chaque scénario fixe sa trajectoire de ppm (≈ 420 aujourd'hui → 550–800 selon scénario). L'**effet fertilisant** est modélisé, honnêtement : hausse **saturante** du potentiel de photosynthèse (ordre de grandeur +10–20 % vers 550 ppm, d'après les expériences FACE *(à calibrer)*) et meilleure **efficience d'usage de l'eau** (stomates moins ouverts → transpiration réduite à production égale). Mais la loi du minimum s'applique toujours : sans azote et sans eau, le bonus CO₂ ne s'exprime pas — c'est l'état de la littérature (limitation progressive par les nutriments ; effet plus faible en forêt mature, et effacé les années de sécheresse).
- Le **microclimat** modifie la météo localement (ch4-A) : sous couvert, ETP réduite (−20 à −40 %), extrêmes thermiques amortis (moins de gel au sol), vent cassé par les haies (effet sur ~10× leur hauteur) *(coefficients à calibrer)*.

---

## 4. Le sol — état dynamique

État **par cellule** (mutualisé par zones homogènes pour la perf), sur 2–3 horizons.

### 4.1 Variables d'état
| Variable | Unité | Commentaire |
|---|---|---|
| Eau du sol | mm (par horizon) | entre point de flétrissement et capacité au champ (= RU) |
| N minéral (NH₄⁺ + NO₃⁻) | kg/ha équiv. | le nitrate est lessivable, l'ammonium retenu par le CAH (ch1-C) |
| P et K disponibles | index 0–100 | modèle simplifié : stock lentement renouvelé par altération + MO |
| Bases échangeables / pH | pH | dérive lente : acidification sous résineux/exports, chaulage possible |
| Matière organique / C du sol | t C/ha (par horizon) | LE stock central (carbone §12, fertilité, RU bonus) |
| Litière | t MS/ha, avec son C/N | pool d'attente avant humification/minéralisation |
| Structure / compaction | index 0–1 | dégradée par engins & labour répété, restaurée par racines, vers, MO |
| Activité biologique | index 0–1 | proxy de biomasse microbienne + vers (ch2-B) ; module toutes les vitesses |
| Réseau mycorhizien | ECTO / AM / éricoïde, index 0–1 par type | se construit avec les plantes hôtes présentes (ch2-B) |
| Couverture du sol | % | sol nu = érosion, évaporation, battance (« zéro sol nu », ch7) |

### 4.2 Processus par tick
- **Bilan hydrique en cascade** : pluie → interception par les couronnes (~15–30 % *(à calibrer)*) → infiltration (limitée si battance/compaction → ruissellement, majoré par la pente) → remplissage horizon par horizon → drainage profond (qui **lessive les nitrates**) ; prélèvements = transpiration des plantes (chacune puise dans les horizons qu'atteignent ses racines) + évaporation du sol nu.
- **Minéralisation** de la litière et de la MO : vitesse = f(T°, humidité, activité biologique, **C/N de la litière**) — feuilles d'aulne (C/N ~15) rendent l'azote vite, aiguilles de pin (C/N ~60) lentement et en acidifiant (ch2-B, voies bactérienne vs fongique).
- **Immobilisation** : enfouir un BRF ou une paille à C/N élevé « emprunte » du N minéral pendant sa décomposition (faim d'azote) — vrai piège de gameplay, documenté ch2.

**Phosphore et potassium** (`src/engine/pk.ts`, critère C11) — *cycles
implémentés, pas encore couplés à la croissance*. Les copier sur l'azote aurait
été faux : ce qui compte, c'est ce qui les distingue.
- Le **phosphore ne circule pas** (il diffuse au millimètre) et ne se lessive
  pas — mais il se **rétrograde** : piégé par le fer et l'aluminium en sol
  acide, par le calcium en sol calcaire, d'où une disponibilité en cloche
  autour de pH 6,5. Un sol peut être riche en phosphore total et affamer les
  plantes.
- Le **potassium circule trop** : simple ion, retenu par le seul complexe
  d'échange (argiles + humus). Sur un sable il part au drainage, sur une argile
  il reste ; une réserve non échangeable tamponne la solution. Il n'entre pas
  dans les molécules du vivant — la pluie le rince des feuilles avant leur
  chute, et il revient donc plus vite que le phosphore.
- Entrées : altération de la roche sur tout le profil, dépôts atmosphériques,
  retour à la chute des feuilles (85 % pour K, 70 % pour P, contre 50 % pour
  l'azote — le bois est pauvre en ces deux éléments).
- **L'altération biologique** a tout débloqué : racines et champignons
  ectomycorhiziens dissolvent la roche (acides organiques, sidérophores), d'un
  facteur deux à dix par rapport à l'altération purement chimique. Sans elle,
  les stocks se vidaient en soixante ans et brancher ces deux facteurs
  déséquilibrait le peuplement au point d'allumer des incendies sur une friche
  limoneuse. Avec elle, une forêt installée **fabrique une partie de sa propre
  fertilité minérale** — et le réseau mycorhizien cesse d'être décoratif.
- Résultat : rien ne freine sur un limon profond, où l'azote et l'eau
  commandent ; sur un podzol landais, le phosphore devient le facteur qui
  manque, avec dix fois moins d'assimilable. Les seuils sont FORESTIERS, bien
  plus bas que les seuils agronomiques : un arbre mycorhizé qui retransloque
  son phosphore vit sur des teneurs qui condamneraient une culture.
- **Fixation biologique de N** : légumineuses (*Rhizobium*) et actinorhiziennes (*Frankia* : aulne, argousier, chalef — atlas). Flux ∝ biomasse du fixateur, restitué au sol via litière/racines mortes ou **à la coupe si épandu** (ta règle : épandre vs vendre). Ordre de grandeur : aulne 50–100 kg N/ha/an en peuplement dense *(à calibrer)*. La fixation coûte au fixateur (~10 % de croissance en moins vs N abondant, « la légumineuse paie deux fois », ch1-C).
- **Érosion** : t/ha = f(pente, couverture, agrégation) ; emporte MO et argiles → dégâts permanents sur les cellules en pente nues.
- **pH dynamique lent** : litières acidifiantes (résineux, éricacées), exports de bois, pluie ; remontée par chaulage ou litières riches en bases (tilleul, frêne) *(effet litières à confirmer)*.

---

### 4.3 Érosion (implémenté)

Le ruissellement arrache l'horizon de surface — *érosivité × ruissellement ×
√pente × (1 − couverture)²* — et l'emporte vers l'aval avec sa charge : humus,
litière, azote minéral et organique, phosphore, potassium. Trois traits
comptent :

- **sans ruissellement, pas d'érosion**, quelle que soit la pente : un versant
  raide sous couvert forestier n'érode pas ;
- le sédiment est **enrichi** (×3) : ce qui part est la meilleure part du sol ;
- il se **dépose** en chemin, d'autant plus que la cellule d'arrivée est
  couverte — le principe de la bande enherbée et de la haie sur courbe de
  niveau. Environ un cinquième seulement quitte la parcelle.

Ce qui sort est une perte sèche, comptée dans les bilans carbone et azote.

## 5. Lumière et strates

- Modèle par **strates verticales** (les 7 strates de la forêt-jardin, ch6-A : canopée, arbres bas, arbustes, herbacées, couvre-sol, rhizosphère, lianes).
- Chaque semaine, par cellule : rayonnement incident (saison, latitude, pente/exposition) traverse les couronnes de haut en bas ; chaque couronne intercepte selon sa densité de feuillage (LAI espèce, ×0 si caduc en hiver — important : les bulbes de sous-bois type ail des ours font leur saison **avant** le débourrement, ch6).
- **Ombre portée latérale** : au minimum un décalage de l'ombre vers le nord selon la hauteur (soleil au sud en France) — c'est ce qui rend le **design spatial** intéressant (lignes est-ouest vs nord-sud, ch5-B).
- Chaque espèce a une **courbe de réponse à la lumière** dérivée de son tempérament (atlas : ☀ / ◐ / ☾) : les héliophiles plafonnent haut mais s'effondrent à l'ombre ; les sciaphiles ont un **point de compensation** bas (ch3-B) — un semis de hêtre survit à 5 % de lumière, un bouleau non.

---

## 6. La fiche espèce (base de données)

Le contenu vient de l'atlas, complété par la *Flore forestière française* et des bases publiques (à sourcer champ par champ dans le JSON — champ `sources`). ~40 ligneux + ~20 herbacées en v1, extensible.

```jsonc
{
  "id": "alnus_glutinosa",
  "nom": "Aulne glutineux",            // + nom latin, famille, type (arbre/arbuste/liane/…)
  "strate_adulte": 1,                   // 1 canopée … 7 liane
  "temperament": {                      // les 5 axes du cours (ch3-C) + atlas
    "lumiere": "heliophile",            // courbe de réponse
    "eau": [7, 10],                     // gamme tolérée sur gradient xéro(0)→hygro(10), engorgement OK
    "ph": [4.5, 7.5],
    "trophie": "eutrophe",              // besoins N-P-K
    "chaleur": { "rusticite_min": -30, "besoin_degres_jours": 900, "besoin_froid_h": null }
  },
  "croissance": {
    "hauteur_max_m": 25, "longevite_ans": 100,
    "vitesse": "rapide",                // paramètre k d'une courbe de Chapman-Richards
    "houppier_ratio": 0.35,             // rayon houppier / hauteur
    "racines": { "strategie": "tracant", "profondeur_max_m": 1.5 }
  },
  "phenologie": { "debourrement_dj": 150, "floraison": "s8-s12", "fructification": "s36-s40", "caduc": true },
  "ecologie": {
    "mycorhize": "dual",                // ECTO / AM / éricoïde / dual / non
    "fixation_n": "frankia",            // rhizobium / frankia / non
    "allelopathie": null,               // ex. noyer: { "molecule": "juglone", "rayon_x_houppier": 1.5, "sensibles": ["rosacees", …] }
    "succession": "pionniere",          // pionnière / intermédiaire / climacique (ch1-A)
    "rejette_de_souche": true, "drageonne": false, "bouture": true,
    "dissemination": "vent",            // vent / oiseaux / mammifères / gravité (ch4-C)
    "pollinisation": { "mode": "vent", "autofertile": true }
  },
  "produits": {
    "bois": { "densite": 0.5, "usages": ["chauffage", "oeuvre_humide"], "prix_m3": {} },
    "fruits": null                      // sinon { age_premiere_recolte, rendement_kg_max, prix_kg, périssable }
  },
  "sensibilites": ["engorgement_ok", "phytophthora_aulne"],   // ravageurs/maladies §7.4, gibier, feu
  "inflammabilite": "faible",
  "cout_plant": { "jeune": 3, "fort": 15 },
  "sources": ["atlas", "flore_forestiere_fr", "..."]
}
```

Point important tiré du cours (ch3-C, méthode « pousse / s'épanouit / survit ») : chaque axe du tempérament donne une **fonction de réponse trapézoïdale** — zone optimale (facteur 1), zones de tolérance (facteur dégressif), zones létales (mortalité). Pas de seuil binaire.

---

## 7. Le modèle de croissance individuel (cœur du moteur)

### 7.1 Croissance
Chaque individu ligneux a : âge, hauteur, diamètre, biomasse (aérienne/racinaire), réserves carbonées, état de stress.

```
croissance_semaine = potentiel(espèce, âge, saison)
                   × f_lumière(lumière_reçue)
                   × min( f_eau, f_N, f_P/K, f_T° )     ← loi du minimum
                   × f_santé (ravageurs, blessures)
```
- `potentiel` = dérivée d'une courbe de Chapman-Richards vers `hauteur_max` : les pionnières démarrent vite et plafonnent tôt, les climaciques l'inverse (ch1-A, « deux stratégies de vie »).
- **Allocation source → puits** (ch3-B) : le sucre produit va en priorité 1) respiration d'entretien, 2) racines si stress hydrique/nutritif, 3) fruits si mature et conditions OK, 4) bois. Conséquence émergente : un arbre stressé fructifie peu et grossit peu, un arbre taillé réalloue.
- **Réserves** : chaque automne, une part part en réserves ; elles paient le débourrement du printemps et la survie aux crises. Réserves à zéro = mort (déterministe, pas de dé).

### 7.2 Phénologie (calendrier annuel par individu)
Dormance → débourrement (cumul de degrés-jours) → floraison → nouaison (si pollinisation OK **et** pas de gel cette semaine-là) → croissance des fruits (puits de carbone) → récolte possible → chute des feuilles (→ litière, avec le C/N de l'espèce). Le **gel tardif** de la série météo détruit les fleurs ouvertes cette semaine-là : planter un abricotier en Massif central est légal mais perdant — le jeu l'enseigne tout seul.

### 7.3 Mortalité et stress (déterministes)
- Chaque facteur sous le seuil de tolérance génère des **points de stress** ; le stress consomme les réserves ; réserves épuisées = mort. Un stress chronique (ombre pour un héliophile) tue lentement, un extrême (engorgement 8 semaines pour un chêne pubescent) tue vite.
- La **sénescence** : passé `longevite`, le potentiel décroît, l'arbre devient sensible, puis meurt → **bois mort** debout puis au sol (habitat + pool de carbone, ch4-A « le grand oublié »).

### 7.4 Ravageurs et maladies (v1 : déclencheurs déterministes)
Pas de tirage aléatoire : des **règles à seuil**, lisibles et apprenables :
- Pucerons chaque printemps ; dégâts ∝ absence d'auxiliaires (l'index auxiliaires monte avec haies, fleurs de soudure — calendrier de floraison de l'atlas —, mare, gîtes).
- Carpocapse si >N pommiers/poiriers groupés sans haie diversifiée à proximité.
- Scolytes si épicéas **et** stress hydrique 2 années de suite (ch4-C, lien climat-ravageur).
- Processionnaire si pins >X % du couvert et hiver doux (série météo).
- Campagnols si herbe haute non fauchée au pied des jeunes arbres (protection : fauche, anneau de bulbes ch6, buses via perchoirs).
- Chalarose du frêne : arrive à l'année scriptée A+12 quoi qu'il arrive (réalité française) — enjeu de diversification.

*Implémenté autrement, et mieux* (`src/engine/maladies.ts`) : une date scriptée
est jouable mais n'apprend rien d'autre qu'à subir. Une maladie a donc une
**année d'arrivée dans le pays** — donnée historique, 2008 pour la chalarose —
puis une pression qui dépend de deux choses que le joueur contrôle : la
**densité locale d'hôtes** (l'inoculum vient des feuilles infectées tombées à
moins de 20 m, si bien qu'un frêne isolé dans un mélange s'en tire infiniment
mieux qu'un frêne en frênaie) et l'**humidité** (le champignon a besoin d'un
été humide pour fructifier — les frênes des situations sèches et aérées
résistent, ce qu'on observe partout en France). Mesuré : une frênaie pure perd
près d'un tiers de ses tiges en trente ans, le même nombre de frênes noyés dans
un mélange en perd deux fois moins. La diversification cesse d'être une bonne
intention pour devenir une assurance chiffrable. Rien n'est spécifique au frêne
dans le moteur : une autre maladie s'ajoute en une ligne de données.

*Implémenté* (`src/engine/ravageurs.ts`, critères G2/G3/J5), **sans les seuils
par ravageur nommé prévus ci-dessus** : un mécanisme unique les remplace tous,
et les cas particuliers en tombent. Chaque espèce a une sensibilité ; ce qui
décide, c'est la **vigueur** de l'individu — pas son stress létal : un arbre
dominé ou chroniquement assoiffé végète bien avant d'être en danger, et c'est
celui-là qui n'a plus de quoi faire de la résine. La population croît sur cette
ressource, d'autant plus vite qu'il fait chaud, **hiverne** (d'où les crises
qui s'installent sur plusieurs années de suite) et essaime vers les cellules
voisines. En face, les auxiliaires exercent une **prédation** proportionnelle à
la qualité de l'habitat du VOISINAGE — pas de la cellule : une mésange
prospecte un hectare, un parasitoïde quelques dizaines de mètres, et évaluer la
diversité au mètre carré donnait « une seule essence » partout, pur ou mélangé.
Mesuré : une aulnaie pure perd 30 % de ses tiges aux ravageurs là où le même
nombre d'aulnes mélangés en perd 5 %.
Le même habitat porte les **pollinisateurs** (G4) : la nouaison d'un verger nu
tombe à 35 % de son potentiel. C'est par là que l'indice de biodiversité cesse
d'être décoratif.
- **Geai** (implémenté) : un gland ne va nulle part tout seul. Le geai en
  enterre des milliers par automne, jusqu'au kilomètre, et il les cache **en
  terrain découvert** parce qu'il doit les retrouver. Mode de dissémination
  `geai` pour les chênes et le châtaignier : loin du parent, et biaisé vers les
  cellules les plus éclairées. Rien dans le code ne parle de chênes — c'est le
  biais de l'oiseau qui fait qu'ils colonisent les friches et se régénèrent mal
  sous leur propre couvert. Le hêtre, lui, reste tributaire de la gravité : ses
  faînes roulent, et c'est pourquoi une hêtraie avance lentement, de proche en
  proche.
- **Gibier** (chevreuil/lapin) : pression fixée par le contexte paysager ; abroutissement des plants <1,5 m non protégés (ch4-C). Contre-mesures : clôture, protections individuelles, ronces/épineux nurses (aubépine, prunellier = « nurses » de l'atlas).

*Implémenté* (`src/engine/gibier.ts`, critère G1) — et **sans tirage au sort ni
seuil arbitraire**, contrairement à ce que prévoyait cette section : la
pression se compte en kilos de matière sèche disputés. `station.gibierParHa`
donne la densité du paysage (donnée de contexte, comme le voisinage semencier :
un chevreuil a des dizaines d'hectares de domaine vital) ; chaque cellule offre
un fourrage — herbe et rameaux tendres à hauteur de dent — ; la ration se
cherche d'abord en ligneux (le chevreuil est un cueilleur sélectif, pas un
brouteur d'herbe) avec une **réponse fonctionnelle** qui rend une ressource
rare coûteuse à récolter ; chaque arbre perd la longueur de pousse qu'on lui a
mangée, pondérée par son appétence. Trois conséquences tombent toutes seules :
le noisetier reste bloqué là où le pin sort, la densité protège par dilution,
et les déjections déplacent carbone et azote vers les cellules broutées au lieu
de les faire disparaître. Reste à faire : frottis, écorçage, sanglier, chasse,
clôture.

### 7.5 Interactions positives (le cœur agroforestier)
- **Facilitation / effet nurse** (ch1-A) : sous une nurse, un semis subit moins d'ETP, moins de gel, pas de gibier — mais moins de lumière. Le joueur rejoue le moteur de la succession.
- **Mycorhizes** (ch2-B) — *implémenté* (`src/engine/mycorhizes.ts`) : trois
  types incompatibles (ecto des essences forestières, arbusculaire des
  fruitiers et légumineuses, éricoïde des landes), un réseau par type et par
  cellule, qui suit les hôtes compatibles à l'échelle de leurs RACINES et met
  ~5 ans à se tisser. Un labour n'en laisse que 5 %, et il faut plus de dix ans
  pour revenir : c'est le coût qu'on ne voit pas sur la facture. Gain modélisé :
  +30 % d'absorption d'azote à réseau complet.
  *Ce que je n'ai PAS retenu* : j'avais d'abord modélisé le bénéfice comme une
  extension du rayon racinaire. C'est faux physiquement (les hyphes explorent
  des pores, pas un disque plus grand) et faux dans ses effets — élargir tous
  les disques dilue l'asymétrie de compétition, au point que le hêtre
  n'atteignait plus la canopée à 200 ans. Le gain sur l'eau et le phosphore
  attend donc le cycle du phosphore.
- **Allélopathie** : la juglone du noyer pénalise les sensibles dans un rayon donné (atlas).
- **Pollinisation** : espèces non autofertiles (la plupart des pommiers, kiwaï dioïque, argousier dioïque — atlas) exigent un partenaire compatible à distance de butinage **et** un index pollinisateurs suffisant (fleurs étalées sur l'année, périodes de soudure fin d'hiver/automne de l'atlas). **Dès la v1, au niveau variétal pour les fruitiers** (décision) : chaque variété porte un **groupe de floraison** (A–E) et un statut autofertile/auto-stérile ; deux pommiers de la même variété auto-stérile ne se pollinisent pas — il faut des groupes qui se chevauchent. La fiche espèce des fruitiers embarque donc une liste `varietes` (groupe de floraison, autofertilité, prix/calibre, sensibilités propres).
- **LER affiché** (ch5-B) : le jeu calcule le Land Equivalent Ratio des assolements mixtes vs monoculture — c'est un indicateur de score, et un outil pédagogique.

---

## 8. Le hors-parcelle (paysage, non contrôlable)

Chaque bord de carte a une occupation qui produit des **flux entrants** :
- **Forêt voisine** → pluie de graines (selon les modes de dissémination : vent = partout dégressif, geai = glands posés jusqu'à 500 m par « paquets », ch4-C), colonisation mycorhizienne plus rapide, auxiliaires et pollinisateurs de base, mais aussi gibier.
- **Prairie** → graminées et banque de graines de friche, campagnols.
- **Grande culture intensive** → quasi rien de vivant, dérive de pression ravageurs (pucerons), pas d'auxiliaires.
- **Régénération naturelle** : chaque année, des semis spontanés apparaissent (espèces = f(voisinage + banque de graines de la station + arbres de la parcelle en âge de grainer)). Le joueur peut les garder (gratuit, adapté, mais placé au hasard du disperseur — tirages **pseudo-aléatoires seedés** : la graine de la partie fixe tout, cf. §16) ou les faucher — c'est l'arbitrage régénération vs plantation du ch4-B.

---

## 9. Actions du joueur

Chaque action coûte **de l'argent et/ou du temps de travail** (§10). Liste v1 :

**Sol** : observer/analyser (bêche gratuite = infos partielles, analyse labo payante = valeurs exactes), labour initial (gain N à court terme, casse mycorhizes + déstocke C — le piège classique), paillage, BRF, compost/fumier, chaulage, engrais organique ou minéral (avec pertes par lessivage si mal daté, ch1-C), semis d'engrais verts, faux-semis/fauche.

**Broyat (BRF)** — implémenté : couper offre trois devenirs, et la nuance
compte. `vendre` exporte le bois ; `epandre` le broie et le laisse SUR PLACE,
sous l'ancienne couronne ; `broyer` le charge dans un **tas** (`state.stockBrf`,
le seul objet du modèle qui n'a pas de position — parce qu'un tas n'en a pas),
qu'on épand ensuite où l'on veut, au prix de la manutention. C'est ce qui rend
possible le geste fondateur du §16 : couper les fixateurs là où ils poussent et
**porter leur azote au pied de ce qu'on veut nourrir**. Avec sa contrepartie
désormais modélisée : sous un tapis de plaquettes à C/N 40, les décomposeurs
ponctionnent l'azote du sol avant de le rendre (§7.4, faim d'azote).

**La trogne (têtard)** — implémentée : ni un recépage (on garde le tronc), ni
un élagage (on coupe la charpente), c'est une troisième chose. On coupe la tête
à hauteur d'homme, **au-dessus de la dent du bétail**, elle repart, on y revient
tous les dix ans. Trois conséquences dans le moteur : du bois à chaque passage
sans jamais tuer l'arbre ; une longévité multipliée (chaque étêtage rajeunit la
charpente — c'est pour ça que les plus vieux arbres de nos campagnes sont
presque tous des trognes) ; et une tête qui se creuse à force d'être recoupée,
comptée comme **arbre-habitat** dans l'indice de biodiversité, au même titre
qu'un gros sujet. Le frêne, ajouté avec elle, est l'essence à trogne par
excellence — et la plus menacée de France depuis l'arrivée de la chalarose.

**Végétal** : acheter et planter (plant jeune pas cher/fragile vs plant fort cher/robuste ; v1 : **un seul phénotype par espèce** ; v2 : choix de la provenance MFR, y compris plants méridionaux = migration assistée), semer, tailler/élaguer (bois d'œuvre), **éclaircir** (ch5-A : desserrer pour la résilience), recéper (taillis), trogner, couper, **choisir le devenir de chaque coupe** : vendre (bois d'œuvre / chauffage) · brûler sur place · broyer/épandre · laisser en bois mort. Récolter les fruits (fenêtre de fraîcheur), greffer *(v2 ?)*.

**Aménagements** : clôture, protections individuelles, haie brise-vent, mare (débloque crapauds/libellules), nichoirs/gîtes/perchoirs, ruches (pollinisation + miel), irrigation (réseau ou cuve de récupération — ressource eau limitée et payante, ch7-B), chemin d'accès (réduit le temps de travail des interventions lointaines *(idée à confirmer)*).

**Animaux d'élevage (v1 minimale, v2 complète)** : poules (désherbage/insectes sous verger), moutons en sylvopastoralisme (ch5-B : pâturage = entretien gratuit mais abroutissement si arbres non protégés).

---

## 10. Ressources et économie

- **Argent (€)** : capital de départ selon scénario. Dépenses = plants, matériel, intrants, main-d'œuvre saisonnière. Recettes = fruits (prix dégressifs si monoproduit qui sature le marché local *(à confirmer)*), bois d'œuvre (∝ qualité : droit, élagué, gros diamètre), bois de chauffage, petits fruits/plants, miel. **Aides publiques** scriptées (le cours ch5 les mentionne : aides plantation haies/agroforesterie) et éventuel **paiement pour services (label bas-carbone)** lié au §12. **Découvert autorisé** jusqu'à un plafond (dette à intérêts) ; le crever = faillite, fin de partie (hors bac à sable).
- **Temps de travail : budget annuel en UTH** (unité de travail humain, le terme agricole pour « équivalent temps plein » — on garde « ETP » pour l'évapotranspiration afin d'éviter la collision de sigles). 1 UTH ≈ 1 800 h/an ; le joueur seul = 1 UTH. Chaque action a un coût horaire réaliste (planter un arbre ~1 h, récolter 100 kg de pommes ~3 h *(à calibrer)*). Deux compteurs : les **heures de la semaine** (plafond dur ~60 h/UTH — on peut charbonner en saison de plantation) et la **moyenne annuelle glissante en UTH** — pointer à 70 h une semaine de plantation est OK tant que l'année reste ≤ 1 UTH. Pour dépasser le budget annuel il faut **embaucher** (saisonnier ponctuel ou salarié permanent, € ↔ UTH) : on démarre tout seul, on salarie quand la ferme le permet. Récolte non faite = perdue (ou tombée = litière). C'est ce qui rend la forêt-jardin mature payante : peu d'heures, du rendement (ch6, « le pari des vivaces »).
- **Mécanisation** (`src/engine/mecanisation.ts`) : il n'y a pas *un* temps de
  fauche ou d'épandage, il y en a deux — celui de l'engin et celui de la main
  — et c'est **la disposition des arbres** qui décide lequel s'applique. On
  cherche la meilleure direction de passage, on projette les arbres sur l'axe
  perpendiculaire (deux arbres proches sur cet axe sont dans le même rang) et
  on mesure la part de la zone qui tient dans des couloirs plus larges que
  l'engin. Aucune parcelle n'est déclarée mécanisable : ça se déduit de ce que
  le joueur a planté. Mesuré : des rangs à 4,5 m donnent 76 % de mécanisable,
  les mêmes tiges dispersées 11 %, et un carré serré à 1,8 m 0 % — alignés ou
  non, il n'y a pas la place. La fauche passe ainsi de ~17 h/ha (rangs) à
  ~55 h/ha (dispersé), et la machine se paie (~120 €/ha). C'est ce qui donne
  enfin une raison de jeu à l'alignement, comme en agroforesterie moderne.
  *Reste à faire* : engins de largeurs différentes au choix du joueur,
  itinéraires (demi-tours en bout de rang), tassement du sol.
- **Carbone** : pas une monnaie dépensable, un **score-bilan** (§12), éventuellement monétisé via label.

---

### 10 bis. Trajectoire climatique (implémenté)

`src/engine/climat.ts` superpose aux observations réelles une trajectoire
GIEC — SSP1-2.6, SSP2-4.5, SSP5-8.5, plus un témoin « climat figé » réservé au
laboratoire. Le joueur choisit sa trajectoire et son année de départ (2026 ou
2040) au lancement ; le moteur, lui, ne sait rien du scénario : il ne voit
qu'une semaine plus chaude et un CO₂ plus élevé.

- **La France se réchauffe plus vite que le globe** (×1,4 en hiver, ×1,9 en
  été) : sous SSP5-8.5, une semaine de juillet 2090 est plus de 6 °C au-dessus
  de son équivalent observé.
- **Les étés s'assèchent** (−9 %/°C) pendant que les hivers s'arrosent un peu
  (+3 %/°C) : le total annuel bouge peu, sa répartition beaucoup.
- **Le CO₂ agit deux fois** : il stimule la croissance (réponse logarithmique,
  ~+20 % pour un doublement, appliquée au POTENTIEL donc bornée par la loi du
  minimum — un arbre qui a soif n'en profite pas) et il ferme les stomates, ce
  qui économise de l'eau sans jamais compenser la hausse de l'ETP.
- **Les extrêmes s'aggravent plus vite que la moyenne** : la distribution ne se
  décale pas, elle s'étire par le haut. On amplifie donc l'écart d'une semaine
  à sa normale saisonnière quand il est CHAUD (+8 %/°C de réchauffement) et le
  déficit quand elle est SÈCHE (+5 %/°C) ; les semaines fraîches ou arrosées ne
  sont pas touchées.
- **La mémoire des sécheresses est dans l'ARBRE, pas dans le sol.** Mesuré :
  même sous SSP5-8.5, la réserve profonde revient à 94-100 % à chaque sortie
  d'hiver — chaque été repart à plein. Ce qui garde la trace, c'est la
  **cavitation** : sous tension extrême, l'eau casse en colonnes dans les
  vaisseaux, et ces vaisseaux ne se réparent pas ; l'arbre ne récupère qu'en
  fabriquant du bois neuf, soit trois à quatre ans pour effacer un épisode
  sévère. Un arbre embolisé transpire moins et reste en déficit même le sol
  plein — c'est pourquoi il meurt souvent à la sécheresse SUIVANTE et non à
  celle qui l'a abîmé. C'est le décalage observé après 1976, 2003 et 2018.

Constat au passage : même sans scénario, la série 1964-2023 rejouée telle
quelle fait monter l'ETP de 16 % en soixante ans. Le réchauffement observé est
déjà dans les données.

---

### 10 ter. Le paysage autour de la parcelle (implémenté)

`src/engine/paysage.ts`. Une parcelle d'un hectare ne vit pas seule, et ce qui
l'entoure décidait jusqu'ici de quatre choses éparpillées dans quatre champs
sans lien : densité de gibier, dépôts atmosphériques d'azote, pluie de semis,
exposition au vent. On pouvait donc décrire une parcelle « au cœur d'une
hêtraie » qui ne recevait aucun semis de hêtre, ou une parcelle urbaine pleine
de chevreuils.

Le paysage est désormais **un objet nommé**, décrit en une phrase, trois parts
(boisée, cultivée, urbanisée) et une liste de semenciers — et tout le reste
s'en déduit : le gibier a besoin de couvert ; les dépôts d'azote viennent de
l'ammoniac des cultures et des oxydes d'azote de la circulation ; le vent est
freiné par les boisements voisins ; et la **fréquentation humaine** commande
les départs de feu, qui sont d'origine humaine dans leur immense majorité.

Six paysages pour commencer : au cœur d'un massif, dans un bocage d'élevage,
en pleine plaine céréalière, en lisière de banlieue, au milieu de la lande, en
lisière de forêt. **Le joueur choisit le sien au lancement**, indépendamment de
la station : la même terre au milieu d'une hêtraie ou d'un lotissement, ce
n'est pas la même partie. Un nouveau paysage se décrit en quatre nombres et une
liste de semenciers.

*Et l'entourage se règle CÔTÉ PAR CÔTÉ* : forêt au nord, champs au sud, ça
n'est pas la même partie. Ce qui se déduit des quatre bordures ne s'agrège pas
de la même façon selon ce qu'on regarde — les semences **s'additionnent**
(quatre côtés boisés sèment plus que deux), le gibier et les dépôts d'azote se
**moyennent** (ils baignent la parcelle), tandis que la fréquentation humaine
et l'exposition au vent prennent le **maximum** : un seul côté urbanisé suffit
à amener les départs de feu, un seul côté ouvert à laisser passer le vent.

*Et toutes les combinaisons ont un sens*, parce que **les voisins subissent le
même sol que nous**. Une lande sableuse « au cœur d'un massif forestier » n'est
pas une hêtraie — le hêtre ne tient pas plus dehors que dedans sur un podzol à
pH 4,5 : c'est une pinède. Le paysage dit une intention et une intensité, le
terrain dit quelles essences la portent. Les semenciers déclarés ne sont donc
que des candidats : on écarte ceux que la station ne supporte pas (facteur pH
du moteur, réserve utile), et si aucun ne passe, on prend les essences de
l'atlas qui, elles, y vivent — en gardant l'abondance voulue.

**Les départs de feu ont enfin une source.** Le moteur faisait jusqu'ici de
l'autocombustion : une probabilité hebdomadaire fonction de la sécheresse, de
la chaleur, du combustible et du vent, sans que personne n'allume rien. Or en
France la quasi-totalité des départs est d'origine humaine — mégot, travaux,
barbecue, ligne électrique — et non la foudre. La `frequentationHumaine` du
paysage multiplie donc la probabilité de départ : une campagne ordinaire vaut
1, un massif isolé un peu moins, une lisière de banlieue une fois et demie
plus.

**Et le combustible sous couvert fermé ne porte plus le feu.** C'était l'autre
moitié du problème : une hêtraie de Touraine brûlait. Sous une futaie feuillue
dense, la litière reste humide — le couvert coupe le soleil et le vent. C'est
la vraie raison pour laquelle les incendies français courent en pinède, en
maquis et en lande, et presque jamais en hêtraie.

---

## 11. Succession écologique « moteur de fond »

Sans intervention, chaque cellule suit la trajectoire du ch1-A : sol nu → annuelles → vivaces/graminées → fruticée épineuse (ronce, prunellier, aubépine = nurses) → pionniers (bouleau, saule, genêt) → intermédiaires → climaciques (hêtre, chêne) via **facilitation** (les pionniers créent l'ombre et le sol qui permettent aux suivants de s'installer, et sont ensuite éliminés par cette même ombre). Le stade est émergent (résultat des règles lumière/sol/dissémination), pas une variable codée en dur — mais on **teste** que la trajectoire émerge bien. Objectif de design du ch6 : le joueur apprend à viser la **jeune forêt** productive, pas le climax sombre.

---

## 12. Comptabilité carbone

Réponse à ta question : oui — **brûler = réémettre immédiatement** ; les vrais stockages sont 1) la **biomasse vivante** tant qu'elle est sur pied, 2) le **sol** (humus stable — c'est le plus gros stock en tempéré), 3) le **bois d'œuvre** vendu pour fabrication (charpente, meuble), qui stocke pendant la durée de vie du produit. Le bois-énergie n'est « pas pire » que la décomposition à terme, mais ne stocke rien.

**Pools suivis** (t C) : biomasse aérienne · biomasse racinaire · bois mort · litière · MO du sol (par horizon) · produits bois exportés (avec **durée de vie** : œuvre ~50 ans, palette ~10, chauffage 0).

**Flux** : photosynthèse (entrée) ; respiration ; décomposition (litière → CO₂ + humus, coefficient d'humification ~10–30 % selon C/N *(à calibrer)*) ; labour (déstockage accéléré de la MO : une prairie retournée perd massivement — ta remarque, et ch1-C « le sol nu ») ; exports (récoltes, bois) ; combustion (retour immédiat).

**Règles clés** :
- Occupation initiale = stock initial : prairie permanente ~80 t C/ha dans le sol, grande culture ~45 *(à calibrer sur refs INRAE)*. Planter une forêt sur prairie **en labourant** peut être négatif pendant des années — vérité contre-intuitive que le jeu doit montrer.
- Biomasse : C ≈ 47–50 % de la matière sèche ; racines ≈ 25–30 % de l'aérien *(à calibrer par type)*.
- L'affichage montre le **bilan net cumulé** et sa décomposition par pool — l'un des écrans pédagogiques les plus importants.

---

## 13. Objectifs, score, modes de jeu

Pas de « victoire » unique : des **scénarios** avec objectifs, sur le modèle de l'étude de cas du cours :
1. **Diversifier la pinède** (Sud-Gironde) : réduire la part du pin sous 50 % sans jamais être déficitaire, en 20 ans.
2. **Sortir de la grande culture** (plateau picard) : atteindre un revenu stable + MO du sol ×2 en 25 ans.
3. **Forêt-jardin vivrière** (bocage breton) : X kg de nourriture/an étalés sur ≥ 9 mois, en < 10 h/semaine au régime de croisière (ch7-B, ordres de grandeur de surface).
4. **Bas carbone** : maximiser le C net stocké à 40 ans, trésorerie ≥ 0.
5. **Bac à sable** : tous curseurs libres, y compris scénario SSP et année de départ (ch8).

**Indicateurs permanents** : trésorerie · h de travail · bilan C · **index biodiversité** (richesse spécifique pondérée × diversité des strates × habitats : bois mort, mare, haies, fleurs 12 mois — proxy honnête, à afficher comme tel) · LER · autonomie alimentaire.

*Implémenté* (`src/engine/biodiversite.ts`, affiché dans le HUD) : richesse
d'essences, équitabilité de Shannon (une essence à 95 % vaut un désert, même à
richesse élevée), diversité des strates, gros arbres, bois mort, part de
couvert permanent, étalement des floraisons. C'est ce qui donne au chêne-liège
dans une pinède une valeur que son bois seul ne dit pas : sempervirent, il
apporte du couvert toute l'année, une strate de plus et une essence de plus.
*Manque* : mare et haies (pas d'objets non-arbres), arbres à cavités, lisières,
et surtout un **effet en retour** — l'indice s'observe mais ne change rien au
peuplement tant que le module biotique (§7.4) n'existe pas.

---

## 14. Hors périmètre v1 (assumé, pour te répondre « et après ? »)

Variabilité individuelle (ta v2 : tirage d'un « génotype » par individu autour des moyennes d'espèce — le socle déterministe reste, on tire juste les paramètres à la plantation avec une graine aléatoire fixée par partie) · météo stochastique · feu comme système complet (v1 : juste l'inflammabilité et un événement scripté en station 1) · greffe (les **variétés**, elles, sont en v1 — voir §7.5) · multijoueur/multi-parcelles · marché dynamique · réglementation (défrichement, PLU) · maraîchage annuel complet (v1 : couverts et quelques vivaces potagères de l'atlas herbacées, le potager annuel du ch7 viendra après).

---

## 15. Décisions actées (2026-09-01) et points encore ouverts

**Acté :**
1. Tick hebdomadaire, parties de 30–60 ans avec accélération.
2. Grille de 1 m² ; 1 ha par défaut mais **taille paramétrable** (le moteur vise plusieurs ha, voir §1.2).
3. Météo scriptée déterministe ; **ETP par Hargreaves** (validé).
4. Temps de travail budgété **à l'année en UTH**, avec compteur hebdomadaire et plafond dur par semaine (§10).
5. **Découvert autorisé avec plafond** ; faillite au-delà (hors bac à sable).
6. Connaissance du sol **par observation** (bio-indicatrices : callune = acide, cornouiller mâle = calcaire — atlas) **+ analyses payantes** pour les valeurs exactes.
7. **Pollinisation variétale dès la v1** (§7.5).
8. Climat = **trajectoires GIEC (SSP1-2.6 / SSP2-4.5 / SSP5-8.5)** régionalisées France (DRIAS), **année de départ au choix** (2026 ou 2040), effet CO₂ modélisé (§3). Le réchauffement est visible en cours de partie, quel que soit le scénario.
9. Greffes en v2 ; variétés en v1.
10. **Un seul phénotype par espèce en v1** ; l'achat de provenances plus méridionales (migration assistée) arrivera en v2, avec la variabilité individuelle.
11. Aléa (dispersion voisine…) autorisé mais **seedé** : le déterminisme se teste à seed fixée, les tests écologiques valident des critères larges sur plusieurs seeds (§16).

**Encore ouvert :**
- **Vue graphique** : hypothèse de travail = **isométrique** ; maquette à faire au moment de l'UI, en vérifiant deux points durs de l'iso : lisibilité des ombres portées (information de gameplay) et occlusion des petits sujets derrière les grands arbres. Une vue de dessus « plan de gestion » restera sans doute nécessaire en complément.
- **Nom** : « Canopée » reste le nom de code.
- **Stack technique** : proposition détaillée dans [stack.md](stack.md), en cours de validation.

---

## 16. Stratégie de tests (validation des comportements)

Le moteur étant une fonction pure `état + actions → état`, tout se teste sans navigateur, dès la V0 :

- **Tests unitaires par processus** : bilan hydrique, minéralisation, loi du minimum, degrés-jours/phénologie, interception lumineuse par strates.
- **Tests de conservation (propriétés)** : à chaque tick, l'eau (pluie = interception + ruissellement + drainage + Δstock + prélèvements), le carbone et l'azote sont **conservés** sur l'ensemble des pools. La fuite de matière est LE bug classique des simulateurs.
- **Test de déterminisme** : tout l'aléa du moteur (dispersion depuis le voisinage, placement des semis…) passe par un **PRNG seedé** stocké dans la sauvegarde — jamais `Math.random`. Même seed + mêmes actions datées → hash d'état identique à chaque tick (c'est un test de non-régression, pas une contrainte de gameplay : deux parties ont des seeds différentes et divergent normalement).
- **Tests écologiques de bout en bout** : on simule 60 ans et on vérifie que les **trajectoires émergent** des règles, sans les avoir codées en dur —
  - friche sur limon picard, zéro intervention → fruticée → pionniers → les climaciques (hêtre, chêne) dominent la canopée à l'an 60 ;
  - même station **fauchée chaque année** → reste une prairie ;
  - lande girondine sèche et acide → pins/bouleaux s'installent, le hêtre échoue ;
  - héliophile planté sous canopée fermée → meurt en quelques années ; un sciaphile y survit ;
  - abricotier en Massif central → vivant mais quasi jamais de récolte (gel des fleurs) ;
  - aulne prospère en berge engorgée là où le chêne pubescent meurt ;
  - légumineuses coupées **épandues** → N du sol ↑ et croissance des voisins ↑ vs le run où on les **vend**.
  Ces tests sont la **définition exécutable du réalisme** : idéalement, chaque règle de ce document finit en assertion. Leurs critères sont volontairement **larges** (« le hêtre domine la canopée », « couverture ligneuse > 80 % », jamais « 143 hêtres à l'an 60 ») et chaque scénario tourne sur **plusieurs seeds** : ils doivent survivre à la fois à l'aléa de dispersion et aux recalibrages du moteur.
- **Golden runs** : quelques parties de référence snapshotées ; toute modification du moteur qui change leur sortie doit être assumée explicitement (même esprit que tes tests de non-régression dbt).

---

## 17. Feuille de route proposée

- **V0 « le sol et l'eau »** : 1 station, météo scriptée, bilan hydrique + N, 5 espèces, croissance Liebig, plantation/coupe, argent. → valider que « ça pousse juste ».
- **V0.5 « la lumière »** : strates, ombres, tempéraments, succession émergente, régénération naturelle.
- **V1 « le jeu »** : 3 stations, ~40 ligneux + 20 herbacées, phénologie/gel/récoltes, ravageurs à seuils, auxiliaires, carbone complet, temps de travail, scénarios 1 et 3.
- **V2** : variabilité individuelle, greffes/variétés, feu, animaux d'élevage complets, +2 °C généralisé.
