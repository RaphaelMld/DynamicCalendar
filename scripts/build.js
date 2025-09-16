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
  { code: 'DALAS', group: '3', aliases: ['DALAS', 'DALAS_EN', 'UM4IN814-DALAS'] },
  { code: 'MLBDA', group: '3', aliases: ['MLBDA'] },
  { code: 'LRC', group: '2', aliases: ['LRC'] },
  { code: 'MAPSI', group: '1', aliases: ['MAPSI'] },
  { code: 'BIMA', group: '3', aliases: ['BIMA', 'UM4IN600-BIMA'] }
];

function authFromUrl(urlString) {
  try {
    const u = new URL(urlString);
    const { username, password } = u;
    u.username = '';
    u.password = '';
    const clean = u.toString().replace(/@/, '');
    const header = username
      ? { Authorization: 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64') }
      : {};
    return { cleanUrl: clean, headers: header };
  } catch {
    return { cleanUrl: urlString, headers: {} };
  }
}

function includesAny(text, substrings) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return substrings.some(s => lower.includes(String(s).toLowerCase()));
}

function extractGroupStrict(text) {
  if (!text) return null;
  const patterns = [
    /\b(?:groupe|grp|gr|g)\s*([0-9])\b/i,
    /\bTD\s*([0-9])\b/i,
    /\bTME\s*([0-9])\b/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[1];
  }
  return null;
}

function detectType(text) {
  if (!text) return 'AUTRE';
  if (/\bCM\b/i.test(text) || /-Cours\b/i.test(text) || /\bCours\b/i.test(text) || /\bLecture\b/i.test(text)) return 'CM';
  if (/\bTD\b/i.test(text)) return 'TD';
  if (/\bTME\b/i.test(text) || /\bTP\b/i.test(text)) return 'TME';
  return 'AUTRE';
}

function matchEventToFilters(summary, description, location) {
  const content = `${summary || ''} ${description || ''} ${location || ''}`;
  for (const { code, group, aliases } of UE_FILTERS) {
    if (includesAny(content, aliases || [code])) {
      const type = detectType(content);
      // Exclude BIMA English CM
      if (code === 'BIMA' && type === 'CM' && /english/i.test(content)) {
        continue;
      }
      // Always include CM for the UE
      if (type === 'CM') {
        return { code, group: null, type };
      }
      // For TD/TME, require strict matching group
      const grp = extractGroupStrict(content);
      if (grp && grp === group) {
        return { code, group, type };
      }
    }
  }
  return null;
}

async function fetchIcsFromCalDavCollection(collectionUrl) {
  const { cleanUrl, headers } = authFromUrl(collectionUrl);
  const normalized = cleanUrl.endsWith('/') ? cleanUrl.slice(0, -1) : cleanUrl;
  const candidates = [
    `${normalized}?export`,
    `${normalized}/?export`,
    `${normalized}.ics`,
    normalized
  ];

  for (const url of candidates) {
    try {
      const res = await fetch(url, { headers });
      if (res.ok) {
        const text = await res.text();
        if (text.includes('BEGIN:VCALENDAR')) return text;
      }
    } catch {}
  }
  throw new Error(`Failed to retrieve ICS from ${collectionUrl}`);
}

function parseIcsAndFilter(icsText) {
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
      const z = raw.endsWith('Z');
      const datePart = `${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}`;
      const timePart = raw.includes('T') && raw.length >= 15 ? `${raw.slice(9,11)}:${raw.slice(11,13)}:${raw.slice(13,15)}` : '00:00:00';
      const iso = `${datePart}T${timePart}${z ? 'Z' : ''}`;
      return new Date(iso).toISOString();
    };
    const start = dtstamp(dtstartMatch?.[1]);
    const end = dtstamp(dtendMatch?.[1]);

    const filter = matchEventToFilters(summary, description, location);
    if (!filter) continue;

    events.push({
      id: uid,
      title: summary,
      start,
      end,
      location,
      ue: filter.code,
      group: filter.group,
      type: filter.type
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
