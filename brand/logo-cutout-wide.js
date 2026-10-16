// Removes the baked-in grey checkerboard from the horizontal Slam logo
// (surfboard · SLAM · BEACH BAR in one row). Same idea as logo-cutout.js:
// checker squares are perfectly neutral, every part of the logo carries
// colour (cream, yellow) or is black ink. Edge pixels become partly
// transparent in the pure logo colour so they blend onto any background.
//   node logo-cutout-wide.js <dir with node_modules/pngjs> <in.png> <out.png>
const fs = require('fs')
const [dir, inPath, outPath] = process.argv.slice(2)
const { PNG } = require(`${dir}/node_modules/pngjs`)
const src = PNG.sync.read(fs.readFileSync(inPath))
const { width: W, height: H, data } = src
const at = (x, y) => (y * W + x) * 4
const clamp = (v) => Math.max(0, Math.min(1, v))
const median = (arr) => arr.sort((a, b) => a - b)[Math.floor(arr.length / 2)]

// --- checker greys, from the top-left corner
const greys = []
for (let y = 0; y < 60; y++)
  for (let x = 0; x < 60; x++) {
    const i = at(x, y)
    greys.push((data[i] + data[i + 1] + data[i + 2]) / 3)
  }
const greyLow = Math.min(...greys) - 8
const greyHigh = Math.max(...greys) + 8
// some checkers are slightly tinted, and JPEG adds colour noise: how far
// from pure grey the background strays, plus a margin
let bgChroma = 0
for (let y = 0; y < 60; y++)
  for (let x = 0; x < 60; x++) {
    const i = at(x, y)
    bgChroma = Math.max(bgChroma, Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]))
  }
bgChroma += 4

// --- where things are: yellow columns (board, BEACH BAR) and the cream in between
const midA = Math.floor(H * 0.4),
  midB = Math.floor(H * 0.6)
const yellowCols = []
for (let x = 0; x < W; x++) {
  let n = 0
  for (let y = midA; y < midB; y++) {
    const i = at(x, y)
    if (data[i] - data[i + 2] > 150) n++
  }
  if (n > 3) yellowCols.push(x)
}
let boardRight = yellowCols[0]
while (yellowCols.includes(boardRight + 1)) boardRight++
const beachLeft = yellowCols.find((x) => x > boardRight + 20)
const creamZone = (x) => x > boardRight + 8 && x < beachLeft - 8

// --- reference colours, measured from the image itself
const cr = [[], [], []],
  ye = [[], [], []]
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const i = at(x, y)
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2]
    const warm = r - b
    if (creamZone(x) && (r + g + b) / 3 > 215 && warm > 12 && warm < 45) [r, g, b].forEach((v, c) => cr[c].push(v))
    if (!creamZone(x) && warm > 200) [r, g, b].forEach((v, c) => ye[c].push(v))
  }
const CREAM = cr.map(median)
const YELLOW = ye.map(median)
const INK = [12, 6, 2]
const creamWarm = CREAM[0] - CREAM[2]
const CREAM_V = (CREAM[0] + CREAM[1] + CREAM[2]) / 3
const yellowWarm = YELLOW[0] - YELLOW[2]

// the darkest the letters' outline gets over the checker = fully black
const OUTLINE_V = 70

// The checker grey behind every pixel: spread each plain checker pixel's
// value outwards to the pixels around it (nearest one wins).
const behind = new Float32Array(W * H).fill(-1)
{
  let queue = []
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = at(x, y)
      const r = data[i],
        g = data[i + 1],
        b = data[i + 2]
      const v = (r + g + b) / 3
      if (Math.max(r, g, b) - Math.min(r, g, b) <= bgChroma && v >= greyLow && v <= greyHigh) {
        behind[y * W + x] = v
        queue.push(y * W + x)
      }
    }
  while (queue.length) {
    const next = []
    for (const p of queue) {
      const x = p % W,
        y = (p - x) / W
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx,
          yy = y + dy
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue
        const q = yy * W + xx
        if (behind[q] >= 0) continue
        behind[q] = behind[p]
        next.push(q)
      }
    }
    queue = next
  }
}

