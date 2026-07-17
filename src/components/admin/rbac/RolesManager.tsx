'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { useTranslation } from '@/lib/i18n/useTranslation'

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

const ROLE_LABEL_KEY: Record<Role, string> = {
  super_admin: 'admin.role.superAdmin',
  admin: 'admin.role.admin',
  moderator: 'admin.role.moderator',
  analyst: 'admin.role.analyst',
}

export function RolesManager() {
  const { t, locale } = useTranslation()
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
      if (!res.ok) throw new Error(json.error?.message ?? t('admin.common.failedToLoad'))
      setRows(json.data ?? [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('admin.rbac.error.loadRoles'))
    } finally {
      setLoading(false)
    }
  }, [t])

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
      if (!res.ok) throw new Error(json.error?.message ?? t('admin.rbac.error.grant'))
      toast.success(t('admin.rbac.success.grant'))
      setUserId(''); setNotes('')
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('admin.rbac.error.grant'))
    } finally {
      setSubmitting(false)
    }
  }

  async function revoke(row: RoleRow) {
    const name = row.profiles?.full_name ?? row.user_id
    if (!confirm(t('admin.rbac.revokeConfirm', { role: row.role, name }))) return
    try {
      const res = await fetch(`/api/admin/rbac/roles/${row.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? t('admin.rbac.error.revoke'))
      toast.success(t('admin.rbac.success.revoke'))
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('admin.rbac.error.revoke'))
    }
  }

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId.trim())

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('admin.rbac.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('admin.rbac.subtitle')}</p>
      </div>
      <Card>
        <CardHeader><CardTitle>{t('admin.rbac.grantTitle')}</CardTitle></CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground">{t('admin.rbac.userIdLabel')}</label>
            <Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" />
          </div>
          <div className="w-full sm:w-40">
            <label className="text-xs text-muted-foreground">{t('admin.rbac.roleLabel')}</label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="analyst">{t(ROLE_LABEL_KEY.analyst)}</SelectItem>
                <SelectItem value="moderator">{t(ROLE_LABEL_KEY.moderator)}</SelectItem>
                <SelectItem value="admin">{t(ROLE_LABEL_KEY.admin)}</SelectItem>
                <SelectItem value="super_admin">{t(ROLE_LABEL_KEY.super_admin)}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1">
            <label className="text-xs text-muted-foreground">{t('admin.rbac.notesLabel')}</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('admin.rbac.notesPlaceholder')} />
          </div>
          <Button onClick={grant} disabled={!isUuid || submitting}>{t('admin.rbac.grantButton')}</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t('admin.rbac.adminRoles')}</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">{t('admin.common.loading')}</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('admin.rbac.noRolesYet')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('admin.rbac.table.user')}</TableHead>
                  <TableHead>{t('admin.rbac.table.role')}</TableHead>
                  <TableHead>{t('admin.rbac.table.granted')}</TableHead>
                  <TableHead>{t('admin.rbac.table.notes')}</TableHead>
                  <TableHead className="text-right">{t('admin.common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium">{r.profiles?.full_name ?? t('admin.common.unknown')}</div>
                      <div className="text-xs text-muted-foreground font-mono">{r.user_id}</div>
                    </TableCell>
                    <TableCell><Badge variant={ROLE_BADGE[r.role]}>{r.role}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(r.granted_at).toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-US')}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[220px] truncate">{r.notes ?? '—'}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="destructive" size="sm" onClick={() => revoke(r)}>{t('admin.rbac.revokeButton')}</Button>
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
