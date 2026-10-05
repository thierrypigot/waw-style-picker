/**
 * WAW Style Picker.
 * 1. Lit la configuration transmise par PHP (catégories, affectations, seuil).
 * 2. Injecte un bouton dans l'inspecteur via le filtre editor.BlockEdit,
 *    sur tout bloc qui a assez de styles.
 * 3. Ouvre une modale qui liste les styles regroupés par catégorie.
 * 4. Restreint les styles proposés selon la composition (metadata.patternName).
 */
import { __, _n, sprintf } from '@wordpress/i18n';
import { addFilter } from '@wordpress/hooks';
import { createHigherOrderComponent } from '@wordpress/compose';
import {
	getBlockType,
	getBlockFromExample,
	cloneBlock,
	store as blocksStore,
} from '@wordpress/blocks';
import {
	BlockControls,
	InspectorControls,
	BlockPreview,
	store as blockEditorStore,
} from '@wordpress/block-editor';
import { useSelect, useDispatch } from '@wordpress/data';
import { createPortal, useEffect, useState, useMemo } from '@wordpress/element';
import {
	Button,
	Dropdown,
	Modal,
	PanelBody,
	RangeControl,
	SearchControl,
	ToolbarButton,
	ToolbarGroup,
} from '@wordpress/components';
import { store as preferencesStore } from '@wordpress/preferences';

/* ------------------------------------------------------------------ */
/* 1. Configuration transmise par PHP (includes/api.php)               */
/* ------------------------------------------------------------------ */
const config = {
	categories: [],
	assignments: {},
	minStyles: 4,
	excludedBlocks: [],
	scopes: {},
	hidden: {},
	rootOnly: {},
	patternStyles: {},
	patternDefaults: {},
	...window.wawStylePicker,
};

const DEFAULT_CATEGORY = 'autres';

const CATEGORY_LABELS = Object.fromEntries(
	config.categories.map( ( { slug, label } ) => [ slug, label ] )
);
CATEGORY_LABELS[ DEFAULT_CATEGORY ] ||= __( 'Autres', 'waw-style-picker' );

// Ordre de déclaration PHP, catégories inconnues ensuite, "Autres" en dernier.
const CATEGORY_ORDER = config.categories.map( ( { slug } ) => slug );
const compareCategories = ( a, b ) => {
	const rank = ( slug ) => {
		if ( slug === DEFAULT_CATEGORY ) {
			return Infinity;
		}
		const index = CATEGORY_ORDER.indexOf( slug );
		return index === -1 ? CATEGORY_ORDER.length : index;
	};
	return rank( a ) - rank( b );
};

// Affectation PHP d'abord, puis clé "category" d'un style déclaré en JS.
const getStyleCategory = ( blockName, style ) =>
	config.assignments[ blockName ]?.[ style.name ] ||
	style.category ||
	DEFAULT_CATEGORY;

/*
 * Styles proposés sur ce bloc précis. La composition est lue dans
 * metadata.patternName, que WordPress pose sur la racine d'une composition
 * insérée. « Par défaut » et le style déjà appliqué restent toujours proposés.
 * - Style limité à des compositions (clé PHP 'patterns') : masqué ailleurs.
 * - Composition qui limite ses styles (waw_style_picker_restrict_pattern_styles) :
 *   seuls ses styles autorisés sont proposés.
 */
const getAvailableStyles = ( blockName, styles, patternName, activeStyle, isRoot ) => {
	const allowed = patternName ? config.patternStyles[ patternName ] : undefined;
	return styles.filter( ( style ) => {
		if ( style.isDefault || style.name === activeStyle ) {
			return true;
		}
		// Style technique (clé PHP 'pickable' => false) : jamais proposé.
		if ( config.hidden[ blockName ]?.includes( style.name ) ) {
			return false;
		}
		// Style de section (clé PHP 'root_only') : premier niveau seulement.
		if ( ! isRoot && config.rootOnly[ blockName ]?.includes( style.name ) ) {
			return false;
		}
		const scope = config.scopes[ blockName ]?.[ style.name ];
		if ( scope && ! scope.includes( patternName ) ) {
			return false;
		}
		return ! allowed || allowed.includes( style.name );
	} );
};

