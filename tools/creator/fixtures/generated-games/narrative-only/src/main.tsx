import { Canvas } from '@react-three/fiber';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { getDialogueView } from 'waypoint-rpg-narrative';
import {
  createNewSession,
  dispatchNarrativeIntent,
  encodeSave,
  loadSession,
  SAVE_KEY,
  type NarrativeIntent,
  type NarrativeSession,
} from './game';
import { compiledStory } from './story';
import './styles.css';

function initialSession(): NarrativeSession {
  try {
    return loadSession(localStorage.getItem(SAVE_KEY));
  } catch {
    return {
      ...createNewSession('storage-limited-playthrough'),
      sessionOnly: true,
      warning: 'ذخیره‌سازی در دسترس نیست؛ بازی فقط در همین پنجره می‌ماند.',
    };
  }
}

function App() {
  const [session, setSession] = useState(initialSession);

  function persist(next: NarrativeSession) {
    if (next.sessionOnly) return next;
    try {
      localStorage.setItem(SAVE_KEY, encodeSave(next.state));
      return next;
    } catch {
      return {
        ...next,
        sessionOnly: true,
        warning: 'ذخیره نشد؛ این بازی فقط در همین پنجره ادامه دارد.',
      };
    }
  }

  function command(intent: NarrativeIntent) {
    if (!session.ready) return;
    const result = dispatchNarrativeIntent(session.state, intent);
    if (!result.accepted) return;
    setSession(persist({ ...session, state: result.state }));
  }

  function restart() {
    const fresh = createNewSession(`narrative-restart-${Date.now()}`);
    const next = { ...fresh, sessionOnly: session.sessionOnly, warning: session.warning };
    setSession(persist(next));
  }

  const view = getDialogueView(compiledStory, session.state, 'fa-IR');

  return (
    <main className="game-shell" dir="rtl" lang="fa-IR" data-testid="game-shell">
      <header>
        <p className="eyebrow">بازی داستانی تک‌صحنه</p>
        <h1>راهِ روشن</h1>
        <p>یک داستان کوتاه با دو پایان</p>
      </header>
      <section className="scene" aria-label="صحنهٔ بازی" data-testid="game-scene">
        <Canvas frameloop="demand" camera={{ position: [3.2, 2.6, 4.2], fov: 42 }}>
          <color attach="background" args={['#eaf0e9']} />
          <ambientLight intensity={1.2} />
          <directionalLight position={[3, 5, 4]} intensity={2} />
          <mesh position={[0, 0.6, 0]}>
            <dodecahedronGeometry args={[0.72, 0]} />
            <meshStandardMaterial color="#36877e" roughness={0.6} />
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
      {!session.ready ? (
        <button
          type="button"
          data-testid="recovery-continue"
          onClick={() => setSession({ ...session, ready: true })}
        >
          ادامه در همین پنجره
        </button>
      ) : session.state.endingId ? (
        <section className="story-panel" aria-labelledby="ending-title">
          <h2 id="ending-title">پایان داستان</h2>
          <output data-testid="story-ending">{session.state.endingId}</output>
          <button type="button" data-testid="restart-story" onClick={restart}>
            از نو شروع کن
          </button>
        </section>
      ) : view ? (
        <section
          className="story-panel"
          aria-labelledby="dialogue-title"
          data-testid="dialogue-choice"
        >
          <h2 id="dialogue-title">{view.speakerId}</h2>
          <p data-testid={view.nodeId === 'truth-ending' ? 'truth-node' : 'dialogue-text'}>
            {view.text}
          </p>
          {view.terminal ? (
            <button
              type="button"
              data-testid="finish-story"
              onClick={() => command({ type: 'finish' })}
            >
              پایان داستان
            </button>
          ) : (
            <div className="choices">
              {view.choices
                .filter((choice) => choice.available)
                .map((choice) => (
                  <button
                    key={choice.id}
                    type="button"
                    data-testid={choice.id === 'choose-truth' ? 'choice-truth' : 'choice-peace'}
                    onClick={() => command({ type: 'choose', choiceId: choice.id })}
                  >
                    {choice.label}
                  </button>
                ))}
            </div>
          )}
        </section>
      ) : (
        <button
          type="button"
          data-testid="begin-story"
          onClick={() => command({ type: 'open-dialogue', dialogueId: 'traveler-question' })}
        >
          داستان را شروع کن
        </button>
      )}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
