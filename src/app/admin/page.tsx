import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

// Home Dashboard — Phase 0 STUB. Real KPIs (DAU/MAU/revenue/AI cost) arrive in
// Phase 1 from daily_snapshots (01_Master_Architecture / 26_Founder_Dashboard).
// No analytics tables are queried here yet (Performance §3.1: dashboards read
// pre-computed snapshots, which do not exist until Phase 1).
export default function AdminHomePage() {
  const placeholders = [
    { label: 'DAU', note: 'Phase 1' },
    { label: 'MAU (28d)', note: 'Phase 1' },
    { label: 'MRR', note: 'Phase 3' },
    { label: 'AI Cost (today)', note: 'Phase 3' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          TappyAI Back Office — Architecture v1.1. Foundation (Phase 0) is live: RBAC, audit log, and the admin shell.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {placeholders.map((k) => (
          <Card key={k.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{k.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-muted-foreground/50">—</div>
              <Badge variant="muted" className="mt-2">{k.note}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Foundation status</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>✅ RBAC enforced in this layout and every <code>/api/admin/*</code> handler.</p>
          <p>✅ Immutable audit log recording every administrative action.</p>
          <p>✅ Admin shell + navigation (modules marked “soon” unlock in later phases).</p>
          <p>Analytics dashboards populate once the Phase 1 pipeline (daily_snapshots) ships.</p>
        </CardContent>
      </Card>
    </div>
  )
}
