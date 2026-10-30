/* global vuloformAppLocalizer */
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { __, _n, sprintf } from '@wordpress/i18n';
import { BadgeComponent, CardComponent, ContainerComponent, ModuleGuardComponent, PopupComponent } from '@zyra/components';
import { ButtonInput } from '@zyra/inputs';
import { apiGet, apiPost } from '../services/api';
import { errorMessage, notify } from '../services/notify';
import type { Field, Form, FormSettings as Settings } from '../services/types';
import Canvas from './Canvas';
import Inspector from './Inspector';
import { createField, lockOf, uniqueKey } from './fields';
import FormSettings, { lastSection, openSettingsGroup } from './FormSettings';
import Share from './Share';
import Switch from '../components/Switch';
import { builderHash, openBuilder, tabFromHash } from './route';
import type { BuilderTab } from './route';
import { duplicateField } from './fields';

interface Snapshot {
	title: string;
	fields: Field[];
	settings: Settings;
}

type Tab = BuilderTab;

const TABS: { id: Tab; label: string; icon: string }[] = [
	{ id: 'fields', label: __('Fields', 'vuloform'), icon: 'form' },
	{ id: 'settings', label: __('Settings', 'vuloform'), icon: 'setting' },
	{ id: 'share', label: __('Share', 'vuloform'), icon: 'link' },
];

const HISTORY_LIMIT = 60;

/**
 * A snapshot as text, to compare with what was saved. The drag-and-drop library marks the fields it
 * handles with `chosen` and `selected`; those are not part of the form.
 */
const fingerprint = (snapshot: unknown): string => JSON.stringify(snapshot, (key, value) => ('chosen' === key || 'selected' === key ? undefined : value));

/**
 * The form builder.
 *
 * One snapshot (title, fields, settings) is the source of truth; the palette, canvas, field
 * settings and form settings all read from it and report changes back here. Every change goes
 * through commit(), which is what makes undo, redo and the unsaved-changes warning work.
 */
