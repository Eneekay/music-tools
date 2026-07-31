/* Song Key Finder — hum the lowest and highest notes of a phrase, get a
   suggested key. Captures your range the same way the Vocal Range Finder
   does (a stable-sample gate on top of the shared MicPitch controller in
   ../js/mic-pitch.js, so a note only extends the captured range once it's
   held for a few consecutive frames), but instead of classifying a voice
   type, it scores all 12 keys by how well a generic "typical melody" window
   centered on that key lines up with your phrase's range, and surfaces the
   best match plus its relative and parallel minors.

   The center-of-range heuristic (MELODIC_CENTER_OFFSET below) is a rule of
   thumb, not music theory law - the UI says so plainly, same as the Vocal
   Range Finder's own classification disclaimer. No external libraries. */
(function () {
  'use strict';

  var MT = window.MusicTheory;

  // Assumes a phrase's mid-range tends to sit around the 5th above the
  // tonic - a common center of gravity for pop/folk melodies. The "best"
  // key is whichever tonic places its 5th nearest the hummed range's
  // midpoint.
  var MELODIC_CENTER_OFFSET = 7;

  // Enharmonic spelling conventions, one flats flag per pitch class -
  // mirrors the same kind of table the Interval Ear Trainer and Backing
  // Track Generator use for their own key spelling.
  var MAJOR_FLATS = [false, true, false, true, false, false, false, false, true, false, true, false];
  var MINOR_FLATS = [true, false, true, true, false, true, false, true, false, false, true, false];

  var MIC_STABLE_SAMPLES = 3;
  var MIC_DETECTION_INTERVAL_MS = 60;
  var SILENCE_HOLD_MS = 3000;
  var MIN_SPAN_FOR_SUGGESTION = 3; // semitones - need at least this much range before suggesting

  function majorLabel(pc) { return MT.noteNameForPc(pc, MAJOR_FLATS[pc]); }
  function minorLabel(pc) { return MT.noteNameForPc(pc, MINOR_FLATS[pc]) + 'm'; }
  function relativeMinorPc(pc) { return (pc + 9) % 12; }

  function bestTonicPc(centerMidi) {
    return (((Math.round(centerMidi - MELODIC_CENTER_OFFSET)) % 12) + 12) % 12;
  }

  // Returns all 12 pitch classes with a 0 (best) to 6 (worst) fit distance
  // to the given range center, sorted best-first.
  function keyFitList(centerMidi) {
    var best = bestTonicPc(centerMidi);
    var list = [];
    for (var pc = 0; pc < 12; pc++) {
      var diff = Math.abs(pc - best);
      list.push({ pc: pc, distance: Math.min(diff, 12 - diff) });
    }
    list.sort(function (a, b) { return a.distance - b.distance; });
    return list;
  }

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

  var lastMatchTime = 0;
  var micLastMidi = null;
  var micStableCount = 0;

  /* =========================================================================
     DOM refs
     ========================================================================= */

  var skNoteEl = document.getElementById('skNote');
  var listenBtn = document.getElementById('listenBtn');
  var listenBtnLabel = document.getElementById('listenBtnLabel');
  var skStatusEl = document.getElementById('skStatus');

  var lowValueEl = document.getElementById('lowValue');
  var highValueEl = document.getElementById('highValue');
  var spanValueEl = document.getElementById('spanValue');
  var resetBtn = document.getElementById('resetBtn');

  var suggestionResultEl = document.getElementById('suggestionResult');
  var keyFitChartEl = document.getElementById('keyFitChart');

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
     Suggestion
     ========================================================================= */

  function currentSuggestion() {
    if (state.lowMidi === null || state.highMidi === null) return null;
    if (state.highMidi - state.lowMidi < MIN_SPAN_FOR_SUGGESTION) return null;
    var center = (state.lowMidi + state.highMidi) / 2;
    var fits = keyFitList(center);
    return { best: fits[0].pc, fits: fits };
  }

  function renderSuggestion() {
    var suggestion = currentSuggestion();
    if (!suggestion) {
      var span = (state.lowMidi !== null && state.highMidi !== null) ? state.highMidi - state.lowMidi : 0;
      suggestionResultEl.textContent = span > 0
        ? 'Keep going — hum a bit more of the phrase for a confident suggestion.'
        : 'Hum a bit of your phrase to get a suggested key.';
      renderKeyFitChart(null);
      return;
    }

    var best = suggestion.best;
    suggestionResultEl.innerHTML = 'Try it in <strong>' + majorLabel(best) + ' major</strong> ' +
      '(or its relative <strong>' + minorLabel(relativeMinorPc(best)) + '</strong>, or the parallel <strong>' + minorLabel(best) + '</strong>).';
    renderKeyFitChart(suggestion);
  }

  function renderKeyFitChart(suggestion) {
    keyFitChartEl.innerHTML = '';
    var maxDistance = 6;
    for (var pc = 0; pc < 12; pc++) {
      var isBest = !!suggestion && suggestion.best === pc;
      var distance = suggestion ? (suggestion.fits.filter(function (f) { return f.pc === pc; })[0].distance) : maxDistance;
      var fitPct = suggestion ? Math.round(((maxDistance - distance) / maxDistance) * 100) : 0;

      var row = document.createElement('div');
      row.className = 'key-fit-row' + (isBest ? ' is-match' : '');

      var label = document.createElement('span');
      label.className = 'key-fit-label';
      label.textContent = majorLabel(pc);
      row.appendChild(label);

      var track = document.createElement('div');
      track.className = 'key-fit-track';
      var bar = document.createElement('div');
      bar.className = 'key-fit-bar';
      bar.style.width = fitPct + '%';
      track.appendChild(bar);
      row.appendChild(track);

      keyFitChartEl.appendChild(row);
    }
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
      renderSuggestion();
    }
  }

  function resetRange() {
    state.lowMidi = null;
    state.highMidi = null;
    renderCapturedRange();
    renderSuggestion();
  }
  resetBtn.addEventListener('click', resetRange);

  /* =========================================================================
     Mic pitch tracking (shared controller)
     ========================================================================= */

  function setListenButtonState(listening) {
    listenBtn.classList.toggle('is-listening', listening);
    listenBtnLabel.textContent = listening ? 'Stop Listening' : 'Start Listening';
  }

  function showStatus(text, isError) {
    skStatusEl.textContent = text;
    skStatusEl.classList.toggle('is-error', !!isError);
  }

  function showIdleReadout() {
    skNoteEl.textContent = '–';
  }

  var mic = window.MicPitch.create({
    silenceHoldMs: SILENCE_HOLD_MS,
    intervalMs: MIC_DETECTION_INTERVAL_MS,
    onMatch: function (match, held) {
      state.currentMatch = match;
      skNoteEl.textContent = match.name + match.octave;
      if (held) return; // don't let a held-over reading during a brief silence re-trigger the stability gate

      if (match.midi === micLastMidi) micStableCount++;
      else { micLastMidi = match.midi; micStableCount = 1; }

      if (micStableCount >= MIC_STABLE_SAMPLES) extendRange(match.midi);
    },
    onSilence: function () {
      state.currentMatch = null;
      micLastMidi = null;
      micStableCount = 0;
      showIdleReadout();
    }
  });

  function startListening() {
    mic.start(
      function () {
        setListenButtonState(true);
        showStatus('Listening… hum the lowest and highest notes of your phrase.', false);
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
    showStatus('Tap Start, then hum the lowest and highest notes of your phrase — sing it as naturally feels comfortable.', false);
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
    if (e.key.toLowerCase() === 'r') { resetRange(); return; }
  });

  /* =========================================================================
     Init
     ========================================================================= */

  renderCapturedRange();
  renderSuggestion();
})();
