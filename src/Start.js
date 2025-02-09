// N.B. this is necessary to ensure that the audio context has started successfully

export const Start = class extends Phaser.Scene {
    constructor() {
        super('Start')
    }

    create() {
        this.input.mouse.disableContextMenu()

        let ax = new AudioContext()
        if (ax.state === 'running') {
            this.scene.start('Play', ax)
            return
        }

        let started = false
        let tryStart = async () => {
            if (started) return
            await ax.resume()
            if (started) return
            started = true
            this.scene.start('Play', ax)
        }
        tryStart()

        this.input.on('pointerdown', tryStart)
        this.input.on('pointerup', tryStart)
        this.input.keyboard.on('keydown', tryStart)
        this.input.keyboard.on('keyup', tryStart)
    }
}