// Une restriction (style réservé ou composition limitée) n'existe que dans la
// modale : le sélecteur natif proposerait tous les styles. La modale s'active
// donc dès qu'une restriction concerne le bloc, quel que soit le seuil.
const hasRestriction = ( blockName, patternName ) =>
	Object.keys( config.scopes[ blockName ] || {} ).length > 0 ||
	( config.hidden[ blockName ] || [] ).length > 0 ||
	( config.rootOnly[ blockName ] || [] ).length > 0 ||
	!! ( patternName && config.patternStyles[ patternName ] );

/*
 * « Par défaut » d'une composition restreinte = la composition telle
 * qu'insérée, avec son style livré (config.patternDefaults, lu dans son
 * contenu côté PHP), pas l'absence de style. Comme une voiture livrée dans sa
 * configuration de base : on part d'elle, puis on choisit les options.
 * Le choix « Par défaut (Section bleue) » applique donc ce style, qui n'est
 * pas répété dans la liste.
 */
const withPatternDefault = ( styles, registeredStyles, patternName ) => {
	const applies = patternName ? config.patternDefaults[ patternName ] : '';
	const source = applies && registeredStyles.find( ( s ) => s.name === applies );
	if ( ! source ) {
		return styles;
	}
	return [
		{
			name: applies,
			/* translators: %s: libellé du style livré par la composition. */
			label: sprintf( __( 'Par défaut (%s)', 'waw-style-picker' ), source.label ),
			isDefault: true,
			appliesStyle: applies,
		},
		...styles.filter( ( s ) => ! s.isDefault && s.name !== applies ),
	];
};

/*
 * Bouton natif « Styles aléatoires » (goutte) des racines de composition : il
 * fait défiler tous les styles du type de bloc, restrictions ignorées, et
 * WordPress ne permet pas de le filtrer bloc par bloc. Tant qu'un bloc géré
 * par l'extension est sélectionné, une classe sur <body> le masque (editor.css).
 * Plusieurs blocs peuvent se relayer : on compte les blocs concernés.
 */
const ACTIVE_CLASS = 'waw-style-picker-active';
const activeBlocks = new Set();
const syncBodyClass = () =>
	document.body.classList.toggle( ACTIVE_CLASS, activeBlocks.size > 0 );

const isPickerEnabled = ( blockName, stylesCount, patternName ) =>
	stylesCount > 0 &&
	( stylesCount >= config.minStyles || hasRestriction( blockName, patternName ) ) &&
	! config.excludedBlocks.includes( blockName );

/* ------------------------------------------------------------------ */
/* Utilitaires className (même logique que le sélecteur natif)          */
/* ------------------------------------------------------------------ */
const getActiveStyle = ( className = '' ) => {
	const match = className.match( /(?:^|\s)is-style-([^\s]+)/ );
	return match ? match[ 1 ] : null;
};

const applyStyle = ( className = '', styleName ) => {
	const cleaned = className
		.split( ' ' )
		.filter( ( c ) => c && ! c.startsWith( 'is-style-' ) );
	if ( styleName ) {
		cleaned.push( `is-style-${ styleName }` );
	}
	return cleaned.join( ' ' ) || undefined;
};

/*
 * Comme getRenderedStyles() du natif : si aucun style n'est marqué isDefault,
 * on en ajoute un en tête. Différence assumée : choisir le style par défaut
 * retire la classe is-style-* au lieu de poser is-style-default.
 */
const withDefaultStyle = ( styles ) => {
	const defaultStyle = styles.find( ( s ) => s.isDefault ) || {
		name: 'default',
		label: __( 'Par défaut', 'waw-style-picker' ),
		isDefault: true,
	};
	return [ defaultStyle, ...styles.filter( ( s ) => s !== defaultStyle ) ];
};

// Pas de classe is-style-* : c'est le style par défaut qui est actif.
const isStyleActive = ( style, activeStyle ) => {
	if ( style.appliesStyle ) {
		return activeStyle === style.appliesStyle;
	}
	return style.isDefault ? ! activeStyle || activeStyle === style.name : style.name === activeStyle;
};

// Classe à poser pour un choix : aucune pour le « Par défaut » natif, le style
// livré pour le « Par défaut » d'une composition.
const styleNameOf = ( style ) => style.appliesStyle || ( style.isDefault ? null : style.name );

