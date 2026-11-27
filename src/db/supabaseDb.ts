import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema.ts';

type AnyRow = Record<string, unknown>;

const DRIZZLE_NAME = Symbol.for('drizzle:Name');
const DRIZZLE_COLUMNS = Symbol.for('drizzle:Columns');

function getTableName(table: unknown): string {
  if (!table || typeof table !== 'object') return '';
  const syms = Object.getOwnPropertySymbols(table);
  for (const s of syms) {
    if (s.toString() === 'Symbol(drizzle:Name)' || s === DRIZZLE_NAME) {
      return String((table as Record<symbol, unknown>)[s]);
    }
  }
  return '';
}

function getColumnMaps(table: unknown): {
  sqlToJs: Record<string, string>;
  jsToSql: Record<string, string>;
  dateJsKeys: Set<string>;
} {
  const sqlToJs: Record<string, string> = {};
  const jsToSql: Record<string, string> = {};
  const dateJsKeys = new Set<string>();
  if (!table || typeof table !== 'object') {
    return { sqlToJs, jsToSql, dateJsKeys };
  }
  const syms = Object.getOwnPropertySymbols(table);
  for (const s of syms) {
    if (s.toString() === 'Symbol(drizzle:Columns)' || s === DRIZZLE_COLUMNS) {
      const cols = (
        table as Record<symbol, Record<string, { name?: string; dataType?: string }>>
      )[s];
      if (cols) {
        for (const [jsKey, col] of Object.entries(cols)) {
          if (col?.name) {
            sqlToJs[col.name] = jsKey;
            jsToSql[jsKey] = col.name;
            if (col.dataType === 'date') {
              dateJsKeys.add(jsKey);
            }
          }
        }
      }
    }
  }
  return { sqlToJs, jsToSql, dateJsKeys };
}

const tableMeta = new Map<
  string,
  { sqlToJs: Record<string, string>; jsToSql: Record<string, string>; dateJsKeys: Set<string> }
>();

for (const value of Object.values(schema)) {
  const name = getTableName(value);
  if (name) {
    tableMeta.set(name, getColumnMaps(value));
  }
}

function toSqlRow(tableName: string, row: AnyRow): AnyRow {
  const meta = tableMeta.get(tableName);
  const out: AnyRow = {};
  for (const [key, rawVal] of Object.entries(row)) {
    if (rawVal === undefined) continue;
    const sqlKey = meta?.jsToSql[key] || key;
    out[sqlKey] = rawVal instanceof Date ? rawVal.toISOString() : rawVal;
  }
  return out;
}

function fromSqlRow(tableName: string, row: AnyRow): AnyRow {
  const meta = tableMeta.get(tableName);
  const out: AnyRow = {};
  for (const [sqlKey, rawVal] of Object.entries(row)) {
    const jsKey = meta?.sqlToJs[sqlKey] || sqlKey;
    if (meta?.dateJsKeys.has(jsKey) && typeof rawVal === 'string') {
      out[jsKey] = new Date(rawVal);
    } else {
      out[jsKey] = rawVal;
    }
  }
  return out;
}

function isColumn(obj: unknown): obj is { name: string; table: unknown } {
  return Boolean(
    obj &&
      typeof obj === 'object' &&
      'name' in obj &&
      'table' in obj &&
      typeof (obj as { name: unknown }).name === 'string'
  );
}

function unwrapParam(val: unknown): unknown {
  if (val && typeof val === 'object' && 'value' in val && !Array.isArray(val)) {
    const constructorName = (val as { constructor?: { name?: string } }).constructor?.name;
    if (constructorName === 'Param') {
      return (val as { value: unknown }).value;
    }
  }
  return val;
}

function getRowValue(
  rowByTable: Record<string, AnyRow | null>,
  col: { name: string; table: unknown }
): unknown {
  const tName = getTableName(col.table);
  const row = rowByTable[tName];
  if (!row) return undefined;
  const meta = tableMeta.get(tName);
  const jsKey = meta?.sqlToJs[col.name] || col.name;
  return row[jsKey];
}

