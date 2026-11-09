import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';

// Minimal D1 adapter backed by REAL SQLite, not a mock SQL parser.
export function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8'));
  const db = {
    sqlite,
    prepare(sql) {
      let args = [];
      const wrapper = {
        bind(...values) { args = values; return wrapper; },
        async first() { return sqlite.prepare(sql).get(...args) || null; },
        async all() { return {results:sqlite.prepare(sql).all(...args)}; },
        async run() { const result = sqlite.prepare(sql).run(...args); return {meta:{changes:result.changes}}; },
        execute() { const result = sqlite.prepare(sql).run(...args); return {meta:{changes:result.changes}}; }
      };
      return wrapper;
    },
    async batch(statements) {
      sqlite.exec('BEGIN IMMEDIATE');
      try { const results = statements.map(s => s.execute()); sqlite.exec('COMMIT'); return results; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    }
  };
  return db;
}
