import { useState, useEffect } from 'react'
import api from '@/lib/api'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plus, Kanban, DollarSign, GripVertical, ArrowRight } from 'lucide-react'
import { cn, formatNumber } from '@/lib/utils'
import { toast } from 'sonner'
import type { CrmPipeline, CrmStage, CrmDeal } from '@/types'

export function CrmPage() {
  const [pipelines, setPipelines] = useState<CrmPipeline[]>([])
  const [activePipeline, setActivePipeline] = useState<CrmPipeline | null>(null)
  const [stages, setStages] = useState<CrmStage[]>([])
  const [deals, setDeals] = useState<CrmDeal[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newDeal, setNewDeal] = useState({ title: '', value: '' })
  const [dragDeal, setDragDeal] = useState<string | null>(null)

  useEffect(() => { loadPipelines() }, [])

  async function loadPipelines() {
    try {
      const { data } = await api.get('/crm/pipelines')
      const pipes = data.pipelines || data || []
      setPipelines(pipes)
      if (pipes.length > 0) {
        setActivePipeline(pipes[0])
        loadDeals(pipes[0].id)
        if (pipes[0].stages) setStages(pipes[0].stages)
      }
    } catch { } finally { setLoading(false) }
  }

  async function loadDeals(pipelineId: string) {
    try {
      const { data } = await api.get(`/crm/deals?pipelineId=${pipelineId}`)
      setDeals(data.deals || data || [])
      // also load stages
      const pipeData = await api.get(`/crm/pipelines/${pipelineId}`).catch(() => null)
      if (pipeData?.data) {
        const p = pipeData.data.pipeline || pipeData.data
        if (p.stages) setStages(p.stages)
      }
    } catch { }
  }

  async function createDeal() {
    if (!newDeal.title || !activePipeline || !stages.length) return
    try {
      await api.post('/crm/deals', {
        title: newDeal.title,
        value: parseFloat(newDeal.value) || 0,
        pipelineId: activePipeline.id,
        stageId: stages[0]?.id,
      })
      toast.success('Deal created!')
      setShowCreate(false)
      setNewDeal({ title: '', value: '' })
      loadDeals(activePipeline.id)
    } catch (err: any) { toast.error(err.response?.data?.error || 'Failed') }
  }

  async function moveDeal(dealId: string, newStageId: string) {
    try {
      await api.patch(`/crm/deals/${dealId}`, { stageId: newStageId })
      if (activePipeline) loadDeals(activePipeline.id)
    } catch { }
  }

  function handleDragStart(dealId: string) {
    setDragDeal(dealId)
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
  }

  function handleDrop(stageId: string) {
    if (dragDeal) {
      moveDeal(dragDeal, stageId)
      setDragDeal(null)
    }
  }

  const totalValue = deals.reduce((sum, d) => sum + (d.value || 0), 0)
  const sortedStages = [...stages].sort((a, b) => a.stageOrder - b.stageOrder)

  if (loading) return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="flex gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-96 w-72" />)}</div>
    </div>
  )

  return (
    <div className="space-y-6 animate-[fadeIn_0.3s_ease-out]">
      <PageHeader title="CRM Pipeline" description={activePipeline?.name || 'Manage your deals'}>
        <div className="flex items-center gap-3">
          {pipelines.length > 1 && (
            <select
              value={activePipeline?.id}
              onChange={(e) => {
                const p = pipelines.find(p => p.id === e.target.value)
                if (p) { setActivePipeline(p); loadDeals(p.id) }
              }}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white cursor-pointer"
            >
              {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4" /> New Deal</Button>
        </div>
      </PageHeader>

      {/* Metrics */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl border border-slate-200/60 shadow-sm">
          <DollarSign className="w-4 h-4 text-emerald-500" />
          <span className="text-sm font-semibold text-slate-900">${formatNumber(totalValue)}</span>
          <span className="text-xs text-slate-400">pipeline value</span>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl border border-slate-200/60 shadow-sm">
          <Kanban className="w-4 h-4 text-primary-500" />
          <span className="text-sm font-semibold text-slate-900">{deals.length}</span>
          <span className="text-xs text-slate-400">deals</span>
        </div>
      </div>

      {/* Kanban Board */}
      {sortedStages.length === 0 ? (
        <EmptyState icon={Kanban} title="No pipeline stages" description="Create a pipeline to start managing deals." />
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {sortedStages.map(stage => {
            const stageDeals = deals.filter(d => d.stageId === stage.id)
            return (
              <div
                key={stage.id}
                className="w-72 flex-shrink-0"
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(stage.id)}
              >
                {/* Stage Header */}
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stage.color || '#6366f1' }} />
                    <span className="text-sm font-semibold text-slate-900">{stage.name}</span>
                  </div>
                  <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{stageDeals.length}</span>
                </div>

                {/* Stage Column */}
                <div className="bg-slate-100/50 rounded-xl p-2 min-h-[400px] space-y-2">
                  {stageDeals.map(deal => (
                    <div
                      key={deal.id}
                      draggable
                      onDragStart={() => handleDragStart(deal.id)}
                      className={cn(
                        "bg-white rounded-xl p-3.5 border border-slate-200/60 shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md transition-all",
                        dragDeal === deal.id && "opacity-50"
                      )}
                    >
                      <p className="text-sm font-medium text-slate-900 mb-1">{deal.title}</p>
                      {deal.lead && (
                        <p className="text-xs text-slate-400 mb-2">{deal.lead.email}</p>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-emerald-600">${formatNumber(deal.value || 0)}</span>
                        <span className="text-[10px] text-slate-400">
                          {Math.floor((Date.now() - new Date(deal.createdAt).getTime()) / 86400000)}d
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create Deal Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Deal</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
              <Input placeholder="Deal title" value={newDeal.title} onChange={(e) => setNewDeal({...newDeal, title: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Value ($)</label>
              <Input type="number" placeholder="0" value={newDeal.value} onChange={(e) => setNewDeal({...newDeal, value: e.target.value})} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={createDeal} disabled={!newDeal.title}>Create Deal</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
