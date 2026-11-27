// Minimal zip reader for files too large to load whole: reads the central directory, then streams one entry.
// Used by the Garmin and Apple Health importers. Nothing is uploaded.
// ---------- minimal zip reader: central directory + stored/deflate entries ----------
const u16 = (b, o) => b[o] | b[o + 1] << 8;
const u32 = (b, o) => (b[o] | b[o + 1] << 8 | b[o + 2] << 16 | b[o + 3] << 24) >>> 0;

/** Returns {name: text} for every entry whose name matches `want`. `blob` is a File/Blob. */
export async function readZip(blob, want) {
  const tailLen = Math.min(blob.size, 65557);
  const tail = new Uint8Array(await blob.slice(blob.size - tailLen).arrayBuffer());
  let e = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (u32(tail, i) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('not a zip file');
  const count = u16(tail, e + 10), cdSize = u32(tail, e + 12), cdOff = u32(tail, e + 16);
  if (cdOff === 0xffffffff || count === 0xffff) throw new Error('zip64 archives are not supported; unzip it and zip the DI_CONNECT folder only');
  const cd = new Uint8Array(await blob.slice(cdOff, cdOff + cdSize).arrayBuffer());
  const out = {}; const dec = new TextDecoder();
  for (let p = 0, n = 0; n < count && u32(cd, p) === 0x02014b50; n++) {
    const method = u16(cd, p + 10), csize = u32(cd, p + 20), nlen = u16(cd, p + 28), xlen = u16(cd, p + 30), clen = u16(cd, p + 32), loff = u32(cd, p + 42);
    const name = dec.decode(cd.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    if (!want.test(name)) continue;
    const lh = new Uint8Array(await blob.slice(loff, loff + 30).arrayBuffer());
    const start = loff + 30 + u16(lh, 26) + u16(lh, 28);
    const data = blob.slice(start, start + csize);
    if (method === 0) out[name] = await data.text();
    else if (method === 8) out[name] = await new Response(data.stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
  }
  return out;
}


/** Entries whose name matches `want`: [{name, method, csize, start}], without reading their data. */
export async function findEntries(blob, want) {
  const tailLen = Math.min(blob.size, 65557);
  const tail = new Uint8Array(await blob.slice(blob.size - tailLen).arrayBuffer());
  let e = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (u32(tail, i) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('not a zip file');
  const count = u16(tail, e + 10), cdSize = u32(tail, e + 12), cdOff = u32(tail, e + 16);
  if (cdOff === 0xffffffff || count === 0xffff) throw new Error('zip64 archives are not supported; unzip it and use export.xml directly');
  const cd = new Uint8Array(await blob.slice(cdOff, cdOff + cdSize).arrayBuffer());
  const out = []; const dec = new TextDecoder();
  for (let p = 0, n = 0; n < count && u32(cd, p) === 0x02014b50; n++) {
    const method = u16(cd, p + 10), csize = u32(cd, p + 20), nlen = u16(cd, p + 28), xlen = u16(cd, p + 30), clen = u16(cd, p + 32), loff = u32(cd, p + 42);
    const name = dec.decode(cd.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    if (!want.test(name)) continue;
    if (csize === 0xffffffff || loff === 0xffffffff) throw new Error('entry is larger than 4 GB (zip64): unzip the export and import export.xml instead');
    const lh = new Uint8Array(await blob.slice(loff, loff + 30).arrayBuffer());
    out.push({ name, method, csize, start: loff + 30 + u16(lh, 26) + u16(lh, 28) });
  }
  return out;
}

/** A ReadableStream of the entry's uncompressed bytes. */
export function openEntry(blob, entry) {
  const data = blob.slice(entry.start, entry.start + entry.csize).stream();
  if (entry.method === 0) return data;
  if (entry.method === 8) return data.pipeThrough(new DecompressionStream('deflate-raw'));
  throw new Error('unsupported zip compression method ' + entry.method);
}
