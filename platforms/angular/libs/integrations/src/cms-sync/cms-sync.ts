/**
 * CMS Sync — C# → TypeScript contract generator.
 *
 * Reads C# source files from Synergos.CMS and generates TypeScript interfaces
 * in `libs/core/src/contracts/generated/`.
 *
 * Usage:
 *   npx tsx libs/integrations/src/cms-sync/cms-sync.ts
 *   npx tsx libs/integrations/src/cms-sync/cms-sync.ts --dry-run
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseCSharpFile } from './csharp-parser.js';
import { emitFileHeader, emitInterface, emitBarrelExport } from './ts-emitter.js';
import { mapCSharpTypeToTs } from './type-mapper.js';

// ── Configuration ────────────────────────────────────────────────────────────

const WORKSPACE_ROOT = path.resolve(import.meta.dirname, '../../../../');

/** Path to the CMS project — sibling directory to the UI project */
const CMS_ROOT = path.resolve(WORKSPACE_ROOT, '../Synergos.CMS');

/** Output directory for generated contracts — vitals/contracts is the single source of truth */
const OUTPUT_DIR = path.resolve(WORKSPACE_ROOT, '../../vitals/contracts/src/generated');

/** Source directories to scan in the CMS project */
const SOURCE_DIRS: ReadonlyArray<{ dir: string; outputFile: string }> = [
  { dir: 'Domain/Shared', outputFile: 'shared.generated.ts' },
  { dir: 'Domain/Compositions/Content', outputFile: 'compositions-content.generated.ts' },
  { dir: 'Domain/Compositions/Dom', outputFile: 'compositions-dom.generated.ts' },
  { dir: 'Domain/Compositions/Behavior', outputFile: 'compositions-behavior.generated.ts' },
  { dir: 'Domain/Compositions/Seo', outputFile: 'compositions-seo.generated.ts' },
  { dir: 'Application/Elements', outputFile: 'elements.generated.ts' },
  { dir: 'Application/Output/Config', outputFile: 'page-config.generated.ts' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function findCsFiles(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) return [];

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...findCsFiles(fullPath));
    } else if (entry.name.endsWith('.cs')) {
      files.push(fullPath);
    }
  }

  return files;
}

function generateFileContent(csFiles: string[]): string {
  const parts: string[] = [emitFileHeader()];
  let interfaceCount = 0;

  for (const file of csFiles) {
    const source = fs.readFileSync(file, 'utf-8');
    const types = parseCSharpFile(source);

    for (const type of types) {
      if (type.properties.length === 0) continue;
      parts.push(emitInterface(type, mapCSharpTypeToTs));
      parts.push('');
      interfaceCount++;
    }
  }

  return { content: parts.join('\n') + '\n', count: interfaceCount } as unknown as string;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main(): void {
  const dryRun = process.argv.includes('--dry-run');

  // Validate CMS project exists
  if (!fs.existsSync(CMS_ROOT)) {
    console.error(`[cms-sync] CMS project not found at: ${CMS_ROOT}`);
    console.error('[cms-sync] Expected sibling directory: ../Synergos.CMS');
    process.exit(1);
  }

  console.log(`[cms-sync] CMS root: ${CMS_ROOT}`);
  console.log(`[cms-sync] Output:   ${OUTPUT_DIR}`);
  console.log(`[cms-sync] Mode:     ${dryRun ? 'DRY RUN' : 'GENERATE'}`);
  console.log('');

  // Ensure output directory exists
  if (!dryRun) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const generatedFiles: string[] = [];
  let totalInterfaces = 0;

  for (const { dir, outputFile } of SOURCE_DIRS) {
    const dirPath = path.join(CMS_ROOT, dir);
    const csFiles = findCsFiles(dirPath);

    if (csFiles.length === 0) {
      console.log(`[cms-sync] ⚠ No .cs files found in ${dir}`);
      continue;
    }

    // Parse and generate
    const parts: string[] = [emitFileHeader()];
    let count = 0;

    for (const file of csFiles) {
      const source = fs.readFileSync(file, 'utf-8');
      const types = parseCSharpFile(source);

      for (const type of types) {
        if (type.properties.length === 0) continue;
        parts.push(emitInterface(type, mapCSharpTypeToTs));
        parts.push('');
        count++;
      }
    }

    const content = parts.join('\n') + '\n';

    console.log(`[cms-sync] ${dir}: ${csFiles.length} files → ${count} interfaces → ${outputFile}`);

    if (!dryRun) {
      const outPath = path.join(OUTPUT_DIR, outputFile);
      fs.writeFileSync(outPath, content, 'utf-8');
    }

    if (count > 0) {
      generatedFiles.push(outputFile.replace('.ts', ''));
      totalInterfaces += count;
    }
  }

  // Generate barrel export
  if (generatedFiles.length > 0 && !dryRun) {
    const barrelContent = emitBarrelExport(generatedFiles);
    fs.writeFileSync(path.join(OUTPUT_DIR, 'index.ts'), barrelContent, 'utf-8');
    console.log('');
    console.log(`[cms-sync] Generated index.ts with ${generatedFiles.length} re-exports`);
  }

  console.log('');
  console.log(`[cms-sync] Done. ${totalInterfaces} interfaces generated.`);
}

main();
