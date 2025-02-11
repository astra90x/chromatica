import { Random, Synth, MusicGen, ClickGen, PathGen, TerrainGen } from './core.js'
import { addScore } from './leaderboard.js'

let createPalette = palette => {
    let values = Object.values(palette)
    palette.get = id => {
        if (typeof id === 'string') return palette[id]
        if (typeof id === 'number') return id < values.length ? values[id] : id
        throw new Error('Unknown color')
    }
    palette.blend = (a, b, amount = 0.5) => {
        if (amount < 0) amount = 0
        if (!(amount < 1)) amount = 1
        a = palette.get(a)
        b = palette.get(b)
        let bm = (amount * 256) | 0
        let am = 256 - bm
        return (
            (am * (a & 0xff00ff) + bm * (b & 0xff00ff)) & 0xff00ff00 |
            (am * (a & 0x00ff00) + bm * (b & 0x00ff00)) & 0x00ff0000
        ) >>> 8
    }
    return palette
}

let palette = createPalette({
    red: 0xff302d,
    yellow: 0xff9f27,
    orange: 0xf7fe33,
    green: 0x59fe39,
    cyan: 0x22e5fd,
    blue: 0x2572fd,
    purple: 0x5131fd,
    black: 0x333333,
    white: 0xffffff,
})

