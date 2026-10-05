# WAW : sélecteur de styles de blocs

Extension WordPress qui remplace la rangée de boutons des **styles de blocs** (`is-style-*`) par une modale plein écran, organisée en catégories, avec un aperçu réel de chaque style.

Quand un bloc a huit ou dix styles, le sélecteur natif devient une suite de boutons tronqués où l'on clique au hasard. Cette extension reprend l'ergonomie de l'explorateur de compositions de WordPress : on voit le rendu de chaque style sur son propre contenu, on filtre par catégorie ou par recherche, puis on choisit.

Développée par [WeAre[WP]](https://www.wearewp.pro/).

## Fonctionnalités

- **Modale plein écran** calquée sur « Explorer toutes les compositions » : recherche, catégories, grille d'aperçus.
- **Aperçu réel** : chaque vignette affiche le bloc sélectionné, avec son contenu, sous le style concerné. Si le bloc est vide, l'aperçu utilise l'exemple (`example`) déclaré par le type de bloc.
- **Catégories** déclarées par le thème ou par une extension, catégorie « Toutes » et catégorie « Autres » pour les styles non classés.
- **Style actif en premier**, choix **« Par défaut »** qui retire proprement la classe `is-style-*`.
- **Styles par ligne** réglables de 1 à 3, mémorisés par utilisateur.
- **Deux points d'accès** : le panneau « Style (style actif) » de l'onglet Styles de l'inspecteur, et un bouton « Style » dans la barre d'outils du bloc.
- **Compositions non ouvertes** (sections) prises en charge : bouton dans la barre d'outils et panneau de secours dans l'inspecteur.
- **Activation automatique** sur tout bloc qui a assez de styles, sans configuration.

## Prérequis

- WordPress 7.1 ou supérieur
- PHP 8.1 ou supérieur

## Installation

### Depuis une release (recommandé)

1. Télécharger `waw-style-picker-X.Y.Z.zip` depuis la page [Releases](https://github.com/thierrypigot/waw-style-picker/releases).
2. Dans WordPress : **Extensions › Ajouter › Téléverser une extension**, puis activer.

### Depuis les sources

```bash
cd wp-content/plugins
git clone https://github.com/thierrypigot/waw-style-picker.git
cd waw-style-picker
npm ci
npm run build
```

Le dossier `build/` n'est pas versionné : sans `npm run build`, l'extension reste inactive et le sélecteur natif s'affiche.

## Fonctionnement

L'extension ne crée aucun style. Elle se contente de présenter autrement les styles déjà enregistrés par le core, le thème ou d'autres extensions.

| Situation | Comportement |
|---|---|
| Bloc avec au moins 4 styles, « Par défaut » natif compris | La modale remplace le sélecteur natif |
| Bloc avec moins de 4 styles | Le sélecteur natif est conservé, il reste plus rapide, sauf si une restriction par composition concerne le bloc |
| Style non classé | Rangé dans la catégorie « Autres », affichée en dernier |
| Racine d'une composition non ouverte | Bouton « Style » dans la barre d'outils et panneau dans l'inspecteur |

## Classer les styles en catégories

WordPress ne transmet à l'éditeur que le nom, le libellé et `isDefault` d'un style enregistré en PHP. L'extension fournit donc sa propre API pour porter les catégories jusqu'à l'éditeur.

### 1. Déclarer les catégories

L'ordre de déclaration est l'ordre d'affichage.

```php
add_action( 'init', function () {
	if ( ! function_exists( 'waw_style_picker_register_category' ) ) {
		return; // Le thème fonctionne aussi sans l'extension.
	}
	waw_style_picker_register_category( 'sections', __( 'Sections', 'mon-theme' ) );
	waw_style_picker_register_category( 'cartes', __( 'Cartes', 'mon-theme' ) );
} );
```

### 2. Classer ses propres styles

Ajouter une clé `category` à `register_block_style()`. Sans l'extension, WordPress stocke cette clé et l'ignore : rien ne casse.

```php
register_block_style( 'core/group', array(
	'name'     => 'carte',
	'label'    => __( 'Carte', 'mon-theme' ),
	'category' => 'cartes',
) );
```

### 3. Classer des styles qu'on ne contrôle pas

Pour les styles du core, d'un thème parent ou d'une autre extension :

```php
waw_style_picker_assign_styles( 'core/button', array( 'outline' => 'secondaires' ) );
```

Cette affectation l'emporte sur la clé `category`.

### Styles enregistrés en JavaScript

La clé `category` est aussi lue sur un style enregistré avec `registerBlockStyle()` :

```js
wp.blocks.registerBlockStyle( 'core/group', {
	name: 'encart',
	label: 'Encart',
	category: 'cartes',
} );
```

## Où proposer un style

WordPress propose un style partout où son type de bloc apparaît. Deux clés de `register_block_style()` le limitent (ignorées sans l'extension) :

| Clé | Effet | Exemple |
|---|---|---|
| `'pickable' => false` | Style technique, posé dans le code d'un gabarit ou d'une composition, jamais proposé. S'il est déjà appliqué, il reste affiché | Mise en page interne de l'en-tête |
| `'root_only' => true` | Proposé seulement sur un bloc de premier niveau (une section de la page), jamais sur un bloc imbriqué | Couleurs de section, qui n'ont pas de sens sur une tuile ou une colonne |

```php
register_block_style( 'core/group', array(
	'name'      => 'section-rouge',
	'label'     => __( 'Section rouge', 'mon-theme' ),
	'root_only' => true,
) );
```

Un bloc qui n'a plus aucun style à proposer n'affiche pas de bouton « Style » ; le sélecteur natif reste masqué, puisqu'il ignorerait ces règles.

## Restreindre les styles selon la composition

Les styles d'un bloc s'enregistrent par type de bloc : un groupe propose tous les styles de groupe, qu'il soit une section, une grille de chiffres ou une barre de navigation. L'extension peut limiter la liste selon la composition dont le bloc est la racine. Elle lit `metadata.patternName`, que WordPress pose sur la racine d'une composition insérée (on peut aussi l'écrire dans le fichier de la composition).

### Un style réservé à certaines compositions

```php
register_block_style( 'core/group', array(
	'name'     => 'tuiles',
	'label'    => __( 'Tuiles', 'mon-theme' ),
	'patterns' => array( 'mon-theme/chiffres' ),
) );
```

Le style n'est proposé que sur la racine de `mon-theme/chiffres`. Sans l'extension, WordPress ignore la clé `patterns` et propose le style partout.

### Une composition qui limite ses styles

```php
add_action( 'init', function () {
	if ( function_exists( 'waw_style_picker_restrict_pattern_styles' ) ) {
		waw_style_picker_restrict_pattern_styles( 'mon-theme/chiffres', array( 'tuiles' ) );
	}
} );
```

La racine de `mon-theme/chiffres` ne propose alors que « Par défaut » et « Tuiles ». Le style déjà appliqué au bloc reste toujours visible, pour pouvoir le changer. Même réglage par le filtre `waw_style_picker_pattern_styles`.

### « Par défaut » = la composition telle qu'insérée

Sur une composition restreinte, « Par défaut » n'est pas l'absence de style : c'est la composition dans sa configuration de base, avec le style que porte sa racine dans son contenu. Une composition livrée en « Section bleue » propose « Par défaut (Section bleue) », puis ses autres styles ; l'absence de style, souvent sans sens pour elle, n'est plus proposée. Une composition sans style livré garde le « Par défaut » habituel.

Pour imposer un autre style de base (ou aucun : `''`) :

```php
waw_style_picker_restrict_pattern_styles( 'mon-theme/cta', array( 'bleu', 'rouge' ), array( 'default' => 'bleu' ) );
```

Une composition qui n'a qu'un style n'affiche plus de bouton « Style ».

## Filtres

| Filtre | Rôle | Valeur par défaut |
|---|---|---|
| `waw_style_picker_min_styles` | Nombre minimal de styles, « Par défaut » natif compris, à partir duquel la modale remplace le sélecteur natif | `4` |
| `waw_style_picker_excluded_blocks` | Blocs qui gardent toujours le sélecteur natif | `array()` |
| `waw_style_picker_pattern_styles` | Composition => styles proposés sur sa racine | `array()` |
| `waw_style_picker_config` | Configuration complète transmise à l'éditeur (`window.wawStylePicker`) | |

```php
add_filter( 'waw_style_picker_min_styles', fn() => 3 );
add_filter( 'waw_style_picker_excluded_blocks', fn( $blocks ) => array_merge( $blocks, array( 'core/button' ) ) );
```

## Limites connues

- **Classes internes du core.** Le masquage du sélecteur natif et le panneau des compositions non ouvertes s'appuient sur les classes `.block-editor-block-styles` et `.components-tools-panel`, qui ne font pas partie d'une API publique. Si WordPress les modifie, l'extension retombe sur le sélecteur natif, sans casse. Le bouton de la barre d'outils continue de fonctionner.
- **Bouton goutte des sections.** Le bouton natif « Styles aléatoires » des compositions ignorerait les restrictions : il est masqué tant qu'un bloc géré par l'extension est sélectionné. Faute de classe propre, il est repéré par le tracé de son icône ; si WordPress change ce tracé, le bouton réapparaît sans rien casser.
- **Restriction par composition.** Elle ne vaut que pour la racine de la composition (seul bloc qui porte `metadata.patternName`) et suppose que ce nom soit présent : un balisage inséré sans passer par l'outil d'insertion (import, collage de code) ne l'a pas, sauf si le fichier de la composition l'écrit.

## Développement

```bash
npm ci
npm start        # compilation en continu
npm run build    # compilation de production
```

| Fichier | Rôle |
|---|---|
| `waw-style-picker.php` | Fichier principal, chargement des assets et de la configuration |
| `includes/api.php` | API PHP des catégories et configuration transmise à l'éditeur |
| `src/index.js` | Modale, panneau d'inspecteur, bouton de barre d'outils |
| `src/editor.css` | Styles de l'interface (inspecteur et modale) |

## Versionnage et publication

Le numéro de version suit le [semver](https://semver.org/lang/fr/) : `CORRECTIF` pour une correction, `MINEUR` pour une nouvelle fonctionnalité, `MAJEUR` pour une rupture de compatibilité. Tant que la version reste en `0.x`, l'API PHP peut encore évoluer sur une version mineure.

Trois sources doivent concorder : `version` de `package.json`, en-tête `Version:` de `waw-style-picker.php`, et une section datée dans `CHANGELOG.md`. Le processus ci-dessous les synchronise automatiquement.

1. Au fil de l'eau, décrire chaque changement sous `## [Non publié]` dans `CHANGELOG.md`.
2. Publier :

   ```bash
   npm version minor   # ou patch, ou major
   git push --follow-tags
   ```

   `npm version` met à jour `package.json`, reporte la version dans l'en-tête du plugin, transforme la section « Non publié » en section datée, puis crée le commit et le tag `vX.Y.Z`. La commande échoue si la section « Non publié » est vide.

3. Le push du tag déclenche la GitHub Action `Release`, qui vérifie la cohérence des versions, compile, construit `waw-style-picker-X.Y.Z.zip` et publie la release avec les notes du CHANGELOG.

Vérification locale, à tout moment :

```bash
npm run release:check
```

## Licence

GPL-2.0-or-later. Voir [la licence GPL v2](https://www.gnu.org/licenses/gpl-2.0.html).
