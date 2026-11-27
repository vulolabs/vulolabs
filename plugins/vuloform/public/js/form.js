/**
 * VuloForm - public form behaviour.
 *
 * Plain JavaScript, no dependencies. The form works without this file (it posts to the server and
 * every page is shown); this adds live validation, conditional fields, steps, calculations and
 * submitting without a reload. The server repeats every check, so nothing here is relied on.
 */
( function () {
	'use strict';

	function each( list, fn ) {
		Array.prototype.forEach.call( list, fn );
	}

	/* ---------- Calculations: the same evaluator as Forms\Calculator ---------- */

	function toNumber( value ) {
		var list = Array.isArray( value ) ? value : [ value ];
		var total = 0;

		list.forEach( function ( item ) {
			var n = parseFloat( item );

			if ( ! isNaN( n ) && isFinite( item ) ) {
				total += n;
			}
		} );

		return total;
	}

	function calculate( formula, getValue ) {
		var tokens = [];
		var i = 0;
		var weight = { '+': 1, '-': 1, '*': 2, '/': 2, neg: 3 };
		var output = [];
		var stack = [];
		var result = [];

		while ( i < formula.length ) {
			var ch = formula[ i ];

			if ( /\s/.test( ch ) ) {
				i++;
			} else if ( ch === '{' ) {
				var end = formula.indexOf( '}', i );

				if ( end < 0 ) {
					return null;
				}

				tokens.push( toNumber( getValue( formula.slice( i + 1, end ) ) ) );
				i = end + 1;
			} else if ( /[0-9.]/.test( ch ) ) {
				var start = i;

				while ( i < formula.length && /[0-9.]/.test( formula[ i ] ) ) {
					i++;
				}

				tokens.push( parseFloat( formula.slice( start, i ) ) || 0 );
			} else if ( '+-*/()'.indexOf( ch ) >= 0 ) {
				var prev = tokens.length ? tokens[ tokens.length - 1 ] : '(';

				tokens.push( ch === '-' && typeof prev !== 'number' && prev !== ')' ? 'neg' : ch );
				i++;
			} else {
				return null;
			}
		}

		if ( ! tokens.length ) {
			return null;
		}

		for ( var t = 0; t < tokens.length; t++ ) {
			var token = tokens[ t ];

			if ( typeof token === 'number' ) {
				output.push( token );
			} else if ( token === 'neg' || token === '(' ) {
				stack.push( token );
			} else if ( weight[ token ] ) {
				while ( stack.length && weight[ stack[ stack.length - 1 ] ] >= weight[ token ] ) {
					output.push( stack.pop() );
				}

				stack.push( token );
			} else {
				while ( stack.length && stack[ stack.length - 1 ] !== '(' ) {
					output.push( stack.pop() );
				}

				if ( ! stack.length ) {
					return null;
				}

				stack.pop();
			}
		}

		while ( stack.length ) {
			var op = stack.pop();

			if ( op === '(' ) {
				return null;
			}

			output.push( op );
		}

		for ( var o = 0; o < output.length; o++ ) {
			var item = output[ o ];

			if ( typeof item === 'number' ) {
				result.push( item );
			} else if ( item === 'neg' ) {
				if ( ! result.length ) {
					return null;
				}

				result.push( -1 * result.pop() );
			} else {
				if ( result.length < 2 ) {
					return null;
				}

				var right = result.pop();
				var left = result.pop();

				if ( item === '+' ) {
					result.push( left + right );
				} else if ( item === '-' ) {
					result.push( left - right );
				} else if ( item === '*' ) {
					result.push( left * right );
				} else {
					result.push( right === 0 ? 0 : left / right );
				}
			}
		}

		return result.length === 1 ? result[ 0 ] : null;
	}

	/* ---------- One form ---------- */

	/* ---------- Google reCAPTCHA ---------- */

	var recaptchaLoading = null;

	// Loads Google's script once per page, and only for a form that uses reCAPTCHA.
	function loadRecaptcha( settings ) {
		if ( recaptchaLoading ) {
			return recaptchaLoading;
		}

		recaptchaLoading = new Promise( function ( resolve, reject ) {
			var script = document.createElement( 'script' );

			window.vuloformRecaptchaLoaded = function () {
				resolve( window.grecaptcha );
			};

			script.src =
				'https://www.google.com/recaptcha/api.js?onload=vuloformRecaptchaLoaded&render=' +
				( settings.type === 'v3' ? encodeURIComponent( settings.sitekey ) : 'explicit' );
			script.async = true;
			script.onerror = function () {
				recaptchaLoading = null;
				reject();
			};

			document.head.appendChild( script );
		} );

		return recaptchaLoading;
	}

	function setup( form ) {
		if ( form.vuloformReady ) {
			return;
		}

		var config;

		try {
			config = JSON.parse( form.getAttribute( 'data-vuloform' ) );
		} catch {
			return;
		}

		form.vuloformReady = true;

		function requestOptions( extra ) {
			var options = config.restNonce
				? { credentials: 'same-origin', headers: { 'X-WP-Nonce': config.restNonce } }
				: { credentials: 'omit' };

			Object.keys( extra || {} ).forEach( function ( key ) {
				options[ key ] = extra[ key ];
			} );

			return options;
		}

		var wrap = form.parentNode;
		var pages = form.querySelectorAll( '.vuloform-page' );
		var messageBox = form.querySelector( '.vuloform-message' );
		var prevButton = form.querySelector( '.vuloform-prev' );
		var nextButton = form.querySelector( '.vuloform-next' );
		var submitButton = form.querySelector( '.vuloform-submit' );
		var progress = form.querySelector( '.vuloform-progress' );
		var tokenInput = form.querySelector( 'input[name="vf_token"]' );
		var pageInput = form.querySelector( 'input[name="vf_page"]' );
		var current = 0;
		var fields = {};
		var tokenFetched = false;
		var captcha = config.preview ? null : config.recaptcha;
		var captchaBox = form.querySelector( '.vuloform-recaptcha' );
		var captchaWidget = null;
		var CAPTCHA_STOP = {};

		config.fields.forEach( function ( field ) {
			fields[ field.key ] = field;

			if ( field.type === 'signature' ) {
				setupSignaturePad( field );
			}

			if ( field.type === 'repeater' ) {
				setupRepeater( field );
			}
		} );

		if ( pageInput ) {
			pageInput.value = window.location.href;
		}

		function wrapper( field ) {
			return form.querySelector( '[data-field="' + field.id + '"]' );
		}

		function controls( field ) {
			var el = wrapper( field );

			return el ? el.querySelectorAll( 'input, select, textarea' ) : [];
		}

		/**
		 * Replaces a signature field's plain file input (the no-JavaScript fallback: upload a PNG)
		 * with a drawable canvas. The drawing is written back into that same, now-hidden, input via
		 * the DataTransfer API, so it submits - and validates - exactly like a 'file' field; nothing
		 * else in this script or on the server needs to know the image was drawn rather than chosen.
		 */
		function setupSignaturePad( field ) {
			var input = wrapper( field ) ? wrapper( field ).querySelector( 'input[type="file"]' ) : null;

			if ( ! input || ! window.HTMLCanvasElement || typeof window.DataTransfer !== 'function' ) {
				// No JavaScript support for any of this: the plain file input stays, as drawn by the server.
				return;
			}

			var canvas = document.createElement( 'canvas' );
			var clear = document.createElement( 'button' );
			var ctx = canvas.getContext( '2d' );
			var drawing = false;

			canvas.className = 'vuloform-signature-pad';
			canvas.width = 500;
			canvas.height = 160;
			canvas.tabIndex = 0;
			canvas.setAttribute( 'role', 'img' );
			canvas.setAttribute( 'aria-label', field.label || '' );

			clear.type = 'button';
			clear.className = 'vuloform-button vuloform-button--secondary vuloform-signature-clear';
			clear.textContent = config.messages.signatureClear;

			input.hidden = true;
			input.insertAdjacentElement( 'beforebegin', canvas );
			input.insertAdjacentElement( 'beforebegin', clear );

			function point( event ) {
				var rect = canvas.getBoundingClientRect();
				var source = event.touches && event.touches.length ? event.touches[ 0 ] : event;

				return {
					x: ( source.clientX - rect.left ) * ( canvas.width / rect.width ),
					y: ( source.clientY - rect.top ) * ( canvas.height / rect.height ),
				};
			}

			function start( event ) {
				drawing = true;
				var p = point( event );
				ctx.beginPath();
				ctx.moveTo( p.x, p.y );
				event.preventDefault();
			}

			function move( event ) {
				if ( ! drawing ) {
					return;
				}

				var p = point( event );
				ctx.lineWidth = 2;
				ctx.lineCap = 'round';
				ctx.strokeStyle = '#111827';
				ctx.lineTo( p.x, p.y );
				ctx.stroke();
				event.preventDefault();
			}

			function finish() {
				if ( ! drawing ) {
					return;
				}

				drawing = false;

				canvas.toBlob( function ( blob ) {
					if ( ! blob ) {
						return;
					}

					var list = new window.DataTransfer();

					list.items.add( new File( [ blob ], 'signature.png', { type: 'image/png' } ) );
					input.files = list.files;
					input.dispatchEvent( new Event( 'change', { bubbles: true } ) );
				}, 'image/png' );
			}

			canvas.addEventListener( 'pointerdown', start );
			canvas.addEventListener( 'pointermove', move );
			canvas.addEventListener( 'touchstart', start, { passive: false } );
			canvas.addEventListener( 'touchmove', move, { passive: false } );
			window.addEventListener( 'pointerup', finish );
			window.addEventListener( 'touchend', finish );

			clear.addEventListener( 'click', function () {
				ctx.clearRect( 0, 0, canvas.width, canvas.height );
				input.value = '';
				input.dispatchEvent( new Event( 'change', { bubbles: true } ) );
			} );
		}

		/**
		 * Wires a repeater's "Add row"/"Remove row" buttons. The server renders `min_rows` (or one)
		 * static row(s); adding a row clones the last one and re-indexes its name/id attributes
		 * (`vf[key][N][subkey]`, `id__N__subid`) to the next index, clearing its values first.
		 */
		function setupRepeater( field ) {
			var el = wrapper( field );
			var container = el ? el.querySelector( '.vuloform-repeater' ) : null;

			if ( ! container ) {
				return;
			}

			var minRows = parseInt( container.getAttribute( 'data-min-rows' ), 10 ) || 0;
			var maxRows = parseInt( container.getAttribute( 'data-max-rows' ), 10 ) || 10;

			function rows() {
				return container.querySelectorAll( '.vuloform-repeater-row' );
			}

			function reindex( row, index ) {
				row.setAttribute( 'data-row', String( index ) );

				each( row.querySelectorAll( '[name]' ), function ( node ) {
					node.setAttribute( 'name', node.getAttribute( 'name' ).replace( /\[\d+\]/, '[' + index + ']' ) );
				} );

				each( row.querySelectorAll( '[id]' ), function ( node ) {
					node.id = node.id.replace( /__\d+__/, '__' + index + '__' );
				} );

				each( row.querySelectorAll( '[for]' ), function ( node ) {
					node.setAttribute( 'for', node.getAttribute( 'for' ).replace( /__\d+__/, '__' + index + '__' ) );
				} );

				each( row.querySelectorAll( '[aria-describedby]' ), function ( node ) {
					node.setAttribute( 'aria-describedby', node.getAttribute( 'aria-describedby' ).replace( /__\d+__/g, '__' + index + '__' ) );
				} );
			}

			function clearValues( row ) {
				each( row.querySelectorAll( 'input' ), function ( node ) {
					node.value = '';
					node.checked = false;
				} );
				each( row.querySelectorAll( 'textarea' ), function ( node ) {
					node.value = '';
				} );
				each( row.querySelectorAll( 'select' ), function ( node ) {
					node.selectedIndex = 0;
				} );
			}

			function updateButtons() {
				var count = rows().length;
				var addButton = container.querySelector( '.vuloform-repeater-add' );

				if ( addButton ) {
					addButton.hidden = count >= maxRows;
				}

				each( rows(), function ( row ) {
					var removeButton = row.querySelector( '.vuloform-repeater-remove' );

					if ( removeButton ) {
						removeButton.hidden = count <= minRows;
					}
				} );

				container.setAttribute( 'data-row-count', String( count ) );
			}

			container.addEventListener( 'click', function ( event ) {
				var addButton = event.target.closest ? event.target.closest( '.vuloform-repeater-add' ) : null;
				var removeButton = event.target.closest ? event.target.closest( '.vuloform-repeater-remove' ) : null;

				if ( addButton ) {
					event.preventDefault();

					var current = rows();

					if ( current.length >= maxRows ) {
						return;
					}

					var clone = current[ current.length - 1 ].cloneNode( true );

					reindex( clone, current.length );
					clearValues( clone );
					addButton.parentNode.insertBefore( clone, addButton );
					updateButtons();
				} else if ( removeButton ) {
					event.preventDefault();

					var row = removeButton.closest( '.vuloform-repeater-row' );

					if ( row && rows().length > minRows ) {
						row.parentNode.removeChild( row );
						each( rows(), reindex );
						updateButtons();
					}
				}
			} );

			updateButtons();
		}

		/** The current value of a field, in the shape the server stores. */
		function getValue( key ) {
			var field = fields[ key ];

			if ( ! field ) {
				return '';
			}

			var el = wrapper( field );

			if ( ! el ) {
				// A hidden-type field has no wrapper.
				var hidden = form.querySelector( 'input[type="hidden"][name="vf[' + key + ']"]' );

				return hidden ? hidden.value : '';
			}

			// A field hidden by a condition counts as empty everywhere.
			if ( el.hidden ) {
				return field.type === 'checkboxes' ? [] : '';
			}

			if ( field.type === 'checkboxes' ) {
				var values = [];

				each( el.querySelectorAll( 'input:checked' ), function ( box ) {
					values.push( box.value );
				} );

				return values;
			}

			if ( field.type === 'radio' ) {
				var picked = el.querySelector( 'input:checked' );

				return picked ? picked.value : '';
			}

			if ( field.type === 'consent' ) {
				var box = el.querySelector( 'input' );

				return box && box.checked ? '1' : '';
			}

			if ( field.type === 'name' || field.type === 'address' ) {
				var parts = [];

				each( el.querySelectorAll( 'input' ), function ( input ) {
					parts.push( input.value.trim() );
				} );

				return parts;
			}

			if ( field.type === 'calculation' ) {
				return el.getAttribute( 'data-value' ) || '';
			}

			if ( field.type === 'file' || field.type === 'signature' ) {
				var input = el.querySelector( 'input' );

				return input && input.files ? Array.prototype.slice.call( input.files ) : [];
			}

			var control = el.querySelector( 'input, select, textarea' );

			return control ? control.value.trim() : '';
		}

		function flat( value ) {
			var list = Array.isArray( value ) ? value : [ value ];

			return list
				.map( function ( item ) {
					return typeof item === 'string' ? item.trim() : '';
				} )
				.filter( function ( item ) {
					return item !== '';
				} );
		}

		function ruleMatches( rule ) {
			var actual = flat( getValue( rule.field ) ).map( function ( item ) {
				return item.toLowerCase();
			} );
			var expected = String( rule.value || '' ).trim().toLowerCase();
			var joined = actual.join( ' ' );

			switch ( rule.operator ) {
				case 'is_not':
					return actual.indexOf( expected ) < 0;
				case 'contains':
					return expected !== '' && joined.indexOf( expected ) >= 0;
				case 'not_contains':
					return expected === '' || joined.indexOf( expected ) < 0;
				case 'empty':
					return joined === '';
				case 'not_empty':
					return joined !== '';
				case 'gt':
					return joined !== '' && expected !== '' && ! isNaN( joined ) && ! isNaN( expected ) && parseFloat( joined ) > parseFloat( expected );
				case 'lt':
					return joined !== '' && expected !== '' && ! isNaN( joined ) && ! isNaN( expected ) && parseFloat( joined ) < parseFloat( expected );
				default:
					return actual.indexOf( expected ) >= 0;
			}
		}

		function matches( conditions ) {
			var any = conditions.match === 'any';

			for ( var r = 0; r < conditions.rules.length; r++ ) {
				var ok = ruleMatches( conditions.rules[ r ] );

				if ( any && ok ) {
					return true;
				}

				if ( ! any && ! ok ) {
					return false;
				}
			}

			return ! any;
		}

		function hasRules( field ) {
			return field.conditions && field.conditions.enabled && field.conditions.rules && field.conditions.rules.length;
		}

		function isRequired( field ) {
			if ( hasRules( field ) && field.conditions.action === 'require' ) {
				return matches( field.conditions );
			}

			return !! field.required;
		}

		/** Shows or hides conditional fields. A hidden field's controls are disabled, so they are not sent. */
		function applyConditions() {
			// Twice, so a field that depends on another conditional field settles.
			for ( var pass = 0; pass < 2; pass++ ) {
				config.fields.forEach( function ( field ) {
					var el = wrapper( field );

					if ( ! el || ! hasRules( field ) || field.conditions.action === 'require' ) {
						return;
					}

					var matched = matches( field.conditions );
					var visible = field.conditions.action === 'hide' ? ! matched : matched;

					el.hidden = ! visible;

					each( controls( field ), function ( control ) {
						control.disabled = ! visible;
					} );
				} );
			}

			config.fields.forEach( function ( field ) {
				var el = wrapper( field );

				if ( ! el || field.type !== 'calculation' ) {
					return;
				}

				var total = calculate( field.formula || '', getValue );
				var text = total === null ? '' : total.toFixed( field.decimals || 0 );

				el.setAttribute( 'data-value', text );
				el.querySelector( '.vuloform-calc' ).textContent = ( field.prefix || '' ) + ( text === '' ? '0' : text );
			} );
		}

		function setError( field, message ) {
			var el = wrapper( field );

			if ( ! el ) {
				return;
			}

			var box = el.querySelector( '.vuloform-error' );

			el.classList.toggle( 'vuloform-field--invalid', !! message );

			if ( box ) {
				box.textContent = message || '';
				box.hidden = ! message;
			}

			each( controls( field ), function ( control ) {
				if ( message ) {
					control.setAttribute( 'aria-invalid', 'true' );
				} else {
					control.removeAttribute( 'aria-invalid' );
				}
			} );
		}

		function validate( field ) {
			var el = wrapper( field );
			var messages = config.messages;

			if ( ! el || el.hidden ) {
				return '';
			}

			var value = getValue( field.key );
			var empty = flat( value ).length === 0;

			if ( field.type === 'file' || field.type === 'signature' ) {
				empty = value.length === 0;
			} else if ( field.type === 'name' || field.type === 'address' ) {
				empty = ! value[ 0 ];
			} else if ( field.type === 'calculation' ) {
				return '';
			}

			if ( empty ) {
				return isRequired( field ) ? messages.required : '';
			}

			if ( field.type === 'email' && ! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test( value ) ) {
				return messages.email;
			}

			if ( field.type === 'url' && ! /^https?:\/\/[^\s.]+\.[^\s]+$/i.test( value ) ) {
				return messages.url;
			}

			if ( field.type === 'number' ) {
				if ( isNaN( value ) ) {
					return messages.number;
				}

				if ( ( field.min !== '' && field.min !== undefined && parseFloat( value ) < parseFloat( field.min ) ) || ( field.max !== '' && field.max !== undefined && parseFloat( value ) > parseFloat( field.max ) ) ) {
					return messages.invalid;
				}
			}

			if ( ( field.type === 'text' || field.type === 'textarea' || field.type === 'password' ) && ( ( field.minlength && value.length < field.minlength ) || ( field.maxlength && value.length > field.maxlength ) ) ) {
				return messages.invalid;
			}

			if ( field.type === 'file' || field.type === 'signature' ) {
				if ( value.length > ( field.max_files || 1 ) ) {
					return messages.file;
				}

				for ( var f = 0; f < value.length; f++ ) {
					var extension = value[ f ].name.split( '.' ).pop().toLowerCase();

					if ( value[ f ].size > field.max_size_mb * 1048576 || ( field.allowed_types || [] ).indexOf( extension ) < 0 ) {
						return messages.file;
					}
				}
			}

			return '';
		}

		/** Validates the fields on one page, or on every page. Returns the first invalid field. */
		function validatePage( index ) {
			var first = null;

			config.fields.forEach( function ( field ) {
				var el = wrapper( field );

				if ( ! el || ( index !== null && ! pages[ index ].contains( el ) ) ) {
					return;
				}

				var message = validate( field );

				setError( field, message );

				if ( message && ! first ) {
					first = field;
				}
			} );

			return first;
		}

		function focusField( field ) {
			var el = wrapper( field );
			var control = el && el.querySelector( 'input:not([type="hidden"]), select, textarea' );

			if ( control ) {
				control.focus();
			}
		}

		function showMessage( text, type ) {
			messageBox.textContent = text || '';
			messageBox.hidden = ! text;
			messageBox.className = 'vuloform-message' + ( text ? ' vuloform-message--' + type : '' );
		}

		/* ---------- Steps ---------- */

		function showPage( index, moveFocus ) {
			current = index;

			each( pages, function ( page, i ) {
				page.hidden = i !== index;
			} );

			var last = index === pages.length - 1;

			prevButton.hidden = index === 0;
			nextButton.hidden = last;
			submitButton.hidden = ! last;

			if ( progress ) {
				var label = config.messages.step.replace( '%1$s', index + 1 ).replace( '%2$s', pages.length );
				var bar = progress.querySelector( '.vuloform-progress-bar' );

				progress.hidden = false;
				progress.querySelector( '.vuloform-progress-label' ).textContent = label;

				if ( bar ) {
					bar.setAttribute( 'aria-valuenow', index + 1 );
					bar.firstChild.style.width = ( ( index + 1 ) / pages.length ) * 100 + '%';
				}

				each( progress.querySelectorAll( '.vuloform-progress-steps li' ), function ( step, i ) {
					step.className = i < index ? 'is-done' : i === index ? 'is-current' : '';
				} );
			}

			if ( moveFocus ) {
				// Move to the top of the new step, so keyboard and screen reader users start there.
				var target = pages[ index ].querySelector( 'input:not([type="hidden"]), select, textarea, h2, h3, h4' );

				wrap.scrollIntoView( { block: 'start', behavior: 'smooth' } );

				if ( target && target.focus ) {
					target.focus( { preventScroll: true } );
				}
			}
		}

		if ( pages.length > 1 ) {
			showPage( 0, false );

			nextButton.addEventListener( 'click', function () {
				var invalid = validatePage( current );

				if ( invalid ) {
					focusField( invalid );
					return;
				}

				showMessage( '', '' );
				showPage( current + 1, true );
			} );

			prevButton.addEventListener( 'click', function () {
				showMessage( '', '' );
				showPage( current - 1, true );
			} );
		}

		/* ---------- Token ---------- */

		function fetchToken() {
			if ( tokenFetched || config.preview || ! window.fetch ) {
				return Promise.resolve();
			}

			tokenFetched = true;

			return fetch( config.token, requestOptions( { cache: 'no-store' } ) )
				.then( function ( response ) {
					return response.json();
				} )
				.then( function ( data ) {
					if ( data && data.token ) {
						tokenInput.value = data.token;
					}
				} )
				.catch( function () {
					// The token printed with the page is used instead.
				} );
		}

		// A page served from a cache carries an old token, stamped with the cache's generation time
		// rather than this visit. Refresh it now, as soon as the form is set up, not on the visitor's
		// first interaction: Spam::check() measures how long the token has existed to tell a human from
		// a bot, so starting that clock at first touch - rather than at page view - would shrink a
		// careful visitor's fill time down to the gap between their first click and Submit, and falsely
		// flag anyone who fills the form quickly or via autofill.
		fetchToken();

		/* ---------- Starting values from the page ---------- */

		// A default written as {query:utm_source}, {page:url} or {page:title} is filled in here, from
		// the visitor's own address bar and page. The server does this too when it draws the form,
		// but it cannot for a cached page or for a form shown on another website.
		function applyDynamicDefaults() {
			var params = null;

			try {
				params = new URLSearchParams( window.location.search );
			} catch {
				return;
			}

			Object.keys( config.dynamic || {} ).forEach( function ( key ) {
				var control = form.elements[ 'vf[' + key + ']' ];

				// Only a single box or dropdown has one starting value, and only while untouched.
				if ( ! control || control.length !== undefined && control.tagName !== 'SELECT' ) {
					return;
				}

				var value = config.dynamic[ key ].replace( /\{(query:[a-zA-Z0-9_-]+|page:url|page:title)\}/g, function ( tag, name ) {
					if ( name === 'page:url' ) {
						return window.location.href.split( '#' )[ 0 ];
					}

					if ( name === 'page:title' ) {
						return document.title;
					}

					return params.get( name.slice( 6 ) ) || '';
				} );

				if ( control.type === 'hidden' || control.value === control.defaultValue ) {
					control.value = value;
				}
			} );
		}

		if ( ! config.preview ) {
			applyDynamicDefaults();
		}

		/* ---------- reCAPTCHA ---------- */

		if ( captcha && captchaBox && captcha.type === 'v2' ) {
			// The checkbox has to be on show, so it is loaded with the form. Google's widget brings
			// its own response field, which replaces the placeholder printed with the page.
			loadRecaptcha( captcha )
				.then( function ( api ) {
					var placeholder = captchaBox.querySelector( 'input' );
					var target = document.createElement( 'div' );

					if ( placeholder ) {
						captchaBox.removeChild( placeholder );
					}

					captchaBox.appendChild( target );
					captchaWidget = api.render( target, { sitekey: captcha.sitekey } );
				} )
				.catch( function () {
					// Reported when the visitor tries to send.
				} );
		}

		// Resolves to whether the form may be sent.
		function passCaptcha() {
			if ( ! captcha || ! captchaBox ) {
				return Promise.resolve( true );
			}

			if ( captcha.type === 'v3' ) {
				// Invisible: a token is requested at the moment of sending. If Google can't be
				// reached the form is still sent, and the server decides.
				return loadRecaptcha( captcha )
					.then( function ( api ) {
						return new Promise( function ( resolve ) {
							api.ready( function () {
								api.execute( captcha.sitekey, { action: captcha.action } ).then(
									function ( token ) {
										captchaBox.querySelector( 'input' ).value = token;
										resolve( true );
									},
									function () {
										resolve( true );
									}
								);
							} );
						} );
					} )
					.catch( function () {
						return true;
					} );
			}

			if ( captchaWidget === null ) {
				showMessage( captcha.messages.unavailable, 'error' );
				return Promise.resolve( false );
			}

			if ( ! window.grecaptcha.getResponse( captchaWidget ) ) {
				showMessage( captcha.messages.missing, 'error' );
				return Promise.resolve( false );
			}

			return Promise.resolve( true );
		}

		/* ---------- Live updates ---------- */

		function onChange( event ) {
			applyConditions();

			var el = event.target.closest ? event.target.closest( '[data-field]' ) : null;

			if ( el && el.classList.contains( 'vuloform-field--invalid' ) ) {
				config.fields.forEach( function ( field ) {
					if ( field.id === el.getAttribute( 'data-field' ) ) {
						setError( field, validate( field ) );
					}
				} );
			}
		}

		form.addEventListener( 'input', onChange );
		form.addEventListener( 'change', onChange );
		applyConditions();

		/* ---------- Submit ---------- */

		form.addEventListener( 'submit', function ( event ) {
			if ( ! window.fetch || ! window.FormData ) {
				// An old browser: let the form post the ordinary way.
				return;
			}

			event.preventDefault();

			var invalid = validatePage( null );

			if ( invalid ) {
				showMessage( config.messages.error, 'error' );

				each( pages, function ( page, i ) {
					if ( pages.length > 1 && page.contains( wrapper( invalid ) ) ) {
						showPage( i, false );
					}
				} );

				focusField( invalid );
				return;
			}

			if ( config.preview ) {
				showMessage( config.messages.preview || 'Preview only.', 'success' );
				return;
			}

			var label = submitButton.textContent;

			submitButton.disabled = true;
			submitButton.textContent = config.messages.sending;
			showMessage( '', '' );

			passCaptcha()
				.then( function ( ready ) {
					if ( ! ready ) {
						throw CAPTCHA_STOP;
					}

					return fetchToken();
				} )
				.then( function () {
					return fetch( config.endpoint, requestOptions( { method: 'POST', body: new FormData( form ) } ) );
				} )
				.then( function ( response ) {
					return response.json();
				} )
				.then( function ( result ) {
					if ( result && result.success ) {
						if ( result.redirect ) {
							window.location.href = result.redirect;
							return;
						}

						// The form is replaced by the confirmation, which is announced to screen readers.
						var done = document.createElement( 'div' );

						done.className = 'vuloform-message vuloform-message--success';
						done.setAttribute( 'role', 'status' );
						done.setAttribute( 'tabindex', '-1' );
						done.innerHTML = result.message;
						wrap.replaceChild( done, form );
						done.focus();
						return;
					}

					var first = null;

					config.fields.forEach( function ( field ) {
						var message = result && result.errors ? result.errors[ field.id ] : '';

						setError( field, message || '' );

						if ( message && ! first ) {
							first = field;
						}
					} );

					showMessage( ( result && result.message ) || config.messages.network, 'error' );

					if ( first ) {
						each( pages, function ( page, i ) {
							if ( pages.length > 1 && page.contains( wrapper( first ) ) ) {
								showPage( i, false );
							}
						} );

						focusField( first );
					}

					// The token already in the field stays valid for a retry: it is not single-use, and
					// re-fetching here would only restart the fill-time clock the spam check just measured.

					// A reCAPTCHA answer can be checked only once, so the visitor ticks the box again.
					if ( captchaWidget !== null ) {
						window.grecaptcha.reset( captchaWidget );
					}
				} )
				.catch( function ( error ) {
					if ( error !== CAPTCHA_STOP ) {
						showMessage( config.messages.network, 'error' );
					}
				} )
				.then( function () {
					submitButton.disabled = false;
					submitButton.textContent = label;
				} );
		} );
	}

	function init( root ) {
		each( ( root || document ).querySelectorAll( 'form.vuloform' ), setup );
	}

	// Exposed so the embed script can start a form it has just inserted.
	window.vuloformInit = init;

	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', function () {
			init();
		} );
	} else {
		init();
	}
} )();
