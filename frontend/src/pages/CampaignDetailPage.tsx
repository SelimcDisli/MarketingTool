import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '@/lib/api'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ArrowLeft, Play, Pause, Plus, Mail, Clock, Trash2, Variable, Eye } from 'lucide-react'
import { toast } from 'sonner'
import type { Campaign, CampaignStep, Lead } from '@/types'

export function CampaignDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [steps, setSteps] = useState<CampaignStep[]>([])
  const [loading, setLoading] = useState(true)
  const [editingStep, setEditingStep] = useState<string | null>(null)

  // Preview state
  const [showPreview, setShowPreview] = useState(false)
  const [previewStepId, setPreviewStepId] = useState<string | null>(null)
  const [campaignLeads, setCampaignLeads] = useState<Lead[]>([])
  const [selectedLeadId, setSelectedLeadId] = useState<string>('')

  useEffect(() => { loadCampaign() }, [id])

  async function loadCampaign() {
    try {
      const { data } = await api.get(`/campaigns/${id}`)
      setCampaign(data.campaign || data)
      setSteps(data.campaign?.steps || data.steps || [])
    } catch { toast.error('Campaign not found') }
    finally { setLoading(false) }
  }

  async function toggleStatus() {
    if (!campaign) return
    try {
      if (campaign.status === 'ACTIVE') {
        await api.post(`/campaigns/${id}/pause`)
        toast.success('Campaign paused')
      } else {
        await api.post(`/campaigns/${id}/start`)
        toast.success('Campaign started!')
      }
      loadCampaign()
    } catch (err: any) { toast.error(err.response?.data?.error || 'Failed') }
  }

  async function addStep() {
    try {
      await api.post(`/campaigns/${id}/steps`, {
        stepOrder: steps.length + 1,
        delayDays: steps.length === 0 ? 0 : 2,
        delayHours: 0,
        subject: '',
        body: '',
      })
      toast.success('Step added')
      loadCampaign()
    } catch (err: any) { toast.error(err.response?.data?.error || 'Failed to add step') }
  }

  async function updateStep(stepId: string, updates: Partial<CampaignStep>) {
    try {
      await api.patch(`/campaigns/${id}/steps/${stepId}`, updates)
      setSteps(prev => prev.map(s => s.id === stepId ? { ...s, ...updates } : s))
    } catch { }
  }

  async function deleteStep(stepId: string) {
    try {
      await api.delete(`/campaigns/${id}/steps/${stepId}`)
      toast.success('Step removed')
      loadCampaign()
    } catch { }
  }

  // Preview helpers
  async function openPreview(stepId: string) {
    setPreviewStepId(stepId)
    if (campaignLeads.length === 0) {
      try {
        const { data } = await api.get('/leads', { params: { limit: 100 } })
        const leads = data.leads || []
        setCampaignLeads(leads)
        if (leads.length > 0) setSelectedLeadId(leads[0].id)
      } catch { }
    }
    setShowPreview(true)
  }

  const previewStep = useMemo(() => steps.find(s => s.id === previewStepId), [steps, previewStepId])
  const selectedLead = useMemo(() => campaignLeads.find(l => l.id === selectedLeadId), [campaignLeads, selectedLeadId])

  function renderMergeTags(text: string, lead?: Lead): string {
    if (!text || !lead) return text || ''
    return text
      .replace(/\{\{firstName\}\}/g, lead.firstName || '')
      .replace(/\{\{lastName\}\}/g, lead.lastName || '')
      .replace(/\{\{company\}\}/g, lead.company || '')
      .replace(/\{\{email\}\}/g, lead.email || '')
      .replace(/\{\{jobTitle\}\}/g, lead.jobTitle || '')
      .replace(/\{\{phone\}\}/g, lead.phone || '')
      .replace(/\{\{website\}\}/g, lead.website || '')
  }

  const mergeTags = ['{{firstName}}', '{{lastName}}', '{{company}}', '{{email}}', '{{jobTitle}}']

  if (loading) return <div className="space-y-6"><Skeleton className="h-8 w-64" /><Skeleton className="h-96" /></div>

  if (!campaign) return null

  const statusColors: Record<string, string> = {
    DRAFT: 'secondary', ACTIVE: 'success', PAUSED: 'warning', COMPLETED: 'info', ERROR: 'error'
  }

  const sortedSteps = [...steps].sort((a, b) => a.stepOrder - b.stepOrder)

  return (
    <div className="space-y-6 animate-[fadeIn_0.3s_ease-out]">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/campaigns')} className="p-2 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer">
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{campaign.name}</h1>
            <Badge variant={statusColors[campaign.status] as any}>{campaign.status}</Badge>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">Created {new Date(campaign.createdAt).toLocaleDateString()}</p>
        </div>
        <Button variant={campaign.status === 'ACTIVE' ? 'outline' : 'default'} onClick={toggleStatus}>
          {campaign.status === 'ACTIVE' ? <><Pause className="w-4 h-4" /> Pause</> : <><Play className="w-4 h-4" /> Start</>}
        </Button>
      </div>

      <Tabs defaultValue="sequences">
        <TabsList>
          <TabsTrigger value="sequences">Sequences</TabsTrigger>
          <TabsTrigger value="leads">Leads</TabsTrigger>
          <TabsTrigger value="options">Options</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="sequences">
          <div className="space-y-0">
            {sortedSteps.length === 0 ? (
              <EmptyState
                icon={Mail}
                title="No steps yet"
                description="Add your first email step to build your sequence."
                action={{ label: 'Add First Step', onClick: addStep }}
              />
            ) : (
              sortedSteps.map((step, idx) => (
                <div key={step.id}>
                  {/* Delay Connector Between Steps */}
                  {idx > 0 && (
                    <div className="flex items-center gap-3 py-3 pl-9">
                      <div className="flex flex-col items-center">
                        <div className="w-0.5 h-4 bg-slate-200" />
                        <div className="w-8 h-8 rounded-full bg-amber-50 border-2 border-amber-200 flex items-center justify-center">
                          <Clock className="w-3.5 h-3.5 text-amber-600" />
                        </div>
                        <div className="w-0.5 h-4 bg-slate-200" />
                      </div>
                      <div className="flex items-center gap-3 bg-amber-50/60 px-4 py-2 rounded-lg border border-amber-100">
                        <span className="text-xs font-medium text-amber-700">Wait</span>
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="number" min={0} className="w-16 h-7 text-xs text-center"
                            value={step.delayDays}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 0
                              setSteps(prev => prev.map(s => s.id === step.id ? { ...s, delayDays: val } : s))
                            }}
                            onBlur={() => updateStep(step.id, { delayDays: step.delayDays })}
                          />
                          <span className="text-xs text-amber-600">days</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="number" min={0} max={23} className="w-16 h-7 text-xs text-center"
                            value={step.delayHours}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 0
                              setSteps(prev => prev.map(s => s.id === step.id ? { ...s, delayHours: val } : s))
                            }}
                            onBlur={() => updateStep(step.id, { delayHours: step.delayHours })}
                          />
                          <span className="text-xs text-amber-600">hours</span>
                        </div>
                        <span className="text-xs text-amber-500 ml-1">after previous step</span>
                      </div>
                    </div>
                  )}

                  {/* Step Card */}
                  <Card className="relative group">
                    <CardContent className="p-5">
                      <div className="flex items-start gap-4">
                        {/* Step Number */}
                        <div className="flex flex-col items-center">
                          <div className="w-10 h-10 rounded-full bg-primary-50 border-2 border-primary-200 flex items-center justify-center">
                            <span className="text-sm font-bold text-primary-700">{idx + 1}</span>
                          </div>
                        </div>

                        {/* Step Content */}
                        <div className="flex-1 space-y-3">
                          {/* Subject */}
                          <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">Subject</label>
                            <Input
                              placeholder="Email subject line..."
                              value={step.subject}
                              onChange={(e) => {
                                setSteps(prev => prev.map(s => s.id === step.id ? { ...s, subject: e.target.value } : s))
                              }}
                              onBlur={() => updateStep(step.id, { subject: step.subject })}
                            />
                          </div>

                          {/* Merge Tags */}
                          <div className="flex flex-wrap gap-1.5">
                            {mergeTags.map(tag => (
                              <button
                                key={tag}
                                onClick={() => {
                                  setSteps(prev => prev.map(s => s.id === step.id ? { ...s, body: (s.body || '') + ' ' + tag } : s))
                                }}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary-50 text-primary-700 text-xs font-medium hover:bg-primary-100 transition-colors cursor-pointer"
                              >
                                <Variable className="w-3 h-3" />{tag}
                              </button>
                            ))}
                          </div>

                          {/* Body */}
                          <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">Body</label>
                            <textarea
                              placeholder="Write your email body... Use merge tags like {{firstName}} for personalization."
                              value={step.body}
                              onChange={(e) => {
                                setSteps(prev => prev.map(s => s.id === step.id ? { ...s, body: e.target.value } : s))
                              }}
                              onBlur={() => updateStep(step.id, { body: step.body })}
                              rows={5}
                              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm transition-colors placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:border-primary-500 resize-none"
                            />
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={() => openPreview(step.id)}
                            title="Preview email"
                            className="p-2 rounded-lg text-slate-400 hover:text-primary-600 hover:bg-primary-50 transition-all cursor-pointer"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => deleteStep(step.id)}
                            className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ))
            )}

            <Button variant="outline" onClick={addStep} className="w-full border-dashed mt-4">
              <Plus className="w-4 h-4" /> Add Step
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="leads">
          <Card>
            <CardContent className="p-6">
              <EmptyState icon={Mail} title="No leads assigned" description="Assign leads from your lead lists to this campaign." action={{ label: 'Add Leads', onClick: () => navigate('/leads') }} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="options">
          <Card>
            <CardHeader><CardTitle>Campaign Settings</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Timezone</label>
                  <Input value={campaign.scheduleTimezone} readOnly />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Daily Limit</label>
                  <Input type="number" value={campaign.dailyLimit} readOnly />
                </div>
              </div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={campaign.stopOnReply} readOnly className="rounded" />
                  Stop on Reply
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={campaign.trackOpens} readOnly className="rounded" />
                  Track Opens
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={campaign.trackClicks} readOnly className="rounded" />
                  Track Clicks
                </label>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics">
          <Card>
            <CardContent className="p-6">
              <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
                Campaign analytics will appear here once emails are sent.
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Email Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-primary-600" /> Email Preview
            </DialogTitle>
          </DialogHeader>
          {previewStep && (
            <div className="space-y-4 pt-2">
              {/* Lead Selector */}
              {campaignLeads.length > 0 ? (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Preview with lead</label>
                  <select
                    value={selectedLeadId}
                    onChange={(e) => setSelectedLeadId(e.target.value)}
                    className="w-full text-sm rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-700 outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    {campaignLeads.map(l => (
                      <option key={l.id} value={l.id}>
                        {l.email}{l.firstName ? ` — ${l.firstName} ${l.lastName || ''}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-600">
                  Import leads first to see merge tags replaced with real data.
                </div>
              )}

              {/* Email Render */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                {/* Email Header */}
                <div className="bg-slate-50 px-4 py-3 border-b border-slate-100 space-y-1">
                  <div className="flex gap-2 text-xs">
                    <span className="text-slate-400 w-10">From:</span>
                    <span className="text-slate-700 font-medium">you@company.com</span>
                  </div>
                  <div className="flex gap-2 text-xs">
                    <span className="text-slate-400 w-10">To:</span>
                    <span className="text-slate-700 font-medium">{selectedLead?.email || 'lead@example.com'}</span>
                  </div>
                </div>
                {/* Subject */}
                <div className="px-4 py-2 border-b border-slate-100">
                  <span className="text-sm font-semibold text-slate-800">
                    {renderMergeTags(previewStep.subject || '(no subject)', selectedLead)}
                  </span>
                </div>
                {/* Body */}
                <div className="px-4 py-4 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap min-h-[120px]">
                  {renderMergeTags(previewStep.body || '(no body)', selectedLead) || (
                    <span className="text-slate-400 italic">Empty email body</span>
                  )}
                </div>
              </div>

              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setShowPreview(false)}>Close</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
