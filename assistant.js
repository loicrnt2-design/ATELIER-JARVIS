/* assistant.js — assistant conversationnel.
   Par défaut il fonctionne avec des commandes locales (expressions régulières) qui déclenchent de vraies actions.
   Si l'utilisateur configure et active l'IA dans RÉGLAGES, les phrases non reconnues sont envoyées à l'IA. */
(function () {
  'use strict';
  const J = window.Jarvis;
  const KEY = 'jarvis.chat.v1';
  const MAX_MESSAGES = 100;

  // ---- Historique (chargé, validé, plafonné) ----
  let history = J.storage.load(KEY, []);
  if (!Array.isArray(history)) history = [];
  history = history
    .filter((m) => m && (m.role === 'user' || m.role === 'bot') && typeof m.text === 'string')
    .map((m) => ({ role: m.role, text: m.text.slice(0, 4000), time: typeof m.time === 'string' ? m.time : '', src: m.src === 'ai' ? 'ai' : '' }))
    .slice(-MAX_MESSAGES);

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const nowHM = () => J.pad2(new Date().getHours()) + ':' + J.pad2(new Date().getMinutes());
  const frDate = (key) => key.split('-').reverse().join('/');
  const plural = (n, w) => n + ' ' + w + (n > 1 ? 's' : '');

  // Version "simplifiée" du texte : minuscules, sans accents, pour comparer facilement.
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’']/g, ' ');

  function addMessage(role, text, src) {
    history.push({ role, text, time: nowHM(), src: src || '' });
    if (history.length > MAX_MESSAGES) history = history.slice(-MAX_MESSAGES);
    J.storage.save(KEY, history);
    J.bus.emit('history:changed');
  }

  // Affiche un texte en rendant cliquables les liens http(s) (créés par JARVIS ou la recherche web).
  function appendWithLinks(parent, text) {
    const re = /https?:\/\/[^\s]+/g;
    let last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
      const a = J.el('a', null, m[0].length > 60 ? m[0].slice(0, 57) + '…' : m[0]);
      a.href = m[0]; a.target = '_blank'; a.rel = 'noopener noreferrer';
      parent.appendChild(a);
      last = m.index + m[0].length;
    }
    if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
  }

  function renderChat() {
    const log = J.$('chat-log');
    if (!log) return;
    J.clear(log);
    history.forEach((m) => {
      const row = J.el('div', 'msg ' + m.role);
      const who = m.role === 'user' ? 'VOUS' : m.src === 'ai' ? 'JARVIS (IA)' : 'JARVIS';
      row.appendChild(J.el('span', 'who', who + ' ' + m.time));
      const t = J.el('span', 'text');
      appendWithLinks(t, m.text);
      row.appendChild(t);
      log.appendChild(row);
    });
    log.scrollTop = log.scrollHeight;
  }

  // ---- Extraction de date / heure ----
  function extractDate(text) {
    const now = new Date();
    const shift = (n) => J.dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + n));
    let m;
    if ((m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text))) return { key: m[0], rest: text.replace(m[0], ' ') };
    if ((m = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(text))) {
      let y = m[3] ? +m[3] : now.getFullYear();
      if (y < 100) y += 2000;
      return { key: y + '-' + J.pad2(+m[2]) + '-' + J.pad2(+m[1]), rest: text.replace(m[0], ' ') };
    }
    if ((m = /apr[eè]s[- ]demain/i.exec(text))) return { key: shift(2), rest: text.replace(m[0], ' ') };
    if ((m = /\bdemain\b/i.exec(text))) return { key: shift(1), rest: text.replace(m[0], ' ') };
    if ((m = /aujourd['’]?\s?hui/i.exec(text))) return { key: shift(0), rest: text.replace(m[0], ' ') };
    return { key: null, rest: text };
  }

  function extractTime(text) {
    const m = /\b([01]?\d|2[0-3])\s*(?:h|:)\s*([0-5]\d)?(?!\w)/i.exec(text);
    if (!m) return { time: null, rest: text };
    return { time: J.pad2(+m[1]) + ':' + (m[2] || '00'), rest: text.replace(m[0], ' ') };
  }

  function cleanTitle(s) {
    let t = s.replace(/\s+/g, ' ').trim();
    let prev;
    do {
      prev = t;
      t = t.replace(/^(le|la|de|d'|:|-|,)\s+/i, '').replace(/\s+(le|à|a|vers|pour|du|de|,)$/i, '').replace(/[:,\-]+$/, '').trim();
    } while (t !== prev);
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
  }

  // ---- Tâches ----
  function cmdAddTask(raw) {
    let content;
    const colon = raw.indexOf(':');
    if (colon !== -1) content = raw.slice(colon + 1);
    else {
      const m = /t[aâ]ches?\s+(.*)$/i.exec(raw);
      content = m ? m[1] : '';
    }
    content = content.replace(/^\s*(de|d'|pour)\s+/i, '').trim();
    if (!content) return 'Quelle tâche dois-je enregistrer ? Exemple : « Ajoute une tâche : préparer la présentation ».';
    const t = J.tasks.add(content);
    if (!t) return 'Je n\'ai pas pu ajouter cette tâche.';
    const left = J.tasks.pending().length;
    return pick(['Tâche enregistrée : « ', 'C\'est noté : « ', 'Entendu, j\'ai enregistré : « ']) + t.text + ' ».\nVous avez ' + plural(left, 'tâche') + ' en attente.';
  }

  function cmdListTasks() {
    const all = J.tasks.all();
    J.showView('tasks');
    if (!all.length) return 'Votre liste de tâches est vide.';
    const pending = all.filter((t) => !t.done);
    const done = all.length - pending.length;
    let out = pending.length ? 'Tâches en attente (' + pending.length + ') :\n' + pending.map((t) => '• ' + t.text).join('\n')
      : 'Aucune tâche en attente.';
    if (done) out += '\n' + plural(done, 'tâche') + ' terminée' + (done > 1 ? 's' : '') + '.';
    return out;
  }

  // ---- Agenda ----
  function cmdAddEvent(raw) {
    let base;
    const colon = raw.indexOf(':');
    if (colon !== -1) base = raw.slice(colon + 1);
    else base = raw.replace(/^.*?\b(ajoute|ajouter|cr[ée]e|cr[ée]er|planifie|programme)\s+(un|une|le|l')?\s*(nouvel|nouveau|nouvelle)?\s*/i, '')
      .replace(/^([ée]v[ée]nement)\s*(de|:|-)?\s*/i, '');
    const d = extractDate(base);
    const t = extractTime(d.rest);
    const title = cleanTitle(t.rest);
    if (!title) return 'Quel est le titre de l\'événement ? Exemple : « Ajoute un événement : réunion demain à 14h30 ».';
    const date = d.key || J.dateKey(new Date());
    const time = t.time || '09:00';
    const res = J.agenda.add(title, date, time);
    if (!res.ok) return 'Événement refusé : ' + res.error;
    J.agenda.select(date);
    let out = 'Événement ajouté : « ' + title + ' » le ' + J.formatKey(date) + ' à ' + time + '.';
    const assumed = [];
    if (!d.key) assumed.push('date du jour');
    if (!t.time) assumed.push('heure par défaut 09:00');
    if (assumed.length) out += '\n(Non précisé, j\'ai utilisé : ' + assumed.join(', ') + '. Vous pouvez le modifier dans l\'agenda.)';
    return out;
  }

  function cmdAgenda() {
    J.showView('agenda');
    const today = J.agenda.forDate(J.dateKey(new Date()));
    const next = J.agenda.upcoming(5);
    if (!next.length && !today.length) return 'Votre agenda ne contient aucun événement à venir.';
    let out = '';
    if (today.length) out += 'Aujourd\'hui :\n' + today.map((e) => '• ' + e.time + ' — ' + e.title).join('\n') + '\n';
    out += next.length ? 'Prochains événements :\n' + next.map((e) => '• ' + frDate(e.date) + ' ' + e.time + ' — ' + e.title).join('\n')
      : 'Aucun événement à venir.';
    return out.trim();
  }

  // ---- Rappels ----
  // Renvoie { at: Date|null, rest } : "dans 10 minutes", "demain à 9h", "à 15h30", "le 12/10 à 8h".
  function parseWhen(text) {
    const now = new Date();
    let m;
    if ((m = /\bdans\s+(\d+)\s*(secondes?|sec|minutes?|min|heures?|h|jours?|j)\b/i.exec(text))) {
      const u = m[2].toLowerCase();
      const mult = u[0] === 's' ? 1000 : u[0] === 'm' ? 60000 : u[0] === 'h' ? 3600000 : 86400000;
      return { at: new Date(now.getTime() + (+m[1]) * mult), rest: text.replace(m[0], ' ') };
    }
    const d = extractDate(text);
    const t = extractTime(d.rest);
    if (!d.key && !t.time) return { at: null, rest: text };
    const p = (d.key || J.dateKey(now)).split('-').map(Number);
    const hm = (t.time || '09:00').split(':').map(Number);
    let at = new Date(p[0], p[1] - 1, p[2], hm[0], hm[1], 0);
    if (!d.key && at <= now) at = new Date(at.getTime() + 86400000); // "à 8h" déjà passé => demain
    return { at, rest: t.rest };
  }

  function cmdAddReminder(raw) {
    const w = parseWhen(raw);
    if (!w.at) return 'Quand dois-je vous le rappeler ? Exemples : « Rappelle-moi dans 10 minutes d\'appeler Paul » ou « Rappelle-moi demain à 9h de payer la facture ».';
    let text;
    const colon = w.rest.indexOf(':');
    if (colon !== -1) text = w.rest.slice(colon + 1);
    else text = w.rest.replace(/^.*?(rappelle[ -]?moi|un rappel|rappel)\s*/i, '');
    text = cleanTitle(text.replace(/^\s*(que|de|d['’]|pour|à)\s*/i, ''));
    if (!text) return 'De quoi dois-je vous rappeler ? Exemple : « Rappelle-moi dans 10 minutes d\'appeler Paul ».';
    const res = J.reminders.add(text, w.at);
    if (!res.ok) return 'Rappel refusé : ' + res.error;
    return 'Rappel programmé : « ' + text + ' » le ' + J.reminders.fmt(res.reminder.at) + '.\nIl sonnera tant que cet onglet reste ouvert.';
  }

  function cmdListReminders() {
    J.showView('reminders');
    const act = J.reminders.active();
    if (!act.length) return 'Aucun rappel actif.';
    return 'Rappels actifs (' + act.length + ') :\n' + act.map((r) => '• ' + J.reminders.fmt(r.at) + ' — ' + r.text).join('\n');
  }

  // ---- Recherche web (ouvre le moteur choisi dans un nouvel onglet) ----
  function cmdSearch(raw) {
    let q;
    const colon = raw.indexOf(':');
    if (colon !== -1) q = raw.slice(colon + 1);
    else q = raw.replace(/^.*?\b(recherche|rechercher|cherche|chercher|google|search|trouve|trouver)\b\s*/i, '')
      .replace(/^(sur\s+(le\s+)?(web|internet|google)|en ligne)\s*/i, '')
      .replace(/^(de|des|du|sur|pour|à propos de|concernant)\s+/i, '');
    q = q.replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!q) return 'Que dois-je rechercher ? Exemple : « Recherche sur le web : météo Paris ».';
    const url = J.settings.searchUrl(q);
    const engine = J.settings.ENGINES[J.settings.get().search.engine].label;
    const w = window.open(url, '_blank', 'noopener');
    return (w ? 'Recherche lancée sur ' + engine + ' dans un nouvel onglet : « ' + q + ' ».' : 'Votre navigateur a bloqué l\'ouverture. Cliquez sur ce lien :') +
      '\n' + url + '\n(JARVIS ouvre la recherche mais ne lit pas les résultats.)';
  }

  // ---- Rédaction de mail ----
  function cmdMail(raw) {
    const email = (/[^\s@,;:]+@[^\s@,;:]+\.[^\s@,;:]+/.exec(raw) || [''])[0];
    let subject = '', content = '', topic = '';
    const sm = /(?:objet|sujet)\s*:?\s*(.+?)(?=\s+(?:message|corps|contenu|texte)\s*:|$)/i.exec(raw);
    if (sm) subject = sm[1].trim();
    const bm = /(?:message|corps|contenu|texte)\s*:\s*(.+)$/i.exec(raw);
    if (bm) content = bm[1].trim();
    if (!subject && !content) {
      const tm = /(?:\bsur\b|à propos de|a propos de|concernant|pour (?:lui )?dire|disant)\s+(.+)$/i.exec(raw);
      if (tm) topic = tm[1].trim();
    }
    if (!subject && !content && !topic) {
      return 'Que dois-je écrire ? Exemple : « Rédige un mail à nom@exemple.fr sur la réunion de demain » ou « … objet : Retard message : je serai là à 10h ».';
    }

    const finish = (s, b, viaAi) => {
      J.messages.prefill({ to: email, subject: s, body: b });
      J.messages.saveDraft();
      J.showView('messages');
      return {
        text: (viaAi ? 'Brouillon rédigé par l\'IA' : 'Brouillon préparé avec un gabarit local (sans IA)') + ' et placé dans le module Messages.' +
          (email ? '' : '\nAucun destinataire détecté : renseignez-le.') +
          '\nRelisez-le, puis utilisez OUVRIR MA MESSAGERIE ou COPIER. Rien n\'a été envoyé.',
        src: viaAi ? 'ai' : ''
      };
    };
    const template = () => {
      const s = subject || cleanTitle(topic);
      const core = content || ('Je vous écris au sujet de : ' + topic + '.');
      return finish(s, 'Bonjour,\n\n' + core.charAt(0).toUpperCase() + core.slice(1) + '\n\nCordialement,', false);
    };

    if (J.ai.isEnabled()) {
      return J.ai.draftMail(raw).then(
        (d) => finish(d.subject || subject, d.body, true),
        (e) => { const r = template(); r.text = 'IA indisponible (' + e.message + ')\n' + r.text; return r; }
      );
    }
    return template();
  }

  // ---- Divers ----
  function cmdTime() {
    const t = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return pick(['Il est ', 'Il est actuellement ', 'L\'heure locale est ']) + t + '.';
  }
  function cmdDate() {
    return 'Nous sommes le ' + new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + '.';
  }
  function cmdGreet() {
    const h = new Date().getHours();
    const hello = h >= 18 || h < 5 ? 'Bonsoir' : 'Bonjour';
    const left = J.tasks.pending().length;
    const next = J.agenda.upcoming(1)[0];
    let out = hello + ', Monsieur. JARVIS à votre service.';
    out += '\nVous avez ' + plural(left, 'tâche') + ' en attente';
    out += next ? ' et le prochain événement est « ' + next.title + ' » le ' + frDate(next.date) + ' à ' + next.time + '.' : ' et aucun événement à venir.';
    return out;
  }

  function help() {
    return (J.ai.isEnabled() ? 'Commandes locales + IA distante (' + J.ai.model() + ') pour les autres questions.' : 'Je fonctionne avec des commandes locales ; l\'IA n\'est pas activée (voir RÉGLAGES).') + ' Essayez :\n' +
      '• Bonjour JARVIS\n• Quelle heure est-il ? / Quelle est la date ?\n• Affiche mon agenda\n' +
      '• Ajoute un événement : réunion demain à 14h30\n• Ajoute une tâche : préparer la présentation\n• Quelles sont mes tâches ?\n' +
      '• Rappelle-moi dans 10 minutes d\'appeler Paul\n• Quels sont mes rappels ?\n' +
      '• Rédige un mail à nom@exemple.fr sur la réunion de demain\n• Recherche sur le web : météo Paris\n' +
      '• Demande à l\'IA : explique-moi les trous noirs\n• Ouvre mes messages / l\'agenda / les tâches / les rappels / les réglages\n• Efface l\'historique';
  }

  function cmdOpen(n) {
    const map = [
      [/agenda|calendrier/, 'agenda', 'l\'agenda'],
      [/tache/, 'tasks', 'les tâches'],
      [/rappel/, 'reminders', 'les rappels'],
      [/message|mail|courriel/, 'messages', 'les messages'],
      [/reglage|parametre|configuration|option/, 'settings', 'les réglages'],
      [/assistant|conversation/, 'assistant', 'l\'assistant'],
      [/accueil|home|ecran principal/, 'home', 'l\'accueil']
    ];
    for (const [re, view, label] of map) {
      if (re.test(n)) { J.showView(view); return 'J\'ouvre ' + label + '.'; }
    }
    return null;
  }

  // Envoie la question à l'IA (si activée) ; sinon explique comment l'activer.
  function askAi() {
    if (!J.ai.isEnabled()) {
      J.showView('settings');
      return 'L\'IA n\'est pas activée. Configurez le fournisseur, le modèle et la clé dans RÉGLAGES, puis activez-la.';
    }
    return J.ai.chat(history).then(
      (text) => ({ text, src: 'ai' }),
      (e) => 'IA indisponible : ' + e.message
    );
  }

  // Cœur de l'interprétation : renvoie un texte, un objet {text, src} ou une Promise de l'un d'eux.
  function interpret(raw) {
    const n = norm(raw);

    if (/\b(efface|supprime|vide|reinitialise)\b.*\b(historique|conversation)\b/.test(n)) {
      history = [];
      J.storage.save(KEY, history);
      J.bus.emit('history:changed');
      return 'Historique de conversation effacé.';
    }
    if (/^(demande a l ia|demande a l ai|ia|ai)\b\s*[:,]?\s*\S/.test(n)) return askAi();
    if (/\brappelle[ -]?moi\b/.test(n) || /\b(ajoute|ajouter|cree|creer|mets|mettre|programme|nouveau|enregistre)\b.*\brappels?\b/.test(n)) return cmdAddReminder(raw);
    if (/rappels?/.test(n) && !/\b(ouvre|ouvrir|va|aller)\b/.test(n)) return cmdListReminders();
    if (/^(recherche|rechercher|cherche|chercher|google|search|trouve)\b/.test(n) || /\b(recherche|cherche)\b.*\b(web|internet|google|en ligne)\b/.test(n)) return cmdSearch(raw);
    if (/\b(ajoute|ajouter|rajoute|cree|creer|nouvelle|note|enregistre|enregistrer|mets|mettre)\b.*\btaches?\b/.test(n)) return cmdAddTask(raw);
    if (/\b(ajoute|ajouter|cree|creer|planifie|programme|nouvel|nouveau)\b.*\b(evenement|rdv|rendez vous|rendez-vous|reunion)\b/.test(n)) return cmdAddEvent(raw);
    if (/\b(redige|rediger|ecris|ecrire|prepare|preparer|compose|composer|genere|generer)\b.*\b(mail|e-?mail|courriel|message)\b/.test(n)) return cmdMail(raw);
    if (/\b(ouvre|ouvrir|va|aller|affiche|montre|passe)\b.*\b(accueil|assistant|conversation|reglages?|parametres?)\b/.test(n) || /\b(ouvre|ouvrir|va|aller)\b/.test(n)) {
      const r = cmdOpen(n);
      if (r) return r;
    }
    if (/taches?/.test(n)) return cmdListTasks();
    if (/agenda|evenement|calendrier|rendez/.test(n)) return cmdAgenda();
    if (/message|mail|courriel|redige|ecrire/.test(n)) { J.showView('messages'); return 'J\'ouvre le module de rédaction. Le message ne sera pas envoyé d\'ici : vous passerez par votre messagerie.'; }
    if (/\bheure\b/.test(n)) return cmdTime();
    if (/\b(date|jour)\b/.test(n)) return cmdDate();
    if (/\b(aide|help|commandes|que sais tu|que peux tu)\b/.test(n)) return help();
    if (/\b(merci|thanks)\b/.test(n)) return pick(['Avec plaisir, Monsieur.', 'Je vous en prie.', 'À votre service.']);
    if (/\b(qui es tu|ton nom|tu es qui)\b/.test(n)) return 'Je suis JARVIS, un prototype d\'assistant. ' + (J.ai.isEnabled() ? 'Une IA distante (' + J.ai.model() + ') est activée pour les questions libres.' : 'Aucune IA n\'est activée pour le moment.');
    if (/^(bonjour|salut|hello|coucou|bonsoir|hey|jarvis)\b/.test(n)) return cmdGreet();

    // Phrase non reconnue : IA si activée, sinon réponse honnête.
    if (J.ai.isEnabled()) return askAi();
    return 'Je n\'ai pas compris « ' + raw + ' ». Sans IA activée, je ne reconnais que des commandes locales.\n' +
      'Essayez « Aide », ou activez l\'IA dans RÉGLAGES pour les questions libres.';
  }

  J.assistant = {
    history: () => history.slice(),
    say: (text) => addMessage('bot', text),
    recentCommands(n) {
      const out = [];
      for (let i = history.length - 1; i >= 0 && out.length < n; i--) if (history[i].role === 'user') out.push(history[i]);
      return out;
    },
    lastExchange() {
      let u = null, b = null;
      for (let i = history.length - 1; i >= 0; i--) {
        if (!b && history[i].role === 'bot') b = history[i];
        if (!u && history[i].role === 'user') u = history[i];
        if (u && b) break;
      }
      return { user: u, bot: b };
    },

    // Point d'entrée : message utilisateur -> état "traitement" -> réponse.
    submit(text) {
      // La dictée écrit parfois « deux points » en toutes lettres.
      const clean = String(text || '').replace(/\s*\bdeux[- ]points\b\s*/gi, ' : ').replace(/\s+/g, ' ').trim().slice(0, 300);
      if (!clean) return;
      addMessage('user', clean);
      if (J.setProcessing) J.setProcessing(true);
      const started = Date.now();
      let result;
      try { result = Promise.resolve(interpret(clean)); }
      catch (e) { console.error(e); result = Promise.resolve('Une erreur interne est survenue pendant le traitement de la commande.'); }
      result.catch((e) => { console.error(e); return 'Une erreur interne est survenue pendant le traitement de la commande.'; })
        .then((r) => {
          const out = typeof r === 'string' ? { text: r, src: '' } : r;
          // Petit délai minimal pour que l'animation de traitement reste visible.
          setTimeout(() => {
            addMessage('bot', out.text, out.src);
            if (J.voice) J.voice.speak(out.text);
            if (J.setProcessing) J.setProcessing(false);
          }, Math.max(0, 400 - (Date.now() - started)));
        });
    },

    init() {
      if (!history.length) addMessage('bot', 'Systèmes initialisés. Tapez « Aide » pour la liste des commandes.');
      const form = J.$('command-form');
      const input = J.$('command-input');
      if (form) form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!input) return;
        J.assistant.submit(input.value);
        input.value = '';
      });
      const sugg = J.$('suggestions');
      if (sugg) sugg.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.cmd) J.assistant.submit(b.dataset.cmd);
        else if (b.dataset.fill && input) { input.value = b.dataset.fill; input.focus(); }
      });
      const clr = J.$('clear-history');
      if (clr) clr.addEventListener('click', () => {
        history = [];
        J.storage.save(KEY, history);
        J.bus.emit('history:changed');
      });
      J.bus.on('history:changed', renderChat);
      renderChat();
    }
  };
})();
