/* Music Tools — shared pitch-detection algorithm used by the Tuner and the
   Fretboard Trainer's mic answer mode. Plain autocorrelation over a
   time-domain buffer, no external libraries. Exposes window.PitchDetect. */
(function () {
  'use strict';

  function autoCorrelate(buf, sampleRate) {
    var SIZE = buf.length;
    var rms = 0;
    for (var i = 0; i < SIZE; i++) { rms += buf[i] * buf[i]; }
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.01) return -1;

    var thres = 0.2;
    var r1 = 0, r2 = SIZE - 1;
    for (var i = 0; i < SIZE / 2; i++) {
      if (Math.abs(buf[i]) < thres) { r1 = i; break; }
    }
    for (var i = 1; i < SIZE / 2; i++) {
      if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; }
    }

    var trimmed = buf.slice(r1, r2);
    var n = trimmed.length;
    if (n < 8) return -1;

    var c = new Array(n).fill(0);
    for (var i = 0; i < n; i++) {
      for (var j = 0; j < n - i; j++) {
        c[i] += trimmed[j] * trimmed[j + i];
      }
    }

    var d = 0;
    while (d < n - 1 && c[d] > c[d + 1]) d++;

    var maxVal = -1, maxPos = -1;
    for (var i = d; i < n; i++) {
      if (c[i] > maxVal) { maxVal = c[i]; maxPos = i; }
    }
    var T0 = maxPos;
    if (T0 <= 0) return -1;

    if (T0 > 0 && T0 < n - 1) {
      var x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
      var a = (x1 + x3 - 2 * x2) / 2;
      var b = (x3 - x1) / 2;
      if (a !== 0) T0 = T0 - b / (2 * a);
    }

    var freq = sampleRate / T0;
    if (freq < 27 || freq > 4200) return -1;
    return freq;
  }

  window.PitchDetect = {
    autoCorrelate: autoCorrelate
  };
})();
