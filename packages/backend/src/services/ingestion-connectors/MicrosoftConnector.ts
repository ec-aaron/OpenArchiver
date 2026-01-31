import 'cross-fetch/polyfill';
import type {
	Microsoft365Credentials,
	EmailObject,
	EmailAddress,
	SyncState,
	MailboxUser,
} from '@open-archiver/types';
import type { IEmailConnector } from '../EmailProviderFactory';
import { logger } from '../../config/logger';
import { simpleParser, ParsedMail, Attachment, AddressObject } from 'mailparser';
import { ConfidentialClientApplication, Configuration, LogLevel } from '@azure/msal-node';
import { Client } from '@microsoft/microsoft-graph-client';
import type { User, MailFolder } from 'microsoft-graph';
import type { AuthProvider } from '@microsoft/microsoft-graph-client';

/**
 * A connector for Microsoft 365 that uses the Microsoft Graph API with client credentials (app-only)
 * to access data on behalf of the organization.
 */
export class MicrosoftConnector implements IEmailConnector {
	private credentials: Microsoft365Credentials;
	private graphClient: Client;
	// Store delta tokens for each folder during a sync operation.
	private newDeltaTokens: { [folderId: string]: string };
	// Cache the detected permission mode to avoid repeated API calls
	private permissionMode: 'org-wide' | 'single-user' | null = null;
	// Store the authenticated user email for single-user mode
	private authenticatedUserEmail: string | null = null;

	constructor(credentials: Microsoft365Credentials) {
		this.credentials = credentials;
		this.newDeltaTokens = {}; // Initialize as an empty object

		const msalConfig: Configuration = {
			auth: {
				clientId: this.credentials.clientId,
				authority: `https://login.microsoftonline.com/${this.credentials.tenantId}`,
				clientSecret: this.credentials.clientSecret,
			},
			system: {
				loggerOptions: {
					loggerCallback(loglevel, message, containsPii) {
						if (containsPii) return;
						switch (loglevel) {
							case LogLevel.Error:
								logger.error(message);
								return;
							case LogLevel.Warning:
								logger.warn(message);
								return;
							case LogLevel.Info:
								logger.info(message);
								return;
							case LogLevel.Verbose:
								logger.debug(message);
								return;
						}
					},
					piiLoggingEnabled: false,
					logLevel: LogLevel.Warning,
				},
			},
		};

		const msalClient = new ConfidentialClientApplication(msalConfig);

		const authProvider: AuthProvider = async (done) => {
			try {
				const response = await msalClient.acquireTokenByClientCredential({
					scopes: ['https://graph.microsoft.com/.default'],
				});
				if (!response?.accessToken) {
					throw new Error('Failed to acquire access token.');
				}
				done(null, response.accessToken);
			} catch (error) {
				logger.error({ err: error }, 'Failed to acquire Microsoft Graph access token');
				done(error, null);
			}
		};

		this.graphClient = Client.init({ authProvider });
	}

	/**
	 * Tests the connection and authentication by detecting the permission mode.
	 * Automatically detects and tests both permission modes:
	 * - First tries org-wide mode (User.Read.All)
	 * - Falls back to single-user mode (User.Read) if needed
	 */
	public async testConnection(): Promise<boolean> {
		try {
			const mode = await this.detectPermissionMode();
			if (mode === 'org-wide') {
				logger.info('Microsoft 365 connection test successful (org-wide mode with User.Read.All).');
			} else {
				logger.info('Microsoft 365 connection test successful (single-user mode with User.Read).');
			}
			return true;
		} catch (error) {
			logger.error({ err: error }, 'Failed to verify Microsoft 365 connection');
			throw error;
		}
	}

	/**
	 * Detects and caches the permission mode by attempting org-wide access first,
	 * then falling back to single-user mode if needed.
	 * @returns The detected permission mode
	 */
	private async detectPermissionMode(): Promise<'org-wide' | 'single-user'> {
		if (this.permissionMode !== null) {
			return this.permissionMode;
		}

		try {
			// Try org-wide mode first
			await this.graphClient.api('/users').top(1).get();
			this.permissionMode = 'org-wide';
			logger.info('Detected org-wide mode (User.Read.All available)');
			return 'org-wide';
		} catch (error: any) {
			if (error.statusCode === 403 || error.code === 'Forbidden' || error.code === 'Authorization_RequestDenied') {
				// Fall back to single-user mode
				// With client credentials flow + Application Access Policies, we need a configured email
				if (!this.credentials.singleUserEmail) {
					logger.error(
						'Single-user mode detected but no user email configured'
					);
					throw new Error(
						'Single-user mode requires configuring the User Email field. ' +
						'Please edit your ingestion source and provide the email address of the mailbox to archive.'
					);
				}

				// Verify access to the configured mailbox
				try {
					await this.graphClient
						.api(`/users/${this.credentials.singleUserEmail}/mailFolders`)
						.top(1)
						.get();

					this.permissionMode = 'single-user';
					this.authenticatedUserEmail = this.credentials.singleUserEmail;
					logger.info(
						{ userEmail: this.authenticatedUserEmail },
						'Detected single-user mode with configured email'
					);
					return 'single-user';
				} catch (accessError: any) {
					logger.error({ err: accessError }, 'Failed to access configured mailbox');
					throw new Error(
						`Unable to access mailbox for ${this.credentials.singleUserEmail}. ` +
						'Verify the email is correct and the Application Access Policy allows access to this mailbox.'
					);
				}
			} else {
				throw error;
			}
		}
	}

