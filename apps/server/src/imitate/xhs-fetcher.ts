// Reference-note fetcher for XHS public links.
// Tries open-graph / meta tags first (the lightest, most stable path).
// If that fails we fall back to ld+json. Images are kept as XHS-CDN URLs;
// in production a worker downloads them to COS for stable serving.

import axios from 'axios';
import { lookup } from 'dns/promises';

export interface RefNoteParsed {
  url: string;
  title?: string;
  body?: string;
  author?: string;
  images: Array<{ src: string; w?: number; h?: number }>;
}

const ALLOWED_HOSTS = ['xiaohongshu.com', 'www.xiaohongshu.com', 'xhslink.com'];
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

const PRIVATE_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^::1$/,
  /^fc/i,
  /^fd/i,
  /^fe80/i,
];

function isPrivateIp(ip: string): boolean {
  return PRIVATE_RANGES.some((r) => r.test(ip));
}

async function assertPublicHost(hostname: string): Promise<void> {
  const { address } = await lookup(hostname);
  if (isPrivateIp(address)) {
    throw new Error('目标地址不允许访问（内网地址）');
  }
}

export async function fetchReferenceNote(url: string): Promise<RefNoteParsed> {
  const u = new URL(url);
  if (!ALLOWED_HOSTS.includes(u.hostname)) {
    throw new Error('请粘贴 xiaohongshu.com / xhslink.com 的链接');
  }

  await assertPublicHost(u.hostname);

  let finalUrl = url;
  let html: string;
  try {
    const res = await axios.get<string>(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
      timeout: 8000,
      maxRedirects: 0,
      transformResponse: (r) => r,
      validateStatus: (s) => s >= 200 && s < 400,
    });
    html = res.data;
    finalUrl = res.request?.res?.responseUrl ?? url;
  } catch (e: any) {
    if (e.response?.status >= 300 && e.response?.status < 400) {
      const location = e.response.headers?.location;
      if (location) {
        const redir = new URL(location, url);
        if (!ALLOWED_HOSTS.includes(redir.hostname)) {
          throw new Error('重定向目标不在允许列表中');
        }
        await assertPublicHost(redir.hostname);
        const res2 = await axios.get<string>(redir.toString(), {
          headers: { 'User-Agent': UA },
          timeout: 8000,
          maxRedirects: 0,
          transformResponse: (r) => r,
          validateStatus: (s) => s < 500,
        });
        html = res2.data;
        finalUrl = redir.toString();
      } else {
        throw new Error('参考帖无法访问，可能已被删除或私密');
      }
    } else {
      throw new Error('参考帖无法访问，可能已被删除或私密');
    }
  }

  const meta = (name: string) => {
    const m =
      html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i')) ??
      html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${name}["']`, 'i'));
    return m?.[1];
  };

  const title = stripHtml(meta('og:title') ?? meta('twitter:title') ?? matchTitle(html) ?? '');
  const body = stripHtml(meta('og:description') ?? meta('description') ?? meta('twitter:description') ?? '');
  const author = stripHtml(meta('og:site_name') ?? meta('author') ?? '');

  // og:image (often only 1 in OG); collect more from inline JSON / img tags below
  const images: Array<{ src: string }> = [];
  const ogImage = meta('og:image');
  if (ogImage) images.push({ src: ogImage });

  // Try inline __INITIAL_STATE__ / window.__INITIAL_SSR_STATE__ JSON for richer image lists
  const initMatch = html.match(/window\.__INITIAL_(?:SSR_)?STATE__\s*=\s*(\{[\s\S]+?\})\s*<\/script>/);
  if (initMatch) {
    try {
      const decoded = decodeXhsInline(initMatch[1]);
      const json = JSON.parse(decoded);
      const note = digNote(json);
      if (note?.imageList?.length) {
        for (const im of note.imageList) {
          const src = im.urlDefault ?? im.url ?? im.urlPre;
          if (src && !images.some((x) => x.src === src)) images.push({ src });
        }
      }
      if (!title && note?.title) (images[0] as any).title = note.title;
    } catch {
      // ignore
    }
  }

  // Last resort: pick a few <img src> from the body
  if (images.length === 0) {
    const matches = html.matchAll(/<img[^>]+src=["']([^"']+)["']/g);
    let cnt = 0;
    for (const m of matches) {
      if (m[1].startsWith('http') && !m[1].includes('avatar') && cnt < 6) {
        images.push({ src: m[1] });
        cnt += 1;
      }
    }
  }

  return { url: finalUrl, title, body, author, images };
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}
function matchTitle(html: string): string | null {
  return html.match(/<title>([^<]+)<\/title>/i)?.[1] ?? null;
}

// XHS escapes some chars (e.g. "undefined" -> 'undefined' literal) in inline state.
function decodeXhsInline(s: string): string {
  return s.replace(/:\s*undefined/g, ': null');
}

function digNote(obj: any): any {
  if (!obj || typeof obj !== 'object') return null;
  // common path: state.noteDetailMap.<id>.note
  const map = obj?.note?.noteDetailMap;
  if (map && typeof map === 'object') {
    for (const k of Object.keys(map)) {
      if (map[k]?.note) return map[k].note;
    }
  }
  if (obj?.note?.note) return obj.note.note;
  return null;
}
