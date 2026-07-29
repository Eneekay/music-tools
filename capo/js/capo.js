/* Capo Calculator — pick the open-chord shapes you know (the classic CAGED
   majors plus the three common open minors) and a target key; for every
   shape whose quality matches that key, computes the capo fret that turns
   the shape's natural root into the target root, sorted easiest-first.

   The open-position fingering shown for each shape is found with the same
   brute-force chord-tone search used by the Chord Chart Generator (kept as
   a self-contained copy here per this codebase's per-tool convention),
   restricted to fret 0-4 only, since a "shape" specifically means how it's
   fingered open/uncapoed - capoing doesn't change the fingering, only the
   sounding pitch. No external libraries. */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var MT = window.MusicTheory;

  /* =========================================================================
     The eight classic open-chord shapes
     ========================================================================= */

  var SHAPES = [
    { id: 'C', root: 0, quality: 'major', label: 'C shape', intervals: [0, 4, 7] },
    { id: 'A', root: 9, quality: 'major', label: 'A shape', intervals: [0, 4, 7] },
    { id: 'G', root: 7, quality: 'major', label: 'G shape', intervals: [0, 4, 7] },
    { id: 'E', root: 4, quality: 'major', label: 'E shape', intervals: [0, 4, 7] },
    { id: 'D', root: 2, quality: 'major', label: 'D shape', intervals: [0, 4, 7] },
    { id: 'Am', root: 9, quality: 'minor', label: 'Am shape', intervals: [0, 3, 7] },
    { id: 'Em', root: 4, quality: 'minor', label: 'Em shape', intervals: [0, 3, 7] },
    { id: 'Dm', root: 2, quality: 'minor', label: 'Dm shape', intervals: [0, 3, 7] }
  ];

  /* =========================================================================
     Fingering search (position 0 only) — copy of the Chord Chart
     Generator's algorithm, trimmed to a single open-position window.
     ========================================================================= */

  function toneWeight(semitoneFromRoot) {
    if (semitoneFromRoot === 0) return 10;
    var s = ((semitoneFromRoot % 12) + 12) % 12;
    if (s === 3 || s === 4) return 9;
    if (s === 10 || s === 11) return 8;
    if (s === 6 || s === 8) return 7;
    if (s === 2 || s === 5) return 6;
    if (s === 9) return 5;
    if (s === 7) return 2;
    return 4;
  }

  function buildChordTones(rootPc, intervals) {
    var byPc = {};
    intervals.forEach(function (iv) {
      var pc = ((rootPc + iv) % 12 + 12) % 12;
      var w = toneWeight(iv);
      if (!(pc in byPc) || byPc[pc] < w) byPc[pc] = w;
    });
    return Object.keys(byPc).map(function (pc) { return { pc: parseInt(pc, 10), weight: byPc[pc] }; });
  }

  var WINDOW = 4;

  function optionsForString(openMidi, requiredPcsSet) {
    var opts = [{ fret: -1 }];
    var openPc = ((openMidi % 12) + 12) % 12;
    if (requiredPcsSet[openPc]) opts.push({ fret: 0 });
    for (var f = 1; f <= WINDOW; f++) {
      var pc = ((openMidi + f) % 12 + 12) % 12;
      if (requiredPcsSet[pc]) opts.push({ fret: f });
    }
    return opts;
  }

  function scoreCandidate(fretPattern, openMidis, weightedTones, requiredBassPc) {
    var playedCount = 0, mutedCount = 0;
    var presentPcs = {};
    var minMidi = Infinity, minMidiPc = null;
    var frettedFrets = [];

    for (var i = 0; i < fretPattern.length; i++) {
      var f = fretPattern[i].fret;
      if (f < 0) { mutedCount++; continue; }
      playedCount++;
      var midi = openMidis[i] + f;
      var pc = ((midi % 12) + 12) % 12;
      presentPcs[pc] = true;
      if (midi < minMidi) { minMidi = midi; minMidiPc = pc; }
      if (f > 0) frettedFrets.push(f);
    }
    if (playedCount < 2) return null;

    var missingWeight = 0;
    weightedTones.forEach(function (t) { if (!presentPcs[t.pc]) missingWeight += t.weight; });

    var bassOk = minMidiPc === requiredBassPc;
    var span = frettedFrets.length ? (Math.max.apply(null, frettedFrets) - Math.min.apply(null, frettedFrets)) : 0;
    var lowestFretted = frettedFrets.length ? Math.min.apply(null, frettedFrets) : 0;

    return mutedCount * 1.5 + missingWeight * 2.5 + (bassOk ? 0 : 6) + span * 1.0 + lowestFretted * 1.2;
  }

  function bestOpenFingering(openMidis, rootPc, intervals) {
    var weightedTones = buildChordTones(rootPc, intervals);
    var requiredPcsSet = {};
    weightedTones.forEach(function (t) { requiredPcsSet[t.pc] = true; });

    var optionsPerString = openMidis.map(function (om) { return optionsForString(om, requiredPcsSet); });
    var best = null;
    var current = new Array(openMidis.length);

    function dfs(idx) {
      if (idx === openMidis.length) {
        var cost = scoreCandidate(current, openMidis, weightedTones, rootPc);
        if (cost !== null && (!best || cost < best.cost)) best = { cost: cost, fretPattern: current.slice() };
        return;
      }
      var opts = optionsPerString[idx];
      for (var i = 0; i < opts.length; i++) {
        current[idx] = opts[i];
        dfs(idx + 1);
      }
    }
    dfs(0);
    return best;
  }

  function assignFingers(fretPattern) {
    var fretted = [];
    fretPattern.forEach(function (fe, i) { if (fe.fret > 0) fretted.push({ string: i, fret: fe.fret }); });
    fretted.sort(function (a, b) { return a.fret - b.fret || a.string - b.string; });
    var fingerForFret = {};
    var next = 1;
    var byString = {};
    fretted.forEach(function (fe) {
      if (!fingerForFret[fe.fret]) { fingerForFret[fe.fret] = next; next++; }
      byString[fe.string] = fingerForFret[fe.fret];
    });
    return byString;
  }

  /* =========================================================================
     State
     ========================================================================= */

  var state = {
    instrument: 'guitar',
    targetRoot: 5,
    targetRootFlats: false,
    targetQuality: 'major',
    selectedShapes: {}
  };
  SHAPES.forEach(function (s) { state.selectedShapes[s.id] = true; });

  /* =========================================================================
     DOM refs
     ========================================================================= */

  var instrumentTabsEl = document.getElementById('instrumentTabs');
  var keyRootPickerEl = document.getElementById('keyRootPicker');
  var keyQualityControlEl = document.getElementById('keyQualityControl');
  var majorShapeChipsEl = document.getElementById('majorShapeChips');
  var minorShapeChipsEl = document.getElementById('minorShapeChips');
  var resultRowEl = document.getElementById('resultRow');

  /* =========================================================================
     Audio playback
     ========================================================================= */

  var audioCtx = null;
  function ensureAudioContext() {
    if (audioCtx) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AC();
  }

  function playResult(fretPattern, openMidis, capoFret) {
    ensureAudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    var t = audioCtx.currentTime + 0.03;
    var strumGap = 0.028;
    var step = 0;
    fretPattern.forEach(function (fe, i) {
      if (fe.fret < 0) return;
      var midi = openMidis[i] + fe.fret + capoFret;
      var freq = MT.midiToFreq(midi, 440, 0);
      window.InstrumentTones.playRealistic(audioCtx, audioCtx.destination, state.instrument, freq, t + step * strumGap, 0.55);
      step++;
    });
  }

  /* =========================================================================
     Chord-box diagram — always drawn at the nut (a "shape" is defined by
     its open fingering; the capo fret is shown separately as the whole
     point of the tool, not folded into the grid).
     ========================================================================= */

  function buildChordBoxSvg(fretPattern, openMidis, rootPc) {
    var numStrings = openMidis.length;
    var GRID_W = 30, GRID_H = 30, PAD_TOP = 26, PAD_BOTTOM = 8, PAD_L = 18, PAD_R = 18;
    var rows = WINDOW;
    var width = PAD_L + (numStrings - 1) * GRID_W + PAD_R;
    var height = PAD_TOP + rows * GRID_H + PAD_BOTTOM;

    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'chordbox-svg');
    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    svg.setAttribute('preserveAspectRatio', 'xMidYMin meet');

    function stringX(s) { return PAD_L + s * GRID_W; }
    function rowY(r) { return PAD_TOP + r * GRID_H; }

    for (var r = 0; r <= rows; r++) {
      var line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('class', r === 0 ? 'chordbox-nut' : 'chordbox-fret-line');
      line.setAttribute('x1', PAD_L); line.setAttribute('y1', rowY(r));
      line.setAttribute('x2', PAD_L + (numStrings - 1) * GRID_W); line.setAttribute('y2', rowY(r));
      svg.appendChild(line);
    }

    for (var s = 0; s < numStrings; s++) {
      var sl = document.createElementNS(SVG_NS, 'line');
      sl.setAttribute('class', 'chordbox-string');
      sl.setAttribute('x1', stringX(s)); sl.setAttribute('y1', rowY(0));
      sl.setAttribute('x2', stringX(s)); sl.setAttribute('y2', rowY(rows));
      svg.appendChild(sl);
    }

    fretPattern.forEach(function (fe, i) {
      if (fe.fret > 0) return;
      var marker = document.createElementNS(SVG_NS, 'text');
      marker.setAttribute('class', 'chordbox-marker' + (fe.fret < 0 ? ' is-muted' : ''));
      marker.setAttribute('x', stringX(i));
      marker.setAttribute('y', PAD_TOP - 10);
      marker.textContent = fe.fret < 0 ? '×' : '○';
      svg.appendChild(marker);
    });

    var byFret = {};
    fretPattern.forEach(function (fe, i) { if (fe.fret > 0) { (byFret[fe.fret] = byFret[fe.fret] || []).push(i); } });
    Object.keys(byFret).forEach(function (fret) {
      var strings = byFret[fret];
      if (strings.length < 2) return;
      var xs = strings.map(stringX);
      var y = rowY(fret) - GRID_H / 2;
      var bar = document.createElementNS(SVG_NS, 'line');
      bar.setAttribute('class', 'chordbox-barre');
      bar.setAttribute('x1', Math.min.apply(null, xs)); bar.setAttribute('y1', y);
      bar.setAttribute('x2', Math.max.apply(null, xs)); bar.setAttribute('y2', y);
      svg.appendChild(bar);
    });

    var fingers = assignFingers(fretPattern);
    fretPattern.forEach(function (fe, i) {
      if (fe.fret <= 0) return;
      var midi = openMidis[i] + fe.fret;
      var pc = ((midi % 12) + 12) % 12;
      var isRoot = pc === rootPc;
      var cx = stringX(i), cy = rowY(fe.fret) - GRID_H / 2;

      var dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('class', 'chordbox-dot' + (isRoot ? ' is-root' : ''));
      dot.setAttribute('cx', cx); dot.setAttribute('cy', cy); dot.setAttribute('r', 9);
      svg.appendChild(dot);

      var fingerNum = fingers[i];
      if (fingerNum) {
        var ft = document.createElementNS(SVG_NS, 'text');
        ft.setAttribute('class', 'chordbox-finger');
        ft.setAttribute('x', cx); ft.setAttribute('y', cy + 3.5);
        ft.textContent = String(fingerNum);
        svg.appendChild(ft);
      }
    });

    return svg;
  }

  /* =========================================================================
     Shape chips
     ========================================================================= */

  function renderShapeChips() {
    majorShapeChipsEl.innerHTML = '';
    minorShapeChipsEl.innerHTML = '';
    SHAPES.forEach(function (shape) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'shape-chip';
      btn.textContent = shape.label;
      btn.setAttribute('data-shape', shape.id);
      btn.addEventListener('click', function () {
        state.selectedShapes[shape.id] = !state.selectedShapes[shape.id];
        syncShapeChipState();
        renderResults();
      });
      (shape.quality === 'major' ? majorShapeChipsEl : minorShapeChipsEl).appendChild(btn);
    });
    syncShapeChipState();
  }

  function syncShapeChipState() {
    var chips = Array.prototype.slice.call(majorShapeChipsEl.querySelectorAll('.shape-chip'))
      .concat(Array.prototype.slice.call(minorShapeChipsEl.querySelectorAll('.shape-chip')));
    chips.forEach(function (chip) {
      var id = chip.getAttribute('data-shape');
      var shape = SHAPES.filter(function (s) { return s.id === id; })[0];
      chip.classList.toggle('is-active', !!state.selectedShapes[id]);
      chip.classList.toggle('is-irrelevant', shape.quality !== state.targetQuality);
    });
  }

  /* =========================================================================
     Results
     ========================================================================= */

  function getCurrentOpenMidis() {
    var tuning = MT.INSTRUMENTS[state.instrument].tunings[0];
    return tuning.notes.map(function (n) { return MT.parseNoteName(n); });
  }

  function capoFretFor(shapeRootPc, targetRootPc) {
    return ((targetRootPc - shapeRootPc) % 12 + 12) % 12;
  }

  function renderResults() {
    resultRowEl.innerHTML = '';
    var openMidis = getCurrentOpenMidis();
    var targetName = MT.noteNameForPc(state.targetRoot, state.targetRootFlats);

    var viable = SHAPES.filter(function (s) { return s.quality === state.targetQuality && state.selectedShapes[s.id]; });

    if (!viable.length) {
      var empty = document.createElement('div');
      empty.className = 'result-empty';
      empty.textContent = 'Select at least one ' + state.targetQuality + ' shape above to see capo options for ' +
        targetName + ' ' + (state.targetQuality === 'major' ? 'Major' : 'Minor') + '.';
      resultRowEl.appendChild(empty);
      return;
    }

    var results = viable.map(function (shape) {
      var fret = capoFretFor(shape.root, state.targetRoot);
      var fingering = bestOpenFingering(openMidis, shape.root, shape.intervals);
      return { shape: shape, fret: fret, fingering: fingering };
    }).filter(function (r) { return r.fingering; });

    results.sort(function (a, b) { return a.fret - b.fret; });

    results.forEach(function (r, idx) {
      var card = document.createElement('div');
      card.className = 'result-card' + (idx === 0 ? ' is-first' : '');

      var title = document.createElement('div');
      title.className = 'result-shape-title';
      title.textContent = r.shape.label;
      card.appendChild(title);

      var fretEl = document.createElement('div');
      if (r.fret === 0) {
        fretEl.className = 'result-fret is-none';
        fretEl.textContent = 'No capo needed';
      } else {
        fretEl.className = 'result-fret';
        fretEl.textContent = 'Capo Fret ' + r.fret;
      }
      card.appendChild(fretEl);

      card.appendChild(buildChordBoxSvg(r.fingering.fretPattern, openMidis, r.shape.root));

      var soundsAs = document.createElement('div');
      soundsAs.className = 'result-sounds-as';
      soundsAs.textContent = r.shape.label + ' → sounds as ' + targetName + (state.targetQuality === 'minor' ? 'm' : '');
      card.appendChild(soundsAs);

      var playBtn = document.createElement('button');
      playBtn.type = 'button';
      playBtn.className = 'result-play-btn';
      playBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5-11-6.5z"></path></svg><span>Play</span>';
      playBtn.addEventListener('click', function () { playResult(r.fingering.fretPattern, openMidis, r.fret); });
      card.appendChild(playBtn);

      resultRowEl.appendChild(card);
    });
  }

  /* =========================================================================
     Wiring
     ========================================================================= */

  instrumentTabsEl.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('.instrument-tab') : null;
    if (!btn) return;
    setInstrument(btn.getAttribute('data-instrument'));
  });

  function setInstrument(id) {
    if (!MT.INSTRUMENTS[id]) return;
    state.instrument = id;
    Array.prototype.forEach.call(instrumentTabsEl.querySelectorAll('.instrument-tab'), function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-instrument') === id);
    });
    renderResults();
  }

  function setTargetRoot(pc, flats) {
    state.targetRoot = pc;
    state.targetRootFlats = flats;
    Array.prototype.forEach.call(keyRootPickerEl.querySelectorAll('button'), function (b) {
      b.classList.toggle('is-active', parseInt(b.getAttribute('data-pc'), 10) === pc);
    });
    renderResults();
  }

  keyRootPickerEl.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('button') : null;
    if (!btn) return;
    setTargetRoot(parseInt(btn.getAttribute('data-pc'), 10), btn.getAttribute('data-flats') === 'true');
  });

  function wireSegControl(el, onChange) {
    var buttons = Array.prototype.slice.call(el.querySelectorAll('button'));
    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        buttons.forEach(function (b) { b.classList.remove('is-active'); });
        btn.classList.add('is-active');
        onChange(btn.getAttribute('data-value'));
      });
    });
  }

  wireSegControl(keyQualityControlEl, function (value) {
    state.targetQuality = value;
    syncShapeChipState();
    renderResults();
  });

  /* =========================================================================
     Keyboard input — instrument numbers match the site-wide 1-5 mapping
     (guitar=1, ukulele=3) even though only two are offered here, so the
     same key always means the same instrument across every tool.
     ========================================================================= */

  function isTypingTarget(el) {
    return el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA');
  }

  function cycleTargetRoot(dir) {
    var newPc = ((state.targetRoot + dir) % 12 + 12) % 12;
    var btn = keyRootPickerEl.querySelector('button[data-pc="' + newPc + '"]');
    setTargetRoot(newPc, btn.getAttribute('data-flats') === 'true');
  }

  window.addEventListener('keydown', function (e) {
    if (isTypingTarget(document.activeElement) && e.key !== 'Escape') return;

    if (e.key === 'ArrowLeft') { e.preventDefault(); cycleTargetRoot(-1); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); cycleTargetRoot(1); return; }

    if (e.key === '1') { setInstrument('guitar'); return; }
    if (e.key === '3') { setInstrument('ukulele'); return; }
  });

  /* =========================================================================
     Init
     ========================================================================= */

  renderShapeChips();
  setTargetRoot(5, true); // default: F major - a friendly, non-trivial demo
  renderResults();
})();
