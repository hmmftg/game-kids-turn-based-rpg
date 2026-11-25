export interface ImportBudget {
  readonly maxFileBytes: number;
  readonly maxTriangles: number;
  readonly maxPrimitives: number;
  readonly maxTextureDimension: number;
  readonly maxDecodedTextureBytes: number;
  readonly maxJoints: number;
  readonly maxClips: number;
  readonly maxClipSeconds: number;
}

export interface ImportModelOptions {
  readonly sourcePath: string;
  readonly metadataPath: string;
  readonly outputDirectory?: string;
  readonly manifestPath?: string;
  readonly replace?: boolean;
  readonly budget?: Partial<ImportBudget>;
  readonly requireApproval?: boolean;
  /** Copy a self-contained GLB's original bytes without reserializing its content. */
  readonly preserveGlbBytes?: boolean;
}

export interface ImportedAssetRecord {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly sourceFormat: 'glb' | 'gltf';
  readonly runtimeFormat: 'glb';
  readonly runtimePath: string;
  readonly sourceSha256: string;
  readonly outputSha256: string;
  readonly rights: Readonly<Record<string, unknown>>;
  readonly clipInventory: readonly {
    readonly id: string;
    readonly animationIndex: number;
    readonly name: string;
    readonly sourceName: string;
    readonly durationSeconds: number;
  }[];
  readonly metrics: Readonly<Record<string, number | readonly string[]>>;
}

export interface ImportResult {
  readonly outputPath: string;
  readonly manifestPath: string;
  readonly record: ImportedAssetRecord;
}

export declare const DEFAULT_BUDGET: Readonly<ImportBudget>;
export declare const LOCAL_PILOT_MAX_TRIANGLES: 400000;
export declare function importModel(options: ImportModelOptions): Promise<ImportResult>;
