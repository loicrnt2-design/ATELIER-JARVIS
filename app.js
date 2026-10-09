/* app.js — point d'entrée : horloge, navigation, état du noyau, panneaux latéraux, particules. */
(function () {
  'use strict';
  const J = window.Jarvis;
  const body = document.body;
  const startedAt = Date.now();
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Horloge ----------
  function tickClock() {
    const now = new Date();
    const t = J.$('clock-time'), d = J.$('clock-date');
    if (t) t.textContent = now.toLocaleTimeString('fr-FR');
    if (d) d.textContent = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();
    const s = J.$('sys-session');
    if (s) {
      const sec = Math.floor((Date.now() - startedAt) / 1000);
      s.textContent = J.pad2(Math.floor(sec / 3600)) + ':' + J.pad2(Math.floor(sec / 60) % 60) + ':' + J.pad2(sec % 60);
    }
  }

  // ---------- Navigation entre modules ----------
  const VIEWS = ['home', 'assistant', 'design3d', 'agenda', 'tasks', 'reminders', 'messages', 'settings'];
  J.showView = function (name) {
    if (VIEWS.indexOf(name) === -1) name = 'home';
    body.dataset.view = name;
    document.querySelectorAll('.view').forEach((v) => { v.hidden = v.dataset.view !== name; });
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
    if (name === 'design3d' && J.design3d) J.design3d.render();
  };

  // ---------- État du noyau : idle / listening / processing ----------
  let listening = false;
  let busy = 0;
  function refreshState() {
    const state = busy > 0 ? 'processing' : listening ? 'listening' : 'idle';
    body.dataset.state = state;
    const label = J.$('core-label');
    if (label) label.textContent = { idle: 'VEILLE', listening: 'ÉCOUTE', processing: 'TRAITEMENT' }[state];
    const sys = J.$('sys-listen');
    if (sys) sys.textContent = listening ? 'Micro actif' : 'Inactive';
    const btn = J.$('listen-btn');
    if (btn) btn.setAttribute('aria-pressed', String(listening));
  }
  J.setProcessing = function (on) {
    busy = Math.max(0, busy + (on ? 1 : -1));
    refreshState();
  };
  J.setListening = function (on) { listening = !!on; refreshState(); };
  J.setNote = function (text) { const n = J.$('stage-note'); if (n) n.textContent = text; };

  // ---------- Panneaux latéraux ----------
  function renderRecent() {
    const ul = J.$('recent-commands');
    if (!ul) return;
    J.clear(ul);
    const items = J.assistant.recentCommands(5);
    if (!items.length) { ul.appendChild(J.el('li', 'muted', 'Aucune commande.')); return; }
    items.forEach((m) => {
      const li = J.el('li');
      const b = J.el('button', 'link', m.text);
      b.type = 'button';
      b.title = 'Relancer cette commande';
      b.addEventListener('click', () => J.assistant.submit(m.text));
      li.appendChild(b);
      ul.appendChild(li);
    });
  }

  function renderRight() {
    const n = J.tasks.pending().length;
    const pc = J.$('pending-count');
    if (pc) pc.textContent = String(n);
    const badge = J.$('nav-task-badge');
    if (badge) { badge.textContent = String(n); badge.hidden = n === 0; }
    const rn = J.reminders.active().length;
    const rb = J.$('nav-reminder-badge');
    if (rb) { rb.textContent = String(rn); rb.hidden = rn === 0; }
    const sr = J.$('sys-reminders');
    if (sr) sr.textContent = String(rn);

    const ul = J.$('next-events');
    if (ul) {
      J.clear(ul);
      const evs = J.agenda.upcoming(4);
      if (!evs.length) ul.appendChild(J.el('li', 'muted', 'Aucun événement à venir.'));
      evs.forEach((e) => {
        const li = J.el('li');
        li.appendChild(J.el('strong', null, e.date.split('-').reverse().slice(0, 2).join('/') + ' ' + e.time));
        li.appendChild(document.createTextNode(' ' + e.title));
        ul.appendChild(li);
      });
    }

    const last = J.$('last-interaction');
    if (last) {
      const ex = J.assistant.lastExchange();
      if (ex.user) last.textContent = '« ' + ex.user.text + ' » à ' + ex.user.time;
      else last.textContent = 'Aucune pour le moment.';
    }
  }

  function renderStatus() {
    const net = J.$('sys-net');
    if (net) net.textContent = navigator.onLine ? 'Connecté' : 'Hors ligne';
    const st = J.$('sys-storage');
    if (st) st.textContent = J.storage.available ? 'Disponible' : 'Indisponible (session seule)';
    const dot = J.$('mod-storage-dot');
    if (dot) dot.className = 'dot ' + (J.storage.available ? 'on' : 'off');
    const lbl = J.$('mod-storage-label');
    if (lbl) lbl.textContent = J.storage.available ? 'Stockage local' : 'Stockage local (indisponible)';

    const vdot = J.$('mod-voice-dot'), vlbl = J.$('mod-voice-label');
    if (vdot) vdot.className = 'dot ' + (J.voice.supported ? 'on' : 'off');
    if (vlbl) vlbl.textContent = J.voice.supported ? 'Reconnaissance vocale' : 'Reconnaissance vocale (non supportée ici)';

    // Texte honnête sur l'IA : active seulement si configurée ET cochée.
    const ai = J.ai.isEnabled();
    const adot = J.$('mod-ai-dot'), albl = J.$('mod-ai-label'), sai = J.$('sys-ai'), eng = J.$('sys-engine');
    if (adot) adot.className = 'dot ' + (ai ? 'on' : 'off');
    if (albl) albl.textContent = ai ? 'IA distante : ' + J.ai.model() : 'IA distante (non configurée)';
    if (sai) sai.textContent = ai ? 'Activée' : 'Désactivée';
    if (eng) eng.textContent = ai ? 'Local + IA' : 'Commandes locales';
    const legal = J.$('legal-engine');
    if (legal) legal.textContent = ai
      ? 'IA activée : vos messages de conversation sont envoyés à ' + J.ai.host() + '.'
      : 'Moteur conversationnel : commandes locales (IA non activée).';
    const hint = J.$('engine-hint');
    if (hint) hint.textContent = ai ? 'Moteur : commandes locales + IA distante (' + J.ai.model() + ') pour les phrases libres.' : 'Moteur : commandes locales prédéfinies. L\'IA est optionnelle (voir RÉGLAGES).';
  }

  // ---------- Particules (canvas léger) ----------
  function startParticles() {
    const canvas = J.$('particles');
    if (!canvas || !canvas.getContext || reduceMotion) return;
    const ctx = canvas.getContext('2d');
    let w = 0, h = 0, rafId = 0;
    const COUNT = 55;
    let accent = '0, 229, 255';
    const readAccent = () => { accent = getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb').trim() || accent; };
    readAccent();
    J.bus.on('settings:changed', readAccent);
    const pts = [];
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);
    for (let i = 0; i < COUNT; i++) {
      pts.push({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.4 + 0.4, v: Math.random() * 0.25 + 0.05, a: Math.random() * 0.5 + 0.2 });
    }
    function frame() {
      ctx.clearRect(0, 0, w, h);
      const fast = body.dataset.state !== 'idle' ? 2.2 : 1;
      for (const p of pts) {
        p.y -= p.v * fast;
        if (p.y < -5) { p.y = h + 5; p.x = Math.random() * w; }
        ctx.beginPath();
        ctx.fillStyle = 'rgba(' + accent + ',' + p.a + ')';
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      rafId = requestAnimationFrame(frame);
    }
    frame();
    // Pause quand l'onglet n'est pas visible pour économiser la batterie.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) cancelAnimationFrame(rafId);
      else frame();
    });
  }

  // ---------- Initialisation ----------
  function init() {
    // Barres de la visualisation d'écoute
    const wave = J.$('wave');
    if (wave) for (let i = 0; i < 16; i++) {
      const s = document.createElement('span');
      s.style.animationDelay = (i * 0.07).toFixed(2) + 's';
      wave.appendChild(s);
    }

    document.querySelectorAll('.nav-btn').forEach((b) => b.addEventListener('click', () => J.showView(b.dataset.view)));

    const lb = J.$('listen-btn');
    if (lb) lb.addEventListener('click', () => J.voice.toggle());

    J.settings.init();
    J.tasks.init();
    J.agenda.init();
    J.reminders.init();
    J.messages.init();
    J.assistant.init();
    J.design3d.init();

    J.bus.on('history:changed', () => { renderRecent(); renderRight(); });
    J.bus.on('tasks:changed', renderRight);
    J.bus.on('events:changed', renderRight);
    J.bus.on('reminders:changed', renderRight);
    J.bus.on('settings:changed', renderStatus);
    J.bus.on('storage:error', () => J.assistant && J.$('stage-note') && (J.$('stage-note').textContent = 'Attention : écriture locale impossible (stockage plein ou bloqué).'));
    window.addEventListener('online', renderStatus);
    window.addEventListener('offline', renderStatus);

    renderStatus();
    renderRecent();
    renderRight();
    refreshState();
    if (!J.voice.supported) J.setNote('Reconnaissance vocale indisponible dans ce navigateur (essayez Chrome, Edge ou Safari). Utilisez le clavier.');
    J.showView('home');
    tickClock();
    setInterval(tickClock, 1000);
    // Rafraîchit les "prochains événements" chaque minute (le temps passe).
    setInterval(renderRight, 60000);
    startParticles();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
