// Name: Astra Tsai
// Game: Chromatica
// Time Spent: 20 hours coding + ~20 more hours learning music theory and tuning a synthesizer

/*

## Creative Tilt
- Technical: The music and platforms are procedurally generated and (if there is no bug) it
  guarantees that there is a valid path to traverse the platforms. The C to Cheat feature takes
  advantage of this to play the game automatically.
- Stylistic: I wrote a piano synthesizer for this project, which took much more effort than I
  expected, but I think it turned out sounding quite good.
- Visual: If we only consider visual styles, the startup sequence with the title is pretty cool?

*/

import { Load } from './Load.js'
import { Start } from './Start.js'
import { Play } from './Play.js'

new Phaser.Game({
    type: Phaser.AUTO,
    width: 1600,
    height: 900,
    scale: {
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    audio: {
        noAudio: true,
    },
    scene: [Load, Start, Play],
})
