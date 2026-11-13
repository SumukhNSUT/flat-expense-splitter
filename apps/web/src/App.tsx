import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext.js';
import { Sidebar } from './components/layout/Sidebar.js';
import { ExpenseModal } from './components/expenses/ExpenseModal.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { ExpensesPage } from './pages/ExpensesPage.js';
import { BalancesPage } from './pages/BalancesPage.js';
import { MembersPage } from './pages/MembersPage.js';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AppProvider>
        <div className="flex min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-indigo-500 selection:text-white">
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/expenses" element={<ExpensesPage />} />
              <Route path="/balances" element={<BalancesPage />} />
              <Route path="/members" element={<MembersPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
          <ExpenseModal />
        </div>
      </AppProvider>
    </BrowserRouter>
  );
};

export default App;