/* ------------------------------------------------------------------ */
/* Aperçu : le bloc sélectionné, cloné avec la classe du style          */
/* ------------------------------------------------------------------ */
/*
 * Même logique que le sélecteur natif (useGenericPreviewBlock), inversée :
 * on préfère le contenu réel du bloc, plus parlant pour l'utilisateur, et on
 * se rabat sur l'"example" du type de bloc quand le bloc est vide.
 */
const getPreviewBase = ( block ) => {
	if ( block.innerBlocks?.length ) {
		return block;
	}
	const example = getBlockType( block.name )?.example;
	return example ? getBlockFromExample( block.name, example ) : block;
};

/*
 * Largeur de rendu simulée selon le nombre de styles par ligne : une vignette
 * pleine largeur rendue sur 400px afficherait un texte démesuré.
 */
const PREVIEW_VIEWPORTS = { 1: 1100, 2: 700, 3: 400 };

function StylePreview( { block, styleName, viewportWidth } ) {
	const previewBlock = useMemo( () => {
		const base = getPreviewBase( block );
		return cloneBlock( base, {
			className: applyStyle( base.attributes.className, styleName ),
		} );
	}, [ block, styleName ] );

	return <BlockPreview blocks={ previewBlock } viewportWidth={ viewportWidth } />;
}

// Même icône que le réglage "Apparence" de l'éditeur de site (cog).
const cogIcon = (
	<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
		<path fillRule="evenodd" clipRule="evenodd" d="M10.289 4.836A1 1 0 0111.275 4h1.306a1 1 0 01.987.836l.244 1.466c.787.26 1.503.679 2.108 1.218l1.393-.522a1 1 0 011.216.437l.653 1.13a1 1 0 01-.23 1.273l-1.148.944a6.025 6.025 0 010 2.435l1.149.946a1 1 0 01.23 1.272l-.653 1.13a1 1 0 01-1.216.437l-1.394-.522c-.605.54-1.32.958-2.108 1.218l-.244 1.466a1 1 0 01-.987.836h-1.306a1 1 0 01-.986-.836l-.244-1.466a5.995 5.995 0 01-2.108-1.218l-1.394.522a1 1 0 01-1.217-.436l-.653-1.131a1 1 0 01.23-1.272l1.149-.946a6.026 6.026 0 010-2.435l-1.148-.944a1 1 0 01-.23-1.272l.653-1.131a1 1 0 011.217-.437l1.393.522a5.994 5.994 0 012.108-1.218l.244-1.466zM14.929 12a3 3 0 11-6 0 3 3 0 016 0z" />
	</svg>
);

const PREFERENCES_SCOPE = 'waw/style-picker';

/*
 * Nombre de styles par ligne, mémorisé par utilisateur via core/preferences
 * (même mécanisme que les réglages de vue de l'éditeur de site).
 */
function useColumnsPreference() {
	const columns = useSelect(
		( select ) => select( preferencesStore ).get( PREFERENCES_SCOPE, 'columns' ) ?? 2,
		[]
	);
	const { set } = useDispatch( preferencesStore );
	return [ columns, ( value ) => set( PREFERENCES_SCOPE, 'columns', value ) ];
}

function ViewOptions( { columns, setColumns } ) {
	return (
		<Dropdown
			popoverProps={ { placement: 'bottom-end' } }
			renderToggle={ ( { isOpen, onToggle } ) => (
				<Button
					size="compact"
					icon={ cogIcon }
					label={ __( 'Options d’affichage', 'waw-style-picker' ) }
					onClick={ onToggle }
					aria-expanded={ isOpen }
				/>
			) }
			renderContent={ () => (
				<div className="waw-style-picker__view-options">
					<RangeControl
						__nextHasNoMarginBottom
						__next40pxDefaultSize
						label={ __( 'Styles par ligne', 'waw-style-picker' ) }
						value={ columns }
						onChange={ ( value ) => value && setColumns( value ) }
						min={ 1 }
						max={ 3 }
						step={ 1 }
						marks
						withInputField={ false }
					/>
				</div>
			) }
		/>
	);
}

