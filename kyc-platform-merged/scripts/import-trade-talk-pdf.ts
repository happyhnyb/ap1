import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Pool, type PoolClient } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
const MEDIA_STORAGE_PATH = process.env.MEDIA_STORAGE_PATH;
const PDF_PATH = process.argv[2];
const AUTHOR_EMAIL = process.env.IMPORT_AUTHOR_EMAIL?.trim().toLowerCase() || 'dhairya@hnyb.in';
const CATEGORY_FALLBACK = 'Trade';

if (!DATABASE_URL) {
  console.error('DATABASE_URL is not configured.');
  process.exit(1);
}

if (!MEDIA_STORAGE_PATH) {
  console.error('MEDIA_STORAGE_PATH is not configured.');
  process.exit(1);
}

if (!PDF_PATH) {
  console.error('Usage: tsx --env-file=.env.local scripts/import-trade-talk-pdf.ts /absolute/path/to/file.pdf');
  process.exit(1);
}

const mediaStoragePath = MEDIA_STORAGE_PATH;

type ParsedArticle = {
  index: number;
  title: string;
  excerpt: string;
  body: string;
  tags: string[];
  category: string;
  heroImageFileName: string;
  heroImageMimeType: string;
  heroImagePublicUrl: string;
  publishedAt: string;
  sourceUrl: string | null;
  sourceMetadata: Record<string, unknown>;
};

const pool = new Pool({ connectionString: DATABASE_URL, ssl: false });

const TAG_DICTIONARY = [
  'wheat', 'sugar', 'rice', 'corn', 'maize', 'soybean', 'soybeans', 'cotton', 'oil', 'crude',
  'ethanol', 'silver', 'gold', 'trade', 'exports', 'tariff', 'yuan', 'china', 'canada', 'europe',
  'eu', 'pakistan', 'india', 'usd', 'inr', 'grain', 'fertilizer', 'phosphate', 'sulfur', 'energy',
  'food', 'agriculture', 'commodity', 'markets', 'rupee', 'dollar', 'inflation', 'import', 'export',
  'pulses', 'canola', 'peas', 'lentils', 'chana', 'tur', 'urad', 'msp', 'forex', 'currency', 'rbi',
  'opec', 'ukraine', 'russia', 'monsoon', 'phosphates',
];

function createId(prefix: string) {
  return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
}