function evalCondition(
  cond: unknown,
  rowByTable: Record<string, AnyRow | null>
): boolean {
  if (!cond || typeof cond !== 'object') return true;
  const chunks = (cond as { queryChunks?: unknown[] }).queryChunks;
  if (!Array.isArray(chunks)) return true;

  if (
    chunks.length === 3 &&
    Array.isArray((chunks[0] as { value?: unknown })?.value) &&
    (chunks[0] as { value: string[] }).value[0] === '('
  ) {
    return evalCondition(chunks[1], rowByTable);
  }

  const hasAnd = chunks.some(
    (c) =>
      Array.isArray((c as { value?: unknown })?.value) &&
      (c as { value: string[] }).value.some((v) => v.toLowerCase().includes(' and '))
  );
  if (hasAnd) {
    return chunks
      .filter((c) => Boolean((c as { queryChunks?: unknown[] })?.queryChunks))
      .every((c) => evalCondition(c, rowByTable));
  }

  if (chunks.length >= 4 && isColumn(chunks[1])) {
    const col = chunks[1];
    const opChunk = (chunks[2] as { value?: string[] })?.value?.[0] || '';
    const leftVal = getRowValue(rowByTable, col);

    if (opChunk.includes('not in')) {
      const arr = Array.isArray(chunks[3]) ? chunks[3].map(unwrapParam) : [];
      return !arr.includes(leftVal);
    }

    if (opChunk.includes('=')) {
      if (isColumn(chunks[3])) {
        const rightVal = getRowValue(rowByTable, chunks[3]);
        return leftVal !== undefined && leftVal === rightVal;
      }
      const targetVal = unwrapParam(chunks[3]);
      return leftVal === targetVal;
    }
  }

  return true;
}

interface ExtractedEqFilter {
  tableName: string;
  sqlCol: string;
  value: unknown;
}

function extractEqFilters(cond: unknown): ExtractedEqFilter[] {
  if (!cond || typeof cond !== 'object') return [];
  const chunks = (cond as { queryChunks?: unknown[] }).queryChunks;
  if (!Array.isArray(chunks)) return [];

  if (
    chunks.length === 3 &&
    Array.isArray((chunks[0] as { value?: unknown })?.value) &&
    (chunks[0] as { value: string[] }).value[0] === '('
  ) {
    return extractEqFilters(chunks[1]);
  }

  const hasAnd = chunks.some(
    (c) =>
      Array.isArray((c as { value?: unknown })?.value) &&
      (c as { value: string[] }).value.some((v) => v.toLowerCase().includes(' and '))
  );
  if (hasAnd) {
    return chunks
      .filter((c) => Boolean((c as { queryChunks?: unknown[] })?.queryChunks))
      .flatMap((c) => extractEqFilters(c));
  }

  if (chunks.length >= 4 && isColumn(chunks[1])) {
    const col = chunks[1];
    const opChunk = (chunks[2] as { value?: string[] })?.value?.[0] || '';
    if (opChunk.includes('=') && !opChunk.includes('not') && !isColumn(chunks[3])) {
      const targetVal = unwrapParam(chunks[3]);
      return [
        {
          tableName: getTableName(col.table),
          sqlCol: col.name,
          value: targetVal instanceof Date ? targetVal.toISOString() : targetVal,
        },
      ];
    }
  }
  return [];
}

function isCountProjection(val: unknown): boolean {
  if (!val || typeof val !== 'object') return false;
  const chunks = (val as { queryChunks?: unknown[] }).queryChunks;
  if (!Array.isArray(chunks)) return false;
  return chunks.some((c) => {
    const v = (c as { value?: string[] })?.value;
    if (Array.isArray(v) && v.some((s) => s.toLowerCase().includes('count('))) return true;
    return isCountProjection(c);
  });
}

