// Original effects made with oscillators so every sound is available offline.
const effects = [
  { name: 'Clown horn', wave: 'square', notes: [[0, .13, 310, 280], [.16, .18, 310, 210]] },
  { name: 'Quack', wave: 'sawtooth', notes: [[0, .11, 495, 205], [.14, .09, 430, 175]] },
  { name: 'Boing', wave: 'triangle', notes: [[0, .1, 150, 660], [.1, .29, 660, 175]] },
  { name: 'Sad trombone', wave: 'sawtooth', notes: [[0, .14, 350, 325], [.15, .14, 320, 285], [.3, .27, 275, 185]] },
  { name: 'Rubber chicken', wave: 'triangle', notes: [[0, .12, 780, 1120], [.12, .16, 1120, 380]] },
  { name: 'Robot hiccup', wave: 'square', notes: [[0, .07, 385, 385], [.1, .09, 620, 620], [.21, .12, 255, 370]] },
  { name: 'Slide whistle', wave: 'sine', notes: [[0, .19, 390, 1150], [.19, .22, 1150, 480]] },
  { name: 'Raspberry', wave: 'sawtooth', notes: [[0, .08, 145, 93], [.09, .07, 165, 100], [.17, .09, 155, 70], [.26, .12, 133, 62]] },
];
const pitches = [
  { label: '', scale: 1 },
  { label: ' (high)', scale: 1.5 },
  { label: ' (low)', scale: .74 },
  { label: ' (squeaky)', scale: 1.95 },
];

export const buzzerPresets = pitches.flatMap(({label, scale}) =>
  effects.map(effect => ({...effect, name: effect.name + label, scale}))
);

export function playBuzzer(context, index) {
  const preset = buzzerPresets[index];
  if (!preset || context?.state !== 'running') return;
  const start = context.currentTime + .012;
  for (const [offset, duration, from, to] of preset.notes) {
    const at = start + offset;
    const end = at + duration;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = preset.wave;
    oscillator.frequency.setValueAtTime(from * preset.scale, at);
    oscillator.frequency.exponentialRampToValueAtTime(to * preset.scale, end);
    gain.gain.setValueAtTime(.001, at);
    gain.gain.linearRampToValueAtTime(.13, at + .012);
    gain.gain.exponentialRampToValueAtTime(.001, end);
    oscillator.connect(gain).connect(context.destination);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start(at);
    oscillator.stop(end);
  }
}
