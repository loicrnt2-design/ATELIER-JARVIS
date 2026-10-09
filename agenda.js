/* agenda.js — module Agenda : calendrier mensuel, événements, sauvegarde. */
(function () {
  'use strict';
  const J = window.Jarvis;
  const KEY = 'jarvis.events.v1';
  const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
  const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

  // Une date est valide si le calendrier la reconnaît (rejette par ex. 2026-02-31).
  function isValidDate(key) {
    const m = DATE_RE.exec(key || '');
    if (!m) return false;
    const y = +m[1], mo = +m[2], d = +m[3];
    const dt = new Date(y, mo - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
  }

  // Chargement + nettoyage des données enregistrées.
  let events = J.storage.load(KEY, []);
  if (!Array.isArray(events)) events = [];
  events = events
    .filter((e) => e && typeof e.id === 'string' && typeof e.title === 'string' && e.title.trim() &&
      isValidDate(e.date) && TIME_RE.test(e.time))
    .map((e) => ({ id: e.id, title: e.title.slice(0, 100), date: e.date, time: e.time }));

  const today = new Date();
  let viewYear = today.getFullYear();
  let viewMonth = today.getMonth();
  let selected = J.dateKey(today);

  const sortFn = (a, b) => (a.date + a.time < b.date + b.time ? -1 : 1);

  function persist() {
    events.sort(sortFn);
    J.storage.save(KEY, events);
    J.bus.emit('events:changed');
  }

  const api = (J.agenda = {
    isValidDate,
    forDate: (key) => events.filter((e) => e.date === key).sort(sortFn),

    // Prochains événements à partir de maintenant.
    upcoming(n) {
      const now = J.dateKey(new Date()) + new Date().toTimeString().slice(0, 5);
      return events.filter((e) => e.date + e.time >= now).sort(sortFn).slice(0, n);
    },

    // Valide puis enregistre. Renvoie { ok, error?, event? }.
    add(title, date, time) {
      const t = String(title || '').replace(/\s+/g, ' ').trim();
      if (!t) return { ok: false, error: 'Le titre est obligatoire.' };
      if (!date) return { ok: false, error: 'La date est obligatoire.' };
      if (!isValidDate(date)) return { ok: false, error: 'La date est invalide.' };
      if (!time) return { ok: false, error: "L'heure est obligatoire." };
      if (!TIME_RE.test(time)) return { ok: false, error: "L'heure est invalide (format HH:MM)." };
      const ev = { id: J.uid(), title: t.slice(0, 100), date, time };
      events.push(ev);
      persist();
      return { ok: true, event: ev };
    },
    remove(id) {
      events = events.filter((e) => e.id !== id);
      persist();
    },

    select(key) {
      if (!isValidDate(key)) return;
      selected = key;
      const p = key.split('-').map(Number);
      viewYear = p[0];
      viewMonth = p[1] - 1;
      const d = J.$('event-date');
      if (d) d.value = key;
      api.render();
    },

    renderCalendar() {
      const grid = J.$('cal-days');
      const title = J.$('cal-title');
      if (title) {
        const label = new Date(viewYear, viewMonth, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
        title.textContent = label.toUpperCase();
      }
      if (!grid) return;
      J.clear(grid);
      const offset = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7; // semaine commençant le lundi
      const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
      for (let i = 0; i < offset; i++) grid.appendChild(J.el('span', 'cal-empty'));
      const todayKey = J.dateKey(new Date());
      for (let d = 1; d <= daysInMonth; d++) {
        const key = viewYear + '-' + J.pad2(viewMonth + 1) + '-' + J.pad2(d);
        const count = api.forDate(key).length;
        const b = J.el('button', 'cal-day', String(d));
        b.type = 'button';
        if (key === todayKey) b.classList.add('today');
        if (key === selected) b.classList.add('selected');
        if (count) b.classList.add('has-events');
        b.setAttribute('aria-label', J.formatKey(key) + (count ? ', ' + count + ' événement(s)' : ''));
        b.addEventListener('click', () => api.select(key));
        grid.appendChild(b);
      }
    },

    renderDay() {
      const list = J.$('day-events');
      const title = J.$('day-title');
      if (title) title.textContent = 'Événements — ' + J.formatKey(selected);
      if (!list) return;
      J.clear(list);
      const evs = api.forDate(selected);
      if (!evs.length) {
        list.appendChild(J.el('li', 'muted', 'Aucun événement ce jour.'));
        return;
      }
      evs.forEach((e) => {
        const li = J.el('li', 'item');
        const txt = J.el('span', 'txt');
        txt.appendChild(J.el('strong', null, e.time));
        txt.appendChild(document.createTextNode('  ' + e.title));
        const del = J.el('button', 'btn icon danger', '✕');
        del.type = 'button';
        del.setAttribute('aria-label', "Supprimer l'événement " + e.title);
        del.addEventListener('click', () => api.remove(e.id));
        li.appendChild(txt);
        li.appendChild(del);
        list.appendChild(li);
      });
    },

    render() { api.renderCalendar(); api.renderDay(); },

    init() {
      const shift = (delta) => {
        const d = new Date(viewYear, viewMonth + delta, 1);
        viewYear = d.getFullYear();
        viewMonth = d.getMonth();
        api.renderCalendar();
      };
      const prev = J.$('cal-prev'), next = J.$('cal-next'), todayBtn = J.$('cal-today');
      if (prev) prev.addEventListener('click', () => shift(-1));
      if (next) next.addEventListener('click', () => shift(1));
      if (todayBtn) todayBtn.addEventListener('click', () => api.select(J.dateKey(new Date())));

      const form = J.$('event-form');
      const msg = J.$('event-msg');
      const fTitle = J.$('event-title'), fDate = J.$('event-date'), fTime = J.$('event-time');
      if (fDate) fDate.value = selected;
      if (form) {
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const res = api.add(fTitle && fTitle.value, fDate && fDate.value, fTime && fTime.value);
          if (msg) {
            msg.textContent = res.ok ? 'Événement enregistré.' : res.error;
            msg.classList.toggle('err', !res.ok);
          }
          if (res.ok) {
            if (fTitle) fTitle.value = '';
            api.select(res.event.date);
          }
        });
      }
      J.bus.on('events:changed', api.render);
      api.render();
    }
  });
})();
