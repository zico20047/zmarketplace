import { extractTextFilesFromTar } from "../../src/core/audit.ts";

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}`); }
}

const enc = new TextEncoder();

/** Build a 512-byte tar header (checksum left blank — our parser does not validate it). */
function header(name: string, size: number, typeFlag = "0"): Uint8Array {
  const h = new Uint8Array(512);
  enc.encodeInto(name, h.subarray(0, Math.min(name.length, 99)));
  // size at offset 124: 11 octal digits + NUL
  const sizeStr = size.toString(8).padStart(11, "0") + "\0";
  enc.encodeInto(sizeStr, h.subarray(124, 136));
  h[156] = typeFlag.charCodeAt(0);
  return h;
}

/** Pad file data up to a 512-byte boundary. */
function pad512(data: Uint8Array): Uint8Array {
  const rem = data.length % 512;
  if (rem === 0) return data;
  const padded = new Uint8Array(data.length + (512 - rem));
  padded.set(data);
  return padded;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

const END = new Uint8Array(1024); // two zero blocks = end-of-archive

console.log("━━━ TEST: regular file extraction ━━━");
{
  const content = "const x = 1;";
  const data = enc.encode(content);
  const tar = concat(header("src/foo.ts", data.length, "0"), pad512(data), END);
  const files = extractTextFilesFromTar(tar);
  ok("one file extracted", files.length === 1);
  ok("name correct", files[0]?.name === "src/foo.ts");
  ok("content correct", files[0]?.content === content);
}

console.log("\n━━━ TEST: POSIX space (0x20) type flag ━━━");
{
  const content = "export default 2;";
  const data = enc.encode(content);
  const tar = concat(header("bar.ts", data.length, " "), pad512(data), END);
  const files = extractTextFilesFromTar(tar);
  ok("space-type-flag file extracted", files.length === 1 && files[0]?.name === "bar.ts");
  ok("space-type-flag content correct", files[0]?.content === content);
}

console.log("\n━━━ TEST: GNU long filename (type flag 'L') ━━━");
{
  const longPath = "very/deep/nested/path/".repeat(20) + "module.ts"; // >100 chars
  const longBytes = enc.encode(longPath + "\0");
  // L entry: payload is the real filename
  const lh = header("././@LongLink", longBytes.length, "L");
  // following regular file entry: name field is ignored, overridden by longName
  const content = "export const g = 3;";
  const fc = enc.encode(content);
  const fh = header("truncat", fc.length, "0");
  const tar = concat(lh, pad512(longBytes), fh, pad512(fc), END);
  const files = extractTextFilesFromTar(tar);
  ok("long-name file extracted", files.length === 1);
  ok("name is the GNU long path", files[0]?.name === longPath);
  ok("long-name content correct", files[0]?.content === content);
}

console.log("\n━━━ TEST: bounds safety on truncated tarball ━━━");
{
  // Header claims 1000 bytes of data, but only 50 bytes follow (no padding, no end marker).
  const h = header("big.ts", 1000, "0");
  const tar = concat(h, new Uint8Array(50));
  let threw = false;
  let files: Array<{ name: string; content: string }> = [];
  try { files = extractTextFilesFromTar(tar); } catch { threw = true; }
  ok("no throw on truncated data", threw === false);
  ok("safe-truncated content is 50 bytes", files.length === 1 && files[0]?.content.length === 50);
}

console.log("\n━━━ TEST: non-scanable file ignored ━━━");
{
  const data = enc.encode("binary-ish");
  const tar = concat(header("assets/logo.png", data.length, "0"), pad512(data), END);
  const files = extractTextFilesFromTar(tar);
  ok(".png file skipped (not scanable)", files.length === 0);
}

console.log(`\n━━━ RESULTS: ${pass} passed, ${fail} failed ━━━`);
if (fail > 0) process.exit(1);
