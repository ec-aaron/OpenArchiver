import { writable } from 'svelte/store';
import type { PluginUIContribution } from '@open-archiver/types';

/**
 * Store for plugin UI contributions.
 * Populated at app startup with UI contributions from loaded plugins.
 */
export const pluginContributions = writable<PluginUIContribution[]>([]);

/**
 * Register plugin UI contributions (called from app entry point or layout).
 */
export function registerPluginUI(contributions: PluginUIContribution[]) {
	pluginContributions.set(contributions);
}
