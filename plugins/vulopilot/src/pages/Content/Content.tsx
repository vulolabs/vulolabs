import { __ } from '@wordpress/i18n';
import { ColumnComponent, ContainerComponent, NavigatorHeaderComponent } from '@zyra/components';
import RunScanHeaderExtra from '../../components/RunScanHeaderExtra';
import InsufficientCreditsNotice from '../../components/AiCredits/InsufficientCreditsNotice';
import ContentStatsCard from './ContentStatsCard';
import ContentAssistant from './ContentAssistant';
import { MoreToolsCard, QuickStartCard } from './ContentToolsGrid';
import RecentContentCard from './RecentContentCard';
import '../../dashboard-widgets/dashboard.scss';
import '../AIAssistant/copilot.scss';
import './CreateContent.scss';

/**
 * Content: the writing assistant beside what VuloPilot wrote for you and free's quick-start tools; then the rest of
 * the AI tools (VuloPilot Pro's Content Optimization, or a sample of it); then every page's content health.
 */
const Content = () => (
	<>
		<NavigatorHeaderComponent
			headerIcon="image"
			headerTitle={__('Content', 'vulopilot')}
			headerDescription={__('Write new content with AI and keep what you have readable, complete and easy to find.', 'vulopilot')}
			headerCustomContent={
				<RunScanHeaderExtra categories={['content']} label={__('Run content audit', 'vulopilot')} settingsSubtab="seo-content" />
			}
		/>
		<ContainerComponent general>
			<ColumnComponent>
				<div className="vp-page vp-content">
					<InsufficientCreditsNotice />
					<div className="vp-row is-side vp-content-top">
						<ContentAssistant />
						<aside className="vp-rail">
							<ContentStatsCard />
							<QuickStartCard />
						</aside>
					</div>
					<MoreToolsCard />
				</div>
			</ColumnComponent>
			<ColumnComponent>
				<RecentContentCard />
			</ColumnComponent>
		</ContainerComponent>
	</>
);

export default Content;
