<script lang="ts">
	import type { PluginUIContribution, ExtensionPoint } from '@open-archiver/types';

	let {
		point,
		plugins = [],
		props = {},
	}: {
		point: ExtensionPoint;
		plugins: PluginUIContribution[];
		props?: Record<string, any>;
	} = $props();

	let contributions = $derived(plugins.filter((p) => p.extensionPoint === point));
</script>

{#each contributions as contrib}
	<contrib.component {...props} config={contrib.config} />
{/each}
