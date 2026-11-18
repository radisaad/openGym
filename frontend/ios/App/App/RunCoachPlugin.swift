import AVFoundation
import Capacitor
import Foundation

/**
 * The interval timer's voice with the screen locked (lib/run-coach.js, lib/run-intervals.js).
 *
 * The page hands over every cue of the run at once, each with its clock time. From then on the
 * phone does it alone: an audio session of the .playback kind keeps the app running in the
 * background (UIBackgroundModes "audio", Info.plist), held by a silent loop, and each line is said
 * at its time in the phone's voice. While a line is said the music goes down (.duckOthers) and
 * comes back up after, the way running apps coach; it never stops the music.
 *
 * The page sends the list again after a pause, a skip or a resume (`start` replaces it), and calls
 * `stop` when the run is paused, stopped or thrown away. After the last cue the session lets go by
 * itself. Separate from RestAlertPlugin's session on purpose: a run and a gym rest never overlap,
 * and the rest's .ambient kind would let the phone put the app to sleep.
 */
@objc(RunCoachPlugin)
public class RunCoachPlugin: CAPPlugin, CAPBridgedPlugin, AVSpeechSynthesizerDelegate {
    public let identifier = "RunCoachPlugin"
    public let jsName = "RunCoach"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    ]

    private struct Cue { let at: Date; let text: String }

    private var timers: [DispatchWorkItem] = []
    private var keepAlive: AVAudioPlayer?
    private var lang = "en-GB"
    private var rate: Float = AVSpeechUtteranceDefaultSpeechRate
    private var voiceId = ""
    private var lastAt = Date.distantPast
    private var running = false

    private lazy var speech: AVSpeechSynthesizer = {
        let synth = AVSpeechSynthesizer()
        synth.delegate = self
        synth.usesApplicationAudioSession = true
        return synth
    }()

    override public func load() {
        NotificationCenter.default.addObserver(self, selector: #selector(interrupted(_:)),
                                               name: AVAudioSession.interruptionNotification, object: nil)
    }

    deinit { NotificationCenter.default.removeObserver(self) }

    // MARK: calls from the page

    /// { cues: [{ at: ms since 1970, text }], lang, rate (1 is normal), voice (an identifier or "") }
    @objc func start(_ call: CAPPluginCall) {
        let raw = call.getArray("cues", JSObject.self) ?? []
        let cues: [Cue] = raw.compactMap { c in
            guard let ms = c["at"] as? Double, let text = c["text"] as? String, !text.isEmpty else { return nil }
            return Cue(at: Date(timeIntervalSince1970: ms / 1000), text: text)
        }
        let lang = call.getString("lang") ?? "en-GB"
        let rate = call.getDouble("rate") ?? 1
        let voice = call.getString("voice") ?? ""
        DispatchQueue.main.async {
            self.cancelTimers()
            self.lang = lang
            // The page's 1 is the phone's default rate; 0.5 to 2 around it, within what iOS takes.
            self.rate = min(AVSpeechUtteranceMaximumSpeechRate, max(AVSpeechUtteranceMinimumSpeechRate, AVSpeechUtteranceDefaultSpeechRate * Float(rate)))
            self.voiceId = voice
            guard !cues.isEmpty else { self.finish(); call.resolve(); return }
            self.beginSession()
            let now = Date()
            for cue in cues {
                // A line already a little late (the page took a moment) is still said; an old one is not.
                let wait = cue.at.timeIntervalSince(now)
                if wait < -3 { continue }
                let item = DispatchWorkItem { [weak self] in self?.say(cue.text) }
                self.timers.append(item)
                DispatchQueue.main.asyncAfter(deadline: .now() + max(0, wait), execute: item)
            }
            self.lastAt = cues.map(\.at).max() ?? now
            // Let go a little after the last line, once it has surely been said.
            let end = DispatchWorkItem { [weak self] in self?.finishWhenQuiet() }
            self.timers.append(end)
            DispatchQueue.main.asyncAfter(deadline: .now() + max(0, self.lastAt.timeIntervalSince(now)) + 8, execute: end)
            call.resolve()
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.cancelTimers()
            self.speech.stopSpeaking(at: .immediate)
            self.finish()
            call.resolve()
        }
    }

    // MARK: speaking

    private func say(_ text: String) {
        guard running else { return }
        duck(true)
        let line = AVSpeechUtterance(string: text)
        if !voiceId.isEmpty, let v = AVSpeechSynthesisVoice(identifier: voiceId), v.language.prefix(2) == lang.prefix(2) {
            line.voice = v
        } else {
            line.voice = AVSpeechSynthesisVoice(language: lang) ?? AVSpeechSynthesisVoice(language: String(lang.prefix(2)))
        }
        line.rate = rate
        line.preUtteranceDelay = 0.15
        speech.speak(line)
    }

    public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        if !synthesizer.isSpeaking { duck(false) }
    }

    public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        if !synthesizer.isSpeaking && running { duck(false) }
    }

    // MARK: the audio session

    /// The run's session: plays in the background, mixes with the music, held by a silent loop.
    private func beginSession() {
        running = true
        setShape(duck: false)
        if keepAlive == nil, let player = try? AVAudioPlayer(data: RunCoachPlugin.silence) {
            player.numberOfLoops = -1
            player.volume = 0
            keepAlive = player
        }
        keepAlive?.play()
    }

    private func setShape(duck: Bool) {
        let session = AVAudioSession.sharedInstance()
        let options: AVAudioSession.CategoryOptions = duck ? [.mixWithOthers, .duckOthers] : [.mixWithOthers]
        try? session.setCategory(.playback, mode: duck ? .voicePrompt : .default, options: options)
        try? session.setActive(true)
    }

    /// Music down for a line, and back up after. Ducking only ends when the session goes inactive,
    /// so the silent loop stops for that moment and starts again at once: the app keeps running.
    private func duck(_ on: Bool) {
        guard running else { return }
        if on { setShape(duck: true); return }
        keepAlive?.pause()
        try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
        setShape(duck: false)
        keepAlive?.play()
    }

    private func finishWhenQuiet() {
        if speech.isSpeaking {
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in self?.finishWhenQuiet() }
            return
        }
        finish()
    }

    /// The run is over or stopped: the music back to normal, the app's resting session again.
    private func finish() {
        guard running else { return }
        running = false
        keepAlive?.stop()
        try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
        RestAlertPlugin.mixWithMusic()
    }

    private func cancelTimers() {
        timers.forEach { $0.cancel() }
        timers = []
    }

    /// A call took the audio: once it is over, the run's session comes back for the cues still to come.
    @objc private func interrupted(_ note: Notification) {
        guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              AVAudioSession.InterruptionType(rawValue: raw) == .ended else { return }
        DispatchQueue.main.async {
            guard self.running else { return }
            self.setShape(duck: false)
            self.keepAlive?.play()
        }
    }

    /// One second of silence as a WAV (8 kHz, 16-bit, mono), made here: no sound file to ship.
    static let silence: Data = {
        let rate: UInt32 = 8000, samples: UInt32 = 8000
        let dataSize = samples * 2
        var d = Data()
        func u32(_ v: UInt32) { var x = v.littleEndian; d.append(Data(bytes: &x, count: 4)) }
        func u16(_ v: UInt16) { var x = v.littleEndian; d.append(Data(bytes: &x, count: 2)) }
        d.append(contentsOf: Array("RIFF".utf8)); u32(36 + dataSize)
        d.append(contentsOf: Array("WAVE".utf8))
        d.append(contentsOf: Array("fmt ".utf8)); u32(16); u16(1); u16(1); u32(rate); u32(rate * 2); u16(2); u16(16)
        d.append(contentsOf: Array("data".utf8)); u32(dataSize)
        d.append(Data(count: Int(dataSize)))
        return d
    }()
}
