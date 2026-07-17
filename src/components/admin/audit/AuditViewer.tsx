'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

interface AuditRow {
  id: string
  actor_email: string
  actor_role: string
  action: string
  target_type: string | null
  target_id: string | null
  created_at: string
}

export function AuditViewer() {
  const [rows, setRows] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(true)
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [action, setAction] = useState('')
  const [actorId, setActorId] = useState('')

  const load = useCallback(async (opts?: { append?: boolean; before?: string | null }) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (action.trim()) params.set('action', action.trim())
      if (actorId.trim()) params.set('actor_id', actorId.trim())
      if (opts?.before) params.set('before', opts.before)
      const res = await fetch(`/api/admin/audit?${params.toString()}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to load')
      setRows((prev) => (opts?.append ? [...prev, ...json.data] : json.data))
      setCursor(json.meta?.page?.cursor ?? null)
      setHasMore(Boolean(json.meta?.page?.hasMore))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load audit log')
    } finally {
      setLoading(false)
    }
  }, [action, actorId])

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-col sm:flex-row gap-3 pt-6 sm:items-end">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground">Action</label>
            <Input value={action} onChange={(e) => setAction(e.target.value)} placeholder="e.g. rbac.role_granted" />
          </div>
          <div className="flex-1">
            <label className="text-xs text-muted-foreground">Actor ID</label>
            <Input value={actorId} onChange={(e) => setActorId(e.target.value)} placeholder="Supabase UUID" />
          </div>
          <Button variant="outline" onClick={() => load()}>Search</Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {loading && rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No audit entries match.</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Target</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {new Date(r.created_at).toLocaleString('vi-VN')}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{r.actor_email}</div>
                        <div className="text-xs text-muted-foreground">{r.actor_role}</div>
                      </TableCell>
                      <TableCell><Badge variant="muted">{r.action}</Badge></TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.target_type ? `${r.target_type}:${r.target_id ?? ''}` : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {hasMore && (
                <div className="pt-4 text-center">
                  <Button variant="outline" size="sm" disabled={loading} onClick={() => load({ append: true, before: cursor })}>
                    {loading ? 'Loading…' : 'Load more'}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
