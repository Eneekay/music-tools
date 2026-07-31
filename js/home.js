/* Music Tools — homepage instrument filter. Each .tool-card carries a
   data-instruments attribute (comma-separated instrument ids, or "all" for
   tools that aren't tied to any one instrument). Selecting one or more
   filter chips shows cards matching any selected instrument, plus every
   "all" card regardless of selection. */
(function () {
  'use strict';

  var LABELS = { guitar: 'Guitar', bass: 'Bass', ukulele: 'Ukulele', violin: 'Violin', bouzouki: 'Bouzouki', piano: 'Piano', vocals: 'Vocals' };

  var chipsWrap = document.getElementById('instrumentFilterChips');
  var clearBtn = document.getElementById('clearInstrumentFilter');
  var hintEl = document.getElementById('filterHint');
  if (!chipsWrap) return;

  var cards = Array.prototype.slice.call(document.querySelectorAll('.tool-card[data-instruments]'));
  var selected = [];

  function applyFilter() {
    var visibleCount = 0;
    cards.forEach(function (card) {
      var tags = card.dataset.instruments.split(',');
      var match = selected.length === 0 || tags.indexOf('all') !== -1 || selected.some(function (s) { return tags.indexOf(s) !== -1; });
      card.classList.toggle('is-hidden', !match);
      if (match) visibleCount++;
    });

    if (!selected.length) {
      hintEl.textContent = 'Showing all ' + cards.length + ' tools.';
    } else {
      var names = selected.map(function (id) { return LABELS[id] || id; }).join(', ');
      hintEl.textContent = 'Showing ' + visibleCount + ' of ' + cards.length + ' tools for ' + names + '.';
    }
  }

  chipsWrap.querySelectorAll('button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = btn.dataset.instrument;
      var idx = selected.indexOf(id);
      if (idx === -1) { selected.push(id); btn.classList.add('is-active'); }
      else { selected.splice(idx, 1); btn.classList.remove('is-active'); }
      applyFilter();
    });
  });

  clearBtn.addEventListener('click', function () {
    selected = [];
    chipsWrap.querySelectorAll('button').forEach(function (b) { b.classList.remove('is-active'); });
    applyFilter();
  });

  applyFilter();
})();
