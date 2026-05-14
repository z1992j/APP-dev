Page({
  data: {
    plans: [
      { key: 'personal', title: '个人 Pro', price: '¥29 / 月  ·  ¥279 / 年（省 20%）', features: ['AI 写作 100 次/天', '5 个账号档案', '数据看板 + 排期', '违禁词无限检测'] },
      { key: 'starter', title: '团队 Starter', price: '¥99 / 席 / 月（3 席起）', features: ['协作 + 审稿', '10 个账号档案', '任务派发'] },
      { key: 'pro', title: '团队 Pro', price: '¥299 / 席 / 月', features: ['数据 API 接入', '变体生成', '私信话术库', '企微对接'] },
    ],
  },
  upgrade(e: any) {
    const k = e.currentTarget.dataset.k;
    wx.showModal({
      title: '即将开通',
      content: `订阅 ${k}。微信支付集成中，敬请期待。`,
      showCancel: false,
    });
  },
});
