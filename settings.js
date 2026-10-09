/* settings.js — réglages (IA, voix, recherche web) enregistrés dans le navigateur. */
(function () {
  'use strict';
  const J = window.Jarvis;
  const KEY = 'jarvis.settings.v1';
  const ENGINES = {
    duckduckgo: { label: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
    google: { label: 'Google', url: 'https://www.google.com/search?q=' },
    bing: { label: 'Bing', url: 'https://www.bing.com/search?q=' },
    qwant: { label: 'Qwant', url: 'https://www.qwant.com/?q=' }
  };
  const LANGS = ['fr-FR', 'en-US', 'en-GB', 'es-ES', 'de-DE', 'it-IT'];
  const THEMES = { blue: 'Bleu (défaut)', green: 'Vert', red: 'Rouge' };

  const str = (v, def, max) => (typeof v === 'string' ? v.trim().slice(0, max) : def);

  // Reconstruit des réglages valides à partir de données potentiellement abîmées.
  function sanitize(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const ai = r.ai && typeof r.ai === 'object' ? r.ai : {};
    const voice = r.voice && typeof r.voice === 'object' ? r.voice : {};
    const search = r.search && typeof r.search === 'object' ? r.search : {};
    return {
      theme: THEMES[r.theme] ? r.theme : 'blue',
      ai: {
        enabled: ai.enabled === true,
        baseUrl: str(ai.baseUrl, 'https://api.openai.com/v1', 300),
        model: str(ai.model, '', 100),
        apiKey: str(ai.apiKey, '', 300)
      },
      voice: {
        lang: LANGS.indexOf(voice.lang) !== -1 ? voice.lang : 'fr-FR',
        speak: voice.speak === true,
        autoSend: voice.autoSend !== false
      },
      search: { engine: ENGINES[search.engine] ? search.engine : 'duckduckgo' }
    };
  }

  let data = sanitize(J.storage.load(KEY, null));

  // Le thème est appliqué dès le chargement pour éviter un flash de la couleur par défaut.
  const applyTheme = () => { document.documentElement.dataset.theme = data.theme; };
  applyTheme();

  // La clé API ne doit jamais partir en clair vers un serveur distant non chiffré.
  function validUrl(u) {
    try {
      const url = new URL(u);
      if (url.protocol === 'https:') return true;
      return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
    } catch (e) { return false; }
  }

  J.settings = {
    ENGINES,
    validUrl,
    get: () => data,
    searchUrl: (q) => ENGINES[data.search.engine].url + encodeURIComponent(q),
    update(next) {
      data = sanitize(next);
      applyTheme();
      const ok = J.storage.save(KEY, data);
      J.bus.emit('settings:changed');
      return ok;
    },

    init() {
      const f = {
        enabled: J.$('set-ai-enabled'), url: J.$('set-ai-url'), model: J.$('set-ai-model'), key: J.$('set-ai-key'),
        lang: J.$('set-voice-lang'), speak: J.$('set-voice-speak'), auto: J.$('set-voice-auto'), engine: J.$('set-search-engine'),
        theme: J.$('set-theme')
      };
      const msg = J.$('set-msg');
      const say = (t, err) => { if (msg) { msg.textContent = t; msg.classList.toggle('err', !!err); } };

      function fill() {
        if (f.theme) {
          J.clear(f.theme);
          Object.keys(THEMES).forEach((k) => { const o = J.el('option', null, THEMES[k]); o.value = k; f.theme.appendChild(o); });
          f.theme.value = data.theme;
        }
        if (f.enabled) f.enabled.checked = data.ai.enabled;
        if (f.url) f.url.value = data.ai.baseUrl;
        if (f.model) f.model.value = data.ai.model;
        if (f.key) f.key.value = data.ai.apiKey;
        if (f.lang) {
          J.clear(f.lang);
          LANGS.forEach((l) => { const o = J.el('option', null, l); o.value = l; f.lang.appendChild(o); });
          f.lang.value = data.voice.lang;
        }
        if (f.speak) f.speak.checked = data.voice.speak;
        if (f.auto) f.auto.checked = data.voice.autoSend;
        if (f.engine) {
          J.clear(f.engine);
          Object.keys(ENGINES).forEach((k) => { const o = J.el('option', null, ENGINES[k].label); o.value = k; f.engine.appendChild(o); });
          f.engine.value = data.search.engine;
        }
      }

      // Lit le formulaire sans l'enregistrer.
      function read() {
        return {
          theme: f.theme ? f.theme.value : data.theme,
          ai: {
            enabled: f.enabled ? f.enabled.checked : false,
            baseUrl: f.url ? f.url.value : '', model: f.model ? f.model.value : '', apiKey: f.key ? f.key.value : ''
          },
          voice: { lang: f.lang ? f.lang.value : 'fr-FR', speak: f.speak ? f.speak.checked : false, autoSend: f.auto ? f.auto.checked : true },
          search: { engine: f.engine ? f.engine.value : 'duckduckgo' }
        };
      }

      const form = J.$('settings-form');
      // Le thème s'applique et s'enregistre immédiatement, sans toucher aux autres champs non enregistrés.
      if (f.theme) f.theme.addEventListener('change', () => {
        J.settings.update(Object.assign({}, data, { theme: f.theme.value }));
        say('Thème appliqué.');
      });
      if (form) form.addEventListener('submit', (e) => {
        e.preventDefault();
        const next = read();
        if (next.ai.enabled) {
          if (!validUrl(next.ai.baseUrl.trim())) return say('URL IA invalide : utilisez https:// (ou http://localhost).', true);
          if (!next.ai.model.trim()) return say('Indiquez le nom du modèle pour activer l\'IA.', true);
        }
        const ok = J.settings.update(next);
        say(ok ? 'Réglages enregistrés.' : 'Réglages appliqués mais non conservés (stockage indisponible).', !ok);
      });

      const test = J.$('set-ai-test');
      const testMsg = J.$('set-ai-test-msg');
      const sayTest = (text, err) => {
        if (!testMsg) return;
        testMsg.textContent = text;
        testMsg.classList.toggle('err', !!err);
      };
      if (test) test.addEventListener('click', () => {
        const next = read();
        if (!validUrl(next.ai.baseUrl.trim())) return sayTest('Erreur : vérifiez l’adresse de l’API (https://…).', true);
        if (!next.ai.model.trim()) return sayTest('Erreur : indiquez le nom du modèle avant de tester.', true);
        J.settings.update(Object.assign({}, next, { ai: Object.assign({}, next.ai, { enabled: true }) }));
        if (f.enabled) f.enabled.checked = true;
        sayTest('Test de connexion en cours…');
        J.ai.test().then(
          (r) => sayTest('Connexion réussie. Réponse : « ' + r.slice(0, 80) + ' ».'),
          (e) => sayTest('Échec du test : ' + e.message, true)
        );
      });

      const forget = J.$('set-ai-forget');
      if (forget) forget.addEventListener('click', () => {
        if (f.key) f.key.value = '';
        const next = read();
        next.ai.enabled = false;
        if (f.enabled) f.enabled.checked = false;
        J.settings.update(next);
        say('Clé API effacée et IA désactivée.');
      });

      fill();
    }
  };
})();
