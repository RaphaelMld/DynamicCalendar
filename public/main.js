const statusEl = document.getElementById('status');
const eventsEl = document.getElementById('events');
const ueFilterEl = document.getElementById('ueFilter');
const groupFilterEl = document.getElementById('groupFilter');

async function loadEvents() {
  try {
    const res = await fetch('/data/events.json');
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    return data.events || [];
  } catch (e) {
    statusEl.textContent = 'Impossible de charger les événements.';
    throw e;
  }
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function render(events) {
  eventsEl.innerHTML = '';
  if (!events.length) {
    eventsEl.textContent = 'Aucun événement';
    return;
  }
  for (const ev of events) {
    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = `
      <div class="title">${ev.title || '(Sans titre)'} </div>
      <div class="meta">
        <span>${formatDate(ev.start)} → ${formatDate(ev.end)}</span>
        <span>UE: ${ev.ue}</span>
        <span>Groupe: ${ev.group || '-'}</span>
        <span>${ev.location || ''}</span>
      </div>
    `;
    eventsEl.appendChild(div);
  }
}

function applyFilters(events) {
  const ue = ueFilterEl.value;
  const g = groupFilterEl.value;
  return events.filter(e => (
    (!ue || e.ue === ue) && (!g || e.group === g)
  ));
}

(async function init() {
  statusEl.textContent = 'Chargement des événements…';
  const events = await loadEvents();
  statusEl.textContent = `${events.length} événements chargés`;
  render(applyFilters(events));

  ueFilterEl.addEventListener('change', () => render(applyFilters(events)));
  groupFilterEl.addEventListener('change', () => render(applyFilters(events)));
})();
