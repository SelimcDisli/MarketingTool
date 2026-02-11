import { useState, useEffect } from 'react'
import api from '@/lib/api'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plus, FileText, Search, Star, Copy, Trash2, Pencil, Eye } from 'lucide-react'
import { cn, timeAgo } from '@/lib/utils'
import { toast } from 'sonner'
import type { EmailTemplate } from '@/types'

const categories = ['All', 'Cold Outreach', 'Follow-up', 'Nurture', 'Re-engagement', 'Other']

export function TemplatesPage() {
    const [templates, setTemplates] = useState<EmailTemplate[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [activeCategory, setActiveCategory] = useState('All')
    const [showCreate, setShowCreate] = useState(false)
    const [showPreview, setShowPreview] = useState<EmailTemplate | null>(null)
    const [editing, setEditing] = useState<EmailTemplate | null>(null)
    const [form, setForm] = useState({
        name: '',
        category: 'Cold Outreach',
        subject: '',
        body: '',
        isShared: false,
    })
    const [saving, setSaving] = useState(false)

    useEffect(() => { loadTemplates() }, [])

    async function loadTemplates() {
        try {
            const { data } = await api.get('/templates')
            setTemplates(data.templates || data || [])
        } catch { } finally { setLoading(false) }
    }

    async function saveTemplate() {
        if (!form.name || !form.subject) return
        setSaving(true)
        try {
            if (editing) {
                await api.patch(`/templates/${editing.id}`, form)
                toast.success('Template updated!')
            } else {
                await api.post('/templates', form)
                toast.success('Template created!')
            }
            setShowCreate(false)
            setEditing(null)
            setForm({ name: '', category: 'Cold Outreach', subject: '', body: '', isShared: false })
            loadTemplates()
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to save template')
        } finally { setSaving(false) }
    }

    async function deleteTemplate(id: string, e: React.MouseEvent) {
        e.stopPropagation()
        if (!confirm('Delete this template?')) return
        try {
            await api.delete(`/templates/${id}`)
            toast.success('Template deleted')
            loadTemplates()
        } catch { toast.error('Failed to delete') }
    }

    function openEdit(template: EmailTemplate) {
        setEditing(template)
        setForm({
            name: template.name,
            category: template.category,
            subject: template.subject,
            body: template.body,
            isShared: template.isShared,
        })
        setShowCreate(true)
    }

    function copyTemplate(template: EmailTemplate, e: React.MouseEvent) {
        e.stopPropagation()
        navigator.clipboard.writeText(`Subject: ${template.subject}\n\n${template.body}`)
        toast.success('Template copied to clipboard!')
    }

    const filtered = templates.filter(t => {
        if (activeCategory !== 'All' && t.category !== activeCategory) return false
        if (search && !t.name.toLowerCase().includes(search.toLowerCase()) && !t.subject.toLowerCase().includes(search.toLowerCase())) return false
        return true
    })

    const categoryColors: Record<string, string> = {
        'Cold Outreach': 'bg-blue-50 text-blue-700',
        'Follow-up': 'bg-emerald-50 text-emerald-700',
        'Nurture': 'bg-purple-50 text-purple-700',
        'Re-engagement': 'bg-amber-50 text-amber-700',
        'Other': 'bg-slate-100 text-slate-600',
    }

    if (loading) return (
        <div className="space-y-6">
            <Skeleton className="h-8 w-48" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48" />)}
            </div>
        </div>
    )

    return (
        <div className="space-y-6 animate-[fadeIn_0.3s_ease-out]">
            <PageHeader title="Templates" description={`${templates.length} email templates`}>
                <Button onClick={() => { setEditing(null); setForm({ name: '', category: 'Cold Outreach', subject: '', body: '', isShared: false }); setShowCreate(true) }}>
                    <Plus className="w-4 h-4" /> New Template
                </Button>
            </PageHeader>

            {/* Filters */}
            <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center bg-white rounded-xl border border-slate-200/60 p-1 shadow-sm">
                    {categories.map((cat) => (
                        <button
                            key={cat}
                            onClick={() => setActiveCategory(cat)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${activeCategory === cat ? 'bg-primary-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
                                }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
                <div className="relative flex-1 max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input placeholder="Search templates..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
                </div>
            </div>

            {/* Template Grid */}
            {filtered.length === 0 ? (
                <EmptyState
                    icon={FileText}
                    title="No templates yet"
                    description="Create reusable email templates to speed up your campaign building."
                    action={{ label: 'Create Template', onClick: () => setShowCreate(true) }}
                />
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filtered.map((template) => (
                        <Card
                            key={template.id}
                            className="group hover:shadow-md transition-all cursor-pointer"
                            onClick={() => setShowPreview(template)}
                        >
                            <CardContent className="p-5">
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-slate-900 truncate">{template.name}</p>
                                        <p className="text-xs text-slate-400 mt-0.5">{timeAgo(template.createdAt)}</p>
                                    </div>
                                    <div className="flex items-center gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={(e) => copyTemplate(template, e)} className="p-1.5 rounded-lg text-slate-400 hover:text-primary-600 hover:bg-primary-50 transition-all cursor-pointer">
                                            <Copy className="w-3.5 h-3.5" />
                                        </button>
                                        <button onClick={(e) => { e.stopPropagation(); openEdit(template) }} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all cursor-pointer">
                                            <Pencil className="w-3.5 h-3.5" />
                                        </button>
                                        <button onClick={(e) => deleteTemplate(template.id, e)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all cursor-pointer">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>

                                <div className="mb-3">
                                    <p className="text-xs font-medium text-slate-700 mb-1">Subject</p>
                                    <p className="text-sm text-slate-600 truncate">{template.subject || 'No subject'}</p>
                                </div>

                                <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed mb-3">
                                    {template.body || 'No body content'}
                                </p>

                                <div className="flex items-center gap-2">
                                    <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full", categoryColors[template.category] || categoryColors['Other'])}>
                                        {template.category}
                                    </span>
                                    {template.isShared && (
                                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary-50 text-primary-700">
                                            Shared
                                        </span>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Create/Edit Dialog */}
            <Dialog open={showCreate} onOpenChange={(open) => { setShowCreate(open); if (!open) setEditing(null) }}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{editing ? 'Edit Template' : 'Create Template'}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2 max-h-[60vh] overflow-y-auto">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Template Name</label>
                            <Input placeholder="e.g. Cold Outreach v1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                            <select
                                value={form.category}
                                onChange={(e) => setForm({ ...form, category: e.target.value })}
                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 cursor-pointer"
                            >
                                {categories.filter(c => c !== 'All').map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Subject Line</label>
                            <Input placeholder="Email subject..." value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Body</label>
                            <textarea
                                placeholder="Write your email template... Use merge tags like {{firstName}} for personalization."
                                value={form.body}
                                onChange={(e) => setForm({ ...form, body: e.target.value })}
                                rows={8}
                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 resize-none"
                            />
                        </div>
                        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                            <input type="checkbox" checked={form.isShared} onChange={(e) => setForm({ ...form, isShared: e.target.checked })} className="rounded" />
                            Share with team members
                        </label>
                        <div className="flex justify-end gap-2 pt-2">
                            <Button variant="outline" onClick={() => { setShowCreate(false); setEditing(null) }}>Cancel</Button>
                            <Button onClick={saveTemplate} disabled={saving || !form.name || !form.subject}>
                                {saving ? 'Saving...' : editing ? 'Update Template' : 'Create Template'}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Preview Dialog */}
            <Dialog open={!!showPreview} onOpenChange={() => setShowPreview(null)}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Eye className="w-5 h-5 text-slate-400" />
                            {showPreview?.name}
                        </DialogTitle>
                    </DialogHeader>
                    {showPreview && (
                        <div className="space-y-4 pt-2">
                            <div className="flex items-center gap-2">
                                <span className={cn("text-xs font-medium px-2.5 py-1 rounded-full", categoryColors[showPreview.category] || categoryColors['Other'])}>
                                    {showPreview.category}
                                </span>
                                {showPreview.isShared && (
                                    <Badge variant="info">Shared</Badge>
                                )}
                            </div>
                            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Subject</p>
                                <p className="text-sm text-slate-900">{showPreview.subject}</p>
                            </div>
                            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Body</p>
                                <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{showPreview.body}</p>
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                                <Button variant="outline" onClick={() => { openEdit(showPreview); setShowPreview(null) }}>
                                    <Pencil className="w-4 h-4" /> Edit
                                </Button>
                                <Button onClick={() => { copyTemplate(showPreview, { stopPropagation: () => { } } as any); setShowPreview(null) }}>
                                    <Copy className="w-4 h-4" /> Copy to Clipboard
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}
