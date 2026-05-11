import { parseStringPromise } from 'xml2js';
import { Builder } from 'xml2js';

export interface OpmlFeed {
  title: string;
  xmlUrl: string;
  htmlUrl?: string;
  group?: string;
}

export async function parseOpml(xmlContent: string): Promise<OpmlFeed[]> {
  const result = await parseStringPromise(xmlContent, { explicitArray: true });
  const feeds: OpmlFeed[] = [];

  const body = result?.opml?.body?.[0];
  if (!body) return feeds;

  function traverse(outlines: any[], groupName?: string) {
    for (const outline of outlines) {
      const attrs = outline.$ || {};
      if (attrs.xmlUrl) {
        feeds.push({
          title: attrs.title || attrs.text || attrs.xmlUrl,
          xmlUrl: attrs.xmlUrl,
          htmlUrl: attrs.htmlUrl,
          group: groupName,
        });
      } else if (outline.outline) {
        traverse(outline.outline, attrs.text || attrs.title || groupName);
      }
    }
  }

  traverse(body.outline || []);
  return feeds;
}

export function buildOpml(
  feeds: Array<{ title: string; url: string; siteUrl?: string | null; groupName?: string | null }>
): string {
  const groups: Record<string, typeof feeds> = {};
  const ungrouped: typeof feeds = [];

  for (const feed of feeds) {
    if (feed.groupName) {
      if (!groups[feed.groupName]) groups[feed.groupName] = [];
      groups[feed.groupName].push(feed);
    } else {
      ungrouped.push(feed);
    }
  }

  const outlines: any[] = [];

  for (const feed of ungrouped) {
    outlines.push({
      $: { text: feed.title, title: feed.title, type: 'rss', xmlUrl: feed.url, htmlUrl: feed.siteUrl || '' },
    });
  }

  for (const [groupName, groupFeeds] of Object.entries(groups)) {
    outlines.push({
      $: { text: groupName, title: groupName },
      outline: groupFeeds.map((f) => ({
        $: { text: f.title, title: f.title, type: 'rss', xmlUrl: f.url, htmlUrl: f.siteUrl || '' },
      })),
    });
  }

  const builder = new Builder({ headless: false, renderOpts: { pretty: true, indent: '  ' } });
  return builder.buildObject({
    opml: {
      $: { version: '1.0' },
      head: [{ title: ['RSS Reader Export'] }],
      body: [{ outline: outlines }],
    },
  });
}
