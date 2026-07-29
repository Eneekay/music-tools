(function () {
  'use strict';

  /* =========================================================================
     Sound synthesis — 4 self-contained click "kits", no audio files
     ========================================================================= */

  var SOUND_TYPES = [
    { id: 'click', label: 'Click' },
    { id: 'wood', label: 'Wood Block' },
    { id: 'beep', label: 'Digital Beep' },
    { id: 'rim', label: 'Rim / Clave' }
  ];

  function makeNoiseBuffer(ctx, seconds, power) {
    var frames = Math.max(1, Math.round(ctx.sampleRate * seconds));
    var buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < frames; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / frames, power);
    }
    return buffer;
  }

  function playClick(ctx, dest, time, opts) {
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(opts.accent ? 2200 : 1700, time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(opts.gain, 0.001), time + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.035);
    osc.connect(gain); gain.connect(dest);
    osc.start(time); osc.stop(time + 0.05);
  }

  function playWood(ctx, dest, time, opts) {
    var noise = ctx.createBufferSource();
    noise.buffer = makeNoiseBuffer(ctx, 0.07, 2);
    var band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = opts.accent ? 1300 : 950;
    band.Q.value = 5;
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(Math.max(opts.gain, 0.001), time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.07);
    noise.connect(band); band.connect(gain); gain.connect(dest);
    noise.start(time); noise.stop(time + 0.08);
  }

  function playBeep(ctx, dest, time, opts) {
    var osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(opts.accent ? 1400 : 1000, time);
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(Math.max(opts.gain * 0.55, 0.001), time + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.1);
    osc.connect(gain); gain.connect(dest);
    osc.start(time); osc.stop(time + 0.11);
  }

  function playRim(ctx, dest, time, opts) {
    var noise = ctx.createBufferSource();
    noise.buffer = makeNoiseBuffer(ctx, 0.025, 3);
    var hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2500;
    var ng = ctx.createGain();
    ng.gain.setValueAtTime(Math.max(opts.gain, 0.001), time);
    ng.gain.exponentialRampToValueAtTime(0.0001, time + 0.03);
    noise.connect(hp); hp.connect(ng); ng.connect(dest);
    noise.start(time); noise.stop(time + 0.04);

    var osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(opts.accent ? 2700 : 2200, time);
    var og = ctx.createGain();
    og.gain.setValueAtTime(Math.max(opts.gain * 0.5, 0.001), time);
    og.gain.exponentialRampToValueAtTime(0.0001, time + 0.025);
    osc.connect(og); og.connect(dest);
    osc.start(time); osc.stop(time + 0.03);
  }

  var SOUND_FN = { click: playClick, wood: playWood, beep: playBeep, rim: playRim };

  var ROLE_GAIN = { accent: 1.0, beat: 0.72, subdivision: 0.42, polyA: 0.8, polyB: 0.62 };

  /* =========================================================================
     State
     ========================================================================= */

  var state = {
    bpm: 120,
    numerator: 4,
    denominator: 4,
    subdivision: 1,
    polyEnabled: false,
    polyA: 3,
    polyB: 4,
    precountBars: 0,
    lengthMode: 'infinite',
    totalBars: 8,
    masterVolume: 0.8,
    soundAssign: { accent: 'click', beat: 'wood', subdivision: 'beep', polyA: 'click', polyB: 'rim' }
  };

  var RHYTHM_PRESETS = [
    { label: '2/4', num: 2, den: 4 },
    { label: '3/4', num: 3, den: 4 },
    { label: '4/4', num: 4, den: 4 },
    { label: '5/4', num: 5, den: 4 },
    { label: '6/8', num: 6, den: 8 },
    { label: '7/8', num: 7, den: 8 },
    { label: '9/8', num: 9, den: 8 },
    { label: '12/8', num: 12, den: 8 }
  ];

  /* =========================================================================
     Audio engine / scheduler
     ========================================================================= */

  var audioCtx = null;
  var masterGain = null;
  var isRunning = false;
  var schedulerTimer = null;
  var LOOKAHEAD_MS = 25;
  var SCHEDULE_AHEAD = 0.12;

  var nextBeatTime = 0;
  var visualQueue = [];
  var mainBeatCounter = 0;

  var playhead = { phase: 'precount', precountBarsLeft: 0, bar: 1, beatIndex: 0 };

  function ensureAudioContext() {
    if (audioCtx) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AC();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = state.masterVolume;
    masterGain.connect(audioCtx.destination);
  }

  function playSound(role, time) {
    var soundId = state.soundAssign[role];
    var fn = SOUND_FN[soundId] || playClick;
    fn(audioCtx, masterGain, time, { accent: role === 'accent', gain: ROLE_GAIN[role] || 0.7 });
  }

  function previewSound(soundId) {
    ensureAudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    var fn = SOUND_FN[soundId] || playClick;
    fn(audioCtx, masterGain, audioCtx.currentTime + 0.02, { accent: false, gain: 0.75 });
  }

  function resetPlayhead() {
    playhead.phase = state.precountBars > 0 ? 'precount' : 'main';
    playhead.precountBarsLeft = state.precountBars;
    playhead.bar = 1;
    playhead.beatIndex = 0;
    mainBeatCounter = 0;
  }

  function advancePlayhead() {
    if (playhead.phase === 'done') return null;
    var info = {
      phase: playhead.phase,
      bar: playhead.bar,
      beatIndex: playhead.beatIndex,
      precountTotal: state.precountBars
    };
    playhead.beatIndex++;
    if (playhead.beatIndex >= state.numerator) {
      playhead.beatIndex = 0;
      if (playhead.phase === 'precount') {
        playhead.precountBarsLeft--;
        if (playhead.precountBarsLeft <= 0) { playhead.phase = 'main'; playhead.bar = 1; }
        else { playhead.bar++; }
      } else {
        if (state.lengthMode === 'bars' && playhead.bar >= state.totalBars) {
          playhead.phase = 'done';
        } else {
          playhead.bar++;
        }
      }
    }
    return info;
  }

  function scheduleBeat(info, time, dur) {
    var role = info.beatIndex === 0 ? 'accent' : 'beat';
    playSound(role, time);
    var parity = (mainBeatCounter % 2 === 0) ? 1 : -1;
    mainBeatCounter++;

    visualQueue.push({
      time: time, type: 'beat', role: role,
      beatIndex: info.beatIndex, bar: info.bar,
      isPrecount: info.phase === 'precount', precountTotal: info.precountTotal,
      parity: parity, duration: dur
    });

    if (!state.polyEnabled && state.subdivision > 1) {
      for (var k = 1; k < state.subdivision; k++) {
        var t = time + (k * dur) / state.subdivision;
        playSound('subdivision', t);
        visualQueue.push({ time: t, type: 'sub' });
      }
    }

    if (state.polyEnabled) {
      var a, b;
      for (a = 0; a < state.polyA; a++) {
        var ta = time + (a * dur) / state.polyA;
        playSound('polyA', ta);
        visualQueue.push({ time: ta, type: 'polyA', index: a });
      }
      for (b = 0; b < state.polyB; b++) {
        var tb = time + (b * dur) / state.polyB;
        playSound('polyB', tb);
        visualQueue.push({ time: tb, type: 'polyB', index: b });
      }
    }
  }

  function scheduler() {
    while (nextBeatTime < audioCtx.currentTime + SCHEDULE_AHEAD) {
      var info = advancePlayhead();
      if (!info) {
        scheduleAutoStop(nextBeatTime);
        clearInterval(schedulerTimer);
        schedulerTimer = null;
        return;
      }
      var dur = 60 / state.bpm;
      scheduleBeat(info, nextBeatTime, dur);
      nextBeatTime += dur;
    }
  }

  var autoStopTimer = null;

  function scheduleAutoStop(lastTime) {
    var delayMs = Math.max(0, (lastTime - audioCtx.currentTime)) * 1000 + 120;
    autoStopTimer = setTimeout(function () {
      stopPlayback(true);
    }, delayMs);
  }

  function startPlayback() {
    ensureAudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (autoStopTimer) { clearTimeout(autoStopTimer); autoStopTimer = null; }

    resetPlayhead();
    visualQueue = [];
    lastBeatEvent = null;
    isRunning = true;
    nextBeatTime = audioCtx.currentTime + 0.08;

    setPlayButtonState(true);
    needleEl.classList.add('is-live');

    schedulerTimer = setInterval(scheduler, LOOKAHEAD_MS);
    requestAnimationFrame(visualFrame);
  }

  function stopPlayback(finished) {
    isRunning = false;
    if (schedulerTimer) { clearInterval(schedulerTimer); schedulerTimer = null; }
    if (autoStopTimer) { clearTimeout(autoStopTimer); autoStopTimer = null; }
    setPlayButtonState(false);
    needleEl.classList.remove('is-live');
    needleEl.style.transform = 'translateX(-50%) rotate(0deg)';
    lastBeatEvent = null;
    renderBeatDots();
    beatNumberEl.textContent = '–';
    beatMetaEl.textContent = finished ? 'Done' : 'Ready';
    beatMetaEl.className = 'beat-meta' + (finished ? ' is-done' : '');
    clearPolyDots();
    if (finished) {
      setTimeout(function () {
        if (!isRunning) { beatMetaEl.textContent = 'Ready'; beatMetaEl.className = 'beat-meta'; }
      }, 1600);
    }
  }

  /* =========================================================================
     Visual sync loop
     ========================================================================= */

  var MAX_ANGLE = 26;
  var lastBeatEvent = null;

  function visualFrame() {
    if (!isRunning) return;
    var now = audioCtx.currentTime;
    while (visualQueue.length && visualQueue[0].time <= now) {
      handleVisualEvent(visualQueue.shift());
    }
    updateNeedle(now);
    requestAnimationFrame(visualFrame);
  }

  function handleVisualEvent(ev) {
    if (ev.type === 'beat') {
      lastBeatEvent = ev;
      renderBeatDots(ev.beatIndex);
      beatNumberEl.textContent = String(ev.beatIndex + 1);
      beatNumberEl.classList.remove('is-pulse');
      void beatNumberEl.offsetWidth;
      beatNumberEl.classList.add('is-pulse');

      if (ev.isPrecount) {
        beatMetaEl.textContent = 'Count-in · bar ' + ev.bar + ' of ' + ev.precountTotal;
        beatMetaEl.className = 'beat-meta is-precount';
      } else if (state.lengthMode === 'bars') {
        beatMetaEl.textContent = 'Bar ' + ev.bar + ' of ' + state.totalBars;
        beatMetaEl.className = 'beat-meta';
      } else {
        beatMetaEl.textContent = 'Bar ' + ev.bar;
        beatMetaEl.className = 'beat-meta';
      }
    } else if (ev.type === 'polyA') {
      flashPolyDot(polyRowAEl, ev.index);
    } else if (ev.type === 'polyB') {
      flashPolyDot(polyRowBEl, ev.index);
    }
  }

  function flashPolyDot(row, index) {
    var dot = row.children[index];
    if (!dot) return;
    dot.classList.add('is-active');
    setTimeout(function () { dot.classList.remove('is-active'); }, 110);
  }

  function clearPolyDots() {
    [polyRowAEl, polyRowBEl].forEach(function (row) {
      Array.prototype.forEach.call(row.children, function (d) { d.classList.remove('is-active'); });
    });
  }

  function updateNeedle(now) {
    if (!lastBeatEvent) return;
    var dur = lastBeatEvent.duration || (60 / state.bpm);
    var phase = (now - lastBeatEvent.time) / dur;
    if (phase < 0) phase = 0;
    if (phase > 1) phase = 1;
    var eased = Math.sin(Math.PI * phase);
    var angle = lastBeatEvent.parity * MAX_ANGLE * eased;
    needleEl.style.transform = 'translateX(-50%) rotate(' + angle.toFixed(2) + 'deg)';

    var t = Math.max(20, Math.min(300, state.bpm));
    var weightTop = 62 - ((t - 20) / 280) * 40; // faster tempo -> weight higher
    weightEl.style.top = weightTop + '%';
  }

  /* =========================================================================
     DOM refs
     ========================================================================= */

  var playBtn = document.getElementById('playBtn');
  var tapBtn = document.getElementById('tapBtn');
  var needleEl = document.getElementById('metroNeedle');
  var weightEl = document.getElementById('metroWeight');

  var bpmInput = document.getElementById('bpmInput');
  var bpmSlider = document.getElementById('bpmSlider');
  var bpmDown = document.getElementById('bpmDown');
  var bpmUp = document.getElementById('bpmUp');

  var beatDotsEl = document.getElementById('beatDots');
  var beatNumberEl = document.getElementById('beatNumber');
  var beatMetaEl = document.getElementById('beatMeta');

  var rhythmPresetsEl = document.getElementById('rhythmPresets');
  var numeratorInput = document.getElementById('numeratorInput');
  var denominatorInput = document.getElementById('denominatorInput');
  var subdivisionControl = document.getElementById('subdivisionControl');

  var lengthControl = document.getElementById('lengthControl');
  var barsInput = document.getElementById('barsInput');
  var precountControl = document.getElementById('precountControl');

  var polyToggle = document.getElementById('polyToggle');
  var polyAInput = document.getElementById('polyAInput');
  var polyBInput = document.getElementById('polyBInput');
  var polyVizEl = document.getElementById('polyViz');
  var polyRowAEl = document.getElementById('polyRowA');
  var polyRowBEl = document.getElementById('polyRowB');

  var soundKitEl = document.getElementById('soundKit');
  var soundAssignEl = document.getElementById('soundAssign');
  var volumeSlider = document.getElementById('volumeSlider');

  /* =========================================================================
     Rendering
     ========================================================================= */

  function setPlayButtonState(playing) {
    playBtn.classList.toggle('is-playing', playing);
    playBtn.setAttribute('aria-pressed', playing ? 'true' : 'false');
    playBtn.setAttribute('aria-label', playing ? 'Stop metronome' : 'Start metronome');
  }

  function renderBeatDots(activeIndex) {
    beatDotsEl.innerHTML = '';
    for (var i = 0; i < state.numerator; i++) {
      var dot = document.createElement('span');
      dot.className = 'beat-dot' + (i === 0 ? ' is-accent-slot' : '');
      if (typeof activeIndex === 'number' && i === activeIndex) dot.classList.add('is-active');
      beatDotsEl.appendChild(dot);
    }
  }

  function renderRhythmPresets() {
    rhythmPresetsEl.innerHTML = '';
    RHYTHM_PRESETS.forEach(function (preset) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rhythm-preset';
      btn.textContent = preset.label;
      if (preset.num === state.numerator && preset.den === state.denominator) btn.classList.add('is-active');
      btn.addEventListener('click', function () {
        state.numerator = preset.num;
        state.denominator = preset.den;
        numeratorInput.value = preset.num;
        denominatorInput.value = String(preset.den);
        syncRhythmUI();
      });
      rhythmPresetsEl.appendChild(btn);
    });
  }

  function syncRhythmUI() {
    renderRhythmPresets();
    renderBeatDots();
    renderPolyRows();
  }

  function renderPolyRows() {
    function fill(row, count) {
      row.innerHTML = '';
      for (var i = 0; i < count; i++) {
        var d = document.createElement('span');
        d.className = 'poly-dot';
        row.appendChild(d);
      }
    }
    fill(polyRowAEl, state.polyA);
    fill(polyRowBEl, state.polyB);
    polyVizEl.classList.toggle('is-enabled', state.polyEnabled);
  }

  function renderSoundKit() {
    soundKitEl.innerHTML = '';
    SOUND_TYPES.forEach(function (sound) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sound-swatch';
      btn.innerHTML = '<span>' + sound.label + '</span>' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12l4 4 10-10"></path></svg>';
      btn.addEventListener('click', function () {
        previewSound(sound.id);
        btn.classList.add('is-triggered');
        setTimeout(function () { btn.classList.remove('is-triggered'); }, 180);
      });
      soundKitEl.appendChild(btn);
    });
  }

  var ROLE_META = {
    accent: 'Accent (beat 1)',
    beat: 'Beat',
    subdivision: 'Subdivision',
    polyA: 'Polyrhythm A',
    polyB: 'Polyrhythm B'
  };

  function renderSoundAssign() {
    soundAssignEl.innerHTML = '';
    var roles = ['accent', 'beat'];
    if (!state.polyEnabled && state.subdivision > 1) roles.push('subdivision');
    if (state.polyEnabled) roles.push('polyA', 'polyB');

    roles.forEach(function (role) {
      var row = document.createElement('div');
      row.className = 'sound-assign-row';

      var label = document.createElement('label');
      var dot = document.createElement('span');
      dot.className = 'role-dot role-dot--' + role;
      label.appendChild(dot);
      label.appendChild(document.createTextNode(ROLE_META[role]));

      var select = document.createElement('select');
      SOUND_TYPES.forEach(function (sound) {
        var opt = document.createElement('option');
        opt.value = sound.id;
        opt.textContent = sound.label;
        if (state.soundAssign[role] === sound.id) opt.selected = true;
        select.appendChild(opt);
      });
      select.addEventListener('change', function () {
        state.soundAssign[role] = select.value;
      });

      row.appendChild(label);
      row.appendChild(select);
      soundAssignEl.appendChild(row);
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
     Wiring: tempo
     ========================================================================= */

  function clampBpm(v) {
    v = Math.round(v);
    if (isNaN(v)) v = state.bpm;
    return Math.max(20, Math.min(300, v));
  }

  function setBpm(v) {
    state.bpm = clampBpm(v);
    bpmInput.value = state.bpm;
    bpmSlider.value = state.bpm;
  }

  bpmInput.addEventListener('change', function () { setBpm(parseInt(bpmInput.value, 10)); });
  bpmSlider.addEventListener('input', function () { setBpm(parseInt(bpmSlider.value, 10)); });
  bpmDown.addEventListener('click', function () { setBpm(state.bpm - 1); });
  bpmUp.addEventListener('click', function () { setBpm(state.bpm + 1); });

  var tapTimes = [];
  function tapTempo() {
    var now = performance.now();
    if (tapTimes.length && now - tapTimes[tapTimes.length - 1] > 2200) tapTimes = [];
    tapTimes.push(now);
    if (tapTimes.length > 6) tapTimes.shift();
    if (tapTimes.length >= 2) {
      var intervals = [];
      for (var i = 1; i < tapTimes.length; i++) intervals.push(tapTimes[i] - tapTimes[i - 1]);
      var avg = intervals.reduce(function (a, b) { return a + b; }, 0) / intervals.length;
      setBpm(60000 / avg);
    }
    tapBtn.classList.add('is-tapped');
    setTimeout(function () { tapBtn.classList.remove('is-tapped'); }, 140);
  }

  tapBtn.addEventListener('click', tapTempo);

  /* =========================================================================
     Wiring: rhythm
     ========================================================================= */

  numeratorInput.addEventListener('change', function () {
    var v = Math.max(1, Math.min(16, parseInt(numeratorInput.value, 10) || 4));
    numeratorInput.value = v;
    state.numerator = v;
    syncRhythmUI();
  });

  denominatorInput.addEventListener('change', function () {
    state.denominator = parseInt(denominatorInput.value, 10);
    syncRhythmUI();
  });

  wireSegControl(subdivisionControl, function (value) {
    state.subdivision = parseInt(value, 10);
    renderSoundAssign();
  });

  /* =========================================================================
     Wiring: length / precount
     ========================================================================= */

  wireSegControl(lengthControl, function (value) {
    state.lengthMode = value;
    barsInput.disabled = value !== 'bars';
  });

  barsInput.addEventListener('change', function () {
    var v = Math.max(1, Math.min(999, parseInt(barsInput.value, 10) || 8));
    barsInput.value = v;
    state.totalBars = v;
  });

  wireSegControl(precountControl, function (value) {
    state.precountBars = parseInt(value, 10);
  });

  /* =========================================================================
     Wiring: polyrhythm
     ========================================================================= */

  var subdivisionButtons = subdivisionControl.querySelectorAll('button');

  polyToggle.addEventListener('change', function () {
    state.polyEnabled = polyToggle.checked;
    polyAInput.disabled = !state.polyEnabled;
    polyBInput.disabled = !state.polyEnabled;
    subdivisionControl.classList.toggle('is-disabled', state.polyEnabled);
    subdivisionButtons.forEach(function (b) { b.disabled = state.polyEnabled; });
    renderPolyRows();
    renderSoundAssign();
  });

  polyAInput.addEventListener('change', function () {
    var v = Math.max(2, Math.min(16, parseInt(polyAInput.value, 10) || 3));
    polyAInput.value = v;
    state.polyA = v;
    renderPolyRows();
  });

  polyBInput.addEventListener('change', function () {
    var v = Math.max(2, Math.min(16, parseInt(polyBInput.value, 10) || 4));
    polyBInput.value = v;
    state.polyB = v;
    renderPolyRows();
  });

  /* =========================================================================
     Wiring: sounds
     ========================================================================= */

  volumeSlider.addEventListener('input', function () {
    state.masterVolume = parseFloat(volumeSlider.value);
    if (masterGain) masterGain.gain.value = state.masterVolume;
  });

  /* =========================================================================
     Wiring: transport
     ========================================================================= */

  playBtn.addEventListener('click', function () {
    if (isRunning) stopPlayback(false); else startPlayback();
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
      if (isRunning) stopPlayback(false); else startPlayback();
      return;
    }

    if (e.key === 'ArrowUp') { e.preventDefault(); setBpm(state.bpm + (e.shiftKey ? 5 : 1)); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setBpm(state.bpm - (e.shiftKey ? 5 : 1)); return; }

    if (e.key.toLowerCase() === 't') { tapTempo(); return; }

    if (/^[1-9]$/.test(e.key)) {
      numeratorInput.value = e.key;
      state.numerator = parseInt(e.key, 10);
      syncRhythmUI();
      return;
    }
  });

  /* =========================================================================
     Init
     ========================================================================= */

  renderSoundKit();
  syncRhythmUI();
  renderSoundAssign();
  setBpm(120);
})();
