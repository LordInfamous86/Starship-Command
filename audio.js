(() => {
  const KEY = 'starship-command-audio-enabled-v1';
  const CHORD_ROOTS = [130.81, 110, 87.31, 98];
  let enabled = localStorage.getItem(KEY) !== 'false';
  let context, master, musicBus, reverb, reverbSend, voices = [], ambienceTimer;
  let chordIndex = 0;

  function makeReverb() {
    reverb = context.createConvolver();
    const length = Math.floor(context.sampleRate * 3.2);
    const impulse = context.createBuffer(2, length, context.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const samples = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        const fade = Math.pow(1 - i / length, 3.4);
        samples[i] = (Math.random() * 2 - 1) * fade;
      }
    }
    reverb.buffer = impulse;
    reverb.normalize = true;
    reverbSend = context.createGain();
    reverbSend.gain.value = 0.22;
    reverb.connect(reverbSend);
    reverbSend.connect(master);
  }

  function initialize() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return false;
    if (context) return true;

    context = new AudioContext();
    master = context.createGain();
    master.gain.value = 0.4;
    master.connect(context.destination);
    makeReverb();

    musicBus = context.createGain();
    musicBus.gain.value = 0;
    musicBus.connect(master);
    musicBus.connect(reverb);

    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1800;
    filter.Q.value = 0.35;
    filter.connect(musicBus);

    const ratios = [0.5, 1, 1.5, 2, 2.5];
    const levels = [0.07, 0.12, 0.075, 0.045, 0.022];
    voices = ratios.map((ratio, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = CHORD_ROOTS[0] * ratio;
      gain.gain.value = levels[index];
      oscillator.connect(gain);
      gain.connect(filter);
      oscillator.start();
      return oscillator;
    });
    return true;
  }

  function updateButton() {
    const button = document.getElementById('audio-toggle');
    if (!button) return;
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute('aria-label', enabled ? 'Mute sound' : 'Turn sound on');
    button.title = enabled ? 'Mute sound' : 'Turn sound on';
    button.innerHTML = '♫ <span>SOUND ' + (enabled ? 'ON' : 'OFF') + '</span>';
  }

  function moveChord() {
    if (!enabled || !context || context.state !== 'running') return;
    chordIndex = (chordIndex + 1) % CHORD_ROOTS.length;
    const root = CHORD_ROOTS[chordIndex];
    const now = context.currentTime;
    voices.forEach((voice, index) => {
      const ratio = [0.5, 1, 1.5, 2, 2.5][index];
      voice.frequency.setTargetAtTime(root * ratio, now, 2.4);
    });
    ambienceTimer = window.setTimeout(moveChord, 11000);
  }

  function start() {
    if (!enabled || !initialize()) return;
    context.resume().then(() => {
      const now = context.currentTime;
      musicBus.gain.cancelScheduledValues(now);
      musicBus.gain.setTargetAtTime(0.82, now, 1.4);
      if (!ambienceTimer) ambienceTimer = window.setTimeout(moveChord, 11000);
    });
  }

  function setEnabled(value) {
    enabled = Boolean(value);
    localStorage.setItem(KEY, String(enabled));
    updateButton();
    if (!enabled) {
      window.clearTimeout(ambienceTimer);
      ambienceTimer = null;
      if (musicBus && context) {
        const now = context.currentTime;
        musicBus.gain.cancelScheduledValues(now);
        musicBus.gain.setTargetAtTime(0, now, 0.18);
      }
    }
  }

  function sweep(from, to, duration, volume, delay, echo) {
    if (!enabled || !initialize()) return;
    const begin = context.currentTime + (delay || 0);
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2600, begin);
    filter.frequency.exponentialRampToValueAtTime(700, begin + duration);
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(Math.max(1, from), begin);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), begin + duration);
    envelope.gain.setValueAtTime(0.001, begin);
    envelope.gain.exponentialRampToValueAtTime(volume, begin + Math.min(0.09, duration * 0.3));
    envelope.gain.exponentialRampToValueAtTime(0.001, begin + duration);
    oscillator.connect(filter);
    filter.connect(envelope);
    envelope.connect(master);
    if (echo) envelope.connect(reverb);
    oscillator.start(begin);
    oscillator.stop(begin + duration + 0.04);
  }

  function play(kind) {
    if (kind === 'command') sweep(660, 520, 0.34, 0.11, 0, true);
    if (kind === 'scan') {
      sweep(180, 1046, 1.15, 0.16, 0, true);
      sweep(523, 784, 0.9, 0.085, 0.24, true);
    }
    if (kind === 'alert') {
      sweep(392, 293.66, 0.75, 0.14, 0, true);
      sweep(311.13, 233.08, 0.9, 0.105, 0.42, true);
    }
    if (kind === 'success') {
      sweep(261.63, 261.63, 0.8, 0.13, 0, true);
      sweep(329.63, 329.63, 0.9, 0.11, 0.22, true);
      sweep(392, 392, 1.0, 0.1, 0.45, true);
      sweep(523.25, 523.25, 1.45, 0.1, 0.72, true);
    }
    if (kind === 'failure') {
      sweep(293.66, 73.42, 1.5, 0.15, 0, true);
      sweep(196, 49, 1.3, 0.085, 0.28, true);
    }
  }

  window.StarshipAudio = { start, play, setEnabled, isEnabled: () => enabled };
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('audio-toggle')?.addEventListener('click', () => {
      const next = !enabled;
      setEnabled(next);
      if (next) start();
    });
    updateButton();
  });
})();
