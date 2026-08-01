(function () {
  'use strict';

  /* =========================================================================
     Theme switch (Light / Dark / System).

     The FOUC-prevention inline script in each page's <head> already reads
     the stored preference and sets data-theme on <html> before first paint;
     this module just keeps that in sync with OS changes while 'system' is
     selected, and wires up the .theme-switch control if one is present.
     ========================================================================= */

  var STORAGE_KEY = 'nkTheme';
  var media = window.matchMedia('(prefers-color-scheme: light)');

  function getPreference() {
    var stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'dark';
  }

  function resolveSystem() {
    return media.matches ? 'light' : 'dark';
  }

  function effectiveTheme(pref) {
    return pref === 'system' ? resolveSystem() : pref;
  }

  function applyTheme(pref) {
    document.documentElement.setAttribute('data-theme', effectiveTheme(pref));
    syncControl(pref);
  }

  function setPreference(pref) {
    localStorage.setItem(STORAGE_KEY, pref);
    applyTheme(pref);
  }

  function syncControl(pref) {
    var control = document.getElementById('themeControl');
    if (!control) return;
    var buttons = control.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].classList.toggle('is-active', buttons[i].getAttribute('data-theme-value') === pref);
    }
  }

  var control = document.getElementById('themeControl');
  if (control) {
    syncControl(getPreference());
    control.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-theme-value]');
      if (!btn) return;
      setPreference(btn.getAttribute('data-theme-value'));
    });
  }

  media.addEventListener('change', function () {
    if (getPreference() === 'system') applyTheme('system');
  });

  window.NkTheme = { getPreference: getPreference, setPreference: setPreference };
})();
