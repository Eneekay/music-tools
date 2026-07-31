/* Vocal Pitch Tuner — like the Tuner, but built for holding a note rather
   than plucking a string: instead of a needle that only matters for a
   moment, this keeps a scrolling trace of cents-off over the last several
   seconds plus running time-in-tune and longest-hold stats, so a held note
   becomes something you can see wobble (or not) in real time. Useful for
   breath-support drills, where the point is the STEADINESS of a held note,
   not just hitting it once.

   Built on the shared MicPitch controller (../js/mic-pitch.js) rather than
   its own getUserMedia/analyser loop - the Tuner, Fretboard Trainer, Vocal
   Range Finder and Sing-Back Ear Trainer each grew a private copy of that
   plumbing before this module existed; this tool and the Song Key Finder
   are the first to share it instead. No external libraries. */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var MT = window.MusicTheory;

  var IN_TUNE_CENTS = 10;
  var TRACE_WINDOW_MS = 12000;
  var TRACE_W = 640, TRACE_H = 120, TRACE_TOP = 5, TRACE_CENTS_RANGE = 100;
  var TRACE_CENTER_Y = TRACE_TOP + TRACE_H / 2;

  /* =========================================================================
     State
     ========================================================================= */

  var state = {
    mode: 'fixed', // 'fixed' | 'chromatic'
    rootPc: 0,
    rootFlats: false,
    octave: 4
  };

  var trace = {
    samples: [],       // { t, cents } — cents is null for a silence gap
    holdStartTime: null,
    holdMidi: null,
    longestHoldMs: 0,
    inTuneMs: 0,
    totalVoicedMs: 0,
    lastTickTime: null
  };

  function targetMidi() { return (state.octave + 1) * 12 + state.rootPc; }
  function targetFreq() { return MT.midiToFreq(targetMidi(), 440, 0); }

  /* =========================================================================
     Reference tone playback (independent AudioContext from the mic path)
     ========================================================================= */

  var playbackCtx = null;
  function ensurePlaybackContext() {
    if (playbackCtx) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    playbackCtx = new AC();
  }

  function playReference() {
    ensurePlaybackContext();
    if (playbackCtx.state === 'suspended') playbackCtx.resume();
    window.InstrumentTones.playSimpleTone(playbackCtx, playbackCtx.destination, targetFreq(), { type: 'sine', duration: 1.3, gain: 0.5 });
  }

  /* =========================================================================
     DOM refs
     ========================================================================= */

  var targetLineEl = document.getElementById('targetLine');
  var vtNoteEl = document.getElementById('vtNote');
  var vtCentsEl = document.getElementById('vtCents');
  var listenBtn = document.getElementById('listenBtn');
  var listenBtnLabel = document.getElementById('listenBtnLabel');
  var vtStatusEl = document.getElementById('vtStatus');

  var traceLinesEl = document.getElementById('traceLines');
  var traceBandEl = document.querySelector('.trace-band');
  var traceZeroEl = document.querySelector('.trace-zero');
  var resetTraceBtn = document.getElementById('resetTraceBtn');

  var modeControlEl = document.getElementById('modeControl');
  var rootGroupEl = document.getElementById('rootGroup');
  var rootPickerEl = document.getElementById('rootPicker');
  var octaveGroupEl = document.getElementById('octaveGroup');
  var octaveControlEl = document.getElementById('octaveControl');
  var playRefBtn = document.getElementById('playRefBtn');

  var statInTuneEl = document.getElementById('statInTune');
  var statCurrentHoldEl = document.getElementById('statCurrentHold');
  var statLongestHoldEl = document.getElementById('statLongestHold');

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
     Target settings wiring
     ========================================================================= */

  function renderTargetLine() {
    if (state.mode === 'chromatic') {
      targetLineEl.textContent = 'Chromatic mode — held against whichever note is nearest.';
    } else {
      var name = MT.noteNameForPc(state.rootPc, state.rootFlats) + state.octave;
      targetLineEl.textContent = 'Target: ' + name + ' (' + targetFreq().toFixed(1) + ' Hz)';
    }
  }

  function setMode(value) {
    state.mode = value;
    rootGroupEl.classList.toggle('is-disabled', value === 'chromatic');
    octaveGroupEl.classList.toggle('is-disabled', value === 'chromatic');
    playRefBtn.disabled = value === 'chromatic';
    renderTargetLine();
  }
  wireSegControl(modeControlEl, setMode);

  function setRoot(pc, flats) {
    state.rootPc = pc;
    state.rootFlats = flats;
    Array.prototype.forEach.call(rootPickerEl.querySelectorAll('button'), function (b) {
      b.classList.toggle('is-active', parseInt(b.getAttribute('data-pc'), 10) === pc);
    });
    renderTargetLine();
  }
  rootPickerEl.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('button') : null;
    if (!btn) return;
    setRoot(parseInt(btn.getAttribute('data-pc'), 10), btn.getAttribute('data-flats') === 'true');
  });

  wireSegControl(octaveControlEl, function (value) { state.octave = parseInt(value, 10); renderTargetLine(); });

  playRefBtn.addEventListener('click', playReference);

  /* =========================================================================
     Readout
     ========================================================================= */

  function showIdleReadout() {
    vtNoteEl.textContent = '–';
    vtNoteEl.classList.remove('is-in-tune');
    vtCentsEl.innerHTML = '&nbsp;';
    vtCentsEl.classList.remove('is-in-tune');
  }

  function updateReadout(name, cents) {
    var inTune = Math.abs(cents) <= IN_TUNE_CENTS;
    vtNoteEl.textContent = name;
    vtNoteEl.classList.toggle('is-in-tune', inTune);
    var rounded = Math.round(cents);
    vtCentsEl.textContent = inTune ? 'In tune' : (rounded > 0 ? '+' + rounded + '¢ sharp' : rounded + '¢ flat');
    vtCentsEl.classList.toggle('is-in-tune', inTune);
  }

  /* =========================================================================
     Trace + stats
     ========================================================================= */

  function centsToY(cents) {
    var c = MT.clamp(cents, -TRACE_CENTS_RANGE, TRACE_CENTS_RANGE);
    return TRACE_CENTER_Y - (c / TRACE_CENTS_RANGE) * (TRACE_H / 2);
  }

  function initTraceScale() {
    var bandTop = centsToY(IN_TUNE_CENTS);
    var bandBottom = centsToY(-IN_TUNE_CENTS);
    traceBandEl.setAttribute('x', '0');
    traceBandEl.setAttribute('width', String(TRACE_W));
    traceBandEl.setAttribute('y', String(bandTop));
    traceBandEl.setAttribute('height', String(bandBottom - bandTop));
    traceZeroEl.setAttribute('x1', '0');
    traceZeroEl.setAttribute('x2', String(TRACE_W));
    traceZeroEl.setAttribute('y1', String(TRACE_CENTER_Y));
    traceZeroEl.setAttribute('y2', String(TRACE_CENTER_Y));
  }

  function pushSample(t, cents) {
    trace.samples.push({ t: t, cents: cents });
    var minT = t - TRACE_WINDOW_MS;
    while (trace.samples.length && trace.samples[0].t < minT) trace.samples.shift();
  }

  function renderTrace() {
    var now = performance.now();
    var minT = now - TRACE_WINDOW_MS;
    var segments = [];
    var current = null;

    trace.samples.forEach(function (s) {
      if (s.t < minT) return;
      if (s.cents === null) { current = null; return; }
      var x = ((s.t - minT) / TRACE_WINDOW_MS) * TRACE_W;
      var y = centsToY(s.cents);
      if (!current) { current = []; segments.push(current); }
      current.push(x.toFixed(1) + ',' + y.toFixed(1));
    });

    traceLinesEl.innerHTML = '';
    segments.forEach(function (pts) {
      var pl = document.createElementNS(SVG_NS, 'polyline');
      pl.setAttribute('class', 'trace-line');
      pl.setAttribute('points', pts.join(' '));
      traceLinesEl.appendChild(pl);
    });
  }

  function renderStats() {
    statInTuneEl.textContent = trace.totalVoicedMs > 0 ? Math.round((trace.inTuneMs / trace.totalVoicedMs) * 100) + '%' : '–';
    statLongestHoldEl.textContent = (trace.longestHoldMs / 1000).toFixed(1) + 's';
    var current = trace.holdStartTime !== null ? (performance.now() - trace.holdStartTime) : 0;
    statCurrentHoldEl.textContent = (current / 1000).toFixed(1) + 's';
  }

  function resetTrace() {
    trace.samples = [];
    trace.holdStartTime = null;
    trace.holdMidi = null;
    trace.longestHoldMs = 0;
    trace.inTuneMs = 0;
    trace.totalVoicedMs = 0;
    trace.lastTickTime = null;
    renderTrace();
    renderStats();
  }
  resetTraceBtn.addEventListener('click', resetTrace);

  /* =========================================================================
     Mic pitch tracking (shared controller)
     ========================================================================= */

  var mic = window.MicPitch.create({
    silenceHoldMs: 0, // a breath-support trace wants exact silence, not a smoothed hold
    intervalMs: 60,
    onMatch: handleMatch,
    onSilence: handleSilence
  });

  function handleMatch(match) {
    var now = performance.now();
    var elapsed = trace.lastTickTime !== null ? now - trace.lastTickTime : 60;
    trace.lastTickTime = now;

    var cents = state.mode === 'fixed' ? 1200 * Math.log2(match.freq / targetFreq()) : match.cents;
    var name = match.name + match.octave;

    if (trace.holdMidi !== match.midi) { trace.holdStartTime = now; trace.holdMidi = match.midi; }
    trace.longestHoldMs = Math.max(trace.longestHoldMs, now - trace.holdStartTime);

    trace.totalVoicedMs += elapsed;
    if (Math.abs(cents) <= IN_TUNE_CENTS) trace.inTuneMs += elapsed;

    pushSample(now, cents);
    updateReadout(name, cents);
    renderTrace();
    renderStats();
  }

  function handleSilence() {
    var now = performance.now();
    trace.lastTickTime = now;
    trace.holdStartTime = null;
    trace.holdMidi = null;
    pushSample(now, null);
    showIdleReadout();
    renderTrace();
    renderStats();
  }

  function setListenButtonState(listening) {
    listenBtn.classList.toggle('is-listening', listening);
    listenBtnLabel.textContent = listening ? 'Stop Listening' : 'Start Listening';
  }

  function showVtStatus(text, isError) {
    vtStatusEl.textContent = text;
    vtStatusEl.classList.toggle('is-error', !!isError);
  }

  function startListening() {
    mic.start(
      function () {
        setListenButtonState(true);
        showVtStatus('Listening — hold your target note as steadily as you can.', false);
      },
      function () {
        showVtStatus('Microphone access was denied or unavailable.', true);
      }
    );
  }

  function stopListening() {
    mic.stop();
    setListenButtonState(false);
    trace.holdStartTime = null;
    trace.holdMidi = null;
    trace.lastTickTime = null;
    showIdleReadout();
    renderStats();
    showVtStatus('Tap Start, pick a target note, then hold it as steadily as you can.', false);
  }

  listenBtn.addEventListener('click', function () {
    if (mic.isListening()) stopListening(); else startListening();
  });

  /* =========================================================================
     Keyboard input
     ========================================================================= */

  function isTypingTarget(el) {
    return el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA');
  }

  window.addEventListener('keydown', function (e) {
    if (isTypingTarget(document.activeElement) && e.key !== 'Escape') return;

    if (e.code === 'Space') { e.preventDefault(); listenBtn.click(); return; }
    if (e.key.toLowerCase() === 'p') { if (state.mode === 'fixed') playReference(); return; }
    if (e.key.toLowerCase() === 'r') { resetTrace(); return; }
  });

  /* =========================================================================
     Init
     ========================================================================= */

  initTraceScale();
  renderTargetLine();
  renderStats();
})();
