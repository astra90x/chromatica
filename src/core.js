const SHEET_WIDTH = 256

export const Random = class {
    constructor() {
    }
    get() {
        return Math.random()
    }
    int(min, max, inclusive = false) {
        return Math.floor(min + (max - min + inclusive) * this.get())
    }
    true(probability) {
        return this.get() < probability
    }
    chance(...chance) {
        chance = chance.length === 1 && Array.isArray(chance) ? chance[0] : chance
        let random = this.get() * chance.reduce((a, b) => a + b)
        let used = 0
        for (let [i, value] of chance.entries()) {
            used += value
            if (random < used && value > 0)
                return i
        }
        return chance[0]
    }
    choose(...choices) {
        choices = choices.length === 1 && Array.isArray(choices) ? choices[0] : choices
        return choices[this.int(0, choices.length)]
    }
}

export const Synth = class {
    constructor(ax = new AudioContext()) {
        this.ax = ax
        this.out = new GainNode(ax)
        this.out.connect(ax.destination)

        this.instruments = new Map()

        this.createInstrument('piano', {
            gain: 0.25,
            harmonics: [1000, 800, 50, 160, 160, 160, 160, 70, 25, 25, 10, 100, 50, 10, 100, 12, 0, 0, 1, 1, 2, 4, 6, 8],
            inharmonicity: [
                { start: 0, end: 4, coefficient: 1 },
                { start: 4, end: 8, coefficient: 1.015625 },
                { start: 8, end: 16, coefficient: 1.03125 },
                { start: 16, end: 24, coefficient: 1.0625 },
            ],
            adsr: {
                attackDuration: 0.025,
                decayHalflife: 0.3,
                sustainLevel: 0,
                releaseDuration: 0.1,
            },
            lowpass(frequency, t) {
                frequency.setValueAtTime(3520, t)
                frequency.exponentialRampToValueAtTime(880, t + 0.025)
                frequency.exponentialRampToValueAtTime(660, t + 0.4)
            },
        })
    }

    setVolume(volume) {
        if (this.ax.currentTime === 0) {
            this.out.gain.setValueAtTime(volume, 0)
        } else {
            this.out.gain.linearRampToValueAtTime(volume, this.ax.currentTime + 0.01)
        }
    }

    createInstrument(id, instrument) {
        let waves = []
        let scale = Math.max(...instrument.harmonics)
        for (let { start, end, coefficient } of instrument.inharmonicity) {
            let real = [0, ...instrument.harmonics.map((m, i) => i >= start && i < end ? m / scale : 0)]
            let imag = Array(real.length).fill(0)

            let wave = new PeriodicWave(this.ax, { real, imag, disableNormalization: true })
            waves.push({ wave, coefficient })
        }

        this.instruments.set(id, {
            ...instrument,
            waves,
        })
    }

    scheduleNote({ time, duration, frequency, gain: noteGain, id = 'piano' }) {
        let { gain: iGain, waves, adsr, lowpass } = this.instruments.get(id)

        let startAt = time
        let peakAt = startAt + Math.min(duration / 2, adsr.attackDuration)
        let decayTau = adsr.decayHalflife / Math.LN2
        let releaseAt = time + duration
        let stopAt = releaseAt + adsr.releaseDuration
        let gain = iGain * noteGain

        let g = new GainNode(this.ax)
        g.gain.setValueAtTime(0, startAt)
        g.gain.linearRampToValueAtTime(gain, peakAt)
        g.gain.setTargetAtTime(gain * adsr.sustainLevel, peakAt, decayTau)
        g.gain.setValueAtTime(gain * (adsr.sustainLevel + (1 - adsr.sustainLevel) * Math.exp((peakAt - releaseAt) / decayTau)), releaseAt)
        g.gain.linearRampToValueAtTime(0, stopAt)
        g.connect(this.out)

        let l = new BiquadFilterNode(this.ax, {
            Q: 0,
        })
        lowpass(l.frequency, startAt)
        l.connect(g)

        for (let { wave, coefficient } of waves) {
            let o = new OscillatorNode(this.ax, {
                frequency: frequency * coefficient,
                periodicWave: wave,
            })
            o.start(startAt)
            o.stop(stopAt)
            o.connect(l)
        }
    }

    play(notes) {
        for (let note of notes) this.scheduleNote(note)
    }
}

