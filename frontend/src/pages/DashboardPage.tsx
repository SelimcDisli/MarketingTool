import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '@/lib/api'
import { formatNumber, formatPercent } from '@/lib/utils'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Send, Eye, Reply, AlertTriangle, Rocket, Users, Plus, Upload, Mail } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts'
import type { AnalyticsOverview, DailyStats, Campaign } from '@/types'

export function DashboardPage() {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null)
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const [overviewRes, dailyRes, campaignsRes] = await Promise.all([
        api.get('/analytics/overview?days=30').catch(() => ({ data: null })),
        api.get('/analytics/daily?days=30').catch(() => ({ data: [] })),
        api.get('/campaigns?limit=5').catch(() => ({ data: { campaigns: [] } })),
      ])
      setOverview(overviewRes.data)
      setDailyStats(dailyRes.data || [])
      setCampaigns(campaignsRes.data?.campaigns || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-80" />
      </div>
    )
  }

  const stats = [
    { label: 'Emails Sent', value: formatNumber(overview?.totalSent || 0), icon: Send, iconColor: 'text-primary-600 bg-primary-50', change: '+12.5% vs last month', changeType: 'positive' as const },
    { label: 'Open Rate', value: formatPercent(overview?.openRate || 0), icon: Eye, iconColor: 'text-emerald-600 bg-emerald-50', change: '+3.2% vs last month', changeType: 'positive' as const },
    { label: 'Reply Rate', value: formatPercent(overview?.replyRate || 0), icon: Reply, iconColor: 'text-blue-600 bg-blue-50', change: '+1.8% vs last month', changeType: 'positive' as const },
    { label: 'Bounce Rate', value: formatPercent(overview?.bounceRate || 0), icon: AlertTriangle, iconColor: 'text-amber-600 bg-amber-50', change: '-0.5% vs last month', changeType: 'positive' as const },
  ]

  return (
    <div className="space-y-6 animate-[fadeIn_0.3s_ease-out]">
      <PageHeader title="Dashboard" description="Your email outreach at a glance">
        <Button onClick={() => navigate('/campaigns')} size="sm">
          <Plus className="w-4 h-4" /> New Campaign
        </Button>
      </PageHeader>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { icon: Rocket, label: 'New Campaign', desc: 'Create an email sequence', onClick: () => navigate('/campaigns'), color: 'from-primary-500 to-primary-600' },
          { icon: Upload, label: 'Import Leads', desc: 'Upload your contact list', onClick: () => navigate('/leads'), color: 'from-emerald-500 to-emerald-600' },
          { icon: Mail, label: 'Connect Account', desc: 'Add an email account', onClick: () => navigate('/accounts'), color: 'from-purple-500 to-purple-600' },
        ].map((action) => (
          <button
            key={action.label}
            onClick={action.onClick}
            className="flex items-center gap-4 p-4 bg-white rounded-xl border border-slate-200/60 shadow-sm hover:shadow-md hover:border-slate-300 transition-all text-left cursor-pointer group"
          >
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${action.color} flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform`}>
              <action.icon className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">{action.label}</p>
              <p className="text-xs text-slate-500">{action.desc}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Email Performance — Last 30 Days</CardTitle>
        </CardHeader>
        <CardContent>
          {dailyStats.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={dailyStats}>
                <defs>
                  <linearGradient id="sentGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="openedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)', fontSize: 13 }}
                />
                <Area type="monotone" dataKey="sent" stroke="#4f46e5" strokeWidth={2} fill="url(#sentGrad)" name="Sent" />
                <Area type="monotone" dataKey="opened" stroke="#10b981" strokeWidth={2} fill="url(#openedGrad)" name="Opened" />
                <Line type="monotone" dataKey="replied" stroke="#3b82f6" strokeWidth={2} dot={false} name="Replied" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-80 flex items-center justify-center text-slate-400 text-sm">
              No data yet. Start a campaign to see analytics.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Campaigns */}
      {campaigns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Campaigns</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-xs font-medium text-slate-500 border-b border-slate-100">
                    <th className="text-left pb-3 pr-4">Name</th>
                    <th className="text-left pb-3 pr-4">Status</th>
                    <th className="text-right pb-3 pr-4">Sent</th>
                    <th className="text-right pb-3">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => (
                    <tr key={c.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 cursor-pointer" onClick={() => navigate(`/campaigns/${c.id}`)}>
                      <td className="py-3 pr-4 text-sm font-medium text-slate-900">{c.name}</td>
                      <td className="py-3 pr-4">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          c.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' :
                          c.status === 'PAUSED' ? 'bg-amber-50 text-amber-700' :
                          c.status === 'DRAFT' ? 'bg-slate-100 text-slate-600' :
                          c.status === 'COMPLETED' ? 'bg-blue-50 text-blue-700' :
                          'bg-red-50 text-red-700'
                        }`}>
                          {c.status.charAt(0) + c.status.slice(1).toLowerCase()}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-sm text-slate-600 text-right">{c._count?.sentEmails || 0}</td>
                      <td className="py-3 text-sm text-slate-500 text-right">{new Date(c.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
