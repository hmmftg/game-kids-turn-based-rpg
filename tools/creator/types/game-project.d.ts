export declare const GAME_PROJECT_SCHEMA_VERSION: 1;
export declare const GAME_PROJECT_FILE: 'game.project.json';
export declare const FRAMEWORK_PACKAGE_ROOTS: readonly [
  'waypoint-rpg-core',
  'waypoint-rpg-narrative',
  'waypoint-rpg-gameplay',
];

export type FrameworkPackageRoot = (typeof FRAMEWORK_PACKAGE_ROOTS)[number];
export type ProjectDirection = 'ltr' | 'rtl' | 'auto';
export type ProjectAssetSource = 'shared' | 'game-local';

export interface GameProjectManifest {
  readonly schemaVersion: 1;
  readonly game: {
    readonly id: string;
    readonly version: string;
    readonly displayName: string;
    readonly supportedLocales: readonly string[];
    readonly defaultLocale: string;
  };
  readonly frameworkPackages: readonly FrameworkPackageRoot[];
  readonly scenes: readonly {
    readonly id: string;
    readonly mapId: string;
    readonly worldDefinitionPath: string;
    readonly startAnchorId: string;
  }[];
  readonly start: { readonly sceneId: string; readonly mapId: string; readonly anchorId: string };
  readonly assets: {
    readonly catalogPath: string;
    readonly assetRecordsPath: string;
    readonly references: readonly {
      readonly assetId: string;
      readonly source: ProjectAssetSource;
      readonly runtimePath: string;
    }[];
  };
  readonly content: {
    readonly characterDefinitionPaths: readonly string[];
    readonly narrativeDefinitionPath: string | null;
    readonly gameplayDefinitionPath: string | null;
    readonly animationMappingPath: string | null;
    readonly timelineDefinitionPaths: readonly string[];
  };
  readonly accessibility: {
    readonly direction: ProjectDirection;
    readonly reducedMotion: 'respect';
    readonly keyboard: true;
    readonly touch: true;
  };
  readonly save: {
    readonly namespace: string;
    readonly schemaVersion: number;
    readonly compatibleSchemaVersions: readonly number[];
  };
  readonly commands: Readonly<Record<'dev' | 'build' | 'test' | 'preview' | 'capture', string>>;
}

export interface GameProjectDiagnostic {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface GameProjectValidation {
  readonly ok: boolean;
  readonly diagnostics: readonly GameProjectDiagnostic[];
}

export declare function validateGameProjectManifest(value: unknown): GameProjectValidation;
export declare function createGameProjectManifest(options: {
  readonly id: string;
  readonly displayName: string;
  readonly frameworkPackages?: readonly FrameworkPackageRoot[];
  readonly supportedLocales?: readonly string[];
  readonly defaultLocale?: string;
}): GameProjectManifest;
export declare function readGameProjectManifest(projectRoot: string): Promise<GameProjectManifest>;
export declare function validateGameProject(
  projectRoot: string,
): Promise<GameProjectValidation & { readonly manifest: GameProjectManifest | null }>;
export declare function inspectGameProject(projectRoot: string): Promise<
  GameProjectValidation & {
    readonly manifest: GameProjectManifest | null;
    readonly summary: Readonly<Record<string, unknown>> | null;
  }
>;
export declare function createGameProject(options: {
  readonly directory: string;
  readonly id: string;
  readonly displayName: string;
  readonly frameworkPackages?: readonly FrameworkPackageRoot[];
  readonly supportedLocales?: readonly string[];
  readonly defaultLocale?: string;
  readonly frameworkArchives: Readonly<Partial<Record<FrameworkPackageRoot, string>>>;
}): Promise<{ readonly directory: string; readonly manifest: GameProjectManifest }>;
export declare function runGameProjectCommand(
  projectRoot: string,
  action: 'dev' | 'build' | 'test' | 'preview' | 'capture',
  args?: readonly string[],
): Promise<number>;
