import { Router } from 'express';
import { requireAuth } from '@open-archiver/backend';
import { StorageService } from '@open-archiver/backend';
import { requirePermission } from '@open-archiver/backend';
import type { PluginContext } from '@open-archiver/types';
import * as path from 'path';

const PREVIEWABLE = new Set([
	'image/png',
	'image/jpeg',
	'image/gif',
	'image/webp',
	'application/pdf',
]);

export function createPreviewRoute(ctx: PluginContext): Router {
	const router = Router();
	const storage = new StorageService();

	router.get('/preview', requireAuth(ctx.authService), requirePermission('read', 'archive'), async (req, res) => {
		const filePath = req.query.path as string;
		const mimeType = req.query.mimeType as string;

		if (!filePath || !mimeType) {
			return res.status(400).json({ message: 'path and mimeType are required' });
		}

		if (!PREVIEWABLE.has(mimeType)) {
			return res.status(400).json({ message: 'File type not supported for preview' });
		}

		// Path sanitization — prevent directory traversal
		const normalized = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, '');

		try {
			const exists = await storage.exists(normalized);
			if (!exists) {
				return res.status(404).json({ message: 'File not found' });
			}

			const stream = await storage.get(normalized);

			res.setHeader('Content-Type', mimeType);
			res.setHeader('Content-Disposition', 'inline');
			res.setHeader('X-Content-Type-Options', 'nosniff');
			res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'none'");

			stream.pipe(res);
		} catch {
			return res.status(500).json({ message: 'Failed to preview file' });
		}
	});

	return router;
}
