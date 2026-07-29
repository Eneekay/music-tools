/* Chord Chart Generator — parses a typed chord name (root + quality +
   optional slash bass), brute-force searches the current instrument's
   tuning for the best 1-3 fingerings, and renders them as traditional
   vertical chord-box diagrams (distinct from the horizontal fretboard
   diagrams used by the Scale Finder / Trainer, since that's the
   universally recognized "chord chart" convention). No external
   libraries; matching notes are found by brute-force enumeration over a
   handful of sliding 5-fret windows, which is small enough to run
   instantly in the browser. */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var MT = window.MusicTheory;

  var LETTER_SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  /* =========================================================================
     Chord quality dictionary — exact-match on the suffix left over after the
     root letter/accidental (and optional slash bass) are stripped. Case
     matters (m = minor, M = major) by chord-notation convention, so keys are
     intentionally NOT normalized to a single case.
     ========================================================================= */

  var QUALITIES = {
    '': { label: 'Major', intervals: [0, 4, 7] },
    'maj': { label: 'Major', intervals: [0, 4, 7] },
    'M': { label: 'Major', intervals: [0, 4, 7] },
    'm': { label: 'Minor', intervals: [0, 3, 7] },
    'min': { label: 'Minor', intervals: [0, 3, 7] },
    '-': { label: 'Minor', intervals: [0, 3, 7] },
    '5': { label: 'Power Chord', intervals: [0, 7] },
    'dim': { label: 'Diminished', intervals: [0, 3, 6] },
    'dim7': { label: 'Diminished 7th', intervals: [0, 3, 6, 9] },
    'm7b5': { label: 'Half-Diminished (m7b5)', intervals: [0, 3, 6, 10] },
    'aug': { label: 'Augmented', intervals: [0, 4, 8] },
    '+': { label: 'Augmented', intervals: [0, 4, 8] },
    'sus2': { label: 'Suspended 2nd', intervals: [0, 2, 7] },
    'sus4': { label: 'Suspended 4th', intervals: [0, 5, 7] },
    'sus': { label: 'Suspended 4th', intervals: [0, 5, 7] },
    '6': { label: 'Major 6th', intervals: [0, 4, 7, 9] },
    'maj6': { label: 'Major 6th', intervals: [0, 4, 7, 9] },
    'm6': { label: 'Minor 6th', intervals: [0, 3, 7, 9] },
    'min6': { label: 'Minor 6th', intervals: [0, 3, 7, 9] },
    '6/9': { label: 'Major 6/9', intervals: [0, 4, 7, 9, 14] },
    '69': { label: 'Major 6/9', intervals: [0, 4, 7, 9, 14] },
    '7': { label: 'Dominant 7th', intervals: [0, 4, 7, 10] },
    '7sus4': { label: 'Dominant 7 sus4', intervals: [0, 5, 7, 10] },
    '7sus2': { label: 'Dominant 7 sus2', intervals: [0, 2, 7, 10] },
    '7b5': { label: 'Dominant 7 flat 5', intervals: [0, 4, 6, 10] },
    '7#5': { label: 'Dominant 7 sharp 5', intervals: [0, 4, 8, 10] },
    '7b9': { label: 'Dominant 7 flat 9', intervals: [0, 4, 7, 10, 13] },
    '7#9': { label: 'Dominant 7 sharp 9', intervals: [0, 4, 7, 10, 15] },
    '7#11': { label: 'Dominant 7 sharp 11', intervals: [0, 4, 7, 10, 18] },
    'maj7': { label: 'Major 7th', intervals: [0, 4, 7, 11] },
    'M7': { label: 'Major 7th', intervals: [0, 4, 7, 11] },
    'maj7#5': { label: 'Major 7 sharp 5', intervals: [0, 4, 8, 11] },
    'm7': { label: 'Minor 7th', intervals: [0, 3, 7, 10] },
    'min7': { label: 'Minor 7th', intervals: [0, 3, 7, 10] },
    'mmaj7': { label: 'Minor-Major 7th', intervals: [0, 3, 7, 11] },
    'mM7': { label: 'Minor-Major 7th', intervals: [0, 3, 7, 11] },
    'm(maj7)': { label: 'Minor-Major 7th', intervals: [0, 3, 7, 11] },
    '9': { label: 'Dominant 9th', intervals: [0, 4, 7, 10, 14] },
    'maj9': { label: 'Major 9th', intervals: [0, 4, 7, 11, 14] },
    'm9': { label: 'Minor 9th', intervals: [0, 3, 7, 10, 14] },
    'add9': { label: 'Add 9', intervals: [0, 4, 7, 14] },
    'madd9': { label: 'Minor Add 9', intervals: [0, 3, 7, 14] },
    '11': { label: 'Dominant 11th', intervals: [0, 4, 7, 10, 14, 17] },
    'm11': { label: 'Minor 11th', intervals: [0, 3, 7, 10, 14, 17] },
    'maj11': { label: 'Major 11th', intervals: [0, 4, 7, 11, 14, 17] },
    '13': { label: 'Dominant 13th', intervals: [0, 4, 7, 10, 14, 17, 21] },
    'maj13': { label: 'Major 13th', intervals: [0, 4, 7, 11, 14, 17, 21] },
    'm13': { label: 'Minor 13th', intervals: [0, 3, 7, 10, 14, 17, 21] }
  };

  function parseChordName(raw) {
    if (!raw) return null;
    var input = raw.trim().replace(/\s+/g, '').replace(/♭/g, 'b').replace(/♯/g, '#');
    if (!input) return null;

    var m = /^([A-Ga-g])([#b]?)([^\/]*)(?:\/([A-Ga-g])([#b]?))?$/.exec(input);
    if (!m) return null;

    var rootLetter = m[1].toUpperCase();
    var rootAcc = m[2] || '';
    var qualityRaw = m[3] || '';
    var bassLetter = m[4] ? m[4].toUpperCase() : null;
    var bassAcc = m[5] || '';

    var quality = QUALITIES[qualityRaw];
    if (!quality) return null;

    var rootPc = (((LETTER_SEMITONE[rootLetter] + (rootAcc === '#' ? 1 : rootAcc === 'b' ? -1 : 0)) % 12) + 12) % 12;

    var bassPc = null;
    if (bassLetter) {
      bassPc = (((LETTER_SEMITONE[bassLetter] + (bassAcc === '#' ? 1 : bassAcc === 'b' ? -1 : 0)) % 12) + 12) % 12;
    }

    return {
      rootPc: rootPc,
      rootAcc: rootAcc,
      qualityLabel: quality.label,
      intervals: quality.intervals,
      bassPc: bassPc,
      displayName: rootLetter + rootAcc + qualityRaw + (bassLetter ? '/' + bassLetter + bassAcc : '')
    };
  }

  /* =========================================================================
     Fingering search
     ========================================================================= */

  // Root and the chord-defining tones (3rd, 7th, altered/sus replacements)
  // matter far more to a recognizable voicing than the plain 5th or upper
  // extensions, which real players omit first when a shape can't fit every
  // tone - weight "missing tone" penalties accordingly instead of treating
  // every omission the same.
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

  var POSITIONS = [0, 3, 6, 9];
  var WINDOW = 4; // frets position..position+WINDOW (5 distinct frets)

  function optionsForString(openMidi, position, requiredPcsSet) {
    var opts = [{ fret: -1 }]; // mute
    var openPc = ((openMidi % 12) + 12) % 12;
    if (requiredPcsSet[openPc]) opts.push({ fret: 0 });
    var start = Math.max(1, position);
    for (var f = start; f <= position + WINDOW; f++) {
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

    // Position dominates: a classic open-position shape that mutes one
    // string should always beat a fully-fretted shape stuck up at fret 8+
    // for no musical reason - low, familiar positions are what "quick
    // reference" chord charts are expected to show first.
    return mutedCount * 1.5 + missingWeight * 2.5 + (bassOk ? 0 : 6) + span * 1.0 + lowestFretted * 1.2;
  }

  function bestForPosition(openMidis, position, weightedTones, requiredPcsSet, requiredBassPc) {
    var optionsPerString = openMidis.map(function (om) { return optionsForString(om, position, requiredPcsSet); });
    var best = null;
    var current = new Array(openMidis.length);

    function dfs(idx) {
      if (idx === openMidis.length) {
        var cost = scoreCandidate(current, openMidis, weightedTones, requiredBassPc);
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

  function searchChord(chord, openMidis) {
    var weightedTones = buildChordTones(chord.rootPc, chord.intervals);
    var requiredBassPc = chord.bassPc !== null ? chord.bassPc : chord.rootPc;
    var requiredPcsSet = {};
    weightedTones.forEach(function (t) { requiredPcsSet[t.pc] = true; });
    requiredPcsSet[requiredBassPc] = true;

    var found = [];
    var seen = {};
    POSITIONS.forEach(function (pos) {
      var result = bestForPosition(openMidis, pos, weightedTones, requiredPcsSet, requiredBassPc);
      if (!result) return;
      var key = result.fretPattern.map(function (fe) { return fe.fret; }).join(',');
      if (seen[key]) return;
      seen[key] = true;
      found.push(result);
    });
    found.sort(function (a, b) { return a.cost - b.cost; });
    return found.slice(0, 3);
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

  function displayPosition(fretPattern) {
    var frettedFrets = [];
    fretPattern.forEach(function (fe) { if (fe.fret > 0) frettedFrets.push(fe.fret); });
    if (!frettedFrets.length) return 0;
    var max = Math.max.apply(null, frettedFrets);
    var min = Math.min.apply(null, frettedFrets);
    return max <= WINDOW ? 0 : min;
  }

  /* =========================================================================
     DOM refs
     ========================================================================= */

  var instrumentTabsEl = document.getElementById('instrumentTabs');
  var tuningSelect = document.getElementById('tuningSelect');
  var leftHandedToggle = document.getElementById('leftHandedToggle');
  var chordInput = document.getElementById('chordInput');
  var quickPicksEl = document.getElementById('quickPicks');
  var chordInfoEl = document.getElementById('chordInfo');
  var chordErrorEl = document.getElementById('chordError');
  var diagramRowEl = document.getElementById('diagramRow');

  var QUICK_PICKS = ['C', 'G', 'D', 'A', 'E', 'Am', 'Em', 'Dm', 'C7', 'G7', 'Cmaj7', 'Am7'];

  var state = {
    instrument: 'guitar',
    tuningIndex: 0,
    leftHanded: false
  };

  var currentChord = null;
  var currentShapes = [];

  /* =========================================================================
     Audio playback — strum the voiced strings low to high
     ========================================================================= */

  var audioCtx = null;
  function ensureAudioContext() {
    if (audioCtx) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AC();
  }

  function playShape(shape, openMidis) {
    ensureAudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    var t = audioCtx.currentTime + 0.03;
    var strumGap = 0.028;
    var step = 0;
    shape.fretPattern.forEach(function (fe, i) {
      if (fe.fret < 0) return;
      var midi = openMidis[i] + fe.fret;
      var freq = MT.midiToFreq(midi, 440, 0);
      window.InstrumentTones.playRealistic(audioCtx, audioCtx.destination, state.instrument, freq, t + step * strumGap, 0.55);
      step++;
    });
  }

  /* =========================================================================
     Chord-box diagram rendering
     ========================================================================= */

  function noteNameForChordPc(pc) {
    var preferFlats = currentChord && currentChord.rootAcc === 'b';
    return MT.noteNameForPc(pc, !!preferFlats);
  }

  function buildChordBoxSvg(shape, openMidis) {
    var numStrings = openMidis.length;
    var GRID_W = 30, GRID_H = 30, PAD_TOP = 30, PAD_BOTTOM = 8, PAD_L = 18, PAD_R = 18;
    var rows = WINDOW + 1;
    var width = PAD_L + (numStrings - 1) * GRID_W + PAD_R;
    var height = PAD_TOP + rows * GRID_H + PAD_BOTTOM;

    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'chordbox-svg');
    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    svg.setAttribute('preserveAspectRatio', 'xMidYMin meet');

    function stringX(s) {
      var idx = state.leftHanded ? (numStrings - 1 - s) : s;
      return PAD_L + idx * GRID_W;
    }
    function rowY(r) { return PAD_TOP + r * GRID_H; }

    var pos = displayPosition(shape.fretPattern);

    // fret lines
    for (var r = 0; r <= rows; r++) {
      var line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('class', (pos === 0 && r === 0) ? 'chordbox-nut' : 'chordbox-fret-line');
      line.setAttribute('x1', PAD_L); line.setAttribute('y1', rowY(r));
      line.setAttribute('x2', PAD_L + (numStrings - 1) * GRID_W); line.setAttribute('y2', rowY(r));
      svg.appendChild(line);
    }

    // strings
    for (var s = 0; s < numStrings; s++) {
      var sl = document.createElementNS(SVG_NS, 'line');
      sl.setAttribute('class', 'chordbox-string');
      sl.setAttribute('x1', stringX(s)); sl.setAttribute('y1', rowY(0));
      sl.setAttribute('x2', stringX(s)); sl.setAttribute('y2', rowY(rows));
      svg.appendChild(sl);
    }

    // position label ("5fr") when not starting at the nut
    if (pos > 0) {
      var posLabel = document.createElementNS(SVG_NS, 'text');
      posLabel.setAttribute('class', 'chordbox-position-label');
      var labelX = state.leftHanded ? (PAD_L + (numStrings - 1) * GRID_W + 6) : Math.max(2, PAD_L - 16);
      posLabel.setAttribute('text-anchor', state.leftHanded ? 'start' : 'end');
      posLabel.setAttribute('x', labelX);
      posLabel.setAttribute('y', rowY(0) + 4);
      posLabel.textContent = pos + 'fr';
      svg.appendChild(posLabel);
    }

    // X/O markers above the nut row for muted/open strings
    shape.fretPattern.forEach(function (fe, i) {
      if (fe.fret > 0) return;
      var marker = document.createElementNS(SVG_NS, 'text');
      marker.setAttribute('class', 'chordbox-marker' + (fe.fret < 0 ? ' is-muted' : ''));
      marker.setAttribute('x', stringX(i));
      marker.setAttribute('y', PAD_TOP - 12);
      marker.textContent = fe.fret < 0 ? '×' : '○';
      svg.appendChild(marker);
    });

    // barre bars behind shared-fret dots
    var byFret = {};
    shape.fretPattern.forEach(function (fe, i) { if (fe.fret > 0) { (byFret[fe.fret] = byFret[fe.fret] || []).push(i); } });
    Object.keys(byFret).forEach(function (fret) {
      var strings = byFret[fret];
      if (strings.length < 2) return;
      var xs = strings.map(stringX);
      var y = rowY(fret - pos) + GRID_H / 2;
      var bar = document.createElementNS(SVG_NS, 'line');
      bar.setAttribute('class', 'chordbox-barre');
      bar.setAttribute('x1', Math.min.apply(null, xs)); bar.setAttribute('y1', y);
      bar.setAttribute('x2', Math.max.apply(null, xs)); bar.setAttribute('y2', y);
      svg.appendChild(bar);
    });

    // fretted dots (+ finger numbers)
    var fingers = assignFingers(shape.fretPattern);
    shape.fretPattern.forEach(function (fe, i) {
      if (fe.fret <= 0) return;
      var midi = openMidis[i] + fe.fret;
      var pc = ((midi % 12) + 12) % 12;
      var isRoot = currentChord && pc === currentChord.rootPc;
      var cx = stringX(i), cy = rowY(fe.fret - pos) + GRID_H / 2;

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

  function shapeNoteList(shape, openMidis) {
    var seen = {};
    var names = [];
    shape.fretPattern.forEach(function (fe, i) {
      if (fe.fret < 0) return;
      var pc = ((openMidis[i] + fe.fret) % 12 + 12) % 12;
      if (seen[pc]) return;
      seen[pc] = true;
      names.push(noteNameForChordPc(pc));
    });
    return names.join(' · ');
  }

  function shapeTitle(shape) {
    var pos = displayPosition(shape.fretPattern);
    return pos === 0 ? 'Open Position' : (pos + (pos === 1 ? 'st' : pos === 2 ? 'nd' : pos === 3 ? 'rd' : 'th') + ' Position');
  }

  /* =========================================================================
     Render
     ========================================================================= */

  function getCurrentTuning() {
    return MT.INSTRUMENTS[state.instrument].tunings[state.tuningIndex];
  }

  function renderAll() {
    var raw = chordInput.value;
    currentChord = parseChordName(raw);
    chordInput.classList.toggle('is-invalid', !currentChord);

    if (!currentChord) {
      chordErrorEl.textContent = raw.trim()
        ? 'Couldn’t recognize that chord. Try things like Cmaj7, F#m, Bbsus4, or G/B.'
        : '';
      chordInfoEl.innerHTML = '';
      diagramRowEl.innerHTML = '';
      currentShapes = [];
      syncUrl();
      return;
    }
    chordErrorEl.textContent = '';

    var tuning = getCurrentTuning();
    var openMidis = tuning.notes.map(function (n) { return MT.parseNoteName(n); });

    currentShapes = searchChord(currentChord, openMidis);

    var chordTones = buildChordTones(currentChord.rootPc, currentChord.intervals)
      .slice().sort(function (a, b) { return a.pc === currentChord.rootPc ? -1 : b.pc === currentChord.rootPc ? 1 : a.pc - b.pc; })
      .map(function (t) { return noteNameForChordPc(t.pc); });

    chordInfoEl.innerHTML =
      '<div class="chord-info-name">' + currentChord.displayName + ' — ' + currentChord.qualityLabel + '</div>' +
      '<div class="chord-info-notes">' + chordTones.join(' · ') + '</div>';

    diagramRowEl.innerHTML = '';
    if (!currentShapes.length) {
      var empty = document.createElement('div');
      empty.className = 'diagram-empty';
      empty.textContent = 'No fingering found for ' + currentChord.displayName + ' on ' + MT.INSTRUMENTS[state.instrument].label + ' within the first 13 frets.';
      diagramRowEl.appendChild(empty);
      syncUrl();
      return;
    }

    currentShapes.forEach(function (shape) {
      var card = document.createElement('div');
      card.className = 'diagram-card';

      var title = document.createElement('div');
      title.className = 'diagram-card-title';
      title.textContent = shapeTitle(shape);
      card.appendChild(title);

      card.appendChild(buildChordBoxSvg(shape, openMidis));

      var notes = document.createElement('div');
      notes.className = 'diagram-notes';
      notes.textContent = shapeNoteList(shape, openMidis);
      card.appendChild(notes);

      var playBtn = document.createElement('button');
      playBtn.type = 'button';
      playBtn.className = 'diagram-play-btn';
      playBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5-11-6.5z"></path></svg><span>Play</span>';
      playBtn.addEventListener('click', function () { playShape(shape, openMidis); });
      card.appendChild(playBtn);

      diagramRowEl.appendChild(card);
    });

    syncUrl();
  }

  /* =========================================================================
     Instrument / tuning wiring
     ========================================================================= */

  function populateTuningSelect() {
    var data = MT.INSTRUMENTS[state.instrument];
    tuningSelect.innerHTML = '';
    data.tunings.forEach(function (t, i) {
      var opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = t.label;
      tuningSelect.appendChild(opt);
    });
    tuningSelect.value = String(state.tuningIndex);
  }

  function setInstrument(id) {
    if (!MT.INSTRUMENTS[id]) return;
    state.instrument = id;
    state.tuningIndex = 0;
    Array.prototype.forEach.call(instrumentTabsEl.querySelectorAll('.instrument-tab'), function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-instrument') === id);
    });
    populateTuningSelect();
    renderAll();
  }

  instrumentTabsEl.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('.instrument-tab') : null;
    if (!btn) return;
    setInstrument(btn.getAttribute('data-instrument'));
  });

  tuningSelect.addEventListener('change', function () {
    state.tuningIndex = parseInt(tuningSelect.value, 10);
    renderAll();
  });

  leftHandedToggle.addEventListener('change', function () {
    state.leftHanded = leftHandedToggle.checked;
    renderAll();
  });

  /* =========================================================================
     Chord input wiring
     ========================================================================= */

  var debounceTimer = null;
  chordInput.addEventListener('input', function () {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(renderAll, 220);
  });
  chordInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      if (debounceTimer) clearTimeout(debounceTimer);
      renderAll();
    }
  });

  function renderQuickPicks() {
    quickPicksEl.innerHTML = '';
    QUICK_PICKS.forEach(function (name) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'quick-pick-btn';
      btn.textContent = name;
      btn.addEventListener('click', function () {
        chordInput.value = name;
        renderAll();
      });
      quickPicksEl.appendChild(btn);
    });
  }

  /* =========================================================================
     URL query param sync (?chord=&instrument=&tuning=&embed=1) — makes the
     current chord/instrument shareable or embeddable via <iframe>.
     ========================================================================= */

  function syncUrl() {
    var params = new URLSearchParams(window.location.search);
    if (chordInput.value.trim()) params.set('chord', chordInput.value.trim()); else params.delete('chord');
    params.set('instrument', state.instrument);
    params.set('tuning', String(state.tuningIndex));
    var qs = params.toString();
    var newUrl = window.location.pathname + (qs ? '?' + qs : '');
    window.history.replaceState(null, '', newUrl);
  }

  function loadFromUrl() {
    var params = new URLSearchParams(window.location.search);
    var chordParam = params.get('chord');
    var instrumentParam = params.get('instrument');
    var tuningParam = params.get('tuning');

    if (instrumentParam && MT.INSTRUMENTS[instrumentParam]) {
      state.instrument = instrumentParam;
      Array.prototype.forEach.call(instrumentTabsEl.querySelectorAll('.instrument-tab'), function (btn) {
        btn.classList.toggle('is-active', btn.getAttribute('data-instrument') === instrumentParam);
      });
    }
    populateTuningSelect();
    if (tuningParam !== null) {
      var idx = parseInt(tuningParam, 10);
      if (!isNaN(idx) && idx >= 0 && idx < MT.INSTRUMENTS[state.instrument].tunings.length) {
        state.tuningIndex = idx;
        tuningSelect.value = String(idx);
      }
    }
    if (chordParam) chordInput.value = chordParam;

    if (params.get('embed') === '1') document.body.classList.add('is-embed');
  }

  /* =========================================================================
     Keyboard input
     ========================================================================= */

  function isTypingTarget(el) {
    return el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA');
  }

  window.addEventListener('keydown', function (e) {
    if (isTypingTarget(document.activeElement) && e.key !== 'Escape') {
      if (e.key === 'Escape') document.activeElement.blur();
      return;
    }

    if (e.code === 'Space') {
      e.preventDefault();
      if (currentShapes.length) {
        var tuning = getCurrentTuning();
        var openMidis = tuning.notes.map(function (n) { return MT.parseNoteName(n); });
        playShape(currentShapes[0], openMidis);
      }
      return;
    }
    if (/^[1-5]$/.test(e.key)) {
      var id = MT.INSTRUMENT_ORDER[parseInt(e.key, 10) - 1];
      if (id) setInstrument(id);
      return;
    }
  });

  /* =========================================================================
     Init
     ========================================================================= */

  renderQuickPicks();
  populateTuningSelect();
  loadFromUrl();
  renderAll();
})();
