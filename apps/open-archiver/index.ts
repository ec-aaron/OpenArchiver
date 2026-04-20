import { createServer, logger } from '@open-archiver/backend';
import filePreviewPlugin from '@open-archiver/plugin-file-preview';
import * as dotenv from 'dotenv';

dotenv.config();

async function start() {
	// --- Environment Variable Validation ---
	const { PORT_BACKEND } = process.env;

	if (!PORT_BACKEND) {
		throw new Error('Missing required environment variables for the backend: PORT_BACKEND.');
	}
	// Create the server instance with plugins
	const app = await createServer([filePreviewPlugin]);

	app.listen(PORT_BACKEND, () => {
		logger.info({}, `✅ Open Archiver (OSS) running on port ${PORT_BACKEND}`);
	});
}

start().catch((error) => {
	logger.error({ error }, 'Failed to start the server:', error);
	process.exit(1);
});
