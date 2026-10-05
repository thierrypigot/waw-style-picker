<?php
/**
 * API publique : catégories de styles de blocs.
 *
 * WordPress ne transmet à l'éditeur que name, label et isDefault d'un style
 * enregistré en PHP (cf. wp-includes/script-loader.php). Le plugin porte donc
 * lui-même les catégories jusqu'au JS.
 *
 * Trois façons de classer un style, de la plus prioritaire à la moins :
 * 1. waw_style_picker_assign_styles( 'core/group', array( 'mon-style' => 'cartes' ) );
 * 2. register_block_style( 'core/group', array( 'name' => 'mon-style', 'label' => '…', 'category' => 'cartes' ) );
 * 3. En JS : registerBlockStyle( 'core/group', { name, label, category: 'cartes' } ).
 * Un style non classé tombe dans la catégorie par défaut « Autres ».
 *
 * Restreindre les styles selon la composition (metadata.patternName du bloc,
 * posé par WordPress sur la racine d'une composition insérée) :
 * - register_block_style( 'core/group', array( …, 'patterns' => array( 'mon-theme/chiffres' ) ) ) :
 *   le style n'est proposé que sur la racine de ces compositions ;
 * - waw_style_picker_restrict_pattern_styles( 'mon-theme/chiffres', array( 'tuiles' ) ) :
 *   la racine de cette composition ne propose que ces styles, plus « Par défaut ».
 *
 * @package WAW\StylePicker
 */

defined( 'ABSPATH' ) || exit;

/**
 * Stockage interne des catégories et des affectations.
 *
 * @return array{categories: array<string, string>, assignments: array<string, array<string, string>>}
 */
function &waw_style_picker_store() {
	static $store = array(
		'categories'     => array(),
		'assignments'    => array(),
		'pattern_styles' => array(),
	);
	return $store;
}

/**
 * Déclare une catégorie de styles. L'ordre de déclaration est l'ordre d'affichage.
 *
 * @param string $slug  Identifiant de la catégorie.
 * @param string $label Libellé affiché dans la modale (déjà traduit).
 * @return bool False si le slug est vide.
 */
function waw_style_picker_register_category( $slug, $label ) {
	$slug = sanitize_key( $slug );
	if ( '' === $slug ) {
		return false;
	}
	$store                        = &waw_style_picker_store();
	$store['categories'][ $slug ] = (string) $label;
	return true;
}

/**
 * Classe des styles d'un bloc, y compris ceux qu'on ne contrôle pas
 * (styles du core, d'un thème parent, d'une autre extension).
 *
 * @param string                $block_name Nom du bloc, ex. 'core/group'.
 * @param array<string, string> $map        Nom du style => slug de catégorie.
 * @return bool False si le nom de bloc est invalide.
 */
function waw_style_picker_assign_styles( $block_name, array $map ) {
	if ( ! waw_style_picker_is_valid_name( $block_name ) ) {
		return false;
	}
	$store = &waw_style_picker_store();
	foreach ( $map as $style_name => $category ) {
		$store['assignments'][ $block_name ][ sanitize_key( $style_name ) ] = sanitize_key( $category );
	}
	return true;
}

/**
 * Limite les styles proposés sur la racine d'une composition.
 *
 * « Par défaut » reste toujours proposé, ainsi que le style déjà appliqué au
 * bloc, pour pouvoir le retirer.
 *
 * @param string   $pattern_name Nom de la composition, ex. 'mon-theme/chiffres'.
 * @param string[] $styles       Noms des styles autorisés.
 * @return bool False si le nom de composition est invalide.
 */
function waw_style_picker_restrict_pattern_styles( $pattern_name, array $styles ) {
	if ( ! waw_style_picker_is_valid_name( $pattern_name ) ) {
		return false;
	}
	$store                                    = &waw_style_picker_store();
	$store['pattern_styles'][ $pattern_name ] = array_values( array_map( 'sanitize_key', $styles ) );
	return true;
}

/**
 * Vérifie un nom de bloc ou de composition (espace/nom).
 *
 * @param mixed $name Nom à vérifier.
 * @return bool
 */
function waw_style_picker_is_valid_name( $name ) {
	return is_string( $name ) && (bool) preg_match( '#^[a-z0-9-]+/[a-z0-9-]+$#', $name );
}

/**
 * Configuration transmise à l'éditeur.
 *
 * @return array
 */
function waw_style_picker_get_config() {
	$store       = waw_style_picker_store();
	$assignments = array();
	$scopes      = array();

	// Clés 'category' et 'patterns' passées à register_block_style() :
	// WordPress les conserve dans le registre mais ne les transmet pas au JS.
	// On les relaie.
	foreach ( WP_Block_Styles_Registry::get_instance()->get_all_registered() as $block_name => $styles ) {
		foreach ( $styles as $style_name => $style ) {
			if ( ! empty( $style['category'] ) ) {
				$assignments[ $block_name ][ $style_name ] = sanitize_key( $style['category'] );
			}
			if ( ! empty( $style['patterns'] ) && is_array( $style['patterns'] ) ) {
				$scopes[ $block_name ][ $style_name ] = array_values(
					array_filter( $style['patterns'], 'waw_style_picker_is_valid_name' )
				);
			}
		}
	}

	// Les affectations explicites l'emportent sur la clé 'category'.
	$assignments = array_replace_recursive( $assignments, $store['assignments'] );

	$categories = array();
	foreach ( $store['categories'] as $slug => $label ) {
		$categories[] = array(
			'slug'  => $slug,
			'label' => $label,
		);
	}

	$config = array(
		'categories'     => $categories,
		'assignments'    => $assignments,
		/** Style => compositions où il est proposé (clé 'patterns'). */
		'scopes'         => $scopes,
		/**
		 * Composition => styles proposés sur sa racine.
		 *
		 * @param array<string, string[]> $pattern_styles Nom de composition => noms de styles.
		 */
		'patternStyles'  => (array) apply_filters( 'waw_style_picker_pattern_styles', $store['pattern_styles'] ),
		/**
		 * Nombre minimal de styles (style par défaut natif compris) à partir
		 * duquel la modale remplace le sélecteur natif. En dessous, les
		 * boutons natifs restent plus rapides.
		 */
		'minStyles'      => (int) apply_filters( 'waw_style_picker_min_styles', 4 ),
		/** Blocs qui gardent toujours le sélecteur natif. */
		'excludedBlocks' => array_values( (array) apply_filters( 'waw_style_picker_excluded_blocks', array() ) ),
	);

	/**
	 * Dernier point d'entrée sur la configuration complète.
	 *
	 * @param array $config Configuration transmise à l'éditeur.
	 */
	return apply_filters( 'waw_style_picker_config', $config );
}
