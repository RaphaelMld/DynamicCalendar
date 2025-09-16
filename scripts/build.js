#!/usr/bin/env node
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration: sources and filters
const CAL_SOURCES = [
  'https://student.master:guest@cal.ufr-info-p6.jussieu.fr/caldav.php/DAC/M1_DAC',
  'https://student.master:guest@cal.ufr-info-p6.jussieu.fr/caldav.php/IMA/M1_IMA'
];

const UE_FILTERS = [
  { code: 'DALAS_EN', group: '3' },
  { code: 'MLBDA', group: '3' },
  { code: 'LRC', group: '2' },
  { code: 'MAPSI', group: '1' },
  { code: 'BIMA', group: '3' }
];

function includesAny(text, substrings) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return substrings.some(s => lower.includes(s.toLowerCase()));
}

function extractGroup(text) {
  if (!text) return null;
  const match = text.match(/\b(?:groupe|grp|gr)\s*([0-9])\b/i);
  return match ? match[1] : null;
}

function matchEventToFilters(summary, description) {
  const content = `${summary || ''} ${description || ''}`;
  for (const { code, group } of UE_FILTERS) {
    if (includesAny(content, [code])) {
      const grp = extractGroup(content);
      if (!grp || grp === group) {
        return { code, group };
      }
    }
  }
  return null;
}

async function fetchIcsFromCalDavCollection(collectionUrl) {
  // Many CalDAV servers allow .ics export for a collection by appending ?export or using .ics endpoints.
  // Try common patterns; fall back to plain GET.
  const candidates = [
    collectionUrl,
    collectionUrl.endsWith('/') ? collectionUrl.slice(0, -1) : collectionUrl,
  ].flatMap(base => [
    `${base}?export`,
    `${base}/?export`,
    `${base}.ics`,
    base
  ]);

  for (const url of candidates) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const text = await res.text();
        if (text.includes('BEGIN:VCALENDAR')) return text;
      }
    } catch (e) {
      // try next
    }
  }
  throw new Error(`Failed to retrieve ICS from ${collectionUrl}`);
}

function parseIcsAndFilter(icsText) {
  // Basic, streaming-free ICS parse: split by VEVENT and extract key fields with regex
  const events = [];
  const veventBlocks = icsText.split(/BEGIN:VEVENT/).slice(1);
  for (const block of veventBlocks) {
    const segment = 'BEGIN:VEVENT' + block;
    const endIndex = segment.indexOf('END:VEVENT');
    const vevent = endIndex >= 0 ? segment.slice(0, endIndex) : segment;

    const get = (prop) => {
      const re = new RegExp(`\\n${prop}(?:;[^:]+)?:([^\\n]+)`, 'i');
      const m = vevent.match(re);
      return m ? m[1].replace(/\\,/g, ',') : '';
    };

    const summary = get('SUMMARY');
    const description = get('DESCRIPTION');
    const location = get('LOCATION');
    const uid = get('UID') || `${Math.random().toString(36).slice(2)}`;

    const dtstartMatch = vevent.match(/\nDTSTART(?:;[^:]+)?:([^\n]+)/i);
    const dtendMatch = vevent.match(/\nDTEND(?:;[^:]+)?:([^\n]+)/i);
    const dtstamp = (raw) => {
      if (!raw) return null;
      // Support forms: 20250112T130000Z or 20250112T130000
      const z = raw.endsWith('Z');
      const iso = `${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}T${raw.slice(9,11)}:${raw.slice(11,13)}:${raw.slice(13,15)}${z ? 'Z' : ''}`;
      return new Date(iso).toISOString();
    };
    const start = dtstamp(dtstartMatch?.[1]);
    const end = dtstamp(dtendMatch?.[1]);

    const filter = matchEventToFilters(summary, description);
    if (!filter) continue;

    events.push({
      id: uid,
      title: summary,
      start,
      end,
      location,
      ue: filter.code,
      group: filter.group
    });
  }
  return events;
}

async function build() {
  const outDir = path.resolve(__dirname, '../public/data');
  await mkdir(outDir, { recursive: true });

  const allEvents = [];
  for (const src of CAL_SOURCES) {
    try {
      const ics = await fetchIcsFromCalDavCollection(src);
      const events = parseIcsAndFilter(ics);
      allEvents.push(...events);
    } catch (e) {
      console.error('Source fetch failed:', src, e.message);
    }
  }

  // sort by start date
  allEvents.sort((a, b) => (a.start || '').localeCompare(b.start || ''));

  const outfile = path.join(outDir, 'events.json');
  await writeFile(outfile, JSON.stringify({
    generatedAt: new Date().toISOString(),
    count: allEvents.length,
    events: allEvents
  }, null, 2));

  console.log(`Wrote ${allEvents.length} events to ${outfile}`);
}

build().catch(err => {
  console.error(err);
  process.exit(1);
});
