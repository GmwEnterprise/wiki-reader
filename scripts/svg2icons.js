/**
 * SVG → 各尺寸 PNG / ICO / ICNS 图标转换脚本
 *
 * 用法: node scripts/svg2icons.js
 *
 * 依赖: npx sharp-cli（自动通过 npx 调用，无需全局安装）
 *
 * 输出:
 *   resources/icon.png        — 256×256，Electron 窗口图标
 *   build/icon.png            — 512×512，electron-builder 源图
 *   build/icon.ico            — Windows 多尺寸 ICO（16/24/32/48/64/128/256）
 *   build/icon.icns           — macOS 图标（仅当安装 png2icns 后可用）
 */

const { execSync } = require('child_process')
const { join, resolve } = require('path')
const fs = require('fs')
const { mkdirSync, existsSync, readFileSync, writeFileSync } = fs

const ROOT = resolve(__dirname, '..')
const SVG_PATH = join(ROOT, 'resources', 'icon.svg')
const RESOURCES_DIR = join(ROOT, 'resources')
const BUILD_DIR = join(ROOT, 'build')
const TMP_DIR = join(ROOT, '.tmp', 'icons')

if (!existsSync(SVG_PATH)) {
  console.error('SVG 源文件不存在:', SVG_PATH)
  process.exit(1)
}

mkdirSync(TMP_DIR, { recursive: true })
mkdirSync(BUILD_DIR, { recursive: true })

function sharpConvert(input, output, width, height) {
  const cmd = `npx sharp-cli -i "${input}" -o "${output}" -- resize ${width} ${height}`
  console.log(`  → ${width}×${height} → ${output}`)
  execSync(cmd, { stdio: 'pipe' })
}

function sharpConvertToBuffer(input, width, height) {
  const tmpFile = join(TMP_DIR, `icon_${width}x${height}.png`)
  sharpConvert(input, tmpFile, width, height)
  return readFileSync(tmpFile)
}

// ─── PNG 输出 ───

console.log('\n[1/3] 生成 PNG 图标...')

// resources/icon.png — 256×256 窗口图标
sharpConvert(SVG_PATH, join(RESOURCES_DIR, 'icon.png'), 256, 256)

// build/icon.png — 512×512 构建源图
sharpConvert(SVG_PATH, join(BUILD_DIR, 'icon.png'), 512, 512)

// ─── ICO 输出（Windows） ───

console.log('\n[2/3] 生成 ICO 图标 (Windows)...')

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
const icoPngs = []

for (const size of ICO_SIZES) {
  const buf = sharpConvertToBuffer(SVG_PATH, size, size)
  icoPngs.push({ size, buf })
}

// 手动构建 ICO 文件（PNG 嵌入式，兼容 Vista+）
const icoBuf = buildIco(icoPngs)
const icoPath = join(BUILD_DIR, 'icon.ico')
writeFileSync(icoPath, icoBuf)
console.log(`  → 写入 ${icoPath} (${icoBuf.length} bytes)`)

// ─── ICNS 输出（macOS，可选） ───

console.log('\n[3/3] 生成 ICNS 图标 (macOS)...')

try {
  const icnsBuf = buildIcns()
  const icnsPath = join(BUILD_DIR, 'icon.icns')
  writeFileSync(icnsPath, icnsBuf)
  console.log(`  → 写入 ${icnsPath} (${icnsBuf.length} bytes)`)
} catch (e) {
  console.log('  → ICNS 生成跳过（非必需，Windows 构建不需要）')
}

// ─── 清理临时文件 ───

fs.rmSync(TMP_DIR, { recursive: true, force: true })

console.log('\n✓ 图标生成完毕')

// ═══════════════════════════════════════════════════════
// ICO 构建：PNG 嵌入式格式
// ═══════════════════════════════════════════════════════

function buildIco(entries) {
  // ICO header: 6 bytes
  // 每个目录条目: 16 bytes
  // 然后是各 PNG 数据
  const numImages = entries.length
  const headerSize = 6
  const dirSize = 16 * numImages
  let dataOffset = headerSize + dirSize

  const dirEntries = []
  const pngDataBuffers = []

  for (const { size, buf } of entries) {
    const w = size >= 256 ? 0 : size
    const h = size >= 256 ? 0 : size

    // 目录条目
    const dir = Buffer.alloc(16)
    dir.writeUInt8(w, 0)
    dir.writeUInt8(h, 1)
    dir.writeUInt8(0, 2)       // color palette
    dir.writeUInt8(0, 3)       // reserved
    dir.writeUInt16LE(1, 4)    // color planes
    dir.writeUInt16LE(32, 6)   // bits per pixel
    dir.writeUInt32LE(buf.length, 8)  // image size
    dir.writeUInt32LE(dataOffset, 12) // image offset
    dirEntries.push(dir)
    pngDataBuffers.push(buf)
    dataOffset += buf.length
  }

  // ICO header
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)   // reserved
  header.writeUInt16LE(1, 2)   // type: ICO
  header.writeUInt16LE(numImages, 4)

  return Buffer.concat([header, ...dirEntries, ...pngDataBuffers])
}

// ═══════════════════════════════════════════════════════
// ICNS 构建（macOS）
// ═══════════════════════════════════════════════════════

function buildIcns() {
  // ICNS 需要特定尺寸的图标，用 'icp4'/'icp5'/'ic07' 等类型
  // 最简方案：用 iconset 目录 + iconutil（仅 macOS），或手动构建
  // 这里手动构建 ICNS 二进制格式
  const icnsSpec = [
    { type: 'icp4', size: 16 },
    { type: 'icp5', size: 32 },
    { type: 'ic07', size: 128 },
    { type: 'ic08', size: 256 },
    { type: 'ic09', size: 512 },
  ]

  const chunks = []
  // 对于 @2x 图标，实际尺寸是 spec 的 2 倍
  const is2x = { ic11: true, ic12: true, ic13: true, ic14: true }

  for (const { type, size } of icnsSpec) {
    const actualSize = is2x[type] ? size * 2 : size
    const buf = sharpConvertToBuffer(SVG_PATH, actualSize, actualSize)
    // 每个 ICNS 条目: 4字节 type + 4字节 length (含 header) + data
    const header = Buffer.alloc(8)
    header.write(type, 0, 4, 'ascii')
    header.writeUInt32BE(buf.length + 8, 4)
    chunks.push(Buffer.concat([header, buf]))
  }

  const allData = Buffer.concat(chunks)
  const icnsHeader = Buffer.alloc(8)
  icnsHeader.write('icns', 0, 4, 'ascii')
  icnsHeader.writeUInt32BE(allData.length + 8, 4)

  return Buffer.concat([icnsHeader, allData])
}
