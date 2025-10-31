#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const SRC = path.join(process.cwd(), 'romeo-and-juliet.txt');
const OUT_DIR = path.join(process.cwd(), 'data');
const CSV_PATH = path.join(OUT_DIR, 'character_map.csv');
const META_PATH = path.join(OUT_DIR, 'metadata.json');

function readText() {
  const raw = fs.readFileSync(SRC, 'utf8');
  return raw.replace(/\r\n?/g, '\n');
}

function normalizeQuotes(s) {
  return s.replace(/[’‘]/g, "'");
}

function titleCaseName(name) {
  return name
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
    .replace(/\bS\'\b/g, "s'");
}

function parseDramatisPersonae(lines) {
  const startIdx = lines.findIndex((l) => /\bDramatis Person[æae]/i.test(l));
  if (startIdx === -1) return [];
  const chars = new Set();
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    if (/^SCENE\./i.test(line)) break; // end of list
    // Extract ALL CAPS leading token(s) up to comma or period
    // Match leading uppercase words (with spaces, apostrophes, hyphens) before lowercase or punctuation
    // Special case: "NURSE to Juliet." - extract just "NURSE"
    // First try to match uppercase words followed by "to" and lowercase
    let m = normalizeQuotes(line).match(/^([A-Z]+(?:\s+[A-Z]+)*)\s+to\s+[A-Z][a-z]+[\.,]/);
    if (!m) {
      // Otherwise match uppercase words ending with uppercase before comma/period
      m = normalizeQuotes(line).match(/^([A-Z][A-Z\s'\-]*[A-Z])\s*[\.,]/);
    }
    if (m) {
      const raw = m[1].trim();
      // Filter out generic group names if they slipped in (no lowercase present anyway)
      if (raw && /[A-Z]/.test(raw)) {
        chars.add(raw);
      }
    }
  }
  // Build mapping: canonical -> title case variant used for matching in stage directions
  const list = Array.from(chars);
  const canonical = list.map((c) => ({
    canonical: c, // ALL CAPS from dramatis
    display: titleCaseName(c.replace(/_/g, ' ')),
  }));
  return canonical;
}

function* iterateLinesWithOffsets(text) {
  let offset = 0;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    yield { line, lineNumber: i + 1, offset };
    // +1 for the newline character
    offset += Buffer.byteLength(line, 'utf8') + 1;
  }
}

function detectAct(line) {
  const m = line.match(/^ACT\s+([IVXLC]+)\b/i);
  return m ? m[1] : null;
}

function detectScene(line) {
  const m = line.match(/^SCENE\s+([IVXLC]+)\b/i);
  return m ? m[1] : null;
}

function isStageDir(line) {
  const t = line.trim();
  if (!t) return false;
  // Examples: "Enter X and Y.", "[_Exit._]", "Exit Romeo.", "Exeunt all." etc.
  return /^(Enter|Exit|Exeunt)\b/i.test(t) || /\b(Enter|Exit|Exeunt)\b/.test(t.replace(/[\[\]_]/g, ''));
}

function parseStageDirType(text) {
  const t = text.trim();
  if (/^Enter\b/i.test(t)) return 'enter';
  if (/^Exit\b/i.test(t)) return 'exit';
  if (/^Exeunt\b/i.test(t)) return 'exeunt';
  // Bracketed
  const s = t.replace(/[\[\]_]/g, '');
  if (/\bEnter\b/i.test(s)) return 'enter';
  if (/\bExit\b/i.test(s)) return 'exit';
  if (/\bExeunt\b/i.test(s)) return 'exeunt';
  return null;
}

function matchCharactersIn(text, charList) {
  const hay = normalizeQuotes(text);
  const names = [];
  for (const ch of charList) {
    const disp = ch.display; // Title-case name likely in stage dir
    // Match as a whole word-ish (allow apostrophes)
    const pattern = new RegExp(`(^|[^A-Za-z])${disp.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}(?=$|[^A-Za-z])`);
    if (pattern.test(hay)) names.push(ch.canonical);
  }
  return names;
}

function isSpeakerHeader(line, charSetCaps) {
  // A speaker header is exactly an ALL-CAPS name followed by a period, possibly with trailing spaces
  const lineNorm = normalizeQuotes(line.trim());
  const m = lineNorm.match(/^([A-Z][A-Z\s'\-]+)\.$/);
  if (!m) return null;
  const raw = m[1].trim();
  // Since we now include all found speakers in charSetCaps, we should match all valid speaker headers
  return charSetCaps.has(raw) ? raw : null;
}

function build() {
  const text = readText();
  const lines = text.split('\n');
  const dramatis = parseDramatisPersonae(lines);
  const charCaps = new Set(dramatis.map((d) => d.canonical));

  let act = null;
  let scene = null;
  let onStage = new Set();
  let currentSpeaker = null;

  const stageEvents = [];
  const speeches = [];
  const scenes = [];
  let sceneStartOffset = null;

  // Determine where the actual play body starts (prefer THE PROLOGUE)
  let bodyStartOffset = 0;
  {
    let running = 0;
    for (const l of lines) {
      const t = l.trim();
      const bytes = Buffer.byteLength(l, 'utf8') + 1;
      if (/^THE PROLOGUE\s*$/i.test(t)) {
        bodyStartOffset = running;
        break;
      }
      running += bytes;
    }
  }

  // First pass: Extract all speaker headers from the text itself
  // Any line that is ALL-CAPS followed by a period (entire line) is a speaker header
  const foundSpeakers = new Set();
  for (const { line, lineNumber, offset } of iterateLinesWithOffsets(text)) {
    if (offset < bodyStartOffset) continue;
    const lineNorm = normalizeQuotes(line.trim());
    // Match lines that are entirely ALL-CAPS (with spaces, apostrophes, hyphens) followed by period
    const speakerMatch = lineNorm.match(/^([A-Z][A-Z\s'\-]+)\.$/);
    if (speakerMatch) {
      const speaker = speakerMatch[1].trim();
      if (speaker && speaker.length > 0) {
        foundSpeakers.add(speaker);
      }
    }
  }
  // Add all found speakers to charCaps
  for (const speaker of foundSpeakers) {
    charCaps.add(speaker);
  }

  for (const { line, lineNumber, offset } of iterateLinesWithOffsets(text)) {
    if (offset < bodyStartOffset) continue; // skip Contents + Dramatis sections
    const lineNorm = normalizeQuotes(line);
    // Check for THE PROLOGUE header
    if (/^THE PROLOGUE\s*$/i.test(lineNorm.trim())) {
      // Close previous scene if exists
      if (sceneStartOffset !== null) {
        const last = scenes[scenes.length - 1];
        if (last && last.endOffset == null) last.endOffset = offset - 1;
      }
      // Start Prologue scene
      act = 'Prologue';
      scene = '';
      onStage = new Set();
      currentSpeaker = null;
      sceneStartOffset = offset;
      scenes.push({ act: 'Prologue', scene: '', title: 'THE PROLOGUE', startOffset: offset, endOffset: null });
      continue;
    }
    const newAct = detectAct(lineNorm);
    if (newAct) {
      // Close previous scene (including Prologue if it was active)
      if (sceneStartOffset !== null) {
        const last = scenes[scenes.length - 1];
        if (last && last.endOffset == null) last.endOffset = offset - 1;
      }
      act = newAct;
      scene = null;
      onStage = new Set();
      currentSpeaker = null;
      sceneStartOffset = null; // Will be set when we hit a scene
      continue;
    }
    const newScene = detectScene(lineNorm);
    if (newScene) {
      // Close previous scene range
      if (sceneStartOffset !== null) {
        const last = scenes[scenes.length - 1];
        if (last && last.endOffset == null) last.endOffset = offset - 1;
      }
      scene = newScene;
      onStage = new Set();
      currentSpeaker = null;
      sceneStartOffset = offset;
      scenes.push({ act, scene, title: line.trim(), startOffset: offset, endOffset: null });
      continue;
    }

    const speaker = isSpeakerHeader(lineNorm, charCaps);
    if (speaker) {
      currentSpeaker = speaker;
      speeches.push({ offset, line: lineNumber, speaker });
      continue;
    }

    if (isStageDir(lineNorm)) {
      const kind = parseStageDirType(lineNorm);
      let names = matchCharactersIn(lineNorm, dramatis);
      if (kind === 'enter') {
        for (const n of names) onStage.add(n);
      } else if (kind === 'exit') {
        if (names.length === 0 && currentSpeaker) {
          onStage.delete(currentSpeaker);
          names = [currentSpeaker];
        } else {
          for (const n of names) onStage.delete(n);
        }
      } else if (kind === 'exeunt') {
        const hasAllBut = /all\s+but/i.test(lineNorm);
        if (names.length === 0) {
          // Exeunt with no names -> everyone leaves
          onStage = new Set();
        } else if (hasAllBut) {
          // Keep only the listed names on stage
          onStage = new Set(names);
        } else {
          for (const n of names) onStage.delete(n);
        }
      }
      stageEvents.push({
        offset,
        line: lineNumber,
        act,
        scene,
        kind,
        names,
        text: line, // original line content for CSV context
        onStage: Array.from(onStage).sort(),
      });
    }
  }
  // Close last scene
  if (scenes.length) {
    const last = scenes[scenes.length - 1];
    if (last && last.endOffset == null) last.endOffset = Buffer.byteLength(text, 'utf8');
  }

  // Build CSV
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR);
  const charCols = dramatis.map((d) => d.canonical);
  // Include the raw stage-direction line text to show input to the algorithm
  const header = ['Act', 'Scene', 'Line', 'ByteOffset', 'DirectionLine', ...charCols];
  const rows = [header.map(csvEscape).join(',')];
  for (const ev of stageEvents) {
    const base = [ev.act ?? '', ev.scene ?? '', String(ev.line), String(ev.offset), ev.text ?? ''];
    const on = new Set(ev.onStage);
    const flags = charCols.map((name) => (on.has(name) ? '1' : '0'));
    rows.push([...base, ...flags].map(csvEscape).join(','));
  }
  fs.writeFileSync(CSV_PATH, rows.join('\n'));

  // Metadata JSON
  const meta = {
    characters: dramatis,
    scenes,
    stageEvents,
    speeches,
  };
  fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2), 'utf8');
}

function csvEscape(val) {
  if (val == null) return '';
  const s = String(val);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

build();
