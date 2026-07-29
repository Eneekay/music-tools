/* Music Tools — Chord Progression Randomizer. Pulls a hand-curated bank of
   tagged progressions (vibe + genre), transposes it into the chosen key/
   mode, and plays it back as block chords. Exposes nothing globally; wires
   up on DOMContentLoaded via the IIFE tail below. */
(function () {
  'use strict';

  var MT = window.MusicTheory;
  var LETTER_SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  // Whether a minor key built on a given tonic pitch class is conventionally
  // spelled with flats — borrowed chords (bIII/bVI/bVII/bII) follow this
  // regardless of how the user happened to spell the tonic itself.
  var MINOR_FLATS = [true, false, true, true, false, true, false, true, false, false, true, false];
  var KEY_LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  var KEY_ACCIDENTALS = [
    { label: '♮', value: '' },
    { label: '♭', value: 'b' },
    { label: '♯', value: '#' }
  ];

  var QUALITY_SUFFIX = {
    maj: '', min: 'm', dim: 'dim', aug: 'aug',
    maj7: 'maj7', m7: 'm7', dom7: '7', m7b5: 'm7b5', dim7: 'dim7',
    sus2: 'sus2', sus4: 'sus4'
  };
  var QUALITY_INTERVALS = {
    maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6], aug: [0, 4, 8],
    maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], dom7: [0, 4, 7, 10],
    m7b5: [0, 3, 6, 10], dim7: [0, 3, 6, 9],
    sus2: [0, 2, 7], sus4: [0, 5, 7]
  };

  var VIBE_TAGS = [
    { id: 'upbeat', label: 'Upbeat' },
    { id: 'moody', label: 'Moody' },
    { id: 'dreamy', label: 'Dreamy' },
    { id: 'melancholic', label: 'Melancholic' },
    { id: 'epic', label: 'Epic' },
    { id: 'nostalgic', label: 'Nostalgic' },
    { id: 'romantic', label: 'Romantic' },
    { id: 'tense', label: 'Tense' },
    { id: 'playful', label: 'Playful' },
    { id: 'chill', label: 'Chill' },
    { id: 'mysterious', label: 'Mysterious' },
    { id: 'bittersweet', label: 'Bittersweet' },
    { id: 'aggressive', label: 'Aggressive' },
    { id: 'bluesy', label: 'Bluesy' }
  ];

  var GENRE_TAGS = [
    { id: 'pop', label: 'Pop' },
    { id: 'rock', label: 'Rock' },
    { id: 'blues', label: 'Blues' },
    { id: 'jazz', label: 'Jazz' },
    { id: 'metal', label: 'Metal' },
    { id: 'folk', label: 'Folk' },
    { id: 'country', label: 'Country' },
    { id: 'rnb', label: 'R&B' },
    { id: 'funk', label: 'Funk' },
    { id: 'reggae', label: 'Reggae' },
    { id: 'punk', label: 'Punk' },
    { id: 'gospel', label: 'Gospel' },
    { id: 'cinematic', label: 'Cinematic' }
  ];

  function c(roman, semitone, quality) { return { roman: roman, semitone: semitone, quality: quality }; }

  var PROGRESSIONS = [
    // ---------------- major key ----------------
    {
      id: 'axis', name: 'Axis Progression (I–V–vi–IV)', mode: 'major',
      chords: [c('I', 0, 'maj'), c('V', 7, 'maj'), c('vi', 9, 'min'), c('IV', 5, 'maj')],
      vibes: ['upbeat', 'nostalgic', 'epic'], genres: ['pop', 'rock'],
      desc: 'The four-chord backbone behind more pop hits than any other loop — stable, uplifting, and endlessly repeatable.'
    },
    {
      id: 'fifties', name: '50s Progression (I–vi–IV–V)', mode: 'major',
      chords: [c('I', 0, 'maj'), c('vi', 9, 'min'), c('IV', 5, 'maj'), c('V', 7, 'maj')],
      vibes: ['nostalgic', 'playful', 'romantic'], genres: ['pop', 'folk'],
      desc: 'The classic doo-wop turnaround — sweet, singable, and instantly familiar.'
    },
    {
      id: 'threeChord', name: 'Three-Chord Trick (I–IV–V)', mode: 'major',
      chords: [c('I', 0, 'maj'), c('IV', 5, 'maj'), c('V', 7, 'maj')],
      vibes: ['upbeat', 'playful'], genres: ['rock', 'blues', 'country', 'folk'],
      desc: 'The simplest progression that works — the foundation stone of rock & roll.'
    },
    {
      id: 'liftoff', name: 'Lift-Off (IV–I–V–vi)', mode: 'major',
      chords: [c('IV', 5, 'maj'), c('I', 0, 'maj'), c('V', 7, 'maj'), c('vi', 9, 'min')],
      vibes: ['epic', 'upbeat'], genres: ['rock', 'pop'],
      desc: 'Starting on the subdominant gives an instant sense of lift-off before landing home.'
    },
    {
      id: 'canon', name: 'Canon Progression', mode: 'major',
      chords: [c('I', 0, 'maj'), c('V', 7, 'maj'), c('vi', 9, 'min'), c('iii', 4, 'min'),
        c('IV', 5, 'maj'), c('I', 0, 'maj'), c('IV', 5, 'maj'), c('V', 7, 'maj')],
      vibes: ['romantic', 'dreamy', 'epic'], genres: ['cinematic', 'pop'],
      desc: 'The descending-bass pattern behind Pachelbel’s Canon, borrowed by generations of pop ballads.'
    },
    {
      id: 'turnaround', name: 'Jazz Turnaround (I–vi–ii–V)', mode: 'major',
      chords: [c('I', 0, 'maj'), c('vi', 9, 'min'), c('ii', 2, 'min'), c('V', 7, 'maj')],
      vibes: ['nostalgic', 'chill'], genres: ['jazz', 'pop'],
      desc: 'A smooth turnaround that cycles back to the top effortlessly — the backbone of a thousand standards.'
    },
    {
      id: 'twoFiveOne', name: 'ii–V–I', mode: 'major',
      chords: [c('ii7', 2, 'm7'), c('V7', 7, 'dom7'), c('Imaj7', 0, 'maj7')],
      vibes: ['chill', 'nostalgic'], genres: ['jazz'],
      desc: 'The single most common cadence in jazz: tension, stronger tension, release.'
    },
    {
      id: 'bittersweetThree', name: 'I–iii–IV–V', mode: 'major',
      chords: [c('I', 0, 'maj'), c('iii', 4, 'min'), c('IV', 5, 'maj'), c('V', 7, 'maj')],
      vibes: ['bittersweet', 'romantic'], genres: ['pop', 'folk'],
      desc: 'The iii chord casts a wistful shade before the progression resolves upward.'
    },
    {
      id: 'drivingMajor', name: 'I–V–IV–V', mode: 'major',
      chords: [c('I', 0, 'maj'), c('V', 7, 'maj'), c('IV', 5, 'maj'), c('V', 7, 'maj')],
      vibes: ['upbeat', 'aggressive'], genres: ['rock', 'punk'],
      desc: 'A relentless back-and-forth between tonic and dominant with a quick subdominant lift.'
    },
    {
      id: 'bluesyMajor', name: 'I–IV–I–V (Major Blues Skeleton)', mode: 'major',
      chords: [c('I7', 0, 'dom7'), c('IV7', 5, 'dom7'), c('I7', 0, 'dom7'), c('V7', 7, 'dom7')],
      vibes: ['bluesy', 'upbeat'], genres: ['blues', 'rock', 'country'],
      desc: 'A stripped-down blues shuffle skeleton, all dominant sevenths, built for a I-IV-I-V groove.'
    },
    {
      id: 'gospelClimb', name: 'Gospel Climb (I–iii–vi–IV)', mode: 'major',
      chords: [c('I', 0, 'maj'), c('iii', 4, 'min'), c('vi', 9, 'min'), c('IV', 5, 'maj')],
      vibes: ['epic', 'romantic'], genres: ['gospel', 'rnb', 'pop'],
      desc: 'A rising, soulful climb often heard in gospel and R&B ballads.'
    },
    {
      id: 'funkVamp', name: 'Funk Vamp (I7–IV7)', mode: 'major',
      chords: [c('I7', 0, 'dom7'), c('IV7', 5, 'dom7')],
      vibes: ['playful', 'chill'], genres: ['funk', 'rnb'],
      desc: 'A two-chord dominant-7 vamp built for groove, not resolution — loop it and lock in.'
    },
    {
      id: 'frontPorch', name: 'Front Porch Roll (I–V–IV–I)', mode: 'major',
      chords: [c('I', 0, 'maj'), c('V', 7, 'maj'), c('IV', 5, 'maj'), c('I', 0, 'maj')],
      vibes: ['chill', 'nostalgic'], genres: ['country', 'folk'],
      desc: 'Circles home by way of the dominant and subdominant — classic front-porch changes.'
    },
    {
      id: 'reggaeSkank', name: 'Reggae Skank (I–V)', mode: 'major',
      chords: [c('I', 0, 'maj'), c('V', 7, 'maj')],
      vibes: ['chill', 'playful'], genres: ['reggae'],
      desc: 'A simple two-chord skank — it’s all about the offbeat rhythm, not the harmonic motion.'
    },
    {
      id: 'loungeMajor7', name: 'Lounge Turnaround (Imaj7–vi7–ii7–V7)', mode: 'major',
      chords: [c('Imaj7', 0, 'maj7'), c('vi7', 9, 'm7'), c('ii7', 2, 'm7'), c('V7', 7, 'dom7')],
      vibes: ['chill', 'romantic', 'nostalgic'], genres: ['jazz', 'rnb'],
      desc: 'Full seventh-chord colors over the vi-ii-V turnaround for a lounge, late-night feel.'
    },
    {
      id: 'hazySus', name: 'Hazy Suspension (Isus4–I–Vsus4–V)', mode: 'major',
      chords: [c('Isus4', 0, 'sus4'), c('I', 0, 'maj'), c('Vsus4', 7, 'sus4'), c('V', 7, 'maj')],
      vibes: ['dreamy', 'mysterious'], genres: ['pop', 'cinematic'],
      desc: 'Suspended chords blur the major/minor line for a hazy, unresolved openness.'
    },
    {
      id: 'twelveBar', name: '12-Bar Blues', mode: 'major',
      chords: [c('I7', 0, 'dom7'), c('I7', 0, 'dom7'), c('I7', 0, 'dom7'), c('I7', 0, 'dom7'),
        c('IV7', 5, 'dom7'), c('IV7', 5, 'dom7'), c('I7', 0, 'dom7'), c('I7', 0, 'dom7'),
        c('V7', 7, 'dom7'), c('IV7', 5, 'dom7'), c('I7', 0, 'dom7'), c('V7', 7, 'dom7')],
      vibes: ['bluesy', 'upbeat', 'moody'], genres: ['blues', 'rock', 'jazz'],
      desc: 'The single most important form in blues, early rock & roll, and jazz standards.'
    },
    {
      id: 'popPunk', name: 'Pop-Punk Charge (V–vi–IV–I)', mode: 'major',
      chords: [c('V', 7, 'maj'), c('vi', 9, 'min'), c('IV', 5, 'maj'), c('I', 0, 'maj')],
      vibes: ['upbeat', 'aggressive'], genres: ['punk', 'rock'],
      desc: 'The same four chords as the Axis progression, reordered to punch harder from the top.'
    },
    // ---------------- minor key ----------------
    {
      id: 'epicMinor', name: 'Epic Minor (i–VI–III–VII)', mode: 'minor',
      chords: [c('i', 0, 'min'), c('VI', 8, 'maj'), c('III', 3, 'maj'), c('VII', 10, 'maj')],
      vibes: ['epic', 'moody', 'tense'], genres: ['rock', 'metal', 'cinematic'],
      desc: 'A dramatic, ascending loop that’s become the go-to ‘epic trailer’ minor-key progression.'
    },
    {
      id: 'minorBlues', name: 'Minor Blues (i7–iv7–V7)', mode: 'minor',
      chords: [c('i7', 0, 'm7'), c('iv7', 5, 'm7'), c('V7', 7, 'dom7')],
      vibes: ['moody', 'bluesy', 'tense'], genres: ['blues', 'rock', 'metal'],
      desc: 'The minor-key blues skeleton — dark, direct, and endlessly reusable.'
    },
    {
      id: 'andalusian', name: 'Andalusian Cadence (i–VII–VI–V)', mode: 'minor',
      chords: [c('i', 0, 'min'), c('VII', 10, 'maj'), c('VI', 8, 'maj'), c('V', 7, 'maj')],
      vibes: ['mysterious', 'tense', 'epic'], genres: ['cinematic', 'rock'],
      desc: 'A descending stepwise bassline with deep flamenco and classical roots.'
    },
    {
      id: 'darkPop', name: 'Dark Pop Vamp (i–VI–VII)', mode: 'minor',
      chords: [c('i', 0, 'min'), c('VI', 8, 'maj'), c('VII', 10, 'maj')],
      vibes: ['moody', 'mysterious'], genres: ['pop', 'rock'],
      desc: 'A brooding two-step vamp between the tonic and its major neighbors.'
    },
    {
      id: 'wistfulBallad', name: 'Wistful Ballad (i–v–VI–iv)', mode: 'minor',
      chords: [c('i', 0, 'min'), c('v', 7, 'min'), c('VI', 8, 'maj'), c('iv', 5, 'min')],
      vibes: ['melancholic', 'dreamy'], genres: ['pop', 'folk'],
      desc: 'A gentle minor-key loop that never quite resolves — perfect for wistful verses.'
    },
    {
      id: 'metalDrive', name: 'Metal Drive (VI–VII–i)', mode: 'minor',
      chords: [c('VI', 8, 'maj'), c('VII', 10, 'maj'), c('i', 0, 'min')],
      vibes: ['aggressive', 'tense', 'epic'], genres: ['metal', 'rock'],
      desc: 'Charges upward into the tonic for a driving, unresolved riff loop.'
    },
    {
      id: 'harmonicCadence', name: 'Harmonic Minor Cadence (i–iv–V)', mode: 'minor',
      chords: [c('i', 0, 'min'), c('iv', 5, 'min'), c('V', 7, 'maj')],
      vibes: ['tense', 'mysterious', 'epic'], genres: ['metal', 'cinematic'],
      desc: 'The raised 7th turns V into a major chord, adding a dramatic, classical-leaning pull to the tonic.'
    },
    {
      id: 'minorTwoFiveOne', name: 'Minor ii–V–i', mode: 'minor',
      chords: [c('iiø', 2, 'm7b5'), c('V7', 7, 'dom7'), c('i', 0, 'min')],
      vibes: ['moody', 'chill'], genres: ['jazz'],
      desc: 'The minor-key answer to ii-V-I, using a half-diminished ii for extra tension.'
    },
    {
      id: 'soulfulMinor', name: 'Soulful Descent (i–III–VII–VI)', mode: 'minor',
      chords: [c('i', 0, 'min'), c('III', 3, 'maj'), c('VII', 10, 'maj'), c('VI', 8, 'maj')],
      vibes: ['melancholic', 'bittersweet'], genres: ['rnb', 'pop'],
      desc: 'A soulful descending loop, popular in emotional R&B ballads.'
    },
    {
      id: 'reggaeMinor', name: 'Reggae Minor Skank (i–VII)', mode: 'minor',
      chords: [c('i', 0, 'min'), c('VII', 10, 'maj')],
      vibes: ['chill', 'moody'], genres: ['reggae'],
      desc: 'A minor-key two-chord skank loop — moodier than its major cousin, same laid-back pocket.'
    },
    {
      id: 'funkMinor', name: 'Minor Funk Pocket (i7–iv7)', mode: 'minor',
      chords: [c('i7', 0, 'm7'), c('iv7', 5, 'm7')],
      vibes: ['playful', 'moody'], genres: ['funk'],
      desc: 'A minor-key two-chord groove pocket — all pocket, no resolution.'
    },
    {
      id: 'neapolitan', name: 'Neapolitan Pull (i–♭II–V–i)', mode: 'minor',
      chords: [c('i', 0, 'min'), c('♭II', 1, 'maj'), c('V', 7, 'maj'), c('i', 0, 'min')],
      vibes: ['tense', 'mysterious'], genres: ['metal', 'cinematic'],
      desc: 'The Neapolitan ♭II chord gives an unsettling half-step pull into the dominant before resolving home.'
    }
  ];

  var state = {
    keyLetter: 'C',
    keyAccidental: '',
    keyPc: 0,
    keyFlats: false,
    mode: 'major',
    waveform: 'triangle',
    tempo: 100,
    selectedVibes: [],
    selectedGenres: [],
    current: null,
    history: [],
    isPlaying: false
  };

  var keyNoteChipsEl = document.getElementById('keyNoteChips');
  var keyAccidentalChipsEl = document.getElementById('keyAccidentalChips');
  var keyModeControlEl = document.getElementById('keyModeControl');
  var waveControlEl = document.getElementById('waveControl');
  var vibeChipsEl = document.getElementById('vibeChips');
  var genreChipsEl = document.getElementById('genreChips');
  var clearVibesBtn = document.getElementById('clearVibes');
  var clearGenresBtn = document.getElementById('clearGenres');
  var tagsHintEl = document.getElementById('tagsHint');
  var progressionNameEl = document.getElementById('progressionName');
  var progressionDescEl = document.getElementById('progressionDesc');
  var progressionMetaEl = document.getElementById('progressionMeta');
  var generateBtn = document.getElementById('generateBtn');
  var regenerateBtn = document.getElementById('regenerateBtn');
  var chordStripEl = document.getElementById('chordStrip');
  var playAllBtn = document.getElementById('playAllBtn');
  var playAllLabelEl = document.getElementById('playAllLabel');
  var tempoControlEl = document.getElementById('tempoControl');
  var historyEmptyEl = document.getElementById('historyEmpty');
  var historyListEl = document.getElementById('historyList');

  /* =========================================================================
     Key builder
     ========================================================================= */

  function applyKeyBuilder() {
    var pc = (((LETTER_SEMITONE[state.keyLetter] + (state.keyAccidental === '#' ? 1 : state.keyAccidental === 'b' ? -1 : 0)) % 12) + 12) % 12;
    state.keyPc = pc;
    state.keyFlats = state.keyAccidental === 'b';
    renderChordStrip();
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

  /* =========================================================================
     Tag filters
     ========================================================================= */

  function toggleTag(list, id) {
    var i = list.indexOf(id);
    if (i === -1) list.push(id); else list.splice(i, 1);
  }

  function renderVibeChips() {
    vibeChipsEl.innerHTML = '';
    VIBE_TAGS.forEach(function (tag) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'builder-chip' + (state.selectedVibes.indexOf(tag.id) !== -1 ? ' is-active' : '');
      btn.textContent = tag.label;
      btn.addEventListener('click', function () {
        toggleTag(state.selectedVibes, tag.id);
        renderVibeChips();
        updateTagsHint();
      });
      vibeChipsEl.appendChild(btn);
    });
  }

  function renderGenreChips() {
    genreChipsEl.innerHTML = '';
    GENRE_TAGS.forEach(function (tag) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'builder-chip' + (state.selectedGenres.indexOf(tag.id) !== -1 ? ' is-active' : '');
      btn.textContent = tag.label;
      btn.addEventListener('click', function () {
        toggleTag(state.selectedGenres, tag.id);
        renderGenreChips();
        updateTagsHint();
      });
      genreChipsEl.appendChild(btn);
    });
  }

  function intersects(a, b) {
    for (var i = 0; i < a.length; i++) if (b.indexOf(a[i]) !== -1) return true;
    return false;
  }

  function getCandidates() {
    return PROGRESSIONS.filter(function (p) {
      if (p.mode !== state.mode) return false;
      if (state.selectedVibes.length && !intersects(p.vibes, state.selectedVibes)) return false;
      if (state.selectedGenres.length && !intersects(p.genres, state.selectedGenres)) return false;
      return true;
    });
  }

  function updateTagsHint() {
    var n = getCandidates().length;
    if (!state.selectedVibes.length && !state.selectedGenres.length) {
      tagsHintEl.textContent = n + ' progression' + (n === 1 ? '' : 's') + ' in the ' + state.mode + '-key bank. Leave everything unselected to draw from all of them.';
    } else if (n === 0) {
      tagsHintEl.textContent = 'No progressions match those tags in ' + state.mode + ' — try clearing a filter.';
    } else {
      tagsHintEl.textContent = n + ' progression' + (n === 1 ? '' : 's') + ' match' + (n === 1 ? 'es' : '') + ' your current filters.';
    }
  }

  /* =========================================================================
     Chord naming + generation
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

  function tagLabel(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i].label;
    return id;
  }

  function renderMeta(entry) {
    progressionMetaEl.innerHTML = '';
    entry.vibes.forEach(function (id) {
      var span = document.createElement('span');
      span.className = 'meta-tag meta-tag--vibe';
      span.textContent = tagLabel(VIBE_TAGS, id);
      progressionMetaEl.appendChild(span);
    });
    entry.genres.forEach(function (id) {
      var span = document.createElement('span');
      span.className = 'meta-tag meta-tag--genre';
      span.textContent = tagLabel(GENRE_TAGS, id);
      progressionMetaEl.appendChild(span);
    });
  }

  function renderChordStrip() {
    chordStripEl.innerHTML = '';
    if (!state.current) {
      var empty = document.createElement('p');
      empty.className = 'chord-strip-empty';
      empty.textContent = 'No progression loaded yet.';
      chordStripEl.appendChild(empty);
      return;
    }
    state.current.chords.forEach(function (chord, idx) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chord-chip';
      chip.dataset.index = String(idx);

      var roman = document.createElement('span');
      roman.className = 'chord-chip-roman';
      roman.textContent = chord.roman;

      var name = document.createElement('span');
      name.className = 'chord-chip-name';
      name.textContent = chordName(chord);

      chip.appendChild(roman);
      chip.appendChild(name);
      chip.addEventListener('click', function () {
        playChordAt(idx);
      });
      chordStripEl.appendChild(chip);
    });
  }

  function keyLabel() {
    return MT.noteNameForPc(state.keyPc, state.keyFlats) + (state.mode === 'major' ? ' Major' : ' Minor');
  }

  function loadEntry(entry) {
    state.current = entry;
    progressionNameEl.textContent = entry.name;
    progressionDescEl.textContent = entry.desc;
    renderMeta(entry);
    renderChordStrip();
  }

  function addToHistory(entry) {
    state.history.unshift({ entry: entry, keyPc: state.keyPc, keyFlats: state.keyFlats, mode: state.mode, keyLetter: state.keyLetter, keyAccidental: state.keyAccidental });
    if (state.history.length > 8) state.history.length = 8;
    renderHistory();
  }

  function renderHistory() {
    if (!state.history.length) {
      historyEmptyEl.hidden = false;
      historyListEl.innerHTML = '';
      return;
    }
    historyEmptyEl.hidden = true;
    historyListEl.innerHTML = '';
    state.history.forEach(function (item) {
      var row = document.createElement('button');
      row.type = 'button';
      row.className = 'history-item';

      var keySpan = document.createElement('span');
      keySpan.className = 'history-item-key';
      keySpan.textContent = MT.noteNameForPc(item.keyPc, item.keyFlats) + (item.mode === 'major' ? ' Maj' : ' Min');

      var nameSpan = document.createElement('span');
      nameSpan.className = 'history-item-name';
      nameSpan.textContent = item.entry.name;

      var chordsSpan = document.createElement('span');
      chordsSpan.className = 'history-item-chords';
      chordsSpan.textContent = item.entry.chords.map(function (ch) { return ch.roman; }).join(' – ');

      row.appendChild(keySpan);
      row.appendChild(nameSpan);
      row.appendChild(chordsSpan);

      row.addEventListener('click', function () {
        state.keyLetter = item.keyLetter;
        state.keyAccidental = item.keyAccidental;
        state.mode = item.mode;
        renderKeyNoteChips();
        renderKeyAccidentalChips();
        wireModeButtonsActive();
        applyKeyBuilder();
        loadEntry(item.entry);
      });

      historyListEl.appendChild(row);
    });
  }

  function generate(avoidCurrent) {
    var pool = getCandidates();
    if (!pool.length) {
      state.current = null;
      progressionNameEl.textContent = '—';
      progressionDescEl.textContent = 'No progressions match those tags — clear a filter and try again.';
      progressionMetaEl.innerHTML = '';
      renderChordStrip();
      return;
    }
    var choice = pool[Math.floor(Math.random() * pool.length)];
    if (avoidCurrent && pool.length > 1 && state.current && choice.id === state.current.id) {
      var others = pool.filter(function (p) { return p.id !== state.current.id; });
      choice = others[Math.floor(Math.random() * others.length)];
    }
    loadEntry(choice);
    addToHistory(choice);
  }

  /* =========================================================================
     Audio
     ========================================================================= */

  var audioCtx = null;

  function ensureAudioContext() {
    if (audioCtx) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AC();
  }

  function playNote(midi, time, duration, gainShare) {
    var freq = MT.midiToFreq(midi);
    if (state.waveform === 'realistic') {
      window.InstrumentTones.playRealistic(audioCtx, audioCtx.destination, 'guitar', freq, time, 0.55 * gainShare);
      return;
    }
    var dur = duration || 1.1;
    var vol = 0.55 * gainShare;
    var osc = audioCtx.createOscillator();
    osc.type = state.waveform;
    osc.frequency.setValueAtTime(freq, time);
    var gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(vol, time + 0.02);
    gain.gain.setValueAtTime(vol, time + Math.max(dur - 0.18, 0.03));
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(time); osc.stop(time + dur + 0.05);
  }

  function playChordTones(tones, time, duration) {
    var gainShare = 1 / Math.max(tones.length - 1, 2);
    tones.forEach(function (midi) { playNote(midi, time, duration, gainShare); });
  }

  function playChordAt(idx) {
    if (!state.current) return;
    ensureAudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    var chord = state.current.chords[idx];
    playChordTones(chordMidiTones(chord), audioCtx.currentTime, 1.1);
    flashChip(idx, 550);
  }

  function flashChip(idx, ms) {
    var chip = chordStripEl.querySelector('.chord-chip[data-index="' + idx + '"]');
    if (!chip) return;
    chip.classList.add('is-playing');
    setTimeout(function () { chip.classList.remove('is-playing'); }, ms);
  }

  var loopTimer = null;

  // Loops until stopPlaying() is called: each pass re-reads state.current /
  // state.tempo / state.keyPc fresh, so switching progressions, key or
  // tempo mid-loop takes effect seamlessly on the next pass rather than
  // requiring a stop/restart.
  function scheduleLoopPass() {
    if (!state.isPlaying || !state.current) { stopPlaying(); return; }

    var beatDur = 60 / state.tempo * 2; // two beats per chord
    var startTime = audioCtx.currentTime + 0.05;
    var chords = state.current.chords;

    chords.forEach(function (chord, idx) {
      var t = startTime + idx * beatDur;
      playChordTones(chordMidiTones(chord), t, beatDur * 0.92);
      var delayMs = Math.max(0, (t - audioCtx.currentTime) * 1000);
      setTimeout(function () { if (state.isPlaying) flashChip(idx, beatDur * 1000 * 0.92); }, delayMs);
    });

    var totalMs = chords.length * beatDur * 1000;
    loopTimer = setTimeout(scheduleLoopPass, totalMs);
  }

  function startPlaying() {
    if (!state.current || state.isPlaying) return;
    ensureAudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    state.isPlaying = true;
    playAllBtn.classList.add('is-playing');
    playAllLabelEl.textContent = 'Stop';
    scheduleLoopPass();
  }

  function stopPlaying() {
    state.isPlaying = false;
    if (loopTimer) { clearTimeout(loopTimer); loopTimer = null; }
    playAllBtn.classList.remove('is-playing');
    playAllLabelEl.textContent = 'Play Progression';
  }

  function togglePlaying() {
    if (state.isPlaying) stopPlaying(); else startPlaying();
  }

  /* =========================================================================
     Wiring
     ========================================================================= */

  function wireSegControl(el, onChange) {
    el.querySelectorAll('button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        el.querySelectorAll('button').forEach(function (b) { b.classList.remove('is-active'); });
        btn.classList.add('is-active');
        onChange(btn.dataset.value);
      });
    });
  }

  function wireModeButtonsActive() {
    keyModeControlEl.querySelectorAll('button').forEach(function (b) {
      b.classList.toggle('is-active', b.dataset.value === state.mode);
    });
  }

  wireSegControl(keyModeControlEl, function (val) {
    state.mode = val;
    updateTagsHint();
    generate(false);
  });

  wireSegControl(waveControlEl, function (val) { state.waveform = val; });

  wireSegControl(tempoControlEl, function (val) { state.tempo = parseInt(val, 10); });

  clearVibesBtn.addEventListener('click', function () {
    state.selectedVibes = [];
    renderVibeChips();
    updateTagsHint();
  });

  clearGenresBtn.addEventListener('click', function () {
    state.selectedGenres = [];
    renderGenreChips();
    updateTagsHint();
  });

  generateBtn.addEventListener('click', function () { generate(false); });
  regenerateBtn.addEventListener('click', function () { generate(true); });
  playAllBtn.addEventListener('click', togglePlaying);

  function isTypingTarget(el) {
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
  }

  window.addEventListener('keydown', function (e) {
    if (isTypingTarget(e.target)) return;
    if (e.code === 'Space') {
      e.preventDefault();
      playAllBtn.click();
    } else if (e.key === 'g' || e.key === 'G') {
      regenerateBtn.click();
    }
  });

  /* =========================================================================
     Init
     ========================================================================= */

  renderKeyNoteChips();
  renderKeyAccidentalChips();
  renderVibeChips();
  renderGenreChips();
  applyKeyBuilder();
  updateTagsHint();
  generate(false); // default: a friendly demo progression on load
})();
