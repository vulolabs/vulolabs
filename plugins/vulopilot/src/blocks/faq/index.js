import { registerBlockType } from '@wordpress/blocks';
import { __, sprintf } from '@wordpress/i18n';
import { useState } from '@wordpress/element';
import {
	useBlockProps,
	RichText,
	InspectorControls,
	useSettings,
	MediaUpload,
	MediaUploadCheck,
	// eslint-disable-next-line camelcase
	__experimentalBorderControl as BorderControl,
} from '@wordpress/block-editor';
import {
	Button,
	PanelBody,
	TabPanel,
	TextControl,
	TextareaControl,
	ToggleControl,
	SelectControl,
	RangeControl,
	ColorPalette,
	BaseControl,
	BoxControl,
	// eslint-disable-next-line camelcase
	__experimentalUnitControl as UnitControl,
} from '@wordpress/components';
import metadata from './block.json';
import {
	DEFAULT_FAQ_STYLE,
	APPEARANCE_PRESETS,
	ICON_STYLE_OPTIONS,
	ICON_POSITION_OPTIONS,
	LAYOUT_MODE_OPTIONS,
	HEADING_LEVEL_OPTIONS,
} from './faqStyleDefaults';

/** One level of `style.<section>` (or `style.<section>.<subsection>`) deep-merged over its own real default, so a partial saved override still renders every other field at its real default. */
function mergeSection( defaults, saved ) {
	if ( ! saved ) {
		return defaults;
	}

	const merged = { ...defaults, ...saved };

	Object.keys( defaults ).forEach( ( key ) => {
		if (
			defaults[ key ] &&
			'object' === typeof defaults[ key ] &&
			! Array.isArray( defaults[ key ] )
		) {
			merged[ key ] = { ...defaults[ key ], ...( saved[ key ] || {} ) };
		}
	} );

	return merged;
}

function mergeFaqStyle( saved ) {
	const style = {};

	Object.keys( DEFAULT_FAQ_STYLE ).forEach( ( section ) => {
		style[ section ] = mergeSection(
			DEFAULT_FAQ_STYLE[ section ],
			saved?.[ section ]
		);
	} );

	// `responsive` is two levels deep (tablet/mobile each their own section).
	style.responsive = {
		tablet: mergeSection(
			DEFAULT_FAQ_STYLE.responsive.tablet,
			saved?.responsive?.tablet
		),
		mobile: mergeSection(
			DEFAULT_FAQ_STYLE.responsive.mobile,
			saved?.responsive?.mobile
		),
	};

	return style;
}

/** A single labeled color field - real theme palette (`useSettings('color.palette')`) plus a custom-color picker, same as every core block's own color controls. */
function ColorField( { label, value, onChange } ) {
	const [ themeColors ] = useSettings( 'color.palette' );

	return (
		<BaseControl label={ label } __nextHasNoMarginBottom>
			<ColorPalette
				colors={ themeColors }
				value={ value }
				onChange={ onChange }
				enableAlpha
				clearable
			/>
		</BaseControl>
	);
}

/** A single labeled `UnitControl` - this Style tab's own stand-in for every plain size/spacing field (font size, icon size, gap, radius, width…), so they all share one real control shape. */
function SizeField( { label, value, onChange, placeholder } ) {
	return (
		<UnitControl
			label={ label }
			value={ value }
			onChange={ ( next ) => onChange( next ?? '' ) }
			placeholder={ placeholder }
			__next40pxDefaultSize
		/>
	);
}

