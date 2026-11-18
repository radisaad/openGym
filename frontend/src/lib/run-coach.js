// Who says the interval timer's cues (lib/run-intervals.js cuesOf), and when.
//
//   iPhone app   the whole list goes to RunCoachPlugin.swift when the run starts or goes on: the
//                phone keeps an audio session for the run, says each line at its time in the
//                phone's voice and turns the music down meanwhile, with the screen locked and the
//                page asleep. The page says nothing itself then.
//   elsewhere    the page says each cue when its time comes (lib/speech.js), which works only while
//                the page is on screen; the timer keeps the screen awake for that where it can.
//
// The list is always worked out again from the clock (a pause, a skip), never kept here.
import { MOBILE, nativePlatform } from './mobile.js'
import { speak, hush, speechLang, voiceOpts } from './speech.js'

let plugin = null
async function nativeCoach() {
  if (!MOBILE || (await nativePlatform()) !== 'ios') return null
  if (!plugin) {
    const { registerPlugin } = await import('@capacitor/core')
    plugin = registerPlugin('RunCoach')
  }
  return plugin
}

/** Whether the cues are the phone's to say (the iPhone app): the page then keeps quiet. */
export async function nativeCues() {
  return !!(await nativeCoach())
}

/** Hands every cue from now on to the phone (or does nothing in a browser). `S` for the voice settings. */
export async function scheduleCues(cues, S) {
  const p = await nativeCoach()
  if (!p) return false
  const { rate, voice } = voiceOpts(S)
  try {
    await p.start({ cues: cues.map(c => ({ at: c.at, text: c.text })), lang: speechLang(), rate, voice })
    return true
  } catch { return false }
}

/** Stops the phone's cues and lets the music back up (paused, stopped or finished). */
export async function cancelCues() {
  const p = await nativeCoach()
  if (p) { try { await p.stop() } catch { /* nothing booked */ } } else hush()
}

/**
 * The page's own voice: says the cues whose time came since `since` (and is not older than a few
 * seconds, so a page coming back from the background does not read out the run it missed).
 */
export function sayDue(cues, since, now, S) {
  const due = cues.filter(c => c.at > since && c.at <= now && now - c.at < 4000)
  for (const c of due) speak(c.text, { ...voiceOpts(S), onSilent: true })
  return due.length
}

// The screen stays on while the timer shows, where the browser allows it (the page's voice needs it).
let lock = null
export async function keepAwake(on) {
  try {
    if (on && !lock && navigator.wakeLock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener?.('release', () => { lock = null }) }
    if (!on && lock) { await lock.release(); lock = null }
  } catch { lock = null }
}
