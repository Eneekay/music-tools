/* Sing-Back Ear Trainer — a separate tool from the Interval Ear Trainer
   (../ear/), built around singing rather than multiple choice. A reference
   pitch plays, the target interval is named (e.g. "Sing a Major 3rd above
   the reference"), and the microphone — via the shared autocorrelation
   pitch detector in ../js/pitch.js, the same one the Tuner uses — scores how
   close the sung pitch lands to the target, in cents, rather than just
   right/wrong.

   The mic-answer plumbing (stable-sample gate + post-prompt cooldown) mirrors
   the Fretboard Trainer's mic mode: a target pc match there becomes a cents
   distance here, and the first stable pitch after the cooldown window is
   scored as the answer rather than waiting for a match. No external
   libraries. */
(function () {
  'use strict';

  var MT = window.MusicTheory;

  var INTERVAL_NAMES = [
    'Unison', 'Minor 2nd', 'Major 2nd', 'Minor 3rd', 'Major 3rd', 'Perfect 4th',
    'Tritone', 'Perfect 5th', 'Minor 6th', 'Major 6th', 'Minor 7th', 'Major 7th', 'Octave'
  ];

  var DIFFICULTY_POOLS = {
    easy: [0, 5, 7, 12],
    medium: [0, 3, 4, 5, 7, 8, 9, 12],
    hard: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
  };

  var DIFFICULTY_HINTS = {
    easy: 'Unison, 4th, 5th and octave — the most consonant intervals to pitch-match.',
    medium: 'Adds 3rds and 6ths.',
    hard: 'All twelve intervals, including 2nds, the tritone and 7ths.'
  };

  var MIC_STABLE_SAMPLES = 3;
  var MIC_COOLDOWN_MS = 250;
  var MIC_DETECTION_INTERVAL_MS = 60;
  var SILENCE_HOLD_MS = 3000;

  /* =========================================================================
     State
     ========================================================================= */

  var state = {
    rootPc: 0,
    rootFlats: false,
    octave: 4,
    difficulty: 'medium',
    direction: 'ascending' // 'ascending' | 'both'
  };

  var session = {
    listening: false,
    awaitingAnswer: false,
    currentPrompt: null, // { referenceMidi, targetMidi, referenceFreq, targetFreq, semitones, dir, intervalName }
    micCooldownUntil: 0,
    promptToken: 0
  };

  var stats = { total: 0, sumAccuracy: 0, streak: 0, bestStreak: 0, byInterval: {} };

  /* =========================================================================
     Audio
     ========================================================================= */

  var audioCtx = null;
  function ensureAudioContext() {
    if (audioCtx) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AC();
  }

  function playTone(freq, onDone) {
    ensureAudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    var t = audioCtx.currentTime + 0.03;
    var dur = 1.1;
    var vol = 0.55;

    var osc = audioCtx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t);

    var gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.03);
    gain.gain.setValueAtTime(vol, t + dur - 0.25);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(t); osc.stop(t + dur + 0.05);

    if (onDone) setTimeout(onDone, (dur + 0.1) * 1000);
  }

  /* =========================================================================
     DOM refs
     ========================================================================= */

  var rootPickerEl = document.getElementById('rootPicker');
  var octaveControlEl = document.getElementById('octaveControl');
  var difficultyControlEl = document.getElementById('difficultyControl');
  var directionControlEl = document.getElementById('directionControl');
  var difficultyHintEl = document.getElementById('difficultyHint');

  var promptStatusEl = document.getElementById('promptStatus');
  var promptTargetEl = document.getElementById('promptTarget');
  var promptTargetIntervalEl = document.getElementById('promptTargetInterval');
  var promptBtn = document.getElementById('promptBtn');
  var promptBtnLabel = document.getElementById('promptBtnLabel');
  var replayBtn = document.getElementById('replayBtn');
  var listenBtn = document.getElementById('listenBtn');
  var listenBtnLabel = document.getElementById('listenBtnLabel');
  var sbStatusEl = document.getElementById('sbStatus');

  var liveReadoutEl = document.getElementById('liveReadout');
  var liveNoteEl = document.getElementById('liveNote');

  var feedbackBlockEl = document.getElementById('feedbackBlock');
  var centsMarkerEl = document.getElementById('centsMarker');
  var feedbackGradeEl = document.getElementById('feedbackGrade');
  var feedbackDetailEl = document.getElementById('feedbackDetail');

  var statAccuracyEl = document.getElementById('statAccuracy');
  var statStreakEl = document.getElementById('statStreak');
  var statBestEl = document.getElementById('statBest');
  var statTotalEl = document.getElementById('statTotal');
  var weakIntervalsListEl = document.getElementById('weakIntervalsList');
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
     Settings wiring
     ========================================================================= */

  function setRoot(pc, flats) {
    state.rootPc = pc;
    state.rootFlats = flats;
    Array.prototype.forEach.call(rootPickerEl.querySelectorAll('button'), function (b) {
      b.classList.toggle('is-active', parseInt(b.getAttribute('data-pc'), 10) === pc);
    });
  }

  rootPickerEl.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('button') : null;
    if (!btn) return;
    setRoot(parseInt(btn.getAttribute('data-pc'), 10), btn.getAttribute('data-flats') === 'true');
  });

  wireSegControl(octaveControlEl, function (value) { state.octave = parseInt(value, 10); });

  function setDifficulty(value) {
    state.difficulty = value;
    difficultyHintEl.textContent = DIFFICULTY_HINTS[value];
  }
  wireSegControl(difficultyControlEl, setDifficulty);

  wireSegControl(directionControlEl, function (value) { state.direction = value; });

  /* =========================================================================
     Prompt generation
     ========================================================================= */

  function noteNameForMidi(midi) {
    var pc = ((midi % 12) + 12) % 12;
    var octave = Math.floor(midi / 12) - 1;
    return MT.noteNameForPc(pc, state.rootFlats) + octave;
  }

  function generatePrompt() {
    var pool = DIFFICULTY_POOLS[state.difficulty];
    var semitones = pool[Math.floor(Math.random() * pool.length)];
    var dir = (state.direction === 'both' && semitones > 0 && Math.random() < 0.5) ? -1 : 1;
    var referenceMidi = (state.octave + 1) * 12 + state.rootPc;
    var targetMidi = referenceMidi + dir * semitones;
    return {
      referenceMidi: referenceMidi,
      targetMidi: targetMidi,
      referenceFreq: MT.midiToFreq(referenceMidi, 440, 0),
      targetFreq: MT.midiToFreq(targetMidi, 440, 0),
      semitones: semitones,
      dir: dir,
      intervalName: INTERVAL_NAMES[semitones]
    };
  }

  /* =========================================================================
     Session flow
     ========================================================================= */

  function startPrompt() {
    var prompt = generatePrompt();
    session.currentPrompt = prompt;
    session.awaitingAnswer = false;
    session.promptToken++;
    var token = session.promptToken;

    hideFeedback();
    promptTargetEl.hidden = true;
    replayBtn.disabled = true;
    promptBtnLabel.textContent = 'New Prompt';
    promptStatusEl.className = 'prompt-status';
    promptStatusEl.textContent = 'Listening to reference…';

    playTone(prompt.referenceFreq, function () {
      if (token !== session.promptToken) return;
      revealTarget(prompt);
    });
  }

  function revealTarget(prompt) {
    promptTargetEl.hidden = false;
    promptTargetIntervalEl.textContent = prompt.semitones === 0
      ? 'Unison — match the reference exactly'
      : prompt.intervalName + (prompt.dir < 0 ? ' below' : ' above') + ' the reference';
    promptStatusEl.textContent = session.listening
      ? 'Sing it back whenever you’re ready.'
      : 'Sing it back — tap Start Listening so the mic can hear you.';
    replayBtn.disabled = false;
    session.awaitingAnswer = true;
    session.micCooldownUntil = performance.now() + MIC_COOLDOWN_MS;
    micLastMidi = null;
    micStableCount = 0;
  }

  function replayReference() {
    if (!session.currentPrompt) return;
    session.awaitingAnswer = false;
    playTone(session.currentPrompt.referenceFreq, function () {
      revealTarget(session.currentPrompt);
    });
  }

  promptBtn.addEventListener('click', startPrompt);
  replayBtn.addEventListener('click', replayReference);

  /* =========================================================================
     Scoring
     ========================================================================= */

  function gradeForCents(absCents) {
    if (absCents <= 10) return { label: 'Spot on!', cls: 'is-great' };
    if (absCents <= 25) return { label: 'Great', cls: 'is-great' };
    if (absCents <= 50) return { label: 'Good', cls: 'is-good' };
    if (absCents <= 100) return { label: 'A bit off', cls: 'is-off' };
    return { label: 'Off pitch', cls: 'is-off' };
  }

  function hideFeedback() {
    feedbackBlockEl.hidden = true;
    liveReadoutEl.hidden = true;
  }

  function showFeedback(sungFreq, cents) {
    feedbackBlockEl.hidden = false;
    var clamped = MT.clamp(cents, -100, 100);
    centsMarkerEl.style.left = (50 + clamped / 2) + '%';

    var absCents = Math.abs(cents);
    var grade = gradeForCents(absCents);
    feedbackGradeEl.textContent = grade.label;
    feedbackGradeEl.className = 'feedback-grade ' + grade.cls;

    var prompt = session.currentPrompt;
    var direction = cents > 0 ? 'sharp' : cents < 0 ? 'flat' : 'exact';
    var centsText = absCents < 1 ? 'dead on' : Math.round(absCents) + '¢ ' + direction;
    feedbackDetailEl.textContent = 'Target was ' + noteNameForMidi(prompt.targetMidi) + ' (' + prompt.targetFreq.toFixed(1) + ' Hz) — you sang ' +
      sungFreq.toFixed(1) + ' Hz, ' + centsText + '.';
  }

  function recordAttempt(cents) {
    var accuracy = MT.clamp(Math.round(100 - Math.abs(cents)), 0, 100);
    stats.total++;
    stats.sumAccuracy += accuracy;
    if (accuracy >= 80) { stats.streak++; stats.bestStreak = Math.max(stats.bestStreak, stats.streak); }
    else { stats.streak = 0; }

    var label = session.currentPrompt.intervalName;
    var entry = stats.byInterval[label] || (stats.byInterval[label] = { sum: 0, count: 0 });
    entry.sum += accuracy;
    entry.count++;

    renderStats();
    return accuracy;
  }

  function evaluateAnswer(sungFreq) {
    session.awaitingAnswer = false;
    var prompt = session.currentPrompt;
    var cents = 1200 * Math.log2(sungFreq / prompt.targetFreq);
    recordAttempt(cents);
    showFeedback(sungFreq, cents);
    promptBtnLabel.textContent = 'Next';
    promptStatusEl.className = 'prompt-status is-correct';
    promptStatusEl.textContent = 'Nice — here’s how you did.';
  }

  /* =========================================================================
     Stats rendering
     ========================================================================= */

  function resetStats() {
    stats.total = 0; stats.sumAccuracy = 0; stats.streak = 0; stats.bestStreak = 0; stats.byInterval = {};
    renderStats();
  }

  function renderStats() {
    statAccuracyEl.textContent = stats.total ? Math.round(stats.sumAccuracy / stats.total) + '%' : '–';
    statStreakEl.textContent = String(stats.streak);
    statBestEl.textContent = String(stats.bestStreak);
    statTotalEl.textContent = String(stats.total);

    var entries = Object.keys(stats.byInterval).map(function (label) {
      var e = stats.byInterval[label];
      return { label: label, avg: e.sum / e.count };
    });
    entries.sort(function (a, b) { return a.avg - b.avg; });
    weakIntervalsListEl.textContent = entries.length
      ? entries.slice(0, 3).map(function (e) { return e.label + ' (' + Math.round(e.avg) + '%)'; }).join('  ·  ')
      : '—';
  }

  resetStatsBtn.addEventListener('click', resetStats);

  /* =========================================================================
     Pitch detection (autocorrelation) — shared implementation in ../js/pitch.js.
     Two layers: a continuous live readout (with a silence hold, matching the
     Tuner), and a stable-sample "lock in the answer" gate that only runs
     while a prompt is awaiting an answer, matching the Fretboard Trainer's
     mic-answer mode.
     ========================================================================= */

  var micStream = null;
  var micSource = null;
  var analyser = null;
  var pitchBuffer = null;
  var detectionTimer = null;
  var micLastMidi = null;
  var micStableCount = 0;
  var lastLiveMatch = null;
  var lastLiveMatchTime = 0;

  function setListenButtonState(listening) {
    listenBtn.classList.toggle('is-listening', listening);
    listenBtnLabel.textContent = listening ? 'Stop Listening' : 'Start Listening';
  }

  function showSbStatus(text, isError) {
    sbStatusEl.textContent = text;
    sbStatusEl.classList.toggle('is-error', !!isError);
  }

  function updateLiveReadout(name) {
    liveReadoutEl.hidden = false;
    liveNoteEl.textContent = name;
  }

  function runDetection() {
    if (!analyser) return;
    analyser.getFloatTimeDomainData(pitchBuffer);
    var freq = window.PitchDetect.autoCorrelate(pitchBuffer, audioCtx.sampleRate);

    if (freq === -1) {
      micLastMidi = null;
      micStableCount = 0;
      if (lastLiveMatch && performance.now() - lastLiveMatchTime < SILENCE_HOLD_MS) return;
      lastLiveMatch = null;
      liveReadoutEl.hidden = true;
      return;
    }

    var nearest = MT.freqToNearestChromatic(freq, 440, 0);
    lastLiveMatch = nearest;
    lastLiveMatchTime = performance.now();
    updateLiveReadout(nearest.name + nearest.octave);

    if (!session.awaitingAnswer) return;

    var midi = nearest.midi;
    if (midi === micLastMidi) micStableCount++;
    else { micLastMidi = midi; micStableCount = 1; }
    if (micStableCount < MIC_STABLE_SAMPLES) return;
    if (performance.now() < session.micCooldownUntil) return;

    micStableCount = 0;
    evaluateAnswer(freq);
  }

  function startListening() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showSbStatus('Microphone input is not supported in this browser.', true);
      return;
    }
    ensureAudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
      .then(function (stream) {
        micStream = stream;
        micSource = audioCtx.createMediaStreamSource(stream);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 2048;
        micSource.connect(analyser);
        pitchBuffer = new Float32Array(analyser.fftSize);
        micLastMidi = null;
        micStableCount = 0;

        session.listening = true;
        setListenButtonState(true);
        showSbStatus('Listening — sing the target interval when it’s revealed.', false);

        detectionTimer = setInterval(runDetection, MIC_DETECTION_INTERVAL_MS);
      })
      .catch(function () {
        showSbStatus('Microphone access was denied or unavailable.', true);
      });
  }

  function stopListening() {
    session.listening = false;
    setListenButtonState(false);
    if (detectionTimer) { clearInterval(detectionTimer); detectionTimer = null; }
    if (micSource) { micSource.disconnect(); micSource = null; }
    if (micStream) { micStream.getTracks().forEach(function (t) { t.stop(); }); micStream = null; }
    analyser = null;
    micLastMidi = null;
    micStableCount = 0;
    lastLiveMatch = null;
    liveReadoutEl.hidden = true;
    showSbStatus('Mic is off — tap Start Listening to sing your answers.', false);
  }

  listenBtn.addEventListener('click', function () {
    if (session.listening) stopListening(); else startListening();
  });

  /* =========================================================================
     Keyboard input
     ========================================================================= */

  function isTypingTarget(el) {
    return el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA');
  }

  window.addEventListener('keydown', function (e) {
    if (isTypingTarget(document.activeElement) && e.key !== 'Escape') return;

    if (e.code === 'Space') { e.preventDefault(); promptBtn.click(); return; }
    if (e.key.toLowerCase() === 'l') { listenBtn.click(); return; }
    if (/^[1-3]$/.test(e.key)) {
      var order = ['easy', 'medium', 'hard'];
      var value = order[parseInt(e.key, 10) - 1];
      setDifficulty(value);
      Array.prototype.forEach.call(difficultyControlEl.querySelectorAll('button'), function (b) {
        b.classList.toggle('is-active', b.getAttribute('data-value') === value);
      });
      return;
    }
  });

  /* =========================================================================
     Init
     ========================================================================= */

  setDifficulty('medium');
  renderStats();
})();
