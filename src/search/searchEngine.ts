import type { BookmarkDocument, SearchResult, UsageHistory } from '@/types'
import { rankScore, usageOnlyScore } from './ranking'

/**
 * Matching is a strict, case-insensitive substring AND: the query is split
 * into whitespace-separated tokens and a document matches only if EVERY token
 * is a substring of its combined searchable text. There is deliberately no
 * fuzzy/typo tolerance — "lu" must not match "overview", and a document is
 * dropped the moment a single token is missing (see the search requirements).
 *
 * Tokens can be satisfied by any part of the document because we search one
 * combined field (name + keywords + path + url) rather than per-key, so a
 * query like "kub graf" matches a doc where "kub" is only in the path and
 * "graf" only in the name.
 */
interface IndexedDocument {
  document: BookmarkDocument
  searchable: string
}

function toSearchable(document: BookmarkDocument): string {
  return [document.name, document.keywords.join(' '), document.path, document.url]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

/**
 * Splits a query into lowercase tokens on runs of whitespace, discarding the
 * empty strings that consecutive spaces would otherwise produce. "manager
 * service" and "manager   service" tokenize identically.
 */
function tokenize(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean)
}

export interface SearchOptions {
  limit?: number
  usage?: UsageHistory
}

export class SearchEngine {
  private indexed: IndexedDocument[]
  private documents: BookmarkDocument[]

  constructor(documents: BookmarkDocument[] = []) {
    this.documents = documents
    this.indexed = documents.map((document) => ({ document, searchable: toSearchable(document) }))
  }

  setDocuments(documents: BookmarkDocument[]): void {
    this.documents = documents
    this.indexed = documents.map((document) => ({ document, searchable: toSearchable(document) }))
  }

  get size(): number {
    return this.documents.length
  }

  search(query: string, options: SearchOptions = {}): SearchResult[] {
    const limit = options.limit ?? 8
    const usage = options.usage ?? {}
    const tokens = tokenize(query)

    if (tokens.length === 0) {
      return this.documents
        .map((document) => ({ document, score: usageOnlyScore(document, usage) }))
        .sort((a, b) => b.score - a.score || a.document.name.localeCompare(b.document.name))
        .slice(0, limit)
    }

    const trimmed = query.trim()

    return this.indexed
      .filter(({ searchable }) => tokens.every((token) => searchable.includes(token)))
      .map(({ document }) => ({
        document,
        score: rankScore({ document, fuseScore: undefined, query: trimmed, usage }),
      }))
      .sort((a, b) => b.score - a.score || a.document.name.localeCompare(b.document.name))
      .slice(0, limit)
  }
}
