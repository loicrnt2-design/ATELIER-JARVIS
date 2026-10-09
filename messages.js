/* messages.js — module Messages : brouillon, copie, ouverture via mailto. Rien n'est envoyé d'ici. */
(function () {
  'use strict';
  const J = window.Jarvis;
  const KEY = 'jarvis.draft.v1';
  const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

  const fields = () => ({ to: J.$('mail-to'), subject: J.$('mail-subject'), body: J.$('mail-body') });
  const val = (el) => (el ? el.value : '');

  function say(text, isError) {
    const m = J.$('mail-msg');
    if (!m) return;
    m.textContent = text;
    m.classList.toggle('err', !!isError);
  }

  // Texte complet du message, tel qu'il sera copié.
  function fullText() {
    const f = fields();
    return 'À : ' + val(f.to) + '\nObjet : ' + val(f.subject) + '\n\n' + val(f.body);
  }

  function hasContent() {
    const f = fields();
    return !!(val(f.to).trim() || val(f.subject).trim() || val(f.body).trim());
  }

  function saveDraft() {
    const f = fields();
    return J.storage.save(KEY, { to: val(f.to), subject: val(f.subject), body: val(f.body) });
  }

  // Copie dans le presse-papiers ; solution de secours pour les navigateurs/fichiers locaux restrictifs.
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(() => true, () => fallbackCopy(text));
    }
    return Promise.resolve(fallbackCopy(text));
  }
  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  J.messages = {
    saveDraft,
    // Remplit le formulaire (utilisé aussi par l'assistant).
    prefill(data) {
      const f = fields();
      if (f.to && data.to !== undefined) f.to.value = data.to;
      if (f.subject && data.subject !== undefined) f.subject.value = data.subject;
      if (f.body && data.body !== undefined) f.body.value = data.body;
    },

    init() {
      const f = fields();
      const saved = J.storage.load(KEY, null);
      if (saved && typeof saved === 'object') {
        J.messages.prefill({
          to: typeof saved.to === 'string' ? saved.to : '',
          subject: typeof saved.subject === 'string' ? saved.subject : '',
          body: typeof saved.body === 'string' ? saved.body : ''
        });
      }

      const draft = J.$('mail-draft'), copy = J.$('mail-copy'), open = J.$('mail-open'), clear = J.$('mail-clear');
      const form = J.$('mail-form');
      if (form) form.addEventListener('submit', (e) => e.preventDefault());

      if (draft) draft.addEventListener('click', () => {
        if (!hasContent()) return say('Le brouillon est vide.', true);
        const to = val(f.to).trim();
        if (to && !EMAIL_RE.test(to)) return say("L'adresse du destinataire semble invalide.", true);
        const ok = saveDraft();
        say(ok ? 'Brouillon préparé et conservé localement. Aucun message envoyé.'
               : 'Brouillon préparé, mais non conservé (stockage local indisponible). Aucun message envoyé.', !ok);
      });

      if (copy) copy.addEventListener('click', () => {
        if (!hasContent()) return say('Rien à copier.', true);
        Promise.resolve(copyText(fullText())).then((ok) =>
          say(ok ? 'Contenu copié dans le presse-papiers.' : 'Copie impossible : sélectionnez le texte manuellement.', !ok));
      });

      if (open) open.addEventListener('click', () => {
        const to = val(f.to).trim();
        if (!to) return say('Indiquez un destinataire pour ouvrir la messagerie.', true);
        if (!EMAIL_RE.test(to)) return say("L'adresse du destinataire semble invalide.", true);
        const url = 'mailto:' + encodeURIComponent(to) +
          '?subject=' + encodeURIComponent(val(f.subject)) +
          '&body=' + encodeURIComponent(val(f.body));
        if (url.length > 1900) say('Message long : certains logiciels de messagerie pourraient le tronquer. Utilisez aussi COPIER.', true);
        else say('Ouverture de votre logiciel de messagerie… Le message n\'est pas envoyé tant que vous ne l\'envoyez pas vous-même.');
        window.location.href = url;
      });

      if (clear) clear.addEventListener('click', () => {
        J.messages.prefill({ to: '', subject: '', body: '' });
        J.storage.save(KEY, null);
        say('Formulaire vidé.');
      });
    }
  };
})();
