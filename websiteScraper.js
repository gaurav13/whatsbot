import axios from 'axios';
import * as cheerio from 'cheerio';

function normalizeUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) throw new Error('url is required');

  let url;
  try {
    url = new URL(raw.includes('://') ? raw : `https://${raw}`);
  } catch {
    throw new Error('Invalid URL');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only http/https URLs are supported');
  }

  return url.toString();
}

function cleanText(text) {
  return String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export async function scrapeWebsite(inputUrl) {
  const url = normalizeUrl(inputUrl);

  const response = await axios.get(url, {
    timeout: 20000,
    maxRedirects: 5,
    responseType: 'text',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (compatible; GS-AI-WBot/1.0; +https://gsaisolutions.online)',
      Accept: 'text/html,application/xhtml+xml',
    },
    validateStatus: (status) => status >= 200 && status < 400,
  });

  const html = String(response.data || '');
  const $ = cheerio.load(html);

  $('script, style, noscript, iframe, svg, canvas, nav, footer, header, aside, form').remove();
  $('[aria-hidden="true"], .cookie, .cookies, #cookie, .newsletter').remove();

  const title =
    cleanText($('title').first().text()) ||
    cleanText($('meta[property="og:title"]').attr('content')) ||
    cleanText($('h1').first().text()) ||
    url;

  const main =
    $('main').first().text() ||
    $('article').first().text() ||
    $('[role="main"]').first().text() ||
    $('body').text();

  let content = cleanText(main);

  // Soft cap to keep DB/AI context manageable
  const maxChars = 50000;
  if (content.length > maxChars) {
    content = `${content.slice(0, maxChars)}\n\n[Content truncated]`;
  }

  if (!content || content.length < 40) {
    throw new Error('Could not extract enough readable text from that page');
  }

  const wordCount = content.split(/\s+/).filter(Boolean).length;

  return {
    url,
    title,
    content,
    contentLength: content.length,
    wordCount,
    preview: content.slice(0, 400),
  };
}
