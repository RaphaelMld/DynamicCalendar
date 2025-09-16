const statusEl = document.getElementById('status');
const headEl = document.getElementById('calendarHead');
const bodyEl = document.getElementById('calendarBody');
const prevBtn = document.getElementById('prevWeek');
const todayBtn = document.getElementById('today');
const nextBtn = document.getElementById('nextWeek');
const weekLabelEl = document.getElementById('weekLabel');

// Configuration des cours et groupes de l'utilisateur
const MY_COURSES = {
  'DALAS': 3,
  'MLBDA': 3,
  'LRC': 2,
  'MAPSI': 1,
  'BIMA': 3
};

// Variables pour la navigation
let currentWeekStart = startOfWeek(new Date());
let currentDayIndex = 0;
let currentView = 'week'; // 'week' ou 'day'
let currentDay = new Date();
let myEvents = [];

async function loadEvents() {
  const res = await fetch('./data/events.json');
  if (!res.ok) throw new Error(`${res.status}`);
  const data = await res.json();
  return data.events || [];
}

// Fonction pour filtrer les événements selon les cours et groupes
function filterMyEvents(allEvents) {
  return allEvents.filter(event => {
    const title = event.title || '';
    
    // Chercher le nom du cours dans le titre
    let courseName = null;
    let groupNumber = null;
    
    for (const course of Object.keys(MY_COURSES)) {
      if (title.includes(course)) {
        courseName = course;
        break;
      }
    }
    
    // Si aucun cours reconnu, ignorer cet événement
    if (!courseName) return false;
    
    // Vérifier si c'est un cours (format: "COURSE-Cours")
    if (title.includes(`${courseName}-Cours`)) {
      return true; // Tous les cours sont acceptés
    }
    
    // Vérifier si c'est un TD/TME (format: "UM4IN814-COURSE-TD1" ou "UM4IN814-COURSE-TME1")
    if (title.includes('-TD') || title.includes('-TME')) {
      // Extraire le numéro de groupe à la fin
      const match = title.match(/(?:TD|TME)(\d+)$/);
      if (match) {
        groupNumber = parseInt(match[1]);
        // Vérifier si c'est le bon groupe
        return groupNumber === MY_COURSES[courseName];
      }
    }
    
    return false;
  });
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

function formatDayFull(d) {
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' });
}

function hoursBetween(a, b) {
  return (new Date(b) - new Date(a)) / 36e5;
}

function buildGridShell(weekStart, hoursRange) {
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
    h.dataset.dayIndex = String(i);
    h.style.cursor = 'pointer';
    h.addEventListener('click', () => switchToDay(i, weekStart));
    headEl.appendChild(h);
  }

  // Body: time column + 7 day columns
  const timeCol = document.createElement('div');
  timeCol.className = 'time-col';
  const startHour = hoursRange?.start ?? 8;
  const endHour = hoursRange?.end ?? 20;
  const hours = Array.from({ length: (endHour - startHour) + 1 }, (_, i) => i + startHour);
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
    col.style.minHeight = `${Math.max(1, hours.length) * 60}px`;
    bodyEl.appendChild(col);
  }
}

function renderEvents(events, weekStart, hoursRange) {
  // Place events into day columns
  for (const ev of events) {
    const start = new Date(ev.start);
    const end = new Date(ev.end || ev.start);
    if (start < weekStart || start >= addDays(weekStart, 7)) continue;

    const dayIndex = (start.getDay() + 6) % 7; // Monday=0
    const hourTop = start.getHours() + start.getMinutes() / 60;
    const durationH = Math.max(1.0, hoursBetween(start, end));

    const col = bodyEl.querySelector(`.day-col[data-day-index="${dayIndex}"]`);
    if (!col) continue;

    const evEl = document.createElement('div');
    evEl.className = 'event';
    const startHour = hoursRange?.start ?? 8;
    evEl.style.top = `${(hourTop - startHour) * 60}px`;
    evEl.style.height = `${durationH * 60}px`;

    // Extraire les informations du cours depuis le titre
    let courseInfo = ev.title || '(Sans titre)';
    let courseName = '';
    let eventType = '';
    
    for (const course of Object.keys(MY_COURSES)) {
      if (courseInfo.includes(course)) {
        courseName = course;
        if (courseInfo.includes('-Cours')) {
          eventType = 'Cours';
        } else if (courseInfo.includes('-TD')) {
          eventType = `TD (G${MY_COURSES[course]})`;
        } else if (courseInfo.includes('-TME')) {
          eventType = `TME (G${MY_COURSES[course]})`;
        }
        break;
      }
    }

    evEl.innerHTML = `
      <div class="title">${courseName} ${eventType}</div>
      <div class="meta">${start.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} → ${end.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}${ev.location ? ' • ' + ev.location : ''}</div>
    `;

    col.appendChild(evEl);
  }
}

