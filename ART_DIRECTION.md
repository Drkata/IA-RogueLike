# Direction artistique : Arcaniste des Profondeurs

Référence pour toute évolution visuelle et sonore du jeu : couleurs, textures, lumière, entités, effets, interface et son.
Avant de modifier l'un d'eux, lire la section concernée. Après, lancer les vérifications de la section 11.

---

## 1. Intention

Un arcaniste descend dans des ruines englouties : forêt nocturne, cité au crépuscule, grotte cristalline, puis une base démoniaque.
**Le monde est sombre et mat, seule la magie brille.**
L'interface est son grimoire, avec l'encre violette des pages, le vélin du texte et la dorure des cadres.

C'est un FPS : **la lisibilité passe avant la beauté**. En un coup d'œil, on doit distinguer un ennemi, un tir ennemi, un tir allié et un objet à ramasser.

## 2. Les sept règles

1. **Une couleur = un sens.** La palette (section 3) est sémantique, jamais décorative. Le rouge braise veut toujours dire vie ou danger.
2. **Le décor est mat, la magie brille.** L'émission de lumière est réservée à la lave, aux cristaux, aux runes, aux yeux, aux projectiles, aux objets, aux coffres et aux effets. Jamais un mur ordinaire.
3. **La lumière est physique et calibrée par le calcul**, pas réglée à l'œil (section 7).
4. **Tout est procédural et seedé.** Aucune image importée, sauf les icônes game-icons et les polices.
5. **Ennemis : silhouette et regard.** Corps aux teintes sourdes, yeux lumineux.
6. **Une ressource = une forme + une couleur** (objets à ramasser, section 8).
7. **Budget de performance tenu.** Géométries et matériaux partagés, décor instancié ou fusionné (section 10).

## 3. Palette

Source unique côté 3D : `src/core/Palette.js`. Côté interface : les variables CSS en tête de `src/ui/hud.css`.
**Les deux doivent rester identiques.**

| Rôle | JS `PALETTE.` | CSS | Hex | Sens et usages |
|---|---|---|---|---|
| Encre | `ink` | `--ink` | `#17121f` | Fonds de panneaux, fond des barres de vie |
| Vélin | `vellum` | `--vellum` | `#ece3cc` | Texte, chiffres de dégâts normaux, flash du boss touché |
| Dorure | `gilt` / `giltBright` | `--gilt` / `--gilt-bright` | `#c8a24e` / `#e6c983` | Or, rangs, trésor, marchand, flash d'impact |
| Braise | `ember` / `emberBright` | `--ember` / `--ember-bright` | `#c93d27` / `#ff7a52` | Vie, danger, tirs ennemis, yeux des ennemis, feu, boss |
| Éther | `aether` / `aetherBright` | `--aether` / `--aether-bright` | `#3fae9f` / `#9ef0e2` | Mana, magie du joueur, bonus, bouclier, soin |
| Maléfice | `hex` / `hexBright` | `--hex` / `--hex-bright` | `#8250c9` / `#c9a6ff` | Chaos, coups critiques, élites, tourelles, autel |
| Sauge | `sage` | `--sage` | `#8fcf9a` | Pleine santé, statistiques de vitalité |

Couleurs hors palette autorisées, et seulement là :
- les teintes des matériaux de biome (dans `TextureGenerator.js`) ;
- le corps des ennemis (`BODY_COLORS` dans `EnemyMesh.js`) ;
- les lumières des thèmes (section 7) ;
- les métaux, bois, pierres et toiles neutres (piège, coffre, bâton, mobilier des salles spéciales).

## 4. Interface (HUD et menus)

- **Polices** :
  - *Grenze Gotisch* pour les titres et les grands chiffres (vie, mana, niveau) ;
  - *Alegreya Sans* pour tout le reste.
  
  Toutes deux viennent de Google Fonts, chargées dans `index.html`.
- **Écriture** :
  - français, phrases en minuscules (pas de capitales dans les étiquettes) ;
  - chiffres tabulaires ;
  - formatage par `src/ui/format.js`, avec espace fine insécable avant les unités et la virgule décimale.
