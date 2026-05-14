import { Api } from '../../utils/api';
import { ensureLogin, logout } from '../../utils/auth';

Page({
  data: {
    user: null as any,
    team: null as any,
    accounts: [] as any[],
  },

  async onShow() {
    try {
      await ensureLogin();
    } catch {
      // not logged in — let user see nothing for now
    }
    const a = getApp<any>();
    this.setData({ user: a.globalData.user, team: a.globalData.team });
    try {
      const accounts = await Api.listAccounts();
      this.setData({ accounts });
    } catch {
      // ignore
    }
  },

  editAccount(e: any) {
    const id = e.currentTarget.dataset.id || '';
    wx.navigateTo({ url: `/pages/me/account-edit?id=${id}` });
  },

  newAccount() {
    wx.navigateTo({ url: '/pages/me/account-edit' });
  },

  openBilling() {
    wx.navigateTo({ url: '/pages/me/billing' });
  },

  signOut() {
    logout();
    this.setData({ user: null, team: null, accounts: [] });
    wx.reLaunch({ url: '/pages/inspire/index' });
  },
});
