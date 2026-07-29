/* Music Tools — Drum Machine. A self-contained 808-style step sequencer:
   no audio samples, every sound is synthesized live with oscillators, noise
   buffers and filters (same approach as tones.js and metronome.js, just a
   wider palette). Exposes nothing globally; wires up on load via the IIFE
   tail below. */
(function () {
  'use strict';

  /* =========================================================================
     Sound synthesis — 808-style kit, no audio files
     ========================================================================= */

  function makeNoiseBuffer(ctx, seconds) {
    var frames = Math.max(1, Math.round(ctx.sampleRate * seconds));
    var buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function playKick(ctx, dest, time) {
    var osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(155, time);
    osc.frequency.exponentialRampToValueAtTime(48, time + 0.13);
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.95, time + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.42);
    osc.connect(gain); gain.connect(dest);
    osc.start(time); osc.stop(time + 0.45);

    var click = ctx.createBufferSource();
    click.buffer = makeNoiseBuffer(ctx, 0.01);
    var hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 2000;
    var cg = ctx.createGain();
    cg.gain.setValueAtTime(0.35, time);
    cg.gain.exponentialRampToValueAtTime(0.0001, time + 0.012);
    click.connect(hp); hp.connect(cg); cg.connect(dest);
    click.start(time); click.stop(time + 0.015);
  }

  function playSnare(ctx, dest, time) {
    [[180, 0.32], [330, 0.22]].forEach(function (pair) {
      var osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(pair[0], time);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(pair[1], time + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.1);
      osc.connect(g); g.connect(dest);
      osc.start(time); osc.stop(time + 0.11);
    });

    var noise = ctx.createBufferSource();
    noise.buffer = makeNoiseBuffer(ctx, 0.22);
    var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.7;
    var ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, time);
    ng.gain.exponentialRampToValueAtTime(0.55, time + 0.003);
    ng.gain.exponentialRampToValueAtTime(0.0001, time + 0.17);
    noise.connect(hp); hp.connect(bp); bp.connect(ng); ng.connect(dest);
    noise.start(time); noise.stop(time + 0.18);
  }

  var HAT_FREQS = [205.3, 304.4, 369.6, 522.7, 540, 800.5];

  function playHatCluster(ctx, dest, time, decay, peakGain) {
    var mix = ctx.createGain();
    var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 9000; bp.Q.value = 0.9;
    var envGain = ctx.createGain();
    envGain.gain.setValueAtTime(0.0001, time);
    envGain.gain.exponentialRampToValueAtTime(peakGain, time + 0.004);
    envGain.gain.exponentialRampToValueAtTime(0.0001, time + decay);

    HAT_FREQS.forEach(function (f) {
      var osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = f;
      osc.connect(mix);
      osc.start(time); osc.stop(time + decay + 0.02);
    });
    mix.connect(hp); hp.connect(bp); bp.connect(envGain); envGain.connect(dest);

    var noise = ctx.createBufferSource();
    noise.buffer = makeNoiseBuffer(ctx, decay + 0.02);
    var nhp = ctx.createBiquadFilter(); nhp.type = 'highpass'; nhp.frequency.value = 9000;
    var ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, time);
    ng.gain.exponentialRampToValueAtTime(peakGain * 0.5, time + 0.003);
    ng.gain.exponentialRampToValueAtTime(0.0001, time + decay);
    noise.connect(nhp); nhp.connect(ng); ng.connect(dest);
    noise.start(time); noise.stop(time + decay + 0.02);
  }

  function playClosedHat(ctx, dest, time) { playHatCluster(ctx, dest, time, 0.07, 0.32); }
  function playOpenHat(ctx, dest, time) { playHatCluster(ctx, dest, time, 0.38, 0.28); }

  function playClap(ctx, dest, time) {
    [0, 0.011, 0.022].forEach(function (off) {
      var noise = ctx.createBufferSource();
      noise.buffer = makeNoiseBuffer(ctx, 0.02);
      var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 1.4;
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, time + off);
      g.gain.exponentialRampToValueAtTime(0.45, time + off + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, time + off + 0.02);
      noise.connect(bp); bp.connect(g); g.connect(dest);
      noise.start(time + off); noise.stop(time + off + 0.025);
    });

    var tail = ctx.createBufferSource();
    tail.buffer = makeNoiseBuffer(ctx, 0.13);
    var tbp = ctx.createBiquadFilter(); tbp.type = 'bandpass'; tbp.frequency.value = 1500; tbp.Q.value = 1.2;
    var tg = ctx.createGain();
    var tStart = time + 0.03;
    tg.gain.setValueAtTime(0.0001, tStart);
    tg.gain.exponentialRampToValueAtTime(0.4, tStart + 0.004);
    tg.gain.exponentialRampToValueAtTime(0.0001, tStart + 0.13);
    tail.connect(tbp); tbp.connect(tg); tg.connect(dest);
    tail.start(tStart); tail.stop(tStart + 0.14);
  }

  function playTom(ctx, dest, time, baseFreq) {
    var osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq, time);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.6, time + 0.16);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.75, time + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.32);
    osc.connect(g); g.connect(dest);
    osc.start(time); osc.stop(time + 0.34);
  }
  function playLowTom(ctx, dest, time) { playTom(ctx, dest, time, 110); }
  function playMidTom(ctx, dest, time) { playTom(ctx, dest, time, 150); }
  function playHiTom(ctx, dest, time) { playTom(ctx, dest, time, 200); }

  function playRimshot(ctx, dest, time) {
    var osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(450, time);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.5, time + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.045);
    osc.connect(g); g.connect(dest);
    osc.start(time); osc.stop(time + 0.05);

    var noise = ctx.createBufferSource();
    noise.buffer = makeNoiseBuffer(ctx, 0.02);
    var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
    var ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, time);
    ng.gain.exponentialRampToValueAtTime(0.3, time + 0.002);
    ng.gain.exponentialRampToValueAtTime(0.0001, time + 0.025);
    noise.connect(hp); hp.connect(ng); ng.connect(dest);
    noise.start(time); noise.stop(time + 0.03);
  }

  function playCowbell(ctx, dest, time) {
    var mix = ctx.createGain();
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 800; bp.Q.value = 2.2;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.42, time + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.28);
    [587, 845].forEach(function (f) {
      var osc = ctx.createOscillator();
      osc.type = 'square'; osc.frequency.value = f;
      osc.connect(mix);
      osc.start(time); osc.stop(time + 0.3);
    });
    mix.connect(bp); bp.connect(g); g.connect(dest);
  }

  function playCrash(ctx, dest, time) {
    var mix = ctx.createGain();
    var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 5000;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.4, time + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 1.1);
    HAT_FREQS.concat([1200, 1600]).forEach(function (f) {
      var osc = ctx.createOscillator();
      osc.type = 'square'; osc.frequency.value = f;
      osc.connect(mix);
      osc.start(time); osc.stop(time + 1.15);
    });
    mix.connect(hp); hp.connect(g); g.connect(dest);

    var noise = ctx.createBufferSource();
    noise.buffer = makeNoiseBuffer(ctx, 1.1);
    var nhp = ctx.createBiquadFilter(); nhp.type = 'highpass'; nhp.frequency.value = 6000;
    var ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, time);
    ng.gain.exponentialRampToValueAtTime(0.3, time + 0.004);
    ng.gain.exponentialRampToValueAtTime(0.0001, time + 1.1);
    noise.connect(nhp); nhp.connect(ng); ng.connect(dest);
    noise.start(time); noise.stop(time + 1.15);
  }

  var TRACKS = [
    { id: 'kick', label: 'Kick', fn: playKick, density: 0.22 },
    { id: 'snare', label: 'Snare', fn: playSnare, density: 0.14 },
    { id: 'clap', label: 'Clap', fn: playClap, density: 0.12 },
    { id: 'closedHat', label: 'Closed Hat', fn: playClosedHat, density: 0.5 },
    { id: 'openHat', label: 'Open Hat', fn: playOpenHat, density: 0.14 },
    { id: 'lowTom', label: 'Low Tom', fn: playLowTom, density: 0.07 },
    { id: 'midTom', label: 'Mid Tom', fn: playMidTom, density: 0.07 },
    { id: 'hiTom', label: 'Hi Tom', fn: playHiTom, density: 0.07 },
    { id: 'rim', label: 'Rim', fn: playRimshot, density: 0.1 },
    { id: 'cowbell', label: 'Cowbell', fn: playCowbell, density: 0.05 },
    { id: 'crash', label: 'Crash', fn: playCrash, density: 0.03 }
  ];

  /* =========================================================================
     Presets — genre step patterns. Positions are 0-indexed within a single
     bar at the preset's native resolution (16 steps = 16th notes, 32 = 32nd
     notes), so a higher step count fits more subdivisions into the same bar
     rather than a longer loop.
     ========================================================================= */

  function p(id, positions) { return { id: id, positions: positions }; }

  var PRESETS = [
    {
      id: 'house', label: 'House', genre: 'House', bpm: 124, steps: 16,
      desc: 'Four-on-the-floor kick, off-beat hats, backbeat claps — the classic house pulse.',
      pattern: { kick: [0, 4, 8, 12], clap: [4, 12], closedHat: [2, 6, 10, 14] }
    },
    {
      id: 'techno', label: 'Techno', genre: 'Techno', bpm: 130, steps: 16,
      desc: 'Driving four-on-the-floor with rolling 16th hats and an open-hat lift on the off-beats.',
      pattern: { kick: [0, 4, 8, 12], closedHat: [0, 1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15], openHat: [4, 12], rim: [12] }
    },
    {
      id: 'hiphop', label: 'Boom Bap Hip-Hop', genre: 'Hip-Hop', bpm: 90, steps: 16,
      desc: 'Laid-back syncopated kick against a straight backbeat snare — the boom-bap foundation.',
      pattern: { kick: [0, 10], snare: [4, 12], closedHat: [0, 2, 4, 6, 8, 10, 12, 14] }
    },
    {
      id: 'trap', label: 'Trap', genre: 'Trap', bpm: 140, steps: 32,
      desc: 'Half-time clap over a syncopated kick, with dense rolling hi-hats and open-hat lifts — the trap hallmark.',
      pattern: {
        kick: [0, 10, 20],
        clap: [16],
        closedHat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
        openHat: [15, 31]
      }
    },
    {
      id: 'rock', label: 'Rock', genre: 'Rock', bpm: 120, steps: 16,
      desc: 'Straight 8th hats over the standard kick-on-1-and-3, snare-on-2-and-4 backbeat.',
      pattern: { kick: [0, 8], snare: [4, 12], closedHat: [0, 2, 4, 6, 8, 10, 12, 14] }
    },
    {
      id: 'funk', label: 'Funk', genre: 'Funk', bpm: 100, steps: 16,
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
      id: 'reggae', label: 'Reggae (One Drop)', genre: 'Reggae', bpm: 76, steps: 16,
      desc: 'Kick and snare land together on beat 3 only, with a skanking off-beat hat underneath.',
      pattern: { kick: [8], snare: [8], closedHat: [2, 6, 10, 14] }
    },
    {
      id: 'disco', label: 'Disco', genre: 'Disco', bpm: 118, steps: 16,
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
    masterVolume: 0.85,
    trackMute: {},
    trackSolo: {},
    patternsByRes: { 8: emptyPattern(8), 16: emptyPattern(16), 32: emptyPattern(32) }
  };
  TRACKS.forEach(function (t) { state.trackMute[t.id] = false; state.trackSolo[t.id] = false; });

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
    patternNameEl.textContent = 'Custom Pattern';
    patternDescEl.textContent = 'Programmed by hand — load a preset any time to start from a classic groove instead.';
    patternMetaEl.innerHTML = '';
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
  }

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
      meta.textContent = preset.bpm + ' BPM · ' + preset.steps + ' steps';

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
    renderGrid();

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
    var t = TRACKS.filter(function (tr) { return tr.id === trackId; })[0];
    if (t) t.fn(audioCtx, masterGain, audioCtx.currentTime + 0.02);
  }

  function stepDuration() {
    return (60 / state.bpm) * (4 / state.steps);
  }

  function scheduleStep(stepIndex, time) {
    var pat = currentPattern();
    TRACKS.forEach(function (t) {
      if (pat[t.id][stepIndex] && isAudible(t.id)) t.fn(audioCtx, masterGain, time);
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

  renderPresetList();
  loadPreset(PRESETS[0]); // default: House — a friendly, recognizable demo pattern
})();