registerBlockType( metadata.name, {
	edit: ( { attributes, setAttributes } ) => {
		const {
			questions,
			layoutMode,
			allowMultipleOpen,
			initialOpenIndex,
			iconStyle,
			iconPosition,
			animationEnabled,
			animationDuration,
			headingLevel,
			enableSchema,
			appearance,
		} = attributes;

		// The one sidebar "Questions & answers" item shown expanded at a time (image mockup's own
		// single-open accordion-of-rows look) - `null` once the user collapses every row.
		const [ openQuestionIndex, setOpenQuestionIndex ] = useState( 0 );
		const style = mergeFaqStyle( attributes.style );
		const blockProps = useBlockProps();

		/** One or more fields on a single question row, merged in one write - needed (not two
		 * separate `updateQuestion()` calls) for the image picker's `imageId`+`imageUrl` pair,
		 * since two `setAttributes()` calls in the same handler would both read the same stale
		 * `questions` closure and the second would silently drop the first's change. */
		const patchQuestion = ( index, patch ) => {
			const next = questions.slice();
			next[ index ] = { ...next[ index ], ...patch };
			setAttributes( { questions: next } );
		};

		const updateQuestion = ( index, field, value ) =>
			patchQuestion( index, { [ field ]: value } );

		const addRow = () =>
			setAttributes( {
				questions: [ ...questions, { question: '', answer: '' } ],
			} );

		const duplicateRow = ( index ) => {
			const next = questions.slice();
			next.splice( index + 1, 0, { ...questions[ index ] } );
			setAttributes( { questions: next } );
		};

		const removeRow = ( index ) =>
			setAttributes( {
				questions: questions.filter( ( _row, i ) => i !== index ),
			} );

		const UNSAFE_KEYS = [ '__proto__', 'prototype', 'constructor' ];

		/** One `style.<path>` write - `path` e.g. `'question.color'` or `'container.padding'`. Every call site passes a fixed string literal (see call sites below), but keys are still checked against `UNSAFE_KEYS` before being used to index into `next`. */
		const updateStyle = ( path, value ) => {
			const parts = path.split( '.' );

			if ( parts.some( ( part ) => UNSAFE_KEYS.includes( part ) ) ) {
				return;
			}

			const next = JSON.parse( JSON.stringify( style ) );
			let cursor = next;

			for ( let i = 0; i < parts.length - 1; i++ ) {
				if ( 'object' !== typeof cursor[ parts[ i ] ] || null === cursor[ parts[ i ] ] ) {
					cursor[ parts[ i ] ] = {};
				}
				cursor = cursor[ parts[ i ] ];
			}

			cursor[ parts[ parts.length - 1 ] ] = value;
			setAttributes( { style: next } );
		};

		/** Writes an `APPEARANCE_PRESETS` entry's own `style` bundle straight into the real `style` attribute (see that file's own docblock for why a preset is a real write, not a CSS-only default). */
		const applyPreset = ( value ) => {
			const preset = APPEARANCE_PRESETS.find( ( p ) => p.value === value );
			if ( ! preset ) {
				return;
			}
			const next = JSON.parse( JSON.stringify( style ) );
			Object.keys( preset.style ).forEach( ( section ) => {
				next[ section ] = { ...next[ section ], ...preset.style[ section ] };
			} );
			setAttributes( { appearance: value, style: next } );
		};

		/** The simplified "Colors" panel's 3 fields each fan out to every real `style.*` field that
		 * color conceptually covers - "Text" to both question/answer text color, "Accent" to the
		 * icon/link/expanded-state colors, "Background" to the container background behind every
		 * item (not each item's own background, which the Appearance preset above already owns). */
		const setTextColor = ( value ) => {
			const v = value ?? '';
			const next = JSON.parse( JSON.stringify( style ) );
			next.question.color = v;
			next.answer.color = v;
			setAttributes( { style: next } );
		};

		const setAccentColor = ( value ) => {
			const v = value ?? '';
			const next = JSON.parse( JSON.stringify( style ) );
			next.icon.color = v;
			next.answer.linkColor = v;
			next.states.expandedBorderColor = v;
			next.states.expandedQuestionColor = v;
			next.states.expandedIconBackground = v;
			setAttributes( { style: next } );
		};

		const setBackgroundColor = ( value ) => {
			const next = JSON.parse( JSON.stringify( style ) );
			next.container.background = value ?? '';
			setAttributes( { style: next } );
		};

		return (
			<>

				<InspectorControls>
					<TabPanel
						className="vulopilot-faq-inspector-tabs"
						tabs={ [
							{ name: 'content', title: __( 'Content', 'vulopilot' ) },
							{ name: 'settings', title: __( 'Settings', 'vulopilot' ) },
							{ name: 'style', title: __( 'Style', 'vulopilot' ) },
						] }
					>
						{ ( tab ) => {
							if ( 'content' === tab.name ) {
								return (
									<PanelBody
										title={
											<>
												{ __( 'Questions & answers', 'vulopilot' ) }
												<span className="vulopilot-faq-qa-count">
													{ sprintf(
														/* translators: %d: real number of questions currently on this block. */
														__( '%d items', 'vulopilot' ),
														questions.length
													) }
												</span>
											</>
										}
									>
										{ 0 === questions.length && (
											<p className="vulopilot-faq-sidebar-empty">
												{ __( 'No questions added yet.', 'vulopilot' ) }
											</p>
										) }
										{ questions.map( ( item, index ) => {
											const isOpen = index === openQuestionIndex;

											return (
												<div
													className={ `vulopilot-faq-qa-item${ isOpen ? ' is-open' : '' }` }
													key={ index }
												>
													<button
														type="button"
														className="vulopilot-faq-qa-item__header"
														onClick={ () =>
															setOpenQuestionIndex( isOpen ? null : index )
														}
													>
														<span className="vulopilot-faq-qa-item__badge">
															{ String( index + 1 ).padStart( 2, '0' ) }
														</span>
														<span className="vulopilot-faq-qa-item__title">
															{ item.question ||
																sprintf(
																	/* translators: %d: real 1-based question number. */
																	__( 'Question %d', 'vulopilot' ),
																	index + 1
																) }
														</span>
														<span
															className="vulopilot-faq-qa-item__chevron"
															aria-hidden="true"
														>
															{ isOpen ? '⌃' : '⌄' }
														</span>
													</button>
													{ isOpen && (
														<div className="vulopilot-faq-qa-item__body">
															<TextControl
																label={ __( 'Question', 'vulopilot' ) }
																value={ item.question }
																onChange={ ( value ) =>
																	updateQuestion( index, 'question', value )
																}
																__next40pxDefaultSize
																__nextHasNoMarginBottom
															/>
															<TextareaControl
																label={ __( 'Answer', 'vulopilot' ) }
																value={ item.answer }
																onChange={ ( value ) =>
																	updateQuestion( index, 'answer', value )
																}
																rows={ 3 }
																__nextHasNoMarginBottom
															/>
															<div className="vulopilot-faq-qa-item__actions">
																<Button
																	variant="tertiary"
																	icon="admin-page"
																	size="small"
																	onClick={ () => duplicateRow( index ) }
																>
																	{ __( 'Duplicate', 'vulopilot' ) }
																</Button>
																<Button
																	variant="tertiary"
																	isDestructive
																	icon="trash"
																	size="small"
																	onClick={ () => removeRow( index ) }
																>
																	{ __( 'Remove', 'vulopilot' ) }
																</Button>
															</div>
														</div>
													) }
												</div>
											);
										} ) }
										<Button
											className="vulopilot-faq-qa-add"
											variant="secondary"
											icon="plus-alt2"
											onClick={ () => {
												addRow();
												setOpenQuestionIndex( questions.length );
											} }
										>
											{ __( 'Add question', 'vulopilot' ) }
										</Button>
										<p className="vulopilot-faq-qa-hint">
											{ __(
												'You can also edit questions directly on the canvas.',
												'vulopilot'
											) }
										</p>
									</PanelBody>
								);
							}

							if ( 'settings' === tab.name ) {
								return (
									<PanelBody title={ __( 'Behavior', 'vulopilot' ) }>
										<SelectControl
											label={ __( 'Layout', 'vulopilot' ) }
											value={ layoutMode }
											options={ LAYOUT_MODE_OPTIONS }
											onChange={ ( value ) =>
												setAttributes( { layoutMode: value } )
											}
											__next40pxDefaultSize
											__nextHasNoMarginBottom
										/>
										{ 'accordion' === layoutMode && (
											<>
												<ToggleControl
													label={ __(
														'Allow multiple answers open',
														'vulopilot'
													) }
													checked={ allowMultipleOpen }
													onChange={ ( value ) =>
														setAttributes( {
															allowMultipleOpen: value,
														} )
													}
													__nextHasNoMarginBottom
												/>
												<SelectControl
													label={ __(
														'Initially open item',
														'vulopilot'
													) }
													value={ String(
														null === initialOpenIndex
															? ''
															: initialOpenIndex
													) }
													options={ [
														{
															label: __(
																'None (all closed)',
																'vulopilot'
															),
															value: '',
														},
														...questions.map(
															( item, index ) => ( {
																label:
																	item.question ||
																	`#${ index + 1 }`,
																value: String( index ),
															} )
														),
													] }
													onChange={ ( value ) =>
														setAttributes( {
															initialOpenIndex:
																'' === value
																	? null
																	: Number( value ),
														} )
													}
													__next40pxDefaultSize
													__nextHasNoMarginBottom
												/>
												<ToggleControl
													label={ __(
														'Open/close animation',
														'vulopilot'
													) }
													checked={ animationEnabled }
													onChange={ ( value ) =>
														setAttributes( {
															animationEnabled: value,
														} )
													}
													__nextHasNoMarginBottom
												/>
												{ animationEnabled && (
													<RangeControl
														label={ __(
															'Animation duration (ms)',
															'vulopilot'
														) }
														value={ animationDuration }
														min={ 0 }
														max={ 800 }
														step={ 10 }
														onChange={ ( value ) =>
															setAttributes( {
																animationDuration: value,
															} )
														}
														__nextHasNoMarginBottom
													/>
												) }
											</>
										) }
										<SelectControl
											label={ __( 'Toggle icon', 'vulopilot' ) }
											value={ iconStyle }
											options={ ICON_STYLE_OPTIONS }
											onChange={ ( value ) =>
												setAttributes( { iconStyle: value } )
											}
											__next40pxDefaultSize
											__nextHasNoMarginBottom
										/>
										<SelectControl
											label={ __( 'Icon position', 'vulopilot' ) }
											value={ iconPosition }
											options={ ICON_POSITION_OPTIONS }
											onChange={ ( value ) =>
												setAttributes( { iconPosition: value } )
											}
											__next40pxDefaultSize
											__nextHasNoMarginBottom
										/>
										<SelectControl
											label={ __(
												'Question heading level',
												'vulopilot'
											) }
											value={ String( headingLevel ) }
											options={ HEADING_LEVEL_OPTIONS.map(
												( option ) => ( {
													label: option.label,
													value: String( option.value ),
												} )
											) }
											onChange={ ( value ) =>
												setAttributes( {
													headingLevel: Number( value ),
												} )
											}
											__next40pxDefaultSize
											__nextHasNoMarginBottom
										/>
										<ToggleControl
											label={ __(
												'Enable FAQ structured data',
												'vulopilot'
											) }
											help={ __(
												'Outputs real FAQPage JSON-LD for search engines, generated only from real question/answer rows.',
												'vulopilot'
											) }
											checked={ enableSchema }
											onChange={ ( value ) =>
												setAttributes( { enableSchema: value } )
											}
											__nextHasNoMarginBottom
										/>
									</PanelBody>
								);
							}

							return (
								<>
									<PanelBody
										title={ __( 'Appearance', 'vulopilot' ) }
										initialOpen={ true }
									>
										<div className="vulopilot-faq-appearance-options">
											{ APPEARANCE_PRESETS.map( ( preset ) => (
												<button
													key={ preset.value }
													type="button"
													className={ `vulopilot-faq-appearance-option${
														appearance === preset.value
															? ' is-selected'
															: ''
													}` }
													onClick={ () => applyPreset( preset.value ) }
												>
													<span
														className={ `vulopilot-faq-appearance-option-swatch vulopilot-faq-appearance-option-swatch--${ preset.value }` }
													/>
													<span className="vulopilot-faq-appearance-option-label">
														{ preset.label }
													</span>
												</button>
											) ) }
										</div>
									</PanelBody>

									<PanelBody
										title={ __( 'Typography', 'vulopilot' ) }
										initialOpen={ true }
									>
										<SizeField
											label={ __( 'Question size', 'vulopilot' ) }
											value={ style.question.fontSize }
											onChange={ ( v ) =>
												updateStyle( 'question.fontSize', v )
											}
										/>
										<SizeField
											label={ __( 'Answer size', 'vulopilot' ) }
											value={ style.answer.fontSize }
											onChange={ ( v ) =>
												updateStyle( 'answer.fontSize', v )
											}
										/>
									</PanelBody>

									<PanelBody
										title={ __( 'Colors', 'vulopilot' ) }
										initialOpen={ true }
									>
										<ColorField
											label={ __( 'Text', 'vulopilot' ) }
											value={ style.question.color }
											onChange={ setTextColor }
										/>
										<ColorField
											label={ __( 'Accent', 'vulopilot' ) }
											value={ style.icon.color }
											onChange={ setAccentColor }
										/>
										<ColorField
											label={ __( 'Background', 'vulopilot' ) }
											value={ style.container.background }
											onChange={ setBackgroundColor }
										/>
										<ColorField
											label={ __( 'Expanded question background', 'vulopilot' ) }
											value={ style.states.expandedBackground }
											onChange={ ( v ) =>
												updateStyle( 'states.expandedBackground', v ?? '' )
											}
										/>
									</PanelBody>

									<PanelBody
										title={ __( 'Spacing & borders', 'vulopilot' ) }
										initialOpen={ false }
									>
										<SizeField
											label={ __( 'Item gap', 'vulopilot' ) }
											value={ style.layout.itemGap }
											onChange={ ( v ) =>
												updateStyle( 'layout.itemGap', v )
											}
										/>
										<BoxControl
											label={ __( 'Padding', 'vulopilot' ) }
											values={ style.question.padding }
											onChange={ ( v ) =>
												updateStyle( 'question.padding', v )
											}
										/>
										<BorderControl
											label={ __( 'Border', 'vulopilot' ) }
											value={ style.item.border }
											onChange={ ( v ) =>
												updateStyle( 'item.border', v || {} )
											}
										/>
										<SizeField
											label={ __( 'Corner radius', 'vulopilot' ) }
											value={ style.item.radius }
											onChange={ ( v ) =>
												updateStyle( 'item.radius', v )
											}
										/>
									</PanelBody>

									<PanelBody
										title={ __( 'Icon settings', 'vulopilot' ) }
										initialOpen={ false }
									>
										<SizeField
											label={ __( 'Size', 'vulopilot' ) }
											value={ style.icon.size }
											onChange={ ( v ) =>
												updateStyle( 'icon.size', v )
											}
										/>
										<SizeField
											label={ __(
												'Spacing from edge',
												'vulopilot'
											) }
											value={ style.icon.spacing }
											onChange={ ( v ) =>
												updateStyle( 'icon.spacing', v )
											}
										/>
										<ColorField
											label={ __( 'Background', 'vulopilot' ) }
											value={ style.icon.background }
											onChange={ ( v ) =>
												updateStyle( 'icon.background', v )
											}
										/>
										<SizeField
											label={ __( 'Corner radius', 'vulopilot' ) }
											value={ style.icon.radius }
											onChange={ ( v ) =>
												updateStyle( 'icon.radius', v )
											}
										/>
									</PanelBody>
								</>
							);
						} }
					</TabPanel>
				</InspectorControls>

				<div { ...blockProps }>
					<div className="vulopilot-faq-editor">
						{ 0 === questions.length && (
							<p className="vulopilot-faq-editor-empty">
								{ __(
									'Add a question below to get started.',
									'vulopilot'
								) }
							</p>
						) }
						{ questions.map( ( item, index ) => (
							<div
								className={ `vulopilot-faq-editor-card${ item.hidden ? ' is-hidden' : '' }` }
								key={ index }
							>
								<div className="vulopilot-faq-editor-card__header">
									<RichText
										tagName="p"
										className="vulopilot-faq-editor-card__question"
										placeholder={ __( 'Question', 'vulopilot' ) }
										value={ item.question }
										onChange={ ( value ) =>
											updateQuestion( index, 'question', value )
										}
									/>
									<div className="vulopilot-faq-editor-card__actions">
										<Button
											icon={ item.hidden ? 'hidden' : 'visibility' }
											label={
												item.hidden
													? __( 'Show on frontend', 'vulopilot' )
													: __( 'Hide from frontend', 'vulopilot' )
											}
											showTooltip
											size="small"
											onClick={ () =>
												updateQuestion( index, 'hidden', ! item.hidden )
											}
										/>
										<Button
											icon="trash"
											label={ __( 'Delete question', 'vulopilot' ) }
											showTooltip
											isDestructive
											size="small"
											onClick={ () => removeRow( index ) }
										/>
									</div>
								</div>
								<RichText
									tagName="div"
									className="vulopilot-faq-editor-card__answer"
									placeholder={ __( 'Answer', 'vulopilot' ) }
									value={ item.answer }
									onChange={ ( value ) =>
										updateQuestion( index, 'answer', value )
									}
								/>
								{ item.imageUrl && (
									<img
										className="vulopilot-faq-editor-card__image-preview"
										src={ item.imageUrl }
										alt=""
									/>
								) }
								<div className="vulopilot-faq-editor-card__image-row">
									<MediaUploadCheck>
										<MediaUpload
											onSelect={ ( media ) =>
												patchQuestion( index, {
													imageId: media.id,
													imageUrl: media.url,
												} )
											}
											allowedTypes={ [ 'image' ] }
											value={ item.imageId }
											render={ ( { open } ) => (
												<Button
													variant="primary"
													size="small"
													onClick={ open }
												>
													{ item.imageUrl
														? __( 'Replace image', 'vulopilot' )
														: __( 'Add Image', 'vulopilot' ) }
												</Button>
											) }
										/>
									</MediaUploadCheck>
									{ item.imageUrl && (
										<Button
											variant="tertiary"
											isDestructive
											size="small"
											onClick={ () =>
												patchQuestion( index, {
													imageId: 0,
													imageUrl: '',
												} )
											}
										>
											{ __( 'Remove image', 'vulopilot' ) }
										</Button>
									) }
								</div>
							</div>
						) ) }
						<Button
							className="vulopilot-faq-editor-add"
							variant="primary"
							icon="plus-alt2"
							onClick={ addRow }
						>
							{ __( 'Add New FAQ', 'vulopilot' ) }
						</Button>
					</div>
				</div>
			</>
		);
	},

	// Dynamic block - render.php builds both the visible <details> markup
	// and the real FAQPage JSON-LD from these same attributes, so save()
	// persists nothing.
	save: () => null,
} );
