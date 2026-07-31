/* Vocal Range Finder — click through a reference keyboard (or just start
   singing), and the mic tracks the lowest and highest comfortably-sung note
   using the shared autocorrelation pitch detector (../js/pitch.js, same one
   the Tuner uses). Once enough range is captured, it's matched against a
   table of typical classical voice-type ranges (Bass through Soprano) by
   whichever category overlaps it the most.

   A note only extends the captured range once it's held steady for a few
   consecutive detection frames (MIC_STABLE_SAMPLES) - this is the same
   stable-sample gate the Fretboard Trainer uses for mic answers, and here it
   keeps a single noisy analysis frame or a slide between notes from
   yanking the low/high bounds around. Silence briefly holds the last
   reading (SILENCE_HOLD_MS) rather than clearing instantly, matching the
   Tuner's mic readout behavior. No external libraries. */
(function () {
  'use strict';

  var MT = window.MusicTheory;

  /* =========================================================================
     Voice-type classification table (rough classical ranges, MIDI note
     numbers). Each category overlaps its neighbors, matching how real voice
     types are commonly taught - classification picks whichever category's
     range overlaps the singer's captured range the most.
     ========================================================================= */

  var CATEGORIES = [
    { id: 'bass', label: 'Bass', lowMidi: 40, highMidi: 64, desc: 'The deepest common voice type, typically ranging from about E2 to E4.' },
    { id: 'baritone', label: 'Baritone', lowMidi: 45, highMidi: 69, desc: 'The most common male voice, sitting between bass and tenor, typically about A2 to A4.' },
    { id: 'tenor', label: 'Tenor', lowMidi: 48, highMidi: 72, desc: 'The highest common male voice type, typically about C3 to C5.' },
    { id: 'countertenor', label: 'Countertenor', lowMidi: 52, highMidi: 76, desc: 'A rare, high male voice singing largely in falsetto, typically about E3 to E5.' },
    { id: 'alto', label: 'Alto (Contralto)', lowMidi: 53, highMidi: 77, desc: 'The lowest common female voice, typically about F3 to F5.' },
    { id: 'mezzo', label: 'Mezzo-Soprano', lowMidi: 57, highMidi: 81, desc: 'The most common female voice, sitting between alto and soprano, typically about A3 to A5.' },
    { id: 'soprano', label: 'Soprano', lowMidi: 60, highMidi: 84, desc: 'The highest common female voice type, typically about C4 to C6.' }
  ];

  var CHART_LOW_MIDI = 36;  // C2
  var CHART_HIGH_MIDI = 88; // E6

  var MIC_STABLE_SAMPLES = 3;
  var MIC_DETECTION_INTERVAL_MS = 60;
  var SILENCE_HOLD_MS = 3000;
  var MIN_SPAN_FOR_CLASSIFICATION = 4; // semitones - a minor 3rd or more before we'll commit to a match

  function midiName(midi) {
    var pc = ((midi % 12) + 12) % 12;
    var octave = Math.floor(midi / 12) - 1;
    return MT.noteNameForPc(pc, false) + octave;
  }

  /* =========================================================================
     State
     ========================================================================= */

  var state = {
    isListening: false,
    lowMidi: null,
    highMidi: null,
    currentMatch: null
  };

  var lastMatchTime = 0;
  var micLastMidi = null;
  var micStableCount = 0;

  /* =========================================================================
     Reference tone (plain, warm sine - a clean pitch for singers to match)
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
    var dur = 1.3;
    var vol = 0.5;

    var osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);

    var gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.04);
    gain.gain.setValueAtTime(vol, t + dur - 0.3);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  /* =========================================================================
     DOM refs
     ========================================================================= */

  var refKeyboardSvg = document.getElementById('refKeyboardSvg');
  var vrNoteEl = document.getElementById('vrNote');
  var vrFreqEl = document.getElementById('vrFreq');
  var listenBtn = document.getElementById('listenBtn');
  var listenBtnLabel = document.getElementById('listenBtnLabel');
  var vrStatusEl = document.getElementById('vrStatus');

  var lowValueEl = document.getElementById('lowValue');
  var highValueEl = document.getElementById('highValue');
  var spanValueEl = document.getElementById('spanValue');
  var resetRangeBtn = document.getElementById('resetRangeBtn');

  var classificationResultEl = document.getElementById('classificationResult');
  var rangeChartEl = document.getElementById('rangeChart');

  /* =========================================================================
     Reference keyboard
     ========================================================================= */

  function renderKeyboard() {
    window.PianoKeyboard.render(refKeyboardSvg, {
      lowMidi: CHART_LOW_MIDI,
      highMidi: CHART_HIGH_MIDI,
      whiteKeyWidth: 22,
      keyHeight: 108,
      getKeyInfo: function (midi) {
        var classes = [];
        if (state.currentMatch && midi === state.currentMatch.midi) classes.push('is-current');
        if (state.lowMidi !== null && midi === state.lowMidi) classes.push('is-low');
        if (state.highMidi !== null && midi === state.highMidi) classes.push('is-high');
        if (!classes.length) return null;
        return { className: classes.join(' ') };
      },
      onKeyClick: function (midi) {
        playReferenceTone(MT.midiToFreq(midi, 440, 0));
      }
    });
  }

  /* =========================================================================
     Captured-range stats
     ========================================================================= */

  function renderCapturedRange() {
    lowValueEl.textContent = state.lowMidi !== null ? midiName(state.lowMidi) : '–';
    highValueEl.textContent = state.highMidi !== null ? midiName(state.highMidi) : '–';
    if (state.lowMidi !== null && state.highMidi !== null) {
      var span = state.highMidi - state.lowMidi;
      spanValueEl.textContent = span + (span === 1 ? ' semitone' : ' semitones');
    } else {
      spanValueEl.textContent = '–';
    }
  }

  /* =========================================================================
     Classification
     ========================================================================= */

  function classify() {
    if (state.lowMidi === null || state.highMidi === null) return null;
    if (state.highMidi - state.lowMidi < MIN_SPAN_FOR_CLASSIFICATION) return null;

    var bestCat = null, bestOverlap = -1, bestCenterDist = Infinity;
    var userCenter = (state.lowMidi + state.highMidi) / 2;

    CATEGORIES.forEach(function (cat) {
      var overlap = Math.max(0, Math.min(state.highMidi, cat.highMidi) - Math.max(state.lowMidi, cat.lowMidi));
      var catCenter = (cat.lowMidi + cat.highMidi) / 2;
      var centerDist = Math.abs(userCenter - catCenter);
      if (overlap > bestOverlap || (overlap === bestOverlap && centerDist < bestCenterDist)) {
        bestCat = cat; bestOverlap = overlap; bestCenterDist = centerDist;
      }
    });

    return bestCat;
  }

  function renderClassification() {
    var match = classify();
    if (!match) {
      var span = (state.lowMidi !== null && state.highMidi !== null) ? state.highMidi - state.lowMidi : 0;
      classificationResultEl.textContent = span > 0
        ? 'Keep going — sing a bit more of your range for a confident match.'
        : 'Sing a bit of your range to see your closest voice type.';
    } else {
      classificationResultEl.innerHTML = 'Closest match: <strong>' + match.label + '</strong> — ' + match.desc;
    }
    renderRangeChart(match);
  }

  function pctFor(midi) {
    return MT.clamp((midi - CHART_LOW_MIDI) / (CHART_HIGH_MIDI - CHART_LOW_MIDI) * 100, 0, 100);
  }

  function renderRangeChart(matchCat) {
    rangeChartEl.innerHTML = '';
    CATEGORIES.forEach(function (cat) {
      var row = document.createElement('div');
      row.className = 'range-row' + (matchCat && matchCat.id === cat.id ? ' is-match' : '');

      var label = document.createElement('span');
      label.className = 'range-row-label';
      label.textContent = cat.label;
      row.appendChild(label);

      var track = document.createElement('div');
      track.className = 'range-row-track';

      var band = document.createElement('div');
      band.className = 'range-band';
      band.style.left = pctFor(cat.lowMidi) + '%';
      band.style.width = (pctFor(cat.highMidi) - pctFor(cat.lowMidi)) + '%';
      track.appendChild(band);

      if (state.lowMidi !== null && state.highMidi !== null) {
        var userBand = document.createElement('div');
        userBand.className = 'range-user-band';
        userBand.style.left = pctFor(state.lowMidi) + '%';
        userBand.style.width = Math.max(pctFor(state.highMidi) - pctFor(state.lowMidi), 1) + '%';
        track.appendChild(userBand);
      }

      row.appendChild(track);
      rangeChartEl.appendChild(row);
    });
  }

  /* =========================================================================
     Range tracking
     ========================================================================= */

  function extendRange(midi) {
    var changed = false;
    if (state.lowMidi === null || midi < state.lowMidi) { state.lowMidi = midi; changed = true; }
    if (state.highMidi === null || midi > state.highMidi) { state.highMidi = midi; changed = true; }
    if (changed) {
      renderCapturedRange();
      renderClassification();
      renderKeyboard();
    }
  }

  function resetRange() {
    state.lowMidi = null;
    state.highMidi = null;
    renderCapturedRange();
    renderClassification();
    renderKeyboard();
  }

  resetRangeBtn.addEventListener('click', resetRange);

  /* =========================================================================
     Pitch detection (autocorrelation) — shared implementation in ../js/pitch.js
     ========================================================================= */

  var micStream = null;
  var micSource = null;
  var analyser = null;
  var pitchBuffer = null;
  var detectionTimer = null;

  function setListenButtonState(listening) {
    listenBtn.classList.toggle('is-listening', listening);
    listenBtnLabel.textContent = listening ? 'Stop Listening' : 'Start Listening';
  }

  function showStatus(text, isError) {
    vrStatusEl.textContent = text;
    vrStatusEl.classList.toggle('is-error', !!isError);
  }

  function showIdleReadout() {
    vrNoteEl.textContent = '–';
    vrFreqEl.innerHTML = '&nbsp;';
  }

  function updateReadout(match) {
    vrNoteEl.textContent = match.name;
    vrFreqEl.textContent = match.freq.toFixed(1) + ' Hz';
  }

  function runDetection() {
    if (!analyser) return;
    analyser.getFloatTimeDomainData(pitchBuffer);
    var freq = window.PitchDetect.autoCorrelate(pitchBuffer, audioCtx.sampleRate);

    if (freq === -1) {
      micLastMidi = null;
      micStableCount = 0;
      if (state.currentMatch && performance.now() - lastMatchTime < SILENCE_HOLD_MS) return;
      state.currentMatch = null;
      showIdleReadout();
      renderKeyboard();
      return;
    }

    var nearest = MT.freqToNearestChromatic(freq, 440, 0);
    var match = { name: nearest.name + nearest.octave, midi: nearest.midi, freq: freq };

    state.currentMatch = match;
    lastMatchTime = performance.now();
    updateReadout(match);

    if (nearest.midi === micLastMidi) micStableCount++;
    else { micLastMidi = nearest.midi; micStableCount = 1; }

    if (micStableCount >= MIC_STABLE_SAMPLES) {
      extendRange(nearest.midi);
    } else {
      renderKeyboard();
    }
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
        micLastMidi = null;
        micStableCount = 0;

        state.isListening = true;
        setListenButtonState(true);
        showStatus('Listening… hum or sing from your lowest note to your highest.', false);

        detectionTimer = setInterval(runDetection, MIC_DETECTION_INTERVAL_MS);
      })
      .catch(function () {
        showStatus('Microphone access was denied or unavailable.', true);
      });
  }

  function stopListening() {
    state.isListening = false;
    setListenButtonState(false);
    if (detectionTimer) { clearInterval(detectionTimer); detectionTimer = null; }
    if (micSource) { micSource.disconnect(); micSource = null; }
    if (micStream) { micStream.getTracks().forEach(function (t) { t.stop(); }); micStream = null; }
    analyser = null;
    state.currentMatch = null;
    micLastMidi = null;
    micStableCount = 0;
    showIdleReadout();
    renderKeyboard();
    showStatus('Tap Start, then hum or sing from your lowest comfortable note to your highest.', false);
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
    if (e.key.toLowerCase() === 'r') { resetRange(); return; }
  });

  /* =========================================================================
     Init
     ========================================================================= */

  renderKeyboard();
  renderCapturedRange();
  renderClassification();
})();
