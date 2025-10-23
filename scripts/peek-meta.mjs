#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const metaPath = path.join(process.cwd(), 'data', 'metadata.json');
const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));

const arg = process.argv[2];
const offset = arg ? parseInt(arg, 10) : 5200;

function getMetadataForOffset(byteOffset) {
  // Find scene
  let sceneInfo = null;
  for (const s of meta.scenes) {
    if (byteOffset >= s.startOffset && byteOffset <= s.endOffset) {
      sceneInfo = s;
      break;
    }
  }
  // Last stage event before offset
  let onStage = [];
  for (let i = meta.stageEvents.length - 1; i >= 0; i--) {
    const ev = meta.stageEvents[i];
    if (ev.offset <= byteOffset) {
      onStage = ev.onStage || [];
      break;
    }
  }
  // Last speech before offset
  let speaker = null;
  for (let i = meta.speeches.length - 1; i >= 0; i--) {
    const sp = meta.speeches[i];
    if (sp.offset <= byteOffset) {
      speaker = sp.speaker;
      break;
    }
  }
  return { act: sceneInfo?.act ?? null, scene: sceneInfo?.scene ?? null, onStage, speaker };
}

console.log(JSON.stringify(getMetadataForOffset(offset), null, 2));

