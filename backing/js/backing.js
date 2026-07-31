/* Music Tools — Backing Track Generator. Combines the Drum Machine's kit
   synthesis + genre presets and the Chord Progression Randomizer's
   progression bank into one synced looping jam track, plus a new
   procedural Riff Generator (a constrained random walk over a chosen
   scale) for solo ideas. All three layers share one audio context, one
   master volume, and one Play/Stop transport. The drum and chord engines
   are self-contained copies of drums.js / progressions.js (per this
   codebase's per-tool convention — no cross-file dependency); the riff
   generator is new. No external libraries. Exposes nothing globally;
   wires up on load via the IIFE tail below. */
(function () {
  'use strict';

  var MT = window.MusicTheory;

  /* =========================================================================
     Drum synthesis — parametrized factories + six kits, copied from the
     Drum Machine.
     ========================================================================= */

  function makeNoiseBuffer(ctx, seconds) {
    var frames = Math.max(1, Math.round(ctx.sampleRate * seconds));
    var buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  var HAT_FREQS = [205.3, 304.4, 369.6, 522.7, 540, 800.5];

  function makeKick(p) {
    return function (ctx, dest, time) {
      var osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(p.startFreq, time);
      osc.frequency.exponentialRampToValueAtTime(p.endFreq, time + p.pitchDrop);
      var gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.exponentialRampToValueAtTime(p.peak, time + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + p.decay);
      osc.connect(gain); gain.connect(dest);
      osc.start(time); osc.stop(time + p.decay + 0.03);

      if (p.click > 0) {
        var click = ctx.createBufferSource();
        click.buffer = makeNoiseBuffer(ctx, 0.01);
        var hp = ctx.createBiquadFilter();
        hp.type = 'highpass'; hp.frequency.value = 2000;
        var cg = ctx.createGain();
        cg.gain.setValueAtTime(p.click, time);
        cg.gain.exponentialRampToValueAtTime(0.0001, time + 0.012);
        click.connect(hp); hp.connect(cg); cg.connect(dest);
        click.start(time); click.stop(time + 0.015);
      }
    };
  }

  function makeSnare(p) {
    return function (ctx, dest, time) {
      p.tones.forEach(function (pair) {
        var osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(pair[0], time);
        var g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, time);
        g.gain.exponentialRampToValueAtTime(pair[1], time + 0.002);
        g.gain.exponentialRampToValueAtTime(0.0001, time + p.toneDecay);
        osc.connect(g); g.connect(dest);
        osc.start(time); osc.stop(time + p.toneDecay + 0.02);
      });

      var noise = ctx.createBufferSource();
      noise.buffer = makeNoiseBuffer(ctx, p.noiseDecay + 0.02);
      var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = p.noiseHp;
      var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = p.noiseBp; bp.Q.value = p.noiseQ;
      var ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, time);
      ng.gain.exponentialRampToValueAtTime(p.noiseGain, time + 0.003);
      ng.gain.exponentialRampToValueAtTime(0.0001, time + p.noiseDecay);
      noise.connect(hp); hp.connect(bp); bp.connect(ng); ng.connect(dest);
      noise.start(time); noise.stop(time + p.noiseDecay + 0.02);
    };
  }

  function makeHat(p) {
    return function (ctx, dest, time) {
      var mix = ctx.createGain();
      var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = p.hp;
      var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = p.hp + 2000; bp.Q.value = 0.9;
      var envGain = ctx.createGain();
      var oscPeak = Math.max(p.peak * (1 - p.noiseMix), 0.0005);
      envGain.gain.setValueAtTime(0.0001, time);
      envGain.gain.exponentialRampToValueAtTime(oscPeak, time + 0.004);
      envGain.gain.exponentialRampToValueAtTime(0.0001, time + p.decay);

      HAT_FREQS.forEach(function (f) {
        var osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = f;
        osc.connect(mix);
        osc.start(time); osc.stop(time + p.decay + 0.02);
      });
      mix.connect(hp); hp.connect(bp); bp.connect(envGain); envGain.connect(dest);

      var noise = ctx.createBufferSource();
      noise.buffer = makeNoiseBuffer(ctx, p.decay + 0.02);
      var nhp = ctx.createBiquadFilter(); nhp.type = 'highpass'; nhp.frequency.value = p.hp + 2000;
      var ng = ctx.createGain();
      var noisePeak = Math.max(p.peak * p.noiseMix, 0.0005);
      ng.gain.setValueAtTime(0.0001, time);
      ng.gain.exponentialRampToValueAtTime(noisePeak, time + 0.003);
      ng.gain.exponentialRampToValueAtTime(0.0001, time + p.decay);
      noise.connect(nhp); nhp.connect(ng); ng.connect(dest);
      noise.start(time); noise.stop(time + p.decay + 0.02);
    };
  }

  function makeClap(p) {
    return function (ctx, dest, time) {
      for (var i = 0; i < p.bursts; i++) {
        var off = i * p.spacing;
        var noise = ctx.createBufferSource();
        noise.buffer = makeNoiseBuffer(ctx, p.burstDecay);
        var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = p.bp; bp.Q.value = p.q;
        var g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, time + off);
        g.gain.exponentialRampToValueAtTime(p.gain, time + off + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0001, time + off + p.burstDecay);
        noise.connect(bp); bp.connect(g); g.connect(dest);
        noise.start(time + off); noise.stop(time + off + p.burstDecay + 0.005);
      }

      var tStart = time + p.bursts * p.spacing;
      var tail = ctx.createBufferSource();
      tail.buffer = makeNoiseBuffer(ctx, p.tailDecay);
      var tbp = ctx.createBiquadFilter(); tbp.type = 'bandpass'; tbp.frequency.value = p.bp; tbp.Q.value = p.q * 0.9;
      var tg = ctx.createGain();
      tg.gain.setValueAtTime(0.0001, tStart);
      tg.gain.exponentialRampToValueAtTime(p.gain * 0.9, tStart + 0.004);
      tg.gain.exponentialRampToValueAtTime(0.0001, tStart + p.tailDecay);
      tail.connect(tbp); tbp.connect(tg); tg.connect(dest);
      tail.start(tStart); tail.stop(tStart + p.tailDecay + 0.01);
    };
  }

  function makeTom(baseFreq, ratio, decay, peak) {
    return function (ctx, dest, time) {
      var osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq, time);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * ratio, time + Math.min(0.16, decay * 0.5));
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(peak, time + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, time + decay);
      osc.connect(g); g.connect(dest);
      osc.start(time); osc.stop(time + decay + 0.02);
    };
  }

  function makeRim(p) {
    return function (ctx, dest, time) {
      var osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(p.toneFreq, time);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(p.gain, time + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, time + p.toneDecay);
      osc.connect(g); g.connect(dest);
      osc.start(time); osc.stop(time + p.toneDecay + 0.01);

      var noise = ctx.createBufferSource();
      noise.buffer = makeNoiseBuffer(ctx, p.noiseDecay);
      var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = p.noiseHp;
      var ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, time);
      ng.gain.exponentialRampToValueAtTime(p.gain * 0.6, time + 0.002);
      ng.gain.exponentialRampToValueAtTime(0.0001, time + p.noiseDecay);
      noise.connect(hp); hp.connect(ng); ng.connect(dest);
      noise.start(time); noise.stop(time + p.noiseDecay + 0.01);
    };
  }

  function makeCowbell(p) {
    return function (ctx, dest, time) {
      var mix = ctx.createGain();
      var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = p.bp; bp.Q.value = p.q;
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(p.gain, time + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, time + p.decay);
      p.freqs.forEach(function (f) {
        var osc = ctx.createOscillator();
        osc.type = 'square'; osc.frequency.value = f;
        osc.connect(mix);
        osc.start(time); osc.stop(time + p.decay + 0.02);
      });
      mix.connect(bp); bp.connect(g); g.connect(dest);
    };
  }

  function makeCrash(p) {
    return function (ctx, dest, time) {
      var mix = ctx.createGain();
      var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = p.hp;
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(p.peak * (1 - p.noiseMix), time + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, time + p.decay);
      HAT_FREQS.concat([1200, 1600]).forEach(function (f) {
        var osc = ctx.createOscillator();
        osc.type = 'square'; osc.frequency.value = f;
        osc.connect(mix);
        osc.start(time); osc.stop(time + p.decay + 0.05);
      });
      mix.connect(hp); hp.connect(g); g.connect(dest);

      var noise = ctx.createBufferSource();
      noise.buffer = makeNoiseBuffer(ctx, p.decay);
      var nhp = ctx.createBiquadFilter(); nhp.type = 'highpass'; nhp.frequency.value = p.hp + 1000;
      var ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, time);
      ng.gain.exponentialRampToValueAtTime(p.peak * p.noiseMix, time + 0.004);
      ng.gain.exponentialRampToValueAtTime(0.0001, time + p.decay);
      noise.connect(nhp); nhp.connect(ng); ng.connect(dest);
      noise.start(time); noise.stop(time + p.decay + 0.05);
    };
  }

  var KIT_DEFS = {
    tr808: {
      label: 'TR-808',
      blurb: 'Deep sine kick, buzzy synth snare, metallic square-wave hats and cowbell — the classic.',
      kick: { startFreq: 155, endFreq: 48, pitchDrop: 0.13, decay: 0.42, click: 0.35, peak: 0.95 },
      snare: { tones: [[180, 0.32], [330, 0.22]], toneDecay: 0.1, noiseHp: 900, noiseBp: 1800, noiseQ: 0.7, noiseDecay: 0.17, noiseGain: 0.55 },
      hatClosed: { decay: 0.07, peak: 0.32, hp: 7000, noiseMix: 0.35 },
      hatOpen: { decay: 0.38, peak: 0.28, hp: 7000, noiseMix: 0.35 },
      clap: { bursts: 3, spacing: 0.011, burstDecay: 0.02, tailDecay: 0.13, bp: 1500, q: 1.3, gain: 0.45 },
      tom: { ratio: 0.6, decay: 0.32, peak: 0.75 },
      rim: { toneFreq: 450, toneDecay: 0.045, noiseHp: 3000, noiseDecay: 0.025, gain: 0.5 },
      cowbell: { freqs: [587, 845], bp: 800, q: 2.2, decay: 0.28, gain: 0.42 },
      crash: { decay: 1.1, hp: 5000, peak: 0.4, noiseMix: 0.43 }
    },
    tr909: {
      label: 'TR-909',
      blurb: 'Punchier, brighter and noisier than the 808 — the sound of house and techno.',
      kick: { startFreq: 200, endFreq: 58, pitchDrop: 0.075, decay: 0.28, click: 0.55, peak: 0.98 },
      snare: { tones: [[190, 0.22], [340, 0.15]], toneDecay: 0.08, noiseHp: 700, noiseBp: 2000, noiseQ: 0.5, noiseDecay: 0.19, noiseGain: 0.75 },
      hatClosed: { decay: 0.06, peak: 0.34, hp: 6000, noiseMix: 0.6 },
      hatOpen: { decay: 0.35, peak: 0.3, hp: 6000, noiseMix: 0.6 },
      clap: { bursts: 4, spacing: 0.009, burstDecay: 0.018, tailDecay: 0.16, bp: 1700, q: 1.1, gain: 0.5 },
      tom: { ratio: 0.65, decay: 0.22, peak: 0.85 },
      rim: { toneFreq: 500, toneDecay: 0.035, noiseHp: 3500, noiseDecay: 0.02, gain: 0.55 },
      cowbell: { freqs: [600, 860], bp: 820, q: 2.0, decay: 0.22, gain: 0.4 },
      crash: { decay: 1.3, hp: 4500, peak: 0.42, noiseMix: 0.55 }
    },
    linndrum: {
      label: 'LinnDrum',
      blurb: 'Warmer and more natural-feeling — the sampled-drum sound behind countless 80s records.',
      kick: { startFreq: 170, endFreq: 70, pitchDrop: 0.05, decay: 0.24, click: 0.28, peak: 0.9 },
      snare: { tones: [[200, 0.3], [350, 0.25]], toneDecay: 0.12, noiseHp: 1000, noiseBp: 1600, noiseQ: 1.0, noiseDecay: 0.15, noiseGain: 0.5 },
      hatClosed: { decay: 0.05, peak: 0.3, hp: 8000, noiseMix: 0.7 },
      hatOpen: { decay: 0.3, peak: 0.27, hp: 8000, noiseMix: 0.7 },
      clap: { bursts: 3, spacing: 0.013, burstDecay: 0.022, tailDecay: 0.11, bp: 1400, q: 1.5, gain: 0.4 },
      tom: { ratio: 0.7, decay: 0.26, peak: 0.7 },
      rim: { toneFreq: 420, toneDecay: 0.05, noiseHp: 2800, noiseDecay: 0.03, gain: 0.45 },
      cowbell: { freqs: [560, 800], bp: 750, q: 1.8, decay: 0.3, gain: 0.38 },
      crash: { decay: 0.9, hp: 5500, peak: 0.35, noiseMix: 0.5 }
    },
    dmx: {
      label: 'Oberheim DMX',
      blurb: 'Huge, boomy kick and a cracky snare — the machine behind early hip-hop’s drum sound.',
      kick: { startFreq: 140, endFreq: 42, pitchDrop: 0.16, decay: 0.55, click: 0.2, peak: 1.0 },
      snare: { tones: [[170, 0.35], [300, 0.28]], toneDecay: 0.11, noiseHp: 850, noiseBp: 1500, noiseQ: 0.8, noiseDecay: 0.16, noiseGain: 0.6 },
      hatClosed: { decay: 0.06, peak: 0.3, hp: 6500, noiseMix: 0.55 },
      hatOpen: { decay: 0.32, peak: 0.27, hp: 6500, noiseMix: 0.55 },
      clap: { bursts: 3, spacing: 0.012, burstDecay: 0.02, tailDecay: 0.14, bp: 1300, q: 1.2, gain: 0.48 },
      tom: { ratio: 0.55, decay: 0.4, peak: 0.9 },
      rim: { toneFreq: 400, toneDecay: 0.055, noiseHp: 2600, noiseDecay: 0.032, gain: 0.5 },
      cowbell: { freqs: [540, 780], bp: 720, q: 1.9, decay: 0.32, gain: 0.4 },
      crash: { decay: 1.4, hp: 4200, peak: 0.45, noiseMix: 0.5 }
    },
    tr707: {
      label: 'TR-707',
      blurb: 'Tight, clean and bright — the crisp digital snap of mid-80s drum machines.',
      kick: { startFreq: 190, endFreq: 65, pitchDrop: 0.045, decay: 0.2, click: 0.5, peak: 0.85 },
      snare: { tones: [[210, 0.2], [380, 0.15]], toneDecay: 0.07, noiseHp: 1200, noiseBp: 2200, noiseQ: 0.9, noiseDecay: 0.12, noiseGain: 0.5 },
      hatClosed: { decay: 0.045, peak: 0.28, hp: 8500, noiseMix: 0.5 },
      hatOpen: { decay: 0.26, peak: 0.25, hp: 8500, noiseMix: 0.5 },
      clap: { bursts: 4, spacing: 0.008, burstDecay: 0.015, tailDecay: 0.1, bp: 1800, q: 1.0, gain: 0.42 },
      tom: { ratio: 0.68, decay: 0.18, peak: 0.65 },
      rim: { toneFreq: 520, toneDecay: 0.03, noiseHp: 3800, noiseDecay: 0.018, gain: 0.5 },
      cowbell: { freqs: [610, 880], bp: 830, q: 2.1, decay: 0.2, gain: 0.35 },
      crash: { decay: 0.7, hp: 6000, peak: 0.32, noiseMix: 0.45 }
    },
    cr78: {
      label: 'CR-78',
      blurb: 'Soft, vintage and a little lo-fi — Roland’s first CompuRhythm, mellow and analog.',
      kick: { startFreq: 130, endFreq: 60, pitchDrop: 0.07, decay: 0.22, click: 0.1, peak: 0.7 },
      snare: { tones: [[160, 0.25], [280, 0.15]], toneDecay: 0.09, noiseHp: 600, noiseBp: 1200, noiseQ: 0.6, noiseDecay: 0.14, noiseGain: 0.35 },
      hatClosed: { decay: 0.09, peak: 0.22, hp: 5000, noiseMix: 0.45 },
      hatOpen: { decay: 0.4, peak: 0.2, hp: 5000, noiseMix: 0.45 },
      clap: { bursts: 2, spacing: 0.015, burstDecay: 0.025, tailDecay: 0.09, bp: 1100, q: 1.6, gain: 0.3 },
      tom: { ratio: 0.75, decay: 0.2, peak: 0.55 },
      rim: { toneFreq: 380, toneDecay: 0.06, noiseHp: 2400, noiseDecay: 0.035, gain: 0.38 },
      cowbell: { freqs: [520, 750], bp: 700, q: 1.5, decay: 0.34, gain: 0.3 },
      crash: { decay: 0.8, hp: 4000, peak: 0.25, noiseMix: 0.35 }
    }
  };

  var KIT_ORDER = ['tr808', 'tr909', 'linndrum', 'dmx', 'tr707', 'cr78'];

  var KITS = {};
  KIT_ORDER.forEach(function (kitId) {
    var d = KIT_DEFS[kitId];
    KITS[kitId] = {
      kick: makeKick(d.kick),
      snare: makeSnare(d.snare),
      closedHat: makeHat(d.hatClosed),
      openHat: makeHat(d.hatOpen),
      clap: makeClap(d.clap),
      lowTom: makeTom(110, d.tom.ratio, d.tom.decay, d.tom.peak),
      midTom: makeTom(150, d.tom.ratio, d.tom.decay, d.tom.peak),
      hiTom: makeTom(200, d.tom.ratio, d.tom.decay, d.tom.peak),
      rim: makeRim(d.rim),
      cowbell: makeCowbell(d.cowbell),
      crash: makeCrash(d.crash)
    };
  });

  var TRACKS = [
    { id: 'kick', label: 'Kick' }, { id: 'snare', label: 'Snare' }, { id: 'clap', label: 'Clap' },
    { id: 'closedHat', label: 'Closed Hat' }, { id: 'openHat', label: 'Open Hat' },
    { id: 'lowTom', label: 'Low Tom' }, { id: 'midTom', label: 'Mid Tom' }, { id: 'hiTom', label: 'Hi Tom' },
    { id: 'rim', label: 'Rim' }, { id: 'cowbell', label: 'Cowbell' }, { id: 'crash', label: 'Crash' }
  ];

  // Drum patterns are always 16 steps (every preset below uses 16), so this
  // tool doesn't expose a step-count control the way the standalone Drum
  // Machine does - one less axis to keep in sync across three layers.
  var DRUM_STEPS = 16;

  var DRUM_PRESETS = [
    {
      id: 'house', label: 'House', genre: 'House', bpm: 124, kit: 'tr808',
      desc: 'Four-on-the-floor kick, off-beat hats, backbeat claps.',
      pattern: { kick: [0, 4, 8, 12], clap: [4, 12], closedHat: [2, 6, 10, 14] }
    },
    {
      id: 'techno', label: 'Techno', genre: 'Techno', bpm: 130, kit: 'tr909',
      desc: 'Driving four-on-the-floor with rolling 16th hats.',
      pattern: { kick: [0, 4, 8, 12], closedHat: [0, 1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15], openHat: [4, 12], rim: [12] }
    },
    {
      id: 'hiphop', label: 'Boom Bap Hip-Hop', genre: 'Hip-Hop', bpm: 90, kit: 'dmx',
      desc: 'Laid-back syncopated kick against a straight backbeat snare.',
      pattern: { kick: [0, 10], snare: [4, 12], closedHat: [0, 2, 4, 6, 8, 10, 12, 14] }
    },
    {
      id: 'gfunk', label: 'G-Funk', genre: 'G-Funk', bpm: 94, kit: 'linndrum',
      desc: 'A laid-back, syncopated West Coast groove.',
      pattern: { kick: [0, 6, 10], snare: [4, 12], rim: [3, 11], closedHat: [0, 2, 4, 6, 8, 10, 12, 14], openHat: [14] }
    },
    {
      id: 'rock', label: 'Rock', genre: 'Rock', bpm: 120, kit: 'linndrum',
      desc: 'Straight 8th hats over the standard 1-and-3 / 2-and-4 backbeat.',
      pattern: { kick: [0, 8], snare: [4, 12], closedHat: [0, 2, 4, 6, 8, 10, 12, 14] }
    },
    {
      id: 'funk', label: 'Funk', genre: 'Funk', bpm: 100, kit: 'linndrum',
      desc: 'Syncopated kick pushes, ghost-note rim hits, constant 16th hats.',
      pattern: { kick: [0, 3, 8, 11], snare: [4, 12], rim: [7, 15], closedHat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], openHat: [14] }
    },
    {
      id: 'reggae', label: 'Reggae (One Drop)', genre: 'Reggae', bpm: 76, kit: 'cr78',
      desc: 'Kick and snare land together on beat 3 only.',
      pattern: { kick: [8], snare: [8], closedHat: [2, 6, 10, 14] }
    },
    {
      id: 'disco', label: 'Disco', genre: 'Disco', bpm: 118, kit: 'tr707',
      desc: 'Four-on-the-floor kick, tight closed hat on the beat, open hat off-beat.',
      pattern: { kick: [0, 4, 8, 12], clap: [4, 12], closedHat: [0, 4, 8, 12], openHat: [2, 6, 10, 14] }
    }
  ];

  /* =========================================================================
     Chord synthesis + progression bank — copied from the Chord Progression
     Randomizer.
     ========================================================================= */

  var LETTER_SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  var MINOR_FLATS = [true, false, true, true, false, true, false, true, false, false, true, false];
  var KEY_LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  var KEY_ACCIDENTALS = [{ label: '♮', value: '' }, { label: '♭', value: 'b' }, { label: '♯', value: '#' }];

  var QUALITY_SUFFIX = {
    maj: '', min: 'm', dim: 'dim', aug: 'aug', maj7: 'maj7', m7: 'm7', dom7: '7',
    m7b5: 'm7b5', dim7: 'dim7', sus2: 'sus2', sus4: 'sus4'
  };
  var QUALITY_INTERVALS = {
    maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6], aug: [0, 4, 8],
    maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], dom7: [0, 4, 7, 10],
    m7b5: [0, 3, 6, 10], dim7: [0, 3, 6, 9], sus2: [0, 2, 7], sus4: [0, 5, 7]
  };

  function c(roman, semitone, quality) { return { roman: roman, semitone: semitone, quality: quality }; }

  var PROGRESSIONS = [
    { id: 'axis', name: 'Axis Progression (I–V–vi–IV)', mode: 'major',
      chords: [c('I', 0, 'maj'), c('V', 7, 'maj'), c('vi', 9, 'min'), c('IV', 5, 'maj')],
      desc: 'The four-chord backbone behind more pop hits than any other loop.' },
    { id: 'fifties', name: '50s Progression (I–vi–IV–V)', mode: 'major',
      chords: [c('I', 0, 'maj'), c('vi', 9, 'min'), c('IV', 5, 'maj'), c('V', 7, 'maj')],
      desc: 'The classic doo-wop turnaround — sweet and instantly familiar.' },
    { id: 'threeChord', name: 'Three-Chord Trick (I–IV–V)', mode: 'major',
      chords: [c('I', 0, 'maj'), c('IV', 5, 'maj'), c('V', 7, 'maj')],
      desc: 'The simplest progression that works.' },
    { id: 'liftoff', name: 'Lift-Off (IV–I–V–vi)', mode: 'major',
      chords: [c('IV', 5, 'maj'), c('I', 0, 'maj'), c('V', 7, 'maj'), c('vi', 9, 'min')],
      desc: 'Starting on the subdominant gives an instant sense of lift-off.' },
    { id: 'canon', name: 'Canon Progression', mode: 'major',
      chords: [c('I', 0, 'maj'), c('V', 7, 'maj'), c('vi', 9, 'min'), c('iii', 4, 'min'),
        c('IV', 5, 'maj'), c('I', 0, 'maj'), c('IV', 5, 'maj'), c('V', 7, 'maj')],
      desc: 'The descending-bass pattern behind Pachelbel’s Canon.' },
    { id: 'turnaround', name: 'Jazz Turnaround (I–vi–ii–V)', mode: 'major',
      chords: [c('I', 0, 'maj'), c('vi', 9, 'min'), c('ii', 2, 'min'), c('V', 7, 'maj')],
      desc: 'A smooth turnaround that cycles back to the top effortlessly.' },
    { id: 'twoFiveOne', name: 'ii–V–I', mode: 'major',
      chords: [c('ii7', 2, 'm7'), c('V7', 7, 'dom7'), c('Imaj7', 0, 'maj7')],
      desc: 'The single most common cadence in jazz.' },
    { id: 'bittersweetThree', name: 'I–iii–IV–V', mode: 'major',
      chords: [c('I', 0, 'maj'), c('iii', 4, 'min'), c('IV', 5, 'maj'), c('V', 7, 'maj')],
      desc: 'The iii chord casts a wistful shade before resolving upward.' },
    { id: 'drivingMajor', name: 'I–V–IV–V', mode: 'major',
      chords: [c('I', 0, 'maj'), c('V', 7, 'maj'), c('IV', 5, 'maj'), c('V', 7, 'maj')],
      desc: 'A relentless back-and-forth between tonic and dominant.' },
    { id: 'bluesyMajor', name: 'I–IV–I–V (Major Blues Skeleton)', mode: 'major',
      chords: [c('I7', 0, 'dom7'), c('IV7', 5, 'dom7'), c('I7', 0, 'dom7'), c('V7', 7, 'dom7')],
      desc: 'A stripped-down blues shuffle skeleton, all dominant sevenths.' },
    { id: 'gospelClimb', name: 'Gospel Climb (I–iii–vi–IV)', mode: 'major',
      chords: [c('I', 0, 'maj'), c('iii', 4, 'min'), c('vi', 9, 'min'), c('IV', 5, 'maj')],
      desc: 'A rising, soulful climb often heard in gospel and R&B.' },
    { id: 'funkVamp', name: 'Funk Vamp (I7–IV7)', mode: 'major',
      chords: [c('I7', 0, 'dom7'), c('IV7', 5, 'dom7')],
      desc: 'A two-chord dominant-7 vamp built for groove, not resolution.' },
    { id: 'frontPorch', name: 'Front Porch Roll (I–V–IV–I)', mode: 'major',
      chords: [c('I', 0, 'maj'), c('V', 7, 'maj'), c('IV', 5, 'maj'), c('I', 0, 'maj')],
      desc: 'Circles home by way of the dominant and subdominant.' },
    { id: 'reggaeSkank', name: 'Reggae Skank (I–V)', mode: 'major',
      chords: [c('I', 0, 'maj'), c('V', 7, 'maj')],
      desc: 'A simple two-chord skank — all about the offbeat rhythm.' },
    { id: 'loungeMajor7', name: 'Lounge Turnaround (Imaj7–vi7–ii7–V7)', mode: 'major',
      chords: [c('Imaj7', 0, 'maj7'), c('vi7', 9, 'm7'), c('ii7', 2, 'm7'), c('V7', 7, 'dom7')],
      desc: 'Full seventh-chord colors over the vi-ii-V turnaround.' },
    { id: 'hazySus', name: 'Hazy Suspension (Isus4–I–Vsus4–V)', mode: 'major',
      chords: [c('Isus4', 0, 'sus4'), c('I', 0, 'maj'), c('Vsus4', 7, 'sus4'), c('V', 7, 'maj')],
      desc: 'Suspended chords blur the major/minor line for a hazy openness.' },
    { id: 'twelveBar', name: '12-Bar Blues', mode: 'major',
      chords: [c('I7', 0, 'dom7'), c('I7', 0, 'dom7'), c('I7', 0, 'dom7'), c('I7', 0, 'dom7'),
        c('IV7', 5, 'dom7'), c('IV7', 5, 'dom7'), c('I7', 0, 'dom7'), c('I7', 0, 'dom7'),
        c('V7', 7, 'dom7'), c('IV7', 5, 'dom7'), c('I7', 0, 'dom7'), c('V7', 7, 'dom7')],
      desc: 'The single most important form in blues, early rock & roll, and jazz.' },
    { id: 'popPunk', name: 'Pop-Punk Charge (V–vi–IV–I)', mode: 'major',
      chords: [c('V', 7, 'maj'), c('vi', 9, 'min'), c('IV', 5, 'maj'), c('I', 0, 'maj')],
      desc: 'The Axis progression reordered to punch harder from the top.' },
    { id: 'epicMinor', name: 'Epic Minor (i–VI–III–VII)', mode: 'minor',
      chords: [c('i', 0, 'min'), c('VI', 8, 'maj'), c('III', 3, 'maj'), c('VII', 10, 'maj')],
      desc: 'A dramatic, ascending ‘epic trailer’ minor-key progression.' },
    { id: 'minorBlues', name: 'Minor Blues (i7–iv7–V7)', mode: 'minor',
      chords: [c('i7', 0, 'm7'), c('iv7', 5, 'm7'), c('V7', 7, 'dom7')],
      desc: 'The minor-key blues skeleton — dark, direct, reusable.' },
    { id: 'andalusian', name: 'Andalusian Cadence (i–VII–VI–V)', mode: 'minor',
      chords: [c('i', 0, 'min'), c('VII', 10, 'maj'), c('VI', 8, 'maj'), c('V', 7, 'maj')],
      desc: 'A descending stepwise bassline with flamenco and classical roots.' },
    { id: 'darkPop', name: 'Dark Pop Vamp (i–VI–VII)', mode: 'minor',
      chords: [c('i', 0, 'min'), c('VI', 8, 'maj'), c('VII', 10, 'maj')],
      desc: 'A brooding two-step vamp between the tonic and its major neighbors.' },
    { id: 'wistfulBallad', name: 'Wistful Ballad (i–v–VI–iv)', mode: 'minor',
      chords: [c('i', 0, 'min'), c('v', 7, 'min'), c('VI', 8, 'maj'), c('iv', 5, 'min')],
      desc: 'A gentle minor-key loop that never quite resolves.' },
    { id: 'metalDrive', name: 'Metal Drive (VI–VII–i)', mode: 'minor',
      chords: [c('VI', 8, 'maj'), c('VII', 10, 'maj'), c('i', 0, 'min')],
      desc: 'Charges upward into the tonic for a driving, unresolved riff loop.' },
    { id: 'harmonicCadence', name: 'Harmonic Minor Cadence (i–iv–V)', mode: 'minor',
      chords: [c('i', 0, 'min'), c('iv', 5, 'min'), c('V', 7, 'maj')],
      desc: 'The raised 7th turns V into a major chord for a dramatic pull.' },
    { id: 'minorTwoFiveOne', name: 'Minor ii–V–i', mode: 'minor',
      chords: [c('iiø', 2, 'm7b5'), c('V7', 7, 'dom7'), c('i', 0, 'min')],
      desc: 'The minor-key answer to ii-V-I, using a half-diminished ii.' },
    { id: 'soulfulMinor', name: 'Soulful Descent (i–III–VII–VI)', mode: 'minor',
      chords: [c('i', 0, 'min'), c('III', 3, 'maj'), c('VII', 10, 'maj'), c('VI', 8, 'maj')],
      desc: 'A soulful descending loop, popular in emotional R&B ballads.' },
    { id: 'reggaeMinor', name: 'Reggae Minor Skank (i–VII)', mode: 'minor',
      chords: [c('i', 0, 'min'), c('VII', 10, 'maj')],
      desc: 'A minor-key two-chord skank loop, moodier than its major cousin.' },
    { id: 'funkMinor', name: 'Minor Funk Pocket (i7–iv7)', mode: 'minor',
      chords: [c('i7', 0, 'm7'), c('iv7', 5, 'm7')],
      desc: 'A minor-key two-chord groove pocket — all pocket, no resolution.' },
    { id: 'neapolitan', name: 'Neapolitan Pull (i–♭II–V–i)', mode: 'minor',
      chords: [c('i', 0, 'min'), c('♭II', 1, 'maj'), c('V', 7, 'maj'), c('i', 0, 'min')],
      desc: 'The Neapolitan ♭II chord gives an unsettling half-step pull home.' }
  ];

  /* =========================================================================
     Custom chord-name parsing — a self-contained copy of the Chord Chart
     Generator / Capo & Key Transposer's parser (per this codebase's
     per-tool convention), used by "Type Your Own" mode and by each Song
     Structure section's chord sequence. Independent of the Progression
     Bank's roman-numeral system above: a typed chord is an absolute root +
     quality, not a scale degree relative to the selected key.
     ========================================================================= */

  var CHORD_QUALITIES = {
    '': { intervals: [0, 4, 7] }, 'maj': { intervals: [0, 4, 7] }, 'M': { intervals: [0, 4, 7] },
    'm': { intervals: [0, 3, 7] }, 'min': { intervals: [0, 3, 7] }, '-': { intervals: [0, 3, 7] },
    '5': { intervals: [0, 7] },
    'dim': { intervals: [0, 3, 6] }, 'dim7': { intervals: [0, 3, 6, 9] }, 'm7b5': { intervals: [0, 3, 6, 10] },
    'aug': { intervals: [0, 4, 8] }, '+': { intervals: [0, 4, 8] },
    'sus2': { intervals: [0, 2, 7] }, 'sus4': { intervals: [0, 5, 7] }, 'sus': { intervals: [0, 5, 7] },
    '6': { intervals: [0, 4, 7, 9] }, 'maj6': { intervals: [0, 4, 7, 9] }, 'm6': { intervals: [0, 3, 7, 9] }, 'min6': { intervals: [0, 3, 7, 9] },
    '7': { intervals: [0, 4, 7, 10] }, '7sus4': { intervals: [0, 5, 7, 10] }, '7sus2': { intervals: [0, 2, 7, 10] },
    '7b5': { intervals: [0, 4, 6, 10] }, '7#5': { intervals: [0, 4, 8, 10] }, '7b9': { intervals: [0, 4, 7, 10, 13] }, '7#9': { intervals: [0, 4, 7, 10, 15] },
    'maj7': { intervals: [0, 4, 7, 11] }, 'M7': { intervals: [0, 4, 7, 11] },
    'm7': { intervals: [0, 3, 7, 10] }, 'min7': { intervals: [0, 3, 7, 10] },
    'mmaj7': { intervals: [0, 3, 7, 11] }, 'mM7': { intervals: [0, 3, 7, 11] },
    '9': { intervals: [0, 4, 7, 10, 14] }, 'maj9': { intervals: [0, 4, 7, 11, 14] }, 'm9': { intervals: [0, 3, 7, 10, 14] },
    'add9': { intervals: [0, 4, 7, 14] }, 'madd9': { intervals: [0, 3, 7, 14] },
    '11': { intervals: [0, 4, 7, 10, 14, 17] }, 'm11': { intervals: [0, 3, 7, 10, 14, 17] },
    '13': { intervals: [0, 4, 7, 10, 14, 17, 21] }, 'maj13': { intervals: [0, 4, 7, 11, 14, 17, 21] }
  };

  function parseChordToken(raw) {
    if (!raw) return null;
    var input = raw.trim().replace(/\s+/g, '').replace(/♭/g, 'b').replace(/♯/g, '#');
    if (!input) return null;

    var m = /^([A-Ga-g])([#b]?)([^\/]*)(?:\/([A-Ga-g])([#b]?))?$/.exec(input);
    if (!m) return null;

    var rootLetter = m[1].toUpperCase();
    var rootAcc = m[2] || '';
    var qualityRaw = m[3] || '';
    var bassLetter = m[4] ? m[4].toUpperCase() : null;
    var bassAcc = m[5] || '';

    var quality = CHORD_QUALITIES[qualityRaw];
    if (!quality) return null;

    var rootPc = (((LETTER_SEMITONE[rootLetter] + (rootAcc === '#' ? 1 : rootAcc === 'b' ? -1 : 0)) % 12) + 12) % 12;
    var bassPc = bassLetter !== null ? (((LETTER_SEMITONE[bassLetter] + (bassAcc === '#' ? 1 : bassAcc === 'b' ? -1 : 0)) % 12) + 12) % 12 : null;

    return {
      rootPc: rootPc,
      intervals: quality.intervals,
      bassPc: bassPc,
      display: rootLetter + rootAcc + qualityRaw + (bassLetter ? '/' + bassLetter + bassAcc : '')
    };
  }

  // Splits on whitespace / commas / pipes, same separators the Capo & Key
  // Transposer accepts. Returns { chords: [{display, tones}], badTokens } so
  // callers can surface which tokens failed to parse instead of silently
  // dropping them.
  function parseChordSequenceText(raw) {
    var tokens = (raw || '').trim().split(/[\s,|]+/).filter(Boolean);
    var chords = [];
    var badTokens = [];
    tokens.forEach(function (tok) {
      var parsed = parseChordToken(tok);
      if (!parsed) { badTokens.push(tok); return; }
      var rootMidi = 48 + parsed.rootPc;
      var tones = parsed.intervals.map(function (iv) { return rootMidi + iv; });
      if (parsed.bassPc !== null) tones = [36 + parsed.bassPc].concat(tones);
      chords.push({ display: parsed.display, tones: tones });
    });
    return { chords: chords, badTokens: badTokens };
  }

  /* =========================================================================
     Riff generator — a constrained random walk over a chosen scale's
     degrees, biased toward stepwise motion and resolving to a stable tone.
     New for this tool (not a copy of anything else).
     ========================================================================= */

  var RIFF_SCALES = [
    { id: 'majorPentatonic', label: 'Major Pentatonic', intervals: [0, 2, 4, 7, 9] },
    { id: 'minorPentatonic', label: 'Minor Pentatonic', intervals: [0, 3, 5, 7, 10] },
    { id: 'blues', label: 'Blues', intervals: [0, 3, 5, 6, 7, 10] },
    { id: 'major', label: 'Major (Ionian)', intervals: [0, 2, 4, 5, 7, 9, 11] },
    { id: 'naturalMinor', label: 'Natural Minor (Aeolian)', intervals: [0, 2, 3, 5, 7, 8, 10] },
    { id: 'dorian', label: 'Dorian', intervals: [0, 2, 3, 5, 7, 9, 10] },
    { id: 'mixolydian', label: 'Mixolydian', intervals: [0, 2, 4, 5, 7, 9, 10] }
  ];

  function extendedDegrees(intervals) {
    var out = [];
    for (var o = -1; o <= 1; o++) intervals.forEach(function (iv) { out.push(iv + o * 12); });
    return out;
  }

  function generateRiff() {
    var scale = RIFF_SCALES.filter(function (s) { return s.id === state.riffScaleId; })[0] || RIFF_SCALES[0];
    var degrees = extendedDegrees(scale.intervals);
    var centerIdx = scale.intervals.length; // offset 0 = root, in the middle octave span
    var steps = DRUM_STEPS;

    var onsetSteps = [0];
    for (var s = 1; s < steps; s++) {
      var strong = (s % (steps / 4)) === 0;
      if (Math.random() < (strong ? 0.7 : 0.38)) onsetSteps.push(s);
    }

    var idx = centerIdx;
    var notes = onsetSteps.map(function (s, i) {
      if (i === 0) {
        idx = centerIdx;
      } else {
        var r = Math.random();
        var move = r < 0.55 ? 1 : r < 0.85 ? 2 : 3;
        if (Math.random() < 0.5) move = -move;
        idx = Math.max(0, Math.min(degrees.length - 1, idx + move));
      }
      if (i === onsetSteps.length - 1) {
        var roots = [0, scale.intervals.length, scale.intervals.length * 2];
        idx = roots.reduce(function (best, cand) { return Math.abs(cand - idx) < Math.abs(best - idx) ? cand : best; });
      }
      return { step: s, semitoneFromRoot: degrees[idx] };
    });

    state.currentRiff = { scaleId: scale.id, notes: notes };
  }

  /* =========================================================================
     Backing Track presets — pairs a drum preset + a chord progression +
     tempo + key + a suggested riff scale into one cohesive genre combo.
     ========================================================================= */

  var BACKING_PRESETS = [
    { id: 'houseJam', label: 'House Jam', genre: 'House', tempo: 124, drumPresetId: 'house', progressionId: 'axis', riffScaleId: 'majorPentatonic', keyLetter: 'C', keyAccidental: '',
      desc: 'Four-on-the-floor house under a warm, uplifting pop progression.' },
    { id: 'bluesShuffle', label: 'Blues Shuffle', genre: 'Blues', tempo: 100, drumPresetId: 'funk', progressionId: 'twelveBar', riffScaleId: 'blues', keyLetter: 'A', keyAccidental: '',
      desc: 'A classic 12-bar blues form over a laid-back pocket — built for soloing.' },
    { id: 'popBallad', label: 'Pop Ballad', genre: 'Pop', tempo: 96, drumPresetId: 'rock', progressionId: 'fifties', riffScaleId: 'majorPentatonic', keyLetter: 'G', keyAccidental: '',
      desc: 'The doo-wop turnaround over a gentle beat — sweet and singable.' },
    { id: 'rockAnthem', label: 'Rock Anthem', genre: 'Rock', tempo: 120, drumPresetId: 'rock', progressionId: 'liftoff', riffScaleId: 'minorPentatonic', keyLetter: 'E', keyAccidental: '',
      desc: 'A driving rock beat under an anthemic lift-off progression.' },
    { id: 'reggaeGroove', label: 'Reggae Groove', genre: 'Reggae', tempo: 76, drumPresetId: 'reggae', progressionId: 'reggaeSkank', riffScaleId: 'minorPentatonic', keyLetter: 'D', keyAccidental: '',
      desc: 'One-drop drums with the classic reggae skank progression.' },
    { id: 'jazzLounge', label: 'Jazz Lounge', genre: 'Jazz', tempo: 92, drumPresetId: 'hiphop', progressionId: 'loungeMajor7', riffScaleId: 'dorian', keyLetter: 'F', keyAccidental: '',
      desc: 'A laid-back boom-bap pocket under a smooth seventh-chord turnaround.' },
    { id: 'metalDrive', label: 'Metal Drive', genre: 'Metal', tempo: 145, drumPresetId: 'rock', progressionId: 'metalDrive', riffScaleId: 'minorPentatonic', keyLetter: 'E', keyAccidental: '',
      desc: 'A driving beat under a charging minor-key riff progression.' },
    { id: 'funkJam', label: 'Funk Jam', genre: 'Funk', tempo: 100, drumPresetId: 'funk', progressionId: 'funkVamp', riffScaleId: 'minorPentatonic', keyLetter: 'B', keyAccidental: 'b',
      desc: 'A tight funk groove with a two-chord dominant vamp to lock into.' }
  ];

  /* =========================================================================
     State
     ========================================================================= */

  function emptyDrumPattern() {
    var pat = {};
    TRACKS.forEach(function (t) { pat[t.id] = new Array(DRUM_STEPS).fill(false); });
    return pat;
  }

  var state = {
    bpm: 124,
    masterVolume: 0.85,
    isPlaying: false,

    kit: 'tr808',
    drumPattern: emptyDrumPattern(),
    currentDrumPreset: null,

    keyLetter: 'C', keyAccidental: '', keyPc: 0, keyFlats: false,
    mode: 'major',
    chordWaveform: 'triangle',
    currentProgression: null,

    // 'bank' (Progression Bank, roman-numeral, key-relative), 'custom'
    // (one typed absolute chord sequence), or 'structure' (named sections,
    // each with its own typed chords + bar length, arranged into a song).
    chordMode: 'bank',
    customChordsText: 'C G Am F',
    customChordsError: null,
    sections: [
      { id: 's1', name: 'Intro', chordsText: 'C G', bars: 4 },
      { id: 's2', name: 'Verse', chordsText: 'Am F C G', bars: 8 },
      { id: 's3', name: 'Chorus', chordsText: 'F C G Am', bars: 8 },
      { id: 's4', name: 'Bridge', chordsText: 'Dm Em F G', bars: 4 }
    ],
    arrangement: ['s1', 's2', 's3', 's2', 's3', 's4', 's3'],
    structureLoop: true,
    nextSectionId: 4,
    activeChordSequence: [], // resolved flat [{display, tones, beats, sectionName, roman}], recomputed by refreshChordSequence()

    riffEnabled: true,
    riffScaleId: 'majorPentatonic',
    riffWaveform: 'sawtooth',
    currentRiff: null
  };

  /* =========================================================================
     DOM refs
     ========================================================================= */

  var playBtn = document.getElementById('playBtn');
  var playBtnLabel = document.getElementById('playBtnLabel');
  var bpmInput = document.getElementById('bpmInput');
  var bpmSlider = document.getElementById('bpmSlider');
  var bpmDown = document.getElementById('bpmDown');
  var bpmUp = document.getElementById('bpmUp');
  var volumeSlider = document.getElementById('volumeSlider');

  var backingPresetListEl = document.getElementById('backingPresetList');

  var kitSelectEl = document.getElementById('kitSelect');
  var kitBlurbEl = document.getElementById('kitBlurb');
  var drumPresetSelectEl = document.getElementById('drumPresetSelect');
  var shuffleDrumBtn = document.getElementById('shuffleDrumBtn');
  var drumNameEl = document.getElementById('drumName');
  var drumDescEl = document.getElementById('drumDesc');

  var keyNoteChipsEl = document.getElementById('keyNoteChips');
  var keyAccidentalChipsEl = document.getElementById('keyAccidentalChips');
  var modeControlEl = document.getElementById('modeControl');
  var progressionSelectEl = document.getElementById('progressionSelect');
  var shuffleProgressionBtn = document.getElementById('shuffleProgressionBtn');
  var progressionNameEl = document.getElementById('progressionName');
  var progressionDescEl = document.getElementById('progressionDesc');
  var chordStripEl = document.getElementById('chordStrip');
  var chordWaveControlEl = document.getElementById('chordWaveControl');

  var chordModeControlEl = document.getElementById('chordModeControl');
  var chordBankPanelEl = document.getElementById('chordBankPanel');
  var chordCustomPanelEl = document.getElementById('chordCustomPanel');
  var customChordsInputEl = document.getElementById('customChordsInput');
  var customChordsErrorEl = document.getElementById('customChordsError');
  var structureNoteEl = document.getElementById('structureNote');
  var structureWidgetEl = document.getElementById('structureWidget');
  var sectionListEl = document.getElementById('sectionList');
  var sectionCountInputEl = document.getElementById('sectionCountInput');
  var arrangementPaletteEl = document.getElementById('arrangementPalette');
  var arrangementStripEl = document.getElementById('arrangementStrip');
  var clearArrangementBtn = document.getElementById('clearArrangementBtn');
  var structureSummaryEl = document.getElementById('structureSummary');
  var structureLoopControlEl = document.getElementById('structureLoopControl');

  var riffEnabledControlEl = document.getElementById('riffEnabledControl');
  var riffScaleSelectEl = document.getElementById('riffScaleSelect');
  var riffWaveControlEl = document.getElementById('riffWaveControl');
  var newRiffBtn = document.getElementById('newRiffBtn');
  var previewRiffBtn = document.getElementById('previewRiffBtn');
  var riffStripEl = document.getElementById('riffStrip');

  /* =========================================================================
     Chord helpers
     ========================================================================= */

  function effectiveFlats() {
    return state.mode === 'minor' ? MINOR_FLATS[state.keyPc] : state.keyFlats;
  }

  function chordName(chord) {
    var rootPc = ((state.keyPc + chord.semitone) % 12 + 12) % 12;
    var flats = chord.semitone === 0 ? state.keyFlats : effectiveFlats();
    return MT.noteNameForPc(rootPc, flats) + QUALITY_SUFFIX[chord.quality];
  }

  function chordMidiTones(chord) {
    var rootPc = ((state.keyPc + chord.semitone) % 12 + 12) % 12;
    var rootMidi = 48 + rootPc;
    return QUALITY_INTERVALS[chord.quality].map(function (iv) { return rootMidi + iv; });
  }

  /* =========================================================================
     Riff helpers
     ========================================================================= */

  function riffBaseMidi() { return 60 + state.keyPc; }
  function riffMidiFor(note) { return riffBaseMidi() + note.semitoneFromRoot; }
  function riffNoteName(note) {
    var pc = ((state.keyPc + note.semitoneFromRoot) % 12 + 12) % 12;
    return MT.noteNameForPc(pc, effectiveFlats());
  }

  /* =========================================================================
     Rendering
     ========================================================================= */

  function renderChordChips() {
    chordStripEl.innerHTML = '';
    var seq = state.activeChordSequence;
    if (!seq.length) {
      var empty = document.createElement('p');
      empty.className = 'chord-strip-empty';
      empty.textContent = state.chordMode === 'structure' ? 'Add sections to your arrangement to hear a progression.' : 'No progression loaded.';
      chordStripEl.appendChild(empty);
      return;
    }
    var lastSection;
    seq.forEach(function (chord, idx) {
      if (state.chordMode === 'structure' && chord.sectionName !== lastSection) {
        lastSection = chord.sectionName;
        var label = document.createElement('span');
        label.className = 'chord-strip-section-label';
        label.textContent = chord.sectionName;
        chordStripEl.appendChild(label);
      }
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chord-chip';
      chip.dataset.index = String(idx);
      if (chord.roman) {
        var roman = document.createElement('span');
        roman.className = 'chord-chip-roman';
        roman.textContent = chord.roman;
        chip.appendChild(roman);
      }
      var name = document.createElement('span');
      name.className = 'chord-chip-name';
      name.textContent = chord.display;
      chip.appendChild(name);
      chip.addEventListener('click', function () { previewChordAt(idx); });
      chordStripEl.appendChild(chip);
    });
  }

  /* =========================================================================
     Chord-sequence resolution — unifies all three chord sources
     (Progression Bank, Type Your Own, Song Structure) into one flat
     [{display, tones, beats, sectionName, roman}] array that the chip strip,
     the preview-on-click handler and the playback scheduler all read from,
     so none of them need to know which mode produced it.
     ========================================================================= */

  function buildChordSequence() {
    if (state.chordMode === 'custom') {
      var parsed = parseChordSequenceText(state.customChordsText);
      state.customChordsError = parsed.badTokens.length ? 'Couldn’t read: ' + parsed.badTokens.join(', ') : null;
      return parsed.chords.map(function (ch) { return { display: ch.display, tones: ch.tones, beats: 2 }; });
    }

    if (state.chordMode === 'structure') {
      var flat = [];
      state.arrangement.forEach(function (sectionId) {
        var section = state.sections.filter(function (s) { return s.id === sectionId; })[0];
        if (!section) return;
        var parsedSection = parseChordSequenceText(section.chordsText);
        if (!parsedSection.chords.length) return;
        var bars = Math.max(1, section.bars || 1);
        var beatsPerChord = (bars * 4) / parsedSection.chords.length;
        parsedSection.chords.forEach(function (ch) {
          flat.push({ display: ch.display, tones: ch.tones, beats: beatsPerChord, sectionName: section.name });
        });
      });
      return flat;
    }

    // 'bank'
    if (!state.currentProgression) return [];
    return state.currentProgression.chords.map(function (chord) {
      return { display: chordName(chord), tones: chordMidiTones(chord), beats: 2, roman: chord.roman };
    });
  }

  function refreshChordSequence() {
    state.activeChordSequence = buildChordSequence();
    renderChordChips();
    renderCustomChordsError();
    renderStructureSummary();
  }

  function renderCustomChordsError() {
    if (state.chordMode !== 'custom' || !state.customChordsError) { customChordsErrorEl.hidden = true; return; }
    customChordsErrorEl.textContent = state.customChordsError;
    customChordsErrorEl.hidden = false;
  }

  function renderStructureSummary() {
    if (state.chordMode !== 'structure') return;
    if (!state.arrangement.length) {
      structureSummaryEl.textContent = 'Add sections to the arrangement to build your song.';
      return;
    }
    var totalBars = 0;
    state.arrangement.forEach(function (sectionId) {
      var section = state.sections.filter(function (s) { return s.id === sectionId; })[0];
      if (section) totalBars += Math.max(1, section.bars || 1);
    });
    var totalSeconds = totalBars * (60 / state.bpm) * 4;
    var mins = Math.floor(totalSeconds / 60);
    var secs = Math.round(totalSeconds % 60);
    structureSummaryEl.textContent = state.arrangement.length + ' sections · ' + totalBars + ' bars · ~' +
      mins + ':' + (secs < 10 ? '0' : '') + secs + ' per loop at ' + state.bpm + ' BPM';
  }

  /* =========================================================================
     Song Structure editor — sections list + arrangement builder
     ========================================================================= */

  function findSection(id) { return state.sections.filter(function (s) { return s.id === id; })[0] || null; }

  function renderSectionList() {
    sectionCountInputEl.value = String(state.sections.length);
    sectionListEl.innerHTML = '';
    state.sections.forEach(function (section) {
      var row = document.createElement('div');
      row.className = 'section-row';

      var nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'section-name-input';
      nameInput.value = section.name;
      nameInput.setAttribute('aria-label', 'Section name');
      nameInput.addEventListener('input', function () {
        section.name = nameInput.value;
        renderArrangementPalette();
        renderArrangementStrip();
        refreshChordSequence();
      });

      var chordsInput = document.createElement('input');
      chordsInput.type = 'text';
      chordsInput.className = 'section-chords-input';
      chordsInput.value = section.chordsText;
      chordsInput.placeholder = 'e.g. Am F C G';
      chordsInput.setAttribute('aria-label', 'Section chords');
      chordsInput.addEventListener('input', function () {
        section.chordsText = chordsInput.value;
        refreshChordSequence();
      });

      var barsField = document.createElement('div');
      barsField.className = 'section-bars-field';
      var barsInput = document.createElement('input');
      barsInput.type = 'number';
      barsInput.className = 'section-bars-input';
      barsInput.min = '1';
      barsInput.max = '64';
      barsInput.value = String(section.bars);
      barsInput.setAttribute('aria-label', 'Bars');
      barsInput.addEventListener('input', function () {
        var v = parseInt(barsInput.value, 10);
        section.bars = isNaN(v) ? section.bars : Math.max(1, Math.min(64, v));
        refreshChordSequence();
      });
      var barsLabel = document.createElement('span');
      barsLabel.className = 'section-bars-label';
      barsLabel.textContent = 'bars';
      barsField.appendChild(barsInput);
      barsField.appendChild(barsLabel);

      var removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'section-remove-btn';
      removeBtn.setAttribute('aria-label', 'Remove section');
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', function () { removeSection(section.id); });

      row.appendChild(nameInput);
      row.appendChild(chordsInput);
      row.appendChild(barsField);
      row.appendChild(removeBtn);
      sectionListEl.appendChild(row);
    });
  }

  // Grows or shrinks state.sections to match the requested count - the
  // "how many song parts?" step of the flow, ahead of naming each one and
  // dragging them into an arrangement.
  function setSectionCount(n) {
    n = Math.max(1, Math.min(12, isNaN(n) ? state.sections.length : n));
    while (state.sections.length < n) {
      state.nextSectionId++;
      state.sections.push({ id: 's' + state.nextSectionId, name: 'Part ' + state.sections.length + 1, chordsText: 'C G Am F', bars: 4 });
    }
    while (state.sections.length > n) {
      var removed = state.sections.pop();
      state.arrangement = state.arrangement.filter(function (sid) { return sid !== removed.id; });
    }
    renderSectionList();
    renderArrangementPalette();
    renderArrangementStrip();
    refreshChordSequence();
  }

  function removeSection(id) {
    state.sections = state.sections.filter(function (s) { return s.id !== id; });
    state.arrangement = state.arrangement.filter(function (sid) { return sid !== id; });
    renderSectionList();
    renderArrangementPalette();
    renderArrangementStrip();
    refreshChordSequence();
  }

  /* =========================================================================
     Arrangement drag-and-drop — drag a part from the palette into the song,
     or drag a placed chip to reorder it; click still works as a simpler
     append/remove fallback (touch devices and keyboard users don't get
     native HTML5 drag-and-drop for free). The actual list-splicing math is
     factored out into insertIntoArrangement() so it's testable without a
     real drag gesture or getBoundingClientRect().
     ========================================================================= */

  var dragState = { sourceType: null, sourceId: null, sourceIndex: null };

  function insertIntoArrangement(arrangement, sourceType, sourceId, sourceIndex, dropIndex) {
    var next = arrangement.slice();
    if (sourceType === 'palette') {
      next.splice(dropIndex, 0, sourceId);
    } else if (sourceType === 'arrangement') {
      var moved = next.splice(sourceIndex, 1)[0];
      var adjusted = dropIndex > sourceIndex ? dropIndex - 1 : dropIndex;
      next.splice(adjusted, 0, moved);
    }
    return next;
  }

  function computeDropIndex(clientX) {
    var chips = Array.prototype.slice.call(arrangementStripEl.querySelectorAll('.arrangement-chip'));
    for (var i = 0; i < chips.length; i++) {
      var rect = chips[i].getBoundingClientRect();
      if (clientX < rect.left + rect.width / 2) return i;
    }
    return chips.length;
  }

  function renderArrangementPalette() {
    arrangementPaletteEl.innerHTML = '';
    if (!state.sections.length) {
      var empty = document.createElement('p');
      empty.className = 'arrangement-strip-empty';
      empty.textContent = 'Add a section first.';
      arrangementPaletteEl.appendChild(empty);
      return;
    }
    state.sections.forEach(function (section) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'arrangement-chip';
      chip.textContent = section.name;
      chip.title = 'Drag into the song, or click to add it to the end';
      chip.draggable = true;
      chip.addEventListener('dragstart', function (e) {
        dragState = { sourceType: 'palette', sourceId: section.id, sourceIndex: null };
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
      });
      chip.addEventListener('click', function () {
        state.arrangement.push(section.id);
        renderArrangementStrip();
        refreshChordSequence();
      });
      arrangementPaletteEl.appendChild(chip);
    });
  }

  function renderArrangementStrip() {
    arrangementStripEl.innerHTML = '';
    if (!state.arrangement.length) {
      var empty = document.createElement('p');
      empty.className = 'arrangement-strip-empty';
      empty.textContent = 'Your song is empty — drag or click sections above to build it.';
      arrangementStripEl.appendChild(empty);
      return;
    }
    state.arrangement.forEach(function (sectionId, idx) {
      var section = findSection(sectionId);
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'arrangement-chip arrangement-chip--placed';
      chip.textContent = section ? section.name : '?';
      chip.title = 'Drag to reorder, or click to remove';
      chip.draggable = true;
      chip.addEventListener('dragstart', function (e) {
        dragState = { sourceType: 'arrangement', sourceId: null, sourceIndex: idx };
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
        chip.classList.add('is-dragging');
      });
      chip.addEventListener('dragend', function () { chip.classList.remove('is-dragging'); });
      chip.addEventListener('click', function () {
        state.arrangement.splice(idx, 1);
        renderArrangementStrip();
        refreshChordSequence();
      });
      arrangementStripEl.appendChild(chip);
    });
  }

  arrangementStripEl.addEventListener('dragover', function (e) {
    if (!dragState.sourceType) return;
    e.preventDefault();
    arrangementStripEl.classList.add('is-drag-over');
  });
  arrangementStripEl.addEventListener('dragleave', function () { arrangementStripEl.classList.remove('is-drag-over'); });
  arrangementStripEl.addEventListener('drop', function (e) {
    if (!dragState.sourceType) return;
    e.preventDefault();
    arrangementStripEl.classList.remove('is-drag-over');
    var dropIndex = computeDropIndex(e.clientX);
    state.arrangement = insertIntoArrangement(state.arrangement, dragState.sourceType, dragState.sourceId, dragState.sourceIndex, dropIndex);
    dragState = { sourceType: null, sourceId: null, sourceIndex: null };
    renderArrangementStrip();
    refreshChordSequence();
  });

  function setChordMode(mode) {
    state.chordMode = mode;
    chordModeControlEl.querySelectorAll('button').forEach(function (b) { b.classList.toggle('is-active', b.dataset.value === mode); });
    chordBankPanelEl.hidden = mode !== 'bank';
    chordCustomPanelEl.hidden = mode !== 'custom';
    structureNoteEl.hidden = mode !== 'structure';
    structureWidgetEl.hidden = mode !== 'structure';
    refreshChordSequence();
  }

  function renderRiffChips() {
    riffStripEl.innerHTML = '';
    if (!state.riffEnabled) {
      var off = document.createElement('p');
      off.className = 'chord-strip-empty';
      off.textContent = 'Riff layer is off — turn it on to generate one.';
      riffStripEl.appendChild(off);
      return;
    }
    if (!state.currentRiff) {
      var none = document.createElement('p');
      none.className = 'chord-strip-empty';
      none.textContent = 'Click New Riff to generate one.';
      riffStripEl.appendChild(none);
      return;
    }
    state.currentRiff.notes.forEach(function (note, idx) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'riff-chip';
      chip.dataset.index = String(idx);
      chip.textContent = riffNoteName(note);
      chip.addEventListener('click', function () { previewRiffNoteAt(idx); });
      riffStripEl.appendChild(chip);
    });
  }

  function renderProgressionSelect() {
    progressionSelectEl.innerHTML = '';
    PROGRESSIONS.filter(function (p) { return p.mode === state.mode; }).forEach(function (p) {
      var opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      progressionSelectEl.appendChild(opt);
    });
    if (state.currentProgression && state.currentProgression.mode === state.mode) {
      progressionSelectEl.value = state.currentProgression.id;
    }
  }

  function updateDrumInfo() {
    if (!state.currentDrumPreset) return;
    drumNameEl.textContent = state.currentDrumPreset.label;
    drumDescEl.textContent = state.currentDrumPreset.desc;
    kitBlurbEl.textContent = KIT_DEFS[state.kit].blurb;
  }

  function updateProgressionInfo() {
    if (!state.currentProgression) return;
    progressionNameEl.textContent = state.currentProgression.name;
    progressionDescEl.textContent = state.currentProgression.desc;
  }

  function renderKeyNoteChips() {
    keyNoteChipsEl.innerHTML = '';
    KEY_LETTERS.forEach(function (letter) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'builder-chip' + (state.keyLetter === letter ? ' is-active' : '');
      btn.textContent = letter;
      btn.addEventListener('click', function () {
        state.keyLetter = letter;
        renderKeyNoteChips();
        applyKeyBuilder();
      });
      keyNoteChipsEl.appendChild(btn);
    });
  }

  function renderKeyAccidentalChips() {
    keyAccidentalChipsEl.innerHTML = '';
    KEY_ACCIDENTALS.forEach(function (acc) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'builder-chip' + (state.keyAccidental === acc.value ? ' is-active' : '');
      btn.textContent = acc.label;
      btn.addEventListener('click', function () {
        state.keyAccidental = acc.value;
        renderKeyAccidentalChips();
        applyKeyBuilder();
      });
      keyAccidentalChipsEl.appendChild(btn);
    });
  }

  function applyKeyBuilder() {
    state.keyPc = (((LETTER_SEMITONE[state.keyLetter] + (state.keyAccidental === '#' ? 1 : state.keyAccidental === 'b' ? -1 : 0)) % 12) + 12) % 12;
    state.keyFlats = state.keyAccidental === 'b';
    refreshChordSequence();
    renderRiffChips();
  }

  function wireModeButtonsActive() {
    modeControlEl.querySelectorAll('button').forEach(function (b) {
      b.classList.toggle('is-active', b.dataset.value === state.mode);
    });
  }

  /* =========================================================================
     Loading drum / chord / riff layers
     ========================================================================= */

  function loadDrumPreset(preset) {
    state.kit = preset.kit;
    var pat = emptyDrumPattern();
    TRACKS.forEach(function (t) { (preset.pattern[t.id] || []).forEach(function (idx) { pat[t.id][idx] = true; }); });
    state.drumPattern = pat;
    state.currentDrumPreset = preset;
    kitSelectEl.value = state.kit;
    drumPresetSelectEl.value = preset.id;
    updateDrumInfo();
  }

  function shuffleDrumPreset() {
    var pool = state.currentDrumPreset ? DRUM_PRESETS.filter(function (p) { return p.id !== state.currentDrumPreset.id; }) : DRUM_PRESETS;
    loadDrumPreset(pool[Math.floor(Math.random() * pool.length)]);
  }

  function loadProgressionPreset(entry) {
    state.currentProgression = entry;
    progressionSelectEl.value = entry.id;
    updateProgressionInfo();
    refreshChordSequence();
  }

  function shuffleProgressionPreset() {
    var pool = PROGRESSIONS.filter(function (p) { return p.mode === state.mode; });
    if (state.currentProgression) pool = pool.filter(function (p) { return p.id !== state.currentProgression.id; }) .concat(pool.length > 1 ? [] : pool);
    if (!pool.length) pool = PROGRESSIONS.filter(function (p) { return p.mode === state.mode; });
    loadProgressionPreset(pool[Math.floor(Math.random() * pool.length)]);
  }

  function regenerateRiff() {
    generateRiff();
    renderRiffChips();
  }

  function loadBackingPreset(preset) {
    state.bpm = preset.tempo;
    updateBpmUI();

    setChordMode('bank');

    state.keyLetter = preset.keyLetter;
    state.keyAccidental = preset.keyAccidental;
    renderKeyNoteChips();
    renderKeyAccidentalChips();
    applyKeyBuilder();

    var drumPreset = DRUM_PRESETS.filter(function (d) { return d.id === preset.drumPresetId; })[0];
    if (drumPreset) loadDrumPreset(drumPreset);

    var prog = PROGRESSIONS.filter(function (p) { return p.id === preset.progressionId; })[0];
    if (prog) {
      state.mode = prog.mode;
      wireModeButtonsActive();
      renderProgressionSelect();
      loadProgressionPreset(prog);
    }

    state.riffScaleId = preset.riffScaleId;
    riffScaleSelectEl.value = state.riffScaleId;
    regenerateRiff();

    backingPresetListEl.querySelectorAll('.preset-btn').forEach(function (b) {
      b.classList.toggle('is-active', b.dataset.preset === preset.id);
    });
  }

  /* =========================================================================
     Audio engine
     ========================================================================= */

  var audioCtx = null;
  var masterGain = null;

  function ensureAudioContext() {
    if (audioCtx) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AC();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = state.masterVolume;
    masterGain.connect(audioCtx.destination);
  }

  function playChordNote(midi, time, duration, gainShare) {
    var freq = MT.midiToFreq(midi);
    if (state.chordWaveform === 'realistic') {
      window.InstrumentTones.playRealistic(audioCtx, masterGain, 'guitar', freq, time, 0.55 * gainShare);
      return;
    }
    var dur = duration || 1.1;
    var vol = 0.55 * gainShare;
    var osc = audioCtx.createOscillator();
    osc.type = state.chordWaveform;
    osc.frequency.setValueAtTime(freq, time);
    var gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(vol, time + 0.02);
    gain.gain.setValueAtTime(vol, time + Math.max(dur - 0.18, 0.03));
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(gain); gain.connect(masterGain);
    osc.start(time); osc.stop(time + dur + 0.05);
  }

  function playChordTones(tones, time, duration) {
    var gainShare = 1 / Math.max(tones.length - 1, 2);
    tones.forEach(function (midi) { playChordNote(midi, time, duration, gainShare); });
  }

  function playRiffNote(midi, time) {
    var freq = MT.midiToFreq(midi);
    if (state.riffWaveform === 'realistic') {
      window.InstrumentTones.playRealistic(audioCtx, masterGain, 'guitar', freq, time, 0.6);
      return;
    }
    var dur = 0.32;
    var osc = audioCtx.createOscillator();
    osc.type = state.riffWaveform;
    osc.frequency.setValueAtTime(freq, time);
    var gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.5, time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(gain); gain.connect(masterGain);
    osc.start(time); osc.stop(time + dur + 0.02);
  }

  function previewChordAt(idx) {
    var chord = state.activeChordSequence[idx];
    if (!chord) return;
    ensureAudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    playChordTones(chord.tones, audioCtx.currentTime, 1.1);
    flashChordChip(idx, 550);
  }

  function previewRiffNoteAt(idx) {
    if (!state.currentRiff) return;
    ensureAudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    playRiffNote(riffMidiFor(state.currentRiff.notes[idx]), audioCtx.currentTime + 0.02);
    flashRiffChip(idx, 400);
  }

  function previewRiffAlone() {
    if (!state.currentRiff || !state.riffEnabled) return;
    ensureAudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    var dur = stepDuration();
    var t0 = audioCtx.currentTime + 0.05;
    state.currentRiff.notes.forEach(function (n, i) {
      var t = t0 + n.step * dur;
      playRiffNote(riffMidiFor(n), t);
      var delayMs = Math.max(0, (t - audioCtx.currentTime) * 1000);
      setTimeout(function () { flashRiffChip(i, 300); }, delayMs);
    });
  }

  function flashChordChip(idx, ms) {
    var chip = chordStripEl.querySelector('.chord-chip[data-index="' + idx + '"]');
    if (!chip) return;
    chip.classList.add('is-playing');
    setTimeout(function () { chip.classList.remove('is-playing'); }, ms);
  }

  function flashRiffChip(idx, ms) {
    var chip = riffStripEl.querySelector('.riff-chip[data-index="' + idx + '"]');
    if (!chip) return;
    chip.classList.add('is-playing');
    setTimeout(function () { chip.classList.remove('is-playing'); }, ms);
  }

  /* =========================================================================
     Scheduler — drums + riff share one step grid (always 16 steps, so they
     retrigger in lockstep every bar); the chord progression loops
     independently on its own beat-based cycle. Both are started together
     on Play, so they begin in sync; progressions with an odd number of
     chords (an odd number of 2-beat slots) will drift in phase against the
     4-beat drum bar over multiple loops, the same way live musicians drift
     in and out of phase over an odd-length vamp - not an error, just how
     the math of two independently-looping cycles works out.
     ========================================================================= */

  var LOOKAHEAD_MS = 25;
  var SCHEDULE_AHEAD = 0.12;
  var nextStepTime = 0;
  var stepCounter = 0;
  var stepTimer = null;
  var chordLoopTimer = null;
  var visualQueue = [];

  function stepDuration() { return (60 / state.bpm) * (4 / DRUM_STEPS); }

  function scheduleStep(stepIndex, time) {
    var kit = KITS[state.kit];
    TRACKS.forEach(function (t) {
      if (state.drumPattern[t.id][stepIndex]) kit[t.id](audioCtx, masterGain, time);
    });
    if (state.riffEnabled && state.currentRiff) {
      var hit = state.currentRiff.notes.filter(function (n) { return n.step === stepIndex; })[0];
      if (hit) playRiffNote(riffMidiFor(hit), time);
    }
    visualQueue.push({ time: time, step: stepIndex });
  }

  function stepScheduler() {
    while (nextStepTime < audioCtx.currentTime + SCHEDULE_AHEAD) {
      scheduleStep(stepCounter, nextStepTime);
      nextStepTime += stepDuration();
      stepCounter = (stepCounter + 1) % DRUM_STEPS;
    }
  }

  function scheduleChordLoopPass() {
    if (!state.isPlaying) return;
    var seq = state.activeChordSequence;
    if (!seq.length) { chordLoopTimer = setTimeout(scheduleChordLoopPass, 300); return; }
    var beatDur = 60 / state.bpm;
    var startTime = audioCtx.currentTime + 0.05;
    var t = startTime;
    seq.forEach(function (chord, idx) {
      var dur = chord.beats * beatDur;
      playChordTones(chord.tones, t, dur * 0.92);
      var delayMs = Math.max(0, (t - audioCtx.currentTime) * 1000);
      setTimeout(function () { if (state.isPlaying) flashChordChip(idx, dur * 1000 * 0.92); }, delayMs);
      t += dur;
    });
    var totalMs = (t - startTime) * 1000;
    if (state.chordMode === 'structure' && !state.structureLoop) {
      chordLoopTimer = setTimeout(function () { if (state.isPlaying) stopPlayback(); }, totalMs);
    } else {
      chordLoopTimer = setTimeout(scheduleChordLoopPass, totalMs);
    }
  }

  function visualFrame() {
    if (!state.isPlaying) return;
    var now = audioCtx.currentTime;
    while (visualQueue.length && visualQueue[0].time <= now) {
      var ev = visualQueue.shift();
      if (state.currentRiff) {
        var idx = -1;
        state.currentRiff.notes.forEach(function (n, i) { if (n.step === ev.step) idx = i; });
        if (idx !== -1) flashRiffChip(idx, stepDuration() * 900);
      }
    }
    requestAnimationFrame(visualFrame);
  }

  function startPlayback() {
    ensureAudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    state.isPlaying = true;
    stepCounter = 0;
    nextStepTime = audioCtx.currentTime + 0.06;
    visualQueue = [];
    playBtn.classList.add('is-playing');
    playBtnLabel.textContent = 'Stop';
    stepTimer = setInterval(stepScheduler, LOOKAHEAD_MS);
    requestAnimationFrame(visualFrame);
    scheduleChordLoopPass();
  }

  function stopPlayback() {
    state.isPlaying = false;
    if (stepTimer) { clearInterval(stepTimer); stepTimer = null; }
    if (chordLoopTimer) { clearTimeout(chordLoopTimer); chordLoopTimer = null; }
    playBtn.classList.remove('is-playing');
    playBtnLabel.textContent = 'Play Backing Track';
  }

  function togglePlayback() { if (state.isPlaying) stopPlayback(); else startPlayback(); }

  /* =========================================================================
     Static option lists (built once)
     ========================================================================= */

  function renderKitOptions() {
    kitSelectEl.innerHTML = '';
    KIT_ORDER.forEach(function (kitId) {
      var opt = document.createElement('option');
      opt.value = kitId;
      opt.textContent = KIT_DEFS[kitId].label;
      kitSelectEl.appendChild(opt);
    });
  }

  function renderDrumPresetOptions() {
    drumPresetSelectEl.innerHTML = '';
    DRUM_PRESETS.forEach(function (p) {
      var opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.label;
      drumPresetSelectEl.appendChild(opt);
    });
  }

  function renderRiffScaleOptions() {
    riffScaleSelectEl.innerHTML = '';
    RIFF_SCALES.forEach(function (s) {
      var opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.label;
      riffScaleSelectEl.appendChild(opt);
    });
  }

  function renderBackingPresetList() {
    backingPresetListEl.innerHTML = '';
    BACKING_PRESETS.forEach(function (preset) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'preset-btn';
      btn.dataset.preset = preset.id;

      var name = document.createElement('span');
      name.className = 'preset-btn-name';
      name.textContent = preset.label;

      var meta = document.createElement('span');
      meta.className = 'preset-btn-meta';
      meta.textContent = preset.tempo + ' BPM · ' + preset.keyLetter + preset.keyAccidental;

      btn.appendChild(name);
      btn.appendChild(meta);
      btn.title = preset.desc;
      btn.addEventListener('click', function () { loadBackingPreset(preset); });
      backingPresetListEl.appendChild(btn);
    });
  }

  /* =========================================================================
     Wiring
     ========================================================================= */

  function wireSegControl(el, onChange) {
    var buttons = Array.prototype.slice.call(el.querySelectorAll('button'));
    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        buttons.forEach(function (b) { b.classList.remove('is-active'); });
        btn.classList.add('is-active');
        onChange(btn.dataset.value);
      });
    });
  }

  function clampBpm(v) { return Math.max(40, Math.min(220, v)); }
  function updateBpmUI() { bpmInput.value = state.bpm; bpmSlider.value = state.bpm; }
  function setBpm(v) {
    if (isNaN(v)) v = state.bpm;
    state.bpm = clampBpm(v);
    updateBpmUI();
  }

  playBtn.addEventListener('click', togglePlayback);
  bpmInput.addEventListener('change', function () { setBpm(parseInt(bpmInput.value, 10)); });
  bpmSlider.addEventListener('input', function () { setBpm(parseInt(bpmSlider.value, 10)); });
  bpmDown.addEventListener('click', function () { setBpm(state.bpm - 1); });
  bpmUp.addEventListener('click', function () { setBpm(state.bpm + 1); });
  volumeSlider.addEventListener('input', function () {
    state.masterVolume = parseFloat(volumeSlider.value);
    if (masterGain) masterGain.gain.value = state.masterVolume;
  });

  kitSelectEl.addEventListener('change', function () { state.kit = kitSelectEl.value; updateDrumInfo(); });
  drumPresetSelectEl.addEventListener('change', function () {
    var p = DRUM_PRESETS.filter(function (d) { return d.id === drumPresetSelectEl.value; })[0];
    if (p) loadDrumPreset(p);
  });
  shuffleDrumBtn.addEventListener('click', shuffleDrumPreset);

  wireModeButtonsActive();
  modeControlEl.querySelectorAll('button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var val = btn.dataset.value;
      modeControlEl.querySelectorAll('button').forEach(function (b) { b.classList.toggle('is-active', b === btn); });
      state.mode = val;
      if (!state.currentProgression || state.currentProgression.mode !== val) {
        var pool = PROGRESSIONS.filter(function (p) { return p.mode === val; });
        renderProgressionSelect();
        loadProgressionPreset(pool[Math.floor(Math.random() * pool.length)]);
      } else {
        renderProgressionSelect();
      }
    });
  });

  progressionSelectEl.addEventListener('change', function () {
    var p = PROGRESSIONS.filter(function (x) { return x.id === progressionSelectEl.value; })[0];
    if (p) loadProgressionPreset(p);
  });
  shuffleProgressionBtn.addEventListener('click', shuffleProgressionPreset);
  wireSegControl(chordWaveControlEl, function (val) { state.chordWaveform = val; });

  chordModeControlEl.querySelectorAll('button').forEach(function (btn) {
    btn.addEventListener('click', function () { setChordMode(btn.dataset.value); });
  });

  customChordsInputEl.addEventListener('input', function () {
    state.customChordsText = customChordsInputEl.value;
    refreshChordSequence();
  });

  sectionCountInputEl.addEventListener('input', function () {
    setSectionCount(parseInt(sectionCountInputEl.value, 10));
  });
  clearArrangementBtn.addEventListener('click', function () {
    state.arrangement = [];
    renderArrangementStrip();
    refreshChordSequence();
  });
  wireSegControl(structureLoopControlEl, function (val) { state.structureLoop = val === 'loop'; });

  wireSegControl(riffEnabledControlEl, function (val) { state.riffEnabled = val === 'on'; renderRiffChips(); });
  riffScaleSelectEl.addEventListener('change', function () { state.riffScaleId = riffScaleSelectEl.value; regenerateRiff(); });
  wireSegControl(riffWaveControlEl, function (val) { state.riffWaveform = val; });
  newRiffBtn.addEventListener('click', regenerateRiff);
  previewRiffBtn.addEventListener('click', previewRiffAlone);

  function isTypingTarget(el) {
    return el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA');
  }

  window.addEventListener('keydown', function (e) {
    if (isTypingTarget(document.activeElement)) return;
    if (e.code === 'Space') { e.preventDefault(); togglePlayback(); return; }
    if (e.key === 'd' || e.key === 'D') { shuffleDrumPreset(); return; }
    if (e.key === 'p' || e.key === 'P') { if (state.chordMode === 'bank') shuffleProgressionPreset(); return; }
    if (e.key === 'r' || e.key === 'R') { regenerateRiff(); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setBpm(state.bpm + (e.shiftKey ? 5 : 1)); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setBpm(state.bpm - (e.shiftKey ? 5 : 1)); return; }
  });

  /* =========================================================================
     Init
     ========================================================================= */

  renderKitOptions();
  renderDrumPresetOptions();
  renderRiffScaleOptions();
  renderBackingPresetList();
  renderKeyNoteChips();
  renderKeyAccidentalChips();
  riffScaleSelectEl.value = state.riffScaleId;
  customChordsInputEl.value = state.customChordsText;
  renderSectionList();
  renderArrangementPalette();
  renderArrangementStrip();

  loadBackingPreset(BACKING_PRESETS[0]); // default: House Jam — a friendly demo of all three layers together
})();
