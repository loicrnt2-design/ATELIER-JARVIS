/* core.js — outils communs : espace de noms, événements internes, stockage local sécurisé. */
(function () {
  'use strict';

  // Tout le projet partage l'objet global "Jarvis" (pas de modules ES : ils ne marchent pas en file://).
  const J = (window.Jarvis = window.Jarvis || {});

  // Raccourci pour récupérer un élément par id (renvoie null s'il est absent, sans erreur).
  J.$ = (id) => document.getElementById(id);

  // Petit "bus" d'événements : un module annonce un changement, les autres réagissent.
  const listeners = {};
  J.bus = {
    on(name, fn) { (listeners[name] = listeners[name] || []).push(fn); },
    emit(name, data) {
      (listeners[name] || []).forEach((fn) => {
        try { fn(data); } catch (e) { console.error('Erreur dans un écouteur', name, e); }
      });
    }
  };

  J.pad2 = (n) => String(n).padStart(2, '0');

  // Date locale -> "AAAA-MM-JJ" (sans passer par UTC, qui décalerait parfois d'un jour).
  J.dateKey = (d) => d.getFullYear() + '-' + J.pad2(d.getMonth() + 1) + '-' + J.pad2(d.getDate());

  J.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  // Date lisible en français à partir d'une clé "AAAA-MM-JJ".
  J.formatKey = (key) => {
    const p = key.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]).toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  };

  // Stockage : localStorage peut être indisponible (mode privé, fichier bloqué...).
  let available = true;
  try {
    const k = '__jarvis_test__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
  } catch (e) {
    available = false;
  }

  J.storage = {
    available,
    // Lit et décode du JSON ; en cas de problème, renvoie la valeur par défaut.
    load(key, fallback) {
      if (!available) return fallback;
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (e) {
        console.warn('Lecture impossible pour', key, e);
        return fallback;
      }
    },
    // Écrit en JSON ; renvoie false si l'écriture échoue (quota plein, etc.).
    save(key, value) {
      if (!available) return false;
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (e) {
        console.warn('Écriture impossible pour', key, e);
        J.bus.emit('storage:error', key);
        return false;
      }
    }
  };

  // Vide un élément (utilitaire d'affichage).
  J.clear = (el) => { while (el && el.firstChild) el.removeChild(el.firstChild); };

  // Crée un élément avec du texte (textContent => jamais d'injection HTML).
  J.el = (tag, className, text) => {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  };
})();
