export interface PullRequestFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch: string | null;
}

export interface ReviewChunkFile extends PullRequestFile {
  patch: string;
  part?: number;
  totalParts?: number;
}

export interface ReviewChunk {
  files: ReviewChunkFile[];
  characterCount: number;
}

const SKIPPED_FILE_NAMES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'npm-shrinkwrap.json',
]);

const SKIPPED_EXTENSIONS = new Set([
  '.bmp', '.eot', '.gif', '.ico', '.jpeg', '.jpg', '.lock', '.min.css',
  '.min.js', '.otf', '.pdf', '.png', '.snap', '.svg', '.tiff', '.ttf',
  '.webp', '.woff', '.woff2', '.zip',
]);

const SKIPPED_DIRECTORIES = new Set([
  'build', 'coverage', 'dist', 'generated', 'vendor',
]);

export function isReviewableFile(filename: string): boolean {
  const normalized = filename.replace(/\\/g, '/').toLowerCase();
  const basename = normalized.split('/').pop() ?? normalized;

  if (SKIPPED_FILE_NAMES.has(basename)) return false;
  if (normalized.split('/').some((part) => SKIPPED_DIRECTORIES.has(part))) {
    return false;
  }

  return ![...SKIPPED_EXTENSIONS].some((extension) =>
    basename.endsWith(extension),
  );
}

export function prepareReviewFiles(
  files: readonly PullRequestFile[],
  maxPatchChars: number,
): ReviewChunkFile[] {
  return files.flatMap((file) => {
    if (!isReviewableFile(file.filename) || !file.patch?.trim()) return [];

    const parts = splitPatch(file.patch, maxPatchChars);
    return parts.map((patch, index) => ({
      ...file,
      patch,
      ...(parts.length > 1
        ? { part: index + 1, totalParts: parts.length }
        : {}),
    }));
  });
}

export function createReviewChunks(
  files: readonly ReviewChunkFile[],
  maxChunkChars: number,
): ReviewChunk[] {
  const safeChunkLimit = Math.max(1, maxChunkChars);
  const boundedFiles = files.flatMap((file) => {
    if (formattedFileLength(file) <= safeChunkLimit) return [file];
    const patchLimit = Math.max(1, safeChunkLimit - file.filename.length - 64);
    const parts = splitPatch(file.patch, patchLimit);
    return parts.map((patch, index) => ({
      ...file,
      patch,
      part: index + 1,
      totalParts: parts.length,
    }));
  });
  const chunks: ReviewChunk[] = [];
  let current: ReviewChunkFile[] = [];
  let characterCount = 0;

  for (const file of boundedFiles) {
    const size = formattedFileLength(file);
    if (current.length > 0 && characterCount + size > safeChunkLimit) {
      chunks.push({ files: current, characterCount });
      current = [];
      characterCount = 0;
    }
    current.push(file);
    characterCount += size;
  }

  if (current.length > 0) chunks.push({ files: current, characterCount });
  return chunks;
}

export function formatChunk(chunk: ReviewChunk): string {
  return chunk.files
    .map((file) => {
      const part = file.part ? ` (part ${file.part}/${file.totalParts})` : '';
      return `FILE: ${file.filename}${part}\nSTATUS: ${file.status}\n\nPATCH:\n${file.patch}`;
    })
    .join('\n-----------------------------\n');
}

function splitPatch(patch: string, maxChars: number): string[] {
  const safeLimit = Math.max(1, maxChars);
  if (patch.length <= safeLimit) return [patch];

  const parts: string[] = [];
  let offset = 0;
  while (offset < patch.length) {
    let end = Math.min(offset + safeLimit, patch.length);
    if (end < patch.length) {
      const newline = patch.lastIndexOf('\n', end);
      if (newline > offset) end = newline + 1;
    }
    parts.push(patch.slice(offset, end));
    offset = end;
  }
  return parts;
}

function formattedFileLength(file: ReviewChunkFile): number {
  return file.patch.length + file.filename.length + 64;
}