	/**
	 * Lists all users in the Microsoft 365 tenant.
	 * This method handles pagination to retrieve the complete list of users.
	 * Automatically detects permission mode:
	 * - Org-wide mode: If User.Read.All is available, returns all users
	 * - Single-user mode: If only User.Read is available, returns authenticated user
	 * @returns An async generator that yields each user object.
	 */
	public async *listAllUsers(): AsyncGenerator<MailboxUser> {
		const mode = await this.detectPermissionMode();

		if (mode === 'org-wide') {
			// Org-wide mode: list all users
			logger.info('Listing all users (org-wide mode)');
			let request = this.graphClient.api('/users').select('id,userPrincipalName,displayName');

			try {
				let response = await request.get();
				while (response) {
					for (const user of response.value as User[]) {
						if (user.id && user.userPrincipalName && user.displayName) {
							yield {
								id: user.id,
								primaryEmail: user.userPrincipalName,
								displayName: user.displayName,
							};
						}
					}

					if (response['@odata.nextLink']) {
						response = await this.graphClient.api(response['@odata.nextLink']).get();
					} else {
						break;
					}
				}
				logger.info('Successfully listed users in org-wide mode');
			} catch (error) {
				logger.error({ err: error }, 'Failed to list all users from Microsoft 365');
				throw error;
			}
		} else {
			// Single-user mode: return configured user
			// With Application Access Policies, we can't always query user details,
			// so we use the configured email directly
			if (!this.authenticatedUserEmail) {
				throw new Error('Single-user mode requires configured email');
			}

			logger.info({ userEmail: this.authenticatedUserEmail }, 'Using configured user (single-user mode)');

			// Generate a minimal user object with the configured email
			// The mailbox access was already verified in detectPermissionMode()
			yield {
				id: this.authenticatedUserEmail, // Use email as ID
				primaryEmail: this.authenticatedUserEmail,
				displayName: this.authenticatedUserEmail, // Use email as display name
			};
		}
	}

	/**
	 * Fetches emails for a single user by iterating through all mail folders and
	 * performing a delta query on each.
	 * @param userEmail The user principal name or ID of the user.
	 * @param syncState Optional state containing the deltaTokens for each folder.
	 * @returns An async generator that yields each raw email object.
	 */
	public async *fetchEmails(
		userEmail: string,
		syncState?: SyncState | null,
		checkDuplicate?: (messageId: string) => Promise<boolean>
	): AsyncGenerator<EmailObject> {
		// Ensure permission mode is detected before accessing mailbox
		await this.detectPermissionMode();

		this.newDeltaTokens = syncState?.microsoft?.[userEmail]?.deltaTokens || {};

		try {
			const folders = this.listAllFolders(userEmail);
			for await (const folder of folders) {
				if (folder.id && folder.path) {
					logger.info(
						{ userEmail, folderId: folder.id, folderName: folder.displayName },
						'Syncing folder'
					);
					yield* this.syncFolder(
						userEmail,
						folder.id,
						folder.path,
						this.newDeltaTokens[folder.id],
						checkDuplicate
					);
				}
			}
		} catch (error) {
			logger.error({ err: error, userEmail }, 'Failed to fetch emails from Microsoft 365');
			throw error;
		}
	}

	/**
	 * Lists all mail folders for a given user.
	 * Always uses /users/{email} - /me doesn't work with client credentials + Application Access Policies.
	 * @param userEmail The user principal name or ID.
	 * @returns An async generator that yields each mail folder.
	 */
	private async *listAllFolders(
		userEmail: string,
		parentFolderId?: string,
		currentPath = ''
	): AsyncGenerator<MailFolder & { path: string }> {
		// Always use /users/{email} - /me doesn't work with client credentials flow
		const requestUrl = parentFolderId
			? `/users/${userEmail}/mailFolders/${parentFolderId}/childFolders`
			: `/users/${userEmail}/mailFolders`;

		try {
			let response = await this.graphClient.api(requestUrl).get();

			while (response) {
				for (const folder of response.value as MailFolder[]) {
					const newPath = currentPath
						? `${currentPath}/${folder.displayName || ''}`
						: folder.displayName || '';
					yield { ...folder, path: newPath || '' };

					if (folder.childFolderCount && folder.childFolderCount > 0) {
						yield* this.listAllFolders(userEmail, folder.id, newPath);
					}
				}

				if (response['@odata.nextLink']) {
					response = await this.graphClient.api(response['@odata.nextLink']).get();
				} else {
					break;
				}
			}
		} catch (error) {
			logger.error({ err: error, userEmail }, 'Failed to list mail folders');
			throw error;
		}
	}

