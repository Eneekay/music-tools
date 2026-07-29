(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var MT = window.MusicTheory;

  var ALL_PCS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  var NATURAL_PCS = [0, 2, 4, 5, 7, 9, 11];

  // Scale definitions for "Scale" note-pool mode, mirroring the Scale
  // Finder's data and per-root flats/sharps spelling conventions (kept as
  // a self-contained copy here, matching this codebase's per-tool
  // convention of not sharing UI-adjacent state across tools).
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

  var FEEDBACK_DELAY_MS = 700;
  var PROMPT_TIMEOUT_MS = 8000;

  var MIC_STABLE_SAMPLES = 3;
  var MIC_COOLDOWN_MS = 250;
  var MIC_DETECTION_INTERVAL_MS = 60;

  var METRO_LOOKAHEAD_MS = 25;
  var METRO_SCHEDULE_AHEAD = 0.12;
  var METRO_BEATS_PER_BAR = 4;

  /* =========================================================================
     State
     ========================================================================= */

  var state = {
    instrument: 'guitar',
    tuningIndex: 0,
    fretCount: 15,
    leftHanded: false,
    answerMode: 'tap',
    notePool: 'all',
    scaleRoot: 0,
    scaleRootFlats: false,
    scaleId: 'major',
    metronomeSync: false,
    advanceBeats: 2
  };

  var session = {
    running: false,
    currentPromptPc: null,
    currentPromptName: '',
    promptStartTime: 0,
    awaitingAnswer: false,
    lastPc: null,
    beatsSinceAdvance: 0,
    micCooldownUntil: 0,
    promptTimeoutTimer: null,
    nextPromptTimer: null,
    autoStartedMetronome: false
  };

  var stats = {
    total: 0,
    correct: 0,
    streak: 0,
    bestStreak: 0,
    reactionTimes: [],
    missByNote: {}
  };

  function getCurrentTuning() {
    return MT.INSTRUMENTS[state.instrument].tunings[state.tuningIndex];
  }

  /* =========================================================================
     Audio: shared context, mini metronome click
     ========================================================================= */

  var audioCtx = null;
  var masterGain = null;

  function ensureAudioContext() {
    if (audioCtx) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AC();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.7;
    masterGain.connect(audioCtx.destination);
  }

  function playMetroClick(time, accent) {
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(accent ? 2200 : 1700, time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(accent ? 0.9 : 0.65, time + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.035);
    osc.connect(gain); gain.connect(masterGain);
    osc.start(time); osc.stop(time + 0.05);
  }

  /* =========================================================================
     DOM refs
     ========================================================================= */

  var trainerWidgetEl = document.querySelector('.trainer-widget');

  var instrumentTabsEl = document.getElementById('instrumentTabs');
  var tuningSelect = document.getElementById('tuningSelect');
  var fretCountControl = document.getElementById('fretCountControl');
  var answerModeControlEl = document.getElementById('answerModeControl');
  var leftHandedToggle = document.getElementById('leftHandedToggle');

  var promptNoteEl = document.getElementById('promptNote');
  var promptStatusEl = document.getElementById('promptStatus');
  var sessionBtn = document.getElementById('sessionBtn');
  var sessionBtnLabel = document.getElementById('sessionBtnLabel');
  var micStatusEl = document.getElementById('micStatus');
  var fretboardSvg = document.getElementById('fretboardSvg');

  var metroPlayBtn = document.getElementById('metroPlayBtn');
  var metroBpmInput = document.getElementById('metroBpmInput');
  var metroBpmSlider = document.getElementById('metroBpmSlider');
  var metroBpmDown = document.getElementById('metroBpmDown');
  var metroBpmUp = document.getElementById('metroBpmUp');
  var metroBeatDotsEl = document.getElementById('metroBeatDots');

  var notePoolControl = document.getElementById('notePoolControl');
  var scalePickerGroupEl = document.getElementById('scalePickerGroup');
  var trainerRootPicker = document.getElementById('trainerRootPicker');
  var trainerScaleSelect = document.getElementById('trainerScaleSelect');
  var metronomeSyncToggle = document.getElementById('metronomeSyncToggle');
  var advanceBeatsControl = document.getElementById('advanceBeatsControl');

  var statAccuracyEl = document.getElementById('statAccuracy');
  var statAvgTimeEl = document.getElementById('statAvgTime');
  var statStreakEl = document.getElementById('statStreak');
  var statBestEl = document.getElementById('statBest');
  var statTotalEl = document.getElementById('statTotal');
  var weakNotesListEl = document.getElementById('weakNotesList');
  var resetStatsBtn = document.getElementById('resetStatsBtn');

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
     Fretboard rendering — blank tap targets across the whole selected range.
     Note markers sit in the space between fret wires (not on the wire
     itself), matching real fretboard convention and the fix applied to the
     Scale Finder's diagram.
     ========================================================================= */

  var targetDots = [];

  function renderFretboard() {
    var tuning = getCurrentTuning();
    var openMidis = tuning.notes.map(function (n) { return MT.parseNoteName(n); });
    var numStrings = openMidis.length;

    var FRET_W = 50, STR_H = 42, PAD_L = 40, PAD_R = 34, PAD_TOP = 20, PAD_BOTTOM = 42;
    var fc = state.fretCount;
    var width = PAD_L + fc * FRET_W + PAD_R;
    var height = PAD_TOP + (numStrings - 1) * STR_H + PAD_BOTTOM;

    function xFret(f) {
      return state.leftHanded ? (PAD_L + (fc - f) * FRET_W) : (PAD_L + f * FRET_W);
    }
    function xForFretSpace(f) {
      if (f === 0) return xFret(0);
      return (xFret(f - 1) + xFret(f)) / 2;
    }
    function yString(i) { return PAD_TOP + i * STR_H; }

    fretboardSvg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    fretboardSvg.innerHTML = '';
    targetDots = [];

    var xMin = Math.min(xFret(0), xFret(fc));
    var xMax = Math.max(xFret(0), xFret(fc));

    for (var i = 0; i < numStrings; i++) {
      var line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('class', 'fret-string');
      line.setAttribute('x1', xMin); line.setAttribute('y1', yString(i));
      line.setAttribute('x2', xMax); line.setAttribute('y2', yString(i));
      fretboardSvg.appendChild(line);

      // Open-string note, labeled at the nut end (left in normal
      // orientation, right when left-handed, since xFret(0) tracks the nut).
      var openPc = ((openMidis[i] % 12) + 12) % 12;
      var strLabel = document.createElementNS(SVG_NS, 'text');
      strLabel.setAttribute('class', 'string-label');
      strLabel.setAttribute('x', String(xFret(0) + (state.leftHanded ? 12 : -12)));
      strLabel.setAttribute('y', String(yString(i)));
      strLabel.setAttribute('text-anchor', state.leftHanded ? 'start' : 'end');
      strLabel.textContent = promptNameForPc(openPc);
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
        var cx2 = xForFretSpace(fr), cy2 = yString(s);

        var circle = document.createElementNS(SVG_NS, 'circle');
        circle.setAttribute('class', 'target-dot');
        circle.setAttribute('cx', cx2); circle.setAttribute('cy', cy2); circle.setAttribute('r', 11);

        (function (pcVal, midiVal, dotEl) {
          dotEl.addEventListener('click', function () { handleTapAnswer(pcVal, dotEl); });
          targetDots.push({ el: dotEl, pc: pcVal, midi: midiVal });
        })(pc, midi, circle);

        fretboardSvg.appendChild(circle);
      }
    }
  }

  function clearDotFeedback() {
    targetDots.forEach(function (d) {
      d.el.classList.remove('is-correct', 'is-wrong', 'is-reveal');
    });
  }

  function findDotForMidi(midi) {
    for (var i = 0; i < targetDots.length; i++) {
      if (targetDots[i].midi === midi) return targetDots[i].el;
    }
    return null;
  }

  /* =========================================================================
     Session / prompt / scoring
     ========================================================================= */

  function resetStats() {
    stats.total = 0;
    stats.correct = 0;
    stats.streak = 0;
    stats.bestStreak = 0;
    stats.reactionTimes = [];
    stats.missByNote = {};
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

    var entries = Object.keys(stats.missByNote).map(function (k) { return { name: k, count: stats.missByNote[k] }; });
    entries.sort(function (a, b) { return b.count - a.count; });
    weakNotesListEl.textContent = entries.length
      ? entries.slice(0, 3).map(function (e) { return e.name + ' (' + e.count + ')'; }).join('  ·  ')
      : '—';
  }

  function getCurrentScale() {
    for (var i = 0; i < SCALES.length; i++) if (SCALES[i].id === state.scaleId) return SCALES[i];
    return SCALES[0];
  }

  function effectiveFlatsForScale(scale) {
    if (scale.id === 'minorPent' || scale.id === 'blues') return true;
    return scale.quality === 'minor' ? MINOR_FLATS[state.scaleRoot] : state.scaleRootFlats;
  }

  function scaleNotePool() {
    var scale = getCurrentScale();
    return scale.intervals.map(function (iv) { return (state.scaleRoot + iv) % 12; });
  }

  // Sharps by default (chromatic/naturals training); in Scale mode, spell
  // each note the way the Scale Finder would - the root keeps whatever
  // spelling was picked for it, every other tone follows the scale's own
  // major/minor-key flats convention.
  function promptNameForPc(pc) {
    if (state.notePool === 'scale') {
      var scale = getCurrentScale();
      var flats = pc === state.scaleRoot ? state.scaleRootFlats : effectiveFlatsForScale(scale);
      return MT.noteNameForPc(pc, flats);
    }
    return MT.noteNameForPc(pc, false);
  }

  function currentNotePool() {
    if (state.notePool === 'scale') return scaleNotePool();
    if (state.notePool === 'natural') return NATURAL_PCS;
    return ALL_PCS;
  }

  function nextPrompt() {
    if (!session.running) return;
    clearDotFeedback();
    promptNoteEl.classList.remove('is-correct', 'is-wrong');

    var pool = currentNotePool();
    var pc;
    do { pc = pool[Math.floor(Math.random() * pool.length)]; } while (pc === session.lastPc && pool.length > 1);
    session.lastPc = pc;
    session.currentPromptPc = pc;
    session.currentPromptName = promptNameForPc(pc);
    promptNoteEl.textContent = session.currentPromptName;
    session.promptStartTime = performance.now();
    session.awaitingAnswer = true;
    session.beatsSinceAdvance = 0;
    session.micCooldownUntil = performance.now() + MIC_COOLDOWN_MS;

    promptStatusEl.textContent = state.answerMode === 'mic'
      ? 'Play ' + session.currentPromptName + ' on your instrument.'
      : 'Tap ' + session.currentPromptName + ' anywhere on the fretboard.';

    if (!state.metronomeSync) {
      session.promptTimeoutTimer = setTimeout(function () {
        evaluateAnswer(false, null, true);
      }, PROMPT_TIMEOUT_MS);
    }
  }

  function evaluateAnswer(correct, sourceDotEl, isTimeout) {
    if (!session.awaitingAnswer) return;
    session.awaitingAnswer = false;
    if (session.promptTimeoutTimer) { clearTimeout(session.promptTimeoutTimer); session.promptTimeoutTimer = null; }

    var reactionMs = performance.now() - session.promptStartTime;
    var promptName = session.currentPromptName;
    var promptPc = session.currentPromptPc;

    stats.total++;
    if (correct) {
      stats.correct++;
      stats.streak++;
      stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
      stats.reactionTimes.push(reactionMs);
    } else {
      stats.streak = 0;
      stats.missByNote[promptName] = (stats.missByNote[promptName] || 0) + 1;
    }
    renderStats();

    promptNoteEl.classList.remove('is-correct', 'is-wrong');
    void promptNoteEl.offsetWidth;
    promptNoteEl.classList.add(correct ? 'is-correct' : 'is-wrong');

    if (sourceDotEl) sourceDotEl.classList.add(correct ? 'is-correct' : 'is-wrong');
    targetDots.forEach(function (d) {
      if (d.pc === promptPc && d.el !== sourceDotEl) d.el.classList.add('is-reveal');
    });

    promptStatusEl.textContent = correct
      ? 'Correct! (' + Math.round(reactionMs) + ' ms)'
      : (isTimeout ? 'Too slow — that was ' + promptName + '.' : 'Not quite — that was ' + promptName + '.');

    if (!state.metronomeSync) {
      session.nextPromptTimer = setTimeout(nextPrompt, FEEDBACK_DELAY_MS);
    }
  }

  function handleTapAnswer(pc, dotEl) {
    if (state.answerMode !== 'tap') return;
    if (!session.running || !session.awaitingAnswer) return;
    evaluateAnswer(pc === session.currentPromptPc, dotEl);
  }

  function startSession() {
    if (session.running) return;
    resetStats();
    session.running = true;
    session.lastPc = null;
    sessionBtn.classList.add('is-running');
    sessionBtnLabel.textContent = 'Stop Session';

    if (state.answerMode === 'mic') {
      startMicListening();
    } else {
      setMicStatus('', '');
    }

    if (state.metronomeSync) {
      if (!metro.running) { startMetro(); session.autoStartedMetronome = true; }
      else { session.autoStartedMetronome = false; }
    }

    nextPrompt();
  }

  function stopSession() {
    if (!session.running) return;
    session.running = false;
    session.awaitingAnswer = false;
    if (session.promptTimeoutTimer) { clearTimeout(session.promptTimeoutTimer); session.promptTimeoutTimer = null; }
    if (session.nextPromptTimer) { clearTimeout(session.nextPromptTimer); session.nextPromptTimer = null; }
    clearDotFeedback();
    promptNoteEl.textContent = '–';
    promptNoteEl.classList.remove('is-correct', 'is-wrong');
    promptStatusEl.textContent = 'Press Start to begin a session.';
    sessionBtn.classList.remove('is-running');
    sessionBtnLabel.textContent = 'Start Session';

    if (state.answerMode === 'mic') stopMicListening();

    if (session.autoStartedMetronome && metro.running) stopMetro();
    session.autoStartedMetronome = false;
  }

  sessionBtn.addEventListener('click', function () {
    if (session.running) stopSession(); else startSession();
  });

  resetStatsBtn.addEventListener('click', resetStats);

  /* =========================================================================
     Mic answer mode — reuses the shared autocorrelation pitch detector.
     A short cooldown after each new prompt avoids the previous note's
     ring-out triggering a false hit; a stable-sample count avoids acting on
     a single noisy analysis frame.
     ========================================================================= */

  var micStream = null;
  var micSource = null;
  var analyser = null;
  var pitchBuffer = null;
  var micDetectionTimer = null;
  var micLastPc = null;
  var micStableCount = 0;

  function setMicStatus(text, cls) {
    micStatusEl.textContent = text;
    micStatusEl.className = 'mic-status' + (cls ? ' ' + cls : '');
  }

  function startMicListening() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMicStatus('Microphone input is not supported in this browser.', 'is-error');
      stopSession();
      return;
    }
    ensureAudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
      .then(function (stream) {
        if (!session.running) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
        micStream = stream;
        micSource = audioCtx.createMediaStreamSource(stream);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 2048;
        micSource.connect(analyser);
        pitchBuffer = new Float32Array(analyser.fftSize);
        micLastPc = null;
        micStableCount = 0;
        setMicStatus('Listening… play the prompted note.', 'is-live');
        micDetectionTimer = setInterval(runMicDetection, MIC_DETECTION_INTERVAL_MS);
      })
      .catch(function () {
        setMicStatus('Microphone access was denied or unavailable.', 'is-error');
        stopSession();
      });
  }

  function stopMicListening() {
    if (micDetectionTimer) { clearInterval(micDetectionTimer); micDetectionTimer = null; }
    if (micSource) { micSource.disconnect(); micSource = null; }
    if (micStream) { micStream.getTracks().forEach(function (t) { t.stop(); }); micStream = null; }
    analyser = null;
    micLastPc = null;
    micStableCount = 0;
  }

  function runMicDetection() {
    if (!analyser || !session.running || !session.awaitingAnswer) return;
    analyser.getFloatTimeDomainData(pitchBuffer);
    var freq = window.PitchDetect.autoCorrelate(pitchBuffer, audioCtx.sampleRate);
    if (freq === -1) { micLastPc = null; micStableCount = 0; return; }

    var midi = Math.round(69 + 12 * Math.log2(freq / 440));
    var pc = ((midi % 12) + 12) % 12;

    if (pc === micLastPc) micStableCount++; else { micLastPc = pc; micStableCount = 1; }
    if (micStableCount < MIC_STABLE_SAMPLES) return;
    if (performance.now() < session.micCooldownUntil) return;

    if (pc === session.currentPromptPc) {
      micStableCount = 0;
      evaluateAnswer(true, findDotForMidi(midi));
    } else {
      setMicStatus('Heard ' + MT.noteNameForPc(pc, false) + ' — keep trying…', 'is-live');
    }
  }

  /* =========================================================================
     Embedded mini metronome — fixed 4/4, play/stop, tempo, beat dots. When
     "Sync to metronome" is on in Session Settings, each beat boundary
     (every N beats) forces the session to advance, scoring an unanswered
     prompt as a miss.
     ========================================================================= */

  var metro = {
    bpm: 90,
    running: false,
    schedulerTimer: null,
    nextBeatTime: 0,
    visualQueue: [],
    beatIndex: 0
  };

  function renderMetroBeatDots(activeIndex) {
    metroBeatDotsEl.innerHTML = '';
    for (var i = 0; i < METRO_BEATS_PER_BAR; i++) {
      var dot = document.createElement('span');
      dot.className = 'mini-beat-dot' + (i === 0 ? ' is-accent-slot' : '');
      if (typeof activeIndex === 'number' && i === activeIndex) dot.classList.add('is-active');
      metroBeatDotsEl.appendChild(dot);
    }
  }

  function onMetroBeat() {
    if (!state.metronomeSync || !session.running) return;
    session.beatsSinceAdvance++;
    if (session.beatsSinceAdvance >= state.advanceBeats) {
      session.beatsSinceAdvance = 0;
      if (session.awaitingAnswer) evaluateAnswer(false, null, true);
      nextPrompt();
    }
  }

  function metroScheduler() {
    while (metro.nextBeatTime < audioCtx.currentTime + METRO_SCHEDULE_AHEAD) {
      var idx = metro.beatIndex % METRO_BEATS_PER_BAR;
      playMetroClick(metro.nextBeatTime, idx === 0);
      metro.visualQueue.push({ time: metro.nextBeatTime, beatIndex: idx });
      metro.beatIndex++;
      metro.nextBeatTime += 60 / metro.bpm;
    }
  }

  function metroVisualFrame() {
    if (!metro.running) return;
    var now = audioCtx.currentTime;
    while (metro.visualQueue.length && metro.visualQueue[0].time <= now) {
      var ev = metro.visualQueue.shift();
      renderMetroBeatDots(ev.beatIndex);
      onMetroBeat();
    }
    requestAnimationFrame(metroVisualFrame);
  }

  function startMetro() {
    ensureAudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    metro.running = true;
    metro.beatIndex = 0;
    metro.visualQueue = [];
    metro.nextBeatTime = audioCtx.currentTime + 0.08;
    metroPlayBtn.classList.add('is-playing');
    metroPlayBtn.setAttribute('aria-pressed', 'true');
    metro.schedulerTimer = setInterval(metroScheduler, METRO_LOOKAHEAD_MS);
    requestAnimationFrame(metroVisualFrame);
  }

  function stopMetro() {
    metro.running = false;
    if (metro.schedulerTimer) { clearInterval(metro.schedulerTimer); metro.schedulerTimer = null; }
    metroPlayBtn.classList.remove('is-playing');
    metroPlayBtn.setAttribute('aria-pressed', 'false');
    renderMetroBeatDots();
  }

  metroPlayBtn.addEventListener('click', function () {
    if (metro.running) stopMetro(); else startMetro();
  });

  function clampMetroBpm(v) {
    v = Math.round(v);
    if (isNaN(v)) v = metro.bpm;
    return Math.max(30, Math.min(260, v));
  }

  function setMetroBpm(v) {
    metro.bpm = clampMetroBpm(v);
    metroBpmInput.value = metro.bpm;
    metroBpmSlider.value = metro.bpm;
  }

  metroBpmInput.addEventListener('change', function () { setMetroBpm(parseInt(metroBpmInput.value, 10)); });
  metroBpmSlider.addEventListener('input', function () { setMetroBpm(parseInt(metroBpmSlider.value, 10)); });
  metroBpmDown.addEventListener('click', function () { setMetroBpm(metro.bpm - 1); });
  metroBpmUp.addEventListener('click', function () { setMetroBpm(metro.bpm + 1); });

  /* =========================================================================
     Instrument / tuning / fretboard wiring
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
    renderFretboard();
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

  wireSegControl(fretCountControl, function (value) {
    state.fretCount = parseInt(value, 10);
    renderFretboard();
  });

  leftHandedToggle.addEventListener('change', function () {
    state.leftHanded = leftHandedToggle.checked;
    renderFretboard();
  });

  function setAnswerMode(mode) {
    if (session.running) stopSession();
    state.answerMode = mode;
    trainerWidgetEl.classList.toggle('is-mic-mode', mode === 'mic');
    setMicStatus('', '');
    promptStatusEl.textContent = mode === 'mic'
      ? 'Press Start, then play the prompted note on your instrument.'
      : 'Press Start, then tap the prompted note on the fretboard.';
  }

  wireSegControl(answerModeControlEl, function (value) { setAnswerMode(value); });
  wireSegControl(notePoolControl, function (value) {
    state.notePool = value;
    scalePickerGroupEl.classList.toggle('is-visible', value === 'scale');
  });
  wireSegControl(advanceBeatsControl, function (value) { state.advanceBeats = parseInt(value, 10); });

  function populateScaleSelect() {
    trainerScaleSelect.innerHTML = '';
    SCALES.forEach(function (s) {
      var opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.label;
      trainerScaleSelect.appendChild(opt);
    });
    trainerScaleSelect.value = state.scaleId;
  }

  function setScaleRoot(pc, flats) {
    state.scaleRoot = pc;
    state.scaleRootFlats = flats;
    Array.prototype.forEach.call(trainerRootPicker.querySelectorAll('button'), function (b) {
      b.classList.toggle('is-active', parseInt(b.getAttribute('data-pc'), 10) === pc);
    });
  }

  trainerRootPicker.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('button') : null;
    if (!btn) return;
    setScaleRoot(parseInt(btn.getAttribute('data-pc'), 10), btn.getAttribute('data-flats') === 'true');
  });

  trainerScaleSelect.addEventListener('change', function () {
    state.scaleId = trainerScaleSelect.value;
  });

  metronomeSyncToggle.addEventListener('change', function () {
    state.metronomeSync = metronomeSyncToggle.checked;
  });

  /* =========================================================================
     Keyboard input
     ========================================================================= */

  function isTypingTarget(el) {
    return el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA');
  }

  window.addEventListener('keydown', function (e) {
    if (isTypingTarget(document.activeElement) && e.key !== 'Escape') return;

    if (e.code === 'Space') {
      e.preventDefault();
      if (session.running) stopSession(); else startSession();
      return;
    }
    if (e.key.toLowerCase() === 'm') {
      var next = state.answerMode === 'tap' ? 'mic' : 'tap';
      var btn = answerModeControlEl.querySelector('button[data-value="' + next + '"]');
      if (btn) btn.click();
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

  populateTuningSelect();
  populateScaleSelect();
  renderFretboard();
  renderMetroBeatDots();
  renderStats();
  setMetroBpm(90);
})();
