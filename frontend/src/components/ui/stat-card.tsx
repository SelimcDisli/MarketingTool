import { cn } from "@/lib/utils"
import type { LucideIcon } from 'lucide-react'

interface StatCardProps {
  label: string
  value: string | number
  change?: string
  changeType?: 'positive' | 'negative' | 'neutral'
  icon: LucideIcon
  iconColor?: string
}

export function StatCard({ label, value, change, changeType = 'neutral', icon: Icon, iconColor = 'text-primary-600 bg-primary-50' }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200/60 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="text-2xl font-bold text-slate-900 tracking-tight">{value}</p>
          {change && (
            <p className={cn("text-xs font-medium", {
              'text-emerald-600': changeType === 'positive',
              'text-red-500': changeType === 'negative',
              'text-slate-500': changeType === 'neutral',
            })}>
              {change}
            </p>
          )}
        </div>
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", iconColor)}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  )
}
