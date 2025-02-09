import { Synth, TerrainGen } from './core.js'

const Game = class {
    constructor(cx, synth) {
        this.cx = cx
        this.synth = synth
        this.terrain = new TerrainGen()
    }
    render() {
        let x = this.terrain.pullSheet()
        for (let e of x) {
            this.cx.fillStyle(e.color)
            this.cx.fillRect(e.x, e.y, e.width, e.height)
        }
    }
    mouseDown() {

    }
    mouseMove() {

    }
    mouseUp() {

    }
    keyDown() {

    }
    keyUp() {

    }
}

export const Play = class extends Phaser.Scene {
    constructor() {
        super('Play')
    }

    create() {
        this.graphics = this.add.graphics()
        this.synth = new Synth(this.sound.context)
        this.gameLogic = new Game(this.graphics, this.synth)

        this.input.on('pointerdown', e => this.gameLogic.mouseDown(e.position))
        this.input.on('pointermove', e => this.gameLogic.mouseMove(e.position))
        this.input.on('pointerup', e => this.gameLogic.mouseUp(e.position))
        this.input.keyboard.on('keydown', e => !e.repeat && this.gameLogic.keyDown(e.key))
        this.input.keyboard.on('keyup', e => this.gameLogic.keyUp(e.key))
    }

    update() {
        this.gameLogic.render()
    }
}