const Builder = ({ formId }: { formId: number }) => {
	const [form, setForm] = useState<Form | null>(null);
	const [error, setError] = useState('');
	const [present, setPresent] = useState<Snapshot | null>(null);
	const [past, setPast] = useState<Snapshot[]>([]);
	const [future, setFuture] = useState<Snapshot[]>([]);
	const [selectedId, setSelectedId] = useState('');
	// The open tab is read from the URL (`&subtab=settings`), so it can be linked to and reloaded.
	const tab = tabFromHash(useLocation().hash);
	const setTab = (next: Tab) => openBuilder(next, 'settings' === next ? lastSection() : '');
	// What the server holds, to tell whether anything differs from it.
	const savedSnapshot = useRef('');
	// idle, saving, saved (shown for a moment) or error (the next attempt waits longer).
	const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
	const isSaving = 'saving' === saveState;
	// A draft is allowed to be unfinished; its problems are listed once publishing was tried.
	const [triedToPublish, setTriedToPublish] = useState(false);
	// The newest form and snapshot, for code that runs later than the render it was created in.
	const latest = useRef<{ form: Form | null; present: Snapshot | null }>({ form: null, present: null });
	const inFlight = useRef(false);
	const [problems, setProblems] = useState<NonNullable<Form['issues']>>([]);
	const [previewHtml, setPreviewHtml] = useState<string | null>(null);
	const lastCommit = useRef(0);
	// Undoing back to what was saved is not an unsaved change.
	const isDirty = null !== present && fingerprint(present) !== savedSnapshot.current;
	const previewRef = useRef<HTMLDivElement>(null);

	latest.current = { form, present };

	const adopt = (loaded: Form) => {
		setForm(loaded);
		const snapshot = { title: loaded.title, fields: loaded.schema.fields, settings: loaded.schema.settings };

		savedSnapshot.current = fingerprint(snapshot);
		setPresent(snapshot);
		setProblems(loaded.issues ?? (loaded.problems ?? []).map((message) => ({ message, field: '', group: '' })));
	};

	useEffect(() => {
		apiGet<Form>(`forms/${formId}`)
			.then(adopt)
			.catch((e) => setError(errorMessage(e)));
	}, [formId]);

	/**
	 * Sends the form to the server. Without a status it is an autosave: the form stays a draft or
	 * stays published, whatever it was. With one it publishes or unpublishes.
	 */
	const persist = (status?: Form['status']): Promise<Form | null> => {
		const { form: target, present: snapshot } = latest.current;

		if (!target || !snapshot) {
			return Promise.resolve(null);
		}

		const sent = fingerprint(snapshot);
		// A notification with nobody to send to, or a webhook with no address, is still being
		// written. It stays on screen and is saved once it is filled in.
		const settings = {
			...snapshot.settings,
			notifications: snapshot.settings.notifications.filter((item) => '' !== item.to.trim()),
			webhooks: snapshot.settings.webhooks.filter((item) => '' !== item.url.trim()),
		};
		const isWhole = settings.notifications.length === snapshot.settings.notifications.length && settings.webhooks.length === snapshot.settings.webhooks.length;

		inFlight.current = true;
		setSaveState('saving');

		return apiPost<Form>(`forms/${target.id}`, {
			title: snapshot.title,
			...(status ? { status } : {}),
			schema: { fields: snapshot.fields, settings },
		})
			.then((saved) => {
				const current = latest.current.present;

				if (isWhole && current && fingerprint(current) === sent) {
					// Nothing was changed while it was saving: the server's copy, with its final ids,
					// keys and cleaned values, becomes what is being edited.
					adopt(saved);
				} else {
					// Edited in the meantime, or something unfinished was left out. Keep what is on
					// screen; if it differs from what was sent, it is saved again in a moment.
					savedSnapshot.current = sent;
					setForm(saved);
					setProblems(saved.issues ?? []);
				}

				setSaveState('saved');

				return saved;
			})
			.catch((e) => {
				setSaveState('error');
				notify('error', errorMessage(e));

				return null;
			})
			.finally(() => {
				inFlight.current = false;
			});
	};

	// Autosave: a moment after the last change. After a failed attempt it waits longer.
	const print = present ? fingerprint(present) : '';

	useEffect(() => {
		if (!isDirty || inFlight.current) {
			return undefined;
		}

		const timer = window.setTimeout(() => persist(), 'error' === saveState ? 10000 : 1500);

		return () => window.clearTimeout(timer);
	}, [print, saveState]);

	// "Saved" is said for a moment, then gets out of the way.
	useEffect(() => {
		if ('saved' !== saveState) {
			return undefined;
		}

		const timer = window.setTimeout(() => setSaveState((state) => ('saved' === state ? 'idle' : state)), 2500);

		return () => window.clearTimeout(timer);
	}, [saveState]);

	useEffect(() => {
		// Closing the tab in the second before an autosave still asks.
		const warn = (event: BeforeUnloadEvent) => {
			const snapshot = latest.current.present;

			if (inFlight.current || (snapshot && fingerprint(snapshot) !== savedSnapshot.current)) {
				event.preventDefault();
				event.returnValue = '';
			}
		};

		window.addEventListener('beforeunload', warn);

		return () => {
			window.removeEventListener('beforeunload', warn);

			// Going to another VuloForm screen does not unload the page: save what is still pending.
			const snapshot = latest.current.present;

			if (snapshot && !inFlight.current && fingerprint(snapshot) !== savedSnapshot.current) {
				persist();
			}
		};
	}, []);

	// Start the public form script on the preview once its HTML is in the page.
	useEffect(() => {
		if (previewHtml && previewRef.current) {
			window.vuloformInit?.(previewRef.current);
		}
	}, [previewHtml]);

	if (error) {
		return (
			<ContainerComponent general>
				<CardComponent title={__('Form', 'vuloform')} titleIcon="error">
					<ModuleGuardComponent
						icon="error"
						title={__('Could not open this form', 'vuloform')}
						desc={error}
						buttonText={__('Back to forms', 'vuloform')}
						onButtonClick={() => {
							window.location.hash = '&tab=forms';
						}}
					/>
				</CardComponent>
			</ContainerComponent>
		);
	}

	if (!form || !present) {
		return (
			<ContainerComponent general>
				<CardComponent title={__('Form', 'vuloform')} titleIcon="form" isLoading />
			</ContainerComponent>
		);
	}

	const commit = (patch: Partial<Snapshot>) => {
		const now = Date.now();

		// Typing produces a change per keystroke; changes close together share one undo step.
		if (now - lastCommit.current > 700) {
			setPast((items) => [...items.slice(-HISTORY_LIMIT + 1), present]);
		}

		lastCommit.current = now;
		setFuture([]);
		setPresent({ ...present, ...patch });
	};

	const undo = () => {
		if (!past.length) {
			return;
		}

		setFuture((items) => [present, ...items]);
		setPresent(past[past.length - 1]);
		setPast((items) => items.slice(0, -1));
		lastCommit.current = 0;
	};

	const redo = () => {
		if (!future.length) {
			return;
		}

		setPast((items) => [...items, present]);
		setPresent(future[0]);
		setFuture((items) => items.slice(1));
		lastCommit.current = 0;
	};

	const publish = (status: Form['status']) => {
		if ('published' === status) {
			setTriedToPublish(true);
		}

		persist(status).then((saved) => {
			if (!saved) {
				return;
			}

			if (!saved.schema.fields.some((field) => field.id === selectedId)) {
				setSelectedId('');
			}

			if ('published' === status && 'published' !== saved.status) {
				notify('error', __('Not published yet. Fix what is listed above the form, then publish again.', 'vuloform'));
			} else {
				notify('success', 'published' === saved.status ? __('Form published.', 'vuloform') : __('Form unpublished. Visitors no longer see it.', 'vuloform'));
			}
		});
	};

	const preview = () => {
		apiPost<{ html: string }>('forms/preview', {
			title: present.title,
			schema: { fields: present.fields, settings: present.settings },
		})
			.then((result) => setPreviewHtml(result.html))
			.catch((e) => notify('error', errorMessage(e)));
	};

	const exportJson = () => {
		const blob = new Blob([JSON.stringify({ title: present.title, schema: { fields: present.fields, settings: present.settings } }, null, 2)], {
			type: 'application/json',
		});
		const link = document.createElement('a');

		link.href = URL.createObjectURL(blob);
		link.download = `${present.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'form'}.json`;
		link.click();
		URL.revokeObjectURL(link.href);
	};

	const selected = present.fields.find((field) => field.id === selectedId);

	return (
		<div className="vuloform-builder settings-wrapper tabs" data-template="default">
			{/* The same page header and tab strip as the other VuloLabs screens, drawn with zyra's own classes. */}
			<div className="title-section">
				<div className="title-wrapper">
					<div className="typography typography-title vuloform-builder-heading">
						<i className="adminfont-form title-icon" aria-hidden="true" />
						<input
							type="text"
							className="vuloform-builder-name"
							name="form-title"
							value={present.title}
							placeholder={__('Form name', 'vuloform')}
							aria-label={__('Form name', 'vuloform')}
							size={Math.max(8, present.title.length + 1)}
							onChange={(event) => commit({ title: event.target.value })}
						/>
						{'published' === form.status ? (
							<BadgeComponent color="green" text={__('Published', 'vuloform')} />
						) : (
							<BadgeComponent color="yellow" text={__('Draft', 'vuloform')} />
						)}
					</div>
					<div className="breadcrumbs">
						<span>
							<a href="#&tab=forms">{__('Forms', 'vuloform')}</a>
						</span>
						<span> / {present.title || __('Untitled form', 'vuloform')}</span>
						{/* Changes save by themselves; this says where that stands, and nothing when there is nothing to say. */}
						<span className={`vuloform-builder-dirty is-${saveState}`} aria-live="polite">
							{(() => {
								if (isSaving) {
									return __('Saving…', 'vuloform');
								}

								if ('error' === saveState) {
									return __('Could not save. Trying again shortly.', 'vuloform');
								}

								if (isDirty) {
									return __('Unsaved changes', 'vuloform');
								}

								return 'saved' === saveState ? __('Saved', 'vuloform') : '';
							})()}
						</span>
					</div>
				</div>
				<div className="title-custom-section vuloform-builder-actions">
					<div className="vuloform-builder-history">
						<button type="button" className="vuloform-icon-button" disabled={!past.length} onClick={undo} aria-label={__('Undo', 'vuloform')} title={__('Undo', 'vuloform')}>
							<i className="adminfont-undo" aria-hidden="true" />
						</button>
						<button type="button" className="vuloform-icon-button" disabled={!future.length} onClick={redo} aria-label={__('Redo', 'vuloform')} title={__('Redo', 'vuloform')}>
							<i className="adminfont-undo is-mirrored" aria-hidden="true" />
						</button>
					</div>
					<ButtonInput
						buttons={[
							{ text: __('Preview', 'vuloform'), icon: 'eye', color: 'purple', onClick: preview },
							'published' === form.status
								? { text: __('Unpublish', 'vuloform'), color: 'purple', disabled: isSaving, onClick: () => publish('draft') }
								: { text: __('Publish', 'vuloform'), icon: 'check', disabled: isSaving, onClick: () => publish('published') },
						]}
					/>
				</div>
			</div>

			<div className="tabs-wrapper settings-tab">
				<div className="tabs-item" role="tablist">
					{TABS.map((item) => (
						<a
							href={`#${builderHash(item.id, 'settings' === item.id ? lastSection() : '')}`}
							role="tab"
							key={item.id}
							aria-selected={tab === item.id}
							className={`tab ${tab === item.id ? 'active-tab' : ''}`}
							onClick={(event) => {
								event.preventDefault();
								setTab(item.id);
							}}
						>
							<div className="tab-name">
								<i className={`adminfont-${item.icon}`} aria-hidden="true" />
								{item.label}
							</div>
						</a>
					))}
				</div>
			</div>

			{problems.length > 0 && (triedToPublish || 'published' === form.status) && (
				<div className="vuloform-builder-problems">
					<div className="vuloform-problems" role="alert">
						<i className="adminfont-error" aria-hidden="true" />
						<div>
							<strong>
								{'published' === form.status
									? sprintf(
											/* translators: %d: number of problems. */
											_n('%d thing to fix in this form, which is live', '%d things to fix in this form, which is live', problems.length, 'vuloform'),
											problems.length
									  )
									: sprintf(
											/* translators: %d: number of problems. */
											_n('%d thing to fix before this form can be published', '%d things to fix before this form can be published', problems.length, 'vuloform'),
											problems.length
									  )}
							</strong>
							<ul>
								{problems.map((problem, index) => {
									const field = present.fields.find((item) => item.id === problem.field);

									return (
										<li key={index}>
											<span>{problem.message}</span>
											{field && (
												<button
													type="button"
													className="vuloform-link"
													onClick={() => {
														setTab('fields');
														setSelectedId(field.id);
													}}
												>
													{__('Show the field', 'vuloform')}
												</button>
											)}
											{'' !== problem.group && (
												<button
													type="button"
													className="vuloform-link"
													onClick={() => {
														openSettingsGroup(problem.group);
													}}
												>
													{__('Open that setting', 'vuloform')}
												</button>
											)}
										</li>
									);
								})}
							</ul>
							<span className="vuloform-problems-note">{__('Your changes are saved as you make them, and this list updates as each one is fixed.', 'vuloform')}</span>
						</div>
					</div>
				</div>
			)}

			{'fields' === tab && (
				<div className="vuloform-builder-panes">
					<Canvas
						template={present.settings.template}
						fields={present.fields}
						selectedId={selectedId}
						onSelect={setSelectedId}
						onChange={(fields, selectId) => {
							commit({ fields });

							if (selectId) {
								setSelectedId(selectId);
							}
						}}
						onDuplicate={(id) => {
							const index = present.fields.findIndex((field) => field.id === id);
							const copy = duplicateField(present.fields[index], present.fields);
							const fields = [...present.fields];

							fields.splice(index + 1, 0, copy);
							commit({ fields });
							setSelectedId(copy.id);
						}}
						onDelete={(id) => {
							const removed = present.fields.find((field) => field.id === id);

							// A field the template needs (such as the store name) can't be removed.
							if (removed && false === lockOf(present.settings.template, removed).delete) {
								return;
							}

							// Rules that looked at the deleted field go with it; undo brings both back.
							commit({
								fields: present.fields
									.filter((field) => field.id !== id)
									.map((field) => ({
										...field,
										conditions: { ...field.conditions, rules: field.conditions.rules.filter((rule) => rule.field !== removed?.key) },
									})),
							});

							if (selectedId === id) {
								setSelectedId('');
							}

							notify('info', __('Field removed. Use Undo to bring it back.', 'vuloform'));
						}}
						footer={
							<div className="vuloform-canvas-guard">
								<Switch
									name="recaptcha"
									label={__('Google reCAPTCHA', 'vuloform')}
									desc={__('An extra spam check before the form is sent. It loads a Google script for everyone who opens this form.', 'vuloform')}
									checked={Boolean(present.settings.spam.recaptcha)}
									onChange={(recaptcha) => commit({ settings: { ...present.settings, spam: { ...present.settings.spam, recaptcha } } })}
								/>
								{present.settings.spam.recaptcha && !vuloformAppLocalizer.recaptcha_ready && (
									<p className="vuloform-note">
										{__('reCAPTCHA is not set up yet, so this form is sent without the check.', 'vuloform')}{' '}
										<a href="#&tab=settings&subtab=spam">{__('Add the keys in Settings', 'vuloform')}</a>
									</p>
								)}
								{!present.settings.spam.recaptcha && (
									<p className="vuloform-control-desc">
										{__('The hidden trap field, the minimum fill time and the submission limit protect every form.', 'vuloform')}{' '}
										<a href="#&tab=settings&subtab=spam">{__('Spam protection settings', 'vuloform')}</a>
									</p>
								)}
							</div>
						}
					/>
					<Inspector
						template={present.settings.template}
						field={selected}
						fields={present.fields}
						onChange={(changed) => commit({ fields: present.fields.map((field) => (field.id === changed.id ? changed : field)) })}
						onAddField={(type, label, key, patch) => {
							// One step, so a single Undo takes back both the new field and its use.
							const index = Math.max(0, present.fields.findIndex((field) => field.id === selectedId));
							const added = { ...createField(type, present.fields), label, key: uniqueKey(key, present.fields) };
							const fields = present.fields.map((field) => (field.id === selectedId ? { ...field, ...patch } : field));

							commit({ fields: [...fields.slice(0, index), added, ...fields.slice(index)] });
						}}
					/>
				</div>
			)}

			{'settings' === tab && (
				<ContainerComponent general>
					<FormSettings
						settings={present.settings}
						fields={present.fields}
						onChange={(settings) => commit({ settings })}
						onChangeWithEmailField={(settings) => {
							const email = { ...createField('email', present.fields), required: true };

							commit({ fields: [...present.fields, email], settings: settings(email.key) });
						}}
					/>
				</ContainerComponent>
			)}

			{'share' === tab && (
				<ContainerComponent general>
					<Share form={form} exportJson={exportJson} />
				</ContainerComponent>
			)}

			<PopupComponent
				open={null !== previewHtml}
				onClose={() => setPreviewHtml(null)}
				width={46}
				height="auto"
				position="lightbox"
				header={{ icon: 'eye', title: __('Preview', 'vuloform'), description: __('Try the form. Nothing you enter here is sent or saved.', 'vuloform') }}
			>
				{/* Rendered by the server from the sanitized schema, the same markup visitors get. */}
				<div className="vuloform-preview" ref={previewRef} dangerouslySetInnerHTML={{ __html: previewHtml ?? '' }} />
			</PopupComponent>
		</div>
	);
};

export default Builder;
