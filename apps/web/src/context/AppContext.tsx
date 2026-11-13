import React, { createContext, useContext, useEffect, useState } from 'react';
import { Flat, User, Expense } from '../types/index.js';
import { api } from '../services/api.js';

interface AppContextType {
  currentUser: User | null;
  setCurrentUser: (user: User) => void;
  demoUsers: User[];
  flats: Flat[];
  currentFlat: Flat | null;
  setCurrentFlat: (flat: Flat) => void;
  isLoadingInitial: boolean;
  refreshKey: number;
  triggerRefresh: () => void;
  // Modal controls
  isExpenseModalOpen: boolean;
  editingExpense: Expense | null;
  openAddExpense: () => void;
  openEditExpense: (expense: Expense) => void;
  closeExpenseModal: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [demoUsers, setDemoUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [flats, setFlats] = useState<Flat[]>([]);
  const [currentFlat, setCurrentFlat] = useState<Flat | null>(null);
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  const triggerRefresh = () => setRefreshKey((k) => k + 1);

  const openAddExpense = () => {
    setEditingExpense(null);
    setIsExpenseModalOpen(true);
  };

  const openEditExpense = (expense: Expense) => {
    setEditingExpense(expense);
    setIsExpenseModalOpen(true);
  };

  const closeExpenseModal = () => {
    setIsExpenseModalOpen(false);
    setEditingExpense(null);
  };

  // Initial load of demo users
  useEffect(() => {
    async function loadUsers() {
      try {
        const res = await api.getDemoUsers();
        setDemoUsers(res.data);

        // Find saved user or default to Sumukh Bansal
        const savedUserId = localStorage.getItem('flatmate_active_user_id');
        const defaultUser =
          res.data.find((u) => u.id === savedUserId) ||
          res.data.find((u) => u.id === '00000000-0000-0000-0000-000000000001') ||
          res.data[0] ||
          null;

        setCurrentUser(defaultUser);
      } catch (err) {
        console.error('Failed to load demo users:', err);
      } finally {
        setIsLoadingInitial(false);
      }
    }
    loadUsers();
  }, []);

  // When currentUser changes, reload flats
  useEffect(() => {
    if (!currentUser) return;
    localStorage.setItem('flatmate_active_user_id', currentUser.id);

    async function loadFlats() {
      try {
        const res = await api.getFlats(currentUser!.id);
        setFlats(res.data);

        // Select active flat: saved flat or first flat where isMember && !hasLeft, or first flat
        const savedFlatId = localStorage.getItem('flatmate_active_flat_id');
        const activeFlat =
          res.data.find((f) => f.id === savedFlatId && f.isMember && !f.hasLeft) ||
          res.data.find((f) => f.isMember && !f.hasLeft) ||
          res.data[0] ||
          null;

        setCurrentFlat(activeFlat);
      } catch (err) {
        console.error('Failed to load flats for user:', err);
      }
    }

    loadFlats();
  }, [currentUser, refreshKey]);

  const handleSetCurrentFlat = (flat: Flat) => {
    setCurrentFlat(flat);
    localStorage.setItem('flatmate_active_flat_id', flat.id);
  };

  const handleSetCurrentUser = (user: User) => {
    setCurrentUser(user);
    localStorage.setItem('flatmate_active_user_id', user.id);
  };

  return (
    <AppContext.Provider
      value={{
        currentUser,
        setCurrentUser: handleSetCurrentUser,
        demoUsers,
        flats,
        currentFlat,
        setCurrentFlat: handleSetCurrentFlat,
        isLoadingInitial,
        refreshKey,
        triggerRefresh,
        isExpenseModalOpen,
        editingExpense,
        openAddExpense,
        openEditExpense,
        closeExpenseModal,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export function useApp(): AppContextType {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
