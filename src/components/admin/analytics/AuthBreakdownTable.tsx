'use client'

import type { ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export interface Column<T> { key: string; label: string; align?: 'right'; render: (row: T) => ReactNode }

// Reusable table with loading / empty / error / pagination states. Presentational
// (props only). Used for provider, platform, and acquisition breakdowns, and by
// Founder/Investor dashboards.
export function AuthBreakdownTable<T>({
  title, columns, rows, loading, error, emptyText = 'No data for this range.', hasMore, onLoadMore,
}: {
  title: string
  columns: Column<T>[]
  rows: T[]
  loading?: boolean
  error?: string | null
  emptyText?: string
  hasMore?: boolean
  onLoadMore?: () => void
}) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>
        {error ? (
          <div role="alert" className="text-sm text-red-500">{error}</div>
        ) : loading && rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((c) => (
                    <TableHead key={c.key} className={c.align === 'right' ? 'text-right' : undefined}>{c.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, i) => (
                  <TableRow key={i}>
                    {columns.map((c) => (
                      <TableCell key={c.key} className={c.align === 'right' ? 'text-right tabular-nums' : undefined}>{c.render(row)}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {hasMore && (
              <div className="pt-4 text-center">
                <Button variant="outline" size="sm" disabled={loading} onClick={onLoadMore}>
                  {loading ? 'Loading…' : 'Load more'}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
