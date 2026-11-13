import React from 'react';
import { Plus, Building2, User } from 'lucide-react';
import { useApp } from '../../context/AppContext.js';

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export const Header: React.FC<HeaderProps> = ({ title, subtitle }) => {
  const { currentFlat, currentUser, openAddExpense } = useApp();

  const canAddExpense = currentFlat && currentFlat.isMember && !currentFlat.hasLeft;

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between sticky top-0 z-20">
      <div>
        <div className="flex items-center space-x-2">
          <h2 className="text-xl font-bold text-slate-900">{title}</h2>
          {currentFlat && (
            <span className="hidden sm:inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
              <Building2 className="w-3 h-3 text-slate-500" />
              <span>{currentFlat.name}</span>
            </span>
          )}
        </div>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>

      <div className="flex items-center space-x-4">
        {currentUser && (
          <div className="hidden md:flex items-center space-x-2 text-xs text-slate-600 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/60">
            <User className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-semibold text-slate-800">{currentUser.name}</span>
          </div>
        )}

        <button
          onClick={openAddExpense}
          disabled={!canAddExpense}
          title={!canAddExpense ? 'You must be an active member of this flat to add expenses' : ''}
          className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-semibold rounded-xl shadow-md shadow-indigo-100 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Add Expense</span>
        </button>
      </div>
    </header>
  );
};
