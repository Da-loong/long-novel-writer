import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, extname, join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const skill = join(root, 'skill', 'long-novel-writer');
const failures = [];
const warnings = [];

function fail(code, file, detail) { failures.push({ code, file: relative(root, file), detail }); }
function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const target = join(dir, entry.name);
    if (entry.isDirectory()) walk(target, files);
    else files.push(target);
  }
  return files;
}

const skillMd = join(skill, 'SKILL.md');
if (!existsSync(skillMd)) fail('missing_skill', skillMd, 'SKILL.md is required');
else {
  const text = readFileSync(skillMd, 'utf8').replace(/^\uFEFF/, '');
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) fail('frontmatter', skillMd, 'YAML frontmatter is missing or malformed');
  else {
    const keys = [...match[1].matchAll(/^([A-Za-z][\w-]*):/gm)].map((m) => m[1]);
    const required = ['name', 'description'];
    if (JSON.stringify(keys.sort()) !== JSON.stringify(required.sort())) fail('frontmatter_keys', skillMd, `expected only name and description, got ${keys.join(', ')}`);
    const name = match[1].match(/^name:\s*(.+)$/m)?.[1]?.trim();
    const description = match[1].match(/^description:\s*(.+)$/m)?.[1]?.trim();
    if (name !== basename(skill)) fail('skill_name', skillMd, `name must equal folder name: ${basename(skill)}`);
    if (!description || description.length < 40) fail('description', skillMd, 'description must state capability and triggers');
  }
  const lines = text.split(/\r?\n/).length;
  if (lines > 500) fail('skill_length', skillMd, `${lines} lines exceeds 500-line limit`);
}

const allFiles = walk(skill);
for (const file of allFiles.filter((file) => ['.md', '.json', '.yaml', '.yml', '.js'].includes(extname(file).toLowerCase()))) {
  const text = readFileSync(file, 'utf8');
  if (text.includes('\uFFFD')) fail('replacement_character', file, 'contains Unicode replacement character');
  if (/\?{3,}/.test(text)) fail('question_mark_damage', file, 'contains a suspicious run of question marks');
}

const agentFile = join(skill, 'agents', 'openai.yaml');
if (!existsSync(agentFile)) fail('missing_agent_metadata', agentFile, 'agents/openai.yaml is required');
else {
  const yaml = readFileSync(agentFile, 'utf8');
  for (const field of ['display_name:', 'short_description:', 'default_prompt:']) {
    if (!yaml.includes(field)) fail('agent_metadata', agentFile, `missing ${field}`);
  }
  for (const match of yaml.matchAll(/(?:icon_small|icon_large):\s*["']?([^"'\r\n]+)/g)) {
    const icon = match[1].trim();
    if (!existsSync(join(skill, icon))) fail('missing_icon', agentFile, icon);
  }
}

const cards = allFiles.filter((file) => file.includes(`${join('references', 'writing', 'genre-prose-cards')}`) && extname(file) === '.md');
if (cards.length < 32) fail('genre_cards', join(skill, 'references', 'writing', 'genre-prose-cards'), `expected at least 32 cards, got ${cards.length}`);
const cardHeadings = ['读者契约', '长篇循环', '黄金三章', '场景执行', '升级刻度', '反重复变体', '状态台账', '失误预警', '交付检查'];
for (const card of cards) {
  const text = readFileSync(card, 'utf8');
  const chinese = (text.match(/[\u3400-\u9fff]/g) || []).length;
  if (chinese < 500) fail('shallow_genre_card', card, `expected at least 500 Chinese characters, got ${chinese}`);
  for (const heading of cardHeadings) if (!text.includes(`## ${heading}`)) fail('genre_card_section', card, `missing ## ${heading}`);
}
function ngrams(text, size = 8) {
  const value = text.replace(/\s+/g, '');
  return new Set(Array.from({ length: Math.max(0, value.length - size + 1) }, (_, index) => value.slice(index, index + size)));
}
for (let i = 0; i < cards.length; i++) {
  const left = ngrams(readFileSync(cards[i], 'utf8'));
  for (let j = i + 1; j < cards.length; j++) {
    const right = ngrams(readFileSync(cards[j], 'utf8'));
    const overlap = [...left].filter((value) => right.has(value)).length;
    const similarity = overlap / (left.size + right.size - overlap || 1);
    if (similarity > 0.65) fail('genre_card_duplication', cards[j], `${basename(cards[i])} similarity ${similarity.toFixed(3)}`);
  }
}

for (const match of readFileSync(skillMd, 'utf8').matchAll(/`((?:references|scripts|assets)\/[^`*]+)`/g)) {
  const target = join(skill, ...match[1].split('/'));
  if (!existsSync(target)) fail('broken_navigation', skillMd, match[1]);
}

const report = { ok: failures.length === 0, files: allFiles.length, genreCards: cards.length, failures, warnings };
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) process.exitCode = 1;
