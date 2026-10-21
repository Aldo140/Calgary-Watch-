/**
 * Calgary newsrooms whose public RSS feeds CalgaryWatch reads. None needs an
 * API key. We keep each story's headline, outlet, link and time, never its
 * text or photos, and every headline links to the original.
 *
 * `urls` are tried in order and the first that answers with a feed wins, so a
 * newsroom moving its feed (CTV did in 2024) costs a fallback, not the source.
 * `police` marks an official source: its stories are Calgary by definition.
 */

export interface NewsFeed {
  id: string;
  name: string;
  site: string;
  urls: string[];
  police?: boolean;
}

export const NEWS_FEEDS: NewsFeed[] = [
  {
    id: 'cps',
    name: 'Calgary Police Service',
    site: 'https://newsroom.calgary.ca/police-news-releases/',
    urls: ['https://newsroom.calgary.ca/tagfeed/en/tags/police'],
    police: true,
  },
  {
    id: 'ctv',
    name: 'CTV News Calgary',
    site: 'https://www.ctvnews.ca/calgary/',
    urls: [
      'https://www.ctvnews.ca/arc/outboundfeeds/rss/category/calgary/?outputType=xml',
      'https://www.ctvnews.ca/rss/ctvnews-ca-calgary-public-rss-1.822083',
      'https://calgary.ctvnews.ca/rss/ctv-news-calgary-1.822083',
    ],
  },
  {
    id: 'cbc',
    name: 'CBC Calgary',
    site: 'https://www.cbc.ca/news/canada/calgary',
    urls: ['https://www.cbc.ca/webfeed/rss/rss-canada-calgary'],
  },
  {
    id: 'global',
    name: 'Global News Calgary',
    site: 'https://globalnews.ca/calgary/',
    urls: ['https://globalnews.ca/calgary/feed/'],
  },
  {
    id: 'citynews',
    name: 'CityNews Calgary',
    site: 'https://calgary.citynews.ca/',
    urls: ['https://calgary.citynews.ca/feed/'],
  },
  {
    id: 'livewire',
    name: 'LiveWire Calgary',
    site: 'https://livewirecalgary.com/',
    urls: ['https://livewirecalgary.com/feed/'],
  },
];
