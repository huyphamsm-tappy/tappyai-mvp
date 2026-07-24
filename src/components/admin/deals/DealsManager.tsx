'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { upload } from '@vercel/blob/client'
import { Loader2, Plus, Pencil, Trash2, ArrowUp, ArrowDown, Eye, EyeOff, X, ImagePlus } from 'lucide-react'

const PARTNER_TYPES = ['ecommerce', 'food', 'ride', 'travel'] as const

interface Deal {
  id: string
  partnerSlug: string
  partnerName: string
  partnerType: string
  category: string
  title: string
  description: string | null
  officialUrl: string
  bannerImage: string | null
  logoImage: string | null
  isFeatured: boolean
  discountLabel: string | null
  voucherCode: string | null
  displayOrder: number
  isActive: boolean
  startAt: string | null
  endAt: string | null
  countryCode: string
  clickCount: number
}

type FormState = {
  partnerSlug: string; partnerName: string; partnerType: string; category: string; title: string; description: string
  officialUrl: string; logoImage: string; bannerImage: string
  discountLabel: string; voucherCode: string
  displayOrder: string; isActive: boolean; isFeatured: boolean; countryCode: string
  startAt: string; endAt: string
}

const BLANK: FormState = {
  partnerSlug: '', partnerName: '', partnerType: 'ecommerce', category: 'Mua sắm', title: '', description: '',
  officialUrl: 'https://', logoImage: '', bannerImage: '',
  discountLabel: '', voucherCode: '',
  displayOrder: '0', isActive: true, isFeatured: false, countryCode: 'VN', startAt: '', endAt: '',
}

// datetime-local (local time, no tz) → ISO-8601 UTC; '' → null.
const toIso = (v: string) => (v ? new Date(v).toISOString() : null)
// ISO → datetime-local value for the input.
const toLocal = (v: string | null) => {
  if (!v) return ''
  const d = new Date(v)
  const off = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - off).toISOString().slice(0, 16)
}

