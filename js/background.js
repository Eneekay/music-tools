(function () {
  'use strict';

  /* =========================================================================
     Floating keyboard-shortcut hint (desktop only, matches nekarantanis.co.uk)
     No-ops on any page without a #kbdHint element.
     ========================================================================= */

  (function kbdHintBehavior() {
    var kbdHint = document.getElementById('kbdHint');
    if (!kbdHint) return;
    setTimeout(function () { kbdHint.classList.add('is-visible'); }, 900);

    var lastScrollY = window.scrollY;
    window.addEventListener('scroll', function () {
      var y = window.scrollY;
      if (y > lastScrollY + 4) kbdHint.classList.remove('is-visible');
      else if (y < lastScrollY - 4) kbdHint.classList.add('is-visible');
      lastScrollY = y;
    }, { passive: true });
  })();
})();
