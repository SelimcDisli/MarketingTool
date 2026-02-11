import { useState, useEffect } from 'react'
import api from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Inbox, Send, Star, Clock, ThumbsUp, ThumbsDown, CalendarCheck, Briefcase, X, MessageSquare, ChevronDown } from 'lucide-react'
import { cn, timeAgo, getInitials } from '@/lib/utils'
import { toast } from 'sonner'
import type { Thread, ThreadMessage } from '@/types'

const filters = [
  { key: 'all', label: 'All', icon: Inbox },
  { key: 'unread', label: 'Unread', icon: Star },
  { key: 'INTERESTED', label: 'Interested', icon: ThumbsUp },
  { key: 'MEETING_BOOKED', label: 'Meeting', icon: CalendarCheck },
  { key: 'NOT_INTERESTED', label: 'Not Interested', icon: ThumbsDown },
  { key: 'OUT_OF_OFFICE', label: 'OOO', icon: Clock },
]

const tagColors: Record<string, string> = {
  INTERESTED: 'bg-emerald-50 text-emerald-700',
  NOT_INTERESTED: 'bg-red-50 text-red-700',
  MEETING_BOOKED: 'bg-blue-50 text-blue-700',
  OUT_OF_OFFICE: 'bg-amber-50 text-amber-700',
  CLOSED: 'bg-slate-100 text-slate-600',
  OBJECTION: 'bg-purple-50 text-purple-700',
}

