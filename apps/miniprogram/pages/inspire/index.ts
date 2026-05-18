import { Api } from '../../utils/api';
import { ensureLogin } from '../../utils/auth';

Page({
  data: {
    q: '',
    loading: false,
    angles: [] as Array<{ id: string; text: string }>,
    userNotes: [] as any[],
    history: [] as string[],
  },

  async onLoad() {
    try {
      await ensureLogin();
      const hist = wx.getStorageSync('inspireHistory') || [];
      this.setData({ history: hist });
    } catch (e) {
      wx.showToast({ title: '登录失败', icon: 'none' });
    }
  },

  onInput(e: any) {
    this.setData({ q: e.detail.value });
  },

  async onSearch() {
    const q = this.data.q.trim();
    if (!q) return;
    this.setData({ loading: true });
    try {
      const res = await Api.inspireSearch(q);
      this.setData({
        angles: res.angles,
        userNotes: res.userNotes,
      });
      const next = [q, ...this.data.history.filter((s) => s !== q)].slice(0, 10);
      this.setData({ history: next });
      wx.setStorageSync('inspireHistory', next);
    } catch (e: any) {
      wx.showToast({ title: e.message || '搜索失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onUseAngle(e: any) {
    const text = e.currentTarget.dataset.text as string;
    wx.navigateTo({ url: `/pages/inspire/write?topic=${encodeURIComponent(text)}` });
  },

  onWriteCta() {
    wx.navigateTo({ url: '/pages/inspire/write' });
  },

  onHistoryTap(e: any) {
    const q = e.currentTarget.dataset.q as string;
    this.setData({ q });
    this.onSearch();
  },

  async onPasteOembed() {
    const { content } = await new Promise<any>((resolve) =>
      wx.getClipboardData({ success: resolve, fail: () => resolve({ content: '' }) }),
    );
    if (!content) return wx.showToast({ title: '剪贴板为空', icon: 'none' });
    try {
      const note = await Api.inspireOembed(content);
      wx.showToast({ title: '已收藏到选题池' });
      this.setData({ userNotes: [note, ...this.data.userNotes] });
    } catch (e: any) {
      wx.showToast({ title: e.message || '链接无效', icon: 'none' });
    }
  },
});
