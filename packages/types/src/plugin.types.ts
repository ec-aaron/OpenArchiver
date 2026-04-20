/**
 * Extension points where plugins can contribute UI components.
 */
export type ExtensionPoint =
	| 'attachment-actions'
	| 'email-detail-sidebar'
	| 'dashboard-cards'
	| 'nav-items';

/**
 * Describes a UI contribution from a plugin at a specific extension point.
 */
export interface PluginUIContribution {
	extensionPoint: ExtensionPoint;
	/** Svelte component to render at the extension point */
	component: any;
	/** Arbitrary configuration passed to the component as a `config` prop */
	config?: Record<string, unknown>;
}

/**
 * Context provided to plugins during initialization.
 */
export interface PluginContext {
	app: any; // Express app
	authService: any; // AuthService instance
	config: { api: { version: string }; storage: any };
}

/**
 * Interface for self-contained plugins that contribute backend routes and frontend UI.
 */
export interface ArchiverPlugin {
	name: string;
	/** Called during server startup to register routes, hooks, etc. */
	initialize: (ctx: PluginContext) => Promise<void>;
	/** UI components this plugin contributes to frontend extension points */
	ui?: PluginUIContribution[];
}

/**
 * Serializable capability descriptor sent to the frontend via the capabilities API.
 */
export interface PluginCapability {
	pluginName: string;
	extensionPoint: ExtensionPoint;
	config?: Record<string, unknown>;
}
