import { Random, Synth, MusicGen, ClickGen, PathGen, TerrainGen } from './core.js'

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
        this.notes = []
        this.clicks = []
        this.path = []
        this.terrain = []
        this.at = 0

        this.runner = { x: 0, y: 0, vy: 0 }
        this.input = new Map()

        this.configMenu = false
        this.configSelected = 0

        if (this.config.tutorial) this.pullTutorial()
        this.pull()
    }

    scheduleMusic() {
        if (this.synth.ax.currentTime < this.musicEndsAt - 5) return

        let musicStartsAt = Math.max(this.synth.ax.currentTime, this.musicEndsAt)
        let music = this.musicGen.pullSheet()
        this.synth.play(music.map(x => ({ ...x, time: x.time + musicStartsAt })))
        this.musicEndsAt = musicStartsAt + music[music.length - 1].time + music[music.length - 1].duration
    }

    scheduleEffect(effect) {
        let notes = ({
            black: [0, 3, 6],
        })[effect] ?? []

        let time = this.synth.ax.currentTime
        let duration = 1 / this.config.notesPerSec
        for (let note of notes) {
            this.synth.scheduleNote({ time, duration, frequency: 440 * 2 ** ((note - 9) / 12), gain: 0.5 })
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
            this.runner.x -= this.notes[0].sheetSize
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

    renderEntity(x, y, width, height, type) {
        let tutorialText = ({
            'tutorialJump': 'Tap or press space to\njump over this gap',
            'tutorialBlack': 'Avoid black dissonance keys',
            'tutorialWhite': 'Hit the white melody keys',
        })[type]

        if (tutorialText != null) {
            this.cx.fillStyle(0x000000)
            this.cx.fillText(x + width / 2 - width * 10, y, { width: width * 20, height: height / 2 }, tutorialText)
            return
        }

        let keyColor = ({
            'black': 0x333333,
            'white': 0xffffff,
            'red': 0xff0000,
            'orange': 0xff7f00,
            'yellow': 0xffff00,
            'green': 0x00ff00,
            'cyan': 0x0000ff,
            'blue': 0x0000ff,
            'purple': 0x7f00ff,
        })[type]

        if (keyColor != null) {
            this.cx.fillStyle(keyColor)
            this.cx.fillRoundedRect(x, y, width, height, { tl: 6, tr: 6, bl: 0, br: 0 })
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
        this.cx.fillStyle(0xeeeeee)
        this.cx.fillRect(0, 0, 1600, 900)

        let noteSize = 5
        this.cx.fillStyle(0x333333)
        this.cx.fillRect(300, 200 - noteSize * 20, 1, noteSize * 40)
        for (let i = 0, x = -this.at; i < this.notes.length; x += this.notes[i++].sheetSize) {
            for (let note of this.notes[i].notes) {
                this.cx.fillRect(300 + (x + note.time) * noteSize, 200 - note.keyPosition * noteSize, note.duration * noteSize, noteSize)
            }
        }

        let tileSize = 25
        for (let i = 0, x = -this.at; i < this.terrain.length; x += this.terrain[i++].sheetSize) {
            for (let e of this.terrain[i].terrain) {
                this.renderEntity((x + e.x) * tileSize + 300, e.y * tileSize + 650, e.width * tileSize, e.height * tileSize, e.type)
            }
        }

        if (this.config.cheat && this.input.has('KeyC')) {
            this.cx.lineStyle(2, 0x444444)
            for (let i = 0, x = -this.at; i < this.path.length; x += this.path[i++].sheetSize) {
                for (let { start, end, type } of this.path[i].path) {
                    let startX = (x + start.x) * tileSize + 300 + tileSize * 0.5
                    let startY = start.y * tileSize + 650 + tileSize * 0.5
                    let endX = (x + end.x) * tileSize + 300 + tileSize * 0.5
                    let endY = end.y * tileSize + 650 + tileSize * 0.5
                    if (type === 'jump' || type === 'fall') {
                        this.cx.quadraticBetween(startX, startY, endX, 1 / tileSize, type === 'fall' ? 0 : -4)
                    } else {
                        this.cx.lineBetween(startX, startY, endX, endY)
                    }
                }
            }
        }

        this.renderEntity((-this.at + this.runner.x) * tileSize + 300, this.runner.y * tileSize + 650, tileSize, tileSize, 'runner')
    }

    renderInterface() {
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

        this.cx.fillStyle(0x111111, 0.4)
        this.cx.fillRect(0, 0, 1600, 900)

        this.cx.fillStyle(0xeeeeee)
        this.cx.fillText(600, 220, { width: 400, height: 48 }, 'Options')

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
                    if ((value && this.input.get('ArrowLeft') < 0) || (!value && this.input.get('ArrowRight') < 0) || this.input.get('Space') < 0 || this.input.get('Enter') < 0) value = !value
                }
                displayValue = value ? 'Enabled' : 'Disabled'
                canLeft = value
                canRight = !value
            } else {
                let [scale, unit] = options.unit
                if (selected) {
                    value += (-(this.input.get('ArrowLeft') <= 0) + (this.input.get('ArrowRight') <= 0)) / scale
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

            this.cx.fillStyle(selected ? 0xffffff : 0xd8d8d8)
            this.cx.fillText(400, 300 + configIndex * 50, { width: 400, height: 36 }, options.name)
            this.cx.fillText(900, 300 + configIndex * 50, { width: 200, height: 36 }, displayValue)
            if (canLeft) this.cx.fillTriangle(
                900, 300 + configIndex * 50 + 18 - 9,
                900 - 9, 300 + configIndex * 50 + 18,
                900, 300 + configIndex * 50 + 18 + 9,
            )
            if (canRight) this.cx.fillTriangle(
                1100, 300 + configIndex * 50 + 18 - 9,
                1100 + 9, 300 + configIndex * 50 + 18,
                1100, 300 + configIndex * 50 + 18 + 9,
            )

            this.config[key] = value
            configIndex++
        }

        let selected = this.configSelected === configLength - 1
        this.cx.fillStyle(selected ? 0xffffff : 0xd8d8d8)
        this.cx.fillText(600, 300 + configIndex * 50 + 20, { width: 400, height: 36 }, 'Reset All Options')
        if (selected) {
            if (this.input.get('Space') < 0 || this.input.get('Enter') < 0) {
                this.configSelected = 0
                for (let [key, options] of Object.entries(config)) {
                    this.config[key] = options.default
                }
            }
        }
    }

    update(delta) {
        if (this.configMenu) return

        let timeslices = Math.max(2, Math.min(20, delta * 500)) // 500 TPS physics because integrals and quadratics are hard
        let timesliceDelta = delta / timeslices

        let boundLeft = this.runner.x
        let boundRight = boundLeft + 1 + delta * this.config.notesPerSec
        let relevantTerrain = []
        for (let i = 0, x = 0; i < this.terrain.length; x += this.terrain[i++].sheetSize) {
            for (let e of this.terrain[i].terrain) {
                if ((x + e.x) < boundRight && (x + e.x) + e.width > boundLeft || 1) relevantTerrain.push({ ...e, e, x: x + e.x })
            }
        }

        for (let i = 0; i < timeslices; i++) {
            this.at += timesliceDelta * this.config.notesPerSec
            this.runner.x += (1 + (this.at - this.runner.x) * 0.05) * timesliceDelta * this.config.notesPerSec // FIXME lerp 0.05
            this.runner.y += (this.runner.vy + timesliceDelta * this.config.notesPerSec) * timesliceDelta * this.config.notesPerSec
            this.runner.vy += timesliceDelta * this.config.notesPerSec * 2
            let contactedTerrain = relevantTerrain.filter(e => this.runner.x < e.x + e.width && this.runner.x + 1 > e.x && this.runner.y < e.y + e.height && this.runner.y + 1 > e.y)
            for (let e of contactedTerrain) {
                if (e.type !== 'floor') continue
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
        }
    }

    playMusic() {
        for (let i = 0, x = -this.at; i < this.notes.length; x += this.notes[i++].sheetSize) {
            for (let note of this.notes[i].notes) {
                if (this.playedNotes.has(note)) continue

                let playIn = (x + note.time) / this.config.notesPerSec + this.config.audioSync
                if (playIn > 0.5) continue
                this.playedNotes.add(note)
                if (playIn < 0.05) continue

                let time = this.synth.ax.currentTime + playIn
                let duration = note.duration / this.config.notesPerSec
                this.synth.scheduleNote({ ...note, time, duration })
            }
        }
    }

    render(_time, delta) {
        if (this.input.get('Escape') < 0) this.configMenu = !this.configMenu

        this.synth.setVolume(this.config.volume)
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

    update(time, delta) {
        this.gameLogic.render(time / 1000, delta / 1000)
    }
}
