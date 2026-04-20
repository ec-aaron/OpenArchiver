/**
 * One-off migration script: rehash all attachment files.
 *
 * Reads each attachment from storage (decrypting if needed),
 * computes the SHA-256 hash of the actual content, and updates
 * the DB's content_hash_sha256 to match.
 *
 * Usage:
 *   npx ts-node packages/backend/src/scripts/rehash-attachments.ts
 *
 * Or from Docker:
 *   docker exec -it open-archiver node packages/backend/dist/scripts/rehash-attachments.js
 *
 * Requires DATABASE_URL and storage config in .env
 */
import 'dotenv/config';
import { db } from '../database';
import { attachments } from '../database/schema';
import { StorageService } from '../services/StorageService';
import { createHash } from 'crypto';
import { eq } from 'drizzle-orm';

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
	const chunks: Buffer[] = [];
	for await (const chunk of stream) {
		chunks.push(Buffer.from(chunk));
	}
	return Buffer.concat(chunks);
}

async function main() {
	const storage = new StorageService();

	const allAttachments = await db.select().from(attachments);
	console.log(`Found ${allAttachments.length} attachments to check.`);

	let updated = 0;
	let skipped = 0;
	let errors = 0;

	for (const attachment of allAttachments) {
		try {
			const stream = await storage.get(attachment.storagePath);
			const buffer = await streamToBuffer(stream);
			const actualHash = createHash('sha256').update(buffer).digest('hex');

			if (actualHash !== attachment.contentHashSha256) {
				await db
					.update(attachments)
					.set({ contentHashSha256: actualHash })
					.where(eq(attachments.id, attachment.id));

				console.log(
					`  UPDATED: ${attachment.filename} (${attachment.id}) — old: ${attachment.contentHashSha256.slice(0, 12)}... → new: ${actualHash.slice(0, 12)}...`
				);
				updated++;
			} else {
				skipped++;
			}
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			console.error(
				`  ERROR: ${attachment.filename} (${attachment.id}) — ${msg}`
			);
			errors++;
		}
	}

	console.log(`\nDone. Updated: ${updated}, Already correct: ${skipped}, Errors: ${errors}`);
	process.exit(0);
}

main().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(1);
});
