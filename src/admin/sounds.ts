// Sounds for the panel, made on the fly (no files to load, works offline):
//   tap()      a soft tick for every button press on the cashier
//   rungUp()   a clear two-note chime when an order is rung up or saved
//   siteOrder() loud and long, for a new website order or a scheduled-order reminder
let audio: AudioContext | null = null;
function context(): AudioContext | null {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    audio ??= new Ctx();
    if (audio.state === 'suspended') void audio.resume();
    return audio;
  } catch { return null; }
}
function tone(frequency: number, at: number, length: number, volume: number, type: OscillatorType = 'triangle') {
  const ctx = context();
  if (!ctx) return;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  const start = ctx.currentTime + at;
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + length + 0.02);
}

export function tap() { tone(1800, 0, 0.04, 0.06, 'sine'); }
export function rungUp() { tone(880, 0, 0.16, 0.35); tone(1320, 0.14, 0.3, 0.4); }
export function siteOrder() {
  // Three rounds of a rising three-note call, about 3 seconds in all.
  [0, 1, 2].forEach((round) => {
    const base = round * 1.0;
    tone(784, base, 0.22, 0.6);
    tone(988, base + 0.22, 0.22, 0.6);
    tone(1319, base + 0.44, 0.4, 0.7);
  });
  navigator.vibrate?.([400, 150, 400, 150, 400]);
}
// The browser only plays sound after a first touch or click on the page; this wakes it up.
export function unlock() { context(); }
