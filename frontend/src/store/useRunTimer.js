// The interval timer's run (lib/run-intervals.js decides, this keeps it): one at a time, kept in
// localStorage on this device only, so a reload or the app being closed comes back to the right
// step. Never synced: a run in progress belongs to the phone in the pocket.
import { create } from 'zustand'
import { startRun, pauseRun, resumeRun, skipStep } from '../lib/run-intervals.js'

const KEY = 'og_run_timer'
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null') } catch { return null } }
const save = run => { try { if (run) localStorage.setItem(KEY, JSON.stringify(run)); else localStorage.removeItem(KEY) } catch { /* private mode: lives in memory */ } }

export const useRunTimer = create(set => {
  const put = run => { save(run); set({ run }) }
  return {
    run: load(),
    start: preset => put(startRun(preset, Date.now())),
    pause: () => put(pauseRun(useRunTimer.getState().run, Date.now())),
    resume: () => put(resumeRun(useRunTimer.getState().run, Date.now())),
    skip: () => put(skipStep(useRunTimer.getState().run, Date.now())),
    clear: () => put(null),
  }
})
