/**
 * Webpack loader for third-party UI code that ships components which load
 * scripts, styles or images from other sites at runtime (Google Maps, Mapbox,
 * reCAPTCHA, TinyMCE Cloud). None of those components is used by our plugins,
 * and wordpress.org does not allow a plugin to pull code from other hosts, so
 * the host names are replaced before bundling. The components then have nowhere
 * to connect to instead of reaching out to a remote service.
 */
const HOSTS = [
	'https://maps.googleapis.com',
	'https://maps.gstatic.com',
	'https://api.mapbox.com',
	'https://www.google.com/recaptcha',
	'https://cdn.tiny.cloud',
];

module.exports = function disableRemoteHosts( source ) {
	let output = source;

	for ( const host of HOSTS ) {
		output = output.split( host ).join( 'about:blank#unused' );
	}

	return output;
};