async function fetchAllRows(
  client: SupabaseClient,
  tableName: string,
  eqFilters: ExtractedEqFilter[] = [],
  selectCols = '*'
): Promise<AnyRow[]> {
  const PAGE_SIZE = 1000;
  const all: AnyRow[] = [];
  let from = 0;

  while (true) {
    let q = client.from(tableName).select(selectCols).range(from, from + PAGE_SIZE - 1);
    for (const f of eqFilters) {
      if (f.tableName === tableName && f.value !== undefined && f.value !== null) {
        q = q.eq(f.sqlCol, f.value);
      }
    }
    const { data, error } = await q;
    if (error) {
      throw new Error(`Supabase select error on ${tableName}: ${error.message}`);
    }
    const rows = (data || []) as unknown as AnyRow[];
    for (const r of rows) {
      all.push(fromSqlRow(tableName, r));
    }
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return all;
}

export function createSupabaseDb(
  supabaseUrl: string,
  supabaseKey: string
): ReturnType<typeof drizzle<typeof schema>> {
  const client = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const adapter = {
    select(projection?: Record<string, unknown>) {
      let baseTableName = '';
      const joins: Array<{
        type: 'inner' | 'left';
        tableName: string;
        on: unknown;
      }> = [];
      let whereCond: unknown = null;
      let orderSpecs: unknown[] = [];
      let limitVal: number | null = null;

      const execute = async (): Promise<unknown[]> => {
        const eqFilters = whereCond ? extractEqFilters(whereCond) : [];

        // Fast path for count() without joins
        if (projection && joins.length === 0) {
          const projEntries = Object.entries(projection);
          if (projEntries.length === 1 && isCountProjection(projEntries[0][1])) {
            let cq = client.from(baseTableName).select('*', { count: 'exact', head: true });
            const baseEq = eqFilters.filter((f) => f.tableName === baseTableName);
            if (!whereCond || baseEq.length > 0) {
              for (const f of baseEq) {
                if (f.value !== undefined && f.value !== null) {
                  cq = cq.eq(f.sqlCol, f.value);
                }
              }
              const { count: cnt, error } = await cq;
              if (error) {
                throw new Error(`Supabase count error on ${baseTableName}: ${error.message}`);
              }
              return [{ [projEntries[0][0]]: cnt ?? 0 }];
            }
          }
        }

        const baseEq = eqFilters.filter((f) => f.tableName === baseTableName);
        const baseRows = await fetchAllRows(client, baseTableName, baseEq);

        let combined: Array<Record<string, AnyRow | null>> = baseRows.map((r) => ({
          [baseTableName]: r,
        }));

        for (const join of joins) {
          const joinEq = eqFilters.filter((f) => f.tableName === join.tableName);
          const rightRows = await fetchAllRows(client, join.tableName, joinEq);
          const next: Array<Record<string, AnyRow | null>> = [];
          for (const ctx of combined) {
            let matchedAny = false;
            for (const rr of rightRows) {
              const candidate = { ...ctx, [join.tableName]: rr };
              if (evalCondition(join.on, candidate)) {
                matchedAny = true;
                next.push(candidate);
              }
            }
            if (!matchedAny && join.type === 'left') {
              next.push({ ...ctx, [join.tableName]: null });
            }
          }
          combined = next;
        }

        if (whereCond) {
          combined = combined.filter((ctx) => evalCondition(whereCond, ctx));
        }

        if (orderSpecs.length > 0) {
          combined.sort((a, b) => {
            for (const spec of orderSpecs) {
              let col: { name: string; table: unknown } | null = null;
              let direction: 'asc' | 'desc' = 'asc';

              if (isColumn(spec)) {
                col = spec;
              } else if (spec && typeof spec === 'object' && 'queryChunks' in spec) {
                const chunks = (spec as { queryChunks?: unknown[] }).queryChunks || [];
                for (const c of chunks) {
                  if (isColumn(c)) col = c;
                  const txt = (c as { value?: string[] })?.value?.[0] || '';
                  if (txt.toLowerCase().includes('desc')) direction = 'desc';
                }
              }

              if (!col) continue;
              const av = getRowValue(a, col);
              const bv = getRowValue(b, col);
              if (av === bv) continue;
              if (av === undefined || av === null) return direction === 'asc' ? -1 : 1;
              if (bv === undefined || bv === null) return direction === 'asc' ? 1 : -1;

              const cmp =
                av instanceof Date && bv instanceof Date
                  ? av.getTime() - bv.getTime()
                  : typeof av === 'number' && typeof bv === 'number'
                  ? av - bv
                  : String(av).localeCompare(String(bv));
              if (cmp !== 0) return direction === 'asc' ? cmp : -cmp;
            }
            return 0;
          });
        }

        if (limitVal !== null) {
          combined = combined.slice(0, limitVal);
        }

        if (!projection) {
          return combined.map((ctx) => ({ ...(ctx[baseTableName] || {}) }));
        }

        const projEntries = Object.entries(projection);
        if (projEntries.length === 1 && isCountProjection(projEntries[0][1])) {
          return [{ [projEntries[0][0]]: combined.length }];
        }

        return combined.map((ctx) => {
          const out: AnyRow = {};
          for (const [key, expr] of projEntries) {
            if (isColumn(expr)) {
              const val = getRowValue(ctx, expr);
              out[key] = val === undefined ? null : val;
            } else if (getTableName(expr)) {
              const tName = getTableName(expr);
              out[key] = ctx[tName] ? { ...ctx[tName] } : null;
            } else {
              out[key] = null;
            }
          }
          return out;
        });
      };

      const builder = {
        from(table: unknown) {
          baseTableName = getTableName(table);
          return builder;
        },
        innerJoin(table: unknown, on: unknown) {
          joins.push({ type: 'inner', tableName: getTableName(table), on });
          return builder;
        },
        leftJoin(table: unknown, on: unknown) {
          joins.push({ type: 'left', tableName: getTableName(table), on });
          return builder;
        },
        where(cond: unknown) {
          whereCond = cond;
          return builder;
        },
        orderBy(...specs: unknown[]) {
          orderSpecs = specs;
          return builder;
        },
        limit(n: number) {
          limitVal = n;
          return builder;
        },
        then<TResult1 = unknown[], TResult2 = never>(
          onfulfilled?: ((value: unknown[]) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
        ) {
          return execute().then(onfulfilled, onrejected);
        },
      };

      return builder;
    },

    insert(table: unknown) {
      const tableName = getTableName(table);
      let rowsToInsert: AnyRow[] = [];
      let conflictMode: 'none' | 'nothing' | 'update' = 'none';
      let conflictTargetCol: { name: string; table: unknown } | null = null;
      let conflictSet: AnyRow | null = null;

      const execute = async (): Promise<AnyRow[]> => {
        if (rowsToInsert.length === 0) return [];
        const sqlRows = rowsToInsert.map((r) => toSqlRow(tableName, r));

        if (conflictMode === 'nothing') {
          const { data, error } = await client
            .from(tableName)
            .upsert(sqlRows, {
              ...(conflictTargetCol ? { onConflict: conflictTargetCol.name } : {}),
              ignoreDuplicates: true,
            })
            .select();
          if (error) {
            throw new Error(`Supabase insert (ignoreDuplicates) error on ${tableName}: ${error.message}`);
          }
          return ((data || []) as unknown as AnyRow[]).map((r) => fromSqlRow(tableName, r));
        }

        if (conflictMode === 'update' && conflictTargetCol) {
          const mergedRows = rowsToInsert.map((r) =>
            toSqlRow(tableName, { ...r, ...(conflictSet || {}) })
          );
          const { data, error } = await client
            .from(tableName)
            .upsert(mergedRows, { onConflict: conflictTargetCol.name })
            .select();
          if (error) {
            throw new Error(`Supabase upsert error on ${tableName}: ${error.message}`);
          }
          return ((data || []) as unknown as AnyRow[]).map((r) => fromSqlRow(tableName, r));
        }

        const { data, error } = await client.from(tableName).insert(sqlRows).select();
        if (error) {
          throw new Error(`Supabase insert error on ${tableName}: ${error.message}`);
        }
        return ((data || []) as unknown as AnyRow[]).map((r) => fromSqlRow(tableName, r));
      };

      const builder = {
        values(vals: AnyRow | AnyRow[]) {
          rowsToInsert = Array.isArray(vals) ? vals : [vals];
          return builder;
        },
        onConflictDoNothing(opts?: { target?: unknown }) {
          conflictMode = 'nothing';
          if (opts?.target && isColumn(opts.target)) {
            conflictTargetCol = opts.target;
          }
          return builder;
        },
        onConflictDoUpdate(opts: { target: unknown; set: AnyRow }) {
          conflictMode = 'update';
          if (isColumn(opts.target)) {
            conflictTargetCol = opts.target;
          }
          conflictSet = opts.set;
          return builder;
        },
        returning() {
          return builder;
        },
        then<TResult1 = AnyRow[], TResult2 = never>(
          onfulfilled?: ((value: AnyRow[]) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
        ) {
          return execute().then(onfulfilled, onrejected);
        },
      };

      return builder;
    },

    update(table: unknown) {
      const tableName = getTableName(table);
      let patch: AnyRow = {};
      let whereCond: unknown = null;

      const execute = async (): Promise<AnyRow[]> => {
        const sqlPatch = toSqlRow(tableName, patch);
        const eqFilters = whereCond ? extractEqFilters(whereCond) : [];
        const baseEq = eqFilters.filter((f) => f.tableName === tableName);

        if (baseEq.length > 0 && baseEq.every((f) => f.value !== undefined && f.value !== null)) {
          let q = client.from(tableName).update(sqlPatch);
          for (const f of baseEq) {
            q = q.eq(f.sqlCol, f.value);
          }
          const { data, error } = await q.select();
          if (error) {
            throw new Error(`Supabase update error on ${tableName}: ${error.message}`);
          }
          return ((data || []) as unknown as AnyRow[]).map((r) => fromSqlRow(tableName, r));
        }

        const existingRows = await fetchAllRows(client, tableName);
        const matchingIds = existingRows
          .filter((r) => !whereCond || evalCondition(whereCond, { [tableName]: r }))
          .map((r) => r.id)
          .filter((id) => id !== undefined && id !== null);

        if (matchingIds.length === 0) return [];
        const { data, error } = await client
          .from(tableName)
          .update(sqlPatch)
          .in('id', matchingIds)
          .select();
        if (error) {
          throw new Error(`Supabase update error on ${tableName}: ${error.message}`);
        }
        return ((data || []) as unknown as AnyRow[]).map((r) => fromSqlRow(tableName, r));
      };

      const builder = {
        set(vals: AnyRow) {
          patch = vals;
          return builder;
        },
        where(cond: unknown) {
          whereCond = cond;
          return builder;
        },
        returning() {
          return builder;
        },
        then<TResult1 = AnyRow[], TResult2 = never>(
          onfulfilled?: ((value: AnyRow[]) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
        ) {
          return execute().then(onfulfilled, onrejected);
        },
      };

      return builder;
    },

    delete(table: unknown) {
      const tableName = getTableName(table);
      let whereCond: unknown = null;

      const execute = async (): Promise<AnyRow[]> => {
        const eqFilters = whereCond ? extractEqFilters(whereCond) : [];
        const baseEq = eqFilters.filter((f) => f.tableName === tableName);

        if (baseEq.length > 0 && baseEq.every((f) => f.value !== undefined && f.value !== null)) {
          let q = client.from(tableName).delete();
          for (const f of baseEq) {
            q = q.eq(f.sqlCol, f.value);
          }
          const { data, error } = await q.select();
          if (error) {
            throw new Error(`Supabase delete error on ${tableName}: ${error.message}`);
          }
          return ((data || []) as unknown as AnyRow[]).map((r) => fromSqlRow(tableName, r));
        }

        const existingRows = await fetchAllRows(client, tableName);
        const matchingIds = existingRows
          .filter((r) => !whereCond || evalCondition(whereCond, { [tableName]: r }))
          .map((r) => r.id)
          .filter((id) => id !== undefined && id !== null);

        if (matchingIds.length === 0) return [];

        const removed: AnyRow[] = [];
        const CHUNK = 100;
        for (let i = 0; i < matchingIds.length; i += CHUNK) {
          const { data, error } = await client
            .from(tableName)
            .delete()
            .in('id', matchingIds.slice(i, i + CHUNK))
            .select();
          if (error) {
            throw new Error(`Supabase delete error on ${tableName}: ${error.message}`);
          }
          for (const r of (data || []) as unknown as AnyRow[]) {
            removed.push(fromSqlRow(tableName, r));
          }
        }
        return removed;
      };

      const builder = {
        where(cond: unknown) {
          whereCond = cond;
          return builder;
        },
        returning() {
          return builder;
        },
        then<TResult1 = AnyRow[], TResult2 = never>(
          onfulfilled?: ((value: AnyRow[]) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
        ) {
          return execute().then(onfulfilled, onrejected);
        },
      };

      return builder;
    },
  };

  return adapter as unknown as ReturnType<typeof drizzle<typeof schema>>;
}
