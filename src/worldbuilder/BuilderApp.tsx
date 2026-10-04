import { useCallback, useMemo, useRef, useState } from 'react';
import type { AnchorId, NpcId, QuestId, QuestStatus } from '../domain/game/types.ts';
import type { AreaId, MapId, MapTransition } from '../domain/world/types.ts';
import {
  normalizeDocument,
  parseDocument,
  type WorldBuilderAnchor,
  type WorldBuilderArea,
  type WorldBuilderDocument,
} from '../domain/worldbuilder/document.ts';
import { QUEST_DEFINITIONS } from '../domain/quests/definitions.ts';
import { validateWorldDocument } from '../domain/worldbuilder/validation.ts';
import { WorldCanvas } from '../world/WorldCanvas.tsx';
import { NPC_DEFINITIONS } from '../world/registry.ts';
import { transitionForAnchor } from '../world/maps.ts';
import { documentFromRuntime, documentToWorldSource } from './runtimeAdapter.ts';
import { BuilderOverlays, type BuilderSelection } from './BuilderOverlays.tsx';

/**
 * World Builder — a developer authoring surface (dev-only `?worldbuilder=1`
 * mount, no game reducer, no persistence of game state). It edits ONE
 * `WorldBuilderDocument`; compiling that document yields a `WorldSource` the
 * ordinary world renderer walks without mutating the shipped registries.
 */

const DRAFT_KEY = 'worldbuilder.doc.v1';
const NPCS = NPC_DEFINITIONS;

const styles = {
  shell: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'system-ui, sans-serif',
    background: '#20242c',
    color: '#e8e6e1',
  } as const,
  toolbar: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    padding: '8px 12px',
    background: '#2a2f38',
    flexWrap: 'wrap',
  } as const,
  button: {
    padding: '6px 12px',
    borderRadius: 8,
    border: '1px solid #4a5160',
    background: '#39404c',
    color: '#e8e6e1',
    cursor: 'pointer',
    fontSize: 13,
  } as const,
  activeButton: {
    padding: '6px 12px',
    borderRadius: 8,
    border: '1px solid #f0b429',
    background: '#4a3d20',
    color: '#ffd97a',
    cursor: 'pointer',
    fontSize: 13,
  } as const,
  main: { display: 'flex', flex: 1, minHeight: 0 } as const,
  viewport: { flex: 1, position: 'relative' } as const,
  inspector: {
    width: 320,
    background: '#262b34',
    borderLeft: '1px solid #3a4150',
    padding: 12,
    overflowY: 'auto',
    fontSize: 13,
  } as const,
  field: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 } as const,
  label: { width: 110, opacity: 0.75 } as const,
  input: {
    flex: 1,
    background: '#1c2027',
    border: '1px solid #444c5c',
    borderRadius: 6,
    color: '#e8e6e1',
    padding: '4px 6px',
    fontSize: 12,
    minWidth: 0,
  } as const,
  issues: {
    margin: '12px 0 0',
    padding: 8,
    background: '#3a2428',
    borderRadius: 8,
    maxHeight: 220,
    overflowY: 'auto',
  } as const,
  issue: { fontSize: 12, marginBottom: 4 } as const,
};

function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function Field({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div style={styles.field}>
      <span style={styles.label}>{label}</span>
      {children}
    </div>
  );
}

function Num({
  value,
  onChange,
}: {
  readonly value: number;
  readonly onChange: (next: number) => void;
}) {
  return (
    <input
      style={styles.input}
      type="number"
      step={0.1}
      value={value}
      onChange={(event) => {
        const next = Number(event.target.value);
        if (Number.isFinite(next)) onChange(next);
      }}
    />
  );
}

