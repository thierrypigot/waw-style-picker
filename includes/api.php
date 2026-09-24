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
		'categories'  => array(),
		'assignments' => array(),
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
	if ( ! preg_match( '#^[a-z0-9-]+/[a-z0-9-]+$#', $block_name ) ) {
		return false;
	}
	$store = &waw_style_picker_store();
	foreach ( $map as $style_name => $category ) {
		$store['assignments'][ $block_name ][ sanitize_key( $style_name ) ] = sanitize_key( $category );
	}
	return true;
}

/**
 * Configuration transmise à l'éditeur.
 *
 * @return array
 */
function waw_style_picker_get_config() {
	$store       = waw_style_picker_store();
	$assignments = array();

	// Clé 'category' passée à register_block_style() : WordPress la conserve
	// dans le registre mais ne la transmet pas au JS. On la relaie.
	foreach ( WP_Block_Styles_Registry::get_instance()->get_all_registered() as $block_name => $styles ) {
		foreach ( $styles as $style_name => $style ) {
			if ( ! empty( $style['category'] ) ) {
				$assignments[ $block_name ][ $style_name ] = sanitize_key( $style['category'] );
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
