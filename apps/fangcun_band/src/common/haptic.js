/**
 * Unified vibration feedback for Xiaomi Vela JS apps.
 *
 * Navigation and ordinary taps are intentionally silent. Completion uses two
 * short pulses: this is lighter and crisper than the previous long pulse on
 * Vela hardware. Unsupported runtimes fail silently.
 */
var vibrator = null

try {
  vibrator = require('@system.vibrator')
} catch (error) {
  vibrator = null
}

function vibrate(mode) {
  if (!vibrator || typeof vibrator.vibrate !== 'function') {
    return
  }

  try {
    vibrator.vibrate({ mode: mode })
  } catch (error) {
    // Vibration is optional feedback; never let it interrupt app behavior.
  }
}

export function light() {
  // Ordinary navigation/taps should not vibrate.
}

export function medium() {
  // Ordinary actions should not vibrate.
}

export function heavy() {
  // Exit/navigation actions should not vibrate.
}

export function complete() {
  vibrate('short')
  setTimeout(() => vibrate('short'), 105)
}

export default {
  light,
  medium,
  heavy,
  complete
}