export function BuilderApp() {
  // Resume an in-progress draft when one exists — the authoring equivalent
  // of the game's own continue behaviour (and the hook the acceptance e2e
  // uses to seed an edited document).
  const [doc, setDoc] = useState<WorldBuilderDocument>(() => {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) {
      try {
        return parseDocument(raw);
      } catch {
        // Corrupt drafts fall back to the shipped world.
      }
    }
    return documentFromRuntime();
  });
  const [mode, setMode] = useState<'edit' | 'play'>('edit');
  const [mapId, setMapId] = useState<MapId>('map-town');
  const [walkerAt, setWalkerAt] = useState<AnchorId | null>(null);
  const [selection, setSelection] = useState<BuilderSelection | null>(null);
  const [linkTarget, setLinkTarget] = useState<AnchorId | ''>('');
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const issues = useMemo(() => validateWorldDocument(doc, NPCS), [doc]);
  const compiled = useMemo(() => documentToWorldSource(doc), [doc]);
  const preview = compiled.ok ? compiled.source : null;

  const flash = useCallback((text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice(null), 2400);
  }, []);

  const patchDoc = useCallback((patch: (doc: WorldBuilderDocument) => WorldBuilderDocument) => {
    setDoc((current) => patch(current));
  }, []);

  const updateAnchor = useCallback(
    (id: AnchorId, patch: Partial<WorldBuilderAnchor>) =>
      patchDoc((current) => ({
        ...current,
        anchors: current.anchors.map((a) => (a.id === id ? { ...a, ...patch } : a)),
      })),
    [patchDoc],
  );

  const updateArea = useCallback(
    (id: string, patch: Partial<WorldBuilderArea>) =>
      patchDoc((current) => ({
        ...current,
        areas: current.areas.map((a) => (a.id === id ? { ...a, ...patch } : a)),
      })),
    [patchDoc],
  );

  const updatePlacement = useCallback(
    (npcId: NpcId, patch: { anchorId?: AnchorId; offsetX?: number; offsetZ?: number }) =>
      patchDoc((current) => ({
        ...current,
        npcPlacements: current.npcPlacements.map((p) =>
          p.npcId === npcId ? { ...p, ...patch } : p,
        ),
      })),
    [patchDoc],
  );

  const updateTransition = useCallback(
    (id: string, patch: Partial<MapTransition>) =>
      patchDoc((current) => ({
        ...current,
        transitions: current.transitions.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      })),
    [patchDoc],
  );

  const onDragAnchor = useCallback(
    (anchorId: AnchorId, x: number, z: number) => {
      updateAnchor(anchorId, { x, z });
    },
    [updateAnchor],
  );

  // Creation controls: new areas/anchors are authored, never inferred — a
  // fresh area starts empty (its spawn is set once real anchors exist), a
  // fresh anchor lands at its parent area's centre.
  const addArea = useCallback(() => {
    const areaId = newId('area') as AreaId;
    patchDoc((c) => {
      const fallback = (c.maps.find((m) => m.id === mapId)?.spawnAnchorId ??
        c.anchors[0]?.id) as AnchorId;
      return {
        ...c,
        areas: [
          ...c.areas,
          {
            id: areaId,
            mapId,
            labelFa: areaId,
            bounds: { minX: 0, maxX: 4, minZ: 0, maxZ: 4 },
            spawnAnchorId: fallback,
          },
        ],
      };
    });
    setSelection({ kind: 'area', id: areaId });
  }, [mapId, patchDoc]);

  const addAnchor = useCallback(() => {
    const anchorId = newId('anchor') as AnchorId;
    patchDoc((c) => {
      const parent = c.areas.find((a) => a.mapId === mapId) ?? c.areas[0];
      if (!parent) return c;
      return {
        ...c,
        anchors: [
          ...c.anchors,
          {
            id: anchorId,
            x: (parent.bounds.minX + parent.bounds.maxX) / 2,
            z: (parent.bounds.minZ + parent.bounds.maxZ) / 2,
            walkable: true,
            areaId: parent.id,
            mapId,
            landmarkId: null,
            labelFa: anchorId,
          },
        ],
      };
    });
    setSelection({ kind: 'anchor', id: anchorId });
  }, [mapId, patchDoc]);

  // Play mode walks the compiled source: arriving at a transition anchor
  // hops maps exactly as the game's reducer does.
  const onPlayArrive = useCallback(
    (anchor: AnchorId) => {
      setWalkerAt(anchor);
      if (!preview) return;
      const transition = transitionForAnchor(preview, anchor);
      if (transition) {
        setMapId(transition.toMap);
        setWalkerAt(transition.toAnchor);
      }
    },
    [preview],
  );

  const currentMap = doc.maps.find((m) => m.id === mapId);
  const spawnAnchor =
    currentMap?.spawnAnchorId ?? doc.anchors[0]?.id ?? ('anchor-square' as AnchorId);

  const saveDraft = () => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(normalizeDocument(doc)));
      flash('Draft saved');
    } catch {
      flash('Save failed');
    }
  };
  const loadDraft = () => {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) {
      flash('No draft saved');
      return;
    }
    try {
      setDoc(parseDocument(raw));
      flash('Draft loaded');
    } catch (error) {
      flash(`Load failed: ${error instanceof Error ? error.message : 'bad file'}`);
    }
  };
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(normalizeDocument(doc), null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'world-document.json';
    a.click();
    URL.revokeObjectURL(url);
  };
  const importJson = (file: File) => {
    void file.text().then((text) => {
      try {
        setDoc(parseDocument(text));
        flash(`Imported ${file.name}`);
      } catch (error) {
        flash(`Import failed: ${error instanceof Error ? error.message : 'bad file'}`);
      }
    });
  };

  const selectedAnchor =
    selection?.kind === 'anchor' ? doc.anchors.find((a) => a.id === selection.id) : undefined;
  const selectedArea =
    selection?.kind === 'area' ? doc.areas.find((a) => a.id === selection.id) : undefined;
  const selectedEdge =
    selection?.kind === 'edge'
      ? doc.edges.find((e) => e.from === selection.from && e.to === selection.to)
      : undefined;
  const selectedTransition =
    selection?.kind === 'transition'
      ? doc.transitions.find((t) => t.id === selection.id)
      : undefined;
  const selectedPlacement =
    selection?.kind === 'placement'
      ? doc.npcPlacements.find((p) => p.npcId === selection.npcId)
      : undefined;
  const selectedMap =
    selection?.kind === 'map' ? doc.maps.find((m) => m.id === selection.id) : undefined;

  const selectStyle = styles.input;

  return (
    <div style={styles.shell} data-testid="worldbuilder-app">
      <div style={styles.toolbar}>
        <button
          type="button"
          style={mode === 'edit' ? styles.activeButton : styles.button}
          onClick={() => setMode('edit')}
        >
          Edit
        </button>
        <button
          type="button"
          style={mode === 'play' ? styles.activeButton : styles.button}
          onClick={() => setMode('play')}
          data-testid="builder-play"
        >
          Play
        </button>
        <button
          type="button"
          style={styles.button}
          onClick={addArea}
          data-testid="builder-add-area"
        >
          + Area
        </button>
        <button
          type="button"
          style={styles.button}
          onClick={addAnchor}
          data-testid="builder-add-anchor"
        >
          + Anchor
        </button>
        <label>
          Map{' '}
          <select
            style={selectStyle}
            value={mapId}
            onChange={(e) => {
              setMapId(e.target.value as MapId);
              setWalkerAt(null);
            }}
            data-testid="builder-map-select"
          >
            {doc.maps.map((m) => (
              <option key={m.id} value={m.id}>
                {m.labelFa} ({m.id})
              </option>
            ))}
          </select>
        </label>
        <button type="button" style={styles.button} onClick={saveDraft}>
          Save Draft
        </button>
        <button type="button" style={styles.button} onClick={loadDraft}>
          Load Draft
        </button>
        <button type="button" style={styles.button} onClick={exportJson}>
          Export JSON
        </button>
        <button type="button" style={styles.button} onClick={() => fileRef.current?.click()}>
          Load JSON
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) importJson(file);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          style={styles.button}
          onClick={() => {
            setDoc(documentFromRuntime());
            setSelection(null);
            flash('Reset to shipped world');
          }}
        >
          Reset
        </button>
        <span style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.85 }}>
          {issues.length === 0
            ? '✓ valid'
            : `${issues.length} issue${issues.length === 1 ? '' : 's'}`}
          {notice ? ` — ${notice}` : ''}
        </span>
      </div>

      <div style={styles.main}>
        <div style={styles.viewport} data-testid="builder-viewport">
          {preview ? (
            <WorldCanvas
              world={preview}
              avatarId="avatar-arta"
              headwear="none"
              questStatuses={
                Object.fromEntries(
                  QUEST_DEFINITIONS.map((quest) => [quest.id, 'available']),
                ) as Record<QuestId, QuestStatus>
              }
              completedCount={0}
              interactive={mode === 'play'}
              qualityTier="high"
              mapId={mapId}
              startAnchorId={walkerAt ?? spawnAnchor}
              discoveries={['discovery-cave-entrance']}
              onArrive={mode === 'play' ? onPlayArrive : () => undefined}
              worldTime={0}
              onContextLost={() => undefined}
              overlays={
                mode === 'edit' ? (
                  <BuilderOverlays
                    doc={doc}
                    mapId={mapId}
                    selection={selection}
                    onSelect={setSelection}
                    onDragAnchor={onDragAnchor}
                  />
                ) : undefined
              }
            />
          ) : (
            <div style={{ padding: 24, color: '#ffb4a8' }}>
              Document has {issues.length} validation issue(s) — fix them to preview.
            </div>
          )}
        </div>

        <div style={styles.inspector} data-testid="builder-inspector">
          <strong>Inspector</strong>
          <Field label="Inspect">
            <select
              style={selectStyle}
              data-testid="builder-entity-select"
              value={selection ? JSON.stringify(selection) : ''}
              onChange={(e) => {
                setSelection(
                  e.target.value ? (JSON.parse(e.target.value) as BuilderSelection) : null,
                );
              }}
            >
              <option value="">—</option>
              <optgroup label="Maps">
                {doc.maps.map((m) => (
                  <option key={m.id} value={JSON.stringify({ kind: 'map', id: m.id })}>
                    {m.id}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Areas">
                {doc.areas.map((a) => (
                  <option key={a.id} value={JSON.stringify({ kind: 'area', id: a.id })}>
                    {a.id}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Anchors">
                {doc.anchors.map((a) => (
                  <option key={a.id} value={JSON.stringify({ kind: 'anchor', id: a.id })}>
                    {a.id}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Edges">
                {doc.edges.map((e2) => (
                  <option
                    key={`${e2.from}~${e2.to}`}
                    value={JSON.stringify({ kind: 'edge', from: e2.from, to: e2.to })}
                  >
                    {e2.from} → {e2.to}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Transitions">
                {doc.transitions.map((t) => (
                  <option key={t.id} value={JSON.stringify({ kind: 'transition', id: t.id })}>
                    {t.id}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Placements">
                {doc.npcPlacements.map((p) => (
                  <option
                    key={p.npcId}
                    value={JSON.stringify({ kind: 'placement', npcId: p.npcId })}
                  >
                    {p.npcId}
                  </option>
                ))}
              </optgroup>
            </select>
          </Field>
          {!selection ? <p style={{ opacity: 0.7 }}>Tap an overlay marker to inspect.</p> : null}

          {selectedMap ? (
            <>
              <h4>Map {selectedMap.id}</h4>
              <Field label="labelFa">
                <input
                  style={selectStyle}
                  value={selectedMap.labelFa}
                  onChange={(e) =>
                    patchDoc((c) => ({
                      ...c,
                      maps: c.maps.map((m) =>
                        m.id === selectedMap.id ? { ...m, labelFa: e.target.value } : m,
                      ),
                    }))
                  }
                />
              </Field>
              <Field label="bounds minX">
                <Num
                  value={selectedMap.bounds.minX}
                  onChange={(v) =>
                    patchDoc((c) => ({
                      ...c,
                      maps: c.maps.map((m) =>
                        m.id === selectedMap.id ? { ...m, bounds: { ...m.bounds, minX: v } } : m,
                      ),
                    }))
                  }
                />
              </Field>
              <Field label="bounds maxX">
                <Num
                  value={selectedMap.bounds.maxX}
                  onChange={(v) =>
                    patchDoc((c) => ({
                      ...c,
                      maps: c.maps.map((m) =>
                        m.id === selectedMap.id ? { ...m, bounds: { ...m.bounds, maxX: v } } : m,
                      ),
                    }))
                  }
                />
              </Field>
              <Field label="bounds minZ">
                <Num
                  value={selectedMap.bounds.minZ}
                  onChange={(v) =>
                    patchDoc((c) => ({
                      ...c,
                      maps: c.maps.map((m) =>
                        m.id === selectedMap.id ? { ...m, bounds: { ...m.bounds, minZ: v } } : m,
                      ),
                    }))
                  }
                />
              </Field>
              <Field label="bounds maxZ">
                <Num
                  value={selectedMap.bounds.maxZ}
                  onChange={(v) =>
                    patchDoc((c) => ({
                      ...c,
                      maps: c.maps.map((m) =>
                        m.id === selectedMap.id ? { ...m, bounds: { ...m.bounds, maxZ: v } } : m,
                      ),
                    }))
                  }
                />
              </Field>
              <Field label="spawnAnchorId">
                <select
                  style={selectStyle}
                  value={selectedMap.spawnAnchorId}
                  onChange={(e) =>
                    patchDoc((c) => ({
                      ...c,
                      maps: c.maps.map((m) =>
                        m.id === selectedMap.id
                          ? { ...m, spawnAnchorId: e.target.value as AnchorId }
                          : m,
                      ),
                    }))
                  }
                >
                  {doc.anchors
                    .filter((a) => a.mapId === selectedMap.id)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.id}
                      </option>
                    ))}
                </select>
              </Field>
            </>
          ) : null}

          {selectedAnchor ? (
            <>
              <h4>Anchor {selectedAnchor.id}</h4>
              <Field label="x">
                <Num
                  value={selectedAnchor.x}
                  onChange={(v) => updateAnchor(selectedAnchor.id, { x: v })}
                />
              </Field>
              <Field label="z">
                <Num
                  value={selectedAnchor.z}
                  onChange={(v) => updateAnchor(selectedAnchor.id, { z: v })}
                />
              </Field>
              <Field label="walkable">
                <input
                  type="checkbox"
                  checked={selectedAnchor.walkable}
                  onChange={(e) => updateAnchor(selectedAnchor.id, { walkable: e.target.checked })}
                />
              </Field>
              <Field label="labelFa">
                <input
                  style={selectStyle}
                  value={selectedAnchor.labelFa}
                  onChange={(e) => updateAnchor(selectedAnchor.id, { labelFa: e.target.value })}
                />
              </Field>
              <Field label="areaId">
                <select
                  style={selectStyle}
                  value={selectedAnchor.areaId}
                  onChange={(e) =>
                    updateAnchor(selectedAnchor.id, { areaId: e.target.value as AreaId })
                  }
                >
                  {doc.areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.id}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="mapId">
                <select
                  style={selectStyle}
                  value={selectedAnchor.mapId}
                  onChange={(e) =>
                    updateAnchor(selectedAnchor.id, { mapId: e.target.value as MapId })
                  }
                >
                  {doc.maps.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id}
                    </option>
                  ))}
                </select>
              </Field>
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  style={styles.button}
                  onClick={() =>
                    patchDoc((c) => ({
                      ...c,
                      maps: c.maps.map((m) =>
                        m.id === mapId ? { ...m, spawnAnchorId: selectedAnchor.id } : m,
                      ),
                    }))
                  }
                >
                  Set map spawn
                </button>
                <button
                  type="button"
                  style={styles.button}
                  onClick={() =>
                    patchDoc((c) => ({
                      ...c,
                      areas: c.areas.map((a) =>
                        a.id === selectedAnchor.areaId
                          ? { ...a, spawnAnchorId: selectedAnchor.id }
                          : a,
                      ),
                    }))
                  }
                >
                  Set area spawn
                </button>
                <button
                  type="button"
                  style={styles.button}
                  onClick={() =>
                    patchDoc((c) => {
                      const mapSpawn = c.maps.find(
                        (m) => m.id === selectedAnchor.mapId,
                      )?.spawnAnchorId;
                      const fallback = (mapSpawn ?? c.anchors[0]?.id) as AnchorId;
                      return {
                        ...c,
                        anchors: c.anchors.filter((a) => a.id !== selectedAnchor.id),
                        edges: c.edges.filter(
                          (e) => e.from !== selectedAnchor.id && e.to !== selectedAnchor.id,
                        ),
                        transitions: c.transitions.filter(
                          (t) =>
                            t.fromAnchor !== selectedAnchor.id && t.toAnchor !== selectedAnchor.id,
                        ),
                        npcPlacements: c.npcPlacements.map((p) =>
                          p.anchorId === selectedAnchor.id ? { ...p, anchorId: fallback } : p,
                        ),
                      };
                    })
                  }
                >
                  Delete anchor
                </button>
                <button
                  type="button"
                  style={styles.button}
                  onClick={() =>
                    patchDoc((c) => {
                      const target = c.anchors.find(
                        (a) => a.id !== selectedAnchor.id && a.mapId === selectedAnchor.mapId,
                      );
                      if (!target) return c;
                      const exists = c.edges.some(
                        (e) =>
                          (e.from === selectedAnchor.id && e.to === target.id) ||
                          (e.from === target.id && e.to === selectedAnchor.id),
                      );
                      if (exists) return c;
                      return {
                        ...c,
                        edges: [...c.edges, { from: selectedAnchor.id, to: target.id }],
                      };
                    })
                  }
                >
                  Connect to next
                </button>
              </div>
              <Field label="Link edge to">
                <select
                  style={selectStyle}
                  data-testid="builder-link-target"
                  value={linkTarget}
                  onChange={(e) => setLinkTarget(e.target.value as AnchorId)}
                >
                  <option value="">—</option>
                  {doc.anchors
                    .filter((a) => a.id !== selectedAnchor.id && a.mapId === selectedAnchor.mapId)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.id}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  style={styles.button}
                  data-testid="builder-link-edge"
                  onClick={() => {
                    if (!linkTarget) return;
                    patchDoc((c) => {
                      const exists = c.edges.some(
                        (e) =>
                          (e.from === selectedAnchor.id && e.to === linkTarget) ||
                          (e.from === linkTarget && e.to === selectedAnchor.id),
                      );
                      if (exists) return c;
                      return {
                        ...c,
                        edges: [...c.edges, { from: selectedAnchor.id, to: linkTarget }],
                      };
                    });
                  }}
                >
                  Link
                </button>
              </Field>
            </>
          ) : null}

          {selectedArea ? (
            <>
              <h4>Area {selectedArea.id}</h4>
              <Field label="labelFa">
                <input
                  style={selectStyle}
                  value={selectedArea.labelFa}
                  onChange={(e) => updateArea(selectedArea.id, { labelFa: e.target.value })}
                />
              </Field>
              <Field label="mapId">
                <select
                  style={selectStyle}
                  value={selectedArea.mapId}
                  onChange={(e) => updateArea(selectedArea.id, { mapId: e.target.value as MapId })}
                >
                  {doc.maps.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id}
                    </option>
                  ))}
                </select>
              </Field>
              {(['minX', 'maxX', 'minZ', 'maxZ'] as const).map((key) => (
                <Field key={key} label={`bounds ${key}`}>
                  <Num
                    value={selectedArea.bounds[key]}
                    onChange={(v) =>
                      updateArea(selectedArea.id, { bounds: { ...selectedArea.bounds, [key]: v } })
                    }
                  />
                </Field>
              ))}
              <Field label="spawnAnchorId">
                <select
                  style={selectStyle}
                  value={selectedArea.spawnAnchorId}
                  onChange={(e) =>
                    updateArea(selectedArea.id, { spawnAnchorId: e.target.value as AnchorId })
                  }
                >
                  {doc.anchors.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.id}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          ) : null}

          {selectedEdge ? (
            <>
              <h4>
                Edge {selectedEdge.from} → {selectedEdge.to}
              </h4>
              <button
                type="button"
                style={styles.button}
                onClick={() =>
                  patchDoc((c) => ({
                    ...c,
                    edges: c.edges.filter(
                      (e) => !(e.from === selectedEdge.from && e.to === selectedEdge.to),
                    ),
                  }))
                }
              >
                Delete edge
              </button>
            </>
          ) : null}

          {selectedTransition ? (
            <>
              <h4>Transition {selectedTransition.id}</h4>
              <Field label="fromMap">
                <select
                  style={selectStyle}
                  value={selectedTransition.fromMap}
                  onChange={(e) =>
                    updateTransition(selectedTransition.id, { fromMap: e.target.value as MapId })
                  }
                >
                  {doc.maps.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="fromAnchor">
                <select
                  style={selectStyle}
                  value={selectedTransition.fromAnchor}
                  onChange={(e) =>
                    updateTransition(selectedTransition.id, {
                      fromAnchor: e.target.value as AnchorId,
                    })
                  }
                >
                  {doc.anchors.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.id}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="toMap">
                <select
                  style={selectStyle}
                  value={selectedTransition.toMap}
                  onChange={(e) =>
                    updateTransition(selectedTransition.id, { toMap: e.target.value as MapId })
                  }
                >
                  {doc.maps.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="toAnchor">
                <select
                  style={selectStyle}
                  value={selectedTransition.toAnchor}
                  onChange={(e) =>
                    updateTransition(selectedTransition.id, {
                      toAnchor: e.target.value as AnchorId,
                    })
                  }
                >
                  {doc.anchors.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.id}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          ) : null}

          {selectedPlacement ? (
            <>
              <h4>Placement {selectedPlacement.npcId}</h4>
              <Field label="home anchor">
                <select
                  style={selectStyle}
                  value={selectedPlacement.anchorId}
                  onChange={(e) =>
                    updatePlacement(selectedPlacement.npcId, {
                      anchorId: e.target.value as AnchorId,
                    })
                  }
                >
                  {doc.anchors.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.id}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="offsetX">
                <Num
                  value={selectedPlacement.offsetX ?? 0}
                  onChange={(v) => updatePlacement(selectedPlacement.npcId, { offsetX: v })}
                />
              </Field>
              <Field label="offsetZ">
                <Num
                  value={selectedPlacement.offsetZ ?? 0}
                  onChange={(v) => updatePlacement(selectedPlacement.npcId, { offsetZ: v })}
                />
              </Field>
            </>
          ) : null}

          <h4 style={{ marginTop: 16 }}>Document</h4>
          <Field label="new anchor">
            <button
              type="button"
              style={styles.button}
              onClick={() =>
                patchDoc((c) => {
                  const area = c.areas.find((a) => a.mapId === mapId);
                  if (!area) return c;
                  const id = newId('anchor') as AnchorId;
                  const cx = (area.bounds.minX + area.bounds.maxX) / 2;
                  const cz = (area.bounds.minZ + area.bounds.maxZ) / 2;
                  const anchor: WorldBuilderAnchor = {
                    id,
                    x: cx,
                    z: cz,
                    walkable: true,
                    areaId: area.id,
                    mapId,
                    landmarkId: null,
                    labelFa: 'جدید',
                  };
                  return { ...c, anchors: [...c.anchors, anchor] };
                })
              }
            >
              + anchor on map
            </button>
          </Field>

          {issues.length > 0 ? (
            <div style={styles.issues} data-testid="builder-issues">
              {issues.map((issue, i) => (
                <div key={i} style={styles.issue}>
                  <strong>{issue.code}</strong> {issue.message}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
