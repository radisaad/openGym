// The app's name on screen (this fork: RadiGym). The upstream copy says "openGym" in hundreds of
// sentences and every language pack, so the name is swapped in where text is made (lib/i18n-core.js
// t and tn) rather than in each string. Identifiers that files and other apps rely on (backup
// folders, CSV and FIT exports, the bundle id, opengym.ch links) keep their upstream spelling.
//
// Under the test runner the upstream name stays, so upstream's tests keep checking their own
// sentences; brand.test.js checks the swap itself.
export const NAME = 'RadiGym'
const TESTING = typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test'
export const APP_NAME = TESTING ? 'openGym' : NAME

/** `s` with the upstream name replaced by `name`. */
export const brandWith = (s, name) => (typeof s === 'string' && s.includes('openGym') ? s.replaceAll('openGym', name) : s)
export const brand = s => (TESTING ? s : brandWith(s, APP_NAME))
