// Removes the baked-in grey/white checkerboard from the Slam logo.
// The checker squares are perfectly neutral (r=g=b); every part of the logo
// carries colour: cream letters (r-b ≈ 17), yellow (r-b ≈ 237), black ink
// (dark). Edge pixels are a mix of logo colour and checker; their share of
// the logo colour becomes their opacity, and they keep the pure logo colour,
// so the edges blend cleanly onto any background.
const fs = require('fs')
const [dir, outPath] = process.argv.slice(2)
const { PNG } = require(`${dir}/node_modules/pngjs`)
const src = PNG.sync.read(fs.readFileSync(`${dir}/logo.png`))
const { width: W, height: H } = src

const CREAM = [246, 243, 228]
const YELLOW = [249, 214, 12]
const INK = [12, 4, 0]

// Where the cream "SLAM" ends and the yellow "BEACH BAR" begins: the first
// row (right of the surfboard) that holds strongly yellow pixels.
let yellowTop = H
for (let y = 0; y < H && yellowTop === H; y++)
  for (let x = 330; x < W; x++) {
    const i = (y * W + x) * 4
    if (src.data[i] - src.data[i + 2] > 150) {
      yellowTop = y
      break
    }
  }
const creamZone = (x, y) => x > 300 && y < yellowTop - 4

const clamp = (v) => Math.max(0, Math.min(1, v))
const out = new PNG({ width: W, height: H })

for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4
    const r = src.data[i],
      g = src.data[i + 1],
      b = src.data[i + 2]
    const v = (r + g + b) / 3
    const chroma = Math.max(r, g, b) - Math.min(r, g, b)
    const warm = r - b

    let a
    let colour = [r, g, b]
    if (v >= 200 && chroma <= 3) {
      a = 0 // checker square (or its compression noise)
    } else if (v < 200 && chroma <= 12) {
      // black ink, possibly mixed with a grey/white square at an edge
      a = clamp((212 - v) / (212 - 15))
      if (a < 0.95) colour = INK
    } else if (creamZone(x, y)) {
      a = clamp((warm - 2) / (14 - 2))
      if (a < 1) colour = CREAM
    } else {
      // A yellow edge pixel is yellow mixed with some neutral grey k. If k is
      // dark it's the black outline (keep it solid); if light, it's checker.
      const share = clamp(warm / (YELLOW[0] - YELLOW[2]))
      const k = share < 0.97 ? (b - YELLOW[2] * share) / (1 - share) : 0
      if (share >= 0.92 || k < 170) {
        a = 1
      } else {
        a = clamp((warm - 3) / (YELLOW[0] - YELLOW[2] - 3))
        colour = YELLOW
      }
    }
    out.data[i] = colour[0]
    out.data[i + 1] = colour[1]
    out.data[i + 2] = colour[2]
    out.data[i + 3] = Math.round(a * 255)
  }

// The cream letters sit so close to white that compression noise makes their
// edges ragged. They are clean geometric shapes, so: soften the opacity a
// little, then re-sharpen it into a crisp anti-aliased edge, in one even cream.
{
  const alpha = new Float32Array(W * H)
  for (let p = 0; p < W * H; p++) alpha[p] = out.data[p * 4 + 3] / 255
  const blur = (src) => {
    const dst = new Float32Array(W * H)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        let s = 0,
          n = 0
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx,
              yy = y + dy
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue
            s += src[yy * W + xx]
            n++
          }
        dst[y * W + x] = s / n
      }
    return dst
  }
  const soft = blur(blur(alpha))
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!creamZone(x, y)) continue
      const p = y * W + x
      const a = clamp((soft[p] - 0.32) / 0.36)
      out.data[p * 4] = CREAM[0]
      out.data[p * 4 + 1] = CREAM[1]
      out.data[p * 4 + 2] = CREAM[2]
      out.data[p * 4 + 3] = Math.round(a * 255)
    }
}

// Trim to the visible logo (with a small margin) so it lines up with layout.
let minX = W,
  minY = H,
  maxX = 0,
  maxY = 0
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++)
    if (out.data[(y * W + x) * 4 + 3] > 40) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
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

let transparent = 0,
  partial = 0
for (let i = 3; i < cropped.data.length; i += 4) {
  if (cropped.data[i] === 0) transparent++
  else if (cropped.data[i] < 255) partial++
}
console.log(`yellow starts at row ${yellowTop}; logo ${cw}×${ch}; transparent ${Math.round((100 * transparent) / (cw * ch))}%, soft edges ${Math.round((100 * partial) / (cw * ch))}%`)
