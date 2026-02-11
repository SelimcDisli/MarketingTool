import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '@/lib/api'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plus, Send, Search, MoreHorizontal, Play, Pause } from 'lucide-react'
import { toast } from 'sonner'
import type { Campaign } from '@/types'

const statusFilters = ['ALL', 'DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED'] as const
const statusBadge: Record<string, { variant: 'default' | 'success' | 'warning' | 'error' | 'info' | 'secondary'; label: string }> = {
  DRAFT: { variant: 'secondary', label: 'Draft' },
  ACTIVE: { variant: 'success', label: 'Active' },
  PAUSED: { variant: 'warning', label: 'Paused' },
  COMPLETED: { variant: 'info', label: 'Completed' },
  ERROR: { variant: 'error', label: 'Error' },
}

export function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [filter, setFilter] = useState<string>('ALL')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const navigate = useNavigate()

  useEffect(() => { loadCampaigns() }, [])

  async function loadCampaigns() {
    try {
      const { data } = await api.get('/campaigns')
      setCampaigns(data.campaigns || [])
    } catch { } finally { setLoading(false) }
  }

  async function createCampaign() {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const { data } = await api.post('/campaigns', { name: newName })
      toast.success('Campaign created!')
      setShowCreate(false)
      setNewName('')
      navigate(`/campaigns/${data.campaign?.id || data.id}`)
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create campaign')
    } finally { setCreating(false) }
  }

  async function toggleCampaign(id: string, status: string, e: React.MouseEvent) {
    e.stopPropagation()
    try {
      if (status === 'ACTIVE') {
        await api.post(`/campaigns/${id}/pause`)
        toast.success('Campaign paused')
      } else {
        await api.post(`/campaigns/${id}/start`)
        toast.success('Campaign started')
      }
      loadCampaigns()
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Action failed')
    }
  }

  const filtered = campaigns.filter(c => {
    if (filter !== 'ALL' && c.status !== filter) return false
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  if (loading) return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
    </div>
  )

  return (
    <div className="space-y-6 animate-[fadeIn_0.3s_ease-out]">
      <PageHeader title="Campaigns" description="Manage your email sequences">
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4" /> New Campaign
        </Button>
      </PageHeader>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center bg-white rounded-xl border border-slate-200/60 p-1 shadow-sm">
          {statusFilters.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                filter === s ? 'bg-primary-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search campaigns..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Campaign List */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Send}
          title="No campaigns yet"
          description="Create your first email campaign to start reaching out to leads."
          action={{ label: 'Create Campaign', onClick: () => setShowCreate(true) }}
        />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="text-xs font-medium text-slate-500 bg-slate-50/50 border-b border-slate-100">
                <th className="text-left py-3 px-5">Campaign</th>
                <th className="text-left py-3 px-4">Status</th>
                <th className="text-center py-3 px-4">Steps</th>
                <th className="text-center py-3 px-4">Leads</th>
                <th className="text-center py-3 px-4">Sent</th>
                <th className="text-right py-3 px-5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const badge = statusBadge[c.status] || statusBadge.DRAFT
                return (
                  <tr
                    key={c.id}
                    onClick={() => navigate(`/campaigns/${c.id}`)}
                    className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 cursor-pointer transition-colors"
                  >
                    <td className="py-3.5 px-5">
                      <p className="text-sm font-medium text-slate-900">{c.name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">Created {new Date(c.createdAt).toLocaleDateString()}</p>
                    </td>
                    <td className="py-3.5 px-4">
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </td>
                    <td className="py-3.5 px-4 text-sm text-slate-600 text-center">{c._count?.steps || 0}</td>
                    <td className="py-3.5 px-4 text-sm text-slate-600 text-center">{c._count?.campaignLeads || 0}</td>
                    <td className="py-3.5 px-4 text-sm text-slate-600 text-center">{c._count?.sentEmails || 0}</td>
                    <td className="py-3.5 px-5 text-right">
                      <button
                        onClick={(e) => toggleCampaign(c.id, c.status, e)}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors cursor-pointer"
                      >
                        {c.status === 'ACTIVE' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Campaign</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Campaign Name</label>
              <Input
                placeholder="e.g. Q1 Cold Outreach"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createCampaign()}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={createCampaign} disabled={creating || !newName.trim()}>
                {creating ? 'Creating...' : 'Create Campaign'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
