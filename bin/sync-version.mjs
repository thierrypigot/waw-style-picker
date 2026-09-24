/**
 * Lancé par `npm version <patch|minor|major>` (script "version" de package.json),
 * après la mise à jour de package.json et avant le commit + tag.
 *
 * 1. Recopie la version dans l'en-tête `Version:` du fichier principal.
 * 2. Transforme la section « Non publié » du CHANGELOG en section datée
 *    et rouvre une section « Non publié » vide au-dessus.
 *
 * Échoue si la section « Non publié » est vide : pas de release sans changelog.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const { version } = JSON.parse( readFileSync( 'package.json', 'utf8' ) );
const today = new Date().toISOString().slice( 0, 10 );

// 1. En-tête du plugin.
const mainFile = 'waw-style-picker.php';
const php = readFileSync( mainFile, 'utf8' );
const headerRe = /^(\s*\*\s*Version:\s*)\S+/m;
if ( ! headerRe.test( php ) ) {
	console.error( `En-tête « Version: » introuvable dans ${ mainFile }.` );
	process.exit( 1 );
}
writeFileSync( mainFile, php.replace( headerRe, `$1${ version }` ) );

// 2. CHANGELOG.
const changelogFile = 'CHANGELOG.md';
const changelog = readFileSync( changelogFile, 'utf8' );
const unreleasedRe = /^## \[Non publié\]\s*\n([\s\S]*?)(?=^## \[|^\[[^\]]+\]:|(?![\s\S]))/m;
const match = changelog.match( unreleasedRe );

if ( ! match || ! match[ 1 ].trim() ) {
	console.error(
		'La section « ## [Non publié] » du CHANGELOG est absente ou vide : ' +
			'décrire les changements avant de publier une version.'
	);
	process.exit( 1 );
}

// Liens de bas de fichier : « Non publié » compare depuis la nouvelle version,
// et la nouvelle version pointe vers sa release.
const repo = 'https://github.com/thierrypigot/waw-style-picker';
const updated = changelog
	.replace(
		unreleasedRe,
		`## [Non publié]\n\n## [${ version }] - ${ today }\n\n${ match[ 1 ].trimStart() }`
	)
	.replace(
		/^\[Non publié\]: .*$/m,
		`[Non publié]: ${ repo }/compare/v${ version }...HEAD\n[${ version }]: ${ repo }/releases/tag/v${ version }`
	);

writeFileSync( changelogFile, updated );

console.log( `Version ${ version } reportée dans ${ mainFile } et ${ changelogFile }.` );