- **HUD** :
  - en haut à gauche, le miroir (minimap ronde, `Minimap.js`) et la chronique (niveau, ennemis, or). Le miroir est la carte des hauteurs du niveau, qui tourne autour du joueur : plus un sol est haut, plus il est clair (de l'encre vers le vélin, retenu pour que le plateau à 6 m n'éblouisse pas), et une ombre borde chaque dénivelé qu'on ne remonte pas en marchant (`PLAYER_CLIMB`). Il montre de 28 cases de rayon sur une petite carte à 44 sur une grande. Ennemis en braise, joueur en flèche d'éther ;
  - en bas à gauche, la vie ; en bas à droite, le mana, et au-dessus les deux armes (celle en main allumée, touches 1 et 2) ;
  - **les statistiques ne restent pas affichées** : c'est une fiche à la demande (`StatsDisplay.js`), au centre tant que Tab est maintenu, dans l'écran de pause (donc aussi sur tactile) et dans le menu d'amélioration. Elle se lit en quatre groupes titrés (survie, sceptre, épée, pouvoirs), avec des unités partout. Une statistique encore à sa valeur de départ sans effet (armure 0, perforation 0, vitesse 100 %…) n'y figure pas, et un groupe vide disparaît ;
  - en bas au centre, les bonus temporaires ;
  - au centre, les messages et le compte à rebours ;
  - en haut au centre, la barre du boss.
