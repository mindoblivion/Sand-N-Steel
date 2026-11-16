import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';

type ClipRecord = {
  name: string;
  duration: number;
  trackCount: number;
  keyframeCount: number;
  tracks: string[];
};

const MODEL_URL = '/models/arena_roman.glb';
const CANDIDATE_WORDS = /fall|knock|down|ground|lay|lie|recover|get.?up|stand|stagger|hit|death/i;

/**
 * Loads the exact production Roman GLB through drei's cache and reports its
 * embedded animation metadata. This component deliberately does not play or
 * mutate any clip, rig, save, or gameplay state.
 */
const AnimationMetadataReader: React.FC<{
  onLoaded: (clips: ClipRecord[]) => void;
}> = ({ onLoaded }) => {
  const gltf = useGLTF(MODEL_URL);

  useEffect(() => {
    const records = gltf.animations.map((clip) => {
      const tracks = clip.tracks.map((track) => track.name);
      const keyframeCount = clip.tracks.reduce((sum, track) => sum + track.times.length, 0);
      return {
        name: clip.name,
        duration: clip.duration,
        trackCount: clip.tracks.length,
        keyframeCount,
        tracks,
      };
    });
    onLoaded(records);
  }, [gltf, onLoaded]);

  return null;
};

/**
 * Dev-only read-only inventory for the 178 embedded clips in arena_roman.glb.
 * Open with ?devHarness=animations. Clip names are discovery clues only:
 * actual fall/grounded/get-up motion still requires rendered pose inspection.
 */
export const AnimationInventoryHarness: React.FC = () => {
  const [clips, setClips] = useState<ClipRecord[] | null>(null);
  const [filter, setFilter] = useState('');
  const [candidatesOnly, setCandidatesOnly] = useState(false);

  const handleLoaded = useCallback((records: ClipRecord[]) => setClips(records), []);
  const visibleClips = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return (clips ?? []).filter((clip) => {
      if (candidatesOnly && !CANDIDATE_WORDS.test(clip.name)) return false;
      if (!query) return true;
      return clip.name.toLowerCase().includes(query) ||
        clip.tracks.some((track) => track.toLowerCase().includes(query));
    });
  }, [clips, filter, candidatesOnly]);

  const panel: React.CSSProperties = {
    minHeight: '100vh',
    background: 'radial-gradient(ellipse at top, #34251b 0%, #17120f 55%, #090807 100%)',
    color: '#ead9b8',
    fontFamily: 'Georgia, serif',
    padding: '24px',
    boxSizing: 'border-box',
  };
  const muted: React.CSSProperties = { color: '#b8a58a', fontSize: 13 };
  const inputStyle: React.CSSProperties = {
    background: '#211a15', color: '#f2e6d0', border: '1px solid #70543a',
    borderRadius: 6, padding: '10px 12px', fontSize: 14, width: '100%',
    boxSizing: 'border-box',
  };

  return (
    <main style={panel}>
      <header style={{ maxWidth: 1100, margin: '0 auto 20px' }}>
        <div style={{ color: '#c69a5a', letterSpacing: 3, fontSize: 11, textTransform: 'uppercase' }}>
          Sand &amp; Steel · Development diagnostics
        </div>
        <h1 style={{ margin: '8px 0', fontSize: 30, fontWeight: 600 }}>Roman animation inventory</h1>
        <p style={muted}>
          Read-only inspection of the clips embedded in <code>{MODEL_URL}</code>.
          No fighter state, profile, save data or gameplay systems are changed.
        </p>
      </header>

      <section style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ flex: '1 1 260px' }}>
            <input
              aria-label="Filter animation names or rig tracks"
              placeholder="Search clip names or rig tracks…"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              style={inputStyle}
            />
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <input
              type="checkbox"
              checked={candidatesOnly}
              onChange={(event) => setCandidatesOnly(event.target.checked)}
            />
            Potential impact / recovery names
          </label>
        </div>

        <div style={{ ...muted, marginBottom: 10 }}>
          {clips ? `${visibleClips.length} shown · ${clips.length} total clips` : 'Loading Roman GLB metadata…'}
        </div>

        <div style={{ border: '1px solid #60472f', borderRadius: 8, overflow: 'hidden' }}>
          {visibleClips.map((clip) => (
            <article key={clip.name} style={{ padding: '12px 14px', borderBottom: '1px solid #3b2d22' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <strong style={{ color: CANDIDATE_WORDS.test(clip.name) ? '#e9b86e' : '#ead9b8' }}>
                  {clip.name}
                </strong>
                <span style={muted}>
                  {clip.duration.toFixed(2)} s · {clip.trackCount} tracks · {clip.keyframeCount} keys
                </span>
              </div>
              <div style={{ ...muted, marginTop: 6, overflowWrap: 'anywhere' }}>
                {clip.tracks.join(' · ')}
              </div>
            </article>
          ))}
          {clips && visibleClips.length === 0 && (
            <div style={{ padding: 18, ...muted }}>No clips match this filter.</div>
          )}
        </div>

        <aside style={{ marginTop: 18, padding: 14, background: '#211a15', borderLeft: '3px solid #b8874d', borderRadius: 4 }}>
          <strong style={{ fontSize: 13 }}>Important verification boundary</strong>
          <p style={{ ...muted, marginBottom: 0 }}>
            A clip name or track list does not prove that it contains a complete fall,
            grounded pose, or get-up. This inventory identifies candidates; each candidate
            still needs rendered pose and timing inspection before live combat integration.
          </p>
        </aside>
      </section>

      <Canvas
        frameloop="never"
        dpr={1}
        gl={{ antialias: false, alpha: true }}
        style={{ position: 'fixed', width: 1, height: 1, opacity: 0, pointerEvents: 'none', left: -10, top: -10 }}
      >
        <Suspense fallback={null}>
          <AnimationMetadataReader onLoaded={handleLoaded} />
        </Suspense>
      </Canvas>
    </main>
  );
};

export default AnimationInventoryHarness;