export function UniboxPage() {
  const [threads, setThreads] = useState<Thread[]>([])
  const [activeThread, setActiveThread] = useState<Thread | null>(null)
  const [activeFilter, setActiveFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [stats, setStats] = useState<any>(null)

  useEffect(() => { loadThreads(); loadStats() }, [activeFilter])

  async function loadThreads() {
    setLoading(true)
    try {
      const params: any = {}
      if (activeFilter !== 'all' && activeFilter !== 'unread') params.tag = activeFilter
      if (activeFilter === 'unread') params.unread = true
      const { data } = await api.get('/unibox/threads', { params })
      setThreads(data.threads || data || [])
    } catch { } finally { setLoading(false) }
  }

  async function loadStats() {
    try {
      const { data } = await api.get('/unibox/stats')
      setStats(data)
    } catch { }
  }

  async function selectThread(thread: Thread) {
    setActiveThread(thread)
    try {
      const { data } = await api.get(`/unibox/threads/${thread.id}`)
      setActiveThread(data.thread || data)
    } catch { }
  }

  async function sendReply() {
    if (!replyText.trim() || !activeThread) return
    setSending(true)
    try {
      await api.post(`/unibox/threads/${activeThread.id}/reply`, { body: replyText })
      toast.success('Reply sent!')
      setReplyText('')
      selectThread(activeThread)
      loadThreads()
    } catch (err: any) { toast.error(err.response?.data?.error || 'Failed to send') }
    finally { setSending(false) }
  }

  async function tagThread(threadId: string, tag: string) {
    try {
      await api.patch(`/unibox/threads/${threadId}/tag`, { tag })
      toast.success('Tag updated')
      loadThreads()
      if (activeThread?.id === threadId) {
        setActiveThread(prev => prev ? { ...prev, tag } : prev)
      }
    } catch { }
  }

  return (
    <div className="h-[calc(100vh-48px)] flex flex-col animate-[fadeIn_0.3s_ease-out] -m-6">
      {/* Stats Bar */}
      <div className="flex items-center gap-6 px-6 py-3 bg-white border-b border-slate-200/60">
        <h1 className="text-lg font-bold text-slate-900">Inbox</h1>
        {stats && (
          <div className="flex items-center gap-4 ml-auto">
            {[
              { label: 'Total', value: stats.total || 0 },
              { label: 'Unread', value: stats.unread || 0, highlight: true },
              { label: 'Interested', value: stats.interested || 0 },
              { label: 'Meetings', value: stats.meetingBooked || 0 },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-1.5">
                <span className={cn("text-sm font-bold", s.highlight ? 'text-primary-600' : 'text-slate-900')}>{s.value}</span>
                <span className="text-xs text-slate-400">{s.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Thread List */}
        <div className="w-[380px] flex-shrink-0 border-r border-slate-200/60 bg-white flex flex-col">
          {/* Filters */}
          <div className="flex items-center gap-1.5 p-3 overflow-x-auto">
            {filters.map(f => (
              <button
                key={f.key}
                onClick={() => setActiveFilter(f.key)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer",
                  activeFilter === f.key ? 'bg-primary-50 text-primary-700' : 'text-slate-500 hover:bg-slate-50'
                )}
              >
                <f.icon className="w-3.5 h-3.5" />
                {f.label}
              </button>
            ))}
          </div>

          {/* Thread Items */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="p-4 border-b border-slate-50"><Skeleton className="h-12" /></div>
              ))
            ) : threads.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-6">
                <Inbox className="w-10 h-10 text-slate-300 mb-3" />
                <p className="text-sm text-slate-400">No conversations</p>
              </div>
            ) : (
              threads.map(thread => (
                <button
                  key={thread.id}
                  onClick={() => selectThread(thread)}
                  className={cn(
                    "w-full text-left p-4 border-b border-slate-50 hover:bg-slate-50/50 transition-colors cursor-pointer",
                    activeThread?.id === thread.id && "bg-primary-50/30 border-l-2 border-l-primary-500",
                    !thread.isRead && "bg-blue-50/30"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-slate-600">
                        {getInitials(thread.lead?.firstName ? `${thread.lead.firstName} ${thread.lead.lastName}` : thread.lead?.email || '?')}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className={cn("text-sm truncate", !thread.isRead ? "font-semibold text-slate-900" : "font-medium text-slate-700")}>
                          {thread.lead?.firstName ? `${thread.lead.firstName} ${thread.lead.lastName}` : thread.lead?.email}
                        </span>
                        <span className="text-[10px] text-slate-400 ml-2 flex-shrink-0">{timeAgo(thread.lastMessageAt)}</span>
                      </div>
                      <p className="text-xs text-slate-500 truncate">{thread.subject}</p>
                      {thread.tag && (
                        <span className={cn("inline-block mt-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full", tagColors[thread.tag] || 'bg-slate-100 text-slate-600')}>
                          {thread.tag.replace('_', ' ')}
                        </span>
                      )}
                    </div>
                    {!thread.isRead && <div className="w-2 h-2 rounded-full bg-primary-500 mt-2 flex-shrink-0" />}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Thread Detail */}
        <div className="flex-1 flex flex-col bg-slate-50/50">
          {activeThread ? (
            <>
              {/* Thread Header */}
              <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200/60">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">{activeThread.subject}</h2>
                  <p className="text-xs text-slate-400">{activeThread.lead?.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={activeThread.tag || ''}
                    onChange={(e) => tagThread(activeThread.id, e.target.value)}
                    className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-600 cursor-pointer"
                  >
                    <option value="">No Tag</option>
                    <option value="INTERESTED">Interested</option>
                    <option value="NOT_INTERESTED">Not Interested</option>
                    <option value="MEETING_BOOKED">Meeting Booked</option>
                    <option value="OUT_OF_OFFICE">Out of Office</option>
                    <option value="OBJECTION">Objection</option>
                    <option value="CLOSED">Closed</option>
                  </select>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {(activeThread.messages || []).map(msg => (
                  <div key={msg.id} className={cn("flex", msg.direction === 'OUTBOUND' ? 'justify-end' : 'justify-start')}>
                    <div className={cn(
                      "max-w-[70%] rounded-2xl px-4 py-3 shadow-sm",
                      msg.direction === 'OUTBOUND'
                        ? 'bg-primary-600 text-white rounded-br-md'
                        : 'bg-white text-slate-900 border border-slate-200/60 rounded-bl-md'
                    )}>
                      <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
                      <p className={cn("text-[10px] mt-2", msg.direction === 'OUTBOUND' ? 'text-primary-200' : 'text-slate-400')}>
                        {new Date(msg.sentAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Reply Composer */}
              <div className="p-4 bg-white border-t border-slate-200/60">
                <div className="flex items-end gap-3">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Type your reply..."
                    rows={2}
                    className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 resize-none"
                    onKeyDown={(e) => { if (e.key === 'Enter' && e.metaKey) sendReply() }}
                  />
                  <Button onClick={sendReply} disabled={sending || !replyText.trim()} size="lg" className="h-11">
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5">Press Cmd+Enter to send</p>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageSquare className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-sm text-slate-400">Select a conversation to view</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
