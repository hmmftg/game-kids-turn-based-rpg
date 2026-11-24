import { Canvas } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createGameRuntime } from './game';
import './styles.css';

const title: string = new TextDecoder().decode(
  Uint8Array.from(atob('{{WAYPOINT_GAME_NAME_BASE64}}'), (character) => character.charCodeAt(0)),
);
const runtime = createGameRuntime();

export function Scene({ interactions }: { readonly interactions: number }) {
  return (
    <Canvas frameloop="demand" camera={{ position: [3.2, 2.6, 4.2], fov: 42 }}>
      <color attach="background" args={['#eaf0e9']} />
      <ambientLight intensity={1.2} />
      <directionalLight position={[3, 5, 4]} intensity={2} />
      <mesh position={[0, 0.6, 0]} rotation={[0, interactions * 0.16, 0]}>
        <dodecahedronGeometry args={[0.72, 0]} />
        <meshStandardMaterial color={interactions % 2 ? '#cb7545' : '#36877e'} roughness={0.6} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]}>
        <planeGeometry args={[6, 6]} />
        <meshStandardMaterial color="#aab8a6" />
      </mesh>
    </Canvas>
  );
}

export function App() {
  const [state, setState] = useState(runtime.getState());
  useEffect(() => runtime.subscribe(setState), []);

  return (
    <main className="game-shell" data-testid="game-shell">
      <header>
        <p className="eyebrow">SINGLE-SCENE GAME TEMPLATE</p>
        <h1>{title}</h1>
        <p>This is your game-owned scene, state and interaction loop.</p>
      </header>
      <section className="scene" aria-label="Game scene" data-testid="game-scene">
        <Scene interactions={state.interactions} />
      </section>
      <footer>
        <button
          type="button"
          data-testid="scene-interact"
          onClick={() => runtime.dispatch({ type: 'interact-with-scene' })}
        >
          Explore scene
        </button>
        <output aria-live="polite" data-testid="interaction-count">
          Interactions: {state.interactions}
        </output>
      </footer>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
