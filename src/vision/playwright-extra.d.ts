import { Browser, BrowserContext, Page, BrowserType, LaunchOptions, LaunchPersistentContextOptions } from 'playwright';

// augment the playwright-extra module with the missing .use() method and
// accurate types for launchPersistentContext.  The package itself currently
// has minimal or no TypeScript definitions, so we declare them here to keep
// the rest of the codebase type-safe.

declare module 'playwright-extra' {
    export interface ExtraBrowserType extends BrowserType<Browser> {
        use(plugin: any): void;
        launch(options?: LaunchOptions): Promise<Browser>;
        launchPersistentContext(userDataDir: string, options?: LaunchPersistentContextOptions): Promise<BrowserContext>;
    }

    export const chromium: ExtraBrowserType;
}
