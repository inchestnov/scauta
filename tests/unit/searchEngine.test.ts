import { describe, expect, it } from 'vitest'
import { SearchEngine } from '@/search/searchEngine'
import type { BookmarkDocument, UsageHistory } from '@/types'

const docs: BookmarkDocument[] = [
  {
    id: 'k8s-dashboard',
    name: 'Kubernetes Dashboard',
    url: 'https://k8s.example.com/dashboard',
    path: 'Development / Kubernetes',
    keywords: ['k8s', 'example', 'com', 'dashboard'],
  },
  {
    id: 'github-k8s-repo',
    name: 'GitHub Kubernetes Repository',
    url: 'https://github.com/example/kubernetes',
    path: 'Development / Source Control',
    keywords: ['github', 'com', 'example', 'kubernetes', 'source', 'control'],
  },
  {
    id: 'grafana-prod',
    name: 'Grafana Production Dashboard',
    url: 'https://grafana.company.com',
    path: 'Development / Kubernetes',
    keywords: ['company', 'com'],
  },
  {
    id: 'unrelated-recipes',
    name: 'Favorite Recipes',
    url: 'https://cooking.example.com/recipes',
    path: 'Personal / Cooking',
    keywords: ['cooking', 'example', 'com', 'recipes'],
  },
  {
    id: 'unrelated-news',
    name: 'Daily News',
    url: 'https://news.example.com',
    path: 'Personal',
    keywords: ['news', 'example', 'com'],
  },
]

function buildEngine(): SearchEngine {
  return new SearchEngine(docs)
}

describe('SearchEngine', () => {
  it('finds the Grafana bookmark for a multi-term query spanning path and name ("kub graf")', () => {
    const engine = buildEngine()
    const results = engine.search('kub graf')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].document.id).toBe('grafana-prod')
  })

  it('finds the GitHub Kubernetes repo for "git kub"', () => {
    const engine = buildEngine()
    const results = engine.search('git kub')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].document.id).toBe('github-k8s-repo')
  })

  it('does NOT tolerate typos — "grafna" (no such substring) yields no results', () => {
    const engine = buildEngine()
    expect(engine.search('grafna')).toHaveLength(0)
  })

  it('is case-insensitive for both query and document text', () => {
    const engine = buildEngine()
    const ids = engine.search('GRAFANA').map((r) => r.document.id)
    expect(ids).toContain('grafana-prod')
  })

  it('is order-independent across query tokens', () => {
    const engine = buildEngine()
    const a = engine.search('kub graf').map((r) => r.document.id)
    const b = engine.search('graf kub').map((r) => r.document.id)
    expect(a).toEqual(b)
    expect(a[0]).toBe('grafana-prod')
  })

  it('requires every token to be present (AND), excluding partial matches', () => {
    const engine = buildEngine()
    // "grafana" matches grafana-prod, but "handler" appears nowhere -> excluded.
    expect(engine.search('grafana handler')).toHaveLength(0)
  })

  it('collapses runs of whitespace into token separators without empty tokens', () => {
    const engine = buildEngine()
    const tight = engine.search('kub graf').map((r) => r.document.id)
    const loose = engine.search('  kub    graf  ').map((r) => r.document.id)
    expect(loose).toEqual(tight)
  })

  it('matches tokens as substrings anywhere in the combined text ("l ser ov")', () => {
    const engine = new SearchEngine([
      {
        id: 'prod-manager',
        name: '[prod] manager service overview',
        url: 'https://example.com/prod',
        path: 'Ops',
        keywords: [],
      },
    ])
    // Every short token is a substring of the combined text; order irrelevant.
    expect(engine.search('l ser ov').map((r) => r.document.id)).toEqual(['prod-manager'])
    // "lu" is absent -> the whole row is dropped even though "s"/"ov" match.
    expect(engine.search('lu s ov')).toHaveLength(0)
  })

  it('returns all documents ordered by usage (desc) then name when the query is empty', () => {
    const engine = buildEngine()
    const usage: UsageHistory = {
      'unrelated-news': { count: 10, lastUsedAt: Date.now() },
    }

    const results = engine.search('', { usage })
    expect(results[0].document.id).toBe('unrelated-news')

    // The remaining docs (zero usage boost) should be alphabetically ordered by name.
    const rest = results.slice(1).map((r) => r.document.name)
    const sortedRest = [...rest].sort((a, b) => a.localeCompare(b))
    expect(rest).toEqual(sortedRest)
  })

  it('respects the limit option', () => {
    const engine = buildEngine()
    const resultsAll = engine.search('', { limit: 100 })
    expect(resultsAll).toHaveLength(docs.length)

    const resultsLimited = engine.search('', { limit: 2 })
    expect(resultsLimited).toHaveLength(2)

    const fuzzyLimited = engine.search('example', { limit: 1 })
    expect(fuzzyLimited).toHaveLength(1)
  })

  it('reflects documents set via setDocuments', () => {
    const engine = new SearchEngine([])
    expect(engine.size).toBe(0)
    engine.setDocuments(docs)
    expect(engine.size).toBe(docs.length)
    const results = engine.search('grafana')
    expect(results[0].document.id).toBe('grafana-prod')
  })
})
