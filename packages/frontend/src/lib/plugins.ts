/**
 * Plugin UI registration for the frontend.
 *
 * Import plugin UI contributions here.
 * This is the only file you need to modify when adding or removing plugins.
 */
import type { PluginUIContribution } from '@open-archiver/types';
import { filePreviewUI } from '@open-archiver/plugin-file-preview/ui';

export const pluginUIContributions: PluginUIContribution[] = [...filePreviewUI];
