/* Music Tools — shared music-theory data and helpers used by the Tuner and
   Scale Finder (and any future tool that needs note names, frequencies, or
   instrument tuning presets). Exposes everything on window.MusicTheory. */
(function () {
  'use strict';

  var NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var NOTE_NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  var LETTER_SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  function parseNoteName(name) {
    var m = /^([A-G])(#|b)?(-?\d+)$/.exec(name);
    if (!m) return null;
    var semitone = LETTER_SEMITONE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    var octave = parseInt(m[3], 10);
    return (octave + 1) * 12 + semitone;
  }

  function midiToFreq(midi, refA4, detuneCents) {
    var effectiveA4 = (refA4 || 440) * Math.pow(2, (detuneCents || 0) / 1200);
    return effectiveA4 * Math.pow(2, (midi - 69) / 12);
  }

  function noteNameToFreq(name, refA4, detuneCents) {
    return midiToFreq(parseNoteName(name), refA4, detuneCents);
  }

  function freqToNearestChromatic(freq, refA4, detuneCents) {
    var effectiveA4 = (refA4 || 440) * Math.pow(2, (detuneCents || 0) / 1200);
    var midi = Math.round(69 + 12 * Math.log2(freq / effectiveA4));
    return {
      midi: midi,
      name: NOTE_NAMES_SHARP[((midi % 12) + 12) % 12],
      octave: Math.floor(midi / 12) - 1,
      freq: midiToFreq(midi, refA4, detuneCents)
    };
  }

  function noteNameForPc(pc, useFlats) {
    var names = useFlats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP;
    return names[((pc % 12) + 12) % 12];
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  var INSTRUMENTS = {
    guitar: {
      label: 'Guitar',
      tunings: [
        { label: 'Standard', notes: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
        { label: 'Drop D', notes: ['D2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
        { label: 'Half-Step Down', notes: ['D#2', 'G#2', 'C#3', 'F#3', 'A#3', 'D#4'] },
        { label: 'Open G', notes: ['D2', 'G2', 'D3', 'G3', 'B3', 'D4'] },
        { label: 'DADGAD', notes: ['D2', 'A2', 'D3', 'G3', 'A3', 'D4'] }
      ]
    },
    bass: {
      label: 'Bass',
      tunings: [
        { label: 'Standard', notes: ['E1', 'A1', 'D2', 'G2'] },
        { label: 'Drop D', notes: ['D1', 'A1', 'D2', 'G2'] },
        { label: '5-String', notes: ['B0', 'E1', 'A1', 'D2', 'G2'] }
      ]
    },
    ukulele: {
      label: 'Ukulele',
      tunings: [
        { label: 'Standard (High G)', notes: ['G4', 'C4', 'E4', 'A4'] },
        { label: 'Low G', notes: ['G3', 'C4', 'E4', 'A4'] },
        { label: 'Baritone', notes: ['D3', 'G3', 'B3', 'E4'] }
      ]
    },
    violin: {
      label: 'Violin',
      tunings: [
        { label: 'Standard', notes: ['G3', 'D4', 'A4', 'E5'] }
      ]
    },
    bouzouki: {
      label: 'Bouzouki',
      tunings: [
        { label: 'Irish (GDAD)', notes: ['G2', 'D3', 'A3', 'D4'] },
        { label: 'GDAE', notes: ['G2', 'D3', 'A3', 'E4'] }
      ]
    }
  };

  var INSTRUMENT_ORDER = ['guitar', 'bass', 'ukulele', 'violin', 'bouzouki'];

  window.MusicTheory = {
    NOTE_NAMES_SHARP: NOTE_NAMES_SHARP,
    NOTE_NAMES_FLAT: NOTE_NAMES_FLAT,
    parseNoteName: parseNoteName,
    midiToFreq: midiToFreq,
    noteNameToFreq: noteNameToFreq,
    freqToNearestChromatic: freqToNearestChromatic,
    noteNameForPc: noteNameForPc,
    clamp: clamp,
    INSTRUMENTS: INSTRUMENTS,
    INSTRUMENT_ORDER: INSTRUMENT_ORDER
  };
})();