function renderDayView(events, day) {
  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(day);
  dayEnd.setHours(23, 59, 59, 999);
  
  const dayEvents = events.filter(ev => {
    const start = new Date(ev.start);
    return start >= dayStart && start < dayEnd;
  }).sort((a, b) => new Date(a.start) - new Date(b.start));

  // Créer ou mettre à jour la vue jour
  let dayView = document.getElementById('dayView');
  if (!dayView) {
    dayView = document.createElement('div');
    dayView.id = 'dayView';
    dayView.className = 'day-view';
    document.querySelector('main').appendChild(dayView);
  }

  dayView.innerHTML = `
    <div class="day-view-header">
      ${formatDayFull(day)}
    </div>
    <div class="day-view-events">
      ${dayEvents.length === 0 ? 
        '<div style="text-align: center; color: #64748b; padding: 20px;">Aucun événement ce jour</div>' :
        dayEvents.map(ev => {
          const start = new Date(ev.start);
          const end = new Date(ev.end || ev.start);
          let courseName = '';
          let eventType = '';
          
          for (const course of Object.keys(MY_COURSES)) {
            if (ev.title.includes(course)) {
              courseName = course;
              if (ev.title.includes('-Cours')) {
                eventType = 'Cours';
              } else if (ev.title.includes('-TD')) {
                eventType = `TD (G${MY_COURSES[course]})`;
              } else if (ev.title.includes('-TME')) {
                eventType = `TME (G${MY_COURSES[course]})`;
              }
              break;
            }
          }
          
          return `
            <div class="day-event">
              <div class="title">${courseName} ${eventType}</div>
              <div class="time">${start.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} → ${end.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
              ${ev.location ? `<div class="location">📍 ${ev.location}</div>` : ''}
            </div>
          `;
        }).join('')
      }
    </div>
  `;
}

function switchToDay(dayIndex, weekStart) {
  currentDayIndex = dayIndex;
  currentDay = addDays(weekStart, dayIndex);
  
  // Mettre à jour l'état visuel des jours
  document.querySelectorAll('.day-header').forEach((header, index) => {
    if (index === 0) return; // Skip corner
    header.classList.toggle('active', index - 1 === dayIndex);
  });
  
  if (currentView === 'day') {
    renderDayView(myEvents, currentDay);
  }
}

function setWeekLabel(weekStart) {
  const weekEnd = addDays(weekStart, 6);
  const fmt = (d) => d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  weekLabelEl.textContent = `${fmt(weekStart)} – ${fmt(weekEnd)}`;
}

function getHoursRangeForWeek(events, weekStart) {
  let minH = Infinity;
  let maxH = -Infinity;
  for (const ev of events) {
    const s = new Date(ev.start);
    if (s < weekStart || s >= addDays(weekStart, 7)) continue;
    const e = new Date(ev.end || ev.start);
    minH = Math.min(minH, s.getHours());
    maxH = Math.max(maxH, e.getHours() + (e.getMinutes() > 0 ? 1 : 0));
  }
  if (!isFinite(minH) || !isFinite(maxH)) return { start: 8, end: 20 };
  minH = Math.max(7, Math.min(9, minH));
  maxH = Math.min(21, Math.max(18, maxH));
  if (minH >= maxH) return { start: 8, end: 20 };
  return { start: minH, end: maxH };
}

function findNearestWeekWithEvents(events, aroundDate) {
  const base = startOfWeek(aroundDate);
  for (let i = 0; i <= 16; i++) {
    const forward = addDays(base, i * 7);
    const hasFwd = events.some(ev => {
      const s = new Date(ev.start);
      return s >= forward && s < addDays(forward, 7);
    });
    if (hasFwd) return forward;
    if (i === 0) continue;
    const backward = addDays(base, -i * 7);
    const hasBack = events.some(ev => {
      const s = new Date(ev.start);
      return s >= backward && s < addDays(backward, 7);
    });
    if (hasBack) return backward;
  }
  return base;
}

// Fonction rerender définie avant les autres fonctions qui l'utilisent
function rerender() {
  if (currentView === 'week') {
    // Réafficher le calendrier
    const calendar = document.querySelector('.calendar');
    if (calendar) calendar.style.display = 'block';
    
    const hoursRange = getHoursRangeForWeek(myEvents, currentWeekStart);
    buildGridShell(currentWeekStart, hoursRange);
    setWeekLabel(currentWeekStart);
    renderEvents(myEvents, currentWeekStart, hoursRange);
    
    // Masquer la vue jour
    const dayView = document.getElementById('dayView');
    if (dayView) dayView.style.display = 'none';
  } else {
    // Masquer le calendrier
    const calendar = document.querySelector('.calendar');
    if (calendar) calendar.style.display = 'none';
    
    // Afficher la vue jour
    renderDayView(myEvents, currentDay);
    const dayView = document.getElementById('dayView');
    if (dayView) dayView.style.display = 'block';
  }
}

function createViewToggleButtons() {
  const controls = document.querySelector('.controls');
  
  // Bouton Vue Semaine
  const weekViewBtn = document.createElement('button');
  weekViewBtn.id = 'weekViewBtn';
  weekViewBtn.textContent = 'Semaine';
  weekViewBtn.className = 'active';
  weekViewBtn.addEventListener('click', () => switchToView('week'));
  
  // Bouton Vue Jour
  const dayViewBtn = document.createElement('button');
  dayViewBtn.id = 'dayViewBtn';
  dayViewBtn.textContent = 'Jour';
  dayViewBtn.addEventListener('click', () => switchToView('day'));
  
  // Insérer les boutons après le label de semaine
  controls.insertBefore(weekViewBtn, weekLabelEl);
  controls.insertBefore(dayViewBtn, weekLabelEl);
}

function switchToView(view) {
  currentView = view;
  
  // Mettre à jour les boutons
  document.getElementById('weekViewBtn').classList.toggle('active', view === 'week');
  document.getElementById('dayViewBtn').classList.toggle('active', view === 'day');
  
  // Mettre à jour les boutons de navigation
  if (view === 'week') {
    prevBtn.textContent = '◀ Semaine';
    nextBtn.textContent = 'Semaine ▶';
  } else {
    prevBtn.textContent = '◀ Jour';
    nextBtn.textContent = 'Jour ▶';
  }
  
  rerender();
}

(async function init() {
  statusEl.textContent = 'Chargement des événements…';
  const allEvents = await loadEvents();
  
  // Filtrer les événements pour ne garder que ceux qui nous concernent
  myEvents = filterMyEvents(allEvents);
  
  statusEl.textContent = `${myEvents.length} événements pertinents (sur ${allEvents.length} total)`;

  // Créer les boutons de basculement
  createViewToggleButtons();

  const hasThisWeek = myEvents.some(ev => {
    const s = new Date(ev.start);
    return s >= currentWeekStart && s < addDays(currentWeekStart, 7);
  });
  if (!hasThisWeek) {
    currentWeekStart = findNearestWeekWithEvents(myEvents, new Date());
  }

  prevBtn.addEventListener('click', () => { 
    if (currentView === 'week') {
      currentWeekStart = addDays(currentWeekStart, -7);
    } else {
      currentDay = addDays(currentDay, -1);
    }
    rerender(); 
  });
  
  todayBtn.addEventListener('click', () => { 
    if (currentView === 'week') {
      currentWeekStart = startOfWeek(new Date());
    } else {
      currentDay = new Date();
    }
    rerender(); 
  });
  
  nextBtn.addEventListener('click', () => { 
    if (currentView === 'week') {
      currentWeekStart = addDays(currentWeekStart, 7);
    } else {
      currentDay = addDays(currentDay, 1);
    }
    rerender(); 
  });

  rerender();
})();
