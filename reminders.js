/* reminders.js — rappels : alerte à l'écran, son et notification du navigateur.
   Limite : ils ne sonnent que si cet onglet est ouvert (pas de service en arrière-plan). */
(function () {
  'use strict';
  const J = window.Jarvis;
  const KEY = 'jarvis.reminders.v1';

  let items = J.storage.load(KEY, []);
  if (!Array.isArray(items)) items = [];
  items = items
    .filter((r) => r && typeof r.id === 'string' && typeof r.text === 'string' && r.text.trim() && Number.isFinite(r.at))
    .map((r) => ({ id: r.id, text: r.text.slice(0, 200), at: r.at, fired: r.fired === true }));

  const fmt = (ms) => new Date(ms).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  function persist() {
    items.sort((a, b) => a.at - b.at);
    J.storage.save(KEY, items);
    J.bus.emit('reminders:changed');
  }

  function beep() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.8);
      osc.onended = () => ctx.close();
    } catch (e) { /* son indisponible : l'alerte visuelle suffit */ }
  }

  function toast(text) {
    const zone = J.$('toasts');
    if (!zone) return;
    const t = J.el('div', 'toast');
    t.appendChild(J.el('strong', null, '⏰ RAPPEL'));
    t.appendChild(J.el('span', null, text));
    const close = J.el('button', 'btn icon', '✕');
    close.type = 'button';
    close.setAttribute('aria-label', 'Fermer le rappel');
    close.addEventListener('click', () => t.remove());
    t.appendChild(close);
    zone.appendChild(t);
  }

  function fire(r, missed) {
    r.fired = true;
    const text = (missed ? 'Rappel manqué (' + fmt(r.at) + ') : ' : 'Rappel : ') + r.text;
    toast(text);
    beep();
    try {
      if ('Notification' in window && Notification.permission === 'granted') new Notification('JARVIS', { body: text });
    } catch (e) { /* notifications non disponibles */ }
    if (J.assistant && J.assistant.say) J.assistant.say('⏰ ' + text);
    if (J.voice) J.voice.speak(text);
  }

  function check() {
    const now = Date.now();
    let changed = false;
    items.forEach((r) => { if (!r.fired && r.at <= now) { fire(r, now - r.at > 120000); changed = true; } });
    if (changed) persist();
  }

  const api = (J.reminders = {
    fmt,
    all: () => items.slice(),
    active: () => items.filter((r) => !r.fired),

    // Ajoute un rappel ; at = Date ou timestamp. Renvoie { ok, error?, reminder? }.
    add(text, at) {
      const t = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
      const ms = at instanceof Date ? at.getTime() : Number(at);
      if (!t) return { ok: false, error: 'Le texte du rappel est obligatoire.' };
      if (!Number.isFinite(ms)) return { ok: false, error: 'La date et l\'heure sont invalides.' };
      if (ms <= Date.now()) return { ok: false, error: 'La date du rappel est déjà passée.' };
      const r = { id: J.uid(), text: t, at: ms, fired: false };
      items.push(r);
      persist();
      api.askPermission();
      return { ok: true, reminder: r };
    },
    remove(id) { items = items.filter((r) => r.id !== id); persist(); },

    askPermission() {
      try {
        if ('Notification' in window && Notification.permission === 'default') return Notification.requestPermission();
      } catch (e) { /* ignoré */ }
      return null;
    },

    render() {
      const list = J.$('reminder-list');
      if (!list) return;
      J.clear(list);
      if (!items.length) { list.appendChild(J.el('li', 'muted', 'Aucun rappel.')); return; }
      items.forEach((r) => {
        const li = J.el('li', 'item' + (r.fired ? ' done' : ''));
        const txt = J.el('span', 'txt');
        txt.appendChild(J.el('strong', null, fmt(r.at)));
        txt.appendChild(document.createTextNode('  ' + r.text + (r.fired ? ' (déclenché)' : '')));
        const del = J.el('button', 'btn icon danger', '✕');
        del.type = 'button';
        del.setAttribute('aria-label', 'Supprimer le rappel ' + r.text);
        del.addEventListener('click', () => api.remove(r.id));
        li.appendChild(txt); li.appendChild(del);
        list.appendChild(li);
      });
    },

    init() {
      const form = J.$('reminder-form'), text = J.$('reminder-text'), at = J.$('reminder-at'), msg = J.$('reminder-msg');
      if (form) form.addEventListener('submit', (e) => {
        e.preventDefault();
        const res = api.add(text && text.value, at && at.value ? new Date(at.value) : NaN);
        if (msg) { msg.textContent = res.ok ? 'Rappel programmé pour le ' + fmt(res.reminder.at) + '.' : res.error; msg.classList.toggle('err', !res.ok); }
        if (res.ok && text) text.value = '';
      });
      const notif = J.$('reminder-notif');
      if (notif) notif.addEventListener('click', () => {
        if (!('Notification' in window)) { if (msg) { msg.textContent = 'Notifications non prises en charge ici.'; msg.classList.add('err'); } return; }
        Promise.resolve(Notification.requestPermission()).then((p) => {
          if (msg) { msg.textContent = 'Notifications : ' + (p === 'granted' ? 'autorisées.' : 'non autorisées (alerte à l\'écran et son conservés).'); msg.classList.toggle('err', p !== 'granted'); }
        });
      });
      J.bus.on('reminders:changed', api.render);
      api.render();
      setInterval(check, 5000);
      // Les rappels échus pendant que la page était fermée sont signalés une fois l'assistant prêt.
      setTimeout(check, 800);
    }
  });
})();