/* ------------------------------------------------------------------ */
/* 3. Troisième pierre : la modale                                     */
/* ------------------------------------------------------------------ */
/*
 * Calquée sur la modale native "Explorer toutes les compositions"
 * (PatternsExplorerModal) : plein écran, barre latérale recherche +
 * catégories, grille d'aperçus. Classes propres au plugin : celles du
 * core ne sont pas une API publique.
 */
const ALL = '__all';

function StylePickerModal( { block, styles, activeStyle, onSelect, onClose } ) {
	// Un style par défaut sans catégorie (le "Par défaut" ajouté, "Plein" du
	// bouton…) n'est visible que dans "Toutes" et la recherche. S'il a reçu
	// une catégorie (ex. "Tag" du badge), il apparaît aussi dans celle-ci.
	const groups = useMemo( () => {
		return styles.reduce( ( acc, style ) => {
			const cat = getStyleCategory( block.name, style );
			if ( style.isDefault && cat === DEFAULT_CATEGORY ) {
				return acc;
			}
			( acc[ cat ] ||= [] ).push( style );
			return acc;
		}, {} );
	}, [ styles, block.name ] );

	const categories = [ ALL, ...Object.keys( groups ).sort( compareCategories ) ];
	const [ current, setCurrent ] = useState( ALL );
	const [ search, setSearch ] = useState( '' );
	const [ columns, setColumns ] = useColumnsPreference();

	const term = search.trim().toLowerCase();
	let visible = current === ALL ? styles : groups[ current ] || [];
	if ( term ) {
		// Comme le natif : la recherche porte sur tous les styles.
		visible = styles.filter( ( s ) => s.label.toLowerCase().includes( term ) );
	}
	// Style actif en tête (tri stable : les autres gardent leur ordre).
	visible = [ ...visible ].sort(
		( a, b ) => isStyleActive( b, activeStyle ) - isStyleActive( a, activeStyle )
	);

	const getCategoryLabel = ( cat ) =>
		cat === ALL
			? __( 'Toutes', 'waw-style-picker' )
			: CATEGORY_LABELS[ cat ] || cat;

	return (
		<Modal
			title={ __( 'Styles', 'waw-style-picker' ) }
			onRequestClose={ onClose }
			isFullScreen
			className="waw-style-picker-modal"
		>
			<div className="waw-style-picker">
				<div className="waw-style-picker__sidebar">
					<SearchControl
						__nextHasNoMarginBottom
						className="waw-style-picker__search"
						value={ search }
						onChange={ setSearch }
						label={ __( 'Rechercher un style', 'waw-style-picker' ) }
						placeholder={ __( 'Rechercher', 'waw-style-picker' ) }
					/>
					{ ! term && (
						<nav aria-label={ __( 'Catégories', 'waw-style-picker' ) }>
							{ categories.map( ( cat ) => (
								<Button
									__next40pxDefaultSize
									key={ cat }
									className="waw-style-picker__category"
									isPressed={ cat === current }
									onClick={ () => setCurrent( cat ) }
								>
									{ getCategoryLabel( cat ) }
								</Button>
							) ) }
						</nav>
					) }
				</div>

				<div className="waw-style-picker__list">
					<div className="waw-style-picker__toolbar">
						{ term && (
							<p className="waw-style-picker__count">
								{ sprintf(
									/* translators: %d: nombre de styles trouvés. */
									_n( '%d style trouvé', '%d styles trouvés', visible.length, 'waw-style-picker' ),
									visible.length
								) }
							</p>
						) }
						<ViewOptions columns={ columns } setColumns={ setColumns } />
					</div>
					<ul
						className="waw-style-picker__grid"
						style={ { '--waw-style-picker-columns': columns } }
					>
						{ visible.map( ( style ) => {
							const isActive = isStyleActive( style, activeStyle );
							return (
								<li key={ style.name }>
									<button
										type="button"
										className={ 'waw-style-picker__item' + ( isActive ? ' is-selected' : '' ) }
										aria-pressed={ isActive }
										onClick={ () => onSelect( styleNameOf( style ) ) }
									>
										<span className="waw-style-picker__thumb" aria-hidden="true">
											<StylePreview
												block={ block }
												styleName={ styleNameOf( style ) }
												viewportWidth={ PREVIEW_VIEWPORTS[ columns ] }
											/>
										</span>
										<span className="waw-style-picker__title">{ style.label }</span>
									</button>
								</li>
							);
						} ) }
					</ul>
				</div>
			</div>
		</Modal>
	);
}

