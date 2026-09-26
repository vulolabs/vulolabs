const createWebpackConfig = require(
	'../../tools/webpack/create-config'
);

const config = createWebpackConfig(
	__dirname
);

// @multivendorx/zyra ships as one non-tree-shakeable CommonJS bundle
// (build/index.js) shared across every product in the multivendorx/zyra
// family, not just this plugin - so importing anything from it (this
// plugin imports @zyra/core, @zyra/components, @zyra/inputs, @zyra/table
// pervasively) pulls in every `require()` zyra's bundle contains,
// including ones this plugin never actually calls. `@react-pdf/renderer`
// (~2.4 MiB source, the single largest package in vendors.js) is one such
// case: it's only ever required by zyra's own `PickerInput` component (a
// template-picker-with-PDF-preview input type), which nothing in this
// plugin's own src/ or modules/ imports, references by name, or declares
// a matching `type: 'picker'` field for (confirmed by grep across the
// whole tree) - PickerInput most likely backs a different product's
// invoice/certificate-template feature, not anything vulopilot exposes.
// Aliasing it to `false` tells webpack to resolve every
// `require('@react-pdf/renderer')` to an empty module instead of bundling
// the real ~2.4 MiB package, since we've confirmed the only code path
// that would ever call it is unreachable here. Scoped to this plugin's
// own webpack.config.js rather than tools/webpack/create-config.js (the
// shared factory every vulopilot/vulocart/-pro webpack.config.js calls)
// specifically because vulocart's own "Invoice" feature is exactly the
// kind of thing PickerInput could plausibly back for that product line -
// confirmed vulocart's own src/modules don't reference it either today,
// but this alias should stay opt-in per plugin, not silently apply to a
// product line that might genuinely need it.
//
// If a future zyra update starts routing some vulopilot-used component
// through PickerInput (or `@react-pdf/renderer` directly), this alias
// would need removing - `false` makes webpack resolve the import to an
// empty module rather than failing the build, so a newly-reachable
// PickerInput would fail silently at runtime (e.g. "Document is not a
// function"), not surface as a build error. Re-run the grep this
// docblock describes (PickerInput/templateSelector/showPdfButton/
// `type: 'picker'` across src/ and modules/) after any zyra upgrade that
// touches PickerInput before assuming this alias is still safe.
config.resolve.alias['@react-pdf/renderer$'] = false;

// wordpress.org does not allow a plugin to load code from other sites. zyra and
// @tinymce/tinymce-react bundle widgets that fetch scripts/styles/images from
// Google Maps, Mapbox, reCAPTCHA and TinyMCE Cloud; this plugin uses none of
// them, so their host names are replaced at build time (see the loader's own
// docblock). Opt-in per plugin, like the @react-pdf/renderer alias above.
config.module.rules.unshift( {
	test: /\.(c|m)?js$/,
	include: /[\\/](?:@multivendorx[\\/]zyra|@tinymce[\\/]tinymce-react)[\\/]/,
	enforce: 'pre',
	use: require( 'path' ).resolve(
		__dirname,
		'../../tools/webpack/loaders/disable-remote-hosts.js'
	),
} );

module.exports = config;
