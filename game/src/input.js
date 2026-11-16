// Keyboard + mouse state. Movement keys are read every frame; one-shot
// actions (confirm, pause, mute, restart, drop a well, shop digits) queue
// into a bitmask the main loop drains once per frame.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;
export const ACTION_RESTART = 8;
export const ACTION_WELL = 16;
/** A mouse click: starts the game on the title screen, but must NOT act as
 * the keyboard confirm inside the shop (shop clicks are hit-tested there). */
export const ACTION_CLICK = 32;

export function createInput(canvas) {
  const keys = new Set();
  const digits = [];
  // Clicks are edge-triggered: each mousedown queues one {x, y} pair, so a
  // button held down cannot buy the same shop row once per frame.
  const clicks = [];
  let actions = 0;
  const mouse = { x: 640, y: 360, down: false };

  function onKeyDown(event) {
    if (event.code === 'Space' || event.code.startsWith('Arrow')) event.preventDefault();
    if (event.repeat) return;
    keys.add(event.code);
    if (event.code === 'Space' || event.code === 'Enter') actions |= ACTION_CONFIRM;
    else if (event.code === 'KeyP' || event.code === 'Escape') actions |= ACTION_PAUSE;
    else if (event.code === 'KeyM') actions |= ACTION_MUTE;
    else if (event.code === 'KeyR') actions |= ACTION_RESTART;
    else if (event.code === 'KeyQ') actions |= ACTION_WELL;
    else if (/^Digit[1-6]$/.test(event.code)) digits.push(Number(event.code.slice(5)) - 1);
  }

  function onKeyUp(event) {
    keys.delete(event.code);
  }

  function onMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
  }

  function onMouseDown(event) {
    onMouseMove(event);
    mouse.down = true;
    clicks.push({ x: mouse.x, y: mouse.y });
    actions |= ACTION_CLICK;
  }

  function onMouseUp() {
    mouse.down = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);

  return {
    /** Normalised WASD / arrow movement vector. */
    move() {
      let x = 0;
      let y = 0;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
      if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
      if (x !== 0 && y !== 0) {
        const inv = 1 / Math.SQRT2;
        x *= inv;
        y *= inv;
      }
      return { x, y };
    },
    firing() {
      return mouse.down || keys.has('Space');
    },
    mouse() {
      return mouse;
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    takeDigits() {
      if (digits.length === 0) return [];
      return digits.splice(0, digits.length);
    },
    /** One entry per mousedown since the last call; each is consumed once. */
    takeClicks() {
      if (clicks.length === 0) return [];
      return clicks.splice(0, clicks.length);
    },
  };
}