/* ------------------------------------------------------------------ */
/* Panneau d'inspecteur (partagé entre slot normal et portail section)  */
/* ------------------------------------------------------------------ */
function StylePanel( { activeLabel, onOpen, className = '' } ) {
	return (
		<PanelBody
			title={ sprintf(
				/* translators: %s: libellé du style actif. */
				__( 'Style (%s)', 'waw-style-picker' ),
				activeLabel
			) }
			className={ `waw-style-picker-panel ${ className }`.trim() }
		>
			{ onOpen ? (
				<Button variant="secondary" onClick={ onOpen }>
					{ __( 'Choisir un style', 'waw-style-picker' ) }
				</Button>
			) : (
				<p>{ __( 'Aucun autre style n’est proposé pour ce bloc ici.', 'waw-style-picker' ) }</p>
			) }
		</PanelBody>
	);
}

/*
 * Racine d'une composition non ouverte (section) : WP 7.1 n'affiche aucun
 * InspectorControls du groupe "styles" et rend lui-même le sélecteur natif.
 * Les seuls emplacements restants (InspectorControlsLastItem,
 * BlockInspectorPreTabs) sont des API privées. On insère donc un conteneur
 * juste après le panneau natif et on y rend notre panneau par un portail ;
 * le CSS masque alors le natif.
 *
 * Règle : conteneur présent seulement si le natif est visible ET que notre
 * panneau normal est absent. Si le DOM du core change, on retombe sur le
 * sélecteur natif, sans casse.
 */
const FALLBACK_CLASS = 'is-section-fallback';

function useNativeStylesFallbackHost( enabled ) {
	const [ host, setHost ] = useState( null );

	useEffect( () => {
		if ( ! enabled ) {
			return;
		}
		let current = null;

		const update = () => {
			const inspector = document.querySelector( '.block-editor-block-inspector' );
			const nativePanel = inspector
				?.querySelector( '.block-editor-block-styles' )
				?.closest( '.components-tools-panel' );
			const hasOwnPanel = !! inspector?.querySelector(
				`.waw-style-picker-panel:not(.${ FALLBACK_CLASS })`
			);

			if ( nativePanel && ! hasOwnPanel ) {
				if ( current?.isConnected && current.previousElementSibling === nativePanel ) {
					return;
				}
				current?.remove();
				current = document.createElement( 'div' );
				current.className = 'waw-style-picker-host';
				nativePanel.after( current );
				setHost( current );
			} else if ( current ) {
				current.remove();
				current = null;
				setHost( null );
			}
		};

		update();
		// Onglets et panneaux sont remontés à la volée : on suit le DOM tant
		// que le bloc est sélectionné.
		const observer = new MutationObserver( update );
		observer.observe( document.body, { childList: true, subtree: true } );

		return () => {
			observer.disconnect();
			current?.remove();
			setHost( null );
		};
	}, [ enabled ] );

	return host;
}

