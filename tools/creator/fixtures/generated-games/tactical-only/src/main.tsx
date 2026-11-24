import { Canvas } from '@react-three/fiber';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  createNewSession,
  dispatchGameplayIntent,
  encodeSave,
  loadSession,
  SAVE_KEY,
  startPracticeEncounter,
  type TacticalSession,
} from './game';
import './styles.css';

function initialSession(): TacticalSession {
  try {
    return loadSession(localStorage.getItem(SAVE_KEY));
  } catch {
    return {
      ...createNewSession('storage-limited-tactical'),
      sessionOnly: true,
      warning: 'Save storage is unavailable; this run stays in this browser tab.',
    };
  }
}

function App() {
  const [session, setSession] = useState(initialSession);
  const state = session.state;

  function persist(next: TacticalSession) {
    if (next.sessionOnly) return next;
    try {
      localStorage.setItem(SAVE_KEY, encodeSave(next.state));
      return next;
    } catch {
      return {
        ...next,
        sessionOnly: true,
        warning: 'Progress was not saved; this run stays in this browser tab.',
      };
    }
  }

  function startEncounter() {
    if (!session.ready) return;
    const result = startPracticeEncounter(state);
    if (result.accepted) setSession(persist({ ...session, state: result.state }));
  }

  function playerAction(intent: Parameters<typeof dispatchGameplayIntent>[1]) {
    if (!session.ready) return;
    const result = dispatchGameplayIntent(state, intent);
    if (result.accepted) setSession(persist({ ...session, state: result.state }));
  }

  function restart() {
    const fresh = createNewSession(`tactical-restart-${Date.now()}`);
    setSession(
      persist({
        ...fresh,
        sessionOnly: session.sessionOnly,
        warning: session.warning,
      }),
    );
  }

  const encounter = state.encounter;
  const terminal = encounter?.outcome ?? null;
  const active = encounter !== null && terminal === null;

  return (
    <main className="game-shell" data-testid="game-shell">
      <header>
        <p className="eyebrow">SINGLE-SCENE TACTICAL GAME</p>
        <h1>Wayfinder’s Trial</h1>
        <p>Equip a charm, choose an action, and see a deterministic result.</p>
      </header>
      <section className="scene" aria-label="Practice arena" data-testid="game-scene">
        <Canvas frameloop="demand" camera={{ position: [3.2, 2.6, 4.2], fov: 42 }}>
          <color attach="background" args={['#eaf0e9']} />
          <ambientLight intensity={1.2} />
          <directionalLight position={[3, 5, 4]} intensity={2} />
          <mesh position={[-0.7, 0.55, 0]}>
            <dodecahedronGeometry args={[0.55, 0]} />
            <meshStandardMaterial color="#36877e" roughness={0.6} />
          </mesh>
          <mesh position={[0.7, 0.55, 0]}>
            <octahedronGeometry args={[0.55, 0]} />
            <meshStandardMaterial color="#cb7545" roughness={0.6} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]}>
            <planeGeometry args={[6, 6]} />
            <meshStandardMaterial color="#aab8a6" />
          </mesh>
        </Canvas>
      </section>
      {session.warning && (
        <p role="status" data-testid="save-warning">
          {session.warning}
        </p>
      )}
      <section className="status-panel" aria-label="Character equipment">
        <p data-testid="inventory">
          Inventory: ember-charm × {state.inventory['ember-charm'] ?? 0}
        </p>
        <p data-testid="equipment">Charm: {state.equipment.traveler?.charm ?? 'empty'}</p>
        <p data-testid="applied-rewards">Applied rewards: {state.appliedRewardIds.length}</p>
      </section>
      {!session.ready ? (
        <button
          type="button"
          data-testid="recovery-continue"
          onClick={() => setSession({ ...session, ready: true })}
        >
          Continue in this tab
        </button>
      ) : active ? (
        <section className="status-panel" aria-label="Encounter actions">
          <p data-testid="combat-status">Your turn</p>
          <button
            type="button"
            data-testid="action-strike"
            onClick={() =>
              playerAction({
                type: 'use-ability',
                participantId: 'traveler-turn',
                abilityId: 'traveler-strike',
                targetParticipantId: 'watcher-turn',
              })
            }
          >
            Strike
          </button>
          <button
            type="button"
            data-testid="action-wait"
            onClick={() =>
              playerAction({
                type: 'wait',
                participantId: 'traveler-turn',
              })
            }
          >
            Wait
          </button>
          <button
            type="button"
            data-testid="action-withdraw"
            onClick={() => playerAction({ type: 'withdraw' })}
          >
            Leave encounter
          </button>
        </section>
      ) : terminal ? (
        <section className="status-panel" aria-labelledby="outcome-title">
          <h2 id="outcome-title">Outcome</h2>
          <output data-testid="outcome">{terminal}</output>
          <button type="button" data-testid="restart-game" onClick={restart}>
            Start a new trial
          </button>
        </section>
      ) : (
        <button type="button" data-testid="start-encounter" onClick={startEncounter}>
          Start practice duel
        </button>
      )}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
