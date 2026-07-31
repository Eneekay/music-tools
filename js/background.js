(function () {
  'use strict';

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Pointer-follow parallax is a hover-driven effect with no real touch
  // equivalent - on a touchscreen, "finger position" IS the scroll gesture,
  // so a touchmove-driven parallax loop recomputes blurred, fixed-position
  // blob transforms on every scroll frame, which is a common cause of janky
  // scrolling on mobile GPUs. Only run it on devices that can actually hover.
  var canHover = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* =========================================================================
     Background: blob parallax + drifting music-note canvas
     (visual language shared across every Music Tools page)
     ========================================================================= */

  var blobs = Array.prototype.slice.call(document.querySelectorAll('.blob'));
  var blobFactors = [0.02, -0.015, 0.03];
  var pointer = { x: 0, y: 0 };
  var pointerTarget = { x: 0, y: 0 };

  function onPointerMove(e) {
    var p = e.touches ? e.touches[0] : e;
    pointerTarget.x = (p.clientX - window.innerWidth / 2);
    pointerTarget.y = (p.clientY - window.innerHeight / 2);
  }

  function animateBlobs() {
    pointer.x += (pointerTarget.x - pointer.x) * 0.06;
    pointer.y += (pointerTarget.y - pointer.y) * 0.06;
    blobs.forEach(function (blob, i) {
      var f = blobFactors[i % blobFactors.length];
      blob.style.transform = 'translate3d(' + (pointer.x * f) + 'px,' + (pointer.y * f) + 'px,0)';
    });
    requestAnimationFrame(animateBlobs);
  }

  if (canHover && !reduceMotion) {
    window.addEventListener('mousemove', onPointerMove, { passive: true });
    requestAnimationFrame(animateBlobs);
  }

  (function notesCanvas() {
    var canvas = document.getElementById('notes-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);

    var width = 0, height = 0, notes = [];
    var NOTE_COLOR = '232, 201, 219';
    var NOTE_GLYPHS = ['♩', '♪', '♫', '♬'];

    function noteCount() {
      var area = width * height;
      return Math.max(6, Math.min(16, Math.round(area / 130000)));
    }

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      var nCount = noteCount();
      notes = [];
      for (var j = 0; j < nCount; j++) {
        var size = 15 + Math.random() * 17;
        var angle = Math.random() * Math.PI * 2;
        var speed = 0.12 + Math.random() * 0.26;
        notes.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          glyph: NOTE_GLYPHS[Math.floor(Math.random() * NOTE_GLYPHS.length)],
          size: size,
          rotation: Math.random() * Math.PI * 2,
          rotationSpeed: (Math.random() - 0.5) * 0.006,
          opacity: 0.22 + Math.random() * 0.2
        });
      }
    }

    window.addEventListener('resize', resize);

    function step() {
      for (var i = 0; i < notes.length; i++) {
        var n = notes[i];
        n.x += n.vx;
        n.y += n.vy;
        n.rotation += n.rotationSpeed;
        var half = n.size * 0.6;
        if (n.x - half < 0) { n.x = half; n.vx = -n.vx; }
        else if (n.x + half > width) { n.x = width - half; n.vx = -n.vx; }
        if (n.y - half < 0) { n.y = half; n.vy = -n.vy; }
        else if (n.y + half > height) { n.y = height - half; n.vy = -n.vy; }
      }
    }

    function draw() {
      ctx.clearRect(0, 0, width, height);
      for (var i = 0; i < notes.length; i++) {
        var n = notes[i];
        ctx.save();
        ctx.translate(n.x, n.y);
        ctx.rotate(n.rotation);
        ctx.font = n.size + 'px "Space Grotesk", sans-serif';
        ctx.fillStyle = 'rgba(' + NOTE_COLOR + ',' + n.opacity + ')';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(n.glyph, 0, 0);
        ctx.restore();
      }
    }

    function loop() { step(); draw(); requestAnimationFrame(loop); }

    resize();
    if (reduceMotion) draw(); else requestAnimationFrame(loop);
  })();

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
