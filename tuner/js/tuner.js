(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var MT = window.MusicTheory;

  var noteNameToFreq = MT.noteNameToFreq;
  var freqToNearestChromatic = MT.freqToNearestChromatic;
  var clamp = MT.clamp;
  var INSTRUMENTS = MT.INSTRUMENTS;
  var INSTRUMENT_ORDER = MT.INSTRUMENT_ORDER;

  function nearestInTargets(freq, targets) {
    var best = null, bestCents = Infinity;
    targets.forEach(function (t) {
      var cents = 1200 * Math.log2(freq / t.freq);
      if (Math.abs(cents) < Math.abs(bestCents)) { bestCents = cents; best = t; }
    });
    return { target: best, cents: bestCents };
  }

  /* =========================================================================
     State
     ========================================================================= */

  var state = {
    instrument: 'guitar',
    tuningIndex: 0,
    a4: 440,
    detune: 0,
    waveform: 'sine',
    toneVolume: 0.7,
    chromatic: false,
    isListening: false,
    currentTargets: []
  };

  function getCurrentTuning() {
    return INSTRUMENTS[state.instrument].tunings[state.tuningIndex];
  }

  function recomputeTargets() {
    state.currentTargets = getCurrentTuning().notes.map(function (n) {
      return { name: n, freq: noteNameToFreq(n, state.a4, state.detune) };
    });
  }

  /* =========================================================================
     Reference tone synthesis
     ========================================================================= */

  var audioCtx = null;

  function ensureAudioContext() {
    if (audioCtx) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AC();
  }

  function playReferenceTone(freq) {
    ensureAudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    var t = audioCtx.currentTime;
    var vol = Math.max(state.toneVolume, 0.001);

    if (state.waveform === 'realistic') {
      var dur = 1.3;
      window.InstrumentTones.playRealistic(audioCtx, audioCtx.destination, state.instrument, freq, t, vol);
      return dur;
    }

    var dur2 = 1.4;
    var osc = audioCtx.createOscillator();
    osc.type = state.waveform;
    osc.frequency.setValueAtTime(freq, t);

    var gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.03);
    gain.gain.setValueAtTime(vol, t + dur2 - 0.3);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur2);

    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(t); osc.stop(t + dur2 + 0.05);
    return dur2;
  }

  /* =========================================================================
     DOM refs
     ========================================================================= */

  var instrumentTabsEl = document.getElementById('instrumentTabs');
  var stringPillsEl = document.getElementById('stringPills');
  var tuningSelect = document.getElementById('tuningSelect');

  var a4Input = document.getElementById('a4Input');
  var a4Slider = document.getElementById('a4Slider');
  var detuneInput = document.getElementById('detuneInput');
  var detuneSlider = document.getElementById('detuneSlider');
  var detuneReset = document.getElementById('detuneReset');

  var waveControl = document.getElementById('waveControl');
  var toneVolumeSlider = document.getElementById('toneVolumeSlider');

  var needleEl = document.getElementById('tunerNeedle');
  var tunerNoteEl = document.getElementById('tunerNote');
  var tunerCentsEl = document.getElementById('tunerCents');
  var tunerFreqEl = document.getElementById('tunerFreq');
  var listenBtn = document.getElementById('listenBtn');
  var listenBtnLabel = document.getElementById('listenBtnLabel');
  var tunerStatusEl = document.getElementById('tunerStatus');
  var modeControl = document.getElementById('modeControl');

  /* =========================================================================
     Instrument / string rendering
     ========================================================================= */

  function populateTuningSelect() {
    var data = INSTRUMENTS[state.instrument];
    tuningSelect.innerHTML = '';
    data.tunings.forEach(function (t, i) {
      var opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = t.label;
      tuningSelect.appendChild(opt);
    });
    tuningSelect.value = String(state.tuningIndex);
  }

  function activeInstrumentSvg() {
    return document.querySelector('.instrument-art[data-instrument="' + state.instrument + '"]');
  }

  function renderStringsDOM() {
    Array.prototype.forEach.call(document.querySelectorAll('.tuner-strings'), function (g) {
      g.innerHTML = '';
    });

    var svg = activeInstrumentSvg();
    var group = svg.querySelector('.tuner-strings');
    var nut = parseFloat(group.getAttribute('data-nut'));
    var bridge = parseFloat(group.getAttribute('data-bridge'));
    var x0 = parseFloat(group.getAttribute('data-x0'));
    var x1 = parseFloat(group.getAttribute('data-x1'));
    var notes = state.currentTargets;
    var n = notes.length;

    stringPillsEl.innerHTML = '';

    notes.forEach(function (target, i) {
      var x = x0 + (i + 0.5) * (x1 - x0) / n;

      var hit = document.createElementNS(SVG_NS, 'line');
      hit.setAttribute('class', 'tuner-string-hit');
      hit.setAttribute('x1', x); hit.setAttribute('y1', nut);
      hit.setAttribute('x2', x); hit.setAttribute('y2', bridge);

      var line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('class', 'tuner-string');
      line.setAttribute('data-index', String(i));
      line.setAttribute('x1', x); line.setAttribute('y1', nut);
      line.setAttribute('x2', x); line.setAttribute('y2', bridge);

      hit.addEventListener('click', function () { playString(i); });

      group.appendChild(hit);
      group.appendChild(line);

      var pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'string-pill';
      pill.setAttribute('data-index', String(i));
      pill.textContent = target.name;
      pill.addEventListener('click', function () { playString(i); });
      stringPillsEl.appendChild(pill);
    });
  }

  function setInstrument(id) {
    if (!INSTRUMENTS[id]) return;
    state.instrument = id;
    state.tuningIndex = 0;

    Array.prototype.forEach.call(instrumentTabsEl.querySelectorAll('.instrument-tab'), function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-instrument') === id);
    });
    Array.prototype.forEach.call(document.querySelectorAll('.instrument-art'), function (svg) {
      svg.classList.toggle('is-active', svg.getAttribute('data-instrument') === id);
    });

    populateTuningSelect();
    recomputeTargets();
    renderStringsDOM();
  }

  function playString(i) {
    var target = state.currentTargets[i];
    if (!target) return;
    var dur = playReferenceTone(target.freq);
    flashString(i, dur);
  }

  function flashString(i, dur) {
    var svg = activeInstrumentSvg();
    var line = svg.querySelector('.tuner-string[data-index="' + i + '"]');
    var pill = stringPillsEl.querySelector('.string-pill[data-index="' + i + '"]');
    [line, pill].forEach(function (el) { if (el) el.classList.add('is-playing'); });
    setTimeout(function () {
      [line, pill].forEach(function (el) { if (el) el.classList.remove('is-playing'); });
    }, dur * 1000);
  }

  function updateStringHighlights(match) {
    var svg = activeInstrumentSvg();
    Array.prototype.forEach.call(svg.querySelectorAll('.tuner-string'), function (el) {
      el.classList.remove('is-target', 'is-in-tune');
    });
    Array.prototype.forEach.call(stringPillsEl.querySelectorAll('.string-pill'), function (el) {
      el.classList.remove('is-target', 'is-in-tune');
    });

    if (!match || match.index < 0) return;
    var inTune = Math.abs(match.cents) <= 5;
    var idx = match.index;
    var line = svg.querySelector('.tuner-string[data-index="' + idx + '"]');
    var pill = stringPillsEl.querySelector('.string-pill[data-index="' + idx + '"]');
    [line, pill].forEach(function (el) {
      if (!el) return;
      el.classList.add('is-target');
      if (inTune) el.classList.add('is-in-tune');
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
     Calibration wiring
     ========================================================================= */

  function setA4(v) {
    state.a4 = clamp(Math.round(v), 415, 466);
    a4Input.value = state.a4;
    a4Slider.value = state.a4;
    recomputeTargets();
  }

  function setDetune(v) {
    state.detune = clamp(Math.round(v), -50, 50);
    detuneInput.value = state.detune;
    detuneSlider.value = state.detune;
    recomputeTargets();
  }

  a4Input.addEventListener('change', function () { setA4(parseFloat(a4Input.value)); });
  a4Slider.addEventListener('input', function () { setA4(parseFloat(a4Slider.value)); });
  detuneInput.addEventListener('change', function () { setDetune(parseFloat(detuneInput.value)); });
  detuneSlider.addEventListener('input', function () { setDetune(parseFloat(detuneSlider.value)); });
  detuneReset.addEventListener('click', function () { setDetune(0); });

  /* =========================================================================
     Tone wiring
     ========================================================================= */

  wireSegControl(waveControl, function (value) { state.waveform = value; });
  toneVolumeSlider.addEventListener('input', function () { state.toneVolume = parseFloat(toneVolumeSlider.value); });

  /* =========================================================================
     Instrument / tuning wiring
     ========================================================================= */

  instrumentTabsEl.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('.instrument-tab') : null;
    if (!btn) return;
    setInstrument(btn.getAttribute('data-instrument'));
  });

  tuningSelect.addEventListener('change', function () {
    state.tuningIndex = parseInt(tuningSelect.value, 10);
    recomputeTargets();
    renderStringsDOM();
  });

  function setMode(value) {
    state.chromatic = value === 'chromatic';
    Array.prototype.forEach.call(modeControl.querySelectorAll('button'), function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-value') === value);
    });
    updateStringHighlights(currentMatch);
  }

  wireSegControl(modeControl, function (value) { setMode(value); });

  /* =========================================================================
     Pitch detection (autocorrelation) — shared implementation in ../js/pitch.js
     ========================================================================= */

  var micStream = null;
  var micSource = null;
  var analyser = null;
  var pitchBuffer = null;
  var detectionTimer = null;
  var rafId = null;
  var currentMatch = null;
  var displayedCents = 0;
  var lastMatchTime = 0;
  var SILENCE_HOLD_MS = 3000;

  function setListenButtonState(listening) {
    listenBtn.classList.toggle('is-listening', listening);
    listenBtnLabel.textContent = listening ? 'Stop Listening' : 'Start Listening';
  }

  function showStatus(text, isError) {
    tunerStatusEl.textContent = text;
    tunerStatusEl.classList.toggle('is-error', !!isError);
  }

  function showIdleReadout() {
    tunerNoteEl.textContent = '–';
    tunerNoteEl.classList.remove('is-in-tune');
    tunerCentsEl.textContent = 'Listening…';
    tunerCentsEl.classList.remove('is-in-tune');
    tunerFreqEl.textContent = ' ';
  }

  function clearReadout() {
    tunerNoteEl.textContent = '–';
    tunerNoteEl.classList.remove('is-in-tune');
    tunerCentsEl.innerHTML = '&nbsp;';
    tunerCentsEl.classList.remove('is-in-tune');
    tunerFreqEl.innerHTML = '&nbsp;';
  }

  function updateReadout(match) {
    var inTune = Math.abs(match.cents) <= 5;
    tunerNoteEl.textContent = match.name;
    tunerNoteEl.classList.toggle('is-in-tune', inTune);
    var centsRounded = Math.round(match.cents);
    tunerCentsEl.textContent = inTune ? 'In tune' : (centsRounded > 0 ? '+' + centsRounded + '¢ sharp' : centsRounded + '¢ flat');
    tunerCentsEl.classList.toggle('is-in-tune', inTune);
    tunerFreqEl.textContent = match.freq.toFixed(1) + ' Hz';
  }

  function runDetection() {
    if (!analyser) return;
    analyser.getFloatTimeDomainData(pitchBuffer);
    var freq = window.PitchDetect.autoCorrelate(pitchBuffer, audioCtx.sampleRate);

    if (freq === -1) {
      if (currentMatch && performance.now() - lastMatchTime < SILENCE_HOLD_MS) return;
      currentMatch = null;
      updateStringHighlights(null);
      showIdleReadout();
      return;
    }

    var match;
    if (state.chromatic) {
      var nearest = freqToNearestChromatic(freq, state.a4, state.detune);
      var cents = 1200 * Math.log2(freq / nearest.freq);
      match = { name: nearest.name + nearest.octave, cents: cents, freq: freq, index: -1 };
    } else {
      var res = nearestInTargets(freq, state.currentTargets);
      if (!res.target) {
        if (currentMatch && performance.now() - lastMatchTime < SILENCE_HOLD_MS) return;
        currentMatch = null; showIdleReadout(); return;
      }
      match = { name: res.target.name, cents: res.cents, freq: freq, index: state.currentTargets.indexOf(res.target) };
    }

    currentMatch = match;
    lastMatchTime = performance.now();
    updateReadout(match);
    updateStringHighlights(match);
  }

  function needleFrame() {
    if (!state.isListening) return;
    var targetCents = currentMatch ? clamp(currentMatch.cents, -50, 50) : 0;
    displayedCents += (targetCents - displayedCents) * 0.25;
    var angle = (displayedCents / 50) * 45;
    needleEl.style.transform = 'translateX(-50%) rotate(' + angle.toFixed(2) + 'deg)';
    needleEl.classList.toggle('is-in-tune', !!(currentMatch && Math.abs(currentMatch.cents) <= 5));
    needleEl.classList.toggle('is-idle', !currentMatch);
    rafId = requestAnimationFrame(needleFrame);
  }

  function startListening() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showStatus('Microphone input is not supported in this browser.', true);
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

        state.isListening = true;
        setListenButtonState(true);
        showStatus('Listening… play a note.', false);

        detectionTimer = setInterval(runDetection, 60);
        rafId = requestAnimationFrame(needleFrame);
      })
      .catch(function () {
        showStatus('Microphone access was denied or unavailable.', true);
      });
  }

  function stopListening() {
    state.isListening = false;
    setListenButtonState(false);
    if (detectionTimer) { clearInterval(detectionTimer); detectionTimer = null; }
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    if (micSource) { micSource.disconnect(); micSource = null; }
    if (micStream) { micStream.getTracks().forEach(function (t) { t.stop(); }); micStream = null; }
    analyser = null;
    currentMatch = null;
    displayedCents = 0;
    needleEl.style.transform = 'translateX(-50%) rotate(0deg)';
    needleEl.classList.remove('is-in-tune');
    needleEl.classList.add('is-idle');
    updateStringHighlights(null);
    clearReadout();
    showStatus('Tap Start to tune by ear using your microphone.', false);
  }

  listenBtn.addEventListener('click', function () {
    if (state.isListening) stopListening(); else startListening();
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
      if (state.isListening) stopListening(); else startListening();
      return;
    }
    if (e.key === 'ArrowUp') { e.preventDefault(); setDetune(state.detune + (e.shiftKey ? 10 : 1)); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setDetune(state.detune - (e.shiftKey ? 10 : 1)); return; }
    if (e.key.toLowerCase() === 'c') {
      setMode(state.chromatic ? 'preset' : 'chromatic');
      return;
    }
    if (/^[1-5]$/.test(e.key)) {
      var id = INSTRUMENT_ORDER[parseInt(e.key, 10) - 1];
      if (id) setInstrument(id);
      return;
    }
  });

  /* =========================================================================
     Init
     ========================================================================= */

  needleEl.classList.add('is-idle');
  setMode('preset');
  setInstrument('guitar');
  setA4(440);
  setDetune(0);
})();
