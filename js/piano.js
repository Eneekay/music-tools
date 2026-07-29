/* Music Tools — shared piano-keyboard rendering, used by any tool that
   offers a "Piano" view alongside its fretboard-family instruments (Scale
   Finder, the Ear Trainer). Piano doesn't fit the open-string "tunings"
   model the other instruments use, so it's treated as its own thing rather
   than shoehorned into MusicTheory.INSTRUMENTS. No external libraries.
   Exposes window.PianoKeyboard. */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  var WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
  var BLACK_PCS = [1, 3, 6, 8, 10];

  // A reasonable default range for scale/interval visualization - three
  // octaves gives enough room to see a scale pattern repeat without the
  // keyboard becoming unwieldy.
  var DEFAULT_LOW_MIDI = 48;  // C3
  var DEFAULT_HIGH_MIDI = 83; // B5

  function isWhitePc(pc) { return WHITE_PCS.indexOf(pc) !== -1; }

  // Renders into `svg` (an existing <svg> element). `opts`:
  //   lowMidi, highMidi   - key range (defaults to a 3-octave C3-B5 span)
  //   whiteKeyWidth, keyHeight - sizing (defaults tuned for a widget-width view)
  //   getKeyInfo(midi)    - optional; return { className, label } to style/label a key
  //   onKeyClick(midi)    - optional; click handler per key
  function render(svg, opts) {
    opts = opts || {};
    var lowMidi = opts.lowMidi !== undefined ? opts.lowMidi : DEFAULT_LOW_MIDI;
    var highMidi = opts.highMidi !== undefined ? opts.highMidi : DEFAULT_HIGH_MIDI;
    var whiteKeyW = opts.whiteKeyWidth || 26;
    var keyH = opts.keyHeight || 120;
    var blackKeyW = whiteKeyW * 0.62;
    var blackKeyH = keyH * 0.6;

    var whiteMidis = [];
    for (var m = lowMidi; m <= highMidi; m++) {
      if (isWhitePc(((m % 12) + 12) % 12)) whiteMidis.push(m);
    }
    var whiteIndexByMidi = {};
    whiteMidis.forEach(function (wm, i) { whiteIndexByMidi[wm] = i; });

    var width = whiteMidis.length * whiteKeyW;
    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + keyH);
    svg.innerHTML = '';

    whiteMidis.forEach(function (wm, i) {
      var info = opts.getKeyInfo ? (opts.getKeyInfo(wm) || {}) : {};
      var rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('class', 'piano-key piano-key--white' + (info.className ? ' ' + info.className : ''));
      rect.setAttribute('data-midi', wm);
      rect.setAttribute('x', i * whiteKeyW);
      rect.setAttribute('y', 0);
      rect.setAttribute('width', whiteKeyW - 1);
      rect.setAttribute('height', keyH);
      rect.setAttribute('rx', 3);
      if (opts.onKeyClick) {
        rect.addEventListener('click', function () { opts.onKeyClick(wm); });
      }
      svg.appendChild(rect);
      if (info.label) {
        var text = document.createElementNS(SVG_NS, 'text');
        text.setAttribute('class', 'piano-key-label');
        text.setAttribute('x', i * whiteKeyW + whiteKeyW / 2);
        text.setAttribute('y', keyH - 10);
        text.textContent = info.label;
        svg.appendChild(text);
      }
    });

    for (var bm = lowMidi; bm <= highMidi; bm++) {
      var pc = ((bm % 12) + 12) % 12;
      if (isWhitePc(pc)) continue;
      var belowWhiteIdx = whiteIndexByMidi[bm - 1];
      if (belowWhiteIdx === undefined) continue;

      var infoB = opts.getKeyInfo ? (opts.getKeyInfo(bm) || {}) : {};
      var blackX = (belowWhiteIdx + 1) * whiteKeyW - blackKeyW / 2;
      var rectB = document.createElementNS(SVG_NS, 'rect');
      rectB.setAttribute('class', 'piano-key piano-key--black' + (infoB.className ? ' ' + infoB.className : ''));
      rectB.setAttribute('data-midi', bm);
      rectB.setAttribute('x', blackX);
      rectB.setAttribute('y', 0);
      rectB.setAttribute('width', blackKeyW);
      rectB.setAttribute('height', blackKeyH);
      rectB.setAttribute('rx', 2);
      if (opts.onKeyClick) {
        (function (mm) { rectB.addEventListener('click', function () { opts.onKeyClick(mm); }); })(bm);
      }
      svg.appendChild(rectB);
      if (infoB.label) {
        var textB = document.createElementNS(SVG_NS, 'text');
        textB.setAttribute('class', 'piano-key-label piano-key-label--black');
        textB.setAttribute('x', blackX + blackKeyW / 2);
        textB.setAttribute('y', blackKeyH - 10);
        textB.textContent = infoB.label;
        svg.appendChild(textB);
      }
    }
  }

  window.PianoKeyboard = {
    render: render,
    WHITE_PCS: WHITE_PCS,
    BLACK_PCS: BLACK_PCS,
    DEFAULT_LOW_MIDI: DEFAULT_LOW_MIDI,
    DEFAULT_HIGH_MIDI: DEFAULT_HIGH_MIDI
  };
})();
