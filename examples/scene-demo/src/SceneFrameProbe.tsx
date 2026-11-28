import { useCallback, useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { sceneProbe } from './probe.js';

export function SceneFrameProbe() {
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const sampleCount = useRef(0);
  const readRendererMemory = useCallback(
    () => ({
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
    }),
    [gl],
  );

  useEffect(() => {
    const probe = sceneProbe();
    if (!probe) return;
    probe.readRendererMemory = readRendererMemory;
    return () => {
      if (probe.readRendererMemory === readRendererMemory) probe.readRendererMemory = null;
    };
  }, [readRendererMemory]);

  useFrame(() => {
    if (sampleCount.current++ === 0) invalidate();
    const probe = sceneProbe();
    if (probe) {
      probe.frameCount += 1;
      probe.rendererMemory = readRendererMemory();
    }
  });
  return null;
}
