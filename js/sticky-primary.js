(function () {
  'use strict';

  /* =========================================================================
     Sticky primary widget.

     Each tool page's first widget is the one that shows the tool actually
     running (a needle, a step grid, a live result, a practice prompt) and
     owns the main action button. css/site.css pins it to the top of the
     viewport via position: sticky; this module only adds .is-stuck once
     it's actually pinned, so it can pick up extra elevation.

     Detection uses the standard sentinel technique: a 1px marker sits in
     normal flow immediately before the sticky widget. Once scrolling
     carries the sentinel above the viewport, the widget must now be
     docked at top: 0, so its intersection flips to false right as the
     widget starts sticking.
     ========================================================================= */

  if (typeof IntersectionObserver === 'undefined') return;

  var widgets = document.querySelectorAll('.widget--sticky-primary');

  widgets.forEach(function (widget) {
    var sentinel = document.createElement('div');
    sentinel.className = 'sticky-primary-sentinel';
    sentinel.setAttribute('aria-hidden', 'true');
    widget.parentNode.insertBefore(sentinel, widget);

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        widget.classList.toggle('is-stuck', !entry.isIntersecting);
      });
    }, { threshold: 0 });

    observer.observe(sentinel);
  });
})();
