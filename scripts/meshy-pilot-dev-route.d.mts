import type { Plugin } from 'vite';

export declare function createMeshyPilotRoutePlugin(
  configuredDirectory: string | undefined,
): Plugin;

export declare function isConfinedPath(root: string, filePath: string): boolean;
