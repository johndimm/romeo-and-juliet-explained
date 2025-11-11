import { useEffect, useMemo, useState } from 'react';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const clampDensity = (value) => clamp(value, 0, 100);

const normalizedPerplexity = (item) => {
  let p = Number(item?.perplexity ?? item?.confusion ?? 0);
  if (!Number.isFinite(p) || p < 0) p = 0;
  const model = String(item?.perplexityModel || '').toLowerCase();
  if (typeof item?.perplexityNorm === 'number') {
    return clampDensity(Math.round(item.perplexityNorm));
  }
  if (p <= 100 && model !== 'gpt2') return clampDensity(Math.round(p));
  const val = Math.log10(Math.max(1, p));
  return clampDensity(Math.round(25 * val));
};

function romanToInt(str) {
  if (!str) return 0;
  const map = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  let prev = 0;
  for (let i = str.length - 1; i >= 0; i -= 1) {
    const value = map[str[i]] || 0;
    if (value < prev) total -= value;
    else total += value;
    prev = value;
  }
  return total;
}

export default function PrintPanel({
  sections,
  sectionsWithOffsets,
  metadata,
  precomputed,
  noteThreshold,
  onNoteThresholdChange,
}) {
  const densityValue = typeof noteThreshold === 'number' ? noteThreshold : 33;
  const [bySectionSaved, setBySectionSaved] = useState({});
  const [bySectionForced, setBySectionForced] = useState({});
  const [bySectionPrecomputed, setBySectionPrecomputed] = useState({});
  const [dateStr, setDateStr] = useState('');
  const [selectedAct, setSelectedAct] = useState('');
  const [selectedScene, setSelectedScene] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const now = new Date();
    setDateStr(now.toLocaleString());

    try {
      const raw = localStorage.getItem('explanations');
      if (raw) {
        const data = JSON.parse(raw);
        const entries = Object.values(data || {}).filter((entry) => entry && entry.meta && entry.last);
        const grouped = {};
        entries.forEach((entry) => {
          const idx = entry.meta.sectionIndex;
          if (!grouped[idx]) grouped[idx] = [];
          grouped[idx].push(entry);
        });
        Object.values(grouped).forEach((list) => list.sort((a, b) => (a.meta.start || 0) - (b.meta.start || 0)));
        setBySectionSaved(grouped);
      }
    } catch {}

    try {
      const forcedRaw = localStorage.getItem('forcedNotes');
      let forced = [];
      if (forcedRaw) {
        const parsed = JSON.parse(forcedRaw);
        if (Array.isArray(parsed)) forced = parsed.map(String);
      }

      const scenes = Array.isArray(metadata?.scenes) ? metadata.scenes : [];
      const mapActScene = (offset) => {
        for (const sc of scenes) {
          if (offset >= sc.startOffset && offset <= sc.endOffset) {
            return { act: sc.act, scene: sc.scene };
          }
        }
        return { act: 'Prologue', scene: '' };
      };

      const speeches = Array.isArray(metadata?.speeches) ? metadata.speeches : [];
      const perScene = new Map();
      for (const sp of speeches) {
        const { act, scene } = mapActScene(sp.offset || 0);
        const key = `${act}#${scene}`;
        const arr = perScene.get(key) || [];
        arr.push({ offset: sp.offset || 0, act, scene, speechIndex: arr.length + 1 });
        perScene.set(key, arr);
      }

      const encoder = new TextEncoder();
      const sectionRanges = sectionsWithOffsets.map((section) => {
        const start = section.startOffset || 0;
        const end = start + encoder.encode(section.text || '').length;
        return { start, end };
      });

      const groupedPre = {};
      const groupedForced = {};

      const filteredPrecomputed = (Array.isArray(precomputed) ? precomputed : []).filter((item) => {
        const act = item.act || item.Act || '';
        const scene = item.scene != null ? String(item.scene) : '';
        const key = `${act}#${scene}`;
        const speechesForScene = perScene.get(key) || [];
        if (!speechesForScene.length) return false;
        const offset = Number(item.startOffset || 0);
        let chosen = speechesForScene[0];
        for (let i = 0; i < speechesForScene.length; i += 1) {
          if (speechesForScene[i].offset <= offset) chosen = speechesForScene[i];
          else break;
        }
        const speechKey = `${chosen.act}|${chosen.scene}|${chosen.speechIndex}`;
        if (forced.includes(speechKey)) return true;
        const score = normalizedPerplexity(item);
        if (typeof densityValue !== 'number') return true;
        if (densityValue <= 0) return true;
        return score >= densityValue;
      });

      filteredPrecomputed.forEach((item) => {
        const act = item.act || item.Act || '';
        const scene = item.scene != null ? String(item.scene) : '';
        const key = `${act}#${scene}`;
        const speechesForScene = perScene.get(key) || [];
        if (!speechesForScene.length) return;
        const offset = Number(item.startOffset || 0);
        let chosen = speechesForScene[0];
        for (let i = 0; i < speechesForScene.length; i += 1) {
          if (speechesForScene[i].offset <= offset) chosen = speechesForScene[i];
          else break;
        }
        const speechKey = `${chosen.act}|${chosen.scene}|${chosen.speechIndex}`;

        let sectionIndex = 0;
        for (let i = 0; i < sectionRanges.length; i += 1) {
          const { start, end } = sectionRanges[i];
          if (offset >= start && offset < end) {
            sectionIndex = i;
            break;
          }
          if (sectionRanges[i].start <= offset) sectionIndex = i;
          else break;
        }

        const target = forced.includes(speechKey) ? groupedForced : groupedPre;
        if (!target[sectionIndex]) target[sectionIndex] = [];
        target[sectionIndex].push({
          last: item.content || '',
          meta: { sectionIndex, byteOffset: offset },
        });
      });

      setBySectionPrecomputed(groupedPre);
      setBySectionForced(groupedForced);
    } catch {}
  }, [metadata, precomputed, sectionsWithOffsets, densityValue]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const storedAct = localStorage.getItem('printAct') || '';
      const storedScene = localStorage.getItem('printScene') || '';
      setSelectedAct(storedAct);
      setSelectedScene(storedScene);
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('printAct', selectedAct || '');
      localStorage.setItem('printScene', selectedScene || '');
    } catch {}
  }, [selectedAct, selectedScene]);

  const sectionInfo = useMemo(() => {
    const info = sectionsWithOffsets.map(() => ({ act: null, scene: null, title: null }));
    const scenes = Array.isArray(metadata?.scenes) ? metadata.scenes : [];
    sectionsWithOffsets.forEach((section, index) => {
      const start = section.startOffset;
      const scene = scenes.find((s) => start >= s.startOffset && start <= s.endOffset);
      if (scene) {
        info[index] = {
          act: scene.act || null,
          scene: scene.scene != null ? String(scene.scene) : null,
          title: scene.title || null,
        };
      }
    });
    return info;
  }, [sectionsWithOffsets, metadata]);

  const acts = useMemo(() => {
    const set = new Set();
    (metadata?.scenes || []).forEach((scene) => {
      if (scene.act) {
        const act = scene.act.toLowerCase() === 'prologue' ? 'Prologue' : scene.act.toUpperCase();
        set.add(act);
      }
    });
    const values = Array.from(set);
    const prologue = values.filter((act) => act.toLowerCase() === 'prologue');
    const romanActs = values.filter((act) => act.toLowerCase() !== 'prologue');
    romanActs.sort((a, b) => romanToInt(a) - romanToInt(b));
    return [...prologue, ...romanActs];
  }, [metadata]);

  const scenesForAct = useMemo(() => {
    if (!selectedAct) return [];
    const norm = selectedAct.toLowerCase();
    const set = new Set();
    (metadata?.scenes || []).forEach((scene) => {
      if ((scene.act || '').toLowerCase() === norm && scene.scene) {
        set.add(scene.scene);
      }
    });
    return Array.from(set).sort((a, b) => romanToInt(String(a)) - romanToInt(String(b)));
  }, [metadata, selectedAct]);

  const filteredIndices = useMemo(() => {
    if (!selectedAct && !selectedScene) {
      return sectionsWithOffsets.map((_, index) => index);
    }
    return sectionsWithOffsets.map((_, index) => index).filter((index) => {
      const info = sectionInfo[index];
      if (selectedAct) {
        if (!info.act) return false;
        if ((info.act || '').toLowerCase() !== selectedAct.toLowerCase()) return false;
      }
      if (selectedScene) {
        if (selectedAct && selectedAct.toLowerCase() === 'prologue') {
          return selectedScene.trim() === '';
        }
        if (!info.scene || info.scene === '') {
          return selectedScene.trim() === '';
        }
        if (String(info.scene).toUpperCase() !== selectedScene.toUpperCase()) return false;
      }
      return true;
    });
  }, [sectionsWithOffsets, sectionInfo, selectedAct, selectedScene]);

  const handleDensityChange = (value) => {
    const next = clampDensity(value);
    onNoteThresholdChange?.(next);
  };

  return (
    <div className="print-overlay">
      <div className="screenOnly printControls">
        <div className="printControlsHeader">
          <h1 className="printControlsTitle">Romeo and Juliet Explained</h1>
          <div className="printControlsActions">
            <button
              className="printButton printButtonPrimary"
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  try {
                    window.print();
                  } catch {
                    alert('Unable to open print dialog. Use your browser print shortcut (Cmd/Ctrl + P).');
                  }
                }
              }}
            >
              🖨️ Print
            </button>
          </div>
        </div>
        <div className="printControlsFilters">
          <div className="printFilterGroup">
            <label className="printFilterLabel">
              Act
              <select
                className="printFilterSelect"
                value={selectedAct}
                onChange={(event) => {
                  setSelectedAct(event.target.value);
                  setSelectedScene('');
                }}
              >
                <option value="">All</option>
                {acts.map((act) => (
                  <option key={`act-${act}`} value={act}>
                    {act}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="printFilterGroup">
            <label className="printFilterLabel">
              Scene
              <select
                className="printFilterSelect"
                value={selectedScene}
                onChange={(event) => setSelectedScene(event.target.value)}
                disabled={!selectedAct}
              >
                <option value="">All</option>
                {scenesForAct.map((scene) => (
                  <option key={`scene-${scene}`} value={String(scene).toUpperCase()}>
                    {scene}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="printFilterGroup">
            <label className="printFilterLabel">
              Note density
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                className="printFilterRange"
                value={densityValue}
                onChange={(event) => handleDensityChange(Number(event.target.value))}
              />
            </label>
            <div className="printFilterRangeLabels">
              <span>None</span>
              <span>Some</span>
              <span>Most</span>
              <span>All</span>
            </div>
          </div>
          <div className="printFilterGroup">
            <div className="printMeta">
              <div>Generated: {dateStr}</div>
              <div>Selections saved locally on this device.</div>
            </div>
          </div>
        </div>
      </div>

      <div className="printContainer">
        {filteredIndices.map((index) => {
          const section = sections[index] || '';
          const info = sectionInfo[index] || {};
          const saved = bySectionSaved[index] || [];
          const forced = bySectionForced[index] || [];
          const pre = bySectionPrecomputed[index] || [];

          return (
            <div key={`print-section-${index}`} className="printSection">
              {info.title && <h2 className="printSectionTitle">{info.title}</h2>}
              {info.act && (
                <div className="printSectionMeta">
                  <strong>Act {info.act}</strong>
                  {info.scene && info.scene !== '' ? <> — Scene {info.scene}</> : null}
                </div>
              )}
              <pre className="printSectionText">{section}</pre>
              {forced.length > 0 && (
                <div className="printNotesGroup">
                  <h3>Priority notes</h3>
                  {forced.map((entry, idx) => (
                    <div key={`forced-${index}-${idx}`} className="printNoteCard">
                      <p>{entry.last}</p>
                    </div>
                  ))}
                </div>
              )}
              {pre.length > 0 && (
                <div className="printNotesGroup">
                  <h3>Precomputed notes</h3>
                  {pre.map((entry, idx) => (
                    <div key={`pre-${index}-${idx}`} className="printNoteCard">
                      <p>{entry.last}</p>
                    </div>
                  ))}
                </div>
              )}
              {saved.length > 0 && (
                <div className="printNotesGroup">
                  <h3>Saved explanations</h3>
                  {saved.map((entry, idx) => (
                    <div key={`saved-${index}-${idx}`} className="printNoteCard">
                      {entry.meta?.question && <blockquote>{entry.meta.question}</blockquote>}
                      <p>{entry.last}</p>
                      {entry.meta?.model && (
                        <div className="printNoteMeta">
                          Generated with {entry.meta.provider ? `${entry.meta.provider} / ` : ''}
                          {entry.meta.model}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

