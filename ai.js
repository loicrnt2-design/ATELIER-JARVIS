/* ai.js — client IA optionnel (API compatible "chat/completions").
   Désactivé par défaut. Aucune requête n'est envoyée tant que l'utilisateur n'a pas configuré et activé l'IA. */
(function () {
  'use strict';
  const J = window.Jarvis;
  const TIMEOUT_MS = 30000;

  const SYSTEM = 'Tu es JARVIS, un assistant personnel. Réponds en français, de façon concise et utile. ' +
    'Tu ne peux pas agir sur l\'agenda, les tâches ou les mails de l\'utilisateur ; tu ne peux pas naviguer sur le web. ' +
    'Si tu ne sais pas, dis-le.';

  function cfg() { return J.settings.get().ai; }

  // Envoie une liste de messages {role, content} et renvoie le texte de la réponse.
  async function request(messages) {
    const c = cfg();
    if (!J.settings.validUrl(c.baseUrl)) throw new Error('URL de l\'IA invalide ou non sécurisée.');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const headers = { 'Content-Type': 'application/json' };
    if (c.apiKey) headers.Authorization = 'Bearer ' + c.apiKey;
    let res;
    try {
      res = await fetch(c.baseUrl.replace(/\/+$/, '') + '/chat/completions', {
        method: 'POST', headers, signal: ctrl.signal,
        body: JSON.stringify({ model: c.model, messages, temperature: 0.6 })
      });
    } catch (e) {
      throw new Error(e.name === 'AbortError'
        ? 'L\'IA n\'a pas répondu à temps.'
        : 'Connexion à l\'IA impossible (réseau, adresse ou blocage CORS du fournisseur).');
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      const hint = { 401: 'clé API refusée', 403: 'accès refusé', 404: 'URL ou modèle introuvable', 429: 'quota ou limite de débit atteint' }[res.status];
      let detail = '';
      try {
        const body = await res.json();
        const err = Array.isArray(body) ? body[0] : body;
        detail = err && err.error && err.error.message ? String(err.error.message).slice(0, 200) : '';
      } catch (e) { detail = ''; }
      throw new Error('Erreur de l\'IA (HTTP ' + res.status + (hint ? ' : ' + hint : '') + ')' + (detail ? ' — ' + detail : '') + '.');
    }
    let json;
    try { json = await res.json(); } catch (e) { throw new Error('Réponse de l\'IA illisible.'); }
    const text = json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
    if (typeof text !== 'string' || !text.trim()) throw new Error('Réponse de l\'IA vide.');
    return text.trim();
  }

  J.ai = {
    isEnabled() { const c = cfg(); return c.enabled && !!c.baseUrl && !!c.model; },
    host() { try { return new URL(cfg().baseUrl).host; } catch (e) { return ''; } },
    model: () => cfg().model,

    test: () => request([{ role: 'user', content: 'Réponds uniquement par le mot : OK' }]),

    // Conversation libre : envoie uniquement les derniers échanges (pas l'agenda ni les tâches).
    chat(history) {
      const msgs = history.slice(-12).map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
      return request([{ role: 'system', content: SYSTEM }].concat(msgs));
    },

    // Rédige un e-mail ; renvoie { subject, body }.
    async draftMail(instruction) {
      const out = await request([
        { role: 'system', content: 'Tu rédiges des e-mails clairs et polis en français. Réponds UNIQUEMENT par un objet JSON de la forme {"subject":"...","body":"..."} sans autre texte. Le corps contient les retours à la ligne (\\n) et une formule de politesse.' },
        { role: 'user', content: instruction }
      ]);
      const m = /\{[\s\S]*\}/.exec(out);
      let obj = null;
      try { obj = m ? JSON.parse(m[0]) : null; } catch (e) { obj = null; }
      if (!obj || typeof obj.body !== 'string') throw new Error('L\'IA n\'a pas renvoyé un e-mail exploitable.');
      return { subject: typeof obj.subject === 'string' ? obj.subject : '', body: obj.body };
    }
  };
})();