/* ------------------------------------------------------------------ */
/* 2. Deuxième pierre : brancher le bouton dans l'inspecteur           */
/* ------------------------------------------------------------------ */
const withStylePicker = createHigherOrderComponent( ( BlockEdit ) => {
	return ( props ) => {
		const { name, clientId, attributes, setAttributes, isSelected } = props;
		const [ isOpen, setOpen ] = useState( false );

		const registeredStyles = useSelect(
			( select ) => select( blocksStore ).getBlockStyles( name ),
			[ name ]
		);
		const activeStyle = getActiveStyle( attributes.className );
		const patternName = attributes.metadata?.patternName;
		// Premier niveau : pas de bloc parent dans l'arbre édité (contenu de la
		// page, ou partie de modèle ouverte seule).
		const isRoot = useSelect(
			( select ) => ! select( blockEditorStore ).getBlockRootClientId( clientId ),
			[ clientId ]
		);
		const styles = useMemo(
			() =>
				registeredStyles?.length
					? withPatternDefault(
						getAvailableStyles(
							name,
							withDefaultStyle( registeredStyles ),
							patternName,
							activeStyle,
							isRoot
						),
						registeredStyles,
						patternName
					)
					: [],
			[ registeredStyles, name, patternName, activeStyle, isRoot ]
		);

		// Lu seulement quand la modale est ouverte : inutile de suivre
		// chaque frappe dans le bloc le reste du temps.
		const block = useSelect(
			( select ) =>
				isOpen ? select( blockEditorStore ).getBlock( clientId ) : null,
			[ isOpen, clientId ]
		);

		// Seuil calculé sur les styles enregistrés, pas sur ceux proposés : une
		// restriction ne doit pas rendre la main au sélecteur natif, qui les
		// afficherait tous (voir hasRestriction).
		// Bloc à l'intérieur d'une composition verrouillée (contentOnly) : mode
		// d'édition « contentOnly » ou « disabled », seul le contenu s'y modifie.
		// WordPress n'y propose aucun style ; on ne le fait pas non plus, sinon
		// une tuile aux textes colorés pourrait prendre un fond de même couleur.
		const editingMode = useSelect(
			( select ) => select( blockEditorStore ).getBlockEditingMode( clientId ),
			[ clientId ]
		);
		const enabled =
			'default' === editingMode &&
			isPickerEnabled( name, registeredStyles?.length || 0, patternName );
		const fallbackHost = useNativeStylesFallbackHost( enabled && isSelected );

		useEffect( () => {
			if ( ! enabled || ! isSelected ) {
				return;
			}
			activeBlocks.add( clientId );
			syncBodyClass();
			return () => {
				activeBlocks.delete( clientId );
				syncBodyClass();
			};
		}, [ enabled, isSelected, clientId ] );

		if ( ! enabled ) {
			return <BlockEdit { ...props } />;
		}

		// Une classe is-style-* inconnue (style désenregistré) retombe aussi
		// sur le libellé du style par défaut.
		const activeLabel = (
			styles.find( ( s ) => isStyleActive( s, activeStyle ) ) || styles[ 0 ]
		).label;
		// Un seul choix (composition au style imposé) : rien à ouvrir, mais le
		// panneau reste affiché pour masquer le sélecteur natif.
		const canChoose = styles.length > 1;
		const open = canChoose ? () => setOpen( true ) : null;

		return (
			<>
				<BlockEdit { ...props } />
				{ isSelected && canChoose && (
					/*
					 * Barre d'outils : seul accès possible sur la racine d'une
					 * composition non ouverte (section). WP 7.1 y masque les
					 * InspectorControls du groupe "styles" et tous les slots de
					 * la barre d'outils sauf le groupe "other".
					 */
					<BlockControls group="other">
						<ToolbarGroup>
							<ToolbarButton
								className="waw-style-picker-toolbar-button"
								onClick={ () => setOpen( true ) }
								label={ sprintf(
									/* translators: %s: libellé du style actif. */
									__( 'Choisir un style (actuel : %s)', 'waw-style-picker' ),
									activeLabel
								) }
								showTooltip
							>
								{ __( 'Style', 'waw-style-picker' ) }
							</ToolbarButton>
						</ToolbarGroup>
					</BlockControls>
				) }
				{ isSelected && (
					<InspectorControls group="styles">
						<StylePanel activeLabel={ activeLabel } onOpen={ open } />
					</InspectorControls>
				) }
				{ isSelected &&
					fallbackHost &&
					createPortal(
						<StylePanel
							activeLabel={ activeLabel }
							onOpen={ open }
							className={ FALLBACK_CLASS }
						/>,
						fallbackHost
					) }
				{ /* Hors InspectorControls : ce slot est filtré en mode section. */ }
				{ isOpen && block && (
					<StylePickerModal
						block={ block }
						styles={ styles }
						activeStyle={ activeStyle }
						onClose={ () => setOpen( false ) }
						onSelect={ ( styleName ) => {
							setAttributes( { className: applyStyle( attributes.className, styleName ) } );
							setOpen( false );
						} }
					/>
				) }
			</>
		);
	};
}, 'withStylePicker' );

addFilter( 'editor.BlockEdit', 'waw/style-picker', withStylePicker );
