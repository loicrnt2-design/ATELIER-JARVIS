/* voice.js — reconnaissance vocale et lecture des réponses (API Web Speech du navigateur).
   Chrome/Edge envoient l'audio au service en ligne de leur éditeur ; ce n'est pas du traitement 100 % local. */
(function () {
  'use strict';
  const J = window.Jarvis;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const synth = window.speechSynthesis;
  let rec = null;
  let active = false;

  const ERRORS = {
    'not-allowed': 'Accès au microphone refusé. Autorisez-le dans le navigateur.',
    'service-not-allowed': 'Reconnaissance vocale bloquée par le navigateur.',
    'no-speech': 'Aucune parole détectée. Réessayez.',
    'audio-capture': 'Aucun microphone détecté.',
    'network': 'Reconnaissance vocale indisponible (réseau requis pour ce navigateur).',
    'language-not-supported': 'Langue non prise en charge.'
  };

  const note = (t) => { if (J.setNote) J.setNote(t); };

  J.voice = {
    supported: !!SR,
    speechSupported: !!synth,
    isListening: () => active,

    start() {
      if (!SR) return note('Reconnaissance vocale non disponible dans ce navigateur (essayez Chrome, Edge ou Safari). Utilisez le clavier.');
      if (active) return;
      if (synth) synth.cancel(); // évite que JARVIS s'entende lui-même
      const input = J.$('command-input');
      const cfg = J.settings.get().voice;
      let finalText = '';
      rec = new SR();
      rec.lang = cfg.lang;
      rec.interimResults = true;
      rec.continuous = false;
      rec.maxAlternatives = 1;

      rec.onstart = () => { active = true; J.setListening(true); note('Écoute en cours… parlez maintenant.'); };
      rec.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript;
          if (e.results[i].isFinal) finalText += t; else interim += t;
        }
        if (input) input.value = (finalText || interim).trim();
      };
      rec.onerror = (e) => note(ERRORS[e.error] || 'Erreur de reconnaissance vocale (' + e.error + ').');
      rec.onend = () => {
        active = false;
        J.setListening(false);
        const text = finalText.trim();
        if (!text) { if (input) input.value = ''; return; }
        if (cfg.autoSend) {
          if (input) input.value = '';
          J.assistant.submit(text);
          note('Commande vocale envoyée.');
        } else {
          if (input) { input.value = text; input.focus(); }
          note('Texte reconnu : vérifiez puis appuyez sur ENVOYER.');
        }
      };
      try { rec.start(); } catch (e) { note('Impossible de démarrer l\'écoute.'); }
    },

    stop() { if (rec && active) rec.stop(); },
    toggle() { if (active) J.voice.stop(); else J.voice.start(); },

    // Lit un texte à voix haute si l'option est activée.
    speak(text, force) {
      const cfg = J.settings.get().voice;
      if (!synth || !(cfg.speak || force) || !text) return;
      const clean = String(text).replace(/https?:\/\/\S+/g, '').replace(/[•→]/g, ',').replace(/\s+/g, ' ').trim();
      if (!clean) return;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(clean.slice(0, 600));
      u.lang = cfg.lang;
      synth.speak(u);
    }
  };
})();