function generateSlug(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

function isEmojiOnly(line: string) {
  return /^[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\s]+$/u.test(line);
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function stripDecorators(value: string) {
  return value
    .replace(/^[_*`~\s]+|[_*`~\s]+$/g, '')
    .replace(/^[^\p{L}\p{N}"']+/u, '')
    .trim();
}

function cleanTitle(raw: string) {
  return normalizeWhitespace(
    raw
      .replace(/\f/g, '\n')
      .replace(/^\d+\.\s*/, '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !/^\d+$/.test(line) && !isEmojiOnly(line))
      .join(' ')
  );
}

function isImageFileName(value: string) {
  return /^IMG-.*\.(jpg|jpeg|png|webp)$/i.test(value.trim());
}

function lineShouldStartNewParagraph(line: string) {
  return (
    /^https?:\/\//i.test(line) ||
    /^[0-9]+[.)]\s+/.test(line) ||
    /^[A-Z][A-Za-z0-9 '&/(),+-]{2,90}:$/.test(line) ||
    /^(?:The Bottom Line|The Road Ahead|The Trade|Conclusion|Strategic Diversification|Agricultural Resurgence and Canola Diplomacy|The Electric Vehicle Compromise|The Supply Deluge|The Disconnect|Actionable Market Intelligence)$/i.test(line)
  );
}

function cleanParagraph(paragraph: string) {
  const normalized = normalizeWhitespace(paragraph)
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')');

  if (/^[A-Z][A-Za-z0-9 '&/(),+-]{2,90}:$/.test(normalized)) {
    return `## ${normalized.slice(0, -1)}`;
  }

  if (/^(?:The Bottom Line|The Road Ahead|The Trade|Conclusion|Strategic Diversification|Agricultural Resurgence and Canola Diplomacy|The Electric Vehicle Compromise|The Supply Deluge|The Disconnect|Actionable Market Intelligence)$/i.test(normalized)) {
    return `## ${normalized}`;
  }

  return normalized;
}

function formatBody(raw: string) {
  const lines = raw
    .replace(/\f/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => !/^\d+$/.test(line));

  const paragraphs: string[] = [];
  let current: string[] = [];

  const flush = () => {
    if (!current.length) return;
    const paragraph = cleanParagraph(current.join(' '));
    if (paragraph) paragraphs.push(paragraph);
    current = [];
  };

  for (const line of lines) {
    if (!line) {
      flush();
      continue;
    }

    if (isEmojiOnly(line)) {
      flush();
      continue;
    }

    if (lineShouldStartNewParagraph(line)) {
      flush();
      current.push(line);
      flush();
      continue;
    }

    current.push(line);
  }

  flush();

  const sourceUrl = paragraphs.length && /^https?:\/\//i.test(paragraphs[paragraphs.length - 1])
    ? paragraphs.pop() ?? null
    : null;

  return {
    body: paragraphs.join('\n\n'),
    sourceUrl,
  };
}

function buildExcerpt(body: string) {
  const firstParagraph = body
    .split('\n\n')
    .find((paragraph) => paragraph && !paragraph.startsWith('## ') && !paragraph.startsWith('### ') && !paragraph.startsWith('> '));

  if (!firstParagraph) return 'Trade Talk article imported from the archived PDF collection.';
  return firstParagraph.length > 260 ? `${firstParagraph.slice(0, 257).trimEnd()}...` : firstParagraph;
}

function fallbackTitleFromBody(body: string, index: number) {
  const paragraph = body
    .split('\n\n')
    .map((part) => stripDecorators(normalizeWhitespace(part)))
    .find(Boolean);

  if (!paragraph) return `Trade Talk Article ${index}`;

  const sentenceMatch = paragraph.match(/^(.{8,180}?(?:\?\?|\?!|!!|\?|!|\.))(?:\s|$)/);
  return (sentenceMatch?.[1] || paragraph.slice(0, 180)).trim();
}

function buildTags(title: string, body: string) {
  const lower = `${title} ${body}`.toLowerCase();
  return TAG_DICTIONARY.filter((tag) => lower.includes(tag)).slice(0, 8);
}

function detectCategory(title: string, body: string) {
  const lower = `${title} ${body}`.toLowerCase();

  if (/(wheat|rice|corn|maize|soybean|soybeans|cotton|sugar|pulses|fertilizer|phosphate|ethanol|crop|grain)/.test(lower)) {
    return 'Crops';
  }
  if (/(usd|inr|rupee|yuan|dollar|silver|gold|crude|oil|currency|forex|rbi|opec)/.test(lower)) {
    return 'Markets';
  }
  if (/(tariff|export|import|trade|china|canada|eu|pakistan|russia|ukraine|policy)/.test(lower)) {
    return 'Trade';
  }

  return CATEGORY_FALLBACK;
}

function parsePublishedAt(dateText: string, timeText: string) {
  const [day, month, year] = dateText.split('/');
  return new Date(`${year}-${month}-${day}T${timeText}:00+05:30`).toISOString();
}

function mimeFromExtension(ext: string) {
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    default:
      return 'image/jpeg';
  }
}

async function ensureCategory(client: Pool | PoolClient, name: string) {
  const slug = generateSlug(name);
  const existing = await client.query<{ id: string }>('SELECT id FROM article_categories WHERE slug = $1 LIMIT 1', [slug]);
  if (existing.rows[0]) return existing.rows[0].id;
  const id = createId('cat');
  await client.query('INSERT INTO article_categories (id, slug, name) VALUES ($1, $2, $3)', [id, slug, name]);
  return id;
}

async function ensureTag(client: Pool | PoolClient, name: string) {
  const slug = generateSlug(name);
  const existing = await client.query<{ id: string }>('SELECT id FROM article_tags WHERE slug = $1 LIMIT 1', [slug]);
  if (existing.rows[0]) return existing.rows[0].id;
  const id = createId('tag');
  await client.query('INSERT INTO article_tags (id, slug, name) VALUES ($1, $2, $3)', [id, slug, name]);
  return id;
}

async function ensureAuthorId() {
  const byEmail = await pool.query<{ id: string }>(
    'SELECT id FROM app_users WHERE email = $1 LIMIT 1',
    [AUTHOR_EMAIL]
  );
  if (byEmail.rows[0]) return byEmail.rows[0].id;

  const anyAdmin = await pool.query<{ id: string }>(
    `SELECT id FROM app_users WHERE role IN ('admin', 'editor') ORDER BY created_at ASC LIMIT 1`
  );
  if (anyAdmin.rows[0]) return anyAdmin.rows[0].id;

  throw new Error('No editor/admin user exists in app_users. Seed an admin first.');
}

async function extractPdfText(pdfPath: string) {
  return execFileSync('pdftotext', [pdfPath, '-'], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 64 });
}

async function extractPdfImages(pdfPath: string) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'trade-talk-pdf-'));
  const prefix = path.join(tempDir, 'image');
  execFileSync('pdfimages', ['-j', pdfPath, prefix], { stdio: 'pipe', maxBuffer: 1024 * 1024 * 32 });
  const files = (await fs.readdir(tempDir))
    .filter((entry) => entry.startsWith('image'))
    .sort()
    .map((entry) => path.join(tempDir, entry));

  return { tempDir, files };
}

