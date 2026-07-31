/* Music Tools — shared microphone pitch-tracking controller. The Tuner,
   Fretboard Trainer, Vocal Range Finder and Sing-Back Ear Trainer each grew
   their own copy of the same getUserMedia -> AnalyserNode ->
   autoCorrelate() polling loop; this pulls that plumbing into one place for
   every tool built after it, starting with the Vocal Pitch Tuner and Song
   Key Finder. Depends on ../js/theory.js (window.MusicTheory) and
   ../js/pitch.js (window.PitchDetect) being loaded first.
   Exposes window.MicPitch. */
(function () {
  'use strict';

  var MT = window.MusicTheory;

  // opts:
  //   fftSize (default 2048), intervalMs (default 60) - detection tick rate
  //   silenceHoldMs (default 0) - once a match is heard, keep re-reporting
  //     it (with held=true) for this long after the mic goes quiet, instead
  //     of reporting silence immediately. 0 disables holding.
  //   a4, detune - passed through to MT.freqToNearestChromatic
  //   onMatch(match, held) - called every tick a pitch is detected. match:
  //     { freq, midi, name, octave, nearestFreq, cents } - cents is the
  //     detected freq's distance from the nearest chromatic note (not from
  //     any tool-specific target); tools wanting cents-off-target should
  //     compute it themselves from match.freq.
  //   onSilence() - called every tick with no pitch (after any hold expires)
  // Returns { start(onReady, onError), stop(), isListening(), getAudioContext() }.
  function create(opts) {
    opts = opts || {};
    var fftSize = opts.fftSize || 2048;
    var intervalMs = opts.intervalMs || 60;
    var silenceHoldMs = opts.silenceHoldMs || 0;
    var a4 = opts.a4 || 440;
    var detune = opts.detune || 0;
    var onMatch = opts.onMatch || function () {};
    var onSilence = opts.onSilence || function () {};

    var audioCtx = null, micStream = null, micSource = null, analyser = null, pitchBuffer = null, timer = null;
    var lastMatch = null, lastMatchTime = 0, listening = false;

    function tick() {
      if (!analyser) return;
      analyser.getFloatTimeDomainData(pitchBuffer);
      var freq = window.PitchDetect.autoCorrelate(pitchBuffer, audioCtx.sampleRate);

      if (freq === -1) {
        if (lastMatch && silenceHoldMs > 0 && performance.now() - lastMatchTime < silenceHoldMs) {
          onMatch(lastMatch, true);
          return;
        }
        lastMatch = null;
        onSilence();
        return;
      }

      var nearest = MT.freqToNearestChromatic(freq, a4, detune);
      var match = {
        freq: freq,
        midi: nearest.midi,
        name: nearest.name,
        octave: nearest.octave,
        nearestFreq: nearest.freq,
        cents: 1200 * Math.log2(freq / nearest.freq)
      };
      lastMatch = match;
      lastMatchTime = performance.now();
      onMatch(match, false);
    }

    function start(onReady, onError) {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (onError) onError(new Error('Microphone input is not supported in this browser.'));
        return;
      }
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!audioCtx) audioCtx = new AC();
      if (audioCtx.state === 'suspended') audioCtx.resume();

      navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
        .then(function (stream) {
          micStream = stream;
          micSource = audioCtx.createMediaStreamSource(stream);
          analyser = audioCtx.createAnalyser();
          analyser.fftSize = fftSize;
          micSource.connect(analyser);
          pitchBuffer = new Float32Array(analyser.fftSize);
          listening = true;
          timer = setInterval(tick, intervalMs);
          if (onReady) onReady();
        })
        .catch(function (err) { if (onError) onError(err); });
    }

    function stop() {
      listening = false;
      if (timer) { clearInterval(timer); timer = null; }
      if (micSource) { micSource.disconnect(); micSource = null; }
      if (micStream) { micStream.getTracks().forEach(function (t) { t.stop(); }); micStream = null; }
      analyser = null;
      lastMatch = null;
    }

    function isListening() { return listening; }
    function getAudioContext() { return audioCtx; }

    return { start: start, stop: stop, isListening: isListening, getAudioContext: getAudioContext };
  }

  window.MicPitch = { create: create };
})();