- **Règle de performance** : un composant du HUD ne touche le DOM que si la valeur affichée change. Il est appelé à chaque frame.
- **Menus** : des `.overlay` affichés avec l'attribut `hidden`, sur un fond teinté par contexte (violet pour l'autel, éther pour la boutique, braise pour la mort).
- **Cartes d'amélioration** : des cartes de tarot, teintées par catégorie. Offensive `#e58f6f`, vitalité `--sage`, arcanes `--hex-bright`. Une même teinte par catégorie dans `src/ui/SVGIcons.js`.
- **Étiquette d'arme** (`.weapon-tag`, `WEAPON_TAGS` dans `Game.js`) : chaque carte d'amélioration et chaque pacte dit ce qu'il touche. Bâton en éther, Épée en vélin, Bâton + Épée en dorure, Général en sauge. Une nouvelle amélioration ou un nouveau pacte doit toujours en avoir une (`for`).
- **Icônes** : game-icons.net via l'API Iconify (`SVGIcons.js`), toujours teintées avec la palette.
- **Accessibilité** : focus visible sur tout ce qui est cliquable, et `prefers-reduced-motion` respecté.
- **Tactile** (`src/core/Device.js`) :
  - **Détection** : un appareil dont le pointeur principal est un doigt (`pointer: coarse`) reçoit la classe `is-touch` sur `<html>`, et `is-phone` s'il a un petit écran (moins de 600 px de côté).
  - **Commandes** (`src/ui/TouchControls.js`, Pointer Events) : joystick analogique qui apparaît sous le pouce gauche (40 % gauche de l'écran), glisser ailleurs pour regarder, arc de boutons en bas à droite.
  - **Boutons** : Attaquer (éther, 88 px, vise aussi en glissant), Sauter, Tir chargé ou Garde, Recharger, Changer d'arme (dorure), Interagir (dorure). Ce sont des cercles d'encre translucides d'au moins 44 px, avec des icônes game-icons. Attaquer et le second bouton montent l'icône de l'arme en main (`body.weapon-sword`).
  - **HUD** : les pouces occupant les coins du bas, la vie et le mana montent en haut à droite ; la fiche de statistiques se lit dans l'écran de pause. Le HUD et les menus sont compactés sur téléphone, et les marges respectent les encoches (`env(safe-area-inset-*)`).
  - **Orientation** : téléphone en paysage uniquement. En portrait, un écran « Tournez votre téléphone » s'affiche et le jeu attend.
  - **Messages d'interaction** : toujours passer par `input.prompt(action)`, qui dit « Appuyez sur E » ou « Touchez le bouton d'action » selon l'appareil.

## 5. Biomes

Le thème change tous les 5 niveaux, en cycle : forêt (1 à 5), cité (6 à 10), grotte (11 à 15), enfer (16 à 20), puis on recommence.
Les boss (niveaux multiples de 10) prennent le thème en cours.
Fichiers : `src/systems/themes/*Theme.js`, enregistrés dans `ThemeManager.js`.

| Thème (`biome`) | Murs | Sol | Ciel | Lumière clé | Brouillard | Accent (runes) |
|---|---|---|---|---|---|---|
| Forêt enchantée (`forest`) | Ruines de pierre moussue, mousse dans les joints et au pied | Terre, tapis de mousse, feuilles mortes | Nuit étoilée, nébuleuses, lune froide, lisière de pins | Lune bleu pâle | `#1c2a3c` | `#5fe0c8` |
| Cité médiévale (`city`) | Pierre de taille calcaire, joints sombres, suie | Pavés arrondis | Coucher de soleil, tours et flèches à l'horizon | Soleil rasant orangé | `#5a4458` | `#ffb060` |
| Grotte profonde (`cave`) | Roche stratifiée, fissures, veines de cristal lumineuses | Roche, gravier, éclats de cristal lumineux | Voûte noire, lueurs de cristaux | Lumière froide des cristaux | `#0d0e18` | `#8fb0ff` |
| Base démoniaque (`hell`) | Basalte fendu de lave | Dalles de basalte, veines de lave | Lune de sang, braises, crête volcanique | Lune de sang | `#2a0a08` | `#ff5a1a` |

**Salles spéciales** (sanctuaires) : bâties dans la pierre du biome, elles se reconnaissent à **une seule couleur magique, celle de leur contenu** (`SHRINE_COLORS` dans `Palette.js`) :

| Contenu | Couleur | Objet central |
|---|---|---|
| Trésor | `giltBright` | Coffre |
| Marchand | `giltBright` | Échoppe |
| Autel du Chaos | `hexBright` | Autel à cornes |
| Fontaine de jouvence | `aetherBright` | Fontaine à deux vasques |

- **Murs** : chaque mur de l'anneau de la salle, à son étage seulement, porte une **frise de runes** gravée entre 2,1 et 2,5 m. Elle est lumineuse dans la couleur du contenu et visible aussi depuis les couloirs.
- **Sol** : un **sceau** (cercle magique) dans la même couleur, différent pour chaque contenu, sous l'objet central.
- **Colonne de lumière** : elle monte de l'objet central à 22 m, au-dessus des murs, pour qu'on trouve la salle de loin. Elle s'enfonce dans le sol quand l'objet est utilisé.
- **Gardien** : un seul gros œil flottant au-dessus de l'objet central, au regard braise d'ennemi, relié à lui par un fil de lumière. Tant qu'il vit, la récompense est scellée (« Détruisez le gardien pour libérer la récompense ») ; sa destruction la libère (« Gardien détruit : la récompense est libérée »).
- **Une fois utilisé**, l'objet central passe au gris en 1,2 s et sa lumière s'éteint.
- **Quantité** : au plus 2 salles spéciales par niveau jusqu'au niveau 10, puis une de plus tous les 10 niveaux. Elles sont rares, donc elles doivent se voir.

**Îles flottantes et ponts** : pierre = texture de mur du biome, dessus = texture de sol, runes = `accent`, lianes = `foliage`. Ils sont **solides** : les tirs rebondissent dessus, le joueur peut y monter. Une pièce plus fine que 20 cm (liane, chaîne) n'a pas de collision, et les cristaux non plus.

`BunkerTheme`, `IndustrialTheme` et `LabTheme` sont des thèmes de science-fiction **hors DA**. Ils n'ont ni biome ni éclairage, et leurs textures n'existent plus. Ne pas les brancher sans les réécrire selon ce document.

## 6. Textures

Tout est dans `src/systems/TextureGenerator.js`, peint pixel par pixel à partir de bruits seedés.

- **Trois calques par surface** :
  - `albedo`, la couleur, en sRGB ;
  - `height`, la bump map, linéaire : 0 = creux (joints, fissures), 1 = saillie ;
  - `glow`, la carte d'émission, optionnelle : noir partout sauf ce qui brille.
- **Échelles** :
  - mur : 512 px pour une face de 2 m ;
  - sol : une tuile de 512 px pour 4 m, répétée ;
  - ciel : 2048 × 1024 en équirectangulaire, horizon à la ligne du milieu, zénith en haut.
- **Tileable obligatoire.** Les blocs de base le sont (`fbm`, `ridged`, `voronoi`, `masonry`). Tout ce qui est dessiné par-dessus passe par `drawWrapped`.
- **Seedé obligatoire** : `seededRandom(seed)`, jamais `Math.random` dans un générateur de texture.
- **Albédo moyen entre 0,20 et 0,50**, mesuré par `npm run preview:visuals`. Un biome sombre s'obtient par la couleur de ses matériaux, **pas en baissant la lumière** : l'exposition reste la même partout, pour que les ennemis et les objets gardent le même rendu.
- **Conversion** : toujours `TextureGenerator.toTexture()` ou `toTextures()`, qui posent l'espace colorimétrique, la répétition et l'anisotropie. Une `CanvasTexture` couleur sans `colorSpace = SRGBColorSpace` paraît délavée.
- **Matériaux** : `LevelManager` construit un `ThemeKit` par thème, avec 3 variantes de mur, le mur à frise des salles spéciales (une texture, un matériau par couleur de contenu), le sol, le ciel, les 4 sceaux et les détails des îles. Il est réutilisé par tous les niveaux du thème : la génération (de l'ordre de la seconde mesurée en Node) n'a lieu qu'au changement de thème. Réglages : `roughness` 0,9 (murs) et 0,95 (sol), `metalness` 0, `bumpScale` 1, `emissiveIntensity` 1,5 (murs) et 1,4 (frise).
- **Sol** : sa tuile est répétée par les UV, et une **carte d'ombres de contact** (`floorShadowCanvas`, utilisée comme `aoMap`) assombrit le pied des murs. Les sceaux des salles spéciales sont des décalques posés par-dessus.

## 7. Lumière

**Rig** (`Game.js`) : une `HemisphereLight` (ciel et sol) pour le remplissage, une `DirectionalLight` comme lumière clé (lune ou soleil), sans ombres.
Le tone mapping est `NeutralToneMapping` : les couleurs de base restent telles que peintes et seules les lueurs les plus fortes sont adoucies.
Les intensités sont en **unités physiques** (three.js r155 et plus).

Valeurs par thème (dans `lighting`) :

| Biome | `sky` | `ground` | `fill` | `sun` | `sunIntensity` | `sunDirection` | Lumières de salle |
|---|---|---|---|---|---|---|---|
| forest | `#a0b8d8` | `#3a4a32` | 4,4 | `#c8dcff` | 6,0 | 0,45 / 0,75 / 0,35 | `#7fffe0`, 18 cd |
| city | `#a8b4dc` | `#704e30` | 4,0 | `#ffc890` | 5,0 | −0,7 / 0,5 / 0,35 | `#ffa040`, 18 cd |
| cave | `#8a90c8` | `#404058` | 7,5 | `#a8b8ff` | 5,0 | 0,5 / 0,7 / 0,3 | `#8fb0ff`, 24 cd |
| hell | `#d05850` | `#502018` | 10,0 | `#ff7840` | 9,5 | 0,5 / 0,55 / −0,6 | `#ff6a20`, 22 cd |

**Cibles de luminosité à l'écran** (0 = noir, 1 = blanc), vérifiées par `npm run preview:visuals` :

| Surface | Cible | forest | city | cave | hell |
|---|---|---|---|---|---|
| Mur face à la lumière clé | 0,22 à 0,60 | 0,41 | 0,51 | 0,27 | 0,23 |
| Mur à l'ombre | 0,12 à 0,35 | 0,25 | 0,29 | 0,19 | 0,13 |
| Sol | 0,20 à 0,45 | 0,35 | 0,37 | 0,35 | 0,26 |

Le calcul reproduit le shading de three.js :
`luminosité = sRGB(neutral(albédo_linéaire / π × E))`, avec `E = fill × mélange(ground, sky, ½·n.y + ½) + sunIntensity × sun × max(0, n·l)`.
Si vous changez l'albédo d'une texture ou une valeur de lumière, **relancez la calibration**.

**Lumières ponctuelles** (candelas, décroissance physique) :

| Source | Intensité | Portée |
|---|---|---|
| Lumière de salle | 18 à 24 cd | 14 m |
| Autel, échoppe, fontaine | 8 cd, couleur du contenu | 6 m |
| Orbe du bâton | 2 cd au repos, jusqu'à 5 cd en fin de recharge, jusqu'à 27 cd au tir | 3 à 6 m |

Sous 5 cd, une `PointLight` est quasi invisible.

**À respecter :**
- **Pas d'`AmbientLight`.**
- **Ne pas ajouter ni retirer de `PointLight` en cours de niveau** : cela recompile tous les shaders et provoque un gel. Pour une lueur, utiliser un sprite additif avec `TextureGenerator.getGlowTexture()`. Pour éteindre une lumière, mettre `intensity = 0`.
- **Le nombre de `PointLight` ne change pas non plus d'un niveau à l'autre** : salles et objets centraux des salles spéciales empruntent leurs lumières à un lot fixe de 8 (`LevelManager.takeLight`, éteintes à chaque niveau). Chaque salle spéciale a la sienne ; les salles ordinaires se partagent le reste. Ne pas créer de `new THREE.PointLight` ailleurs.

## 8. Entités et effets

| Élément | Forme | Couleur | Notes |
|---|---|---|---|
| Bâton du joueur | Un modèle par palier de ses propres améliorations (0, 6, 11, 16, 21, 26 niveaux ; les critiques, partagées avec l'épée, ne comptent pour aucune des deux) : apprenti (griffes dorées), sève (racines, liane et feuilles), givre (griffes d'argent, glace, éclats en orbite), maléfice (croissant de cornes d'os, anneau de runes), abysses (deux anneaux en gyroscope), soleil (couronne dorée, auréole à rayons, incrustation en spirale). Cristal à facettes et halo additif | Cristal, glace, runes et auréole : éther, sauge, givre `#7fb0ff`, maléfice, maléfice clair, dorure. Bois de chêne, puis d'ébène `#352838` cerclé d'or dès le maléfice | `StaffMesh.js` (`STAFF_TIERS`), animé par `Weapon.js`. Dessiné dans le premier 2 % de la profondeur : il ne s'enfonce jamais dans un mur. **Le cristal dit le mana** : son éclat suit le chargeur, il se remplit pendant la recharge et s'embrase à chaque tir. Animations : respiration, balancement à chaque pas, retard sur le regard. **Tir** : un geste de lanceur de sort, pas un recul d'arme à feu : le bâton pousse le cristal vers le réticule, d'où part le projectile, en pivotant d'un côté puis de l'autre, et le cristal crache des étincelles vers l'avant. **Recharge** : une canalisation. Le bâton se dresse sur la droite, sans masquer le réticule. Le cristal sort de ses griffes et aspire des grains de mana en spirale. Lui et tout ce qui tourne autour accélèrent, et le bâton tremble de plus en plus. Plein, le cristal retombe dans ses griffes avec un à-coup, un éclair et une gerbe de mana. Les grains sont un seul `Points` additif, caché hors recharge et hors tir. **Tir chargé** (clic droit, 1,5 s immobile) : le bâton se tend vers le réticule, le cristal enfle, s'emballe et aspire les grains deux fois plus vite, le bâton tremble ; le projectile part d'une taille qui suit le mana vidé, et la recharge enchaîne aussitôt. **Rangé** (épée en main) : il descend sous la vue, sa lumière reste allumée (retirer une lumière recompile les shaders). Après 8 s de calme, un moulinet. Sans mouvement si `prefers-reduced-motion` |
| Épée du joueur | Un modèle par palier de ses propres améliorations (dégâts, vitesse, allonge : 0, 3, 7, 12, 18, 25 niveaux) : apprentie (garde droite dorée), sève (nœud de bois, racines tombantes et feuilles), givre (garde d'argent, glace, éclats en orbite autour de la lame), maléfice (lame noircie à barbelures, croissant de cornes d'os), abysses (anneau de runes qui tourne autour de la lame), soleil (garde en ailes dorées, incrustations, auréole). Dans un palier, chaque niveau d'allonge allonge la lame de 3 % et chaque niveau de dégâts l'élargit de 3 %. Toujours : lame plate, rune lumineuse le long de la lame, bagues, poignée de cuir, cristal au pommeau | Rune, pommeau, glace, anneau et auréole aux couleurs du cristal du bâton, palier pour palier (éther, sauge, givre, maléfice, maléfice clair, dorure). Acier clair `#c9d0da` avec un peu de lumière propre (une lame nue disparaît dans le noir), acier noirci `#7d6f91` au maléfice et aux abysses | `SwordMesh.js` (`SWORD_TIERS`), animée par `Sword.js` (reconstruite à chaque amélioration de l'épée, cachée si elle est rangée ; ce qui tourne s'emballe sur une frappe ou une parade) ; même astuce de profondeur que le bâton (`drawInFront`). **Frappe** : la lame balaie l'écran d'un côté puis de l'autre en revers, avec un croissant de lumière additif (160° au plus à l'écran, même avec le pacte du tourbillon). **Garde** : lame en travers sous le réticule, le plat face aux tirs ; l'éclat de la rune et un sursaut signalent une parade. La rune bat vite quand une riposte est prête. Les ondes du pacte de la lame d'onde sont un croissant plat (`WAVE_GEOMETRY`) tiré comme un projectile |
| Tirs du joueur | Cristal et halo additif | `aetherBright` ; critique `hexBright` ; explosif `emberBright` | `Projectile.js`, choix automatique |
| Tirs ennemis | Idem | `emberBright` | Laser du boss `hexBright` (sphères), météores `ember` |
| Tirs des gardiens | Orbe lent | `hexBright` | Distinct des tirs de sbires |
| Ennemis | Humanoïdes de primitives, fusionnés en un mesh | Corps : 8 teintes sourdes (`BODY_COLORS`), ombrées par partie | Yeux `emberBright`, ou `hexBright` à partir du niveau 7 (élites) ; armure (niveau 4+) = plastron sombre |
| Gardien de salle spéciale (`MagicalSentinel`) | Gros œil de pierre sombre (3,5 m d'envergure avec ses anneaux, `SIZE` = 2 : on doit le voir de loin comme un ennemi), centré à 3,4 m au-dessus de la récompense : iris braise et pupille fendue qui suivent le joueur, deux anneaux en gyroscope dont un hérissé de pointes, fil de lumière vers la récompense, barre de vie toujours visible | Iris, halo et fil `ember`/`emberBright` (regard d'ennemi, couleur qu'aucune récompense n'utilise), pierre `#3a3538` | Un seul par salle ; il voit depuis 2,8 m (`SIGHT_HEIGHT`, sous le haut des murs) pour que les murs bloquent sa vue, même si son corps dépasse ; ses anneaux restent au-dessus de la plus haute récompense (auvent du marchand, 2,1 m), y compris quand il grossit un instant sous un coup |
| Boss (Sentinelle colossale) | Œil de pierre de 8 m (iris et pupille fendue qui suivent le joueur), trois anneaux en gyroscope cloutés de runes et hérissés de pointes, rochers en orbite, halo | Pierre `#2e2a2e` ; iris, runes et halo dans la **couleur de l'attaque qui se prépare** : braise au repos, `hexBright` vague d'énergie, `emberBright` tourbillon, `ember` météores, `hex` renforts | La couleur monte pendant l'annonce et la pupille se plisse ; à terre, iris éteint qui vacille et pupille dilatée ; flash `vellum` quand il est touché. Pas de `PointLight` (un sprite de halo) |
| Potion de vie | Fiole | `ember` | Halo `emberBright` |
| Mana | Cristal allongé | `aether` | Halo `aetherBright` |
| Or | Pièce debout | `gilt`, métallique | Halo `giltBright` |
| Amélioration | Rune (icosaèdre) | `hex` | Halo `hexBright` |
| Objets attirés (amélioration Aimant) | Volent vers la poitrine du joueur en tournant vite | Celle de l'objet | Toujours visibles en vol, jamais téléportés |
| Coffre | Bois, sangles et serrure dorées | Bois `#5a3a22`, ferrures `gilt` | Halo `giltBright` et colonne de lumière, pas de `PointLight` |
| Autel du Chaos | Deux marches octogonales, autel à cornes, cristal flottant entouré d'éclats et d'un anneau de runes | Pierre `#3a3640`, magie `hex` | `MagicAltar.js` |
| Échoppe du marchand | Comptoir en bois sous un auvent de toile (sous 2,1 m, pour laisser la place au gardien), fioles et piles de pièces, lanterne qui se balance | Bois, toile `#3b2a45`, ferrures et lanterne `gilt` | `MagicalShop.js` |
| Fontaine de jouvence | Bassin octogonal, colonne, vasque haute qui verse un rideau d'eau, orbe flottant | Pierre `#3a3640`, eau `aether` | `HealingFountain.js` |
| Objets centraux des salles spéciales | Pièces communes dans `src/entities/Shrine.js` | Couleur du contenu | Solides, tournés d'un quart de tour au hasard ; grisés et colonne éteinte une fois utilisés |
| Piège à pointes | Plaque et cônes | Métal neutre | |
| Impact | Sphère qui s'étend | `giltBright` ; critique `hexBright` | Pool dans `EntityManager` |
| Explosion | Sphère | `emberBright` | |
| Télégraphe (zone d'impact) | Cercle au sol dont le disque se remplit jusqu'à l'impact, fin rayon vertical | `ember` (danger), `hex` (portail de renforts) | Le rayon du cercle est la **portée réelle** du coup, jamais moins |
| Onde de choc | Anneau au sol qui s'étend jusqu'à sa portée (19,5 m) | `aetherBright` | Libérée par une tourelle détruite (`EntityManager.shockwave`) |
| Chiffres de dégâts | Texte | `vellum` ; critique `hexBright` (avec « ! ») ; constructions `emberBright` | `FloatingText.spawnDamage` |
| Barres de vie ennemies | Plans | `sage` > 60 %, `giltBright` > 30 %, `emberBright` en dessous, `aetherBright` si bouclier | |
| Aura d'immolation | Anneau au sol | `emberBright` | |

## 9. Son

**Principe** : de vrais bruitages, enregistrés, en CC0 (domaine public), plutôt que des sons synthétisés. La source de chaque son est tracée.

- **Fichiers** : `public/sounds/sfx/*.mp3`, générés par `npm run build:sfx` (`scripts/build-sfx.mjs`). Le script télécharge les banques, prend pour chaque son un fichier précis, lui applique au besoin un filtre (inversé, étouffé…), coupe le silence de début, limite la durée, passe en mono et normalise (RMS −20 dB, crêtes ≤ −2 dB). Crédits : `public/sounds/CREDITS.md`. Ne jamais déposer un son à la main : l'ajouter au script.
- **Mixage** : uniquement dans le tableau `SFX` de `src/systems/SoundManager.js`. Pour chaque événement : variantes, volume, variation de hauteur aléatoire (±), nombre maximal de voix simultanées, vitesse de base. Les fichiers étant normalisés, le volume du tableau est le seul réglage de mixage.
- **Jouer un son** : `soundManager.play('nom')` pour le joueur et l'interface, `soundManager.play('nom', position)` pour un son du monde. Avec une position, le son est spatialisé : plein volume à 4 m, moitié à 8 m. Les sons de menace (`PRECISE_PANNING` : tirs ennemis, tourelles, météores) utilisent le HRTF, qui situe aussi devant/derrière et la hauteur ; les autres, bien plus fréquents, un panoramique gauche/droite (`equalpower`), beaucoup moins coûteux. Les oreilles suivent la caméra (`updateListener`, à chaque frame).
- **Anti-cacophonie** : un même son relancé à moins de 30 ms est ignoré, et chaque événement a un plafond de voix (4 impacts au plus, par exemple). Au plafond, c'est la plus ancienne copie qui s'éteint en fondu (50 ms), jamais la nouvelle : un bâton qui tire vite ne devient pas muet. Une montée peut être calée sur son événement (`play(…, endIn)`) : elle démarre plus tard, ou en cours de route, pour finir à l'instant voulu. Les variantes et la variation de hauteur évitent l'effet « mitraillette ».

| Famille | Caractère | Événements |
|---|---|---|
| Magie du joueur | Sorts clairs et brefs | `shoot` (un peu plus grave à chaque palier du bâton), `reload` (un cristal joué à l'envers dans un nuage d'échos, avec son octave : le mana aspiré ; calé pour culminer pile à la fin de la recharge, quelle que soit sa durée), `reloadDone` (le même cristal à l'endroit : le chargeur est plein), `empty` (le sort du tir étouffé : plus de mana), `crit` (cristallin), `ricochet` (« tink » métallique au rebond) |
| Corps du joueur | Bruits de cuir et de tissu | `footstep` (tous les 2,2 m), `jump`, `land`, `playerHurt` |
| Épée | Souffle de lame, entaille, métal | `melee` (le coup), `meleeHit` (la lame qui entre), `swordDraw` (dégainée), `staffDraw` (le bâton repris : étoffe), `block` (choc sourd : la garde a encaissé), `parry` (métal qui sonne clair : le tir repart) |
| Tir chargé | La recharge en plus grave | `staffCharge` (la montée de `reload` à 0,8, calée sur les 1,5 s de charge, coupée si on relâche), `chargeShot` (le tir une octave plus bas) |
| Ennemis | Feu sombre, grognements de bête | `enemyShoot`, `enemyDeath`, `shieldBreak` |
| Tourelles | Cristal grave, pierre qui éclate | `towerShoot`, `towerDeath` |
| Boss | Rugissements, magie lourde, roche ; joués à pleine force, jamais atténués par la distance | `bossRoar` (arrivée, pluie, relevé, mort), `bossCharge` (le son de la vague à l'envers : il enfle jusqu'au tir), `bossTick` (compte à rebours : 3 tics de plus en plus aigus, le coup tombe sur le 4e temps), `bossLaser`, `bossSpiral`, `bossSummon`, `bossSlam` (chute à terre), `meteor` |
| Trésor et commerce | Pièces, bois, cloches | `gold`, `chestOpen`, `shopOpen`, `purchase`, `upgrade` |
| Sacré | Cloche, gong, eau | `altar`, `pact`, `fountain`, `health`, `mana` |
| Pièges | Lames qui sortent | `spikes` |
| Interface | Clics discrets, papier | `uiClick`, `uiConfirm`, `uiError`, `cardDeal`, `reelStop`, `tick`, `levelClear`, `gameOver` |

**Règles :**
- Une source sonore qui existe dans le monde se joue **avec sa position** ; l'interface et le corps du joueur, sans.
- Un événement fréquent (tir, impact, pas) a un volume bas et plusieurs variantes.
- Le bouton son du HUD coupe la **musique** seulement.
- **Volumes** : effets 80 %, musique 30 % par défaut, réglables dans l'écran de pause (`soundManager.setVolume('sfx' | 'music', 0…1)`) et mémorisés sur l'appareil. Monter la musique la rallume si elle était coupée. La musique passe elle aussi par Web Audio (`musicBus`) : l'iPhone ignore le volume d'un élément `<audio>`.

## 10. Performance

- **Décor** : environ 25 draw calls par niveau. Murs, rampes et socles de rampe sont des `InstancedMesh`, un par couple géométrie × matériau. Les îles flottantes et les ponts sont fusionnés en un mesh par matériau.
- **Ennemi** : 2 draw calls (corps fusionné et yeux). Les formes sont en cache : au plus 192 variantes de quelques centaines de sommets.
- **Partage** : géométries et matériaux sont partagés au niveau du module pour toute entité nombreuse. Jamais de `new …Material` par instance, sauf `FloatingText` qui doit s'estomper seul et libère son matériau via `dispose()`.
- **Libération** : `LevelManager._disposeLevel()` libère tout le niveau, sauf les matériaux du kit (`userData.kit`).
- **Boucle de jeu** : aucune allocation par frame.

## 11. Vérifier une modification

1. `npm i --no-save canvas`, une seule fois : node-canvas, un canvas 2D en CPU qui ne modifie pas `package.json`.
2. `npm run preview:visuals` : écrit des planches PNG dans `previews/` (murs en mosaïque 2 × 2 pour voir les raccords, rendu éclairé, sols, ciels, salles spéciales) et affiche le tableau de calibration de la section 7. Il sort en erreur si une valeur est hors cible.
3. `npm run check:levels` : invariants de génération des niveaux. `npm run check:staff` après toute retouche du bâton (paliers, budget de draw calls, lumière unique, animations, tir chargé, sons). `npm run check:sword` après toute retouche de l'épée, de la garde, du tir chargé, des pactes ou des améliorations (étiquettes, icônes, 26 pactes).
4. `npm run build`.
5. Test en jeu par une personne, dans son navigateur : un niveau par biome (1, 6, 11, 16) et un boss (touche P).

**Un navigateur headless ou un rendu WebGL logiciel ne se lance que sous `scripts/capped.sh`** (`scripts/capped.sh [-m Mo] commande…`). Le 23 novembre 2026, un test Playwright sans plafond a saturé la mémoire et forcé un redémarrage. Le script enferme la commande et tous ses enfants dans un cgroup de 1200 Mo sans swap : au-delà, seul le test est tué. Il refuse de démarrer s'il ne reste pas en plus 2 Go de marge. Préférer une page minimale qui ne montre que le modèle à vérifier (une planche des 6 épées : ~330 Mo) au jeu entier. Chromium headless : le pilote Playwright de `~/.cache/ms-playwright-go/1.57.0` (`PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64`, Ubuntu 26.04 n'étant pas encore reconnu), lancé avec `--use-angle=swiftshader --enable-unsafe-swiftshader`. Jamais le Firefox snap : il sort de son cgroup.

## 12. Recettes

**Ajouter un biome**
1. Dans `TextureGenerator.js`, écrire `WALLS.<biome>`, `FLOORS.<biome>` et `SKIES.<biome>` avec les blocs existants : seedé, tileable, albédo moyen entre 0,20 et 0,50.
2. Créer `src/systems/themes/<Nom>Theme.js` avec `biome`, `lighting`, `fogColor` (couleur de l'horizon du ciel), `fogDensity`, `accent` et `foliage`. L'ajouter à `ThemeManager`.
3. `npm run preview:visuals`, et ajuster jusqu'à ce que la calibration passe.
4. Compléter les tableaux des sections 5 et 7.

**Changer une couleur de la palette** : `src/core/Palette.js`, puis les variables en tête de `src/ui/hud.css`, puis le tableau de la section 3.

**Ajouter une entité**
- Choisir sa couleur selon ce qu'elle *signifie* (section 3) et lui donner une silhouette distinctive.
- Partager géométrie et matériau.
- Faire briller avec un sprite de lueur plutôt qu'une `PointLight`.
- `roughness` au moins 0,35, sauf métal.
- L'ajouter au tableau de la section 8.

**Ajouter un son** :
1. Trouver un fichier CC0 (vérifier la licence sur la page de la banque) et l'ajouter à `SOUNDS` dans `scripts/build-sfx.mjs`, ainsi que sa banque à `PACKS` et à `public/sounds/CREDITS.md`.
2. `npm run build:sfx`.
3. Déclarer l'événement dans `SFX` (`SoundManager.js`) et l'appeler avec `soundManager.play()`.
4. Compléter le tableau de la section 9.

**Ajouter un effet** : couleur de la palette, et objets en pool dans `EntityManager`, jamais créés à chaque déclenchement.

## 13. À ne pas faire

- Des couleurs primaires saturées (`0xff0000`, `0x00ff00`, `0x00ffff`…) : elles cassent la palette et la lisibilité.
- Une `AmbientLight`, ou une lumière réglée « à l'œil » sans relancer la calibration.
- Une `CanvasTexture` couleur sans `colorSpace` sRGB.
- `Math.random` dans un générateur de texture.
- Un matériau ou une texture créé par instance ou par niveau, hors kit de thème.
- Ajouter ou retirer une `PointLight` en cours de niveau.
- Brancher les thèmes de science-fiction tels quels.
- Synthétiser un son à l'oscillateur, ou ajouter un fichier sans passer par `build-sfx.mjs` et les crédits.
- Un son du monde joué sans position.
