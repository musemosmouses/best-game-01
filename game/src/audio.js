// Synthesised WebAudio sound: no audio files, no network. The context is
// created lazily on the first player gesture (browsers block audio before
// that) and every call is a no-op until then, so headless captures stay
// silent and error-free. A quiet bass loop runs under the game.
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let musicTimer = null;
  let musicStep = 0;

  // A short two-note bass figure, one note per tick, looped.
  const BASS = [55, 0, 55, 65.41, 0, 55, 49, 58.27];
  const BASS_TICK = 0.24;

  function startMusic() {
    if (musicTimer !== null || !ctx) return;
    musicTimer = setInterval(() => {
      if (muted || !ctx || ctx.state !== 'running') return;
      const freq = BASS[musicStep % BASS.length];
      musicStep += 1;
      if (!freq) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + BASS_TICK);
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      osc.stop(ctx.currentTime + BASS_TICK);
    }, BASS_TICK * 1000);
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ctx || muted) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), now + dur);
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start(now);
      osc.stop(now + dur);
    } catch {
      // Audio is decoration; a failure here must never break the game.
    }
  }

  function noise(dur, vol, cutoff) {
    if (!ctx || muted) return;
    try {
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      src.buffer = buffer;
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;
      gain.gain.value = vol;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start();
    } catch {
      // See tone(): audio must never break the game.
    }
  }

  return {
    unlock() {
      if (ctx) {
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        return;
      }
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.5;
        master.connect(ctx.destination);
        startMusic();
      } catch {
        ctx = null;
      }
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    get muted() {
      return muted;
    },
    play(name) {
      if (!ctx) return;
      switch (name) {
        case 'shoot': tone(880, 0.07, 'square', 0.08, 420); break;
        case 'crack': noise(0.16, 0.22, 900); tone(190, 0.14, 'triangle', 0.16, 70); break;
        case 'pickup': tone(660, 0.09, 'sine', 0.12, 990); break;
        case 'hit': tone(130, 0.2, 'sawtooth', 0.2, 60); noise(0.12, 0.14, 500); break;
        case 'explosion': noise(0.5, 0.3, 420); tone(90, 0.4, 'sine', 0.22, 32); break;
        case 'wave': tone(392, 0.12, 'triangle', 0.14); setTimeout(() => tone(523, 0.18, 'triangle', 0.14), 110); break;
        case 'boss': tone(220, 0.3, 'sawtooth', 0.16, 110); setTimeout(() => tone(220, 0.3, 'sawtooth', 0.16, 110), 320); break;
        case 'buy': tone(523, 0.08, 'sine', 0.14); setTimeout(() => tone(784, 0.12, 'sine', 0.14), 80); break;
        case 'deny': tone(160, 0.15, 'square', 0.1, 110); break;
        case 'well': tone(320, 0.35, 'sine', 0.16, 60); break;
        default: break;
      }
    },
  };
}
