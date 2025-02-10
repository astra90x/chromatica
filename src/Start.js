// N.B. this is necessary to ensure that the audio context has started successfully

export const Start = class extends Phaser.Scene {
    constructor() {
        super('Start')
    }

    create() {
        this.input.mouse.disableContextMenu()

        let ax = new AudioContext()
        // if (ax.state === 'running') {
        //     this.scene.start('Play', ax)
        //     return
        // }

        this.add.rectangle(0, 0, 1600, 900, 0x161616).setDisplayOrigin(0, 0)

        this.add.text(0, 250, 'Chromatica', {
            align: 'center',
            color: '#fff',
            fontFamily: 'Ubuntu Titling',
            fontSize: 160,
            fixedWidth: 1600,
        })

        this.add.text(0, 700, 'Press any key to continue...', {
            align: 'center',
            color: '#fff',
            fontFamily: 'Ubuntu Titling',
            fontSize: 30,
            fixedWidth: 1600,
        })

        let started = false
        let tryStart = async () => {
            if (started) return
            await ax.resume()
            if (started) return
            started = true
            this.scene.start('Play', ax)
        }

        this.input.on('pointerdown', tryStart)
        this.input.on('pointerup', tryStart)
        this.input.keyboard.on('keydown', tryStart)
        this.input.keyboard.on('keyup', tryStart)
    }
}
