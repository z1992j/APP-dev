import { Api } from '../../utils/api';
import { ensureLogin } from '../../utils/auth';

Page({
  data: {
    accounts: [] as any[],
    totals: {} as Record<string, number>,
    loading: false,
  },

  async onShow() {
    await ensureLogin();
    this.setData({ loading: true });
    try {
      const res = await Api.teamData();
      this.setData({ accounts: res.accounts, totals: res.totals });
    } catch (e: any) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  openReport() {
    wx.navigateTo({ url: '/pages/data/report' });
  },
});