const out = new PNG({ width: W, height: H })
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const i = at(x, y)
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2]
    const v = (r + g + b) / 3
    const chroma = Math.max(r, g, b) - Math.min(r, g, b)
    const warm = r - b
    let a
    let colour = [r, g, b]
    if (creamZone(x) && !process.env.SMOOTH) {
      // Each pixel is compared with the checker square right behind it:
      // brighter = cream letter, darker = the letters' black outline.
      const bg = behind[y * W + x]
      // (small differences are compression ripple at the square joins)
      if (v > bg + 14) {
        a = clamp((v - bg - 8) / (CREAM_V - 14 - bg))
        colour = CREAM
      } else if (v < bg - 14) {
        a = clamp((bg - v - 8) / (bg - 8 - OUTLINE_V))
        colour = INK
      } else a = 0
    } else if (chroma <= bgChroma && v >= greyLow && v <= greyHigh + 15) {
      a = 0 // checker square, its seams and its compression noise
    } else if (chroma <= bgChroma + 10 && v < greyLow) {
      // black ink, possibly blended with a grey square at an edge
      a = clamp((greyLow - v) / (greyLow - 15))
      if (a < 0.95) colour = INK
    } else if (creamZone(x)) {
      a = clamp((warm - 3) / (creamWarm * 0.75 - 3))
      if (a < 1) colour = CREAM
    } else {
      // yellow mixed with neutral grey k: dark k = the black outline (solid),
      // checker-grey k = the edge against the background (partly transparent)
      const share = clamp(warm / yellowWarm)
      const k = share < 0.97 ? (b - YELLOW[2] * share) / (1 - share) : 0
      if (share >= 0.92 || k < greyLow - 25) {
        a = 1
      } else {
        a = clamp((warm - 3) / (yellowWarm - 3))
        colour = YELLOW
      }
    }
    out.data[i] = colour[0]
    out.data[i + 1] = colour[1]
    out.data[i + 2] = colour[2]
    out.data[i + 3] = Math.round(a * 255)
  }

// The outline hugs the letters: anything in the SLAM area that isn't solid
// letter and has no solid letter within 4px is compression speckle.
if (!process.env.SMOOTH) {
  const solid = new Uint8Array(W * H)
  for (let p = 0; p < W * H; p++) {
    const x = p % W
    solid[p] = creamZone(x) && out.data[p * 4 + 3] > 230 && out.data[p * 4] === CREAM[0] ? 1 : 0
  }
  const R = 4
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const p = y * W + x
      if (!creamZone(x) || solid[p] || out.data[p * 4 + 3] === 0) continue
      let near = false
      for (let dy = -R; dy <= R && !near; dy++)
        for (let dx = -R; dx <= R; dx++) {
          const xx = x + dx,
            yy = y + dy
          if (xx >= 0 && yy >= 0 && xx < W && yy < H && solid[yy * W + xx]) {
            near = true
            break
          }
        }
      if (!near) out.data[p * 4 + 3] = 0
    }
}

// Optional (SMOOTH=1): for a blurry source, smooth compression raggedness out
// of the cream letters' edges.
if (process.env.SMOOTH) {
  const alpha = new Float32Array(W * H)
  for (let p = 0; p < W * H; p++) alpha[p] = out.data[p * 4 + 3] / 255
  const blur = (s) => {
    const d = new Float32Array(W * H)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        let sum = 0,
          n = 0
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx,
              yy = y + dy
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue
            sum += s[yy * W + xx]
            n++
          }
        d[y * W + x] = sum / n
      }
    return d
  }
  const soft = blur(blur(alpha))
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!creamZone(x)) continue
      const p = y * W + x
      out.data[p * 4] = CREAM[0]
      out.data[p * 4 + 1] = CREAM[1]
      out.data[p * 4 + 2] = CREAM[2]
      out.data[p * 4 + 3] = Math.round(clamp((soft[p] - 0.32) / 0.36) * 255)
    }
}

// Trim to the visible logo, with a small margin.
let minX = W,
  minY = H,
  maxX = 0,
  maxY = 0
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++)
    if (out.data[at(x, y) + 3] > 40) {
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }
const m = 4
minX = Math.max(0, minX - m)
minY = Math.max(0, minY - m)
maxX = Math.min(W - 1, maxX + m)
maxY = Math.min(H - 1, maxY + m)
const cw = maxX - minX + 1,
  ch = maxY - minY + 1
const cropped = new PNG({ width: cw, height: ch })
PNG.bitblt(out, cropped, minX, minY, cw, ch, 0, 0)
fs.writeFileSync(outPath, PNG.sync.write(cropped))
console.log(
  `greys ${Math.round(greyLow + 8)}–${Math.round(greyHigh - 8)} · board ≤ x${boardRight} · BEACH BAR from x${beachLeft} · cream ${CREAM} · yellow ${YELLOW} · logo ${cw}×${ch}`
)
