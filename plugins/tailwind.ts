import { exists } from "jsr:@std/fs";
import { join } from "jsr:@std/path";
import { crypto } from "jsr:@std/crypto";
import { encodeHex } from "jsr:@std/encoding/hex";
import { x } from "jsr:@effection-contrib/tinyexec";
import { call, Operation } from "effection";

export interface TailwindOptions {
  readonly input: string;
  readonly outdir: string;
}

export function* useTailwind(options: TailwindOptions): Operation<string> {
  let { input, outdir } = options;
  let outpath = join(outdir, input);
  let proc = yield* x("deno", [
    "run",
    "-A",
    "npm:@tailwindcss/cli@^4.0.0",
    "--input",
    input,
    "--output",
    outpath,
  ]);
  let result = yield* proc;
  if (result.stderr) {
    console.log(result.stderr);
  }
  if (result.stdout) {
    console.log(result.stdout);
  }

  if (yield* call(() => exists(outpath))) {
    let content = yield* call(() => Deno.readFile(outpath));
    const buffer = yield* call(() => crypto.subtle.digest("SHA-256", content));
    const hash = encodeHex(buffer);
    return `${outpath}?${hash}`;
  }
  throw new Error(`failed to generate ${outpath}`);
}
