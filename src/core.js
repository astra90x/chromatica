export const Random = class {
    constructor(seed = null) {
        this.state = seed
    }
    get() {
        if (this.state == null) return Math.random()
        this.state = Math.imul(this.state, 48271)
        return this.state / 0x100000000
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
        this.volume = 1
        this.hasPlayedNote = false

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
        if (volume === this.volume) return
        this.volume = volume

        let rawVolume = volume * volume
        if (this.hasPlayedNote) {
            this.out.gain.setValueAtTime(rawVolume, this.ax.currentTime)
        } else {
            this.out.gain.linearRampToValueAtTime(rawVolume, this.ax.currentTime + 0.01)
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
        this.hasPlayedNote = true

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

export const MusicGen = class {
    constructor(rand) {
        this.rand = rand
    }
    pullFragment() {
        let notes = []

        let bassKeys = []
        for (let i = 0; i < 4; i++) {
            let options = [-1, 0, 2, 3, 4].filter(x => x !== bassKeys[i - 1])
            bassKeys.push(this.rand.choose(options))
        }
        bassKeys = [...bassKeys, ...bassKeys, ...bassKeys, ...bassKeys]

        let melodyKeys = []
        for (let i = 0; i < 64; i++) {
            let options = [
                { weight: 0.05, key: this.rand.int(-1, 7, true) }, // random key
                { weight: i === 0 ? 10 : i % 4 === 0 ? 0.5 : 0.1, key: bassKeys[Math.floor(i / 4)] }, // reuse bass key
                { weight: melodyKeys[i - 1 - 4] === melodyKeys[i - 1] ? 2 : 0.5, key: melodyKeys[i - 4] }, // repeat melody pattern
                { weight: melodyKeys[i - 1 - 16] === melodyKeys[i - 1] ? 10 : 0.5, key: melodyKeys[i - 4] }, // repeat melody
                { weight: 0.3, key: melodyKeys[i - 1] + this.rand.int(-3, 2, true) + this.rand.int(0, 1, true) }, // nearby jump
                { weight: 0.6, key: melodyKeys[i - 1] + this.rand.choose(-1, 1) }, // step
                { weight: [1, -1].includes(melodyKeys[i - 1] - melodyKeys[i - 2]) ? i >= 32 && i < 48 ? 2.5 : 0.2 : 0, key: melodyKeys[i - 1] * 2 - melodyKeys[i - 2] }, // run
            ].filter(x => typeof x.key === 'number' && !Number.isNaN(x.key))
            for (let option of options) if (option.key === melodyKeys[i - 1]) option.weight *= 0.1
            for (let option of options) option.weight *= option.key >= -1 && options.key <= 7 ? 1 : option.key >= -3 && options.key <= 9 ? 0.6 : 0.1
            if (i >= 8) {
                let seen = new Set(melodyKeys.slice(-20))
                if (seen.size < 6) {
                    let factor = 1 + (6 - seen.size) * 0.75
                    for (let option of options) if (!seen.has(option.key)) option.weight *= factor
                }
            }

            melodyKeys.push(options[this.rand.chance(options.map(x => x.weight))].key)
        }

        notes.push(...bassKeys.flatMap((key, i) => [
            { key: key - 7, time: i * 4, duration: 4, gain: 0.7 },
            { key: key + [2, 2, null, -2, 2, 2][key + 1], time: i * 4, duration: 4, gain: 0.8 },
            { key: key, time: i * 4, duration: 4, gain: 0.6 },
        ]))
        notes.push(...melodyKeys.flatMap((key, i) => [
            { key: key, time: i, duration: 1 },
        ]))

        let scale = [0, 2, 4, 5, 7, 9, 11]
        return notes.map(note => {
            let octave = Math.floor(note.key / 7)
            let key = note.key - octave * 7
            let keyPosition = octave * 12 + scale[key]
            let frequency = 440 * 2 ** ((keyPosition - 9) / 12)
            return { keyPosition, frequency, duration: note.duration, gain: 0.5 * (note.gain || 1), time: note.time }
        })
    }
    pullSheet() {
        let notes = []
        for (let offset = 0; offset < 192; offset += 64) {
            notes.push(...this.pullFragment().map(note => ({ ...note, time: offset + note.time })))
        }
        return { sheetSize: 192, notes }
    }
}

export const ClickGen = class {
    constructor(rand) {
        this.rand = rand
    }
    pullSheet({ sheetSize }) {
        let clicks = []
        let x = 1
        while (x <= sheetSize - 3) {
            clicks.push(x)
            x += this.rand.chance(0, 0, 0, 3, 5, 8, 10, 10, 8, 5, 2, 2, 2, 1, 1)
        }
        return { sheetSize, clicks }
    }
}

export const PathGen = class {
    constructor(rand) {
        this.rand = rand
    }

    pullCandidate(y, { sheetSize, clicks }) {
        let path = []
        let pushSegment = ({ startX, endX, type }) => {
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

        let x = 0
        for (let i = 0; i <= clicks.length; i++) {
            let startX = x
            let endX = clicks[i] ?? sheetSize
            while (i + 1 < clicks.length && clicks[i + 1] - endX <= (y < -9 ? 3 : 2)) i++

            if (i > 0) {
                let length = Math.min(endX - startX - 1, this.rand.chance(0, 0, y < -6 ? 0 : 5, 10, 20, y < 0 ? 2 : 0, y < -6 ? 1 : 0))
                let midX = startX + length
                pushSegment({ startX, endX: midX, type: 'jump' })
                startX = midX
            }

            let fallSize = 1 + Math.floor(Math.random() * Math.max(1, Math.min(5, 2.25 - y * 0.125)))
            if (endX - startX > 2 + fallSize) {
                let fallDelay = Math.floor(Math.random() * ((endX - startX) - (2 + fallSize)))
                let fallStart = startX + 1 + fallDelay
                let fallEnd = fallStart + fallSize

                pushSegment({ startX, endX: fallStart, type: 'straight' })
                pushSegment({ startX: fallStart, endX: fallEnd, type: 'fall' })
                pushSegment({ startX: fallEnd, endX, type: 'straight' })
            } else {
                pushSegment({ startX, endX, type: 'straight' })
            }

            x = endX
        }

        return { y, path }
    }

    pullSheet({ sheetSize, clicks }) {
        for (let i = 0; i < 10000; i++) {
            if (i > 100) {
                clicks = clicks.filter((_, i) => this.rand.true(0.9) || i === 0 || i === clicks.length - 1)
                while (clicks.length < sheetSize / 7) {
                    let i = this.rand.int(1, clicks.length - 1)
                    let before = clicks[i - 1]
                    let after = clicks[i]
                    if (after - before < 6) continue
                    let at = (before + after) / 2
                    clicks.splice(i, 0, Math.floor(at) + this.rand.true(at % 2))
                }
            }

            let { y, path } = this.pullCandidate(0, { sheetSize, clicks })
            if (y !== 0) continue
            if (!path.every(p => p.start.y + 1 >= -14 && p.start.y <= 7)) continue
            return { sheetSize, path } // FIXME this is very inefficient
        }
        throw new Error(`Bad clicks: ${clicks}`)
    }
}

export const TerrainGen = class {
    constructor(rand) {
        this.rand = rand
        this.deferred = []
    }
    pullSheet({ sheetSize, path }) {
        let terrain = this.deferred

        for (let i = 0; i < path.length; i++) {
            let p = path[i]
            let last = path[i - 1]
            let next = path[i + 1]
            if (p.type === 'jump') {
                if (p.start.y === p.end.y && this.rand.true(0.6)) {
                    terrain.push({
                        x: p.start.x + 1,
                        y: p.start.y + 1,
                        width: 3,
                        height: 1,
                        type: 'floor',
                    }, {
                        x: p.start.x + this.rand.chance(0, 1, 4, 1),
                        y: p.start.y,
                        width: 1,
                        height: 1,
                        type: 'black',
                    })
                }
                continue
            }
            if (p.type === 'fall') continue
            let startShift = p.start.y <= last?.start.y - 4 ? 1 : 0
            let endShift = next?.type === 'fall' ? 1 : 0
            let width = p.end.x - p.start.x + 1 - startShift - endShift
            if (width <= 0) continue
            terrain.push({
                x: p.start.x + startShift,
                y: Math.max(p.start.y, p.end.y) + 1,
                width,
                height: 1,
                type: 'floor',
            })
            if (width >= 3 && this.rand.true((width - 2) * 0.15)) terrain.push({
                x: p.start.x + startShift + this.rand.int(1, width - 2, true),
                y: Math.max(p.start.y, p.end.y),
                width: 1,
                height: 1,
                type: 'white',
            })
        }

        let floorsByEnd = new Map()
        terrain = terrain.filter(t => {
            if (t.type !== 'floor') return true
            let extend = floorsByEnd.get(t.y + t.x * 1000)
            if (extend == null) {
                floorsByEnd.set(t.y + (t.x + t.width) * 1000, t)
                return true
            }
            floorsByEnd.delete(extend.y + (extend.x + extend.width) * 1000)
            extend.width += t.width
            floorsByEnd.set(extend.y + (extend.x + extend.width) * 1000, extend)
            return false
        })

        let deferred = []
        terrain = terrain.filter(t => {
            let defer = t.x + t.width >= sheetSize
            if (defer) deferred.push({ ...t, x: t.x - sheetSize })
            return !defer
        })
        this.deferred = deferred

        return { sheetSize, terrain }
    }
}
