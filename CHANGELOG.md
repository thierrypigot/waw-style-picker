# Changelog

Toutes les évolutions notables de l'extension sont consignées ici.

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), numérotation [Semantic Versioning](https://semver.org/lang/fr/). Tant que la version reste en `0.x`, l'API PHP peut encore évoluer sur une version mineure.

## [Non publié]

## [0.1.1] - 2026-10-05

### Ajouté

- Styles restreints selon la composition, lue dans `metadata.patternName` (posé par WordPress sur la racine d'une composition insérée) : clé `patterns` dans `register_block_style()` pour ne proposer un style que sur certaines compositions, fonction `waw_style_picker_restrict_pattern_styles()` et filtre `waw_style_picker_pattern_styles` pour limiter les styles proposés sur la racine d'une composition. « Par défaut » et le style déjà appliqué restent toujours proposés. Dès qu'une restriction concerne un bloc, la modale remplace le sélecteur natif même sous le seuil `waw_style_picker_min_styles`, le natif ignorant les restrictions.

## [0.1.0] - 2026-09-24

### Ajouté

- Modale plein écran de choix de style, calquée sur l'explorateur de compositions : recherche, catégories, aperçu réel de chaque style sur le contenu du bloc sélectionné.
- Catégorie « Toutes », style actif affiché en premier, choix « Par défaut » qui retire la classe `is-style-*`.
- Réglage « Styles par ligne » (1 à 3), mémorisé par utilisateur.
- Panneau « Style (style actif) » dans l'onglet Styles de l'inspecteur, à la place du sélecteur natif.
- Bouton « Style » dans la barre d'outils du bloc, y compris sur la racine d'une composition non ouverte.
- Panneau de secours dans l'inspecteur des compositions non ouvertes (sections).
- Activation automatique sur tout bloc ayant au moins 4 styles, filtres `waw_style_picker_min_styles` et `waw_style_picker_excluded_blocks`.
- API PHP de catégories : `waw_style_picker_register_category()`, `waw_style_picker_assign_styles()`, clé `category` dans `register_block_style()`, filtre `waw_style_picker_config`.

[Non publié]: https://github.com/thierrypigot/waw-style-picker/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/thierrypigot/waw-style-picker/releases/tag/v0.1.1
[0.1.0]: https://github.com/thierrypigot/waw-style-picker/releases/tag/v0.1.0
