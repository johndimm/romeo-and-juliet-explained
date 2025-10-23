import fs from 'fs';
import path from 'path';

/**
 * Split the play text into sections.
 * A section is one or more non-blank lines, terminated by one or more blank lines.
 * Returns an array of strings (each section's text, preserving line breaks).
 */
export function parseSectionsFromFile(filename) {
  const fullPath = path.join(process.cwd(), filename);
  const raw = fs.readFileSync(fullPath, 'utf8');

  // Normalize newlines
  const text = raw.replace(/\r\n?/g, '\n');

  // Split on one-or-more blank lines, but keep internal line breaks.
  // Filter out any all-whitespace sections just in case.
  const sections = text
    .split(/\n\s*\n+/g)
    .map((s) => s.replace(/\s+$/g, ''))
    .filter((s) => s.trim().length > 0);

  return sections;
}

/**
 * Return sections with their starting byte offsets, and marker offsets for
 * 'Contents' and 'THE PROLOGUE' to help filtering the TOC block.
 */
export function parseSectionsWithOffsets(filename) {
  const fullPath = path.join(process.cwd(), filename);
  const raw = fs.readFileSync(fullPath, 'utf8');
  const text = raw.replace(/\r\n?/g, '\n');

  const lines = text.split('\n');
  let contentsStart = null;
  let prologueStart = null;
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (contentsStart == null && /^Contents\s*$/i.test(trimmed)) contentsStart = offset;
    if (prologueStart == null && /^THE PROLOGUE\s*$/i.test(trimmed)) {
      prologueStart = offset;
      break; // we don't need more once we found prologue
    }
    offset += Buffer.byteLength(line, 'utf8') + 1;
  }

  // Group sections with offsets
  const sections = [];
  let startOffset = 0;
  let current = [];
  let currentStartOffset = 0;
  offset = 0;
  for (let i = 0; i <= lines.length; i++) {
    const line = i < lines.length ? lines[i] : null;
    const isBlank = line == null || /^\s*$/.test(line);
    if (!isBlank) {
      if (current.length === 0) currentStartOffset = offset;
      current.push(line);
    }
    if (isBlank && current.length > 0) {
      const content = current.join('\n').replace(/\s+$/g, '');
      if (content.trim().length > 0) {
        sections.push({ text: content, startOffset: currentStartOffset });
      }
      current = [];
    }
    if (line != null) offset += Buffer.byteLength(line, 'utf8') + 1;
  }

  return {
    sections,
    markers: { contentsStart, prologueStart },
  };
}
