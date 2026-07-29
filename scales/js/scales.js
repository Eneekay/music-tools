(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var MT = window.MusicTheory;

  /* =========================================================================
     Scale / mode definitions
     ========================================================================= */

  var SCALES = [
    { id: 'major', label: 'Major (Ionian)', intervals: [0, 2, 4, 5, 7, 9, 11], degrees: ['1', '2', '3', '4', '5', '6', '7'], chordTones: [0, 4, 7], quality: 'major' },
    { id: 'dorian', label: 'Dorian', intervals: [0, 2, 3, 5, 7, 9, 10], degrees: ['1', '2', 'b3', '4', '5', '6', 'b7'], chordTones: [0, 3, 7], quality: 'minor' },
    { id: 'phrygian', label: 'Phrygian', intervals: [0, 1, 3, 5, 7, 8, 10], degrees: ['1', 'b2', 'b3', '4', '5', 'b6', 'b7'], chordTones: [0, 3, 7], quality: 'minor' },
    { id: 'lydian', label: 'Lydian', intervals: [0, 2, 4, 6, 7, 9, 11], degrees: ['1', '2', '3', '#4', '5', '6', '7'], chordTones: [0, 4, 7], quality: 'major' },
    { id: 'mixolydian', label: 'Mixolydian', intervals: [0, 2, 4, 5, 7, 9, 10], degrees: ['1', '2', '3', '4', '5', '6', 'b7'], chordTones: [0, 4, 7], quality: 'major' },
    { id: 'aeolian', label: 'Minor (Aeolian)', intervals: [0, 2, 3, 5, 7, 8, 10], degrees: ['1', '2', 'b3', '4', '5', 'b6', 'b7'], chordTones: [0, 3, 7], quality: 'minor' },
    { id: 'locrian', label: 'Locrian', intervals: [0, 1, 3, 5, 6, 8, 10], degrees: ['1', 'b2', 'b3', '4', 'b5', 'b6', 'b7'], chordTones: [0, 3, 6], quality: 'minor' },
    { id: 'majorPent', label: 'Major Pentatonic', intervals: [0, 2, 4, 7, 9], degrees: ['1', '2', '3', '5', '6'], chordTones: [0, 4, 7], quality: 'major' },
    { id: 'minorPent', label: 'Minor Pentatonic', intervals: [0, 3, 5, 7, 10], degrees: ['1', 'b3', '4', '5', 'b7'], chordTones: [0, 3, 7], quality: 'minor' },
    { id: 'blues', label: 'Blues', intervals: [0, 3, 5, 6, 7, 10], degrees: ['1', 'b3', '4', 'b5', '5', 'b7'], chordTones: [0, 3, 7], quality: 'minor' },
    { id: 'harmonicMinor', label: 'Harmonic Minor', intervals: [0, 2, 3, 5, 7, 8, 11], degrees: ['1', '2', 'b3', '4', '5', 'b6', '7'], chordTones: [0, 3, 7], quality: 'minor' },
    { id: 'melodicMinor', label: 'Melodic Minor', intervals: [0, 2, 3, 5, 7, 9, 11], degrees: ['1', '2', 'b3', '4', '5', '6', '7'], chordTones: [0, 3, 7], quality: 'minor' },
    { id: 'chromatic', label: 'Chromatic', intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], degrees: ['1', 'b2', '2', 'b3', '3', '4', 'b5', '5', 'b6', '6', 'b7', '7'], chordTones: [0, 4, 7], quality: 'major' }
  ];

  var MODE_MAJOR_OFFSET = { major: 0, dorian: 2, phrygian: 4, lydian: 5, mixolydian: 7, aeolian: 9, locrian: 11 };

  // Note spelling for a minor-quality scale follows that root's natural-minor
  // key signature, which is not the same set of accidentals as its major-key
  // spelling (e.g. G major is spelled with a sharp, but G minor conventionally
  // uses flats) - indexed by root pitch class 0=C..11=B. MAJOR_FLATS mirrors
  // the same per-pc choice baked into the root-picker buttons' data-flats.
  var MINOR_FLATS = [true, false, true, true, false, true, false, true, false, false, true, false];
  var MAJOR_FLATS = [false, true, false, true, false, true, false, false, true, false, true, false];

  function effectiveFlats(scale) {
    // Minor pentatonic and blues are near-universally taught/written with
    // flats (b3, b5, b7) regardless of root, unlike the full 7-note minor
    // scales, which follow their own natural-minor key signature.
    if (scale.id === 'minorPent' || scale.id === 'blues') return true;
    return scale.quality === 'minor' ? MINOR_FLATS[state.root] : state.rootFlats;
  }

  // The root's own name always matches whatever the picker button says;
  // every other scale tone follows the scale-quality-appropriate convention.
  function spellingFlatsFor(pc, scale) {
    return pc === state.root ? state.rootFlats : effectiveFlats(scale);
  }

  function getCurrentScale() {
    for (var i = 0; i < SCALES.length; i++) if (SCALES[i].id === state.scaleId) return SCALES[i];
    return SCALES[0];
  }

  function formulaForScale(scale) {
    var iv = scale.intervals;
    var parts = [];
    for (var i = 0; i < iv.length; i++) {
      var next = (i + 1 < iv.length) ? iv[i + 1] : 12;
      var diff = next - iv[i];
      parts.push(diff === 1 ? 'H' : diff === 2 ? 'W' : diff === 3 ? 'WH' : (diff + 'sem'));
    }
    return parts.join('–');
  }

  /* =========================================================================
     State
     ========================================================================= */

  var state = {
    instrument: 'guitar',
    tuningIndex: 0,
    root: 0,
    rootFlats: false,
    scaleId: 'major',
    displayMode: 'notes',
    fretCount: 12,
    chordTonesOnly: false,
    leftHanded: false,
    waveform: 'triangle',
    toneVolume: 0.7
  };

  function getCurrentTuning() {
    return MT.INSTRUMENTS[state.instrument].tunings[state.tuningIndex];
  }

  /* =========================================================================
     Tone synthesis (fixed A4 = 440Hz — calibration lives in the Tuner)
     ========================================================================= */

  var audioCtx = null;

  function ensureAudioContext() {
    if (audioCtx) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AC();
  }

  function playTone(freq, duration) {
    ensureAudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    var t = audioCtx.currentTime;
    var vol = Math.max(state.toneVolume, 0.001);

    if (state.waveform === 'realistic') {
      window.InstrumentTones.playRealistic(audioCtx, audioCtx.destination, state.instrument, freq, t, vol);
      return;
    }

    var dur = duration || 0.6;
    var osc = audioCtx.createOscillator();
    osc.type = state.waveform;
    osc.frequency.setValueAtTime(freq, t);

    var gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    gain.gain.setValueAtTime(vol, t + Math.max(dur - 0.15, 0.03));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  /* =========================================================================
     DOM refs
     ========================================================================= */

  var instrumentTabsEl = document.getElementById('instrumentTabs');
  var tuningSelect = document.getElementById('tuningSelect');
  var rootPickerEl = document.getElementById('rootPicker');
  var scaleSelect = document.getElementById('scaleSelect');
  var fretboardSvg = document.getElementById('fretboardSvg');

  var displayModeControl = document.getElementById('displayModeControl');
  var fretCountControl = document.getElementById('fretCountControl');
  var chordTonesToggle = document.getElementById('chordTonesToggle');
  var leftHandedToggle = document.getElementById('leftHandedToggle');
  var waveControl = document.getElementById('waveControl');
  var toneVolumeSlider = document.getElementById('toneVolumeSlider');

  var scaleInfoNameEl = document.getElementById('scaleInfoName');
  var scaleInfoNotesEl = document.getElementById('scaleInfoNotes');
  var scaleInfoFormulaEl = document.getElementById('scaleInfoFormula');
  var scaleInfoParentEl = document.getElementById('scaleInfoParent');
  var playScaleBtn = document.getElementById('playScaleBtn');

  /* =========================================================================
     Fretboard rendering
     ========================================================================= */

  function labelFor(pc, intervalValue, scale) {
    if (state.displayMode === 'notes') return MT.noteNameForPc(pc, spellingFlatsFor(pc, scale));
    if (state.displayMode === 'intervals') return String(intervalValue);
    var idx = scale.intervals.indexOf(intervalValue);
    return scale.degrees[idx];
  }

  function playNoteAt(midi, circleEl) {
    playTone(MT.midiToFreq(midi, 440, 0), 0.6);
    circleEl.classList.add('is-triggered');
    setTimeout(function () { circleEl.classList.remove('is-triggered'); }, 500);
  }

  function renderFretboard() {
    var tuning = getCurrentTuning();
    var openMidis = tuning.notes.map(function (n) { return MT.parseNoteName(n); });
    var numStrings = openMidis.length;
    var scale = getCurrentScale();

    var scaleSet = {};
    scale.intervals.forEach(function (iv) { scaleSet[(state.root + iv) % 12] = iv; });
    var chordSet = {};
    (scale.chordTones || []).forEach(function (iv) { chordSet[(state.root + iv) % 12] = true; });

    var FRET_W = 56, STR_H = 42, PAD_L = 58, PAD_R = 52, PAD_TOP = 20, PAD_BOTTOM = 42;
    var fc = state.fretCount;
    var width = PAD_L + fc * FRET_W + PAD_R;
    var height = PAD_TOP + (numStrings - 1) * STR_H + PAD_BOTTOM;

    function xFret(f) {
      return state.leftHanded ? (PAD_L + (fc - f) * FRET_W) : (PAD_L + f * FRET_W);
    }
    // Fret 0 (open string) sits at the nut; fret N (N>=1) is played in the
    // space between wire N-1 and wire N, so its marker belongs at that
    // space's midpoint, not on the wire itself.
    function xForFretSpace(f) {
      if (f === 0) return xFret(0);
      return (xFret(f - 1) + xFret(f)) / 2;
    }
    function yString(i) { return PAD_TOP + i * STR_H; }

    fretboardSvg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    fretboardSvg.innerHTML = '';

    var xMin = Math.min(xFret(0), xFret(fc));
    var xMax = Math.max(xFret(0), xFret(fc));

    for (var i = 0; i < numStrings; i++) {
      var line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('class', 'fret-string');
      line.setAttribute('x1', xMin); line.setAttribute('y1', yString(i));
      line.setAttribute('x2', xMax); line.setAttribute('y2', yString(i));
      fretboardSvg.appendChild(line);

      // Open-string note, labeled clear of the nut (left in normal
      // orientation, right when left-handed) - matches the Fretboard
      // Trainer's fretboard, spelled using the same scale-aware convention
      // as every other note on this diagram.
      var openPc = ((openMidis[i] % 12) + 12) % 12;
      var strLabel = document.createElementNS(SVG_NS, 'text');
      strLabel.setAttribute('class', 'string-label');
      strLabel.setAttribute('x', String(xFret(0) + (state.leftHanded ? 24 : -24)));
      strLabel.setAttribute('y', String(yString(i)));
      strLabel.setAttribute('text-anchor', state.leftHanded ? 'start' : 'end');
      strLabel.textContent = MT.noteNameForPc(openPc, spellingFlatsFor(openPc, scale));
      fretboardSvg.appendChild(strLabel);
    }

    for (var f = 0; f <= fc; f++) {
      var fw = document.createElementNS(SVG_NS, 'line');
      fw.setAttribute('class', f === 0 ? 'fret-nut' : 'fret-wire');
      var fx = xFret(f);
      fw.setAttribute('x1', fx); fw.setAttribute('y1', yString(0) - 8);
      fw.setAttribute('x2', fx); fw.setAttribute('y2', yString(numStrings - 1) + 8);
      fretboardSvg.appendChild(fw);
    }

    [3, 5, 7, 9, 12, 15, 17, 19, 21, 24].forEach(function (mf) {
      if (mf > fc) return;
      var cx = xForFretSpace(mf);
      var baseY = yString(numStrings - 1) + 18;

      var numEl = document.createElementNS(SVG_NS, 'text');
      numEl.setAttribute('class', 'fret-number');
      numEl.setAttribute('x', cx);
      numEl.setAttribute('y', baseY + 16);
      numEl.textContent = String(mf);
      fretboardSvg.appendChild(numEl);

      var dotYs = (mf % 12 === 0) ? [baseY - 6, baseY + 6] : [baseY];
      dotYs.forEach(function (dy) {
        var m = document.createElementNS(SVG_NS, 'circle');
        m.setAttribute('class', 'fret-marker');
        m.setAttribute('cx', cx); m.setAttribute('cy', dy); m.setAttribute('r', 3);
        fretboardSvg.appendChild(m);
      });
    });

    for (var s = 0; s < numStrings; s++) {
      for (var fr = 0; fr <= fc; fr++) {
        var midi = openMidis[s] + fr;
        var pc = ((midi % 12) + 12) % 12;
        if (!(pc in scaleSet)) continue;
        var isRoot = pc === state.root;
        var isChordTone = !!chordSet[pc];
        if (state.chordTonesOnly && !isChordTone) continue;

        var cx2 = xForFretSpace(fr), cy2 = yString(s);
        var g = document.createElementNS(SVG_NS, 'g');

        var circle = document.createElementNS(SVG_NS, 'circle');
        circle.setAttribute('class', 'note-dot' + (isRoot ? ' is-root' : ''));
        circle.setAttribute('cx', cx2); circle.setAttribute('cy', cy2); circle.setAttribute('r', 12);

        var label = document.createElementNS(SVG_NS, 'text');
        label.setAttribute('class', 'note-label');
        label.setAttribute('x', cx2); label.setAttribute('y', cy2 + 4);
        label.textContent = labelFor(pc, scaleSet[pc], scale);

        g.appendChild(circle);
        g.appendChild(label);
        (function (midiVal, circleEl) {
          g.addEventListener('click', function () { playNoteAt(midiVal, circleEl); });
        })(midi, circle);
        fretboardSvg.appendChild(g);
      }
    }
  }

  /* =========================================================================
     Scale info panel
     ========================================================================= */

  function renderScaleInfo() {
    var scale = getCurrentScale();
    var rootName = MT.noteNameForPc(state.root, state.rootFlats);

    scaleInfoNameEl.textContent = rootName + ' ' + scale.label;
    scaleInfoNotesEl.textContent = scale.intervals
      .map(function (iv) {
        var pc = (state.root + iv) % 12;
        return MT.noteNameForPc(pc, spellingFlatsFor(pc, scale));
      })
      .join(' · ');
    scaleInfoFormulaEl.textContent = formulaForScale(scale);

    var offset = MODE_MAJOR_OFFSET[scale.id];
    if (offset !== undefined && scale.id !== 'major') {
      var parentPc = ((state.root - offset) % 12 + 12) % 12;
      scaleInfoParentEl.textContent = 'Parent major: ' + MT.noteNameForPc(parentPc, MAJOR_FLATS[parentPc]) + ' Major';
    } else {
      scaleInfoParentEl.innerHTML = '&nbsp;';
    }
  }

  function playScale() {
    var scale = getCurrentScale();
    var rootMidi = 60 + state.root;
    var sequence = scale.intervals.map(function (iv) { return rootMidi + iv; });
    sequence.push(rootMidi + 12);
    var noteDur = 0.32;

    playScaleBtn.classList.add('is-playing');
    sequence.forEach(function (midi, i) {
      setTimeout(function () {
        playTone(MT.midiToFreq(midi, 440, 0), noteDur + 0.05);
        if (i === sequence.length - 1) {
          setTimeout(function () { playScaleBtn.classList.remove('is-playing'); }, (noteDur + 0.05) * 1000);
        }
      }, i * noteDur * 1000);
    });
  }

  /* =========================================================================
     Segmented control helper
     ========================================================================= */

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

  /* =========================================================================
     Instrument / tuning / root / scale wiring
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

  function populateScaleSelect() {
    scaleSelect.innerHTML = '';
    SCALES.forEach(function (s) {
      var opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.label;
      scaleSelect.appendChild(opt);
    });
    scaleSelect.value = state.scaleId;
  }

  function setInstrument(id) {
    if (!MT.INSTRUMENTS[id]) return;
    state.instrument = id;
    state.tuningIndex = 0;
    Array.prototype.forEach.call(instrumentTabsEl.querySelectorAll('.instrument-tab'), function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-instrument') === id);
    });
    populateTuningSelect();
    renderFretboard();
  }

  function setRoot(pc, flats) {
    state.root = pc;
    state.rootFlats = flats;
    Array.prototype.forEach.call(rootPickerEl.querySelectorAll('button'), function (b) {
      b.classList.toggle('is-active', parseInt(b.getAttribute('data-pc'), 10) === pc);
    });
    renderFretboard();
    renderScaleInfo();
  }

  instrumentTabsEl.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('.instrument-tab') : null;
    if (!btn) return;
    setInstrument(btn.getAttribute('data-instrument'));
  });

  tuningSelect.addEventListener('change', function () {
    state.tuningIndex = parseInt(tuningSelect.value, 10);
    renderFretboard();
  });

  rootPickerEl.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('button') : null;
    if (!btn) return;
    setRoot(parseInt(btn.getAttribute('data-pc'), 10), btn.getAttribute('data-flats') === 'true');
  });

  scaleSelect.addEventListener('change', function () {
    state.scaleId = scaleSelect.value;
    renderFretboard();
    renderScaleInfo();
  });

  /* =========================================================================
     Display wiring
     ========================================================================= */

  wireSegControl(displayModeControl, function (value) {
    state.displayMode = value;
    renderFretboard();
  });

  wireSegControl(fretCountControl, function (value) {
    state.fretCount = parseInt(value, 10);
    renderFretboard();
  });

  chordTonesToggle.addEventListener('change', function () {
    state.chordTonesOnly = chordTonesToggle.checked;
    renderFretboard();
  });

  leftHandedToggle.addEventListener('change', function () {
    state.leftHanded = leftHandedToggle.checked;
    renderFretboard();
  });

  wireSegControl(waveControl, function (value) { state.waveform = value; });
  toneVolumeSlider.addEventListener('input', function () { state.toneVolume = parseFloat(toneVolumeSlider.value); });

  playScaleBtn.addEventListener('click', playScale);

  /* =========================================================================
     Keyboard input
     ========================================================================= */

  function isTypingTarget(el) {
    return el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA');
  }

  function cycleRoot(dir) {
    var newPc = ((state.root + dir) % 12 + 12) % 12;
    var btn = rootPickerEl.querySelector('button[data-pc="' + newPc + '"]');
    setRoot(newPc, btn.getAttribute('data-flats') === 'true');
  }

  function cycleScale(dir) {
    var idx = 0;
    for (var i = 0; i < SCALES.length; i++) if (SCALES[i].id === state.scaleId) { idx = i; break; }
    var newIdx = ((idx + dir) % SCALES.length + SCALES.length) % SCALES.length;
    state.scaleId = SCALES[newIdx].id;
    scaleSelect.value = state.scaleId;
    renderFretboard();
    renderScaleInfo();
  }

  window.addEventListener('keydown', function (e) {
    if (isTypingTarget(document.activeElement) && e.key !== 'Escape') return;

    if (e.code === 'Space') { e.preventDefault(); playScale(); return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); cycleRoot(-1); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); cycleRoot(1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); cycleScale(-1); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); cycleScale(1); return; }
    if (/^[1-5]$/.test(e.key)) {
      var id = MT.INSTRUMENT_ORDER[parseInt(e.key, 10) - 1];
      if (id) setInstrument(id);
      return;
    }
  });

  /* =========================================================================
     Init
     ========================================================================= */

  populateScaleSelect();
  setInstrument('guitar');
  setRoot(0, false);
  renderScaleInfo();
})();
