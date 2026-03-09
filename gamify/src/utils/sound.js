// Web Audio API sound engine.
// Audio files are fetched and decoded ONCE into AudioBuffers.
// Each play() call creates a BufferSourceNode — instant, zero re-fetch/decode.
// One AudioContext is shared across the whole app (browser allows only a few).

let ctx = null;
const buffers = {};
// Active looping sources: name → { source, gainNode }
const loops = {};

function getCtx() {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

/**
 * Fetch + decode an audio file into a named buffer.
 * Call once on mount for each sound you need.
 */
export async function loadSound(name, url) {
  try {
    const context = getCtx();
    const res = await fetch(url);
    const arrayBuffer = await res.arrayBuffer();
    buffers[name] = await context.decodeAudioData(arrayBuffer);
  } catch (e) {
    console.warn('[sound] load failed:', name, e.message);
  }
}

/**
 * Play a previously loaded sound immediately.
 * Safe to call before the buffer is ready — silently skips.
 */
export function playSound(name) {
  const buf = buffers[name];
  if (!buf) return;
  const context = getCtx();
  // Resume if suspended (browser autoplay policy). AudioContext resumes
  // immediately when there has been at least one prior user gesture.
  if (context.state === 'suspended') {
    context.resume().catch(() => {});
    return; // skip this play — context wasn't ready yet
  }
  try {
    const source = context.createBufferSource();
    source.buffer = buf;
    source.connect(context.destination);
    source.start(0);
  } catch (e) {
    console.warn('[sound] play failed:', name, e.message);
  }
}

/**
 * Start a looping sound. Stops any previous loop with the same name first.
 * Safe to call before the buffer is ready — silently skips.
 */
export function loopSound(name) {
  const buf = buffers[name];
  if (!buf) return;
  const context = getCtx();
  if (context.state === 'suspended') {
    context.resume().catch(() => {});
    return;
  }
  // Stop existing loop if any
  stopSound(name);
  try {
    const gainNode = context.createGain();
    gainNode.gain.value = 1;
    gainNode.connect(context.destination);
    const source = context.createBufferSource();
    source.buffer = buf;
    source.loop = true;
    source.connect(gainNode);
    source.start(0);
    loops[name] = { source, gainNode };
  } catch (e) {
    console.warn('[sound] loop failed:', name, e.message);
  }
}

/**
 * Stop a looping sound with a short fade-out to avoid clicks.
 */
export function stopSound(name) {
  const loop = loops[name];
  if (!loop) return;
  delete loops[name];
  try {
    const context = getCtx();
    const { source, gainNode } = loop;
    gainNode.gain.setTargetAtTime(0, context.currentTime, 0.1);
    source.stop(context.currentTime + 0.5);
  } catch (_) {}
}

/**
 * Call on first user interaction to unlock the AudioContext.
 * Must be in a pointer/keyboard event handler to satisfy the browser policy.
 */
export function unlockAudio() {
  const context = getCtx();
  if (context.state === 'suspended') {
    context.resume().catch(() => {});
  }
}
