import type { ArchiverPlugin } from '@open-archiver/types';
import { createPreviewRoute } from './previewRoute';

const filePreviewPlugin: ArchiverPlugin = {
	name: 'file-preview',

	async initialize(ctx) {
		const router = createPreviewRoute(ctx);
		ctx.app.use(`/${ctx.config.api.version}/storage`, router);
	},

	// UI contributions are registered separately via the frontend entry point
	// See: ./ui.ts
};

export default filePreviewPlugin;
