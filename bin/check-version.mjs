/**
 * Vérifie que les sources de version concordent avant de publier :
 * package.json, en-tête `Version:` du plugin, section datée du CHANGELOG
 * et, si fourni (CI), le tag Git : `node bin/check-version.mjs v1.2.3`.
 *
 * Écrit les notes de la version dans release-notes.md pour la release GitHub.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const errors = [];
const { version } = JSON.parse( readFileSync( 'package.json', 'utf8' ) );

if ( ! /^\d+\.\d+\.\d+$/.test( version ) ) {
	errors.push( `package.json : « ${ version } » n'est pas au format MAJEUR.MINEUR.CORRECTIF.` );
}

const header = readFileSync( 'waw-style-picker.php', 'utf8' ).match( /^\s*\*\s*Version:\s*(\S+)/m );
if ( header?.[ 1 ] !== version ) {
	errors.push( `En-tête du plugin (${ header?.[ 1 ] }) différent de package.json (${ version }).` );
}

const tag = process.argv[ 2 ];
if ( tag && tag !== `v${ version }` ) {
	errors.push( `Tag Git (${ tag }) différent de v${ version }.` );
}

const changelog = readFileSync( 'CHANGELOG.md', 'utf8' );
const escaped = version.replace( /\./g, '\\.' );
const section = changelog.match(
	// S'arrête à la section suivante, aux définitions de liens ou en fin de fichier.
	new RegExp( `^## \\[${ escaped }\\][^\\n]*\\n([\\s\\S]*?)(?=^## \\[|^\\[[^\\]]+\\]:|(?![\\s\\S]))`, 'm' )
);
if ( ! section || ! section[ 1 ].trim() ) {
	errors.push( `CHANGELOG.md : aucune section « ## [${ version }] » renseignée.` );
}

if ( errors.length ) {
	console.error( errors.map( ( e ) => `✗ ${ e }` ).join( '\n' ) );
	process.exit( 1 );
}

writeFileSync( 'release-notes.md', section[ 1 ].trim() + '\n' );
console.log( `✓ Version ${ version } cohérente. Notes écrites dans release-notes.md.` );
