import type { PluginUIContribution } from '@open-archiver/types';
import AttachmentPreview from './AttachmentPreview.svelte';

const PREVIEWABLE_TYPES = [
	'image/png',
	'image/jpeg',
	'image/gif',
	'image/webp',
	'application/pdf',
];

export const filePreviewUI: PluginUIContribution[] = [
	{
		extensionPoint: 'attachment-actions',
		component: AttachmentPreview,
		config: { previewableTypes: PREVIEWABLE_TYPES },
	},
];
