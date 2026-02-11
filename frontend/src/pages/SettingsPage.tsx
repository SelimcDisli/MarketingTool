import { useState, useEffect } from 'react'
import api from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { User, Building2, Users, Key, Shield, Copy, Check, Plus, Trash2, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { cn, getInitials } from '@/lib/utils'
import type { WorkspaceMember } from '@/types'

export function SettingsPage() {
    const { user, currentWorkspace } = useAuth()
    const [members, setMembers] = useState<WorkspaceMember[]>([])
    const [loading, setLoading] = useState(true)
    const [showInvite, setShowInvite] = useState(false)
    const [inviteEmail, setInviteEmail] = useState('')
    const [inviteRole, setInviteRole] = useState('EDITOR')
    const [inviting, setInviting] = useState(false)

    // Profile form
    const [profile, setProfile] = useState({
        firstName: user?.firstName || '',
        lastName: user?.lastName || '',
        email: user?.email || '',
    })

    // Workspace form
    const [workspaceName, setWorkspaceName] = useState(currentWorkspace?.name || '')

    // API Key
    const [apiKey, setApiKey] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)

    useEffect(() => {
        loadMembers()
    }, [])

    async function loadMembers() {
        try {
            const { data } = await api.get('/workspace/members')
            setMembers(data.members || data || [])
        } catch { } finally { setLoading(false) }
    }

    async function updateWorkspace() {
        try {
            await api.patch('/workspace', { name: workspaceName })
            toast.success('Workspace updated!')
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to update')
        }
    }

    async function inviteMember() {
        if (!inviteEmail) return
        setInviting(true)
        try {
            await api.post('/workspace/members', { email: inviteEmail, role: inviteRole })
            toast.success('Invitation sent!')
            setShowInvite(false)
            setInviteEmail('')
            loadMembers()
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to invite')
        } finally { setInviting(false) }
    }

    async function removeMember(memberId: string) {
        if (!confirm('Remove this team member?')) return
        try {
            await api.delete(`/workspace/members/${memberId}`)
            toast.success('Member removed')
            loadMembers()
        } catch { toast.error('Failed to remove member') }
    }

    async function generateApiKey() {
        try {
            const { data } = await api.post('/workspace/api-key')
            setApiKey(data.apiKey || data.key)
            toast.success('API key generated!')
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to generate key')
        }
    }

    function copyApiKey() {
        if (!apiKey) return
        navigator.clipboard.writeText(apiKey)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
        toast.success('Copied to clipboard!')
    }

    const roleColors: Record<string, string> = {
        OWNER: 'bg-amber-50 text-amber-700',
        ADMIN: 'bg-purple-50 text-purple-700',
        EDITOR: 'bg-blue-50 text-blue-700',
        VIEWER: 'bg-slate-100 text-slate-600',
    }

    return (
        <div className="space-y-6 animate-[fadeIn_0.3s_ease-out]">
            <PageHeader title="Settings" description="Manage your account and workspace" />

            <Tabs defaultValue="profile">
                <TabsList>
                    <TabsTrigger value="profile"><User className="w-4 h-4" /> Profile</TabsTrigger>
                    <TabsTrigger value="workspace"><Building2 className="w-4 h-4" /> Workspace</TabsTrigger>
                    <TabsTrigger value="team"><Users className="w-4 h-4" /> Team</TabsTrigger>
                    <TabsTrigger value="api"><Key className="w-4 h-4" /> API</TabsTrigger>
                </TabsList>

                {/* Profile Tab */}
                <TabsContent value="profile">
                    <Card>
                        <CardHeader><CardTitle>Profile Information</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center gap-4 mb-6">
                                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-400 to-purple-500 flex items-center justify-center">
                                    <span className="text-xl font-bold text-white">
                                        {user ? getInitials(`${user.firstName} ${user.lastName}`) : '?'}
                                    </span>
                                </div>
                                <div>
                                    <p className="text-lg font-semibold text-slate-900">{user?.firstName} {user?.lastName}</p>
                                    <p className="text-sm text-slate-500">{user?.email}</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1.5">First Name</label>
                                    <Input value={profile.firstName} onChange={(e) => setProfile({ ...profile, firstName: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Last Name</label>
                                    <Input value={profile.lastName} onChange={(e) => setProfile({ ...profile, lastName: e.target.value })} />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                                <Input value={profile.email} disabled className="bg-slate-50" />
                            </div>
                            <div className="flex justify-end pt-2">
                                <Button onClick={() => toast.success('Profile saved!')}>Save Changes</Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Workspace Tab */}
                <TabsContent value="workspace">
                    <Card>
                        <CardHeader><CardTitle>Workspace Settings</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Workspace Name</label>
                                <Input value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Workspace ID</label>
                                <Input value={currentWorkspace?.id || ''} disabled className="bg-slate-50 font-mono text-xs" />
                            </div>
                            <div className="flex justify-end pt-2">
                                <Button onClick={updateWorkspace}>Save Workspace</Button>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="mt-4">
                        <CardHeader><CardTitle className="text-red-600">Danger Zone</CardTitle></CardHeader>
                        <CardContent>
                            <div className="flex items-center justify-between p-4 rounded-xl border border-red-200 bg-red-50/50">
                                <div>
                                    <p className="text-sm font-medium text-slate-900">Delete Workspace</p>
                                    <p className="text-xs text-slate-500">Permanently delete this workspace and all its data.</p>
                                </div>
                                <Button variant="outline" className="border-red-300 text-red-600 hover:bg-red-50">Delete</Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Team Tab */}
                <TabsContent value="team">
                    <Card>
                        <CardHeader className="flex-row items-center justify-between">
                            <CardTitle>Team Members</CardTitle>
                            <Button onClick={() => setShowInvite(true)} size="sm">
                                <Plus className="w-4 h-4" /> Invite Member
                            </Button>
                        </CardHeader>
                        <CardContent>
                            {loading ? (
                                Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 mb-2" />)
                            ) : members.length === 0 ? (
                                <div className="text-center py-8">
                                    <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                                    <p className="text-sm text-slate-400">No team members yet</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {members.map((member) => (
                                        <div key={member.id} className="flex items-center gap-4 p-3 rounded-xl hover:bg-slate-50 transition-colors group">
                                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-400 to-purple-500 flex items-center justify-center flex-shrink-0">
                                                <span className="text-xs font-bold text-white">
                                                    {getInitials(`${member.user.firstName} ${member.user.lastName}`)}
                                                </span>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-slate-900">
                                                    {member.user.firstName} {member.user.lastName}
                                                </p>
                                                <p className="text-xs text-slate-400">{member.user.email}</p>
                                            </div>
                                            <span className={cn("text-xs font-medium px-2.5 py-1 rounded-full", roleColors[member.role] || roleColors.VIEWER)}>
                                                {member.role}
                                            </span>
                                            {member.role !== 'OWNER' && (
                                                <button
                                                    onClick={() => removeMember(member.id)}
                                                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* API Tab */}
                <TabsContent value="api">
                    <Card>
                        <CardHeader><CardTitle>API Keys</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                            <p className="text-sm text-slate-500">
                                Use API keys to authenticate requests from external services. Keep your keys secure and never share them publicly.
                            </p>
                            {apiKey ? (
                                <div className="flex items-center gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
                                    <Key className="w-5 h-5 text-slate-400 flex-shrink-0" />
                                    <code className="flex-1 text-sm font-mono text-slate-800 truncate">{apiKey}</code>
                                    <button
                                        onClick={copyApiKey}
                                        className="p-2 rounded-lg hover:bg-white transition-colors cursor-pointer"
                                    >
                                        {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4 text-slate-400" />}
                                    </button>
                                </div>
                            ) : (
                                <div className="p-8 rounded-xl border-2 border-dashed border-slate-200 text-center">
                                    <Shield className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                                    <p className="text-sm text-slate-500 mb-4">No API key generated yet</p>
                                    <Button onClick={generateApiKey} variant="outline">
                                        <Key className="w-4 h-4" /> Generate API Key
                                    </Button>
                                </div>
                            )}
                            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
                                <div className="flex items-start gap-3">
                                    <Shield className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                                    <div>
                                        <p className="text-sm font-medium text-amber-800">Security Notice</p>
                                        <p className="text-xs text-amber-700 mt-1">
                                            API keys provide full access to your workspace data. Store them securely and rotate them regularly.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Invite Dialog */}
            <Dialog open={showInvite} onOpenChange={setShowInvite}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Invite Team Member</DialogTitle></DialogHeader>
                    <div className="space-y-4 pt-2">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">Email Address</label>
                            <Input
                                type="email"
                                placeholder="colleague@company.com"
                                value={inviteEmail}
                                onChange={(e) => setInviteEmail(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">Role</label>
                            <select
                                value={inviteRole}
                                onChange={(e) => setInviteRole(e.target.value)}
                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 cursor-pointer"
                            >
                                <option value="ADMIN">Admin — Full access</option>
                                <option value="EDITOR">Editor — Can edit campaigns & leads</option>
                                <option value="VIEWER">Viewer — Read-only access</option>
                            </select>
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setShowInvite(false)}>Cancel</Button>
                            <Button onClick={inviteMember} disabled={inviting || !inviteEmail}>
                                {inviting ? 'Sending...' : 'Send Invitation'}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
