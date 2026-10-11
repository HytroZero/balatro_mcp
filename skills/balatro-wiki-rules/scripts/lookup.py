"""Search the local object catalog; optionally read one Balatro Wiki article."""
from __future__ import annotations

import argparse
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
HOST = 'balatrowiki.org'

def normalize(value: str) -> str:
    return re.sub(r'[^a-z0-9]+', '', value.casefold())

def search(query: str, rows: list[dict]) -> list[dict]:
    needle = normalize(query)
    if not needle:
        return []
    exact = [r for r in rows if normalize(r['name']) == needle]
    return exact or [r for r in rows if needle in normalize(r['name'])]

class ArticleParser(HTMLParser):
    """Read visible article text, retaining rows and section boundaries."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.depth = 0
        self.article_depth = None
        self.skip_depth = None
        self.title_mode = False
        self.title_parts = []
        self.parts = []
        self.canonical = None
        self.final_url = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag not in {'img', 'br', 'hr', 'meta', 'link', 'input', 'wbr', 'source', 'area', 'base', 'embed', 'param', 'track', 'col'}:
            self.depth += 1
        if tag == 'link' and attrs.get('rel') == 'canonical':
            self.canonical = attrs.get('href')
        if tag == 'title':
            self.title_mode = True
        classes = set(attrs.get('class', '').split())
        if self.article_depth is None and 'mw-parser-output' in classes:
            self.article_depth = self.depth
        if self.article_depth is not None:
            if self.skip_depth is None and (tag in {'script', 'style'} or classes & {'mw-editsection', 'navbox', 'toc', 'noprint'}):
                self.skip_depth = self.depth
            if self.skip_depth is None:
                if tag in {'p', 'div', 'li', 'tr', 'h1', 'h2', 'h3', 'h4', 'br'}:
                    self.parts.append('\n')
                elif tag in {'th', 'td'}:
                    self.parts.append(' | ')
                elif tag == 'img' and attrs.get('alt'):
                    self.parts.append(attrs['alt'])

    def handle_endtag(self, tag):
        if tag in {'img', 'br', 'hr', 'meta', 'link', 'input', 'wbr', 'source', 'area', 'base', 'embed', 'param', 'track', 'col'}:
            return
        if tag == 'title':
            self.title_mode = False
        if self.skip_depth == self.depth:
            self.skip_depth = None
        if self.article_depth == self.depth:
            self.article_depth = None
        self.depth = max(0, self.depth - 1)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in {'img', 'br', 'hr', 'meta', 'link', 'input', 'wbr', 'source', 'area', 'base', 'embed', 'param', 'track', 'col'}:
            self.handle_endtag(tag)

    def handle_data(self, data):
        if self.title_mode:
            self.title_parts.append(data)
        if self.article_depth is not None and self.skip_depth is None:
            self.parts.append(data)

def allowed_url(url: str) -> bool:
    parsed = urlsplit(url)
    return (parsed.scheme == 'https' and parsed.hostname == HOST
            and not parsed.query and parsed.path.startswith('/w/'))

def fetch_article(url: str) -> dict:
    if not allowed_url(url):
        raise ValueError('Expected a public HTTPS /w/ article on balatrowiki.org without query parameters')
    request = Request(url, headers={'User-Agent': 'balatro-wiki-rules/1.0 (user-requested article lookup)'})
    with urlopen(request, timeout=30) as response:
        final_url = response.geturl()
        if not allowed_url(final_url):
            raise ValueError('Article redirected outside the supported source')
        payload = response.read(4 * 1024 * 1024 + 1)
        if len(payload) > 4 * 1024 * 1024:
            raise ValueError('Article exceeds the 4 MiB lookup limit')
        html = payload.decode(response.headers.get_content_charset() or 'utf-8', errors='replace')
    parser = ArticleParser()
    parser.feed(html)
    revision = re.search(r'"wgRevisionId":(\d+)', html)
    text = '\n'.join(re.sub(r'[ \t\r\f\v]+', ' ', line).strip() for line in ''.join(parser.parts).splitlines())
    text = re.sub(r'\n{3,}', '\n\n', text).strip()
    if not text:
        raise ValueError('Article text not found')
    return {'title': ''.join(parser.title_parts),
            'url': urljoin(final_url, parser.canonical or final_url),
            'revision_id': int(revision.group(1)) if revision else None,
            'text': text}

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('query', help='Object name or part of an English name')
    parser.add_argument('--kind', help='Filter kind, e.g. joker, tarot, voucher')
    parser.add_argument('--fetch', action='store_true', help='Read exactly one matched live Wiki article')
    parser.add_argument('--json', action='store_true', help='Print structured JSON')
    parser.add_argument('--limit', type=int, default=20, help='Local search display limit (default 20)')
    args = parser.parse_args()
    data = json.loads((ROOT / 'references' / 'objects.json').read_text(encoding='utf-8'))
    rows = data['objects']
    if args.kind:
        rows = [r for r in rows if r['kind'] == args.kind.casefold()]
    matches = search(args.query, rows)
    if not matches:
        print(f'No catalog match for {args.query!r}; check references/sources.md or the source site.', file=sys.stderr)
        return 1
    if args.fetch:
        if len(matches) != 1:
            print('Fetch requires one exact or unambiguous match; use the full name or --kind.', file=sys.stderr)
            return 2
        try:
            result = fetch_article(matches[0]['lookup_url'])
        except (OSError, ValueError) as error:
            print(f'Lookup failed: {error}', file=sys.stderr)
            return 3
        if args.json:
            print(json.dumps(result, ensure_ascii=False, indent=2))
        else:
            print(f"# {result['title']}\nSource: {result['url']}\nRevision: {result['revision_id']}\n\n{result['text']}")
    elif args.json:
        print(json.dumps(matches[:max(1, args.limit)], ensure_ascii=False, indent=2))
    else:
        for row in matches[:max(1, args.limit)]:
            print(f"{row['kind']} | {row['name']} | {row['source_status']} | {row['lookup_url']}")
            if row.get('rarity'):
                print(f"  rarity={row['rarity']} base_cost={row.get('base_cost')} primary_activation={row.get('primary_activation')}")
        if len(matches) > args.limit:
            print(f'{len(matches)} matches; increase --limit to show more.')
    return 0

if __name__ == '__main__':
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, 'reconfigure'):
            stream.reconfigure(encoding='utf-8')
    raise SystemExit(main())
