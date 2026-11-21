/* global vulopilotAppLocalizer */
import React, { useEffect, useRef, useState } from 'react';
import { __, sprintf } from '@wordpress/i18n';
import { PopupComponent } from '@zyra/components';
import { getApiLink, getApiResponse } from '@zyra/core';
import { Skeleton } from '../../components/ui';
import { useApiList } from '../../services/useApiList';
import { ChatMarkdown } from '../../components/ChatMarkdown';
import { ChatMessage } from '../../components/ChatComposerCard';

/** One row of GET /copilot/conversations (Copilot.php). */
interface RecentConversationRow {
	id: number;
	title: string;
	updated_at: string;
}

/** One turn of `GET /copilot/conversations/{id}`. */
interface ConversationPreviewTurn {
	role: 'user' | 'assistant';
	content: string;
}

interface ConversationPreview {
	id: number;
	title: string;
	turns: ConversationPreviewTurn[];
}

/** "just now", "5m ago", "3h ago", "2d ago". */
const timeAgo = (dateString: string): string => {
	const seconds = Math.max(0, Math.floor((Date.now() - new Date(dateString).getTime()) / 1000));

	if (seconds < 60) {
		return __('just now', 'vulopilot');
	}

	const minutes = Math.floor(seconds / 60);

	if (minutes < 60) {
		/* translators: %d: minutes. */
		return sprintf(__('%dm ago', 'vulopilot'), minutes);
	}

	const hours = Math.floor(minutes / 60);

	if (hours < 24) {
		/* translators: %d: hours. */
		return sprintf(__('%dh ago', 'vulopilot'), hours);
	}

	/* translators: %d: days. */
	return sprintf(__('%dd ago', 'vulopilot'), Math.floor(hours / 24));
};

/**
 * "Recent chats": the five most recently updated conversations. A row reopens it in the chat; the eye previews it
 * without leaving the current one. Refetches whenever `refreshToken` changes (after each reply).
 */
const RecentConversationsCard: React.FC<{
	activeId: number | null;
	refreshToken: number;
	// eslint-disable-next-line no-unused-vars -- parameter name in a type signature.
	onSelectConversation: (id: number) => void;
}> = ({ activeId, refreshToken, onSelectConversation }) => {
	const { data, isLoading, error, refetch } = useApiList<RecentConversationRow>('copilot/conversations', { per_page: 5 });
	const [preview, setPreview] = useState<ConversationPreview | null>(null);
	const [isLoadingPreview, setIsLoadingPreview] = useState(false);
	const isFirstRender = useRef(true);

	useEffect(() => {
		if (isFirstRender.current) {
			isFirstRender.current = false;
			return;
		}

		refetch({ silent: true });
	}, [refreshToken]);

	const openPreview = (row: RecentConversationRow) => {
		setPreview({ id: row.id, title: row.title, turns: [] });
		setIsLoadingPreview(true);

		getApiResponse<ConversationPreview>(getApiLink(vulopilotAppLocalizer, `copilot/conversations/${row.id}`), {
			headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce },
		})
			.then((response) => {
				if (response) {
					setPreview(response);
				}
			})
			.finally(() => setIsLoadingPreview(false));
	};

	return (
		<section className="vp-card vp-rail-card">
			<header className="vp-rail-head">
				<div>
					<h3>{__('Recent chats', 'vulopilot')}</h3>
					<p>{__('Pick up where you left off.', 'vulopilot')}</p>
				</div>
				<a className="vp-card-link" href="?page=vulopilot#&tab=reports&subtab=history">
					{__('History', 'vulopilot')}
					<i className="adminfont-arrow-right" aria-hidden="true" />
				</a>
			</header>

			{isLoading && <Skeleton />}
			{!isLoading && error && <p className="vp-rail-note is-bad">{error}</p>}
			{!isLoading && !error && 0 === data.length && (
				<p className="vp-rail-note">{__('Your conversations show up here, so you can come back to them.', 'vulopilot')}</p>
			)}

			{data.length > 0 && (
				<ul className="vp-list vp-chats">
					{data.map((row) => (
						<li key={row.id} className={activeId === row.id ? 'is-active' : ''}>
							<button
								type="button"
								className="vp-list-main"
								onClick={() => onSelectConversation(row.id)}
								aria-current={activeId === row.id ? 'true' : undefined}
							>
								<strong>{row.title}</strong>
								<span>{activeId === row.id ? __('Open now', 'vulopilot') : timeAgo(row.updated_at)}</span>
							</button>
							<button
								type="button"
								className="vp-icon-btn"
								onClick={() => openPreview(row)}
								aria-label={sprintf(
									/* translators: %s: conversation title. */
									__('Preview "%s"', 'vulopilot'),
									row.title
								)}
							>
								<i className="adminfont-eye" aria-hidden="true" />
							</button>
						</li>
					))}
				</ul>
			)}

			<PopupComponent
				open={null !== preview}
				onClose={() => setPreview(null)}
				width={31.25}
				height="auto"
				position="lightbox"
			>
				{preview && (
					<div className="recent-conversation-preview vp-chat-preview">
						<div className="recent-conversation-preview-title">{preview.title}</div>
						{isLoadingPreview && 0 === preview.turns.length ? (
							<p>{__('Loading…', 'vulopilot')}</p>
						) : (
							preview.turns.map((turn, index) => (
								<ChatMessage
									key={index}
									sender={'user' === turn.role ? 'user' : 'ai'}
									avatarIcon={'user' === turn.role ? undefined : 'ai'}
								>
									<ChatMarkdown text={turn.content} />
								</ChatMessage>
							))
						)}
					</div>
				)}
			</PopupComponent>
		</section>
	);
};

export default RecentConversationsCard;
