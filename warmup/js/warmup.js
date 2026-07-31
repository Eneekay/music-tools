/* Warm-Up Routine Generator — sequences a handful of classic vocal warm-up
   shapes (siren, 5-note scale, arpeggio, octave bounce) on a click track,
   climbing chromatically or by whole step through as many reps as you like,
   transposed to start wherever you pick. The Voice Type quick-picks reuse
   the same range table the Vocal Range Finder classifies against
   (../js/voice-ranges.js) purely to "signpost" a sensible starting key for
   people who don't already know their own range in MIDI terms - picking one
   just fills in the root/octave picker below it, nothing more.

   The whole routine is finite and fully known before playback starts (every
   exercise, every rep), so unlike the Metronome/Drum Machine/Chord
   Progression tools - which loop indefinitely and so need a rolling
   lookahead scheduler - this schedules every oscillator for the entire
   routine up front against absolute AudioContext time (which Web Audio
   handles precisely on its own, arbitrarily far ahead) and only uses a
   requestAnimationFrame loop to keep the on-screen "what's playing now"
   status in sync with actual playback, via the same visualQueue idiom the
   Metronome uses for its needle. No external libraries. */
(function () {
  'use strict';

  var MT = window.MusicTheory;

  /* =========================================================================
     Exercise patterns (semitone offsets from that rep's root)
     ========================================================================= */

  var EXERCISES = [
    { id: 'siren', label: 'Siren', desc: 'Smooth glide up an octave and back — loosens the voice before anything else.', kind: 'glide', pattern: [0, 12, 0], totalBeats: 4 },
    { id: 'fivenote', label: '5-Note Scale', desc: 'Sing 1-2-3-4-5-4-3-2-1 on any comfortable syllable.', kind: 'notes', pattern: [0, 2, 4, 5, 7, 5, 4, 2, 0] },
    { id: 'arpeggio', label: 'Arpeggio', desc: 'Sing 1-3-5-8-5-3-1 — builds range and resonance.', kind: 'notes', pattern: [0, 4, 7, 12, 7, 4, 0] },
    { id: 'octaveBounce', label: 'Octave Bounce', desc: 'Quick octave jumps — a bouncier, bridge-testing glide.', kind: 'glide', pattern: [0, 12, 0], totalBeats: 2 }
  ];

  function midiName(midi) {
    var pc = ((midi % 12) + 12) % 12;
    var octave = Math.floor(midi / 12) - 1;
    return MT.noteNameForPc(pc, false) + octave;
  }

  /* =========================================================================
     State
     ========================================================================= */

  var state = {
    rootPc: 0,
    rootFlats: false,
    octave: 3,
    bpm: 84,
    reps: 5,
    stepSemitones: 1,
    clickEnabled: true,
    enabledExercises: { siren: true, fivenote: true, arpeggio: true, octaveBounce: true }
  };

  function startMidi() { return (state.octave + 1) * 12 + state.rootPc; }
  function startFreq() { return MT.midiToFreq(startMidi(), 440, 0); }

  /* =========================================================================
     Audio
     ========================================================================= */

  var audioCtx = null;
  function ensureAudioContext() {
    if (audioCtx) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AC();
  }

  function playNoteNode(ctx, dest, freq, time, duration) {
    var osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);
    var gain = ctx.createGain();
    var vol = 0.5;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(vol, time + 0.03);
    gain.gain.setValueAtTime(vol, time + Math.max(duration - 0.08, 0.03));
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.connect(gain); gain.connect(dest);
    osc.start(time); osc.stop(time + duration + 0.05);
    return osc;
  }

  function playGlideNode(ctx, dest, points) {
    var osc = ctx.createOscillator();
    osc.type = 'sine';
    var gain = ctx.createGain();
    var vol = 0.5;
    var t0 = points[0].time;
    var tEnd = points[points.length - 1].time;

    osc.frequency.setValueAtTime(points[0].freq, t0);
    for (var i = 1; i < points.length; i++) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(points[i].freq, 1), points[i].time);
    }

    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.08);
    gain.gain.setValueAtTime(vol, Math.max(tEnd - 0.12, t0 + 0.09));
    gain.gain.exponentialRampToValueAtTime(0.0001, tEnd);

    osc.connect(gain); gain.connect(dest);
    osc.start(t0); osc.stop(tEnd + 0.05);
    return osc;
  }

  function playClickTick(ctx, dest, time) {
    var osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1000, time);
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.22, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.045);
    osc.connect(gain); gain.connect(dest);
    osc.start(time); osc.stop(time + 0.05);
    return osc;
  }

  /* =========================================================================
     Routine construction — a flat, fully-known event list. Times are
     seconds relative to routine start; converted to absolute AudioContext
     time only once, when scheduling.
     ========================================================================= */

  function buildRoutine() {
    var beatDur = 60 / state.bpm;
    var events = [];
    var visual = [];
    var t = 0;

    var selected = EXERCISES.filter(function (ex) { return state.enabledExercises[ex.id]; });

    selected.forEach(function (ex) {
      for (var rep = 0; rep < state.reps; rep++) {
        var repRootMidi = startMidi() + rep * state.stepSemitones;
        var repStartT = t;

        if (ex.kind === 'notes') {
          ex.pattern.forEach(function (semitoneOffset) {
            var freq = MT.midiToFreq(repRootMidi + semitoneOffset, 440, 0);
            events.push({ time: t, kind: 'note', freq: freq, duration: beatDur * 0.92 });
            t += beatDur;
          });
        } else {
          var segBeats = ex.totalBeats / (ex.pattern.length - 1);
          var points = ex.pattern.map(function (semitoneOffset, i) {
            return { time: t + i * segBeats * beatDur, freq: MT.midiToFreq(repRootMidi + semitoneOffset, 440, 0) };
          });
          events.push({ time: t, kind: 'glide', points: points });
          t += ex.totalBeats * beatDur;
        }

        visual.push({ time: repStartT, exerciseId: ex.id, exerciseLabel: ex.label, rep: rep, totalReps: state.reps, rootMidi: repRootMidi });

        t += beatDur * 0.5; // brief gap between reps
      }
      t += beatDur; // brief gap between exercises
    });

    var totalDuration = t;

    if (state.clickEnabled) {
      var beatCount = Math.ceil(totalDuration / beatDur);
      for (var b = 0; b < beatCount; b++) {
        events.push({ time: b * beatDur, kind: 'click' });
      }
    }

    return { events: events, visual: visual, totalDuration: totalDuration };
  }

  /* =========================================================================
     DOM refs
     ========================================================================= */

  var voiceTypeChipsEl = document.getElementById('voiceTypeChips');
  var rootGroupEl = document.getElementById('rootGroup');
  var rootPickerEl = document.getElementById('rootPicker');
  var octaveGroupEl = document.getElementById('octaveGroup');
  var octaveControlEl = document.getElementById('octaveControl');
  var startingNoteLineEl = document.getElementById('startingNoteLine');

  var exerciseListEl = document.getElementById('exerciseList');

  var tempoSlider = document.getElementById('tempoSlider');
  var tempoValueEl = document.getElementById('tempoValue');
  var repsControlEl = document.getElementById('repsControl');
  var stepControlEl = document.getElementById('stepControl');
  var clickToggle = document.getElementById('clickToggle');

  var promptStatusEl = document.getElementById('promptStatus');
  var playBtn = document.getElementById('playBtn');
  var playBtnLabel = document.getElementById('playBtnLabel');
  var progressFillEl = document.getElementById('progressFill');

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
     Voice type quick-picks (signposting) — reuses ../js/voice-ranges.js
     ========================================================================= */

  function renderVoiceTypeChips() {
    voiceTypeChipsEl.innerHTML = '';
    window.VoiceRanges.CATEGORIES.forEach(function (cat) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'voice-type-chip';
      btn.innerHTML = '<span class="voice-type-chip-label">' + cat.label + '</span>' +
        '<span class="voice-type-chip-range">' + midiName(cat.lowMidi) + '&ndash;' + midiName(cat.highMidi) + '</span>';
      btn.addEventListener('click', function () {
        setRoot(cat.lowMidi % 12, MAJOR_ISH_FLATS[cat.lowMidi % 12]);
        setOctave(Math.floor(cat.lowMidi / 12) - 1);
        Array.prototype.forEach.call(voiceTypeChipsEl.querySelectorAll('button'), function (b) { b.classList.remove('is-active'); });
        btn.classList.add('is-active');
      });
      voiceTypeChipsEl.appendChild(btn);
    });
  }

  // Enharmonic spelling for the root picker when a voice-type quick-pick
  // lands on a black key - matches the same convention used elsewhere
  // (Song Key Finder's MAJOR_FLATS, the Interval Ear Trainer's MINOR_FLATS).
  var MAJOR_ISH_FLATS = [false, true, false, true, false, false, false, false, true, false, true, false];

  /* =========================================================================
     Starting note wiring
     ========================================================================= */

  function renderStartingNoteLine() {
    var name = MT.noteNameForPc(state.rootPc, state.rootFlats) + state.octave;
    startingNoteLineEl.textContent = 'Starting on ' + name + ' (' + startFreq().toFixed(1) + ' Hz)';
  }

  function setRoot(pc, flats) {
    state.rootPc = pc;
    state.rootFlats = flats;
    Array.prototype.forEach.call(rootPickerEl.querySelectorAll('button'), function (b) {
      b.classList.toggle('is-active', parseInt(b.getAttribute('data-pc'), 10) === pc);
    });
    renderStartingNoteLine();
  }
  rootPickerEl.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('button') : null;
    if (!btn) return;
    setRoot(parseInt(btn.getAttribute('data-pc'), 10), btn.getAttribute('data-flats') === 'true');
  });

  function setOctave(octave) {
    state.octave = octave;
    Array.prototype.forEach.call(octaveControlEl.querySelectorAll('button'), function (b) {
      b.classList.toggle('is-active', parseInt(b.getAttribute('data-value'), 10) === octave);
    });
    renderStartingNoteLine();
  }
  wireSegControl(octaveControlEl, function (value) { setOctave(parseInt(value, 10)); });

  /* =========================================================================
     Exercise toggles
     ========================================================================= */

  function renderExerciseList() {
    exerciseListEl.innerHTML = '';
    EXERCISES.forEach(function (ex) {
      var row = document.createElement('label');
      row.className = 'exercise-row';

      var checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = state.enabledExercises[ex.id];
      checkbox.addEventListener('change', function () { state.enabledExercises[ex.id] = checkbox.checked; });

      var text = document.createElement('span');
      text.className = 'exercise-row-text';
      text.innerHTML = '<span class="exercise-row-label">' + ex.label + '</span><span class="exercise-row-desc">' + ex.desc + '</span>';

      row.appendChild(checkbox);
      row.appendChild(text);
      exerciseListEl.appendChild(row);
    });
  }

  /* =========================================================================
     Routine settings wiring
     ========================================================================= */

  tempoSlider.addEventListener('input', function () {
    state.bpm = parseInt(tempoSlider.value, 10);
    tempoValueEl.textContent = state.bpm + ' BPM';
  });

  wireSegControl(repsControlEl, function (value) { state.reps = parseInt(value, 10); });
  wireSegControl(stepControlEl, function (value) { state.stepSemitones = parseInt(value, 10); });

  clickToggle.addEventListener('change', function () { state.clickEnabled = clickToggle.checked; });

  /* =========================================================================
     Playback
     ========================================================================= */

  var session = { running: false };
  var activeNodes = [];
  var visualQueue = [];
  var routineStartTime = 0;
  var routineTotalDuration = 0;
  var finishTimer = null;

  function setPlayButtonState(running) {
    playBtn.classList.toggle('is-playing', running);
    playBtnLabel.textContent = running ? 'Stop' : 'Start';
  }

  function startRoutine() {
    var anyEnabled = EXERCISES.some(function (ex) { return state.enabledExercises[ex.id]; });
    if (!anyEnabled) {
      promptStatusEl.textContent = 'Select at least one exercise first.';
      return;
    }

    ensureAudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    var routine = buildRoutine();
    var t0 = audioCtx.currentTime + 0.15;
    activeNodes = [];

    routine.events.forEach(function (ev) {
      if (ev.kind === 'note') {
        activeNodes.push(playNoteNode(audioCtx, audioCtx.destination, ev.freq, t0 + ev.time, ev.duration));
      } else if (ev.kind === 'glide') {
        var absPoints = ev.points.map(function (p) { return { time: t0 + p.time, freq: p.freq }; });
        activeNodes.push(playGlideNode(audioCtx, audioCtx.destination, absPoints));
      } else if (ev.kind === 'click') {
        activeNodes.push(playClickTick(audioCtx, audioCtx.destination, t0 + ev.time));
      }
    });

    visualQueue = routine.visual.map(function (v) {
      var copy = {};
      for (var k in v) copy[k] = v[k];
      copy.time = t0 + v.time;
      return copy;
    });

    routineStartTime = t0;
    routineTotalDuration = routine.totalDuration;
    session.running = true;
    setPlayButtonState(true);
    promptStatusEl.textContent = 'Get ready…';
    progressFillEl.style.width = '0%';

    finishTimer = setTimeout(function () { stopRoutine(true); }, (routine.totalDuration + 0.4) * 1000);
    requestAnimationFrame(visualFrame);
  }

  function stopRoutine(finished) {
    session.running = false;
    if (finishTimer) { clearTimeout(finishTimer); finishTimer = null; }
    var now = audioCtx ? audioCtx.currentTime : 0;
    activeNodes.forEach(function (node) {
      try { node.stop(now); } catch (e) { /* already stopped - fine */ }
    });
    activeNodes = [];
    setPlayButtonState(false);
    promptStatusEl.textContent = finished ? 'Routine complete — nice work.' : 'Stopped.';
    progressFillEl.style.width = finished ? '100%' : progressFillEl.style.width;
  }

  function visualFrame() {
    if (!session.running) return;
    var now = audioCtx.currentTime;
    while (visualQueue.length && visualQueue[0].time <= now) {
      var ev = visualQueue.shift();
      promptStatusEl.textContent = ev.exerciseLabel + ' — Rep ' + (ev.rep + 1) + ' of ' + ev.totalReps + ', starting on ' + midiName(ev.rootMidi);
    }
    var elapsed = now - routineStartTime;
    var pct = routineTotalDuration > 0 ? MT.clamp(elapsed / routineTotalDuration, 0, 1) * 100 : 0;
    progressFillEl.style.width = pct + '%';
    requestAnimationFrame(visualFrame);
  }

  playBtn.addEventListener('click', function () {
    if (session.running) stopRoutine(false); else startRoutine();
  });

  /* =========================================================================
     Keyboard input
     ========================================================================= */

  function isTypingTarget(el) {
    return el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA');
  }

  window.addEventListener('keydown', function (e) {
    if (isTypingTarget(document.activeElement) && e.key !== 'Escape') return;
    if (e.code === 'Space') { e.preventDefault(); playBtn.click(); return; }
  });

  /* =========================================================================
     Init
     ========================================================================= */

  renderVoiceTypeChips();
  renderStartingNoteLine();
  renderExerciseList();
  tempoValueEl.textContent = state.bpm + ' BPM';
})();
