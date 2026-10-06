<?php
/**
 * Plugin Name:       WAW : sélecteur de styles de blocs
 * Plugin URI:        https://www.wearewp.pro/
 * Description:       Remplace la rangée de boutons des styles de blocs par une modale catégorisée, avec aperçu réel de chaque style, recherche et catégories déclarables par le thème.
 * Version:           0.1.1
 * Requires at least: 7.1
 * Requires PHP:      8.1
 * Author:            WeAre[WP]
 * Author URI:        https://www.wearewp.pro/
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Update URI:        https://github.com/thierrypigot/waw-style-picker
 * Text Domain:       waw-style-picker
 *
 * @package WAW\StylePicker
 */

defined( 'ABSPATH' ) || exit;

require_once __DIR__ . '/includes/api.php';

/*
 * Mises à jour depuis les releases GitHub : PUC télécharge le zip joint à la
 * release (construit par la CI, avec build/). L'asset est exigé : l'archive du
 * code source, sans build/, donnerait une extension inutilisable.
 */
require_once __DIR__ . '/lib/plugin-update-checker/plugin-update-checker.php';

\YahnisElsts\PluginUpdateChecker\v5\PucFactory::buildUpdateChecker(
	'https://github.com/thierrypigot/waw-style-picker/',
	__FILE__,
	'waw-style-picker'
)->getVcsApi()->enableReleaseAssets(
	'/waw-style-picker-[0-9.]+\.zip$/',
	\YahnisElsts\PluginUpdateChecker\v5p7\Vcs\Api::REQUIRE_RELEASE_ASSETS
);

/*
 * WP 7.1 : l'éditeur d'articles est désormais toujours iframé.
 * enqueue_block_editor_assets reste le bon hook ici, car ce script et ce CSS
 * ciblent l'interface (inspecteur, modale), qui vit HORS de l'iframe.
 * Tout CSS destiné au contenu des blocs (les is-style-*) doit passer par
 * enqueue_block_assets ou par le style de la variation, sinon WP 7.1 émet
 * un avertissement d'injection incorrecte dans l'iframe.
 */
add_action( 'enqueue_block_editor_assets', function () {
	$asset_file = __DIR__ . '/build/index.asset.php';
	if ( ! file_exists( $asset_file ) ) {
		return;
	}
	$asset = include $asset_file;

	wp_enqueue_script(
		'waw-style-picker',
		plugins_url( 'build/index.js', __FILE__ ),
		$asset['dependencies'],
		$asset['version'],
		true
	);
	wp_set_script_translations( 'waw-style-picker', 'waw-style-picker' );

	// Lu ici, après init : les thèmes ont déjà déclaré leurs styles et catégories.
	wp_add_inline_script(
		'waw-style-picker',
		'window.wawStylePicker = ' . wp_json_encode( waw_style_picker_get_config(), JSON_HEX_TAG | JSON_UNESCAPED_SLASHES ) . ';',
		'before'
	);

	wp_enqueue_style(
		'waw-style-picker',
		plugins_url( 'src/editor.css', __FILE__ ),
		array( 'wp-components' ),
		(string) filemtime( __DIR__ . '/src/editor.css' )
	);
} );
