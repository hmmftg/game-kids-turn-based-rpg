export type AssetStage = 'specified' | 'sourced/generated' | 'imported' | 'validated';
export type AssetReadiness = AssetStage | 'approved' | 'release-ready';

export interface CatalogDiagnostic {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface AssetSource {
  readonly provider: string;
  readonly reference: string;
  readonly originalPath: string;
  readonly originalSha256: string;
  readonly generated?: boolean;
}

export interface AssetCatalogAsset {
  readonly id: string;
  readonly category: string;
  readonly description: string;
  readonly stage: AssetStage;
  readonly consumerGameIds: readonly string[];
  readonly source?: AssetSource;
  readonly runtime?: {
    readonly path: string;
    readonly format: 'glb';
    readonly sha256: string;
  };
  readonly rights?: Readonly<Record<string, unknown>>;
  readonly conversion?: {
    readonly tool: string;
    readonly version: string;
    readonly options: Readonly<Record<string, unknown>>;
  };
  readonly inspection?: Readonly<Record<string, unknown>>;
  readonly budgets?: Readonly<Record<string, number>>;
  readonly validation?: {
    readonly validatedBy: string;
    readonly checks: readonly {
      readonly id: string;
      readonly passed: true;
      readonly evidence: string;
    }[];
  };
}

export interface AssetGameApproval {
  readonly assetId: string;
  readonly gameId: string;
  readonly status: 'approved' | 'release-ready';
  readonly assetSha256: string;
  readonly reviewer: string;
  readonly evidencePath: string;
  readonly licensePolicyId: string;
  readonly rightsReviewed: true;
  readonly redistributionAllowed: true;
  readonly commercialUseRequired?: boolean;
  readonly releaseReviewer?: string;
  readonly releaseEvidencePath?: string;
  readonly budgetCheck?: 'passed';
}

export interface AssetCatalog {
  readonly schemaVersion: 1;
  readonly assets: readonly AssetCatalogAsset[];
  readonly approvals: readonly AssetGameApproval[];
}

export declare const ASSET_CATALOG_SCHEMA_VERSION: 1;
export declare const ASSET_STAGES: readonly AssetStage[];
export declare function createAssetCatalog(): AssetCatalog;
export declare function validateAssetCatalog(catalog: unknown): CatalogDiagnostic[];
export declare function assertAssetCatalog(catalog: unknown): asserts catalog is AssetCatalog;
export declare function parseAssetCatalog(text: string): AssetCatalog;
export declare function serializeAssetCatalog(catalog: AssetCatalog): string;
export declare function addSpecifiedAsset(
  catalog: AssetCatalog,
  input: {
    readonly id: string;
    readonly category: string;
    readonly description: string;
    readonly consumerGameIds: readonly string[];
  },
): AssetCatalog;
export declare function addAssetConsumer(
  catalog: AssetCatalog,
  assetId: string,
  gameId: string,
): AssetCatalog;
export declare function markAssetSourced(
  catalog: AssetCatalog,
  assetId: string,
  source: AssetSource,
): AssetCatalog;
export declare function recordAssetImport(
  catalog: AssetCatalog,
  assetId: string,
  imported: {
    readonly runtimePath: string;
    readonly runtimeSha256: string;
    readonly rights: Readonly<Record<string, unknown>>;
    readonly conversion: {
      readonly tool: string;
      readonly version: string;
      readonly options: Readonly<Record<string, unknown>>;
    };
    readonly inspection: Readonly<Record<string, unknown>>;
    readonly budgets: Readonly<Record<string, number>>;
  },
): AssetCatalog;
export declare function markAssetValidated(
  catalog: AssetCatalog,
  assetId: string,
  validation: {
    readonly validatedBy: string;
    readonly checks: readonly {
      readonly id: string;
      readonly passed: true;
      readonly evidence: string;
    }[];
  },
): AssetCatalog;
export declare function approveAssetForGame(
  catalog: AssetCatalog,
  assetId: string,
  gameId: string,
  evidence: {
    readonly reviewer: string;
    readonly evidencePath: string;
    readonly licensePolicyId: string;
    readonly rightsReviewed: true;
    readonly redistributionAllowed: true;
    readonly commercialUseRequired?: boolean;
  },
): AssetCatalog;
export declare function markAssetReleaseReady(
  catalog: AssetCatalog,
  assetId: string,
  gameId: string,
  evidence: {
    readonly reviewer: string;
    readonly evidencePath: string;
    readonly assetSha256: string;
    readonly budgetCheck: 'passed';
  },
): AssetCatalog;
export declare function getAssetReadiness(
  catalog: AssetCatalog,
  assetId: string,
  gameId?: string,
): AssetReadiness;
export declare function verifyAssetFiles(
  catalog: AssetCatalog,
  catalogDirectory: string,
): Promise<CatalogDiagnostic[]>;
