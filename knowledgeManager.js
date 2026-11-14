import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const KNOWLEDGE_DIR = path.join(__dirname, 'knowledge');
export const CONFIG_PATH = path.join(KNOWLEDGE_DIR, 'config.json');
export const ALLOWED_EXTENSIONS = new Set(['.txt', '.pdf', '.docx']);

function ensureDir() {
  if (!fs.existsSync(KNOWLEDGE_DIR)) {
    fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true });
  }
}

function writeConfig(config) {
  ensureDir();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

function seedDefaults() {
  ensureDir();

  const rootServices = path.join(__dirname, 'services.txt');
  const knowledgeServices = path.join(KNOWLEDGE_DIR, 'services.txt');
  if (fs.existsSync(rootServices) && !fs.existsSync(knowledgeServices)) {
    fs.copyFileSync(rootServices, knowledgeServices);
  }

  if (!fs.existsSync(CONFIG_PATH)) {
    const activeFile = fs.existsSync(knowledgeServices) ? 'services.txt' : null;
    writeConfig({ activeFile });
  }
}

seedDefaults();

export function loadConfig() {
  seedDefaults();
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return { activeFile: null };
  }
}

export function listKnowledgeFiles() {
  ensureDir();
  return fs
    .readdirSync(KNOWLEDGE_DIR)
    .filter((name) => {
      if (name === 'config.json') return false;
      return ALLOWED_EXTENSIONS.has(path.extname(name).toLowerCase());
    })
    .sort();
}

export function getActiveFileName() {
  const { activeFile } = loadConfig();
  return activeFile || null;
}

export function setActiveFile(filename) {
  ensureDir();
  const safe = path.basename(filename);
  const fullPath = path.join(KNOWLEDGE_DIR, safe);
  if (!ALLOWED_EXTENSIONS.has(path.extname(safe).toLowerCase())) {
    throw new Error(`Unsupported file type. Allowed: ${[...ALLOWED_EXTENSIONS].join(', ')}`);
  }
  if (!fs.existsSync(fullPath)) {
    throw new Error(`File not found in knowledge/: ${safe}`);
  }
  writeConfig({ activeFile: safe });
  return safe;
}

function sanitizeFilename(name) {
  return path
    .basename(name || 'document.txt')
    .replace(/[^\w.\-()+\s]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120);
}

export async function extractTextFromBuffer(originalName, buffer) {
  const ext = path.extname(originalName || '').toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(`Unsupported upload type "${ext}". Allowed: .txt .pdf .docx`);
  }
  if (!buffer?.length) {
    throw new Error('Uploaded file is empty');
  }

  let text = '';
  if (ext === '.txt') {
    text = buffer.toString('utf8').trim();
  } else if (ext === '.pdf') {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      text = (result?.text || '').trim();
    } finally {
      await parser.destroy?.();
    }
  } else if (ext === '.docx') {
    const result = await mammoth.extractRawText({ buffer });
    text = (result?.value || '').trim();
  }

  if (!text) {
    throw new Error('Could not extract text from that file. Try a .txt, .pdf, or .docx.');
  }
  return text;
}

export function tenantKnowledgeDir(tenantId) {
  const dir = path.join(KNOWLEDGE_DIR, 'tenants', String(tenantId || 'unknown'));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export async function saveTenantKnowledgeFile(tenantId, originalName, buffer) {
  const text = await extractTextFromBuffer(originalName, buffer);
  const dir = tenantKnowledgeDir(tenantId);
  const ext = path.extname(originalName || '').toLowerCase() || '.txt';
  const safe = sanitizeFilename(originalName);
  const filename = `${Date.now()}_${safe.endsWith(ext) ? safe : `${safe}${ext}`}`;
  const outPath = path.join(dir, filename);
  fs.writeFileSync(outPath, buffer);
  const relativePath = path.relative(path.join(__dirname), outPath).replace(/\\/g, '/');
  return { text, path: relativePath, filename };
}

export async function saveUploadedBuffer(originalName, buffer, { makeActive = false } = {}) {
  ensureDir();
  const safe = sanitizeFilename(originalName);
  const ext = path.extname(safe).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(`Unsupported upload type "${ext}". Allowed: .txt .pdf .docx`);
  }
  if (!buffer?.length) {
    throw new Error('Uploaded file is empty');
  }

  let finalName = safe;
  if (fs.existsSync(path.join(KNOWLEDGE_DIR, finalName))) {
    const stem = path.basename(finalName, ext);
    finalName = `${stem}_${Date.now()}${ext}`;
  }

  const outPath = path.join(KNOWLEDGE_DIR, finalName);
  fs.writeFileSync(outPath, buffer);

  if (makeActive) {
    setActiveFile(finalName);
  }

  return { filename: finalName, path: outPath, active: getActiveFileName() === finalName };
}

async function extractPdfText(filePath) {
  const data = new Uint8Array(fs.readFileSync(filePath));
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText();
    return (result?.text || '').trim();
  } finally {
    await parser.destroy?.();
  }
}

async function extractDocxText(filePath) {
  const result = await mammoth.extractRawText({ path: filePath });
  return (result?.value || '').trim();
}

export async function readKnowledgeFile(filename) {
  ensureDir();
  const safe = path.basename(filename);
  const fullPath = path.join(KNOWLEDGE_DIR, safe);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Knowledge file missing: ${safe}`);
  }

  const ext = path.extname(safe).toLowerCase();
  let text = '';

  if (ext === '.txt') {
    text = fs.readFileSync(fullPath, 'utf8').trim();
  } else if (ext === '.pdf') {
    text = await extractPdfText(fullPath);
  } else if (ext === '.docx') {
    text = await extractDocxText(fullPath);
  } else {
    throw new Error(`Unsupported knowledge file type: ${ext}`);
  }

  if (!text) {
    throw new Error(`Knowledge file is empty or unreadable: ${safe}`);
  }

  return { filename: safe, text };
}

export async function loadActiveKnowledgeBase() {
  const active = getActiveFileName();
  if (!active) {
    return {
      filename: null,
      text: '',
      error: 'No active knowledge file selected. Use !kb use <filename> or POST /knowledge/select.',
    };
  }

  try {
    const { filename, text } = await readKnowledgeFile(active);
    return { filename, text, error: null };
  } catch (err) {
    return { filename: active, text: '', error: err.message };
  }
}
