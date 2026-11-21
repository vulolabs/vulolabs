import { applyFilters } from '@wordpress/hooks';

/** The former `tools` context (`components/StatusAndTools/`) is gone. */
const contexts: Record<string, any> = {
	settings: require.context('../components/Settings', true, /\.ts$/),
};

type SettingNode = {
	name: string;
	type: 'folder' | 'file';
	content: SettingNode[] | any;
	folderPriority?: number;
	/** A folder's menu icon (zyra's settings menu reads `headerIcon`, the same key a tab file uses). */
	headerIcon?: string;
};

const importAll = (
	inpContext: ReturnType<typeof require.context>
): SettingNode[] => {
	const folderStructure: SettingNode[] = [];
	const folderPriorityMap: Record<string, number> = {};
	const folderIconMap: Record<string, string> = {};

	inpContext.keys().forEach((key) => {
		if (key.endsWith('FolderPriority.ts')) {
			const folderPath = key
				.replace('./', '')
				.replace('/FolderPriority.ts', '');
			const priorityData = inpContext(key)?.default;
			if (priorityData && typeof priorityData.priority === 'number') {
				folderPriorityMap[folderPath] = priorityData.priority;
			}
			if (priorityData && typeof priorityData.headerIcon === 'string') {
				folderIconMap[folderPath] = priorityData.headerIcon;
			}
		}
	});

	const formatFolderName = (name: string): string => {
		return name
			.replace(/[_-]/g, ' ')
			.replace(/([a-z])([A-Z])/g, '$1 $2')
			.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
			.replace(/\s+/g, ' ')
			.trim();
	};

	inpContext.keys().forEach((key) => {
		const path = key.substring(2);
		const parts = path.split('/');
		const fileName = parts.pop();
		let currentFolder = folderStructure;
		let fullPath = '';

		parts.forEach((folder) => {
			fullPath = fullPath ? `${fullPath}/${folder}` : folder;

			const formattedFolderName = formatFolderName(folder);

			let folderObject = currentFolder.find(
				(item) =>
					item.name === formattedFolderName && item.type === 'folder'
			) as SettingNode | undefined;

			if (!folderObject) {
				folderObject = {
					name: formattedFolderName,
					type: 'folder',
					content: [],
					folderPriority: folderPriorityMap[fullPath],
					headerIcon: folderIconMap[fullPath],
				};
				currentFolder.push(folderObject);
			}

			currentFolder = folderObject.content;
		});

		if (fileName !== 'FolderPriority.ts') {
			const content = inpContext(key)?.default;

			// Not every `.ts` file under components/Settings/ is a settings-tab config with a real default export.
			if (content !== undefined) {
				currentFolder.push({
					name: fileName!.replace('.ts', ''),
					type: 'file',
					content,
				});
			}
		}
	});

	const sortStructure = (nodes: SettingNode[]): SettingNode[] => {
		return nodes
			.sort((a, b) => {
				const getPriority = (node: SettingNode): number => {
					if (node.type === 'file') {
						return node.content?.priority ?? Infinity;
					}
					return node.folderPriority ?? Infinity;
				};

				return getPriority(a) - getPriority(b);
			})
			.map((node) => {
				if (node.type === 'folder') {
					return { ...node, content: sortStructure(node.content) };
				}
				return node;
			});
	};

	return sortStructure(folderStructure);
};

const getTemplateData = (type: 'settings'): SettingNode[] => {
	let ctx = contexts[type];

	if (!ctx) {
		 
		console.warn(`No context found for type: ${type}`);
		return [];
	}

	ctx = applyFilters('vulopilot_settings_context', ctx, type) as typeof ctx;

	return importAll(ctx);
};

/** The Modules page's metadata catalog. */
const getModuleData = () => {
	try {
		const moduleData = require('../components/Modules/index.ts').default;
		return moduleData;
	} catch (error) {
		console.warn('Module data not found, skipping...', error);
		return null;
	}
};

export { getTemplateData, getModuleData };
export default getTemplateData;
