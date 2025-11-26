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

// UE config with exact patterns
const UE_FILTERS = [
  { code: 'DALAS', group: '3', patterns: ['DALAS', 'DALAS-Cours', 'DALAS_EN', 'UM4IN814-DALAS'] },
  { code: 'MLBDA', group: '3', patterns: ['MLBDA', 'MLBDA-Cours', 'UM4IN801-MLBDA'] },
  { code: 'LRC', group: '2', patterns: ['LRC', 'LRC-Cours'] },
  { code: 'MAPSI', group: '1', patterns: ['MAPSI', 'MAPSI-Cours', 'UM4IN601-MAPSI'] },
  { code: 'BIMA', group: '3', patterns: ['BIMA', 'BIMA-Cours', 'UM4IN600-BIMA'] }
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

function includesAny(text, patterns) {
  if (!text) return false;
  const hay = text.toLowerCase();
  return patterns.some(p => hay.includes(p.toLowerCase()));
}

// Detect group from TD/TME markers
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

function isTDorTME(text) {
  return /\b(TD|TME|TP)\b/i.test(text);
}

function matchUEAndGroup(summary, description, location) {
  const content = `${summary || ''} ${description || ''} ${location || ''}`;
  
  for (const { code, group, patterns } of UE_FILTERS) {
    if (!includesAny(content, patterns)) continue;
    
    // Exclude BIMA English
    if (code === 'BIMA' && /english/i.test(content)) continue;

    const grp = detectGroup(content);
    const isTD = isTDorTME(content);
    
    // For TD/TME: require exact group match
    if (isTD) {
      if (grp && grp === group) {
        return { code, group };
      }
      continue; // Skip if TD/TME but wrong group
    }
    
    // For CM/Cours and other types: include regardless of group
    return { code, group: grp || null };
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

function expandEvents(icsText) {
  const events = [];
  let jcal;
  try { jcal = ICAL.parse(icsText); } catch { return events; }
  const comp = new ICAL.Component(jcal);
  const vevents = comp.getAllSubcomponents('vevent');

  for (const v of vevents) {
    const ev = new ICAL.Event(v);
    const summary = String(ev.summary || '');
    const description = String(v.getFirstPropertyValue('description') || '');
    const location = String(v.getFirstPropertyValue('location') || '');

    const match = matchUEAndGroup(summary, description, location);
    if (!match) continue;

    // Handle recurring events
    if (ev.isRecurring()) {
      const iterator = new ICAL.RecurExpansion({
        component: v,
        dtstart: ev.startDate
      });
      
      let next;
      let count = 0;
      while ((next = iterator.next()) && count < 100) { // Limit to prevent infinite loops
        count++;
        const start = next.toJSDate();
        const end = ev.endDate ? ev.endDate.toJSDate() : new Date(start.getTime() + 2 * 60 * 60 * 1000); // Default 2h duration
        
        events.push({
          id: `${v.getFirstPropertyValue('uid') || Math.random().toString(36).slice(2)}-${+start}`,
          title: summary,
          start: start.toISOString(),
          end: end.toISOString(),
          location,
          ue: match.code,
          group: match.group
        });
      }
    } else {
      // Single event
      const start = toJsDate(ev.startDate);
      const end = toJsDate(ev.endDate);
      if (!start) continue;
      
      events.push({
        id: String(v.getFirstPropertyValue('uid') || Math.random().toString(36).slice(2)),
        title: summary,
        start: start.toISOString(),
        end: end ? end.toISOString() : new Date(start.getTime() + 2 * 60 * 60 * 1000).toISOString(),
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
  const outDirRoot = path.resolve(__dirname, '../data');
  await mkdir(outDir, { recursive: true });
  await mkdir(outDirRoot, { recursive: true });

  const all = [];
  for (const src of CAL_SOURCES) {
    try {
      const ics = await fetchIcs(src);
      const evs = expandEvents(ics);
      all.push(...evs);
    } catch (e) {
      console.error('Fetch failed', src, e.message);
    }
  }

  // Deduplicate events by unique key (title + start time)
  // Keep the latest version (last one wins)
  const eventMap = new Map();
  for (const ev of all) {
    const key = `${ev.title}|${ev.start}`;
    eventMap.set(key, ev); // Overwrites any previous version
  }
  const deduplicated = Array.from(eventMap.values());

  deduplicated.sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  const output = JSON.stringify({ generatedAt: new Date().toISOString(), count: deduplicated.length, events: deduplicated }, null, 2);
  
  // Write to both locations
  await writeFile(path.join(outDir, 'events.json'), output);
  await writeFile(path.join(outDirRoot, 'events.json'), output);
  console.log('Wrote ' + deduplicated.length + ' events (deduplicated from ' + all.length + ')');
}

build().catch(e => { console.error(e); process.exit(1); });
