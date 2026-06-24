// Converts the black-on-light Luffy JPG into a transparent PNG with a WHITE
// silhouette, so it renders cleanly at low opacity on the dark (#080808) page
// with no background box. Alpha is derived from darkness of the source.
import sharp from 'sharp'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = process.argv[2]
const OUT = join(__dirname, '..', 'public', 'luffy.png')

const img = sharp(SRC).grayscale()
const { data, info } = await img.raw().toBuffer({ resolveWithObject: true })
const { width, height, channels } = info

// Build RGBA: white pixels, alpha = how dark the source is (silhouette = opaque).
const rgba = Buffer.alloc(width * height * 4)
for (let i = 0; i < width * height; i++) {
  const lum = data[i * channels] // grayscale -> single channel luminance
  // Treat anything near-white as fully transparent; ramp alpha for the dark shape.
  let a = 255 - lum
  if (a < 18) a = 0 // kill faint light-grey background residue -> no box
  rgba[i * 4 + 0] = 255
  rgba[i * 4 + 1] = 255
  rgba[i * 4 + 2] = 255
  rgba[i * 4 + 3] = a
}

await sharp(rgba, { raw: { width, height, channels: 4 } })
  .png()
  .toFile(OUT)

console.log(`Wrote ${OUT} (${width}x${height})`)
