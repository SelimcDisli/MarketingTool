import { useState, useEffect } from 'react'
import api from '@/lib/api'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CSVImportDialog } from '@/components/leads/CSVImportDialog'
import { Plus, Users, Upload, Download, Search, ChevronLeft, ChevronRight, List, X } from 'lucide-react'
import { toast } from 'sonner'
import type { Lead, LeadList } from '@/types'

const statusBadge: Record<string, { variant: 'success' | 'error' | 'warning' | 'info' | 'secondary'; label: string }> = {
  ACTIVE: { variant: 'success', label: 'Active' },
  BOUNCED: { variant: 'error', label: 'Bounced' },
  UNSUBSCRIBED: { variant: 'warning', label: 'Unsubscribed' },
  REPLIED: { variant: 'info', label: 'Replied' },
  COMPLETED: { variant: 'secondary', label: 'Completed' },
}

export function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [lists, setLists] = useState<LeadList[]>([])
  const [activeList, setActiveList] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showImport, setShowImport] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newLead, setNewLead] = useState({ email: '', firstName: '', lastName: '', company: '' })
  const [newListName, setNewListName] = useState('')
  const limit = 50

  useEffect(() => { loadLists() }, [])
  useEffect(() => { loadLeads() }, [page, activeList, search])

  async function loadLists() {
    try {
      const { data } = await api.get('/leads/lists/all')
      setLists(data.lists || data || [])
    } catch { }
  }

  async function loadLeads() {
    setLoading(true)
    try {
      const params: any = { page, limit }
      if (activeList) params.listId = activeList
      if (search) params.search = search
      const { data } = await api.get('/leads', { params })
      setLeads(data.leads || [])
      setTotal(data.total || 0)
    } catch { } finally { setLoading(false) }
  }

  async function createLead() {
    if (!newLead.email) return
    try {
      // find or create list
      let listId = activeList || lists[0]?.id
      if (newListName) {
        const { data } = await api.post('/leads/lists', { name: newListName })
        listId = data.list?.id || data.id
        await loadLists()
      }
      if (!listId) {
        const { data } = await api.post('/leads/lists', { name: 'Default List' })
        listId = data.list?.id || data.id
        await loadLists()
      }
      await api.post('/leads', { ...newLead, listId })
      toast.success('Lead created!')
      setShowCreate(false)
      setNewLead({ email: '', firstName: '', lastName: '', company: '' })
      loadLeads()
    } catch (err: any) { toast.error(err.response?.data?.error || 'Failed') }
  }

  function handleImportComplete() {
    loadLeads()
    loadLists()
  }

  async function exportCSV() {
    try {
      const params: any = {}
      if (activeList) params.listId = activeList
      const { data } = await api.get('/leads/export', { params, responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `leads_export_${Date.now()}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
      toast.success('Export downloaded!')
    } catch { toast.error('Export failed') }
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-6 animate-[fadeIn_0.3s_ease-out]">
      <PageHeader title="Leads" description={`${total} total leads`}>
        <Button variant="outline" onClick={exportCSV} disabled={total === 0}><Download className="w-4 h-4" /> Export CSV</Button>
        <Button variant="outline" onClick={() => setShowImport(true)}><Upload className="w-4 h-4" /> Import CSV</Button>
        <Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4" /> Add Lead</Button>
      </PageHeader>

      <div className="flex gap-6">
        {/* Sidebar - Lists */}
        <div className="w-56 flex-shrink-0 space-y-1">
          <button onClick={() => { setActiveList(null); setPage(1) }} className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${!activeList ? 'bg-primary-50 text-primary-700' : 'text-slate-600 hover:bg-slate-100'}`}>
            <Users className="w-4 h-4" /> All Leads
          </button>
          {lists.map(list => (
            <button key={list.id} onClick={() => { setActiveList(list.id); setPage(1) }} className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${activeList === list.id ? 'bg-primary-50 text-primary-700' : 'text-slate-600 hover:bg-slate-100'}`}>
              <span className="flex items-center gap-2 truncate"><List className="w-4 h-4" />{list.name}</span>
              <span className="text-xs text-slate-400">{list._count?.leads || 0}</span>
            </button>
          ))}
        </div>

        {/* Main Content */}
        <div className="flex-1 space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input placeholder="Search leads..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} className="pl-9" />
          </div>

          {loading ? (
            Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14" />)
          ) : leads.length === 0 ? (
            <EmptyState icon={Users} title="No leads found" description="Import a CSV or add leads manually." action={{ label: 'Import CSV', onClick: () => setShowImport(true) }} />
          ) : (
            <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="text-xs font-medium text-slate-500 bg-slate-50/50 border-b border-slate-100">
                    <th className="text-left py-3 px-5">Email</th>
                    <th className="text-left py-3 px-4">Name</th>
                    <th className="text-left py-3 px-4">Company</th>
                    <th className="text-left py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map(lead => {
                    const badge = statusBadge[lead.status] || statusBadge.ACTIVE
                    return (
                      <tr key={lead.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                        <td className="py-3 px-5 text-sm font-medium text-slate-900">{lead.email}</td>
                        <td className="py-3 px-4 text-sm text-slate-600">{lead.firstName} {lead.lastName}</td>
                        <td className="py-3 px-4 text-sm text-slate-600">{lead.company || '—'}</td>
                        <td className="py-3 px-4"><Badge variant={badge.variant}>{badge.label}</Badge></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100">
                  <span className="text-xs text-slate-500">Page {page} of {totalPages}</span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="w-4 h-4" /></Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Import Dialog */}
      <CSVImportDialog
        open={showImport}
        onOpenChange={setShowImport}
        activeListId={activeList}
        lists={lists}
        onImportComplete={handleImportComplete}
      />

      {/* Create Lead Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add New Lead</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <Input placeholder="Email *" type="email" value={newLead.email} onChange={(e) => setNewLead({ ...newLead, email: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="First Name" value={newLead.firstName} onChange={(e) => setNewLead({ ...newLead, firstName: e.target.value })} />
              <Input placeholder="Last Name" value={newLead.lastName} onChange={(e) => setNewLead({ ...newLead, lastName: e.target.value })} />
            </div>
            <Input placeholder="Company" value={newLead.company} onChange={(e) => setNewLead({ ...newLead, company: e.target.value })} />
            {!activeList && <Input placeholder="New List Name (optional)" value={newListName} onChange={(e) => setNewListName(e.target.value)} />}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={createLead} disabled={!newLead.email}>Add Lead</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
