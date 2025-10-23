#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

function readText() {
  const fullPath = path.join(process.cwd(), 'romeo-and-juliet.txt');
  return fs.readFileSync(fullPath, 'utf8').replace(/\r\n?/g, '\n');
}

function splitSections(text) {
  return text
    .split(/\n\s*\n+/g)
    .map((s) => s.replace(/\s+$/g, ''))
    .filter((s) => s.trim().length > 0);
}

function findMatchesInText(text, query) {
  if (!query || !query.trim()) return { total: 0, matches: [] };
  const q = query.trim();
  const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  const matches = [];
  let m;
  while ((m = regex.exec(text)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    const ctxStart = Math.max(0, start - 30);
    const ctxEnd = Math.min(text.length, end + 30);
    const context = text.slice(ctxStart, ctxEnd).replace(/\n/g, ' ');
    matches.push({ index: start, length: m[0].length, context });
  }
  return { total: matches.length, matches };
}

function main() {
  const query = process.argv.slice(2).join(' ');
  if (!query) {
    console.error('Usage: node scripts/search-snapshot.mjs <query>');
    process.exit(1);
  }
  const text = readText();
  const sections = splitSections(text);
  let totalMatches = 0;
  const perSection = [];
  let offset = 0;
  for (const section of sections) {
    const { total, matches } = findMatchesInText(section, query);
    totalMatches += total;
    perSection.push({ matches: total, firstContexts: matches.slice(0, 2).map((m) => m.context) });
    offset += section.length + 2; // approx for blank line split
  }
  const result = {
    query,
    sections: sections.length,
    totalMatches,
    sample: perSection.slice(0, 5),
  };
  console.log(JSON.stringify(result, null, 2));
}

main();

