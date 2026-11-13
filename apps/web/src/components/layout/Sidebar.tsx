import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Receipt,
  Scale,
  Users,
  Building2,
  UserCheck,
  ChevronDown,
} from 'lucide-react';
import { useApp } from '../../context/AppContext.js';

export const Sidebar: React.FC = () => {
  const {
    currentUser,
    setCurrentUser,
    demoUsers,
    flats,
    currentFlat,
    setCurrentFlat,
  } = useApp();

  const navItems = [
    { label: 'Dashboard', path: '/', icon: LayoutDashboard },
    { label: 'Expenses', path: '/expenses', icon: Receipt },
    { label: 'Balances', path: '/balances', icon: Scale },
    { label: 'Members', path: '/members', icon: Users },
  ];

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0 h-screen sticky top-0">
      {/* Brand Logo */}
      <div className="h-16 flex items-center px-6 border-b border-slate-100">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-100">
            <Receipt className="w-5 h-5 stroke-[2.2]" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 leading-tight">Flatmate Ledger</h1>
            <p className="text-[11px] text-slate-400 font-medium tracking-wide">EXPENSE SPLITTER</p>
          </div>
        </div>
      </div>

      {/* Flat Selector */}
      <div className="p-4 border-b border-slate-100">
        <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
          Current Flat
        </label>
        <div className="relative">
          <select
            value={currentFlat?.id || ''}
            onChange={(e) => {
              const selected = flats.find((f) => f.id === e.target.value);
              if (selected) setCurrentFlat(selected);
            }}
            className="w-full appearance-none bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-800 pr-9 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition cursor-pointer"
          >
            {flats.map((flat) => (
              <option key={flat.id} value={flat.id}>
                {flat.name} {flat.isMember ? (flat.hasLeft ? '(Departed)' : '✓') : '(Not Member)'}
              </option>
            ))}
          </select>
          <div className="absolute right-3 top-3 pointer-events-none text-slate-400">
            <ChevronDown className="w-4 h-4" />
          </div>
        </div>
        {currentFlat && (
          <div className="mt-2 flex items-center space-x-1.5 text-[11px] text-slate-500">
            <Building2 className="w-3.5 h-3.5 text-indigo-500" />
            <span className="truncate">
              {currentFlat.isMember
                ? currentFlat.hasLeft
                  ? 'Historical (You departed)'
                  : 'Active Flat Membership'
                : 'Not a member'}
            </span>
          </div>
        )}
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
        <p className="px-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
          Menu
        </p>
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700 font-semibold'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Demo User Switcher (Footer) */}
      <div className="p-4 border-t border-slate-100 bg-slate-50/70">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 flex items-center space-x-1">
            <UserCheck className="w-3 h-3" />
            <span>Caller Identity (Header)</span>
          </span>
          <span className="text-[10px] bg-indigo-100 text-indigo-800 font-mono px-1.5 py-0.5 rounded">
            DEMO
          </span>
        </div>

        <div className="relative">
          <select
            value={currentUser?.id || ''}
            onChange={(e) => {
              const selected = demoUsers.find((u) => u.id === e.target.value);
              if (selected) setCurrentUser(selected);
            }}
            className="w-full appearance-none bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 pr-8 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm cursor-pointer"
          >
            {demoUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} ({user.email.split('@')[0]})
              </option>
            ))}
          </select>
          <div className="absolute right-2.5 top-2.5 pointer-events-none text-slate-400">
            <ChevronDown className="w-3.5 h-3.5" />
          </div>
        </div>

        {currentUser && (
          <div className="mt-2 text-[10px] text-slate-500 truncate font-mono">
            ID: {currentUser.id.slice(0, 18)}...
          </div>
        )}
      </div>
    </aside>
  );
};
