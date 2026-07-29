/* Interval Ear Trainer — three modes of increasing difficulty, all built on
   the same "play something, then answer" loop:

   Normal: two notes play, both drawn from the selected scale, always
           ascending - name the interval between them (relative pitch only,
           no note-naming required).
   Pro:    the scale's tonic plays as a fixed reference, then a target note
           from the scale - name the target note. Scale is the only setting
           that matters here (a fixed, consistent tonal anchor every
           question, matching how real scale-degree ear training works).
   God Mode: only the target note plays - no reference, no scale
           constraint (any of the 12 chromatic notes) - name it cold.

   No external libraries. */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var MT = window.MusicTheory;

  /* =========================================================================
     Scale data (root-preserving flats/sharps spelling) — a self-contained
     copy of the Scale Finder's, per this codebase's per-tool convention.
     ========================================================================= */

  var SCALES = [
    { id: 'major', label: 'Major (Ionian)', intervals: [0, 2, 4, 5, 7, 9, 11], quality: 'major' },
    { id: 'dorian', label: 'Dorian', intervals: [0, 2, 3, 5, 7, 9, 10], quality: 'minor' },
    { id: 'phrygian', label: 'Phrygian', intervals: [0, 1, 3, 5, 7, 8, 10], quality: 'minor' },
    { id: 'lydian', label: 'Lydian', intervals: [0, 2, 4, 6, 7, 9, 11], quality: 'major' },
    { id: 'mixolydian', label: 'Mixolydian', intervals: [0, 2, 4, 5, 7, 9, 10], quality: 'major' },
    { id: 'aeolian', label: 'Minor (Aeolian)', intervals: [0, 2, 3, 5, 7, 8, 10], quality: 'minor' },
    { id: 'locrian', label: 'Locrian', intervals: [0, 1, 3, 5, 6, 8, 10], quality: 'minor' },
    { id: 'majorPent', label: 'Major Pentatonic', intervals: [0, 2, 4, 7, 9], quality: 'major' },
    { id: 'minorPent', label: 'Minor Pentatonic', intervals: [0, 3, 5, 7, 10], quality: 'minor' },
    { id: 'blues', label: 'Blues', intervals: [0, 3, 5, 6, 7, 10], quality: 'minor' },
    { id: 'harmonicMinor', label: 'Harmonic Minor', intervals: [0, 2, 3, 5, 7, 8, 11], quality: 'minor' },
    { id: 'melodicMinor', label: 'Melodic Minor', intervals: [0, 2, 3, 5, 7, 9, 11], quality: 'minor' },
    { id: 'chromatic', label: 'Chromatic', intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], quality: 'major' }
  ];

  var MINOR_FLATS = [true, false, true, true, false, true, false, true, false, false, true, false];

  function effectiveFlats(scale, rootPc) {
    if (scale.id === 'minorPent' || scale.id === 'blues') return true;
    return scale.quality === 'minor' ? MINOR_FLATS[rootPc] : state.scaleRootFlats;
  }

  function spellingFlatsFor(pc, scale) {
    return pc === state.scaleRoot ? state.scaleRootFlats : effectiveFlats(scale, state.scaleRoot);
  }

  function getCurrentScale() {
    for (var i = 0; i < SCALES.length; i++) if (SCALES[i].id === state.scaleId) return SCALES[i];
    return SCALES[0];
  }

  var INTERVAL_NAMES = [
    'Unison', 'Minor 2nd', 'Major 2nd', 'Minor 3rd', 'Major 3rd', 'Perfect 4th',
    'Tritone', 'Perfect 5th', 'Minor 6th', 'Major 6th', 'Minor 7th', 'Major 7th', 'Octave'
  ];

  /* =========================================================================
     State
     ========================================================================= */

  var state = {
    mode: 'normal',
    instrument: 'guitar',
    waveform: 'triangle',
    scaleRoot: 0,
    scaleRootFlats: false,
    scaleId: 'major'
  };

  var session = {
    awaitingAnswer: false,
    currentQuestion: null, // { note1, note2, correctKey }
    promptStartTime: 0,
    playbackTimer: null
  };

  var stats = { total: 0, correct: 0, streak: 0, bestStreak: 0, reactionTimes: [], missByKey: {} };

  /* =========================================================================
     Audio
     ========================================================================= */

  var audioCtx = null;
  function ensureAudioContext() {
    if (audioCtx) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AC();
  }

  function playNote(midi, time, duration) {
    var freq = MT.midiToFreq(midi, 440, 0);
    var vol = 0.6;
    if (state.waveform === 'realistic' && state.instrument !== 'piano') {
      window.InstrumentTones.playRealistic(audioCtx, audioCtx.destination, state.instrument, freq, time, vol);
      return;
    }
    var dur = duration || 0.55;
    var osc = audioCtx.createOscillator();
    osc.type = state.waveform === 'realistic' ? 'triangle' : state.waveform;
    osc.frequency.setValueAtTime(freq, time);
    var gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(vol, time + 0.02);
    gain.gain.setValueAtTime(vol, time + Math.max(dur - 0.12, 0.03));
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(time); osc.stop(time + dur + 0.05);
  }

  /* =========================================================================
     DOM refs
     ========================================================================= */

  var instrumentTabsEl = document.getElementById('instrumentTabs');
  var waveControlEl = document.getElementById('waveControl');
  var modeControlEl = document.getElementById('modeControl');
  var modeHintEl = document.getElementById('modeHint');
  var scaleWidgetEl = document.querySelector('.scale-widget');
  var rootPickerEl = document.getElementById('rootPicker');
  var scaleSelectEl = document.getElementById('scaleSelect');
  var scaleHintEl = document.getElementById('scaleHint');

  var promptStatusEl = document.getElementById('promptStatus');
  var playBtn = document.getElementById('playBtn');
  var playBtnLabel = document.getElementById('playBtnLabel');
  var answerGridEl = document.getElementById('answerGrid');

  var pianoFeedbackEl = document.getElementById('pianoFeedback');
  var feedbackPianoSvg = document.getElementById('feedbackPianoSvg');

  var statAccuracyEl = document.getElementById('statAccuracy');
  var statAvgTimeEl = document.getElementById('statAvgTime');
  var statStreakEl = document.getElementById('statStreak');
  var statBestEl = document.getElementById('statBest');
  var statTotalEl = document.getElementById('statTotal');
  var weakNotesListEl = document.getElementById('weakNotesList');
  var resetStatsBtn = document.getElementById('resetStatsBtn');

  var MODE_HINTS = {
    normal: 'Two notes play, always ascending — name the interval between them.',
    pro: 'The scale’s tonic plays first as a reference, then a target note from the scale — name the target note.',
    god: 'Only the target note plays — no reference, any of the 12 notes, no scale to lean on. Name it cold.'
  };

  /* =========================================================================
     Question generation
     ========================================================================= */

  var BASE_LOW = 60, BASE_HIGH = 71; // one octave, C4-B4

  function scalePcSet() {
    var scale = getCurrentScale();
    var set = {};
    scale.intervals.forEach(function (iv) { set[(state.scaleRoot + iv) % 12] = true; });
    return set;
  }

  function randomScaleNoteIn(lowMidi, highMidi) {
    var set = scalePcSet();
    var candidates = [];
    for (var m = lowMidi; m <= highMidi; m++) {
      if (set[((m % 12) + 12) % 12]) candidates.push(m);
    }
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  function generateNormalQuestion() {
    var note1 = randomScaleNoteIn(BASE_LOW, BASE_HIGH);
    var set = scalePcSet();
    var validKs = [];
    for (var k = 0; k <= 12; k++) {
      if (set[((note1 + k) % 12 + 12) % 12]) validKs.push(k);
    }
    var k = validKs[Math.floor(Math.random() * validKs.length)];
    return { note1: note1, note2: note1 + k, hasReference: true, correctKey: String(k) };
  }

  function generateProQuestion() {
    var reference = 60 + state.scaleRoot;
    var target = randomScaleNoteIn(60, 83);
    var pc = ((target % 12) + 12) % 12;
    return { note1: reference, note2: target, hasReference: true, correctKey: String(pc) };
  }

  function generateGodQuestion() {
    var target = 60 + Math.floor(Math.random() * 24); // any of 24 semitones, 2 octaves
    var pc = ((target % 12) + 12) % 12;
    return { note1: null, note2: target, hasReference: false, correctKey: String(pc) };
  }

  function generateQuestion() {
    if (state.mode === 'normal') return generateNormalQuestion();
    if (state.mode === 'pro') return generateProQuestion();
    return generateGodQuestion();
  }

  function answerLabel(question) {
    if (state.mode === 'normal') return INTERVAL_NAMES[parseInt(question.correctKey, 10)];
    return noteNameForAnswer(parseInt(question.correctKey, 10));
  }

  function noteNameForAnswer(pc) {
    if (state.mode === 'god') return MT.noteNameForPc(pc, false);
    var scale = getCurrentScale();
    return MT.noteNameForPc(pc, spellingFlatsFor(pc, scale));
  }

  /* =========================================================================
     Playback
     ========================================================================= */

  function playQuestion(question, onDone) {
    ensureAudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    var t = audioCtx.currentTime + 0.05;
    var noteDur = 0.55, gap = 0.15;
    var totalMs;
    if (question.hasReference) {
      playNote(question.note1, t, noteDur);
      playNote(question.note2, t + noteDur + gap, noteDur);
      totalMs = (noteDur + gap + noteDur + 0.1) * 1000;
    } else {
      playNote(question.note2, t, noteDur);
      totalMs = (noteDur + 0.1) * 1000;
    }
    if (session.playbackTimer) clearTimeout(session.playbackTimer);
    session.playbackTimer = setTimeout(function () { if (onDone) onDone(); }, totalMs);
  }

  /* =========================================================================
     Answer grid
     ========================================================================= */

  function renderAnswerGrid() {
    answerGridEl.innerHTML = '';
    if (state.mode === 'normal') {
      INTERVAL_NAMES.forEach(function (name, k) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'answer-btn';
        btn.textContent = name;
        btn.setAttribute('data-key', String(k));
        btn.addEventListener('click', function () { handleAnswer(String(k), btn); });
        answerGridEl.appendChild(btn);
      });
      return;
    }

    var pcs;
    if (state.mode === 'pro') {
      var scale = getCurrentScale();
      var seen = {};
      pcs = [];
      scale.intervals.forEach(function (iv) {
        var pc = (state.scaleRoot + iv) % 12;
        if (!seen[pc]) { seen[pc] = true; pcs.push(pc); }
      });
    } else {
      pcs = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    }

    pcs.forEach(function (pc) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'answer-btn';
      btn.textContent = noteNameForAnswer(pc);
      btn.setAttribute('data-key', String(pc));
      btn.addEventListener('click', function () { handleAnswer(String(pc), btn); });
      answerGridEl.appendChild(btn);
    });
  }

  function setAnswerButtonsDisabled(disabled) {
    Array.prototype.forEach.call(answerGridEl.querySelectorAll('.answer-btn'), function (b) { b.disabled = disabled; });
  }

  /* =========================================================================
     Piano feedback
     ========================================================================= */

  function renderPianoFeedback(question) {
    if (state.instrument !== 'piano') { pianoFeedbackEl.hidden = true; return; }
    pianoFeedbackEl.hidden = false;
    var lowMidi = Math.min(question.hasReference ? question.note1 : question.note2, question.note2) - 2;
    var highMidi = Math.max(question.hasReference ? question.note1 : question.note2, question.note2) + 2;
    window.PianoKeyboard.render(feedbackPianoSvg, {
      lowMidi: lowMidi, highMidi: highMidi,
      getKeyInfo: function (midi) {
        if (question.hasReference && midi === question.note1 && midi !== question.note2) {
          return { className: 'is-reference', label: 'Ref' };
        }
        if (midi === question.note2) return { className: 'is-target', label: MT.noteNameForPc(((midi % 12) + 12) % 12, false) };
        return null;
      }
    });
  }

  /* =========================================================================
     Scoring / stats
     ========================================================================= */

  function resetStats() {
    stats.total = 0; stats.correct = 0; stats.streak = 0; stats.bestStreak = 0;
    stats.reactionTimes = []; stats.missByKey = {};
    renderStats();
  }

  function renderStats() {
    statAccuracyEl.textContent = stats.total ? Math.round((stats.correct / stats.total) * 100) + '%' : '–';
    var avg = stats.reactionTimes.length
      ? stats.reactionTimes.reduce(function (a, b) { return a + b; }, 0) / stats.reactionTimes.length
      : null;
    statAvgTimeEl.textContent = avg !== null ? (avg / 1000).toFixed(2) + 's' : '–';
    statStreakEl.textContent = String(stats.streak);
    statBestEl.textContent = String(stats.bestStreak);
    statTotalEl.textContent = stats.total + ' answered';

    var entries = Object.keys(stats.missByKey).map(function (k) { return { name: k, count: stats.missByKey[k] }; });
    entries.sort(function (a, b) { return b.count - a.count; });
    weakNotesListEl.textContent = entries.length
      ? entries.slice(0, 3).map(function (e) { return e.name + ' (' + e.count + ')'; }).join('  ·  ')
      : '—';
  }

  function handleAnswer(key, btnEl) {
    if (!session.awaitingAnswer) return;
    session.awaitingAnswer = false;
    setAnswerButtonsDisabled(true);

    var question = session.currentQuestion;
    var correct = key === question.correctKey;
    var reactionMs = performance.now() - session.promptStartTime;
    var correctLabel = answerLabel(question);

    stats.total++;
    if (correct) {
      stats.correct++; stats.streak++; stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
      stats.reactionTimes.push(reactionMs);
    } else {
      stats.streak = 0;
      stats.missByKey[correctLabel] = (stats.missByKey[correctLabel] || 0) + 1;
    }
    renderStats();

    btnEl.classList.add(correct ? 'is-correct' : 'is-wrong');
    if (!correct) {
      var correctBtn = answerGridEl.querySelector('.answer-btn[data-key="' + question.correctKey + '"]');
      if (correctBtn) correctBtn.classList.add('is-reveal');
    }

    promptStatusEl.className = 'prompt-status ' + (correct ? 'is-correct' : 'is-wrong');
    promptStatusEl.textContent = correct
      ? 'Correct! (' + Math.round(reactionMs) + ' ms) — ' + correctLabel
      : 'Not quite — that was ' + correctLabel + '.';

    renderPianoFeedback(question);

    playBtnLabel.textContent = 'Next';
  }

  /* =========================================================================
     Session flow
     ========================================================================= */

  function startQuestion() {
    var question = generateQuestion();
    session.currentQuestion = question;
    session.awaitingAnswer = false;
    pianoFeedbackEl.hidden = true;

    promptStatusEl.className = 'prompt-status';
    promptStatusEl.textContent = 'Listening…';
    playBtnLabel.textContent = 'Replay';
    renderAnswerGrid();
    setAnswerButtonsDisabled(true);

    playQuestion(question, function () {
      session.awaitingAnswer = true;
      session.promptStartTime = performance.now();
      setAnswerButtonsDisabled(false);
      promptStatusEl.textContent = state.mode === 'normal' ? 'What interval was that?' : 'What note was that?';
    });
  }

  function replayCurrent() {
    if (!session.currentQuestion) { startQuestion(); return; }
    setAnswerButtonsDisabled(true);
    session.awaitingAnswer = false;
    promptStatusEl.className = 'prompt-status';
    promptStatusEl.textContent = 'Listening…';
    playQuestion(session.currentQuestion, function () {
      session.awaitingAnswer = true;
      session.promptStartTime = performance.now();
      setAnswerButtonsDisabled(false);
      promptStatusEl.textContent = state.mode === 'normal' ? 'What interval was that?' : 'What note was that?';
    });
  }

  playBtn.addEventListener('click', function () {
    if (!session.currentQuestion || playBtnLabel.textContent === 'Next') startQuestion();
    else replayCurrent();
  });

  resetStatsBtn.addEventListener('click', resetStats);

  /* =========================================================================
     Instrument / tone wiring
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

  function setInstrument(id) {
    var valid = id === 'piano' || !!(MT.INSTRUMENTS && MT.INSTRUMENTS[id]);
    if (!valid) return;
    state.instrument = id;
    Array.prototype.forEach.call(instrumentTabsEl.querySelectorAll('.instrument-tab'), function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-instrument') === id);
    });
  }

  instrumentTabsEl.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('.instrument-tab') : null;
    if (!btn) return;
    setInstrument(btn.getAttribute('data-instrument'));
  });

  wireSegControl(waveControlEl, function (value) { state.waveform = value; });

  /* =========================================================================
     Mode wiring
     ========================================================================= */

  function setMode(mode) {
    state.mode = mode;
    modeHintEl.textContent = MODE_HINTS[mode];
    scaleWidgetEl.classList.toggle('is-disabled', mode === 'god');
    scaleHintEl.textContent = mode === 'god' ? 'God Mode ignores scale — any of the 12 notes can play.' : '';
    resetStats();
    session.currentQuestion = null;
    session.awaitingAnswer = false;
    pianoFeedbackEl.hidden = true;
    playBtnLabel.textContent = 'Play';
    promptStatusEl.className = 'prompt-status';
    promptStatusEl.textContent = 'Press Play to hear the first question.';
    answerGridEl.innerHTML = '';
  }

  wireSegControl(modeControlEl, setMode);

  /* =========================================================================
     Scale wiring
     ========================================================================= */

  function populateScaleSelect() {
    scaleSelectEl.innerHTML = '';
    SCALES.forEach(function (s) {
      var opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.label;
      scaleSelectEl.appendChild(opt);
    });
    scaleSelectEl.value = state.scaleId;
  }

  function setRoot(pc, flats) {
    state.scaleRoot = pc;
    state.scaleRootFlats = flats;
    Array.prototype.forEach.call(rootPickerEl.querySelectorAll('button'), function (b) {
      b.classList.toggle('is-active', parseInt(b.getAttribute('data-pc'), 10) === pc);
    });
  }

  rootPickerEl.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('button') : null;
    if (!btn) return;
    setRoot(parseInt(btn.getAttribute('data-pc'), 10), btn.getAttribute('data-flats') === 'true');
  });

  scaleSelectEl.addEventListener('change', function () { state.scaleId = scaleSelectEl.value; });

  /* =========================================================================
     Keyboard input
     ========================================================================= */

  function isTypingTarget(el) {
    return el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA');
  }

  window.addEventListener('keydown', function (e) {
    if (isTypingTarget(document.activeElement) && e.key !== 'Escape') return;

    if (e.code === 'Space') { e.preventDefault(); playBtn.click(); return; }
    if (e.key === '6') { setInstrument('piano'); return; }
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
  setMode('normal');
  renderStats();
})();
