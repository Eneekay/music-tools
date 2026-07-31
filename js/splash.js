(function () {
  'use strict';

  var overlay = document.getElementById('splashOverlay');
  if (!overlay) return;

  var stripesEl = document.getElementById('splashStripes');
  var STRIPE_COUNT = 12;
  var HOLD_MS = 1700;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (stripesEl) {
    var mid = (STRIPE_COUNT - 1) / 2;
    for (var i = 0; i < STRIPE_COUNT; i++) {
      var stripe = document.createElement('div');
      stripe.className = 'splash-stripe ' + (i % 2 === 0 ? 'splash-stripe--left' : 'splash-stripe--right');
      stripe.style.setProperty('--stripe-delay', (Math.abs(i - mid) * 0.045) + 's');
      stripesEl.appendChild(stripe);
    }
  }

  function reveal() {
    overlay.classList.add('is-revealing');
    setTimeout(function () { overlay.hidden = true; }, reduceMotion ? 260 : 900);
  }

  setTimeout(reveal, reduceMotion ? 400 : HOLD_MS);
})();
