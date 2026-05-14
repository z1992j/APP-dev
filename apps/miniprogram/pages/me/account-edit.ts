import { Api } from '../../utils/api';
import { ensureLogin } from '../../utils/auth';

const VERTICALS = ['穿搭', '美妆', '母婴', '美食', '通用'];

Page({
  data: {
    id: '',
    nickname: '',
    xhsUrl: '',
    vertical: '通用',
    verticals: VERTICALS,
    persona: {
      gender: '不限',
      ageRange: '22-28',
      city: '',
      intro: '',
      catchphrases: [] as string[],
      bannedWords: [] as string[],
    },
  },

  async onLoad(q: Record<string, string>) {
    await ensureLogin();
    if (q.id) {
      this.setData({ id: q.id });
      const accs = await Api.listAccounts();
      const a = accs.find((x: any) => x.id === q.id);
      if (a) {
        this.setData({
          nickname: a.nickname,
          xhsUrl: a.xhsUrl || '',
          vertical: a.vertical || '通用',
          persona: { ...this.data.persona, ...(a.persona || {}) },
        });
      }
    }
  },

  pick(e: any) {
    this.setData({ vertical: e.currentTarget.dataset.v });
  },

  onInput(e: any) {
    const k = e.currentTarget.dataset.k;
    if (k.startsWith('persona.')) {
      this.setData({ [k]: e.detail.value });
    } else {
      this.setData({ [k]: e.detail.value });
    }
  },

  async save() {
    if (!this.data.nickname) return wx.showToast({ title: '请填昵称', icon: 'none' });
    try {
      if (this.data.id) {
        await Api.updateAccount(this.data.id, {
          nickname: this.data.nickname,
          xhsUrl: this.data.xhsUrl,
          vertical: this.data.vertical,
          persona: this.data.persona,
        });
      } else {
        await Api.createAccount({
          nickname: this.data.nickname,
          xhsUrl: this.data.xhsUrl,
          vertical: this.data.vertical,
          persona: this.data.persona,
        });
      }
      wx.showToast({ title: '已保存' });
      setTimeout(() => wx.navigateBack(), 800);
    } catch (e: any) {
      wx.showToast({ title: e.message || '保存失败', icon: 'none' });
    }
  },
});
