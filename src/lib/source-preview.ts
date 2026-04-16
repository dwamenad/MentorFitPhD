import type { SourcePreview } from './mentor-engine';

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTags(value: string) {
  return decodeEntities(value.replace(/<[^>]+>/g, ' '));
}

function matchFirst(html: string, pattern: RegExp) {
  const match = html.match(pattern);
  return match?.[1] ? stripTags(match[1]) : undefined;
}

function inferSourceType(rawUrl: string): SourcePreview['sourceType'] {
  const url = new URL(rawUrl);
  if (url.hostname.includes('scholar.google')) {
    return 'Google Scholar';
  }
  if (url.hostname.includes('orcid.org')) {
    return 'ORCID';
  }
  if (/lab|labs|center|centre|group|institute/.test(url.pathname)) {
    return 'Lab Page';
  }
  if (/faculty|people|person|staff/.test(url.pathname)) {
    return 'Faculty Page';
  }
  return 'Personal Website';
}

export async function fetchSourcePreview(rawUrl: string): Promise<SourcePreview> {
  const sourceType = inferSourceType(rawUrl);

  try {
    const response = await fetch(rawUrl, {
      headers: {
        'user-agent': 'MentorFit/1.0 (+http://localhost:3000)',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
    });

    const contentType = response.headers.get('content-type') ?? '';
    const html = await response.text();

    const headings = Array.from(html.matchAll(/<h[1-2][^>]*>([\s\S]*?)<\/h[1-2]>/gi))
      .map((match) => stripTags(match[1]))
      .filter(Boolean)
      .slice(0, 4);

    const title = matchFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
    const description =
      matchFirst(html, /<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i) ??
      matchFirst(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i);

    return {
      title,
      description,
      headings,
      fetched: response.ok,
      fetchNote: response.ok
        ? contentType.includes('html')
          ? undefined
          : `Fetched ${contentType || 'non-HTML content'}; used limited metadata extraction.`
        : `Source responded with ${response.status}.`,
      sourceType,
      sourceReliability: response.ok ? (contentType.includes('html') ? 0.78 : 0.58) : 0.32,
    };
  } catch (error) {
    return {
      headings: [],
      fetched: false,
      fetchNote: error instanceof Error ? error.message : 'Unable to fetch source preview.',
      sourceType,
      sourceReliability: 0.28,
    };
  }
}
