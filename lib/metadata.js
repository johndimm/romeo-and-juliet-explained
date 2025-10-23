import fs from 'fs';
import path from 'path';

let cache = null;

export function loadMetadata() {
  if (cache) return cache;
  const p = path.join(process.cwd(), 'data', 'metadata.json');
  const raw = fs.readFileSync(p, 'utf8');
  cache = JSON.parse(raw);
  return cache;
}

export function getMetadataForOffset(byteOffset) {
  const meta = loadMetadata();
  // Find scene by startOffset
  let sceneInfo = null;
  for (const s of meta.scenes) {
    if (byteOffset >= s.startOffset && byteOffset <= s.endOffset) {
      sceneInfo = s;
      break;
    }
  }
  // Find last stage event before offset
  let onStage = [];
  for (let i = meta.stageEvents.length - 1; i >= 0; i--) {
    const ev = meta.stageEvents[i];
    if (ev.offset <= byteOffset) {
      onStage = ev.onStage || [];
      break;
    }
  }
  // Find last speech before offset
  let speaker = null;
  for (let i = meta.speeches.length - 1; i >= 0; i--) {
    const sp = meta.speeches[i];
    if (sp.offset <= byteOffset) {
      speaker = sp.speaker;
      break;
    }
  }
  return {
    act: sceneInfo?.act ?? null,
    scene: sceneInfo?.scene ?? null,
    onStage,
    speaker,
  };
}