function parseArticlesFromText(rawText: string) {
  const lines = rawText
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/\u000c/g, '').trimEnd());

  const postedPattern = /^Posted by Know Your Commodity on (\d{2}\/\d{2}\/\d{4}) at (\d{2}:\d{2}) • ([^\n]+)$/;
  const entries: Array<{ postedIndex: number; titleStart: number; titleEnd: number }> = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (!postedPattern.test(lines[index].trim())) continue;

    let cursor = index - 1;
    while (cursor >= 0 && (!lines[cursor].trim() || /^\d+$/.test(lines[cursor].trim()))) {
      cursor -= 1;
    }

    const titleEnd = cursor;
    while (cursor >= 0 && lines[cursor].trim() && !/^\d+$/.test(lines[cursor].trim())) {
      cursor -= 1;
    }

    entries.push({
      postedIndex: index,
      titleStart: cursor + 1,
      titleEnd,
    });
  }

  const parsed: Array<{
    index: number;
    title: string;
    imageLabel: string;
    publishedAt: string;
    body: string;
    excerpt: string;
    tags: string[];
    category: string;
    sourceUrl: string | null;
  }> = [];

  for (let index = 0; index < entries.length; index += 1) {
    const current = entries[index];
    const next = entries[index + 1];
    const postedLine = lines[current.postedIndex].trim();
    const match = postedLine.match(postedPattern);
    if (!match) continue;

    const rawTitle = lines.slice(current.titleStart, current.titleEnd + 1).join('\n');
    let title = cleanTitle(rawTitle);

    const bodyLines = lines
      .slice(current.postedIndex + 1, next ? next.titleStart : lines.length)
      .filter((line) => !/^\d+$/.test(line.trim()));

    while (bodyLines.length && !bodyLines[0].trim()) bodyLines.shift();
    while (bodyLines.length && !bodyLines[bodyLines.length - 1].trim()) bodyLines.pop();

    if (isImageFileName(title)) {
      const firstContentIndex = bodyLines.findIndex((line) => line.trim() && !isEmojiOnly(line.trim()));
      if (firstContentIndex >= 0) {
        title = cleanTitle(bodyLines[firstContentIndex]);
        bodyLines.splice(firstContentIndex, 1);
        while (bodyLines.length && !bodyLines[0].trim()) bodyLines.shift();
      }
    }

    const { body, sourceUrl } = formatBody(bodyLines.join('\n'));
    if (!title) {
      title = fallbackTitleFromBody(body, index + 1);
    }
    const excerpt = buildExcerpt(body);
    const tags = buildTags(title, body);
    const category = detectCategory(title, body);

    parsed.push({
      index: index + 1,
      title,
      imageLabel: match[3].trim(),
      publishedAt: parsePublishedAt(match[1], match[2]),
      body,
      excerpt,
      tags,
      category,
      sourceUrl,
    });
  }

  return parsed;
}

async function resetExistingContent() {
  await pool.query('BEGIN');
  try {
    await pool.query('DELETE FROM article_tag_links');
    await pool.query('DELETE FROM article_category_links');
    await pool.query('DELETE FROM articles');
    await pool.query('DELETE FROM article_tags');
    await pool.query('DELETE FROM article_categories');
    await pool.query(`DELETE FROM media_files WHERE public_url LIKE '/api/media/imports/trade-talk/%' OR public_url LIKE '%/api/media/imports/trade-talk/%'`);
    await pool.query('COMMIT');
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }
}

