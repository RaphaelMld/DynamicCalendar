const statusEl = document.getElementById('status');
const headEl = document.getElementById('calendarHead');
const bodyEl = document.getElementById('calendarBody');
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
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
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
  headEl.innerHTML = '';
  bodyEl.innerHTML = '';

  // Head row: corner + 7 day headers
  const corner = document.createElement('div');
  corner.className = 'day-header';
  corner.style.border = '1px solid transparent';
  headEl.appendChild(corner);

  for (let i = 0; i < 7; i++) {
    const day = addDays(weekStart, i);
    const h = document.createElement('div');
    h.className = 'day-header';
    h.textContent = formatDay(day);
    headEl.appendChild(h);
  }

  // Body: time column + 7 day columns
  const timeCol = document.createElement('div');
  timeCol.className = 'time-col';
  const hours = Array.from({ length: 12 }, (_, i) => i + 8);
  for (const h of hours) {
    const slot = document.createElement('div');
    slot.className = 'time-slot';
    slot.textContent = `${String(h).padStart(2, '0')}:00`;
    timeCol.appendChild(slot);
  }
  bodyEl.appendChild(timeCol);

  for (let i = 0; i < 7; i++) {
    const col = document.createElement('div');
    col.className = 'day-col';
    col.dataset.dayIndex = String(i);
    col.style.minHeight = `${hours.length * 60}px`;
    bodyEl.appendChild(col);
  }
}

function renderEvents(events, weekStart) {
  // Place events into day columns
  for (const ev of events) {
    const start = new Date(ev.start);
    const end = new Date(ev.end);
    if (start < weekStart || start >= addDays(weekStart, 7)) continue;

    const dayIndex = (start.getDay() + 6) % 7; // Monday=0
    const hourTop = start.getHours() + start.getMinutes() / 60;
    const durationH = Math.max(0.5, hoursBetween(start, end));

    const col = bodyEl.querySelector(`.day-col[data-day-index="${dayIndex}"]`);
    if (!col) continue;

    const evEl = document.createElement('div');
    evEl.className = 'event';
    evEl.style.top = `${(hourTop - 8) * 60}px`;
    evEl.style.height = `${durationH * 60}px`;

    evEl.innerHTML = `
      <div class="title">${ev.title || '(Sans titre)'} — ${ev.ue} (G${ev.group})</div>
      <div class="meta">${start.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} → ${end.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}${ev.location ? ' • ' + ev.location : ''}</div>
    `;

    col.appendChild(evEl);
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
