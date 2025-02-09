import { TerrainGen } from './core.js'

const Play = class extends Phaser.Scene {
    constructor() {
        super('Play')
    }

    init() {
        this.terrain = new TerrainGen()
    }

    create() {
        this.graphics = this.add.graphics()
        let x = this.terrain.pullSheet()
        console.log(x)
        for (let e of x) {
            this.graphics.fillStyle(e.color)
            this.graphics.fillRect(e.x, e.y, e.width, e.height)
        }
        console.log(this)
    }

    update() {
    }
}

export default Play
