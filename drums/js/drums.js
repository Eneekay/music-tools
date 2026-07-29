/* Music Tools — Drum Machine. A self-contained step sequencer modeled after
   several famous drum machines: no audio samples, every sound is
   synthesized live with oscillators, noise buffers and filters (same
   approach as tones.js and metronome.js), parametrized per kit so each
   machine has a genuinely distinct character. Exposes nothing globally;
   wires up on load via the IIFE tail below. */
(function () {
  'use strict';

  /* =========================================================================
     Sound synthesis — parametrized factories, one set of shapes shared by
     every kit. A kit is just a table of numbers fed into these factories.
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

  /* =========================================================================
     Kits — six famous drum machines, approximated through synthesis
     parameters rather than samples. Each is a genuine character difference
     (attack, decay, tone/noise balance, brightness), not just a relabeling.
     ========================================================================= */

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
    { id: 'kick', label: 'Kick', density: 0.22 },
    { id: 'snare', label: 'Snare', density: 0.14 },
    { id: 'clap', label: 'Clap', density: 0.12 },
    { id: 'closedHat', label: 'Closed Hat', density: 0.5 },
    { id: 'openHat', label: 'Open Hat', density: 0.14 },
    { id: 'lowTom', label: 'Low Tom', density: 0.07 },
    { id: 'midTom', label: 'Mid Tom', density: 0.07 },
    { id: 'hiTom', label: 'Hi Tom', density: 0.07 },
    { id: 'rim', label: 'Rim', density: 0.1 },
    { id: 'cowbell', label: 'Cowbell', density: 0.05 },
    { id: 'crash', label: 'Crash', density: 0.03 }
  ];

  /* =========================================================================
     Presets — genre step patterns, each paired with a suggested kit.
     Positions are 0-indexed within a single bar at the preset's native
     resolution (16 steps = 16th notes, 32 = 32nd notes), so a higher step
     count fits more subdivisions into the same bar rather than a longer loop.
     ========================================================================= */

  var PRESETS = [
    {
      id: 'house', label: 'House', genre: 'House', bpm: 124, steps: 16, kit: 'tr808',
      desc: 'Four-on-the-floor kick, off-beat hats, backbeat claps — the classic house pulse.',
      pattern: { kick: [0, 4, 8, 12], clap: [4, 12], closedHat: [2, 6, 10, 14] }
    },
    {
      id: 'techno', label: 'Techno', genre: 'Techno', bpm: 130, steps: 16, kit: 'tr909',
      desc: 'Driving four-on-the-floor with rolling 16th hats and an open-hat lift on the off-beats.',
      pattern: { kick: [0, 4, 8, 12], closedHat: [0, 1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15], openHat: [4, 12], rim: [12] }
    },
    {
      id: 'hiphop', label: 'Boom Bap Hip-Hop', genre: 'Hip-Hop', bpm: 90, steps: 16, kit: 'dmx',
      desc: 'Laid-back syncopated kick against a straight backbeat snare — the boom-bap foundation.',
      pattern: { kick: [0, 10], snare: [4, 12], closedHat: [0, 2, 4, 6, 8, 10, 12, 14] }
    },
    {
      id: 'trap', label: 'Trap', genre: 'Trap', bpm: 140, steps: 32, kit: 'tr808',
      desc: 'Half-time clap over a syncopated kick, with dense rolling hi-hats and open-hat lifts — the trap hallmark.',
      pattern: {
        kick: [0, 10, 20],
        clap: [16],
        closedHat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
        openHat: [15, 31]
      }
    },
    {
      id: 'rock', label: 'Rock', genre: 'Rock', bpm: 120, steps: 16, kit: 'linndrum',
      desc: 'Straight 8th hats over the standard kick-on-1-and-3, snare-on-2-and-4 backbeat.',
      pattern: { kick: [0, 8], snare: [4, 12], closedHat: [0, 2, 4, 6, 8, 10, 12, 14] }
    },
    {
      id: 'funk', label: 'Funk', genre: 'Funk', bpm: 100, steps: 16, kit: 'linndrum',
      desc: 'Syncopated kick pushes, a tight backbeat, ghost-note rim hits and constant 16th hats.',
      pattern: {
        kick: [0, 3, 8, 11],
        snare: [4, 12],
        rim: [7, 15],
        closedHat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
        openHat: [14]
      }
    },
    {
      id: 'reggae', label: 'Reggae (One Drop)', genre: 'Reggae', bpm: 76, steps: 16, kit: 'cr78',
      desc: 'Kick and snare land together on beat 3 only, with a skanking off-beat hat underneath.',
      pattern: { kick: [8], snare: [8], closedHat: [2, 6, 10, 14] }
    },
    {
      id: 'disco', label: 'Disco', genre: 'Disco', bpm: 118, steps: 16, kit: 'tr707',
      desc: 'Four-on-the-floor kick with a tight closed-hat chick on the beat and the signature open-hat off-beat.',
      pattern: { kick: [0, 4, 8, 12], clap: [4, 12], closedHat: [0, 4, 8, 12], openHat: [2, 6, 10, 14] }
    }
  ];

  /* =========================================================================
     State
     ========================================================================= */

  function emptyPattern(steps) {
    var pat = {};
    TRACKS.forEach(function (t) { pat[t.id] = new Array(steps).fill(false); });
    return pat;
  }

  var state = {
    bpm: 124,
    steps: 16,
    kit: 'tr808',
    masterVolume: 0.85,
    trackMute: {},
    trackSolo: {},
    patternsByRes: { 8: emptyPattern(8), 16: emptyPattern(16), 32: emptyPattern(32) }
  };
  TRACKS.forEach(function (t) { state.trackMute[t.id] = false; state.trackSolo[t.id] = false; });

  var lastLoadedPreset = null;

  function currentPattern() { return state.patternsByRes[state.steps]; }

  function anySolo() {
    return TRACKS.some(function (t) { return state.trackSolo[t.id]; });
  }

  function isAudible(trackId) {
    if (anySolo()) return state.trackSolo[trackId];
    return !state.trackMute[trackId];
  }

  /* =========================================================================
     DOM refs
     ========================================================================= */

  var playBtn = document.getElementById('playBtn');
  var playBtnLabel = document.getElementById('playBtnLabel');
  var kitSelectEl = document.getElementById('kitSelect');
  var kitBlurbEl = document.getElementById('kitBlurb');
  var stepsControl = document.getElementById('stepsControl');
  var bpmInput = document.getElementById('bpmInput');
  var bpmSlider = document.getElementById('bpmSlider');
  var bpmDown = document.getElementById('bpmDown');
  var bpmUp = document.getElementById('bpmUp');
  var volumeSlider = document.getElementById('volumeSlider');
  var clearBtn = document.getElementById('clearBtn');
  var randomizeBtn = document.getElementById('randomizeBtn');
  var presetListEl = document.getElementById('presetList');
  var patternNameEl = document.getElementById('patternName');
  var patternDescEl = document.getElementById('patternDesc');
  var patternMetaEl = document.getElementById('patternMeta');
  var sequencerGridEl = document.getElementById('sequencerGrid');

  /* =========================================================================
     Grid rendering
     ========================================================================= */

  var stepColumns = []; // stepColumns[i] = [elements sharing step index i]

  function renderGrid() {
    sequencerGridEl.innerHTML = '';
    stepColumns = [];
    var steps = state.steps;
    sequencerGridEl.style.gridTemplateColumns = '150px repeat(' + steps + ', minmax(24px, 1fr))';
    sequencerGridEl.style.minWidth = (160 + steps * 30) + 'px';

    for (var i = 0; i < steps; i++) stepColumns.push([]);

    // ruler row
    var rulerCorner = document.createElement('div');
    rulerCorner.className = 'ruler-cell ruler-corner';
    rulerCorner.style.gridRow = '1'; rulerCorner.style.gridColumn = '1';
    sequencerGridEl.appendChild(rulerCorner);

    for (var s = 0; s < steps; s++) {
      var ruler = document.createElement('div');
      ruler.className = 'ruler-cell' + (s % 4 === 0 ? ' is-downbeat' : '');
      ruler.style.gridRow = '1'; ruler.style.gridColumn = String(s + 2);
      ruler.textContent = s % 4 === 0 ? String(s + 1) : '';
      sequencerGridEl.appendChild(ruler);
      stepColumns[s].push(ruler);
    }

    var pattern = currentPattern();

    TRACKS.forEach(function (t, rowIdx) {
      var header = document.createElement('div');
      header.className = 'track-header';
      header.dataset.track = t.id;
      header.style.gridRow = String(rowIdx + 2); header.style.gridColumn = '1';

      var label = document.createElement('button');
      label.type = 'button';
      label.className = 'track-label';
      label.textContent = t.label;
      label.title = 'Click to preview ' + t.label;
      label.addEventListener('click', function () { previewSound(t.id); });

      var controls = document.createElement('div');
      controls.className = 'track-controls';

      var muteBtn = document.createElement('button');
      muteBtn.type = 'button';
      muteBtn.className = 'track-toggle track-mute' + (state.trackMute[t.id] ? ' is-active' : '');
      muteBtn.textContent = 'M';
      muteBtn.title = 'Mute ' + t.label;
      muteBtn.addEventListener('click', function () {
        state.trackMute[t.id] = !state.trackMute[t.id];
        muteBtn.classList.toggle('is-active', state.trackMute[t.id]);
        updateTrackAudibility();
      });

      var soloBtn = document.createElement('button');
      soloBtn.type = 'button';
      soloBtn.className = 'track-toggle track-solo' + (state.trackSolo[t.id] ? ' is-active' : '');
      soloBtn.textContent = 'S';
      soloBtn.title = 'Solo ' + t.label;
      soloBtn.addEventListener('click', function () {
        state.trackSolo[t.id] = !state.trackSolo[t.id];
        soloBtn.classList.toggle('is-active', state.trackSolo[t.id]);
        updateTrackAudibility();
      });

      controls.appendChild(muteBtn);
      controls.appendChild(soloBtn);
      header.appendChild(label);
      header.appendChild(controls);
      sequencerGridEl.appendChild(header);

      for (var i = 0; i < steps; i++) {
        var cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'step-cell' + (Math.floor(i / 4) % 2 === 1 ? ' group-alt' : '') + (pattern[t.id][i] ? ' is-active' : '');
        cell.dataset.track = t.id;
        cell.dataset.step = String(i);
        cell.style.gridRow = String(rowIdx + 2); cell.style.gridColumn = String(i + 2);
        cell.addEventListener('click', function () {
          var track = this.dataset.track;
          var step = parseInt(this.dataset.step, 10);
          var pat = currentPattern();
          pat[track][step] = !pat[track][step];
          this.classList.toggle('is-active', pat[track][step]);
          markCustom();
        });
        sequencerGridEl.appendChild(cell);
        stepColumns[i].push(cell);
      }
    });

    updateTrackAudibility();
  }

  function updateTrackAudibility() {
    TRACKS.forEach(function (t) {
      var silent = !isAudible(t.id);
      var els = sequencerGridEl.querySelectorAll('[data-track="' + t.id + '"]');
      els.forEach(function (el) { el.classList.toggle('is-silenced', silent); });
    });
  }

  function markCustom() {
    lastLoadedPreset = null;
    patternNameEl.textContent = 'Custom Pattern';
    patternDescEl.textContent = 'Programmed by hand — load a preset any time to start from a classic groove instead.';
    renderCustomMeta();
  }

  function kitTag() {
    var tag = document.createElement('span');
    tag.className = 'pattern-tag pattern-tag--kit';
    tag.textContent = KIT_DEFS[state.kit].label;
    return tag;
  }

  function renderCustomMeta() {
    patternMetaEl.innerHTML = '';
    patternMetaEl.appendChild(kitTag());
  }

  function renderPresetMeta(preset) {
    patternMetaEl.innerHTML = '';
    var genreTag = document.createElement('span');
    genreTag.className = 'pattern-tag';
    genreTag.textContent = preset.genre;
    var infoTag = document.createElement('span');
    infoTag.className = 'pattern-tag pattern-tag--muted';
    infoTag.textContent = preset.bpm + ' BPM · ' + preset.steps + ' steps';
    patternMetaEl.appendChild(genreTag);
    patternMetaEl.appendChild(infoTag);
    patternMetaEl.appendChild(kitTag());
  }

  /* =========================================================================
     Kit selector
     ========================================================================= */

  function renderKitOptions() {
    kitSelectEl.innerHTML = '';
    KIT_ORDER.forEach(function (kitId) {
      var opt = document.createElement('option');
      opt.value = kitId;
      opt.textContent = KIT_DEFS[kitId].label;
      kitSelectEl.appendChild(opt);
    });
    kitSelectEl.value = state.kit;
  }

  function updateKitBlurb() {
    kitBlurbEl.textContent = KIT_DEFS[state.kit].blurb;
  }

  function setKit(kitId) {
    if (!KITS[kitId]) return;
    state.kit = kitId;
    kitSelectEl.value = kitId;
    updateKitBlurb();
    if (lastLoadedPreset) renderPresetMeta(lastLoadedPreset); else renderCustomMeta();
  }

  kitSelectEl.addEventListener('change', function () { setKit(kitSelectEl.value); });

  /* =========================================================================
     Presets
     ========================================================================= */

  function renderPresetList() {
    presetListEl.innerHTML = '';
    PRESETS.forEach(function (preset) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'preset-btn';
      btn.dataset.preset = preset.id;

      var name = document.createElement('span');
      name.className = 'preset-btn-name';
      name.textContent = preset.label;

      var meta = document.createElement('span');
      meta.className = 'preset-btn-meta';
      meta.textContent = preset.bpm + ' BPM · ' + preset.steps + ' steps · ' + KIT_DEFS[preset.kit].label;

      btn.appendChild(name);
      btn.appendChild(meta);
      btn.addEventListener('click', function () { loadPreset(preset); });
      presetListEl.appendChild(btn);
    });
  }

  function loadPreset(preset) {
    var wasPlaying = isPlaying;
    stopPlayback();

    state.bpm = preset.bpm;
    state.steps = preset.steps;
    state.kit = preset.kit;

    var pat = emptyPattern(preset.steps);
    TRACKS.forEach(function (t) {
      (preset.pattern[t.id] || []).forEach(function (idx) {
        if (idx >= 0 && idx < preset.steps) pat[t.id][idx] = true;
      });
    });
    state.patternsByRes[preset.steps] = pat;

    TRACKS.forEach(function (t) { state.trackMute[t.id] = false; state.trackSolo[t.id] = false; });

    updateStepsButtons();
    updateBpmUI();
    kitSelectEl.value = state.kit;
    updateKitBlurb();
    renderGrid();

    lastLoadedPreset = preset;
    patternNameEl.textContent = preset.label;
    patternDescEl.textContent = preset.desc;
    renderPresetMeta(preset);

    if (wasPlaying) startPlayback();
  }

  function randomizePattern() {
    var pat = currentPattern();
    TRACKS.forEach(function (t) {
      for (var i = 0; i < state.steps; i++) pat[t.id][i] = Math.random() < t.density;
    });
    renderGrid();
    markCustom();
  }

  function clearPattern() {
    state.patternsByRes[state.steps] = emptyPattern(state.steps);
    renderGrid();
    markCustom();
  }

  /* =========================================================================
     Audio engine / scheduler
     ========================================================================= */

  var audioCtx = null;
  var masterGain = null;
  var isPlaying = false;
  var schedulerTimer = null;
  var LOOKAHEAD_MS = 25;
  var SCHEDULE_AHEAD = 0.12;
  var nextStepTime = 0;
  var stepCounter = 0;
  var visualQueue = [];
  var currentPlayheadStep = -1;

  function ensureAudioContext() {
    if (audioCtx) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AC();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = state.masterVolume;
    masterGain.connect(audioCtx.destination);
  }

  function previewSound(trackId) {
    ensureAudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    var kit = KITS[state.kit];
    if (kit && kit[trackId]) kit[trackId](audioCtx, masterGain, audioCtx.currentTime + 0.02);
  }

  function stepDuration() {
    return (60 / state.bpm) * (4 / state.steps);
  }

  function scheduleStep(stepIndex, time) {
    var pat = currentPattern();
    var kit = KITS[state.kit];
    TRACKS.forEach(function (t) {
      if (pat[t.id][stepIndex] && isAudible(t.id)) kit[t.id](audioCtx, masterGain, time);
    });
    visualQueue.push({ time: time, step: stepIndex });
  }

  function scheduler() {
    while (nextStepTime < audioCtx.currentTime + SCHEDULE_AHEAD) {
      scheduleStep(stepCounter, nextStepTime);
      nextStepTime += stepDuration();
      stepCounter = (stepCounter + 1) % state.steps;
    }
  }

  function startPlayback() {
    ensureAudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    isPlaying = true;
    stepCounter = 0;
    nextStepTime = audioCtx.currentTime + 0.06;
    visualQueue = [];
    currentPlayheadStep = -1;
    playBtn.classList.add('is-playing');
    playBtnLabel.textContent = 'Stop';
    schedulerTimer = setInterval(scheduler, LOOKAHEAD_MS);
    requestAnimationFrame(visualFrame);
  }

  function stopPlayback() {
    isPlaying = false;
    if (schedulerTimer) { clearInterval(schedulerTimer); schedulerTimer = null; }
    playBtn.classList.remove('is-playing');
    playBtnLabel.textContent = 'Play';
    clearPlayheadHighlight();
  }

  function togglePlayback() {
    if (isPlaying) stopPlayback(); else startPlayback();
  }

  function clearPlayheadHighlight() {
    if (currentPlayheadStep === -1) return;
    var col = stepColumns[currentPlayheadStep];
    if (col) col.forEach(function (el) { el.classList.remove('is-playhead'); });
    currentPlayheadStep = -1;
  }

  function setPlayheadStep(step) {
    if (step === currentPlayheadStep) return;
    clearPlayheadHighlight();
    var col = stepColumns[step];
    if (col) col.forEach(function (el) { el.classList.add('is-playhead'); });
    currentPlayheadStep = step;
  }

  function visualFrame() {
    if (!isPlaying) return;
    var now = audioCtx.currentTime;
    while (visualQueue.length && visualQueue[0].time <= now) {
      setPlayheadStep(visualQueue.shift().step);
    }
    requestAnimationFrame(visualFrame);
  }

  /* =========================================================================
     Wiring
     ========================================================================= */

  function updateStepsButtons() {
    stepsControl.querySelectorAll('button').forEach(function (b) {
      b.classList.toggle('is-active', parseInt(b.dataset.value, 10) === state.steps);
    });
  }

  function updateBpmUI() {
    bpmInput.value = state.bpm;
    bpmSlider.value = state.bpm;
  }

  function clampBpm(v) { return Math.max(40, Math.min(220, v)); }

  function setBpm(v) {
    if (isNaN(v)) v = state.bpm;
    state.bpm = clampBpm(v);
    updateBpmUI();
  }

  function setSteps(steps) {
    var wasPlaying = isPlaying;
    stopPlayback();
    state.steps = steps;
    updateStepsButtons();
    renderGrid();
    markCustom();
    if (wasPlaying) startPlayback();
  }

  stepsControl.querySelectorAll('button').forEach(function (btn) {
    btn.addEventListener('click', function () { setSteps(parseInt(btn.dataset.value, 10)); });
  });

  bpmInput.addEventListener('change', function () { setBpm(parseInt(bpmInput.value, 10)); });
  bpmSlider.addEventListener('input', function () { setBpm(parseInt(bpmSlider.value, 10)); });
  bpmDown.addEventListener('click', function () { setBpm(state.bpm - 1); });
  bpmUp.addEventListener('click', function () { setBpm(state.bpm + 1); });

  volumeSlider.addEventListener('input', function () {
    state.masterVolume = parseFloat(volumeSlider.value);
    if (masterGain) masterGain.gain.value = state.masterVolume;
  });

  clearBtn.addEventListener('click', clearPattern);
  randomizeBtn.addEventListener('click', randomizePattern);
  playBtn.addEventListener('click', togglePlayback);

  function isTypingTarget(el) {
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
  }

  window.addEventListener('keydown', function (e) {
    if (isTypingTarget(e.target)) return;
    if (e.code === 'Space') { e.preventDefault(); togglePlayback(); return; }
    if (e.key === 'c' || e.key === 'C') { clearPattern(); return; }
    if (e.key === 'r' || e.key === 'R') { randomizePattern(); return; }
    if (e.key === '1') { setSteps(8); return; }
    if (e.key === '2') { setSteps(16); return; }
    if (e.key === '3') { setSteps(32); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setBpm(state.bpm + (e.shiftKey ? 5 : 1)); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setBpm(state.bpm - (e.shiftKey ? 5 : 1)); return; }
  });

  /* =========================================================================
     Init
     ========================================================================= */

  renderKitOptions();
  renderPresetList();
  loadPreset(PRESETS[0]); // default: House on the TR-808 — a friendly, recognizable demo pattern
})();
