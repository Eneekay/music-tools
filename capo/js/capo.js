/* Capo & Key Transposer — type a chord sequence and a target key; every
   chord is transposed by the same interval and shown two ways: "Use Capo"
   keeps your original shapes exactly as typed and reports the capo fret
   that makes them sound in the target key (the classic guitarist's
   shortcut), while "New Chords" finds fresh full-neck fingerings for the
   actual transposed chords, for players who'd rather not capo. The chord
   parser and fingering search are self-contained copies of the Chord Chart
   Generator's (per this codebase's per-tool convention), extended to also
   remember each chord's original quality suffix so a transposed chord can
   be re-spelled with a new root but the same quality. No external
   libraries. */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var MT = window.MusicTheory;

  var LETTER_SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  var KEY_LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  var KEY_ACCIDENTALS = [
    { label: '♮', value: '' },
    { label: '♭', value: 'b' },
    { label: '♯', value: '#' }
  ];
  // Conventional spelling per pitch class, used for auto-detecting the
  // original key and when cycling the target key with the arrow keys -
  // there's no single "correct" letter+accidental for a pitch class, so
  // pick the everyday default rather than guess.
  var PC_SPELLING = [
    { letter: 'C', acc: '' }, { letter: 'D', acc: 'b' }, { letter: 'D', acc: '' }, { letter: 'E', acc: 'b' },
    { letter: 'E', acc: '' }, { letter: 'F', acc: '' }, { letter: 'F', acc: '#' }, { letter: 'G', acc: '' },
    { letter: 'A', acc: 'b' }, { letter: 'A', acc: '' }, { letter: 'B', acc: 'b' }, { letter: 'B', acc: '' }
  ];

  function letterAccToPc(letter, acc) {
    return (((LETTER_SEMITONE[letter] + (acc === '#' ? 1 : acc === 'b' ? -1 : 0)) % 12) + 12) % 12;
  }

  /* =========================================================================
     Chord-name parsing — copy of the Chord Chart Generator's parser,
     extended to also return the raw quality suffix (e.g. "m7", "sus4") so a
     transposed chord can be respelled with a new root but the same quality.
     ========================================================================= */

  var QUALITIES = {
    '': { intervals: [0, 4, 7] },
    'maj': { intervals: [0, 4, 7] },
    'M': { intervals: [0, 4, 7] },
    'm': { intervals: [0, 3, 7] },
    'min': { intervals: [0, 3, 7] },
    '-': { intervals: [0, 3, 7] },
    '5': { intervals: [0, 7] },
    'dim': { intervals: [0, 3, 6] },
    'dim7': { intervals: [0, 3, 6, 9] },
    'm7b5': { intervals: [0, 3, 6, 10] },
    'aug': { intervals: [0, 4, 8] },
    '+': { intervals: [0, 4, 8] },
    'sus2': { intervals: [0, 2, 7] },
    'sus4': { intervals: [0, 5, 7] },
    'sus': { intervals: [0, 5, 7] },
    '6': { intervals: [0, 4, 7, 9] },
    'maj6': { intervals: [0, 4, 7, 9] },
    'm6': { intervals: [0, 3, 7, 9] },
    'min6': { intervals: [0, 3, 7, 9] },
    '6/9': { intervals: [0, 4, 7, 9, 14] },
    '69': { intervals: [0, 4, 7, 9, 14] },
    '7': { intervals: [0, 4, 7, 10] },
    '7sus4': { intervals: [0, 5, 7, 10] },
    '7sus2': { intervals: [0, 2, 7, 10] },
    '7b5': { intervals: [0, 4, 6, 10] },
    '7#5': { intervals: [0, 4, 8, 10] },
    '7b9': { intervals: [0, 4, 7, 10, 13] },
    '7#9': { intervals: [0, 4, 7, 10, 15] },
    '7#11': { intervals: [0, 4, 7, 10, 18] },
    'maj7': { intervals: [0, 4, 7, 11] },
    'M7': { intervals: [0, 4, 7, 11] },
    'maj7#5': { intervals: [0, 4, 8, 11] },
    'm7': { intervals: [0, 3, 7, 10] },
    'min7': { intervals: [0, 3, 7, 10] },
    'mmaj7': { intervals: [0, 3, 7, 11] },
    'mM7': { intervals: [0, 3, 7, 11] },
    'm(maj7)': { intervals: [0, 3, 7, 11] },
    '9': { intervals: [0, 4, 7, 10, 14] },
    'maj9': { intervals: [0, 4, 7, 11, 14] },
    'm9': { intervals: [0, 3, 7, 10, 14] },
    'add9': { intervals: [0, 4, 7, 14] },
    'madd9': { intervals: [0, 3, 7, 14] },
    '11': { intervals: [0, 4, 7, 10, 14, 17] },
    'm11': { intervals: [0, 3, 7, 10, 14, 17] },
    'maj11': { intervals: [0, 4, 7, 11, 14, 17] },
    '13': { intervals: [0, 4, 7, 10, 14, 17, 21] },
    'maj13': { intervals: [0, 4, 7, 11, 14, 17, 21] },
    'm13': { intervals: [0, 3, 7, 10, 14, 17, 21] }
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

    var rootPc = letterAccToPc(rootLetter, rootAcc);
    var bassPc = bassLetter ? letterAccToPc(bassLetter, bassAcc) : null;

    return {
      rootPc: rootPc,
      qualitySuffix: qualityRaw,
      intervals: quality.intervals,
      bassPc: bassPc,
      displayName: rootLetter + rootAcc + qualityRaw + (bassLetter ? '/' + bassLetter + bassAcc : '')
    };
  }

  function transposeChord(chord, shift, flats) {
    var newRootPc = ((chord.rootPc + shift) % 12 + 12) % 12;
    var newBassPc = chord.bassPc !== null ? ((chord.bassPc + shift) % 12 + 12) % 12 : null;
    var name = MT.noteNameForPc(newRootPc, flats) + chord.qualitySuffix;
    if (newBassPc !== null) name += '/' + MT.noteNameForPc(newBassPc, flats);
    return { rootPc: newRootPc, qualitySuffix: chord.qualitySuffix, intervals: chord.intervals, bassPc: newBassPc, displayName: name };
  }

  function parseSequence(raw) {
    var trimmed = (raw || '').trim();
    if (!trimmed) return [];
    return trimmed.split(/[\s,|]+/).filter(Boolean).map(function (tok) {
      return { raw: tok, chord: parseChordName(tok) };
    });
  }

  /* =========================================================================
     Fingering search — copy of the Chord Chart Generator's full-neck
     search, used two ways: restricted to OPEN_POSITIONS (fret 0 only, a
     window of 4) for "Use Capo" mode, since a shape you already play open
     doesn't change when you capo it; or the full POSITIONS sweep for "New
     Chords" mode, which needs to find a fresh voicing for the transposed
     chord anywhere on the neck.
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
  var POSITIONS = [0, 3, 6, 9];
  var OPEN_POSITIONS = [0];

  function optionsForString(openMidi, position, requiredPcsSet) {
    var opts = [{ fret: -1 }];
    var openPc = ((openMidi % 12) + 12) % 12;
    if (requiredPcsSet[openPc]) opts.push({ fret: 0 });
    var start = Math.max(1, position);
    for (var f = start; f <= position + WINDOW; f++) {
      var pc = ((openMidi + f) % 12 + 12) % 12;
      if (requiredPcsSet[pc]) opts.push({ fret: f });
    }
    return opts;
  }

  // A barre is always the finger closest to the nut in the shape - it lies
  // flat across the LOWEST fret used, and other fingers press HIGHER frets
  // on top of it for whichever strings need them. Detecting a barre means
  // finding the widest contiguous run of strings at the shape's minimum
  // fret, where the only illegal gap is an OPEN string; muted strings and
  // strings fretted higher are both fine pass-throughs.
  function detectBarre(fretPattern) {
    var minFret = null;
    fretPattern.forEach(function (fe) { if (fe.fret > 0 && (minFret === null || fe.fret < minFret)) minFret = fe.fret; });
    if (minFret === null) return null;

    var anchors = [];
    fretPattern.forEach(function (fe, i) { if (fe.fret === minFret) anchors.push(i); });
    if (anchors.length < 2) return null;

    var spans = [];
    var run = [anchors[0]];
    for (var k = 1; k < anchors.length; k++) {
      var blockedByOpen = false;
      for (var s = anchors[k - 1] + 1; s < anchors[k]; s++) {
        if (fretPattern[s].fret === 0) { blockedByOpen = true; break; }
      }
      if (blockedByOpen) { spans.push(run); run = [anchors[k]]; }
      else { run.push(anchors[k]); }
    }
    spans.push(run);

    var best = null;
    spans.forEach(function (r) {
      if (r.length < 2) return;
      var lo = r[0], hi = r[r.length - 1];
      if (!best || (hi - lo) > (best.hi - best.lo)) best = { lo: lo, hi: hi, fret: minFret };
    });
    return best;
  }

  // A same-fret run only reads as a single finger if it's wide enough to
  // actually need a barre (see MIN_BARRE_STRINGS below, shared with the
  // visual bar threshold) - a 2-3 string run is exactly the situation a
  // real player fingers individually (e.g. the D-G-B strings of an open A
  // chord get fingers 1-2-3, not one finger barred across three strings),
  // so those split into one group per string instead of merging.
  function groupContiguousSameFret(fretPattern) {
    var byFret = {};
    fretPattern.forEach(function (fe, i) { if (fe.fret > 0) (byFret[fe.fret] = byFret[fe.fret] || []).push(i); });
    var groups = [];
    Object.keys(byFret).forEach(function (fretStr) {
      var fret = parseInt(fretStr, 10);
      var indices = byFret[fretStr];
      var run = [indices[0]];
      function flush() {
        if (run.length >= MIN_BARRE_STRINGS) {
          groups.push({ fret: fret, strings: run.slice() });
        } else {
          run.forEach(function (idx) { groups.push({ fret: fret, strings: [idx] }); });
        }
      }
      for (var k = 1; k < indices.length; k++) {
        var blocked = false;
        for (var s = indices[k - 1] + 1; s < indices[k]; s++) {
          if (fretPattern[s].fret !== -1) { blocked = true; break; }
        }
        if (blocked) { flush(); run = [indices[k]]; }
        else { run.push(indices[k]); }
      }
      flush();
    });
    return groups;
  }

  // Every finger group - the barre (if any) plus whatever else is grouped
  // on top of / around it - counts as "one finger".
  //
  // A detected barre only counts as one finger in one of two situations:
  //  - it's a genuine "reach across" (some string inside the span is
  //    fretted HIGHER, e.g. open D's G and high-E strings both at fret 2
  //    with B at fret 3 between them) - that always takes one finger
  //    flattened underneath, no matter how few strings it actually
  //    touches, because there's no alternative technique for it;
  //  - or it's a solid, gap-free block of same-fret strings wide enough to
  //    actually need barring (MIN_BARRE_STRINGS). A solid block NARROWER
  //    than that (e.g. the D-G-B strings of open A, all fret 2 with
  //    nothing fretted differently between them) is exactly the case a
  //    real player fingers individually, so it's left uncovered here and
  //    groupContiguousSameFret gives each string its own finger instead.
  function computeFingerGroups(fretPattern) {
    var barre = detectBarre(fretPattern);
    var barreCovered = {};
    if (barre) {
      for (var i = barre.lo; i <= barre.hi; i++) {
        if (fretPattern[i].fret === barre.fret) barreCovered[i] = true;
      }
      var touchedCount = Object.keys(barreCovered).length;
      var spanWidth = barre.hi - barre.lo + 1;
      var isReachAcross = touchedCount < spanWidth;
      if (!isReachAcross && spanWidth < MIN_BARRE_STRINGS) {
        barre = null;
        barreCovered = {};
      }
    }
    var reduced = fretPattern.map(function (fe, i) { return barreCovered[i] ? { fret: -1 } : fe; });
    var groups = groupContiguousSameFret(reduced);
    if (barre) {
      groups.unshift({
        fret: barre.fret,
        strings: Object.keys(barreCovered).map(Number).sort(function (a, b) { return a - b; }),
        isBarre: true, spanLo: barre.lo, spanHi: barre.hi
      });
    }
    return groups;
  }

  function estimateFingerCount(fretPattern) {
    return computeFingerGroups(fretPattern).length;
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

    var fingerCount = estimateFingerCount(fretPattern);
    var fingerPenalty = Math.max(0, fingerCount - 4) * 4;

    return mutedCount * 1.5 + missingWeight * 2.5 + (bassOk ? 0 : 6) + span * 1.0 + lowestFretted * 1.2 + fingerPenalty;
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

  function searchChord(chord, openMidis, positions) {
    var weightedTones = buildChordTones(chord.rootPc, chord.intervals);
    var requiredBassPc = chord.bassPc !== null ? chord.bassPc : chord.rootPc;
    var requiredPcsSet = {};
    weightedTones.forEach(function (t) { requiredPcsSet[t.pc] = true; });
    requiredPcsSet[requiredBassPc] = true;

    var found = [];
    var seen = {};
    positions.forEach(function (pos) {
      var result = bestForPosition(openMidis, pos, weightedTones, requiredPcsSet, requiredBassPc);
      if (!result) return;
      var key = result.fretPattern.map(function (fe) { return fe.fret; }).join(',');
      if (seen[key]) return;
      seen[key] = true;
      found.push(result);
    });
    found.sort(function (a, b) { return a.cost - b.cost; });
    return found[0] || null;
  }

  var MIN_BARRE_STRINGS = 4;

  function findBarreGroups(fretPattern) {
    return computeFingerGroups(fretPattern)
      .filter(function (g) { return g.isBarre && (g.spanHi - g.spanLo + 1) >= MIN_BARRE_STRINGS; })
      .map(function (g) { return { fret: g.fret, strings: [g.spanLo, g.spanHi] }; });
  }

  function assignFingers(fretPattern) {
    var groups = computeFingerGroups(fretPattern);
    groups.sort(function (a, b) { return a.fret - b.fret || a.strings[0] - b.strings[0]; });
    var byString = {};
    groups.forEach(function (g, idx) {
      g.strings.forEach(function (s) { byString[s] = idx + 1; });
    });
    return byString;
  }

  /* =========================================================================
     State
     ========================================================================= */

  var state = {
    instrument: 'guitar',
    sequenceText: 'C G Am F',
    origLetter: 'C',
    origAccidental: '',
    originalRoot: 0,
    originalRootFlats: false,
    originalAuto: true,
    keyLetter: 'D',
    keyAccidental: '',
    targetRoot: 2,
    targetRootFlats: false,
    voicingMode: 'capo'
  };

  /* =========================================================================
     DOM refs
     ========================================================================= */

  var instrumentTabsEl = document.getElementById('instrumentTabs');
  var sequenceInputEl = document.getElementById('sequenceInput');
  var origNoteChipsEl = document.getElementById('origNoteChips');
  var origAccidentalChipsEl = document.getElementById('origAccidentalChips');
  var origCaptionEl = document.getElementById('origCaption');
  var origAutoBtn = document.getElementById('origAutoBtn');
  var keyNoteChipsEl = document.getElementById('keyNoteChips');
  var keyAccidentalChipsEl = document.getElementById('keyAccidentalChips');
  var voicingControlEl = document.getElementById('voicingControl');
  var capoBannerEl = document.getElementById('capoBanner');
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
     Chord-box diagram
     ========================================================================= */

  function buildChordBoxSvg(fretPattern, openMidis, rootPc) {
    var numStrings = openMidis.length;
    var GRID_W = 30, GRID_H = 30, PAD_TOP = 26, PAD_BOTTOM = 8, PAD_L = 18, PAD_R = 18;
    var minFretUsed = 0, maxFretUsed = 0;
    fretPattern.forEach(function (fe) {
      if (fe.fret > 0) {
        if (minFretUsed === 0 || fe.fret < minFretUsed) minFretUsed = fe.fret;
        if (fe.fret > maxFretUsed) maxFretUsed = fe.fret;
      }
    });
    var baseFret = minFretUsed > WINDOW ? minFretUsed - 1 : 0;
    // Normally WINDOW (4) rows is enough, but a "New Chords" full-neck
    // search can occasionally return a voicing whose span reaches the edge
    // of its search window - grow the grid rather than clip that note.
    var rows = Math.max(WINDOW, maxFretUsed - baseFret);
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
      line.setAttribute('class', (r === 0 && baseFret === 0) ? 'chordbox-nut' : 'chordbox-fret-line');
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

    if (baseFret > 0) {
      var baseLabel = document.createElementNS(SVG_NS, 'text');
      baseLabel.setAttribute('class', 'chordbox-basefret');
      baseLabel.setAttribute('x', PAD_L - 12);
      baseLabel.setAttribute('y', rowY(0) + GRID_H / 2 + 4);
      baseLabel.textContent = String(baseFret + 1);
      svg.appendChild(baseLabel);
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

    findBarreGroups(fretPattern).forEach(function (g) {
      var xs = g.strings.map(stringX);
      var y = rowY(g.fret - baseFret) - GRID_H / 2;
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
      var cx = stringX(i), cy = rowY(fe.fret - baseFret) - GRID_H / 2;

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
     Results
     ========================================================================= */

  function getCurrentOpenMidis() {
    var tuning = MT.INSTRUMENTS[state.instrument].tunings[0];
    return tuning.notes.map(function (n) { return MT.parseNoteName(n); });
  }

  function updateOrigCaption() {
    origCaptionEl.textContent = state.originalAuto
      ? 'Auto-detected from the first chord you typed.'
      : 'Manually set — click Auto-detect to sync with the sequence again.';
  }

  function syncAutoOriginal(tokens) {
    if (!state.originalAuto) return;
    var firstValid = tokens.filter(function (t) { return t.chord; })[0];
    if (!firstValid) return;
    var pc = firstValid.chord.rootPc;
    if (pc === state.originalRoot) return;
    var spelling = PC_SPELLING[pc];
    state.originalRoot = pc;
    state.origLetter = spelling.letter;
    state.origAccidental = spelling.acc;
    state.originalRootFlats = spelling.acc === 'b';
    renderOrigNoteChips();
    renderOrigAccidentalChips();
  }

  function buildInvalidCard(raw) {
    var card = document.createElement('div');
    card.className = 'result-card is-invalid';
    var title = document.createElement('div');
    title.className = 'result-shape-title';
    title.textContent = raw;
    card.appendChild(title);
    var msg = document.createElement('div');
    msg.className = 'result-fret is-none';
    msg.textContent = 'Not recognized';
    card.appendChild(msg);
    return card;
  }

  function buildResultCard(opts) {
    var card = document.createElement('div');
    card.className = 'result-card';

    var title = document.createElement('div');
    title.className = 'result-shape-title';
    title.textContent = opts.primaryName;
    card.appendChild(title);

    if (!opts.fingering) {
      var none = document.createElement('div');
      none.className = 'result-fret is-none';
      none.textContent = 'No clean voicing found';
      card.appendChild(none);
      return card;
    }

    if (opts.capoFret > 0) {
      var fretEl = document.createElement('div');
      fretEl.className = 'result-fret';
      fretEl.textContent = 'Capo ' + opts.capoFret;
      card.appendChild(fretEl);
    } else {
      var noCapoEl = document.createElement('div');
      noCapoEl.className = 'result-fret is-none';
      noCapoEl.textContent = 'No capo';
      card.appendChild(noCapoEl);
    }

    card.appendChild(buildChordBoxSvg(opts.fingering.fretPattern, opts.openMidis, opts.rootPc));

    var soundsAs = document.createElement('div');
    soundsAs.className = 'result-sounds-as';
    soundsAs.textContent = opts.secondaryLabel;
    card.appendChild(soundsAs);

    var playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className = 'result-play-btn';
    playBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5-11-6.5z"></path></svg><span>Play</span>';
    playBtn.addEventListener('click', function () { playResult(opts.fingering.fretPattern, opts.openMidis, opts.capoFret); });
    card.appendChild(playBtn);

    return card;
  }

  function renderCapoBanner(shift) {
    var targetName = MT.noteNameForPc(state.targetRoot, state.targetRootFlats);
    if (state.voicingMode === 'capo') {
      if (shift === 0) {
        capoBannerEl.className = 'capo-banner is-none';
        capoBannerEl.textContent = 'Already in ' + targetName + ' — no capo needed, play the chords exactly as typed.';
      } else {
        capoBannerEl.className = 'capo-banner';
        capoBannerEl.innerHTML = 'Capo Fret <strong>' + shift + '</strong> — play the exact chords you typed above, and they’ll sound in ' + targetName + '.';
      }
    } else {
      capoBannerEl.className = 'capo-banner is-alt';
      capoBannerEl.textContent = 'No capo — here are the actual chord shapes to play in ' + targetName + '.';
    }
  }

  function renderResults() {
    var tokens = parseSequence(state.sequenceText);
    syncAutoOriginal(tokens);
    updateOrigCaption();

    resultRowEl.innerHTML = '';

    if (!tokens.length) {
      capoBannerEl.className = 'capo-banner is-none';
      capoBannerEl.textContent = '';
      var emptyAll = document.createElement('div');
      emptyAll.className = 'result-empty';
      emptyAll.textContent = 'Type a chord sequence above — e.g. C G Am F — to see it transposed.';
      resultRowEl.appendChild(emptyAll);
      return;
    }

    var validTokens = tokens.filter(function (t) { return t.chord; });
    if (!validTokens.length) {
      capoBannerEl.className = 'capo-banner is-none';
      capoBannerEl.textContent = '';
      var emptyValid = document.createElement('div');
      emptyValid.className = 'result-empty';
      emptyValid.textContent = 'None of those look like recognized chords. Try something like C, G, Am, F, or Dm7.';
      resultRowEl.appendChild(emptyValid);
      return;
    }

    var openMidis = getCurrentOpenMidis();
    var shift = ((state.targetRoot - state.originalRoot) % 12 + 12) % 12;

    renderCapoBanner(shift);

    tokens.forEach(function (tok) {
      if (!tok.chord) {
        resultRowEl.appendChild(buildInvalidCard(tok.raw));
        return;
      }
      var transposed = transposeChord(tok.chord, shift, state.targetRootFlats);
      var card;
      if (state.voicingMode === 'capo') {
        var foundOpen = searchChord(tok.chord, openMidis, OPEN_POSITIONS);
        card = buildResultCard({
          primaryName: tok.chord.displayName,
          secondaryLabel: shift === 0 ? 'Sounds as written' : 'Sounds as ' + transposed.displayName,
          fingering: foundOpen,
          rootPc: tok.chord.rootPc,
          capoFret: shift,
          openMidis: openMidis
        });
      } else {
        var foundNew = searchChord(transposed, openMidis, POSITIONS);
        card = buildResultCard({
          primaryName: transposed.displayName,
          secondaryLabel: 'was ' + tok.chord.displayName,
          fingering: foundNew,
          rootPc: transposed.rootPc,
          capoFret: 0,
          openMidis: openMidis
        });
      }
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

  sequenceInputEl.addEventListener('input', function () {
    state.sequenceText = sequenceInputEl.value;
    renderResults();
  });

  function renderOrigNoteChips() {
    origNoteChipsEl.innerHTML = '';
    KEY_LETTERS.forEach(function (letter) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'builder-chip' + (state.origLetter === letter ? ' is-active' : '');
      btn.textContent = letter;
      btn.addEventListener('click', function () {
        state.origLetter = letter;
        state.originalAuto = false;
        applyOrigKeyBuilder();
        renderOrigNoteChips();
      });
      origNoteChipsEl.appendChild(btn);
    });
  }

  function renderOrigAccidentalChips() {
    origAccidentalChipsEl.innerHTML = '';
    KEY_ACCIDENTALS.forEach(function (acc) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'builder-chip' + (state.origAccidental === acc.value ? ' is-active' : '');
      btn.textContent = acc.label;
      btn.addEventListener('click', function () {
        state.origAccidental = acc.value;
        state.originalAuto = false;
        applyOrigKeyBuilder();
        renderOrigAccidentalChips();
      });
      origAccidentalChipsEl.appendChild(btn);
    });
  }

  function applyOrigKeyBuilder() {
    state.originalRoot = letterAccToPc(state.origLetter, state.origAccidental);
    state.originalRootFlats = state.origAccidental === 'b';
    renderResults();
  }

  origAutoBtn.addEventListener('click', function () {
    state.originalAuto = true;
    renderResults();
  });

  function applyTargetKeyBuilder() {
    state.targetRoot = letterAccToPc(state.keyLetter, state.keyAccidental);
    state.targetRootFlats = state.keyAccidental === 'b';
    renderResults();
  }

  function renderKeyNoteChips() {
    keyNoteChipsEl.innerHTML = '';
    KEY_LETTERS.forEach(function (letter) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'builder-chip' + (state.keyLetter === letter ? ' is-active' : '');
      btn.textContent = letter;
      btn.addEventListener('click', function () {
        state.keyLetter = letter;
        renderKeyNoteChips();
        applyTargetKeyBuilder();
      });
      keyNoteChipsEl.appendChild(btn);
    });
  }

  function renderKeyAccidentalChips() {
    keyAccidentalChipsEl.innerHTML = '';
    KEY_ACCIDENTALS.forEach(function (acc) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'builder-chip' + (state.keyAccidental === acc.value ? ' is-active' : '');
      btn.textContent = acc.label;
      btn.addEventListener('click', function () {
        state.keyAccidental = acc.value;
        renderKeyAccidentalChips();
        applyTargetKeyBuilder();
      });
      keyAccidentalChipsEl.appendChild(btn);
    });
  }

  function setTargetRootFromPc(pc) {
    var spelling = PC_SPELLING[((pc % 12) + 12) % 12];
    state.keyLetter = spelling.letter;
    state.keyAccidental = spelling.acc;
    renderKeyNoteChips();
    renderKeyAccidentalChips();
    applyTargetKeyBuilder();
  }

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

  wireSegControl(voicingControlEl, function (value) {
    state.voicingMode = value;
    renderResults();
  });

  function toggleVoicingMode() {
    var next = state.voicingMode === 'capo' ? 'new' : 'capo';
    state.voicingMode = next;
    voicingControlEl.querySelectorAll('button').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-value') === next);
    });
    renderResults();
  }

  /* =========================================================================
     Keyboard input
     ========================================================================= */

  function isTypingTarget(el) {
    return el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA');
  }

  function cycleTargetRoot(dir) {
    var newPc = ((state.targetRoot + dir) % 12 + 12) % 12;
    setTargetRootFromPc(newPc);
  }

  window.addEventListener('keydown', function (e) {
    if (isTypingTarget(document.activeElement) && e.key !== 'Escape') return;

    if (e.key === 'ArrowLeft') { e.preventDefault(); cycleTargetRoot(-1); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); cycleTargetRoot(1); return; }
    if (e.key === 'v' || e.key === 'V') { toggleVoicingMode(); return; }
    if (e.key === '1') { setInstrument('guitar'); return; }
    if (e.key === '3') { setInstrument('ukulele'); return; }
  });

  /* =========================================================================
     Init
     ========================================================================= */

  renderOrigNoteChips();
  renderOrigAccidentalChips();
  renderKeyNoteChips();
  renderKeyAccidentalChips();
  applyTargetKeyBuilder(); // default target: D — also renders results, which syncs Original Key from "C G Am F"
})();
