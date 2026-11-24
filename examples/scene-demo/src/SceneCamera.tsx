import { useEffect } from 'react';
import { OrthographicCamera, PerspectiveCamera } from 'three';
import { useThree, type Camera as FiberCamera } from '@react-three/fiber';
import type { Anchor } from 'waypoint-rpg-core';
import type { SceneCameraConfiguration } from './scene-host.js';
import { sceneProbe } from './probe.js';

interface SceneCameraProps {
  readonly configuration: SceneCameraConfiguration;
  readonly target: Pick<Anchor, 'x' | 'z'>;
}

export function SceneCamera({ configuration, target }: SceneCameraProps) {
  const { set, invalidate, size } = useThree();

  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    let camera: FiberCamera;
    if (configuration.kind === 'orthographic') {
      camera = new OrthographicCamera(-aspect * 4, aspect * 4, 4, -4, 0.1, 100);
      camera.position.set(target.x + 5, 8, target.z + 6);
    } else {
      camera = new PerspectiveCamera(48, aspect, 0.1, 100);
      camera.position.set(target.x + 6, 7, target.z + 8);
    }
    camera.lookAt(target.x, 0, target.z);
    camera.updateProjectionMatrix();
    set({ camera });

    const probe = sceneProbe();
    if (probe) {
      probe.cameraKind = configuration.kind;
      probe.cameraIsOrthographic = camera instanceof OrthographicCamera;
      probe.cameraPosition = camera.position.toArray();
    }
    invalidate();
  }, [configuration.kind, invalidate, set, size.height, size.width, target.x, target.z]);

  return null;
}
