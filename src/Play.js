import { Random, Synth, MusicGen, ClickGen, PathGen, TerrainGen } from './core.js'

const BEAT_PER_SEC = 45
const NOTE_PER_MIN = BEAT_PER_SEC * 4
const NOTE_PER_SEC = NOTE_PER_MIN / 60

const Game = class {
    constructor(cx, synth) {
        this.cx = cx
        this.synth = synth
        synth.setVolume(0.5)

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
        this.mouse = false
        this.keyboard = false

        this.pullTutorial()
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
        let duration = 1 / NOTE_PER_SEC
        for (let note of notes) {
            this.synth.scheduleNote({ time, duration, frequency: 440 * 2 ** ((note - 9) / 12), gain: 0.5 })
        }
    }

    pullTutorial() {
        let notes = []
        let terrain = [
            { x: 0, y: 1, width: 7, height: 1, type: 'floor' },
            { x: 10, y: 1, width: 13, height: 1, type: 'floor' },
            { x: 14, y: 0, width: 1, height: 1, type: 'black' },
            { x: 20, y: -1, width: 1, height: 1, type: 'white' },

            { x: 8, y: -2, width: 1, height: 1, type: 'tutorialJump' },
            { x: 14, y: -4, width: 1, height: 1, type: 'tutorialBlack' },
            { x: 20, y: -2, width: 1, height: 1, type: 'tutorialWhite' },
        ]
        let path = [
            { start: { x: 0, y: 0 }, end: { x: 6, y: 0 }, type: 'straight' },
            { start: { x: 6, y: 0 }, end: { x: 10, y: 0 }, type: 'jump' },
            { start: { x: 10, y: 0 }, end: { x: 12, y: 0 }, type: 'straight' },
            { start: { x: 12, y: 0 }, end: { x: 16, y: 0 }, type: 'jump' },
            { start: { x: 16, y: 0 }, end: { x: 23, y: 0 }, type: 'straight' },
        ]
        this.notes.push({ sheetSize: 23, notes })
        this.clicks.push({ sheetSize: 23, clicks: [] })
        this.path.push({ sheetSize: 23, path })
        this.terrain.push({ sheetSize: 23, terrain })
    }

    pull() {
        if (this.notes.length > 0 && this.at > this.notes[0].sheetSize + 16) {
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
            this.cx.fillStyle(0xffffff)
            this.cx.fillText(x + width / 2 - width * 10, y, { width: width * 20, height: height / 2 }, tutorialText)
            return
        }

        this.cx.fillStyle(({
            'black': 0x333333,
            'white': 0xffffff,
            'red': 0xff0000,
            'orange': 0xff7f00,
            'yellow': 0xffff00,
            'green': 0x00ff00,
            'cyan': 0x0000ff,
            'blue': 0x0000ff,
            'purple': 0x7f00ff,
            'floor': 0xffffff,
            'runner': 0x999999,
        })[type] ?? 0xff00ff)
        this.cx.fillRect(x, y, width, height)
    }

    renderWorld() {
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

        if (this.keyboardCheat) {
            for (let i = 0, x = -this.at; i < this.path.length; x += this.path[i++].sheetSize) {
                for (let { start, end, type } of this.path[i].path) {
                    this.cx.lineStyle(2, type === 'jump' ? 0x00ff00 : type === 'fall' ? 0xff0000 : 0x4444ff)
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

    update(delta) {
        let timeslices = Math.max(2, Math.min(20, delta * 500)) // 500 TPS physics because integrals and quadratics are hard
        let timesliceDelta = delta / timeslices

        let boundLeft = this.runner.x
        let boundRight = boundLeft + 1 + delta * NOTE_PER_SEC
        let relevantTerrain = []
        for (let i = 0, x = 0; i < this.terrain.length; x += this.terrain[i++].sheetSize) {
            for (let e of this.terrain[i].terrain) {
                if ((x + e.x) < boundRight && (x + e.x) + e.width > boundLeft || 1) relevantTerrain.push({ ...e, e, x: x + e.x })
            }
        }

        for (let i = 0; i < timeslices; i++) {
            this.at += timesliceDelta * NOTE_PER_SEC
            this.runner.x += (1 + (this.at - this.runner.x) * 0.05) * timesliceDelta * NOTE_PER_SEC
            this.runner.y += (this.runner.vy + timesliceDelta * NOTE_PER_SEC) * timesliceDelta * NOTE_PER_SEC
            this.runner.vy += timesliceDelta * NOTE_PER_SEC * 2
            let contactedTerrain = relevantTerrain.filter(e => this.runner.x < e.x + e.width && this.runner.x + 1 > e.x && this.runner.y < e.y + e.height && this.runner.y + 1 > e.y)
            for (let e of contactedTerrain) {
                if (e.type !== 'floor') continue
                let pushLeft = this.runner.x + 1 - e.x
                let pushRight = e.x + e.width - this.runner.x
                let pushUp = this.runner.y + 1 - e.y
                let pushDown = e.y + e.height - this.runner.y
                if (Math.min(pushUp - 0.25, pushDown) <= Math.min(pushLeft, pushRight)) {
                    if (pushUp - 0.25 <= pushDown) {
                        let jumping = this.mouse || this.keyboard ? true : false
                        if (this.keyboardCheat) {
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

                let playIn = (x + note.time - 1) / NOTE_PER_SEC
                if (playIn > 0.4) continue
                this.playedNotes.add(note)
                if (playIn < 0.08) continue

                let time = this.synth.ax.currentTime + playIn
                let duration = note.duration / NOTE_PER_SEC
                this.synth.scheduleNote({ ...note, time, duration })
            }
        }
    }

    render(_time, delta) {
        this.update(delta)
        this.pull()
        this.playMusic()
        this.cx.startFrame()
        this.renderWorld()
        this.cx.endFrame()
    }
    mouseDown() {
        this.mouse = true
    }
    mouseMove() {

    }
    mouseUp() {
        this.mouse = false
    }
    keyDown(key) {
        if (key === ' ') this.keyboard = true
        if (key === 'c') this.keyboardCheat = true
    }
    keyUp(key) {
        if (key === ' ') this.keyboard = false
        if (key === 'c') this.keyboardCheat = false
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
        this.input.keyboard.on('keydown', e => !e.repeat && this.gameLogic.keyDown(e.key))
        this.input.keyboard.on('keyup', e => this.gameLogic.keyUp(e.key))
    }

    update(time, delta) {
        this.gameLogic.render(time / 1000, delta / 1000)
    }
}
