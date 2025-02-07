const SHEET_WIDTH = 256

export const Random = class {
    constructor() {
    }
    get() {
        return Math.random()
    }
    chance(...chance) {
        chance = chance.length === 1 && Array.isArray(chance) ? chance[0] : chance
        let random = this.get() * chance.reduce((a, b) => a + b)
        let used = 0
        for (let [i, value] of chance.entries()) {
            used += value
            if (random < used)
                return i
        }
        return chance[0]
    }
}

export const ClickGen = class {
    constructor(rand) {
        this.rand = rand
    }
    pullSheet() {
        let sheet = []
        let x = 2
        while (x <= SHEET_WIDTH - 2) {
            sheet.push(x)
            x += this.rand.chance(0, 0, 0, 3, 5, 8, 10, 10, 8, 5, 2, 2, 2, 1, 1)
        }
        return sheet
    }
}

export const PathGen = class {
    constructor(rand) {
        this.rand = rand
        this.clickGen = new ClickGen(rand)
        this.y = 0
    }
    pullSheet() {
        let clicks = this.clickGen.pullSheet()

        let segments = []
        let x = 0
        for (let i = 0; i <= clicks.length; i++) {
            let startX = x
            let endX = clicks[i] ?? SHEET_WIDTH
            while (i + 1 < clicks.length && clicks[i + 1] - endX < 3) i++

            if (i > 0) {
                let length = Math.min(endX - startX - 1, this.rand.chance(0, 0, 2, 4, 10, 2, 1))
                let midX = startX + length
                segments.push({ startX, endX: midX, type: 'jump' })
                startX = midX
            }

            let fallSize = 1 + Math.floor(Math.random() * 3)
            if (endX - startX > 2 + fallSize) {
                let fallDelay = Math.floor(Math.random() * ((endX - startX) - (2 + fallSize)))
                let fallStart = startX + 1 + fallDelay
                let fallEnd = fallStart + fallSize

                segments.push({ startX, endX: fallStart, type: 'straight' })
                segments.push({ startX: fallStart, endX: fallEnd, type: 'fall' })
                segments.push({ startX: fallEnd, endX, type: 'straight' })
            } else {
                segments.push({ startX, endX, type: 'straight' })
            }

            x = endX
        }

        let path = []
        let y = this.y
        for (let { startX, endX, type } of segments) {
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
        this.y = y

        return path
    }
}

export const TerrainGen = class {
    constructor(rand = new Random()) {
        this.rand = rand
        this.pathGen = new PathGen(rand)
    }
    pullSheet() {
        let path = this.pathGen.pullSheet()
        return path.flatMap(p => {
            if (p.type === 'jump') return [{
                x: p.start.x,
                y: p.start.y - 1,
                width: 1,
                height: 1,
                color: 0xff0000,
            }, {
                x: p.start.x,
                y: Math.max(p.start.y, p.end.y),
                width: p.end.x - p.start.x,
                height: 1,
                color: 0x440000,
            }]
            if (p.type === 'fall') return [{
                x: p.start.x,
                y: Math.max(p.start.y, p.end.y),
                width: p.end.x - p.start.x,
                height: 1,
                color: 0x0000ff,
            }]
            return [{
                x: p.start.x,
                y: Math.max(p.start.y, p.end.y),
                width: p.end.x - p.start.x,
                height: 1,
                color: 0xffffff,
            }]
        }).map(p => ({
            x: 18 + p.x * 4,
            y: 360 + p.y * 4,
            width: p.width * 4,
            height: p.height * 4,
            color: p.color,
        }))
    }
}