export function DealsManager() {
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null) // deal id, or 'new', or null
  const [form, setForm] = useState<FormState>(BLANK)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState<'logo' | 'banner' | null>(null)
  const logoInput = useRef<HTMLInputElement>(null)
  const bannerInput = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/admin/deals')
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error?.message ?? 'Load failed')
      setDeals(json.data ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  function openCreate() {
    setForm({ ...BLANK, displayOrder: String(deals.length + 1) })
    setEditing('new')
  }
  function openEdit(d: Deal) {
    setForm({
      partnerSlug: d.partnerSlug, partnerName: d.partnerName, partnerType: d.partnerType, category: d.category, title: d.title, description: d.description ?? '',
      officialUrl: d.officialUrl, logoImage: d.logoImage ?? '', bannerImage: d.bannerImage ?? '',
      discountLabel: d.discountLabel ?? '', voucherCode: d.voucherCode ?? '',
      displayOrder: String(d.displayOrder), isActive: d.isActive, isFeatured: d.isFeatured, countryCode: d.countryCode,
      startAt: toLocal(d.startAt), endAt: toLocal(d.endAt),
    })
    setEditing(d.id)
  }

  async function handleUpload(kind: 'logo' | 'banner', file: File) {
    setUploading(kind)
    try {
      const res = await upload(`deals/${kind}-${Date.now()}-${file.name}`, file, {
        access: 'public', handleUploadUrl: '/api/admin/deals/upload',
      })
      setForm((f) => ({ ...f, [kind === 'logo' ? 'logoImage' : 'bannerImage']: res.url }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally { setUploading(null) }
  }

  async function save() {
    setSaving(true); setError(null)
    const isNew = editing === 'new'
    const body: Record<string, unknown> = {
      // partner_slug is immutable → only sent on create.
      ...(isNew ? { partnerSlug: form.partnerSlug.trim().toLowerCase() } : {}),
      partnerName: form.partnerName.trim(),
      partnerType: form.partnerType,
      isFeatured: form.isFeatured,
      category: form.category.trim(),
      title: form.title.trim(),
      description: form.description.trim() || null,
      officialUrl: form.officialUrl.trim(),
      logoImage: form.logoImage.trim() || null,
      bannerImage: form.bannerImage.trim() || null,
      discountLabel: form.discountLabel.trim() || null,
      voucherCode: form.voucherCode.trim() || null,
      displayOrder: Number(form.displayOrder) || 0,
      isActive: form.isActive,
      countryCode: form.countryCode.trim().toUpperCase() || 'VN',
      startAt: toIso(form.startAt),
      endAt: toIso(form.endAt),
    }
    try {
      const res = await fetch(isNew ? '/api/admin/deals' : `/api/admin/deals/${editing}`, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error?.message ?? 'Save failed')
      setEditing(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally { setSaving(false) }
  }

  async function patch(id: string, fields: Record<string, unknown>) {
    const res = await fetch(`/api/admin/deals/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields),
    })
    if (!res.ok) { const j = await res.json().catch(() => null); setError(j?.error?.message ?? 'Update failed') }
    await load()
  }

  async function toggleActive(d: Deal) { await patch(d.id, { isActive: !d.isActive }) }

  async function move(index: number, dir: -1 | 1) {
    const other = deals[index + dir]
    const cur = deals[index]
    if (!other || !cur) return
    // Swap display_order with the neighbour.
    await fetch(`/api/admin/deals/${cur.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ displayOrder: other.displayOrder }) })
    await fetch(`/api/admin/deals/${other.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ displayOrder: cur.displayOrder }) })
    await load()
  }

  async function remove(d: Deal) {
    if (!confirm(`Xoá deal "${d.title}"?`)) return
    const res = await fetch(`/api/admin/deals/${d.id}`, { method: 'DELETE' })
    if (!res.ok) { const j = await res.json().catch(() => null); setError(j?.error?.message ?? 'Delete failed') }
    await load()
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Partner Deals</h1>
          <p className="text-sm text-gray-500">Quản lý ưu đãi đối tác hiển thị trong tab Deals (web + mobile).</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-sm font-medium text-white hover:bg-orange-600">
          <Plus size={16} /> Thêm deal
        </button>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-600 dark:text-red-400">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={22} className="animate-spin text-gray-400" /></div>
      ) : (
        <div className="space-y-2">
          {deals.map((d, i) => (
            <div key={d.id} className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
              <div className="flex flex-col">
                <button disabled={i === 0} onClick={() => move(i, -1)} className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-30"><ArrowUp size={14} /></button>
                <button disabled={i === deals.length - 1} onClick={() => move(i, 1)} className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-30"><ArrowDown size={14} /></button>
              </div>
              <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden text-sm font-bold text-gray-500">
                {d.logoImage ? <img src={d.logoImage} alt="" className="w-full h-full object-cover" /> : (d.partnerName[0]?.toUpperCase() ?? '?')}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {d.isFeatured && <span title="Featured" className="text-amber-500">★ </span>}
                  {d.title} <span className="text-xs text-gray-400">· {d.category} · {d.partnerType}</span>
                </p>
                <p className="text-xs text-gray-400 truncate">{d.partnerSlug} · {d.officialUrl}</p>
              </div>
              <span className="text-[11px] text-gray-400 tabular-nums" title="Lượt bấm">{d.clickCount} 👆</span>
              {!d.isActive && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-500">TẮT</span>}
              <button onClick={() => toggleActive(d)} title={d.isActive ? 'Tắt' : 'Bật'} className="p-1.5 text-gray-400 hover:text-gray-700">{d.isActive ? <Eye size={16} /> : <EyeOff size={16} />}</button>
              <button onClick={() => openEdit(d)} className="p-1.5 text-gray-400 hover:text-blue-600"><Pencil size={16} /></button>
              <button onClick={() => remove(d)} className="p-1.5 text-gray-400 hover:text-red-600"><Trash2 size={16} /></button>
            </div>
          ))}
          {deals.length === 0 && <p className="py-10 text-center text-sm text-gray-400">Chưa có deal nào.</p>}
        </div>
      )}

      {/* Create / Edit panel */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !saving && setEditing(null)}>
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-gray-900 p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">{editing === 'new' ? 'Thêm deal' : 'Sửa deal'}</h2>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label={`Partner slug${editing === 'new' ? ' (không đổi sau khi tạo)' : ' (khoá)'}`}>
                  <input className={`${inputCls} ${editing !== 'new' ? 'opacity-60 cursor-not-allowed' : ''}`} value={form.partnerSlug} disabled={editing !== 'new'} placeholder="shopee" onChange={(e) => setForm({ ...form, partnerSlug: e.target.value })} />
                </Field>
                <Field label="Partner type">
                  <input className={inputCls} list="deal-partner-types" value={form.partnerType} placeholder="ecommerce" onChange={(e) => setForm({ ...form, partnerType: e.target.value })} />
                  <datalist id="deal-partner-types">{PARTNER_TYPES.map((t) => <option key={t} value={t} />)}</datalist>
                </Field>
              </div>
              <Field label="Partner name"><input className={inputCls} value={form.partnerName} onChange={(e) => setForm({ ...form, partnerName: e.target.value })} /></Field>
              <Field label="Title"><input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Category"><input className={inputCls} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></Field>
                <Field label="Country"><input className={inputCls} value={form.countryCode} onChange={(e) => setForm({ ...form, countryCode: e.target.value })} /></Field>
              </div>
              <Field label="Description"><input className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Mức giảm (badge, tối đa 24)"><input className={inputCls} value={form.discountLabel} placeholder="Giảm 50%" maxLength={24} onChange={(e) => setForm({ ...form, discountLabel: e.target.value })} /></Field>
                <Field label="Mã voucher (tối đa 40)"><input className={inputCls} value={form.voucherCode} placeholder="FREESHIP50" maxLength={40} onChange={(e) => setForm({ ...form, voucherCode: e.target.value })} /></Field>
              </div>
              <Field label="Official URL (https only)"><input className={inputCls} value={form.officialUrl} onChange={(e) => setForm({ ...form, officialUrl: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <ImageField label="Logo" value={form.logoImage} busy={uploading === 'logo'} inputRef={logoInput} onPick={(f) => handleUpload('logo', f)} onClear={() => setForm({ ...form, logoImage: '' })} />
                <ImageField label="Banner" value={form.bannerImage} busy={uploading === 'banner'} inputRef={bannerInput} onPick={(f) => handleUpload('banner', f)} onClear={() => setForm({ ...form, bannerImage: '' })} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Display order"><input type="number" className={inputCls} value={form.displayOrder} onChange={(e) => setForm({ ...form, displayOrder: e.target.value })} /></Field>
                <Field label="Active"><label className="flex items-center gap-2 h-9"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /><span className="text-sm text-gray-600 dark:text-gray-300">Hiển thị</span></label></Field>
                <Field label="Featured"><label className="flex items-center gap-2 h-9"><input type="checkbox" checked={form.isFeatured} onChange={(e) => setForm({ ...form, isFeatured: e.target.checked })} /><span className="text-sm text-gray-600 dark:text-gray-300">★ Ghim</span></label></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Start at (optional)"><input type="datetime-local" className={inputCls} value={form.startAt} onChange={(e) => setForm({ ...form, startAt: e.target.value })} /></Field>
                <Field label="End at (optional)"><input type="datetime-local" className={inputCls} value={form.endAt} onChange={(e) => setForm({ ...form, endAt: e.target.value })} /></Field>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setEditing(null)} disabled={saving} className="rounded-lg px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">Huỷ</button>
              <button onClick={save} disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-60">
                {saving && <Loader2 size={14} className="animate-spin" />} Lưu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const inputCls = 'w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-orange-400'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>{children}</label>
}

function ImageField({ label, value, busy, inputRef, onPick, onClear }: {
  label: string; value: string; busy: boolean; inputRef: RefObject<HTMLInputElement>
  onPick: (f: File) => void; onClear: () => void
}) {
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>
      <div className="flex items-center gap-2">
        {value
          ? <img src={value} alt="" className="w-9 h-9 rounded-lg object-cover border border-gray-200 dark:border-gray-700" />
          : <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400"><ImagePlus size={16} /></div>}
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="rounded-lg border border-gray-300 dark:border-gray-700 px-2 py-1 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-60">
          {busy ? '...' : 'Tải lên'}
        </button>
        {value && <button type="button" onClick={onClear} className="text-xs text-gray-400 hover:text-red-500">Xoá</button>}
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = '' }} />
      </div>
    </div>
  )
}
