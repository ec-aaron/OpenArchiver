<script lang="ts">
	import { browser } from '$app/environment';

	let {
		attachment,
		onDownload,
		config,
	}: {
		attachment: { filename: string; mimeType: string; sizeBytes: number; storagePath: string };
		onDownload: () => void;
		config?: { previewableTypes?: string[] };
	} = $props();

	let isOpen = $state(false);
	let previewUrl = $state<string | null>(null);
	let isLoading = $state(false);
	let loadError = $state<string | null>(null);
	let zoom = $state(100);

	const previewableTypes = config?.previewableTypes ?? [];
	const canPreview = $derived(previewableTypes.includes(attachment.mimeType));
	const isImage = $derived(attachment.mimeType?.startsWith('image/'));
	const isPDF = $derived(attachment.mimeType === 'application/pdf');

	function formatBytes(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
	}

	function getAccessToken(): string | null {
		if (!browser) return null;
		const match = document.cookie.match(/(?:^|;\s*)accessToken=([^;]*)/);
		return match ? decodeURIComponent(match[1]) : null;
	}

	async function loadPreview() {
		if (!browser || !isOpen) return;
		isLoading = true;
		loadError = null;

		try {
			const params = new URLSearchParams({
				path: attachment.storagePath,
				mimeType: attachment.mimeType,
			});
			const token = getAccessToken();
			const headers: Record<string, string> = {};
			if (token) headers['Authorization'] = `Bearer ${token}`;

			const response = await fetch(`/api/v1/storage/preview?${params}`, { headers });

			if (!response.ok) {
				const text = await response.text();
				throw new Error(text || `HTTP ${response.status}`);
			}

			const blob = await response.blob();
			previewUrl = URL.createObjectURL(blob);
		} catch (error) {
			loadError = error instanceof Error ? error.message : 'Failed to load preview';
		} finally {
			isLoading = false;
		}
	}

	function cleanup() {
		if (previewUrl) {
			URL.revokeObjectURL(previewUrl);
			previewUrl = null;
		}
		loadError = null;
		zoom = 100;
	}

	function open() {
		isOpen = true;
	}

	function close() {
		isOpen = false;
		cleanup();
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) close();
	}

	$effect(() => {
		if (isOpen && !previewUrl && !isLoading) {
			loadPreview();
		}
		return () => cleanup();
	});
</script>

{#if canPreview}
	<button
		class="inline-flex items-center justify-center whitespace-nowrap rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground h-8"
		onclick={open}
	>
		Preview
	</button>
{/if}

{#if isOpen}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
		onclick={handleBackdropClick}
		onkeydown={(e) => e.key === 'Escape' && close()}
		role="dialog"
		tabindex="-1"
	>
		<div
			class="relative mx-4 flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg bg-background shadow-lg"
		>
			<!-- Header -->
			<div class="flex items-center justify-between border-b px-6 py-4">
				<div>
					<h2 class="text-lg font-semibold">{attachment.filename}</h2>
					<p class="text-sm text-muted-foreground">
						{attachment.mimeType} &bull; {formatBytes(attachment.sizeBytes)}
					</p>
				</div>
				<button class="text-muted-foreground hover:text-foreground text-xl" onclick={close}
					>&times;</button
				>
			</div>

			<!-- Toolbar -->
			<div class="flex items-center gap-2 border-b px-6 py-2">
				{#if isImage}
					<button
						class="rounded border px-2 py-1 text-sm hover:bg-accent"
						onclick={() => (zoom = Math.max(25, zoom - 25))}>-</button
					>
					<span class="text-sm">{zoom}%</span>
					<button
						class="rounded border px-2 py-1 text-sm hover:bg-accent"
						onclick={() => (zoom = Math.min(200, zoom + 25))}>+</button
					>
				{/if}
				<div class="flex-1"></div>
				<button
					class="rounded border px-3 py-1 text-sm hover:bg-accent"
					onclick={onDownload}>Download</button
				>
			</div>

			<!-- Content -->
			<div class="flex-1 overflow-auto bg-muted/30 p-4">
				{#if isLoading}
					<div class="flex items-center justify-center py-12">
						<p class="text-muted-foreground">Loading preview...</p>
					</div>
				{:else if loadError}
					<div class="flex items-center justify-center py-12">
						<p class="text-red-500">Preview failed: {loadError}</p>
					</div>
				{:else if previewUrl && isImage}
					<img
						src={previewUrl}
						alt={attachment.filename}
						class="mx-auto"
						style:width="{zoom}%"
					/>
				{:else if previewUrl && isPDF}
					<iframe
						src={previewUrl}
						title={attachment.filename}
						class="h-[calc(90vh-200px)] w-full border-none"
					></iframe>
				{/if}
			</div>
		</div>
	</div>
{/if}
