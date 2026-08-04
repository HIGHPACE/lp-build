// sharp が prebuilt バイナリで動き、webp を出力できることの確認。
// 一時ディレクトリで完結し、リポジトリには何も書かない。
// node --test の対象外（package.json の test は test/*.test.js のみ）。
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const sharp = require('sharp');

// 8x8 の PNG を生成する（外部素材に依存しない）
const W = 8, H = 8;
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) {
  raw[y * (W * 3 + 1)] = 0;
  for (let x = 0; x < W; x++) {
    const o = y * (W * 3 + 1) + 1 + x * 3;
    raw[o] = x * 30; raw[o + 1] = y * 30; raw[o + 2] = 128;
  }
}
const crcT = [...Array(256)].map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (b) => {
  let c = 0xffffffff;
  for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (t, d) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(d.length);
  const td = Buffer.concat([Buffer.from(t), d]);
  const cr = Buffer.alloc(4); cr.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, cr]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0))
]);

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'webp-smoke-'));
  const src = path.join(dir, 'in.png');
  const out = path.join(dir, 'out.webp');
  fs.writeFileSync(src, png);
  await sharp(src).webp({ quality: 80 }).toFile(out);
  const head = fs.readFileSync(out).subarray(0, 12);
  const isWebp =
    head.subarray(0, 4).toString() === 'RIFF' && head.subarray(8, 12).toString() === 'WEBP';
  // sharp の exports は './package.json' を公開していないため fs で読む
  const sharpPkg = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'node_modules', 'sharp', 'package.json'), 'utf8')
  );
  console.log('sharp version:', sharpPkg.version);
  console.log('出力:', fs.statSync(out).size, 'bytes / WEBPシグネチャ:', isWebp ? 'OK' : 'NG');
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(isWebp ? 0 : 1);
})();
