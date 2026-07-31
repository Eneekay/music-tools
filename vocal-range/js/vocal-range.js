/* Vocal Range Finder — click through a reference keyboard (or just start
   singing), and the mic tracks the lowest and highest comfortably-sung note
   using the shared MicPitch controller (../js/mic-pitch.js), which wraps
   the same autocorrelation pitch detector (../js/pitch.js) the Tuner uses.
   Once enough range is captured, it's matched against a shared table of
   typical classical voice-type ranges (../js/voice-ranges.js, Bass through
   Soprano - also used by the Warm-up Routine Generator) by whichever
   category overlaps it the most.

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
  var CATEGORIES = window.VoiceRanges.CATEGORIES;

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
    lowMidi: null,
    highMidi: null,
    currentMatch: null
  };

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
    window.InstrumentTones.playSimpleTone(audioCtx, audioCtx.destination, freq, { type: 'sine', duration: 1.3, gain: 0.5 });
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
    return window.VoiceRanges.classify(state.lowMidi, state.highMidi);
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
     Pitch detection — shared controller in ../js/mic-pitch.js
     ========================================================================= */

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

  var mic = window.MicPitch.create({
    silenceHoldMs: SILENCE_HOLD_MS,
    intervalMs: MIC_DETECTION_INTERVAL_MS,
    onMatch: function (match, held) {
      state.currentMatch = { name: match.name + match.octave, midi: match.midi, freq: match.freq };
      updateReadout(state.currentMatch);
      if (held) { renderKeyboard(); return; }

      if (match.midi === micLastMidi) micStableCount++;
      else { micLastMidi = match.midi; micStableCount = 1; }

      if (micStableCount >= MIC_STABLE_SAMPLES) extendRange(match.midi);
      else renderKeyboard();
    },
    onSilence: function () {
      micLastMidi = null;
      micStableCount = 0;
      state.currentMatch = null;
      showIdleReadout();
      renderKeyboard();
    }
  });

  function startListening() {
    mic.start(
      function () {
        setListenButtonState(true);
        showStatus('Listening… hum or sing from your lowest note to your highest.', false);
      },
      function () {
        showStatus('Microphone access was denied or unavailable.', true);
      }
    );
  }

  function stopListening() {
    mic.stop();
    setListenButtonState(false);
    state.currentMatch = null;
    micLastMidi = null;
    micStableCount = 0;
    showIdleReadout();
    renderKeyboard();
    showStatus('Tap Start, then hum or sing from your lowest comfortable note to your highest.', false);
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

    if (e.code === 'Space') {
      e.preventDefault();
      if (mic.isListening()) stopListening(); else startListening();
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
