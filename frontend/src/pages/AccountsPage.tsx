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
import { Plus, Mail, Shield, ShieldCheck, ShieldAlert, Flame, Activity, Trash2, CheckCircle, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import type { EmailAccount } from '@/types'

export function AccountsPage() {
  const [accounts, setAccounts] = useState<EmailAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [showConnect, setShowConnect] = useState(false)
  const [form, setForm] = useState({
    email: '', displayName: '',
    smtpHost: '', smtpPort: '587', smtpUser: '', smtpPass: '',
    imapHost: '', imapPort: '993', imapUser: '', imapPass: '',
  })
  const [connecting, setConnecting] = useState(false)

  useEffect(() => { loadAccounts() }, [])

  async function loadAccounts() {
    try {
      const { data } = await api.get('/accounts')
      setAccounts(data.accounts || data || [])
    } catch { } finally { setLoading(false) }
  }

  async function connectAccount() {
    setConnecting(true)
    try {
      await api.post('/accounts', {
        ...form,
        smtpPort: parseInt(form.smtpPort),
        imapPort: parseInt(form.imapPort),
        smtpUser: form.smtpUser || form.email,
        imapUser: form.imapUser || form.email,
      })
      toast.success('Account connected!')
      setShowConnect(false)
      setForm({ email: '', displayName: '', smtpHost: '', smtpPort: '587', smtpUser: '', smtpPass: '', imapHost: '', imapPort: '993', imapUser: '', imapPass: '' })
      loadAccounts()
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Connection failed')
    } finally { setConnecting(false) }
  }

  async function toggleWarmup(id: string, enabled: boolean, e: React.MouseEvent) {
    e.stopPropagation()
    try {
      await api.post(`/accounts/${id}/warmup`)
      toast.success(enabled ? 'Warmup disabled' : 'Warmup enabled')
      loadAccounts()
    } catch { toast.error('Failed') }
  }

  async function deleteAccount(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('Delete this account?')) return
    try {
      await api.delete(`/accounts/${id}`)
      toast.success('Account deleted')
      loadAccounts()
    } catch { toast.error('Failed') }
  }

  if (loading) return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48" />)}
      </div>
    </div>
  )

  return (
    <div className="space-y-6 animate-[fadeIn_0.3s_ease-out]">
      <PageHeader title="Email Accounts" description="Connect and manage your sending accounts">
        <Button onClick={() => setShowConnect(true)}>
          <Plus className="w-4 h-4" /> Connect Account
        </Button>
      </PageHeader>

      {accounts.length === 0 ? (
        <EmptyState icon={Mail} title="No accounts connected" description="Connect your first email account to start sending campaigns." action={{ label: 'Connect Account', onClick: () => setShowConnect(true) }} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((acc) => (
            <Card key={acc.id} className="group hover:shadow-md transition-all">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                      <Mail className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{acc.email}</p>
                      <p className="text-xs text-slate-400">{acc.displayName || acc.provider}</p>
                    </div>
                  </div>
                  <button onClick={(e) => deleteAccount(acc.id, e)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all cursor-pointer">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Health Score */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-slate-500">Health Score</span>
                    <span className="text-xs font-semibold text-slate-900">{acc.healthScore}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${acc.healthScore >= 80 ? 'bg-emerald-500' : acc.healthScore >= 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${acc.healthScore}%` }} />
                  </div>
                </div>

                {/* DNS Status */}
                <div className="flex items-center gap-3 mb-4">
                  {[
                    { label: 'SPF', valid: acc.spfValid },
                    { label: 'DKIM', valid: acc.dkimValid },
                    { label: 'DMARC', valid: acc.dmarcValid },
                  ].map((dns) => (
                    <div key={dns.label} className="flex items-center gap-1">
                      {dns.valid ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> : <XCircle className="w-3.5 h-3.5 text-red-400" />}
                      <span className="text-xs text-slate-600">{dns.label}</span>
                    </div>
                  ))}
                </div>

                {/* Stats */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  <div className="flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs text-slate-500">{acc.sentToday}/{acc.dailyLimit} today</span>
                  </div>
                  <button
                    onClick={(e) => toggleWarmup(acc.id, acc.warmupEnabled, e)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
                      acc.warmupEnabled ? 'bg-orange-50 text-orange-600' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    <Flame className="w-3 h-3" />
                    {acc.warmupEnabled ? 'Warming' : 'Warmup'}
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Connect Dialog */}
      <Dialog open={showConnect} onOpenChange={setShowConnect}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Connect Email Account</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <Input placeholder="you@domain.com" value={form.email} onChange={(e) => setForm({...form, email: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Display Name</label>
                <Input placeholder="John Doe" value={form.displayName} onChange={(e) => setForm({...form, displayName: e.target.value})} />
              </div>
            </div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">SMTP Settings</p>
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="SMTP Host" value={form.smtpHost} onChange={(e) => setForm({...form, smtpHost: e.target.value})} />
              <Input placeholder="Port" type="number" value={form.smtpPort} onChange={(e) => setForm({...form, smtpPort: e.target.value})} />
              <Input placeholder="Username (optional)" value={form.smtpUser} onChange={(e) => setForm({...form, smtpUser: e.target.value})} />
              <Input placeholder="Password" type="password" value={form.smtpPass} onChange={(e) => setForm({...form, smtpPass: e.target.value})} />
            </div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">IMAP Settings</p>
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="IMAP Host" value={form.imapHost} onChange={(e) => setForm({...form, imapHost: e.target.value})} />
              <Input placeholder="Port" type="number" value={form.imapPort} onChange={(e) => setForm({...form, imapPort: e.target.value})} />
              <Input placeholder="Username (optional)" value={form.imapUser} onChange={(e) => setForm({...form, imapUser: e.target.value})} />
              <Input placeholder="Password" type="password" value={form.imapPass} onChange={(e) => setForm({...form, imapPass: e.target.value})} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowConnect(false)}>Cancel</Button>
              <Button onClick={connectAccount} disabled={connecting || !form.email || !form.smtpHost}>
                {connecting ? 'Connecting...' : 'Connect Account'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
