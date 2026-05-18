Page({
  data: {
    activeTab: 'user',
    tabs: [
      { key: 'user', label: '用户协议' },
      { key: 'privacy', label: '隐私政策' },
      { key: 'sub', label: '订阅协议' },
    ],
  },
  switchTab(e: any) {
    this.setData({ activeTab: e.currentTarget.dataset.key });
  },
});