const Game = class {
    constructor(cx, synth) {
        this.cx = cx
        this.synth = synth
        this.config = {
            volume: 0.5,
            tutorial: true,
            audioSync: -0.25,
            advanced: false,
            cheat: true,
            notesPerSec: 3,
        }

        this.random = new Random()
        this.musicGen = new MusicGen(this.random)
        this.clickGen = new ClickGen(this.random)
        this.pathGen = new PathGen(this.random)
        this.terrainGen = new TerrainGen(this.random)

        this.playedNotes = new WeakSet()
        this.triggeredKeys = new WeakMap()
        this.notes = []
        this.clicks = []
        this.path = []
        this.terrain = []
        this.at = 0

        this.runner = null
        this.input = new Map()

        this.time = 0
        this.silenceEffectStartsAt = -Infinity
        this.lastEffectEndsAt = -Infinity

        this.homeMenu = true
        this.homeMenuTransition = 1
        this.homeSelected = 0
        this.deathMenuTransition = 0
        this.deathMenuSelected = 0
        this.configMenu = false
        this.configSelected = 0

        this.creditsMenu = false

        this.pull()
    }

    reset(home) {
        this.random = new Random()
        this.musicGen = new MusicGen(this.random)
        this.clickGen = new ClickGen(this.random)
        this.pathGen = new PathGen(this.random)
        this.terrainGen = new TerrainGen(this.random)

        this.playedNotes = new WeakSet()
        this.triggeredKeys = new WeakMap()
        this.notes = []
        this.clicks = []
        this.path = []
        this.terrain = []
        this.at = 0

        this.runner = home ? null : { x: 0, y: 0, vx: 1, vy: 0, alive: true, traveled: 0, logged: false }

        if (this.config.tutorial && !home) this.pullTutorial()
        this.pull()
    }

    startGame() {
        this.reset(false)
    }

    endGame() {
        this.reset(true)
    }

    scheduleEffect(effect) {
        if (effect === 'silence') {
            this.silenceEffectStartsAt = this.time
            return
        }

        if (this.time < this.lastEffectEndsAt) return

        let duration = 1 / this.config.notesPerSec

        let notes = ({
            generic: [[0], [0, 2]],
            important: [[0, 2, 4]],
            up: [[5], [7]],
            down: [[-2], [0]],
            black: [[0, 3, 6]],
        })[effect] ?? []
        this.lastEffectEndsAt = this.time + notes.length * duration / 3

        for (let i = 0; i < notes.length; i++) {
            let time = this.synth.ax.currentTime + duration / 3 * i
            for (let note of notes[i]) {
                this.synth.scheduleNote({ time, duration, frequency: 440 * 2 ** ((note - 9) / 12), gain: 0.25 })
            }
        }
    }

    pullTutorial() {
        let notes = [
            { time: 20, duration: 1, keyPosition: 0, frequency: 440 * 2 ** (-9 / 12), gain: 0.5 },
        ]
        let terrain = [
            { x: 0, y: 1, width: 7, height: 1, type: 'floor' },
            { x: 10, y: 1, width: 13, height: 1, type: 'floor' },
            { x: 14, y: 0, width: 1, height: 1, type: 'black' },
            { x: 20, y: 0, width: 1, height: 1, type: 'white' },

            { x: 8, y: -2, width: 1, height: 1, type: 'tutorialJump' },
            { x: 14, y: -4, width: 1, height: 1, type: 'tutorialBlack' },
            { x: 20, y: -2, width: 1, height: 1, type: 'tutorialWhite' },
        ]
        let path = [
            { start: { x: 0, y: 0 }, end: { x: 6, y: 0 }, type: 'straight' },
            { start: { x: 6, y: 0 }, end: { x: 10, y: 0 }, type: 'jump' },
            { start: { x: 10, y: 0 }, end: { x: 12, y: 0 }, type: 'straight' },
            { start: { x: 12, y: 0 }, end: { x: 16, y: 0 }, type: 'jump' },
            { start: { x: 16, y: 0 }, end: { x: 22, y: 0 }, type: 'straight' },
            { start: { x: 22, y: 0 }, end: { x: 26, y: 0 }, type: 'jump' },
        ]
        this.notes.push({ sheetSize: 26, notes })
        this.clicks.push({ sheetSize: 26, clicks: [] })
        this.path.push({ sheetSize: 26, path })
        this.terrain.push({ sheetSize: 26, terrain })
    }

    pull() {
        if (this.notes.length > 0 && this.at > this.notes[0].sheetSize + 64) {
            this.at -= this.notes[0].sheetSize
            if (this.runner) this.runner.x -= this.notes[0].sheetSize
            this.notes.shift()
            this.clicks.shift()
            this.path.shift()
            this.terrain.shift()
        }

        while (this.notes.length < 4) this.notes.push(this.musicGen.pullSheet())
        while (this.clicks.length < 2) this.clicks.push(this.clickGen.pullSheet(this.notes[this.clicks.length]))
        while (this.path.length < 2) this.path.push(this.pathGen.pullSheet(this.clicks[this.path.length]))
        while (this.terrain.length < 2) this.terrain.push(this.terrainGen.pullSheet(this.path[this.terrain.length]))

        // notesTotalMin = 3 * 256 - 16
        // terrainTotalMin = 256 - 16
    }

    renderEntity(x, y, width, height, type, e) {
        let tutorialText = ({
            'tutorialJump': 'Tap or press space to\njump over this gap',
            'tutorialBlack': 'Avoid black dissonance keys',
            'tutorialWhite': 'Hit the white melody keys',
        })[type]

        if (tutorialText != null) {
            this.cx.fillStyle(0xffffff)
            this.cx.fillText(x + width / 2 - width * 10, y, { width: width * 20, height: height / 2 }, tutorialText)
            return
        }

        let keyColor = palette[type]

        if (keyColor != null) {
            let pressedFor = this.time - (this.triggeredKeys.get(e) ?? this.time)
            let depth = Math.min(pressedFor, 0.1) / 0.1 * (height - 7)
            this.cx.fillStyle(keyColor)
            this.cx.fillRoundedRect(x, y + depth, width, height - depth, { tl: 6, tr: 6, bl: 0, br: 0 })
            return
        }

        if (type === 'runner') {
            this.cx.fillStyle(0x999999)
            this.cx.fillRoundedRect(x, y, width, height, 6)
            return
        }

        if (type === 'floor') {
            this.cx.fillStyle(0x333333)
            this.cx.fillRoundedRect(x, y, width, height, 6)
            return
        }

        this.cx.fillStyle(0xff00ff)
        this.cx.fillRect(x, y, width, height)
    }

    renderWorld() {
        this.cx.fillStyle(0x161616)
        this.cx.fillRect(0, 0, 1600, 900)

        let a = this.homeMenuTransition
        let b = 1 - Math.min(Math.max((this.time - 0.35) / 2, 0), 1)

        this.cx.fillStyle(palette.white, a * a * (3 - 2 * a))

        let lowestOctave = -1
        let highestOctave = 1
        let overflowKeys = 1

        let lowestKey = 12 * lowestOctave - overflowKeys
        let highestKey = 12 * (1 + highestOctave) - 1 + overflowKeys

        let commonX = 300
        let rollY = 100 + a * a * (3 - 2 * a) * 400 + b * b * (3 - 2 * b) * 450

        let noteSize = 5 + a * a * (3 - 2 * a) * 3
        this.cx.fillStyle(0x383838)
        this.cx.fillRect(0, rollY - 9, 1600, noteSize * (highestKey - lowestKey + 1) + 18)
        this.cx.fillStyle(0x222222)
        this.cx.fillRect(0, rollY - 2, 1600, noteSize * (highestKey - lowestKey + 1) + 4)
        this.cx.fillStyle(0x282828)
        this.cx.fillRect(0, rollY + noteSize * (highestKey - 11), 1600, noteSize * 12)
        this.cx.fillStyle(0x515151)
        this.cx.fillRect(commonX, rollY - 2, 1, noteSize * (highestKey - lowestKey + 1) + 4)
        for (let i = 0, x = -this.at; i < this.notes.length; x += this.notes[i++].sheetSize) {
            for (let note of this.notes[i].notes) {
                let range = Math.floor(note.keyPosition / 12)
                let yLevel = highestKey - Math.min(Math.max(note.keyPosition, lowestKey), highestKey)
                let color = palette.get([0, 9, 1, 9, 2, 3, 9, 4, 9, 5, 9, 6][((note.keyPosition % 12) + 12) % 12])
                if (range < 0) color = palette.blend(color, 'black', -range * 0.3 - 0.15)
                if (range > 0) color = palette.blend(color, 'white', range * 0.3 - 0.15)
                this.cx.fillStyle(color)
                let left = commonX + (x + note.time) * noteSize
                let right = left + note.duration * noteSize
                this.cx.fillRect(left, rollY + yLevel * noteSize, right - left, noteSize)
                let insetLeft = left + 1
                let insetRight = Math.min(right - 1, commonX)
                if (insetLeft < insetRight) {
                    this.cx.fillStyle(palette.blend(color, 0x222222, 1 - (commonX - right) / 150))
                    this.cx.fillRect(insetLeft, rollY + yLevel * noteSize + 1, insetRight - insetLeft, noteSize - 2)
                }
            }
        }

        let worldY = 650 + a * a * (3 - 2 * a) * 600

        let tileSize = 25
        for (let i = 0, x = -this.at; i < this.terrain.length; x += this.terrain[i++].sheetSize) {
            for (let e of this.terrain[i].terrain) {
                this.renderEntity((x + e.x) * tileSize + commonX, e.y * tileSize + worldY, e.width * tileSize, e.height * tileSize, e.type, e)
            }
        }

        if (this.config.cheat && this.input.has('KeyC')) {
            this.cx.lineStyle(2, 0x444444)
            for (let i = 0, x = -this.at; i < this.path.length; x += this.path[i++].sheetSize) {
                for (let { start, end, type } of this.path[i].path) {
                    let startX = (x + start.x) * tileSize + commonX + tileSize * 0.5
                    let startY = start.y * tileSize + worldY + tileSize * 0.5
                    let endX = (x + end.x) * tileSize + commonX + tileSize * 0.5
                    let endY = end.y * tileSize + worldY + tileSize * 0.5
                    if (type === 'jump' || type === 'fall') {
                        this.cx.quadraticBetween(startX, startY, endX, 1 / tileSize, type === 'fall' ? 0 : -4)
                    } else {
                        this.cx.lineBetween(startX, startY, endX, endY)
                    }
                }
            }
        }

        if (this.runner)
            this.renderEntity((-this.at + this.runner.x) * tileSize + commonX, this.runner.y * tileSize + worldY, tileSize, tileSize, 'runner')
    }

    renderDeath() {
        if (!this.runner || this.runner.alive) return

        let b = this.deathMenuTransition

        this.cx.fillStyle(0x222222, 0.6 * b * b * (3 - 2 * b))
        this.cx.fillRect(200, 0, 1200, 900)

        this.cx.fillStyle(0xeeeeee, b * b * (3 - 2 * b))
        this.cx.fillText(600, 180, { width: 400, height: 48 }, 'Game Over')

        this.cx.fillText(300, 260, { width: 1000, height: 52 }, `Score: ${Math.floor(this.runner.traveled)} notes played`)
        if (!this.runner.logged) {
            this.runner.logged = true
            addScore({ score: Math.floor(this.runner.traveled) })
        }

        this.deathMenuSelected = ((
            this.deathMenuSelected - (this.input.get('ArrowUp') < 0) + (this.input.get('ArrowDown') < 0)
        ) + 2) % 2

        let items = ['Play Again', 'Quit']
        for (let i = 0; i < items.length; i++) {
            let selected = this.deathMenuSelected === i
            this.cx.fillStyle(selected ? palette.blend(0xffffff, 0x999999, (Math.sin(this.time * 8) + 1) / 2) : 0xdddddd, b * b * (3 - 2 * b))
            this.cx.fillText(400, 340 + i * 50, { width: 800, height: 36 }, items[i])
        }

        if (this.input.get('Space') < 0 || this.input.get('Enter') < 0) {
            if (this.deathMenuSelected === 0) {
                this.startGame()
            } else if (this.deathMenuSelected === 1) {
                this.endGame()
                this.homeMenu = true
            }
            this.scheduleEffect('generic')
        }
    }

    renderConfig() {
        if (!this.configMenu) return

        let config = {
            volume: { name: 'Volume', min: 0, max: 1, default: 0.5, unit: [100, '%'] },
            tutorial: { name: 'Tutorial', toggle: true, default: true },
            audioSync: { name: 'Audio Sync Offset', min: -0.8, max: 0.2, default: -0.3, unit: [1000, ' ms'] },
            advanced: { name: 'Developer Options', toggle: true, default: false },
            cheat: { name: 'C to Cheat', toggle: true, default: true, hidden: !this.config.advanced },
            notesPerSec: { name: 'Music Speed', min: 0.1, max: 10, default: 3, unit: [60, ' BPM'], hidden: !this.config.advanced },
        }

        let configLength = Object.values(config).filter(x => !x.hidden).length + 1
        this.configSelected = ((
            this.configSelected - (this.input.get('ArrowUp') < 0) + (this.input.get('ArrowDown') < 0)
        ) + configLength) % configLength

        this.cx.fillStyle(0x222222, 0.6)
        this.cx.fillRect(200, 0, 1200, 900)

        this.cx.fillStyle(0xeeeeee)
        this.cx.fillText(600, 240, { width: 400, height: 48 }, 'Options')

        let configIndex = 0
        for (let [key, options] of Object.entries(config)) {
            if (options.hidden) continue

            let value = this.config[key]
            let selected = this.configSelected === configIndex

            let canLeft = true
            let canRight = true
            let displayValue
            if (options.toggle) {
                if (selected) {
                    if ((value && this.input.get('ArrowLeft') < 0) || (!value && this.input.get('ArrowRight') < 0) || this.input.get('Space') < 0 || this.input.get('Enter') < 0) {
                        value = !value
                        this.scheduleEffect('generic')
                    }
                }
                displayValue = value ? 'Enabled' : 'Disabled'
                canLeft = value
                canRight = !value
            } else {
                let [scale, unit] = options.unit
                if (selected) {
                    if (this.input.get('ArrowLeft') <= 0) {
                        value -= 1 / scale
                        this.scheduleEffect('down')
                    }
                    if (this.input.get('ArrowRight') <= 0) {
                        value += 1 / scale
                        this.scheduleEffect('up')
                    }
                }
                if (value <= options.min) {
                    canLeft = false
                    value = options.min
                } else if (value >= options.max) {
                    canRight = false
                    value = options.max
                }
                displayValue = `${Math.round(value * scale)}${unit}`
            }

            this.cx.fillStyle(selected ? palette.blend(0xffffff, 0x999999, (Math.sin(this.time * 8) + 1) / 2) : 0xdddddd)
            this.cx.fillText(400, 320 + configIndex * 50, { width: 400, height: 36 }, options.name)
            this.cx.fillText(900, 320 + configIndex * 50, { width: 200, height: 36 }, displayValue)
            if (canLeft) this.cx.fillTriangle(
                900, 320 + configIndex * 50 + 18 - 9,
                900 - 9, 320 + configIndex * 50 + 18,
                900, 320 + configIndex * 50 + 18 + 9,
            )
            if (canRight) this.cx.fillTriangle(
                1100, 320 + configIndex * 50 + 18 - 9,
                1100 + 9, 320 + configIndex * 50 + 18,
                1100, 320 + configIndex * 50 + 18 + 9,
            )

            this.config[key] = value
            configIndex++
        }

        let selected = this.configSelected === configLength - 1
        this.cx.fillStyle(selected ? 0xffffff : 0xd8d8d8)
        this.cx.fillText(600, 320 + configIndex * 50 + 20, { width: 400, height: 36 }, 'Reset All Options')
        if (selected) {
            if (this.input.get('Space') < 0 || this.input.get('Enter') < 0) {
                this.configSelected = 0
                for (let [key, options] of Object.entries(config)) {
                    this.config[key] = options.default
                }
                this.scheduleEffect('important')
            }
        }
    }

    renderCredits() {
        if (!this.creditsMenu) return

        this.cx.fillStyle(0x222222, 0.6)
        this.cx.fillRect(200, 0, 1200, 900)

        this.cx.fillStyle(0xeeeeee)
        this.cx.fillText(600, 240, { width: 400, height: 48 }, 'Options')

        this.cx.fillText(400, 340, { width: 800, height: 36 }, 'Game "Chromatica" by Astra Tsai')
        this.cx.fillText(400, 400, { width: 800, height: 36 }, 'Font "Ubuntu Titling" by')
        this.cx.fillText(400, 440, { width: 800, height: 36 }, 'Andy Fitzsimon and Christian Robertson')
    }

    renderHome() {
        if (!this.homeMenuTransition) return

        if (this.time < 0.5) {
            let a = 1 - this.time / 0.5
            this.cx.fillStyle(palette.white, a * a * (3 - 2 * a))
            this.cx.fillText(500, 700, { width: 600, height: 30 }, 'Press any key to continue...')
        }

        let c = 1 - this.homeMenuTransition

        let xValues = [383, 463, 558, 620, 711, 846, 939, 1005, 1049, 1124]
        for (let i = 0; i < 10; i++) {
            let a = Math.min(Math.max((this.time - i * 0.15 - 0.5) / (0.75 + i * 0.05), 0), 1)
            let b = Math.min(Math.max((this.time - i * 0.15 - 0.5) / (0.3 + i * 0.1), 0), 1)
            this.cx.fillStyle(palette.blend('white', palette.blend(i % 7, 'black', 0.05), b * b * (3 - 2 * b)))
            this.cx.fillText(xValues[i], 250 - 160 * a * a * (3 - 2 * a) - 300 * c * c * (3 - 2 * c), { height: 160 }, 'Chromatica'.charAt(i))
        }

        let b = Math.min(Math.max((this.time - 0.35) / 2, 0), 1)

        if (!this.configMenu && !this.creditsMenu) { // bad text rendering workaround
            this.homeSelected = ((
                this.homeSelected - (this.input.get('ArrowUp') < 0) + (this.input.get('ArrowDown') < 0)
            ) + 3) % 3

            let homeItems = ['Play', 'Options', 'Credits']
            for (let i = 0; i < homeItems.length; i++) {
                let selected = this.homeSelected === i
                this.cx.fillStyle(selected ? palette.blend(0xffffff, 0x999999, (Math.sin(this.time * 8) + 1) / 2) : 0xdddddd, b * b * (3 - 2 * b))
                this.cx.fillText(400, 300 + i * 50 - 450 * c * c * (3 - 2 * c) + (300 - 300 * b * b * (3 - 2 * b)), { width: 800, height: 36 }, homeItems[i])
            }

            if ((this.input.get('Space') < 0 || this.input.get('Enter') < 0) && this.homeMenu) {
                if (this.homeSelected === 0) {
                    this.homeMenu = false
                    this.startGame()
                } else if (this.homeSelected === 1) {
                    this.configMenu = true
                } else if (this.homeSelected === 2) {
                    this.creditsMenu = true
                }
                this.scheduleEffect('generic')
            }
        }
    }

    renderInterface() {
        this.renderDeath()
        this.renderHome()
        this.renderConfig()
        this.renderCredits()
    }

    update(delta) {
        if (this.configMenu) return

        if (!this.runner) {
            this.at += delta * this.config.notesPerSec
            return
        }

        let timeslices = Math.max(2, Math.min(20, delta * 500)) // 500 TPS physics because integrals and quadratics are hard
        let timesliceDelta = delta / timeslices

        let boundLeft = this.runner.x - 1
        let boundRight = boundLeft + 2 + delta * this.config.notesPerSec
        let relevantTerrain = []
        for (let i = 0, x = 0; i < this.terrain.length; x += this.terrain[i++].sheetSize) {
            for (let e of this.terrain[i].terrain) {
                if ((x + e.x) < boundRight && (x + e.x) + e.width > boundLeft || 1) relevantTerrain.push({ ...e, e, x: x + e.x })
            }
        }

        for (let i = 0; i < timeslices; i++) {
            this.at += timesliceDelta * this.config.notesPerSec
            let dx = (1 + (this.at - this.runner.x) * 0.05) * timesliceDelta * this.config.notesPerSec // FIXME lerp 0.05
            this.runner.x += this.runner.vx * dx
            if (this.runner.alive) {
                this.runner.traveled += dx
            } else {
                this.runner.vx *= 0.997 // FIXME lerp 0.997
            }
            this.runner.y += (this.runner.vy + timesliceDelta * this.config.notesPerSec) * timesliceDelta * this.config.notesPerSec
            this.runner.vy += timesliceDelta * this.config.notesPerSec * 2
            let contactedTerrain = relevantTerrain.filter(e => this.runner.x < e.x + e.width && this.runner.x + 1 > e.x && this.runner.y < e.y + e.height && this.runner.y + 1 > e.y)
            for (let e of contactedTerrain) {
                if (e.type !== 'floor') {
                    if (e.type === 'black') {
                        // give black keys a smaller hitbox
                        if (!(this.runner.x < e.x + e.width * 0.7 && this.runner.x + 1 > e.x + e.width * 0.3 && this.runner.y + 1 > e.y + e.height * 0.5)) continue
                    }
                    if (!this.triggeredKeys.has(e.e)) {
                        this.triggeredKeys.set(e.e, this.time)
                    }

                    if (this.runner.alive && e.type === 'black') {
                        this.runner.alive = false
                        this.scheduleEffect('black')
                    }
                    continue
                }
                let pushLeft = this.runner.x + 1 - e.x
                let pushRight = e.x + e.width - this.runner.x
                let pushUp = this.runner.y + 1 - e.y
                let pushDown = e.y + e.height - this.runner.y
                if (Math.min(pushUp - 0.25, pushDown) <= Math.min(pushLeft, pushRight)) {
                    if (pushUp - 0.25 <= pushDown) {
                        let jumping = this.input.has('Mouse') || this.input.has('Space')
                        if (this.config.cheat && this.input.has('KeyC')) {
                            for (let i = 0, x = 0; i < this.path.length; x += this.path[i++].sheetSize) {
                                for (let e of this.path[i].path) {
                                    if (e.type === 'jump' && x + e.start.x < this.runner.x && x + (e.start.x + e.end.x) / 2 > this.runner.x) jumping = true
                                }
                            }
                        }

                        this.runner.y = e.y - 1
                        this.runner.vy = Math.min(this.runner.vy, jumping ? -4 : 0)
                    } else {
                        this.runner.y = e.y + e.height
                        this.runner.vy = Math.max(this.runner.vy, 0)
                    }
                } else {
                    if (pushLeft <= pushRight) {
                        this.runner.x = e.x - 1
                    } else {
                        this.runner.x = e.x + e.width
                    }
                }
            }
            if (this.runner.alive && (this.runner.y > 12 || relevantTerrain.some(e => e.type === 'white' && e.x < this.runner.x - 1.25 && !this.triggeredKeys.has(e.e)))) {
                this.runner.alive = false
                this.scheduleEffect('silence')
            }
        }
    }

    playMusic() {
        for (let i = 0, x = -this.at; i < this.notes.length; x += this.notes[i++].sheetSize) {
            for (let note of this.notes[i].notes) {
                if (this.playedNotes.has(note)) continue

                let playIn = (x + note.time) / this.config.notesPerSec + this.config.audioSync
                if (playIn > 0.1) continue
                this.playedNotes.add(note)
                if (playIn < 0.01) continue

                let time = this.synth.ax.currentTime + playIn
                let duration = note.duration / this.config.notesPerSec
                this.synth.scheduleNote({ ...note, time, duration })
            }
        }
    }

    render(delta) {
        this.time += delta
        this.homeMenuTransition = Math.min(Math.max(this.homeMenuTransition + delta * (this.homeMenu ? 1 : -1), 0), 1)
        this.deathMenuTransition = Math.min(Math.max(this.deathMenuTransition + (this.runner && !this.runner.alive ? delta : -1), 0), 1)

        if (this.input.get('Escape') < 0) {
            if (this.configMenu) this.configMenu = false
            else if (this.creditsMenu) this.creditsMenu = false
            else if (this.runner && !this.runner.alive) {
                this.endGame()
                this.homeMenu = true
            }
            this.scheduleEffect('generic')
        }

        let silenceTime = this.time - this.silenceEffectStartsAt
        let silenceFactor = silenceTime >= 3 ? 1 : silenceTime < 0.5 ? 1 - (silenceTime / 0.5) : (silenceTime - 0.5) / 2.5
        this.synth.setVolume(this.config.volume * silenceFactor)
        this.update(delta)
        this.pull()
        this.playMusic()
        this.cx.startFrame()
        this.renderWorld()
        this.renderInterface()
        this.cx.endFrame()

        for (let [id, time] of this.input) {
            if (time < 0) time = 0
            time += delta
            if (time > 0.05) time = 0
            this.input.set(id, time)
        }
    }
    mouseDown() {
        this.input.set('Mouse', -1)
    }
    mouseMove() {

    }
    mouseUp() {
        this.input.delete('Mouse')
    }
    keyDown(key) {
        this.input.set(key, -1)
    }
    keyUp(key) {
        this.input.delete(key)
    }
}