let notes = () => {
    let rand = new Random()

    let notes = []

    let bassKeys = []
    for (let i = 0; i < 4; i++) {
        let options = [-1, 0, 2, 3, 4].filter(x => x !== bassKeys[i - 1])
        bassKeys.push(rand.choose(options))
    }
    bassKeys = [...bassKeys, ...bassKeys, ...bassKeys, ...bassKeys]

    let melodyKeys = []
    for (let i = 0; i < 64; i++) {
        let options = [
            { weight: 0.05, key: rand.int(-1, 7, true) }, // random key
            { weight: i === 0 ? 10 : i % 4 === 0 ? 0.5 : 0.1, key: bassKeys[Math.floor(i / 4)] }, // reuse bass key
            { weight: melodyKeys[i - 1 - 4] === melodyKeys[i - 1] ? 2 : 0.5, key: melodyKeys[i - 4] }, // repeat melody pattern
            { weight: melodyKeys[i - 1 - 16] === melodyKeys[i - 1] ? 10 : 0.5, key: melodyKeys[i - 4] }, // repeat melody
            { weight: 0.3, key: melodyKeys[i - 1] + rand.int(-3, 2, true) + rand.int(0, 1, true) }, // nearby jump
            { weight: 0.6, key: melodyKeys[i - 1] + rand.choose(-1, 1) }, // step
            { weight: [1, -1].includes(melodyKeys[i - 1] - melodyKeys[i - 2]) ? i >= 32 && i < 48 ? 2.5 : 0.2 : 0, key: melodyKeys[i - 1] * 2 - melodyKeys[i - 2] }, // run
        ].filter(x => typeof x.key === 'number' && !Number.isNaN(x.key))
        for (let option of options) if (option.key === melodyKeys[i - 1]) option.weight *= 0.1
        if (i >= 8) {
            let seen = new Set(melodyKeys.slice(-20))
            if (seen.size < 6) {
                let factor = 1 + (6 - seen.size) * 0.75
                for (let option of options) if (!seen.has(option.key)) option.weight *= factor
            }
        }

        melodyKeys.push(options[rand.chance(options.map(x => x.weight))].key)
    }

    notes.push(...bassKeys.flatMap((key, i) => [
        { key: key - 7, time: i * 8, duration: 8, gain: 0.7 },
        { key: key + [2, 2, null, -2, 2, 2][key + 1], time: i * 8, duration: 8, gain: 0.8 },
        { key: key, time: i * 8, duration: 8, gain: 0.6 },
    ]))
    notes.push(...melodyKeys.flatMap((key, i) => [
        { key: key, time: i * 2, duration: 2 },
    ]))

    let scale = [0, 2, 4, 5, 7, 9, 11]
    return notes.map(note => {
        let octave = Math.floor(note.key / 7)
        let key = note.key - octave * 7
        let frequency = 440 * 2 ** ((octave * 12 + scale[key] - 9) / 12)
        return { frequency, duration: note.duration * 0.16, gain: 0.5 * (note.gain || 1), time: 0.08 + note.time * 0.16 }
    })
}

document.body.onclick = () => new Synth().play(notes())

export const ClickGen = class {
    constructor(rand) {
        this.rand = rand
    }
    pullSheet() {
        let sheet = []
        let x = 2
        while (x <= SHEET_WIDTH - 2) {
            sheet.push(x)
            x += this.rand.chance(0, 0, 0, 3, 5, 8, 10, 10, 8, 5, 2, 2, 2, 1, 1)
        }
        return sheet
    }
}

export const PathGen = class {
    constructor(rand) {
        this.rand = rand
        this.clickGen = new ClickGen(rand)
        this.y = 0
    }
    pullSheet() {
        let clicks = this.clickGen.pullSheet()

        let segments = []
        let x = 0
        for (let i = 0; i <= clicks.length; i++) {
            let startX = x
            let endX = clicks[i] ?? SHEET_WIDTH
            while (i + 1 < clicks.length && clicks[i + 1] - endX < 3) i++

            if (i > 0) {
                let length = Math.min(endX - startX - 1, this.rand.chance(0, 0, 2, 4, 10, 2, 1))
                let midX = startX + length
                segments.push({ startX, endX: midX, type: 'jump' })
                startX = midX
            }

            let fallSize = 1 + Math.floor(Math.random() * 3)
            if (endX - startX > 2 + fallSize) {
                let fallDelay = Math.floor(Math.random() * ((endX - startX) - (2 + fallSize)))
                let fallStart = startX + 1 + fallDelay
                let fallEnd = fallStart + fallSize

                segments.push({ startX, endX: fallStart, type: 'straight' })
                segments.push({ startX: fallStart, endX: fallEnd, type: 'fall' })
                segments.push({ startX: fallEnd, endX, type: 'straight' })
            } else {
                segments.push({ startX, endX, type: 'straight' })
            }

            x = endX
        }

        let path = []
        let y = this.y
        for (let { startX, endX, type } of segments) {
            let dx = endX - startX
            let dy = type === 'jump' ? dx * dx - 4 * dx :
                type === 'fall' ? dx * dx :
                0
            let startY = y
            let endY = y + dy
            y = endY
            path.push({
                start: { x: startX, y: startY },
                end: { x: endX, y: endY },
                type,
            })
        }
        this.y = y

        return path
    }
}

export const TerrainGen = class {
    constructor(rand = new Random()) {
        this.rand = rand
        this.pathGen = new PathGen(rand)
    }
    pullSheet() {
        let path = this.pathGen.pullSheet()
        return path.flatMap(p => {
            if (p.type === 'jump') return [{
                x: p.start.x,
                y: p.start.y - 1,
                width: 1,
                height: 1,
                color: 0xff0000,
            }, {
                x: p.start.x,
                y: Math.max(p.start.y, p.end.y),
                width: p.end.x - p.start.x,
                height: 1,
                color: 0x440000,
            }]
            if (p.type === 'fall') return [{
                x: p.start.x,
                y: Math.max(p.start.y, p.end.y),
                width: p.end.x - p.start.x,
                height: 1,
                color: 0x0000ff,
            }]
            return [{
                x: p.start.x,
                y: Math.max(p.start.y, p.end.y),
                width: p.end.x - p.start.x,
                height: 1,
                color: 0xffffff,
            }]
        }).map(p => ({
            x: 18 + p.x * 4,
            y: 360 + p.y * 4,
            width: p.width * 4,
            height: p.height * 4,
            color: p.color,
        }))
    }
}
