'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'

type Role = 'super_admin' | 'admin' | 'moderator' | 'analyst'

interface RoleRow {
  id: string
  user_id: string
  role: Role
  granted_at: string
  expires_at: string | null
  notes: string | null
  profiles: { full_name: string | null } | null
}

const ROLE_BADGE: Record<Role, BadgeProps['variant']> = {
  super_admin: 'destructive',
  admin: 'warning',
  moderator: 'default',
  analyst: 'success',
}

export function RolesManager() {
  const [rows, setRows] = useState<RoleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState('')
  const [role, setRole] = useState<Role>('analyst')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/rbac/roles')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to load')
      setRows(json.data ?? [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load roles')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function grant() {
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/rbac/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId.trim(), role, notes: notes.trim() || undefined }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to grant role')
      toast.success('Role granted')
      setUserId(''); setNotes('')
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to grant role')
    } finally {
      setSubmitting(false)
    }
  }

  async function revoke(row: RoleRow) {
    if (!confirm(`Revoke ${row.role} from ${row.profiles?.full_name ?? row.user_id}?`)) return
    try {
      const res = await fetch(`/api/admin/rbac/roles/${row.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to revoke')
      toast.success('Role revoked')
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to revoke role')
    }
  }

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId.trim())

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Grant a role</CardTitle></CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground">User ID (Supabase UUID)</label>
            <Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" />
          </div>
          <div className="w-full sm:w-40">
            <label className="text-xs text-muted-foreground">Role</label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="analyst">Analyst</SelectItem>
                <SelectItem value="moderator">Moderator</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="super_admin">Super Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1">
            <label className="text-xs text-muted-foreground">Notes (optional)</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Reason / context" />
          </div>
          <Button onClick={grant} disabled={!isUuid || submitting}>Grant</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Admin roles</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No admin roles yet. Grant one above.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Granted</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium">{r.profiles?.full_name ?? 'Unknown'}</div>
                      <div className="text-xs text-muted-foreground font-mono">{r.user_id}</div>
                    </TableCell>
                    <TableCell><Badge variant={ROLE_BADGE[r.role]}>{r.role}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(r.granted_at).toLocaleDateString('vi-VN')}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[220px] truncate">{r.notes ?? '—'}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="destructive" size="sm" onClick={() => revoke(r)}>Revoke</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