const Graphics = class extends Phaser.GameObjects.Graphics {
    constructor(scene) {
        super(scene)
        scene.add.displayList.add(this)
        this.width = scene.game.config.width
        this.height = scene.game.config.height
        this.cachedText = new Map()
    }
    startFrame() {
        this.clear()
        for (let cache of this.cachedText.values()) {
            cache.active = 0
        }
    }
    fillStyle(color, alpha = 1) {
        this.cachedFillStyle = { color, alpha }
        super.fillStyle(color, alpha)
    }
    fillText(x, y, { align = 'center', width = 0, height }, text) {
        let { color, alpha } = this.cachedFillStyle

        let cacheKey = [color, height, text].join(' ')
        let cache = this.cachedText.get(cacheKey)
        if (cache == null) {
            cache = { objects: [], active: 0 }
            this.cachedText.set(cacheKey, cache)
        }

        let object
        if (cache.objects.length - cache.active === 0) {
            object = this.scene.add.text(x, y, text, {
                align,
                color: `#${color.toString(16).padStart(6, '0')}`,
                fontFamily: 'Ubuntu Titling',
                fontSize: height,
            })
            cache.objects.push(object)
        } else {
            object = cache.objects[cache.active]
            object.x = x
            object.y = y
            object.text = text
        }
        cache.active++

        object.setAlign(align)
        object.setAlpha(alpha)
        object.setFixedSize(width, 0)
    }
    quadraticBetween(sx, sy, ex, a, b) {
        let chunk = Math.max(4, Math.ceil(Math.abs(ex - sx) / 3))
        this.beginPath()
        this.moveTo(sx, sy)
        for (let i = 1; i <= chunk; i++) {
            let lx = (ex - sx) * i / chunk
            let x = sx + lx
            let y = sy + a * lx * lx + b * lx
            this.lineTo(x, y)
        }
        this.stroke()
    }
    endFrame() {
        for (let [key, cache] of this.cachedText.entries()) {
            while (cache.objects.length > cache.active) {
                cache.objects.pop().destroy()
            }
            if (cache.active === 0) {
                this.cachedText.delete(key)
            }
        }
    }
}

export const Play = class extends Phaser.Scene {
    constructor() {
        super('Play')
    }

    create(ax) {
        this.graphics = new Graphics(this)
        this.synth = new Synth(ax)
        this.gameLogic = new Game(this.graphics, this.synth)

        this.input.on('pointerdown', e => this.gameLogic.mouseDown(e.position))
        this.input.on('pointermove', e => this.gameLogic.mouseMove(e.position))
        this.input.on('pointerup', e => this.gameLogic.mouseUp(e.position))
        this.input.keyboard.on('keydown', e => !e.repeat && this.gameLogic.keyDown(e.code))
        this.input.keyboard.on('keyup', e => this.gameLogic.keyUp(e.code))
    }

    update(_time, delta) {
        this.gameLogic.render(delta / 1000)
    }
}
