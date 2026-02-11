import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Send,
  Users,
  Mail,
  Inbox,
  BarChart3,
  Kanban,
  FileText,
  Settings,
  LogOut,
  ChevronLeft,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { getInitials } from '@/lib/utils'
import { useState } from 'react'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Campaigns', href: '/campaigns', icon: Send },
  { name: 'Leads', href: '/leads', icon: Users },
  { name: 'Accounts', href: '/accounts', icon: Mail },
  { name: 'Unibox', href: '/unibox', icon: Inbox, badge: true },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'CRM', href: '/crm', icon: Kanban },
  { name: 'Templates', href: '/templates', icon: FileText },
]

export function Sidebar() {
  const { user, currentWorkspace, logout } = useAuth()
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()

  return (
    <aside className={cn(
      "fixed left-0 top-0 bottom-0 z-40 flex flex-col border-r border-white/5 transition-all duration-300",
      collapsed ? "w-[72px]" : "w-[240px]"
    )} style={{ background: 'linear-gradient(180deg, #0a0e1a 0%, #0f1629 100%)' }}>
      {/* Logo */}
      <div className="flex items-center h-16 px-4 border-b border-white/5">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center flex-shrink-0">
            <Zap className="w-4 h-4 text-white" />
          </div>
          {!collapsed && (
            <span className="text-white font-bold text-lg tracking-tight truncate">StreamLine</span>
          )}
        </div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "ml-auto p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-all cursor-pointer",
            collapsed && "ml-0 mt-2"
          )}
        >
          <ChevronLeft className={cn("w-4 h-4 transition-transform", collapsed && "rotate-180")} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = location.pathname === item.href || location.pathname.startsWith(item.href + '/')
          return (
            <NavLink
              key={item.name}
              to={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group relative",
                isActive
                  ? "bg-white/10 text-white shadow-sm"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              )}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-primary-500 rounded-r-full" />
              )}
              <item.icon className={cn("w-5 h-5 flex-shrink-0", isActive ? "text-primary-400" : "text-slate-500 group-hover:text-slate-300")} />
              {!collapsed && (
                <>
                  <span className="truncate">{item.name}</span>
                  {item.badge && (
                    <span className="ml-auto bg-primary-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                      3
                    </span>
                  )}
                </>
              )}
            </NavLink>
          )
        })}
      </nav>

      {/* Bottom section */}
      <div className="border-t border-white/5 p-3 space-y-1">
        <NavLink
          to="/settings"
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-slate-400 hover:text-white hover:bg-white/5",
            location.pathname.startsWith('/settings') && "bg-white/10 text-white"
          )}
        >
          <Settings className="w-5 h-5 flex-shrink-0 text-slate-500" />
          {!collapsed && <span>Settings</span>}
        </NavLink>

        {/* User */}
        <div className={cn("flex items-center gap-3 px-3 py-2.5 rounded-xl", collapsed && "justify-center")}>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-purple-500 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-white">
              {user ? getInitials(`${user.firstName} ${user.lastName}`) : '?'}
            </span>
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-xs text-slate-500 truncate">
                {currentWorkspace?.name || 'No workspace'}
              </p>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={logout}
              className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-white/5 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </aside>
  )
}
