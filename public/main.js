const statusEl = document.getElementById('status');
const gridEl = document.getElementById('calendarGrid');
const prevBtn = document.getElementById('prevWeek');
const todayBtn = document.getElementById('today');
const nextBtn = document.getElementById('nextWeek');
const weekLabelEl = document.getElementById('weekLabel');

async function loadEvents() {
  const res = await fetch('./data/events.json');
  if (!res.ok) throw new Error(`${res.status}`);
  const data = await res.json();
  return data.events || [];
}

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 Sun .. 6 Sat
  const diff = (day === 0 ? -6 : 1) - day; // shift to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0,0,0,0);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatDay(d) {
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' });
}

function hoursBetween(a, b) {
  return (new Date(b) - new Date(a)) / 36e5;
}

function buildGridShell(weekStart) {
  gridEl.innerHTML = '';
  const hours = Array.from({ length: 12 }, (_, i) => i + 8); // 08:00 - 20:00

  // Header row: empty corner + 7 days
  const corner = document.createElement('div');
  corner.className = 'cell time day-header';
  gridEl.appendChild(corner);

  for (let i = 0; i < 7; i++) {
    const day = addDays(weekStart, i);
    const h = document.createElement('div');
    h.className = 'cell day-header';
    h.textContent = formatDay(day);
    gridEl.appendChild(h);
  }

  // Hour rows
  for (const h of hours) {
    const timeCell = document.createElement('div');
    timeCell.className = 'cell time';
    timeCell.textContent = `${String(h).padStart(2, '0')}:00`;
    gridEl.appendChild(timeCell);

    for (let i = 0; i < 7; i++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.dayIndex = String(i);
      cell.dataset.hour = String(h);
      gridEl.appendChild(cell);
    }
  }
}

function renderEvents(events, weekStart) {
  // Place events into day columns, positioned by time within cells
  const dayStart = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  for (const ev of events) {
    const start = new Date(ev.start);
    const end = new Date(ev.end);

    // Skip events outside selected week
    if (start < weekStart || start >= addDays(weekStart, 7)) continue;

    const dayIndex = (start.getDay() + 6) % 7; // Monday=0
    const hourTop = start.getHours() + start.getMinutes() / 60;
    const durationH = Math.max(0.5, hoursBetween(start, end));

    // Find the first grid cell of that day to compute relative offset
    const dayCells = [...gridEl.querySelectorAll(`.cell[data-day-index="${dayIndex}"]`)];
    if (dayCells.length === 0) continue;

    const firstCell = dayCells[0];
    const container = firstCell.parentElement; // gridEl

    // Create event block, position within the column
    const eventEl = document.createElement('div');
    eventEl.className = 'event';
    eventEl.style.top = `${(hourTop - 8) * 80}px`;
    eventEl.style.height = `${durationH * 80}px`;

    eventEl.style.gridColumn = `${dayIndex + 2} / span 1`;
    eventEl.style.gridRow = `auto`;

    eventEl.innerHTML = `
      <div class="title">${ev.title || '(Sans titre)'} — ${ev.ue} (G${ev.group})</div>
      <div class="meta">${start.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} → ${end.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}${ev.location ? ' • ' + ev.location : ''}</div>
    `;

    gridEl.appendChild(eventEl);
  }
}

function setWeekLabel(weekStart) {
  const weekEnd = addDays(weekStart, 6);
  const fmt = (d) => d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  weekLabelEl.textContent = `${fmt(weekStart)} – ${fmt(weekEnd)}`;
}

(async function init() {
  statusEl.textContent = 'Chargement des événements…';
  const allEvents = await loadEvents();
  statusEl.textContent = `${allEvents.length} événements chargés`;

  let currentWeekStart = startOfWeek(new Date());

  function rerender() {
    buildGridShell(currentWeekStart);
    setWeekLabel(currentWeekStart);
    renderEvents(allEvents, currentWeekStart);
  }

  prevBtn.addEventListener('click', () => { currentWeekStart = addDays(currentWeekStart, -7); rerender(); });
  todayBtn.addEventListener('click', () => { currentWeekStart = startOfWeek(new Date()); rerender(); });
  nextBtn.addEventListener('click', () => { currentWeekStart = addDays(currentWeekStart, 7); rerender(); });

  rerender();
})();
