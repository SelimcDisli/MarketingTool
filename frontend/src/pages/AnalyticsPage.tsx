import { useState, useEffect } from 'react'
import api from '@/lib/api'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Send, Eye, Reply, AlertTriangle, MousePointerClick, Users, Mail, BarChart3 } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts'
import { formatNumber, formatPercent } from '@/lib/utils'
import type { AnalyticsOverview, DailyStats } from '@/types'

const periods = [
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
]

export function AnalyticsPage() {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null)
  const [daily, setDaily] = useState<DailyStats[]>([])
  const [accounts, setAccounts] = useState<any[]>([])
  const [days, setDays] = useState(30)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [days])

  async function loadData() {
    setLoading(true)
    try {
      const [o, d, a] = await Promise.all([
        api.get(`/analytics/overview?days=${days}`).catch(() => ({ data: null })),
        api.get(`/analytics/daily?days=${days}`).catch(() => ({ data: [] })),
        api.get('/analytics/accounts').catch(() => ({ data: [] })),
      ])
      setOverview(o.data)
      setDaily(d.data || [])
      setAccounts(a.data?.accounts || a.data || [])
    } catch { } finally { setLoading(false) }
  }

  if (loading) return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
      <Skeleton className="h-80" />
    </div>
  )

  return (
    <div className="space-y-6 animate-[fadeIn_0.3s_ease-out]">
      <PageHeader title="Analytics" description="Track your email performance">
        <div className="flex items-center bg-white rounded-xl border border-slate-200/60 p-1 shadow-sm">
          {periods.map(p => (
            <button key={p.value} onClick={() => setDays(p.value)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${days === p.value ? 'bg-primary-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}>
              {p.label}
            </button>
          ))}
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Emails Sent" value={formatNumber(overview?.totalSent || 0)} icon={Send} iconColor="text-primary-600 bg-primary-50" />
        <StatCard label="Open Rate" value={formatPercent(overview?.openRate || 0)} icon={Eye} iconColor="text-emerald-600 bg-emerald-50" />
        <StatCard label="Reply Rate" value={formatPercent(overview?.replyRate || 0)} icon={Reply} iconColor="text-blue-600 bg-blue-50" />
        <StatCard label="Bounce Rate" value={formatPercent(overview?.bounceRate || 0)} icon={AlertTriangle} iconColor="text-amber-600 bg-amber-50" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Total Clicks" value={formatNumber(overview?.totalClicked || 0)} icon={MousePointerClick} iconColor="text-violet-600 bg-violet-50" />
        <StatCard label="Active Campaigns" value={overview?.activeCampaigns || 0} icon={BarChart3} iconColor="text-cyan-600 bg-cyan-50" />
        <StatCard label="Total Leads" value={formatNumber(overview?.totalLeads || 0)} icon={Users} iconColor="text-rose-600 bg-rose-50" />
      </div>

      <Card>
        <CardHeader><CardTitle>Email Trends</CardTitle></CardHeader>
        <CardContent>
          {daily.length > 0 ? (
            <ResponsiveContainer width="100%" height={360}>
              <AreaChart data={daily}>
                <defs>
                  <linearGradient id="aSent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.1}/><stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="aOpened" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="aReplied" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)', fontSize: 12 }} />
                <Area type="monotone" dataKey="sent" stroke="#4f46e5" strokeWidth={2} fill="url(#aSent)" name="Sent" />
                <Area type="monotone" dataKey="opened" stroke="#10b981" strokeWidth={2} fill="url(#aOpened)" name="Opened" />
                <Area type="monotone" dataKey="replied" stroke="#3b82f6" strokeWidth={2} fill="url(#aReplied)" name="Replied" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-80 flex items-center justify-center text-slate-400 text-sm">No data yet</div>
          )}
        </CardContent>
      </Card>

      {accounts.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Account Performance</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full">
              <thead>
                <tr className="text-xs font-medium text-slate-500 border-b border-slate-100">
                  <th className="text-left pb-3 px-3">Account</th>
                  <th className="text-right pb-3 px-3">Sent</th>
                  <th className="text-right pb-3 px-3">Opens</th>
                  <th className="text-right pb-3 px-3">Open Rate</th>
                  <th className="text-right pb-3 px-3">Replies</th>
                  <th className="text-right pb-3 px-3">Bounces</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((acc: any) => (
                  <tr key={acc.id || acc.email} className="border-b border-slate-50 last:border-0">
                    <td className="py-2.5 px-3 text-sm text-slate-900 font-medium">{acc.email}</td>
                    <td className="py-2.5 px-3 text-sm text-slate-600 text-right">{acc.sent || 0}</td>
                    <td className="py-2.5 px-3 text-sm text-slate-600 text-right">{acc.opens || 0}</td>
                    <td className="py-2.5 px-3 text-sm text-slate-600 text-right">{formatPercent(acc.openRate || 0)}</td>
                    <td className="py-2.5 px-3 text-sm text-slate-600 text-right">{acc.replies || 0}</td>
                    <td className="py-2.5 px-3 text-sm text-slate-600 text-right">{acc.bounces || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
