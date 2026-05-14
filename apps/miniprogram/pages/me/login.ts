import { ensureLogin } from '../../utils/auth';

Page({
  async onLoad() {
    try {
      await ensureLogin();
      wx.switchTab({ url: '/pages/inspire/index' });
    } catch (e: any) {
      wx.showToast({ title: e.message || '登录失败', icon: 'none' });
    }
  },
});
