import { Api } from '../../utils/api';
import { ensureLogin } from '../../utils/auth';

const STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  in_review: '待审',
  approved: '已审',
  scheduled: '已排期',
  handed_off: '待回填',
  published: '已发布',
};

Page({
  data: {
    items: [] as any[],
    status: '' as string,
    nextCursor: null as string | null,
    loading: false,
    statuses: [
      { key: '', label: '全部' },
      { key: 'draft', label: '草稿' },
      { key: 'scheduled', label: '已排期' },
      { key: 'handed_off', label: '待回填' },
      { key: 'published', label: '已发布' },
    ],
    statusLabel: STATUS_LABEL,
  },

  async onShow() {
    await ensureLogin();
    this.refresh();
  },

  pickStatus(e: any) {
    this.setData({ status: e.currentTarget.dataset.key }, () => this.refresh());
  },

  async refresh() {
    this.setData({ loading: true });
    try {
      const res = await Api.listDrafts({ status: this.data.status });
      this.setData({
        items: res.items,
        nextCursor: res.nextCursor,
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  async onReachBottom() {
    if (!this.data.nextCursor || this.data.loading) return;
    this.setData({ loading: true });
    try {
      const res = await Api.listDrafts({
        status: this.data.status,
        cursor: this.data.nextCursor,
      });
      this.setData({
        items: [...this.data.items, ...res.items],
        nextCursor: res.nextCursor,
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  open(e: any) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/draft/edit?id=${id}` });
  },

  newDraft() {
    wx.navigateTo({ url: '/pages/inspire/write' });
  },
});
