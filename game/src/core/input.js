// Keyboard + mouse input with pointer lock; keys are tracked by KeyboardEvent.code (layout independent).
// Listeners fill `input` as events arrive; systems poll it each frame and endFrame() clears the
// per-frame parts (taps, mouse deltas, wheel).

export const input = {
  down: new Set(),
  pressed: new Set(),     // keys pressed since last frame
  mouseDX: 0,
  mouseDY: 0,
  fire: false,
  firePressed: false,
  wheel: 0,
  locked: false,
  lastMouseMove: -10,     // seconds (performance clock) of the last locked mouse move
};

/** Installs the window/canvas listeners; onKey(code) is called on every keydown. */
export function setupInput(canvas, onKey) {
  addEventListener('keydown', (e) => {
    if (e.code === 'Tab') e.preventDefault();
    if (!input.down.has(e.code)) input.pressed.add(e.code);
    input.down.add(e.code);
    onKey?.(e.code);
  });
  addEventListener('keyup', (e) => input.down.delete(e.code));
  addEventListener('blur', () => { input.down.clear(); input.fire = false; });
  addEventListener('mousemove', (e) => {
    if (!input.locked) return;
    input.mouseDX += e.movementX;
    input.mouseDY += e.movementY;
    input.lastMouseMove = performance.now() / 1000;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (!input.locked && input.wantLock) canvas.requestPointerLock?.();
    input.fire = true;
    input.firePressed = true;
  });
  addEventListener('mouseup', (e) => { if (e.button === 0) input.fire = false; });
  addEventListener('wheel', (e) => { input.wheel += Math.sign(e.deltaY); });
  document.addEventListener('pointerlockchange', () => { input.locked = document.pointerLockElement === canvas; });
}

/** True while the key is held. */
export const key = (code) => input.down.has(code);
/** True only on the frame the key went down. */
export const tapped = (code) => input.pressed.has(code);

/** Clears the per-frame input (call once at the end of every frame). */
export function endFrame() {
  input.pressed.clear();
  input.mouseDX = 0;
  input.mouseDY = 0;
  input.firePressed = false;
  input.wheel = 0;
}
