// fix-batch-3.mjs
//
// Only the 3 SAFE fixes from the current error list — pure type-level
// fixes where seeing the whole file adds no risk. The other 6 errors are
// deliberately NOT included here; see the explanation in chat for why.
//
// USAGE: node fix-batch-3.mjs   (run from project root)

import { readFileSync, writeFileSync } from "fs";

const FIXES = [
  // ErrorBoundary.tsx: errorInfo is a required part of React's
  // componentDidCatch signature even when unused — just mark it ignored.
  { file: "src/components/ErrorBoundary.tsx",
    old: `componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {`,
    new: `componentDidCatch(error: Error, _errorInfo: React.ErrorInfo): void {` },

  // useAppLogic.ts: the interface declared a non-nullable ref type, but
  // useRef<HTMLInputElement>(null) is genuinely nullable — widen the type
  // to match reality instead of lying about it.
  { file: "src/useAppLogic.ts",
    old: `fileInputRef: React.RefObject<HTMLInputElement>;`,
    new: `fileInputRef: React.RefObject<HTMLInputElement | null>;` },

  // LiveStream.tsx: guard against a null ref before calling clearInterval.
  { file: "src/pages/LiveStream.tsx",
    old: `clearInterval(pollRef.current);`,
    new: `if (pollRef.current) clearInterval(pollRef.current);` },
];

let fixed = 0, skipped = 0;

for (const { file, old, new: replacement } of FIXES) {
  try {
    const content = readFileSync(file, "utf8");
    if (!content.includes(old)) {
      console.log(`⚠️  SKIPPED (line not found, check manually): ${file}`);
      skipped++;
      continue;
    }
    const updated = content.replace(old, replacement);
    writeFileSync(file, updated, "utf8");
    console.log(`✅ Fixed: ${file}`);
    fixed++;
  } catch (err) {
    console.log(`⚠️  SKIPPED (couldn't read file): ${file} — ${err.message}`);
    skipped++;
  }
}

console.log(`\n${fixed} fixed, ${skipped} skipped.`);
console.log(`Run "npx tsc --noEmit" again — 6 errors will remain (see chat for why).`);
