/* Music Tools — shared vocal range-type data. Originally grown inside the
   Vocal Range Finder, now shared with the Warm-up Routine Generator (which
   needs the same table to let singers "signpost" a starting key by voice
   type rather than guessing a MIDI note). A rough classical classification,
   not a rigorous one - real voice typing also weighs tone colour and where
   a voice breaks, not just its outer limits; consuming tools should say so.
   Depends on ../js/theory.js (window.MusicTheory). Exposes window.VoiceRanges. */
(function () {
  'use strict';

  // Each category overlaps its neighbors, matching how real voice types are
  // commonly taught - classify() picks whichever category's range overlaps
  // a given [lowMidi, highMidi] span the most, breaking ties by whichever
  // category's center sits closest to the span's center.
  var CATEGORIES = [
    { id: 'bass', label: 'Bass', lowMidi: 40, highMidi: 64, desc: 'The deepest common voice type, typically ranging from about E2 to E4.' },
    { id: 'baritone', label: 'Baritone', lowMidi: 45, highMidi: 69, desc: 'The most common male voice, sitting between bass and tenor, typically about A2 to A4.' },
    { id: 'tenor', label: 'Tenor', lowMidi: 48, highMidi: 72, desc: 'The highest common male voice type, typically about C3 to C5.' },
    { id: 'countertenor', label: 'Countertenor', lowMidi: 52, highMidi: 76, desc: 'A rare, high male voice singing largely in falsetto, typically about E3 to E5.' },
    { id: 'alto', label: 'Alto (Contralto)', lowMidi: 53, highMidi: 77, desc: 'The lowest common female voice, typically about F3 to F5.' },
    { id: 'mezzo', label: 'Mezzo-Soprano', lowMidi: 57, highMidi: 81, desc: 'The most common female voice, sitting between alto and soprano, typically about A3 to A5.' },
    { id: 'soprano', label: 'Soprano', lowMidi: 60, highMidi: 84, desc: 'The highest common female voice type, typically about C4 to C6.' }
  ];

  function classify(lowMidi, highMidi) {
    if (lowMidi === null || highMidi === null || lowMidi === undefined || highMidi === undefined) return null;

    var bestCat = null, bestOverlap = -1, bestCenterDist = Infinity;
    var center = (lowMidi + highMidi) / 2;

    CATEGORIES.forEach(function (cat) {
      var overlap = Math.max(0, Math.min(highMidi, cat.highMidi) - Math.max(lowMidi, cat.lowMidi));
      var catCenter = (cat.lowMidi + cat.highMidi) / 2;
      var centerDist = Math.abs(center - catCenter);
      if (overlap > bestOverlap || (overlap === bestOverlap && centerDist < bestCenterDist)) {
        bestCat = cat; bestOverlap = overlap; bestCenterDist = centerDist;
      }
    });

    return bestCat;
  }

  function byId(id) {
    for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].id === id) return CATEGORIES[i];
    return null;
  }

  window.VoiceRanges = {
    CATEGORIES: CATEGORIES,
    classify: classify,
    byId: byId
  };
})();
