import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AccountInfo {
  id: string;
  nickname: string;
  vertical?: string;
  persona?: { city?: string; intro?: string };
  xhsUrl?: string;
  isActive?: boolean;
}

interface AccountStore {
  accounts: AccountInfo[];
  activeId: string | null;
  setAccounts: (accounts: AccountInfo[]) => void;
  setActiveId: (id: string | null) => void;
  active: () => AccountInfo | null;
}

export const useAccountStore = create<AccountStore>()(
  persist(
    (set, get) => ({
      accounts: [],
      activeId: null,
      setAccounts: (accounts) => {
        const current = get().activeId;
        const stillExists = accounts.some((a) => a.id === current);
        set({
          accounts,
          activeId: stillExists ? current : accounts[0]?.id ?? null,
        });
      },
      setActiveId: (id) => set({ activeId: id }),
      active: () => {
        const { accounts, activeId } = get();
        return accounts.find((a) => a.id === activeId) ?? null;
      },
    }),
    { name: 'redmatrix:active-account' },
  ),
);
