/**
 * Unified vibration feedback for Xiaomi Vela JS apps.
 *
 * The official vibrator API exposes short/long modes rather than intensity
 * levels, so the three semantic levels are mapped to the closest supported
 * mode. Unsupported runtimes fail silently.
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
  vibrate('short')
}

export function medium() {
  vibrate('short')
}

export function heavy() {
  vibrate('long')
}

export default {
  light,
  medium,
  heavy
}
