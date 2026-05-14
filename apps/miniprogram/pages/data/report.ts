import { Api } from '../../utils/api';
import { ensureLogin } from '../../utils/auth';

Page({
  data: {
    accounts: [] as any[],
    selectedAccountId: '',
    metrics: {
      followers: 0,
      impressions: 0,
      likes: 0,
      saves: 0,
      comments: 0,
      msgs: 0,
      posts: 0,
    },
  },

  async onLoad() {
    await ensureLogin();
    const accounts = await Api.listAccounts();
    this.setData({
      accounts,
      selectedAccountId: accounts[0]?.id ?? '',
    });
  },

  pickAccount(e: any) {
    this.setData({ selectedAccountId: e.currentTarget.dataset.id });
  },

  onMetricInput(e: any) {
    const key = e.currentTarget.dataset.key as keyof typeof this.data.metrics;
    this.setData({
      [`metrics.${key}`]: Number(e.detail.value) || 0,
    });
  },

  async submit() {
    if (!this.data.selectedAccountId) {
      return wx.showToast({ title: '请选账号', icon: 'none' });
    }
    try {
      await Api.reportData({
        accountId: this.data.selectedAccountId,
        bucketDate: new Date().toISOString().slice(0, 10),
        metrics: this.data.metrics,
      });
      wx.showToast({ title: '已保存 ✓' });
      setTimeout(() => wx.navigateBack(), 800);
    } catch (e: any) {
      wx.showToast({ title: e.message || '保存失败', icon: 'none' });
    }
  },
});
