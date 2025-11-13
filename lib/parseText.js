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

  // Helper function to check if a line is a speaker header (ALL CAPS name followed by period)
  function isSpeakerHeader(line) {
    const t = line.trim();
    return /^[A-Z][A-Z\s'\-]+\.$/.test(t);
  }

  // Helper function to check if a line is a scene/act header
  function isSceneOrActHeader(line) {
    const t = line.trim();
    return /^(ACT|SCENE)\s+[IVXLC]+/i.test(t) || /^THE PROLOGUE\s*$/i.test(t);
  }

  // Group sections with offsets
  // Only split sections on blank lines if followed by a speaker header or scene header
  // This allows speeches to continue across blank lines and stage directions
  const sections = [];
  let current = [];
  let currentStartOffset = 0;
  offset = 0;
  
  for (let i = 0; i <= lines.length; i++) {
    const line = i < lines.length ? lines[i] : null;
    const isBlank = line == null || /^\s*$/.test(line);
    
    if (!isBlank) {
      // If this is a speaker header or scene header, start a new section
      if (isSpeakerHeader(line) || isSceneOrActHeader(line)) {
        // End previous section if it exists
        if (current.length > 0) {
          const content = current.join('\n').replace(/\s+$/g, '');
          if (content.trim().length > 0) {
            sections.push({ text: content, startOffset: currentStartOffset });
          }
          current = [];
        }
        // Start new section with this header
        currentStartOffset = offset;
        current.push(line);
      } else {
        // Regular content line - add to current section
        if (current.length === 0) currentStartOffset = offset;
        current.push(line);
      }
    } else if (isBlank && current.length > 0) {
      // We hit a blank line. Look ahead to see if next non-blank is a speaker/scene header
      let nextNonBlankIdx = i + 1;
      while (nextNonBlankIdx < lines.length && /^\s*$/.test(lines[nextNonBlankIdx])) {
        nextNonBlankIdx++;
      }
      
      if (nextNonBlankIdx < lines.length) {
        const nextNonBlank = lines[nextNonBlankIdx];
        // Only end section if next is a speaker header or scene header
        if (isSpeakerHeader(nextNonBlank) || isSceneOrActHeader(nextNonBlank)) {
          const content = current.join('\n').replace(/\s+$/g, '');
          if (content.trim().length > 0) {
            sections.push({ text: content, startOffset: currentStartOffset });
          }
          current = [];
        } else {
          // Next is not a speaker/scene header, so continue the section (include blank lines)
          current.push(line);
        }
      } else {
        // End of file - end the section
        const content = current.join('\n').replace(/\s+$/g, '');
        if (content.trim().length > 0) {
          sections.push({ text: content, startOffset: currentStartOffset });
        }
        current = [];
      }
    }
    
    if (line != null) offset += Buffer.byteLength(line, 'utf8') + 1;
  }
  
  // Don't forget the last section if there's no trailing blank line
  if (current.length > 0) {
    const content = current.join('\n').replace(/\s+$/g, '');
    if (content.trim().length > 0) {
      sections.push({ text: content, startOffset: currentStartOffset });
    }
  }

  return {
    sections,
    markers: { contentsStart, prologueStart },
  };
}
