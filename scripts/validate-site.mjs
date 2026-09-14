import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('dist');
const htmlFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.html')) htmlFiles.push(full);
  }
}
walk(root);

const errors = [];
const titles = new Map();
const descriptions = new Map();
const pick = (html, re) => html.match(re)?.[1]?.trim();

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  const rel = path.relative(root, file);
  if (!/<html\s+lang="uk"/i.test(html)) errors.push(`${rel}: немає lang="uk"`);
  if (!/<meta\s+name="viewport"/i.test(html)) errors.push(`${rel}: немає viewport`);
  if (/lorem ipsum/i.test(html)) errors.push(`${rel}: знайдено lorem ipsum`);
  const title = pick(html, /<title>([^<]+)<\/title>/i);
  if (!title) errors.push(`${rel}: немає title`);
  else if (titles.has(title)) errors.push(`${rel}: дубль title з ${titles.get(title)}`);
  else titles.set(title, rel);
  if (rel !== '404.html') {
    const desc = pick(html, /<meta\s+name="description"\s+content="([^"]+)"/i);
    if (!desc) errors.push(`${rel}: немає description`);
    else if (descriptions.has(desc)) errors.push(`${rel}: дубль description з ${descriptions.get(desc)}`);
    else descriptions.set(desc, rel);
    if (!/<link\s+rel="canonical"/i.test(html)) errors.push(`${rel}: немає canonical`);
    if (!/property="og:title"/i.test(html)) errors.push(`${rel}: немає Open Graph`);
    if (!/name="twitter:card"/i.test(html)) errors.push(`${rel}: немає Twitter Card`);
  }
  for (const block of html.matchAll(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi)) {
    try { JSON.parse(block[1]); } catch (error) { errors.push(`${rel}: некоректний JSON-LD — ${error.message}`); }
  }
  for (const match of html.matchAll(/(?:href|src)="(\/[^"]+)"/g)) {
    const url = match[1].split(/[?#]/)[0];
    if (!url || url === '/') continue;
    let target = path.join(root, url);
    if (url.endsWith('/')) target = path.join(target, 'index.html');
    if (!fs.existsSync(target)) errors.push(`${rel}: не знайдено ${url}`);
  }
}

for (const required of ['robots.txt','sitemap.xml','favicon.ico','images/favicon.svg','images/apple-touch-icon.png','images/og-k15.png']) {
  if (!fs.existsSync(path.join(root, required))) errors.push(`немає обов’язкового файла ${required}`);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`Перевірено ${htmlFiles.length} HTML-сторінок: помилок не знайдено.`);
