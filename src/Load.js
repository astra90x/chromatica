export const Load = class extends Phaser.Scene {
    constructor() {
        super('Load')
    }

    preload() {
        this.gfx = this.add.graphics()

        this.load.font('Ubuntu Titling', 'assets/UbuntuTitling-Bold.ttf', 'truetype')

        // this would be more useful if Phaser isn't being used, because Phaser is much larger than this font
        this.load.on('progress', progress => {
            this.gfx.clear()
            this.gfx.fillStyle(0x333333)
            this.gfx.fillRect(800 - 600 / 2, 450 - 10 / 2, 600, 10)
            this.gfx.fillStyle(0xffffff)
            this.gfx.fillRect(800 - 600 / 2, 450 - 10 / 2, 600 * progress, 10)
        })
    }

    create() {
        this.scene.start('Play')
    }
}