	/**
	 * Performs a delta sync on a single mail folder.
	 * Always uses /users/{email} - /me doesn't work with client credentials + Application Access Policies.
	 * @param userEmail The user's email.
	 * @param folderId The ID of the folder to sync.
	 * @param deltaToken The existing delta token for this folder, if any.
	 * @returns An async generator that yields email objects.
	 */
	private async *syncFolder(
		userEmail: string,
		folderId: string,
		path: string,
		deltaToken?: string,
		checkDuplicate?: (messageId: string) => Promise<boolean>
	): AsyncGenerator<EmailObject> {
		let requestUrl: string | undefined;

		if (deltaToken) {
			// Continuous sync - deltaToken is already a full URL
			requestUrl = deltaToken;
		} else {
			// Initial sync - always use /users/{email}
			requestUrl = `/users/${userEmail}/mailFolders/${folderId}/messages/delta`;
		}

		while (requestUrl) {
			try {
				const response = await this.graphClient
					.api(requestUrl)
					.select('id,conversationId')
					.get();

				for (const message of response.value) {
					if (message.id && !message['@removed']) {
						// Skip fetching raw content for already-imported messages
						if (checkDuplicate && (await checkDuplicate(message.id))) {
							logger.debug(
								{ messageId: message.id, userEmail },
								'Skipping duplicate email (pre-check)'
							);
							continue;
						}

						const rawEmail = await this.getRawEmail(userEmail, message.id);
						if (rawEmail) {
							const emailObject = await this.parseEmail(
								rawEmail,
								message.id,
								userEmail,
								path
							);
							emailObject.threadId = message.conversationId;
							yield emailObject;
						}
					}
				}

				if (response['@odata.deltaLink']) {
					this.newDeltaTokens[folderId] = response['@odata.deltaLink'];
				}

				requestUrl = response['@odata.nextLink'];
			} catch (error) {
				logger.error({ err: error, userEmail, folderId }, 'Failed to sync mail folder');
				// Continue to the next folder if one fails
				return;
			}
		}
	}

	private async getRawEmail(userEmail: string, messageId: string): Promise<Buffer | null> {
		try {
			// Always use /users/{email} - /me doesn't work with client credentials flow
			const response = await this.graphClient
				.api(`/users/${userEmail}/messages/${messageId}/$value`)
				.getStream();
			const chunks: any[] = [];
			for await (const chunk of response) {
				chunks.push(chunk);
			}
			return Buffer.concat(chunks);
		} catch (error) {
			logger.error(
				{ err: error, userEmail, messageId },
				'Failed to fetch raw email content.'
			);
			return null;
		}
	}

	private async parseEmail(
		rawEmail: Buffer,
		messageId: string,
		userEmail: string,
		path: string
	): Promise<EmailObject> {
		const parsedEmail: ParsedMail = await simpleParser(rawEmail);
		const attachments = parsedEmail.attachments.map((attachment: Attachment) => ({
			filename: attachment.filename || 'untitled',
			contentType: attachment.contentType,
			size: attachment.size,
			content: attachment.content as Buffer,
		}));
		const mapAddresses = (
			addresses: AddressObject | AddressObject[] | undefined
		): EmailAddress[] => {
			if (!addresses) return [];
			const addressArray = Array.isArray(addresses) ? addresses : [addresses];
			return addressArray.flatMap((a) =>
				a.value.map((v) => ({ name: v.name, address: v.address || '' }))
			);
		};

		return {
			id: messageId,
			userEmail: userEmail,
			eml: rawEmail,
			from: mapAddresses(parsedEmail.from),
			to: mapAddresses(parsedEmail.to),
			cc: mapAddresses(parsedEmail.cc),
			bcc: mapAddresses(parsedEmail.bcc),
			subject: parsedEmail.subject || '',
			body: parsedEmail.text || '',
			html: parsedEmail.html || '',
			headers: parsedEmail.headers,
			attachments,
			receivedAt: parsedEmail.date || new Date(),
			path,
		};
	}

	public getUpdatedSyncState(userEmail: string): SyncState {
		if (Object.keys(this.newDeltaTokens).length === 0) {
			return {};
		}
		return {
			microsoft: {
				[userEmail]: {
					deltaTokens: this.newDeltaTokens,
				},
			},
		};
	}
}
