/* Music Tools — shared "realistic" instrument tone synthesis, used by both
   the Tuner and the Scale Finder as an extra option alongside the plain
   sine/triangle/sawtooth reference tones. No samples or external libraries:
   plucked strings (guitar/bass/ukulele/bouzouki) use the classic
   Karplus-Strong physical-modelling algorithm (a noise-seeded delay line
   that decays into a harmonically rich, naturally-damped pluck); the violin
   uses a slow-attack, vibrato'd tone to read as bowed rather than plucked.
   Exposes window.InstrumentTones. */
(function () {
  'use strict';

  var PLUCK_PARAMS = {
    guitar: { decay: 0.996, brightness: 0.55 },
    bass: { decay: 0.998, brightness: 0.32 },
    ukulele: { decay: 0.991, brightness: 0.78 },
    bouzouki: { decay: 0.995, brightness: 0.85 }
  };

  // A one-pole low-pass smooth over the noise burst that seeds the delay
  // line: lower brightness = softer, mellower pluck attack (nylon-strung
  // ukulele/classical feel); higher = brighter, more metallic (bouzouki).
  function makeExcitation(n, brightness) {
    var out = new Float32Array(n);
    var prev = 0;
    for (var i = 0; i < n; i++) {
      var raw = Math.random() * 2 - 1;
      prev = prev + brightness * (raw - prev);
      out[i] = prev;
    }
    return out;
  }

  function renderPluckBuffer(ctx, freq, duration, params) {
    var sampleRate = ctx.sampleRate;
    var totalSamples = Math.max(1, Math.floor(sampleRate * duration));
    var n = Math.max(2, Math.round(sampleRate / freq));
    var buffer = ctx.createBuffer(1, totalSamples, sampleRate);
    var data = buffer.getChannelData(0);

    var ring = makeExcitation(n, params.brightness);
    var idx = 0;
    for (var s = 0; s < totalSamples; s++) {
      var cur = ring[idx];
      var next = ring[(idx + 1) % n];
      data[s] = cur;
      ring[idx] = (cur + next) * 0.5 * params.decay;
      idx = (idx + 1) % n;
    }
    return buffer;
  }

  function playPlucked(ctx, dest, instrumentId, freq, time, gainLevel) {
    var params = PLUCK_PARAMS[instrumentId] || PLUCK_PARAMS.guitar;
    var duration = 1.3;
    var vol = Math.max(gainLevel, 0.001) * 0.75;

    function voice(f, level, delay) {
      var buffer = renderPluckBuffer(ctx, f, duration, params);
      var src = ctx.createBufferSource();
      src.buffer = buffer;
      var gain = ctx.createGain();
      var t0 = time + delay;
      gain.gain.setValueAtTime(level, t0);
      gain.gain.setValueAtTime(level, t0 + Math.max(duration - 0.08, 0.02));
      gain.gain.linearRampToValueAtTime(0.0001, t0 + duration);
      src.connect(gain); gain.connect(dest);
      src.start(t0);
    }

    voice(freq, vol, 0);
    if (instrumentId === 'bouzouki') {
      // courses on a bouzouki are paired strings (often an octave or unison
      // apart) - a second, very slightly detuned voice gives that shimmer.
      voice(freq * 1.004, vol * 0.7, 0.004);
    }
  }

  function playBowed(ctx, dest, freq, time, gainLevel) {
    var duration = 1.5;
    var vol = Math.max(gainLevel, 0.001) * 0.6;

    var osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);

    var vibrato = ctx.createOscillator();
    vibrato.frequency.value = 5.4;
    var vibratoGain = ctx.createGain();
    vibratoGain.gain.value = freq * 0.006;
    vibrato.connect(vibratoGain);
    vibratoGain.connect(osc.frequency);

    var filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq * 5 + 900;
    filter.Q.value = 0.6;

    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(vol, time + 0.14);
    gain.gain.setValueAtTime(vol, time + duration - 0.25);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    osc.connect(filter); filter.connect(gain); gain.connect(dest);
    osc.start(time); osc.stop(time + duration + 0.1);
    vibrato.start(time); vibrato.stop(time + duration + 0.1);
  }

  function playRealistic(ctx, dest, instrumentId, freq, time, gainLevel) {
    if (instrumentId === 'violin') {
      playBowed(ctx, dest, freq, time, gainLevel);
    } else {
      playPlucked(ctx, dest, instrumentId, freq, time, gainLevel);
    }
  }

  // A plain oscillator reference tone (sine/triangle/etc.) - for tools that
  // just need a clean, generic pitch rather than a modeled instrument, like
  // the vocal practice tools. opts: type (default 'sine'), duration in
  // seconds (default 1.2), gain (default 0.55), delay before ctx.currentTime
  // (default 0.03, to clear scheduling glitches). Returns the duration used,
  // same convention as the Tuner's own reference-tone helper.
  function playSimpleTone(ctx, dest, freq, opts) {
    opts = opts || {};
    var time = ctx.currentTime + (opts.delay !== undefined ? opts.delay : 0.03);
    var duration = opts.duration || 1.2;
    var vol = opts.gain !== undefined ? opts.gain : 0.55;

    var osc = ctx.createOscillator();
    osc.type = opts.type || 'sine';
    osc.frequency.setValueAtTime(freq, time);

    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(vol, 0.001), time + 0.03);
    gain.gain.setValueAtTime(Math.max(vol, 0.001), time + Math.max(duration - 0.3, 0.05));
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    osc.connect(gain); gain.connect(dest);
    osc.start(time); osc.stop(time + duration + 0.05);
    return duration;
  }

  window.InstrumentTones = {
    playRealistic: playRealistic,
    playSimpleTone: playSimpleTone
  };
})();
