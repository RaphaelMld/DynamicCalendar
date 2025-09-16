#!/usr/bin/env node
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import ICAL from 'ical.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Sources
const CAL_SOURCES = [
  'https://student.master:guest@cal.ufr-info-p6.jussieu.fr/caldav.php/DAC/M1_DAC',
  'https://student.master:guest@cal.ufr-info-p6.jussieu.fr/caldav.php/IMA/M1_IMA'
];

// UE config with aliases
const UE_FILTERS = [
  { code: 'DALAS', group: '3', aliases: ['DALAS', 'DALAS_EN', 'UM4IN814-DALAS'] },
  { code: 'MLBDA', group: '3', aliases: ['MLBDA', 'UM4IN801-MLBDA'] },
  { code: 'LRC', group: '2', aliases: ['LRC'] },
  { code: 'MAPSI', group: '1', aliases: ['MAPSI', 'UM4IN601-MAPSI'] },
  { code: 'BIMA', group: '3', aliases: ['BIMA', 'UM4IN600-BIMA'] }
];

function authFromUrl(urlString) {
  try {
    const u = new URL(urlString);
    const { username, password } = u;
    u.username = '';
    u.password = '';
    const clean = u.toString().replace(/@/, '');
    const header = username ? { Authorization: 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64') } : {};
    return { cleanUrl: clean, headers: header };
  } catch {
    return { cleanUrl: urlString, headers: {} };
  }
}

function includesAny(text, needles) {
  if (!text) return false;
  const hay = text.toLowerCase();
  return (needles || []).some(n => hay.includes(String(n).toLowerCase()));
}

// Only count explicit markers as groups (avoid picking numbers from course codes)
function detectGroup(text) {
  if (!text) return null;
  const patterns = [
    /\b(?:groupe|grp|gr|g)\s*([0-9])\b/i,
    /\(\s*G\s*([0-9])\s*\)/i,
    /\bG\s*([0-9])\b/i,
    /\bTD\s*([0-9])\b/i,
    /\bTME\s*([0-9])\b/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[1];
  }
  return null;
}

function matchUEAndGroup(summary, description, location) {
  const content = `${summary || ''} ${description || ''} ${location || ''}`;
  for (const { code, group, aliases } of UE_FILTERS) {
    if (!includesAny(content, aliases || [code])) continue;
    // Exclude BIMA English
    if (code === 'BIMA' && /english/i.test(content)) continue;

    const grp = detectGroup(content);
    // If a group is explicitly present, require it to match
    if (grp) {
      if (grp === group) return { code, group };
      continue;
    }
    // No group markers => include (typically CM)
    return { code, group: null };
  }
  return null;
}

async function fetchIcs(collectionUrl) {
  const { cleanUrl, headers } = authFromUrl(collectionUrl);
  const base = cleanUrl.endsWith('/') ? cleanUrl.slice(0, -1) : cleanUrl;
  const candidates = [`${base}?export`, `${base}/?export`, `${base}.ics`, base];
  for (const url of candidates) {
    try {
      const res = await fetch(url, { headers });
      if (res.ok) {
        const text = await res.text();
        if (text.includes('BEGIN:VCALENDAR')) return text;
      }
    } catch {}
  }
  throw new Error('ICS fetch failed for ' + collectionUrl);
}

function toJsDate(icalTime) {
  try { return icalTime && icalTime.toJSDate ? icalTime.toJSDate() : null; } catch { return null; }
}

function expandEvents(icsText, windowStart, windowEnd) {
  const events = [];
  let jcal;
  try { jcal = ICAL.parse(icsText); } catch { return events; }
  const comp = new ICAL.Component(jcal);
  const vevents = comp.getAllSubcomponents('vevent');

  for (const v of vevents) {
    const ev = new ICAL.Event(v);
    // Skip overridden instances; iterate from master only
    if (v.hasProperty('recurrence-id')) continue;

    const summary = String(ev.summary || '');
    const description = String(v.getFirstPropertyValue('description') || '');
    const location = String(v.getFirstPropertyValue('location') || '');

    const duration = ev.endDate && ev.startDate ? ev.endDate.subtractDate(ev.startDate) : null;

    if (ev.isRecurring()) {
      const it = ev.iterator(windowStart);
      for (let next = it.next(); next; next = it.next()) {
        const occStart = toJsDate(next);
        if (!occStart) continue;
        if (occStart > windowEnd.toJSDate()) break;
        if (occStart < windowStart.toJSDate()) continue;

        const occEnd = duration ? next.clone().addDuration(duration) : null;
        const endJs = occEnd ? toJsDate(occEnd) : null;

        const match = matchUEAndGroup(summary, description, location);
        if (!match) continue;
        events.push({
          id: `${v.getFirstPropertyValue('uid') || Math.random().toString(36).slice(2)}-${+occStart}`,
          title: summary,
          start: occStart.toISOString(),
          end: endJs ? endJs.toISOString() : null,
          location,
          ue: match.code,
          group: match.group
        });
      }
    } else {
      const startJs = toJsDate(ev.startDate);
      const endJs = toJsDate(ev.endDate);
      if (!startJs) continue;
      if (startJs < windowStart.toJSDate() || startJs > windowEnd.toJSDate()) continue;
      const match = matchUEAndGroup(summary, description, location);
      if (!match) continue;
      events.push({
        id: String(v.getFirstPropertyValue('uid') || Math.random().toString(36).slice(2)),
        title: summary,
        start: startJs.toISOString(),
        end: endJs ? endJs.toISOString() : null,
        location,
        ue: match.code,
        group: match.group
      });
    }
  }
  return events;
}

async function build() {
  const outDir = path.resolve(__dirname, '../public/data');
  await mkdir(outDir, { recursive: true });

  // Expand for a wide academic window (past 3 months to next 9 months)
  const now = ICAL.Time.fromJSDate(new Date());
  const windowStart = now.clone(); windowStart.year -= 0; windowStart.month -= 3; // approx 3 months back
  const windowEnd = now.clone(); windowEnd.year += 1; windowEnd.month -= 3; // approx +9 months

  const all = [];
  for (const src of CAL_SOURCES) {
    try {
      const ics = await fetchIcs(src);
      const evs = expandEvents(ics, windowStart, windowEnd);
      all.push(...evs);
    } catch (e) {
      console.error('Fetch failed', src, e.message);
    }
  }

  all.sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  await writeFile(path.join(outDir, 'events.json'), JSON.stringify({ generatedAt: new Date().toISOString(), count: all.length, events: all }, null, 2));
  console.log('Wrote ' + all.length + ' events');
}

build().catch(e => { console.error(e); process.exit(1); });