async function copyImagesAndBuildArticles(pdfPath: string) {
  const text = await extractPdfText(pdfPath);
  const parsedArticles = parseArticlesFromText(text);
  const { tempDir, files } = await extractPdfImages(pdfPath);

  if (parsedArticles.length !== files.length) {
    throw new Error(`Expected parsed article count (${parsedArticles.length}) to equal extracted image count (${files.length}).`);
  }

  const importDir = path.join(mediaStoragePath, 'imports', 'trade-talk');
  await fs.rm(importDir, { recursive: true, force: true });
  await fs.mkdir(importDir, { recursive: true });

  const articles: ParsedArticle[] = [];

  for (let index = 0; index < parsedArticles.length; index += 1) {
    const article = parsedArticles[index];
    const imageSourcePath = files[index];
    const ext = path.extname(imageSourcePath).toLowerCase() || '.jpg';
    const safeSlug = generateSlug(article.title) || `trade-talk-${String(article.index).padStart(3, '0')}`;
    const mediaFileName = `${String(article.index).padStart(3, '0')}-${safeSlug}${ext}`;
    const mediaTargetPath = path.join(importDir, mediaFileName);

    await fs.copyFile(imageSourcePath, mediaTargetPath);

    articles.push({
      index: article.index,
      title: article.title,
      excerpt: article.excerpt,
      body: article.body,
      tags: article.tags,
      category: article.category,
      heroImageFileName: mediaFileName,
      heroImageMimeType: mimeFromExtension(ext),
      heroImagePublicUrl: `/api/media/imports/trade-talk/${mediaFileName}`,
      publishedAt: article.publishedAt,
      sourceUrl: article.sourceUrl,
      sourceMetadata: {
        source: 'trade_talk_articles_with_images.pdf',
        originalImageLabel: article.imageLabel,
        pdfPath,
      },
    });
  }

  await fs.rm(tempDir, { recursive: true, force: true });
  return articles;
}

async function insertArticles(articles: ParsedArticle[]) {
  const authorId = await ensureAuthorId();
  const usedSlugs = new Set<string>();

  for (const article of articles) {
    const articleId = createId('art');
    const categoryId = await ensureCategory(pool, article.category);
    const baseSlug = generateSlug(article.title) || `trade-talk-article-${String(article.index).padStart(3, '0')}`;
    let slug = baseSlug;
    let suffix = 2;
    while (usedSlugs.has(slug)) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }
    usedSlugs.add(slug);

    await pool.query(
      `INSERT INTO articles (
        id, type, title, slug, excerpt, body, author_id, hero_image, is_premium,
        linked_article_id, status, summary, seo_title, seo_description, source_url,
        source_label, source_metadata, published_at
      ) VALUES (
        $1, 'ARTICLE', $2, $3, $4, $5, $6, $7, false,
        NULL, 'published', NULL, NULL, NULL, $8,
        'Trade Talk PDF Import', $9::jsonb, $10
      )`,
      [
        articleId,
        article.title,
        slug,
        article.excerpt,
        article.body,
        authorId,
        article.heroImagePublicUrl,
        article.sourceUrl,
        JSON.stringify(article.sourceMetadata),
        article.publishedAt,
      ]
    );

    await pool.query(
      'INSERT INTO article_category_links (article_id, category_id) VALUES ($1, $2)',
      [articleId, categoryId]
    );

    for (const tag of article.tags) {
      const tagId = await ensureTag(pool, tag);
      await pool.query(
        'INSERT INTO article_tag_links (article_id, tag_id) VALUES ($1, $2) ON CONFLICT (article_id, tag_id) DO NOTHING',
        [articleId, tagId]
      );
    }

    await pool.query(
      `INSERT INTO media_files (id, filename, storage_key, public_url, mime_type, byte_size, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        createId('med'),
        article.heroImageFileName,
        `imports/trade-talk/${article.heroImageFileName}`,
        article.heroImagePublicUrl,
        article.heroImageMimeType,
        (await fs.stat(path.join(mediaStoragePath, 'imports', 'trade-talk', article.heroImageFileName))).size,
        authorId,
      ]
    );
  }
}

async function main() {
  const articles = await copyImagesAndBuildArticles(PDF_PATH);

  console.log(`Parsed ${articles.length} articles from PDF.`);

  await resetExistingContent();
  await insertArticles(articles);

  const counts = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM articles WHERE status = 'published'`
  );

  console.log(`Imported ${counts.rows[0]?.count ?? '0'} published articles.`);
}

main()
  .catch((error) => {
    console.error('Trade Talk PDF import failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => undefined);
  });
