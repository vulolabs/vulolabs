import { __ } from '@wordpress/i18n';
import { ClipboardComponent, NoticeComponent, SettingsPanelComponent, SettingsSectionComponent, SettingsWideComponent } from '@zyra/components';
import { ButtonInput } from '@zyra/inputs';
import type { Form } from '../services/types';

/**
 * How to put the form in front of people: on this site, on another site, or moved to another
 * WordPress altogether.
 */
const Share = ({ form, exportJson }: { form: Form; exportJson: () => void }) => (
	<div className="vuloform-form-settings">
		{'published' !== form.status && (
			<NoticeComponent
				displayPosition="inline-notice"
				type="warning"
				message={__('This form is a draft, so visitors see nothing where you place it. Publish it first.', 'vuloform')}
			/>
		)}
		<SettingsPanelComponent>
			<SettingsSectionComponent
				icon="wordpress"
				title={__('On this site', 'vuloform')}
				desc={__('In the block editor, add the "VuloForm" block and choose this form. Anywhere else that accepts shortcodes, paste this one.', 'vuloform')}
			>
				<SettingsWideComponent>
					<ClipboardComponent variant="code" text={form.shortcode} copyButtonLabel={__('Copy', 'vuloform')} copiedLabel={__('Copied', 'vuloform')} />
				</SettingsWideComponent>
			</SettingsSectionComponent>
			<SettingsSectionComponent
				icon="link"
				title={__('On another website', 'vuloform')}
				desc={__('For a page that is not on this WordPress site. The form loads from here, and submissions arrive here.', 'vuloform')}
			>
				<SettingsWideComponent>
					<ClipboardComponent variant="code" text={form.embed} copyButtonLabel={__('Copy', 'vuloform')} copiedLabel={__('Copied', 'vuloform')} />
					<ol className="vuloform-steps">
						<li>{__('Copy the code.', 'vuloform')}</li>
						<li>{__('Paste it into the other page\'s HTML, where the form should appear.', 'vuloform')}</li>
						<li>{__('Keep this WordPress site online: it serves the form and receives the answers.', 'vuloform')}</li>
					</ol>
				</SettingsWideComponent>
			</SettingsSectionComponent>
			<SettingsSectionComponent
				icon="export"
				title={__('Copy to another WordPress site', 'vuloform')}
				desc={__('Download the form\'s fields and settings as a file, then choose New form → Import on the other site. Submissions are not included.', 'vuloform')}
			>
				<SettingsWideComponent>
					<ButtonInput buttons={{ text: __('Download form (.json)', 'vuloform'), icon: 'export', onClick: exportJson }} />
				</SettingsWideComponent>
			</SettingsSectionComponent>
		</SettingsPanelComponent>
	</div>
);

export default Share;
