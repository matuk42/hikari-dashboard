// The source Luffy file already has a transparent background but a BLACK
// silhouette, which is invisible on the dark (#080808) page. This keeps the
// existing alpha (the shape) and recolors the silhouette to WHITE so it shows
// cleanly at low opacity, with no background box.
import sharp from 'sharp'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = process.argv[2]
const OUT = join(__dirname, '..', 'public', 'luffy.png')

const { data, info } = await sharp(SRC)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true })
const { width, height } = info // channels === 4 after ensureAlpha

const out = Buffer.alloc(width * height * 4)
for (let i = 0; i < width * height; i++) {
  const a = data[i * 4 + 3] // preserve original shape
  out[i * 4 + 0] = 255
  out[i * 4 + 1] = 255
  out[i * 4 + 2] = 255
  out[i * 4 + 3] = a
}

await sharp(out, { raw: { width, height, channels: 4 } })
  .png()
  .toFile(OUT)

console.log(`Wrote ${OUT} (${width}x${height})`)
