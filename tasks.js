/* tasks.js — module Tâches : ajout, terminaison, suppression, sauvegarde. */
(function () {
  'use strict';
  const J = window.Jarvis;
  const KEY = 'jarvis.tasks.v1';

  // Données chargées puis nettoyées : on ignore tout ce qui n'a pas la bonne forme.
  let tasks = (J.storage.load(KEY, []) || []);
  if (!Array.isArray(tasks)) tasks = [];
  tasks = tasks
    .filter((t) => t && typeof t.id === 'string' && typeof t.text === 'string' && t.text.trim())
    .map((t) => ({ id: t.id, text: t.text.slice(0, 200), done: t.done === true }));

  function persist() {
    J.storage.save(KEY, tasks);
    J.bus.emit('tasks:changed');
  }

  const api = (J.tasks = {
    all: () => tasks.slice(),
    pending: () => tasks.filter((t) => !t.done),

    // Ajoute une tâche ; renvoie la tâche ou null si le texte est vide.
    add(text) {
      const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
      if (!clean) return null;
      const task = { id: J.uid(), text: clean, done: false };
      tasks.push(task);
      persist();
      return task;
    },
    toggle(id) {
      const t = tasks.find((x) => x.id === id);
      if (t) { t.done = !t.done; persist(); }
    },
    remove(id) {
      tasks = tasks.filter((x) => x.id !== id);
      persist();
    },

    render() {
      const list = J.$('task-list');
      const empty = J.$('task-empty');
      const count = J.$('task-count');
      const left = api.pending().length;
      if (count) count.textContent = left + (left > 1 ? ' tâches restantes' : left === 1 ? ' tâche restante' : ' tâche restante');
      if (empty) empty.hidden = tasks.length > 0;
      if (!list) return;
      J.clear(list);
      tasks.forEach((t) => {
        const li = J.el('li', 'item' + (t.done ? ' done' : ''));
        const label = J.el('label', 'check');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = t.done;
        cb.addEventListener('change', () => api.toggle(t.id));
        label.appendChild(cb);
        label.appendChild(J.el('span', 'txt', t.text));
        const del = J.el('button', 'btn icon danger', '✕');
        del.type = 'button';
        del.setAttribute('aria-label', 'Supprimer la tâche ' + t.text);
        del.addEventListener('click', () => api.remove(t.id));
        li.appendChild(label);
        li.appendChild(del);
        list.appendChild(li);
      });
    },

    init() {
      const form = J.$('task-form');
      const input = J.$('task-input');
      const msg = J.$('task-msg');
      if (form) {
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const t = api.add(input ? input.value : '');
          if (msg) msg.textContent = t ? '' : 'Saisissez le texte de la tâche.';
          if (t && input) input.value = '';
          if (input) input.focus();
        });
      }
      J.bus.on('tasks:changed', api.render);
      api.render();
    }
  });
})();
