import { Api, aiWriteStream } from '../../utils/api';
import { ensureLogin } from '../../utils/auth';

const STYLES = ['种草', '干货', '吐槽', '故事'];
const WORDS = [80, 200, 500, 1000];

interface AccountResult {
  accountId: string;
  nickname: string;
  rawBuffer: string;
  done: boolean;
  result: { titles?: string[]; body?: string; hashtags?: string[] } | null;
  selectedTitleIndex: number;
}

Page({
  data: {
    topic: '',
    accounts: [] as any[],
    selectedAccountIds: [] as string[],
    style: '种草',
    words: 200,
    refNoteFp: '',
    styles: STYLES,
    wordsOptions: WORDS,
    generating: false,
    results: [] as AccountResult[],
  },

  async onLoad(query: Record<string, string>) {
    try {
      await ensureLogin();
      const accounts = await Api.listAccounts();
      if (accounts.length === 0) {
        wx.showModal({
          title: '没有账号档案',
          content: '请先在「我」页面创建一个账号档案再写作',
          showCancel: false,
          success: () => wx.switchTab({ url: '/pages/me/index' }),
        });
        return;
      }
      this.setData({
        accounts,
        selectedAccountIds: [accounts[0].id],
        topic: query.topic ? decodeURIComponent(query.topic) : '',
      });
    } catch (e: any) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
    }
  },

  onTopicInput(e: any) {
    this.setData({ topic: e.detail.value });
  },

  toggleAccount(e: any) {
    const id = e.currentTarget.dataset.id as string;
    const set = new Set(this.data.selectedAccountIds);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    this.setData({ selectedAccountIds: Array.from(set) });
  },

  pickStyle(e: any) {
    this.setData({ style: e.currentTarget.dataset.style });
  },

  pickWords(e: any) {
    this.setData({ words: Number(e.currentTarget.dataset.words) });
  },

  async generate() {
    if (!this.data.topic.trim()) {
      return wx.showToast({ title: '请填写主题', icon: 'none' });
    }
    if (this.data.selectedAccountIds.length === 0) {
      return wx.showToast({ title: '请至少选 1 个账号', icon: 'none' });
    }

    const initial: AccountResult[] = this.data.selectedAccountIds.map((id) => ({
      accountId: id,
      nickname: this.data.accounts.find((a: any) => a.id === id)?.nickname ?? id,
      rawBuffer: '',
      done: false,
      result: null,
      selectedTitleIndex: 0,
    }));
    this.setData({ generating: true, results: initial });

    try {
      await aiWriteStream(
        {
          topic: this.data.topic,
          accountIds: this.data.selectedAccountIds,
          style: this.data.style,
          words: this.data.words,
          refNoteFp: this.data.refNoteFp || undefined,
        },
        (evt) => {
          const results = [...this.data.results];
          const idx = results.findIndex((r) => r.accountId === evt.accountId);
          if (idx === -1) return;
          if (evt.type === 'delta') {
            results[idx].rawBuffer += evt.text;
          } else if (evt.type === 'account.done') {
            results[idx].done = true;
            results[idx].result = evt.result ?? null;
          } else if (evt.type === 'account.error') {
            results[idx].done = true;
            results[idx].rawBuffer = `❌ ${evt.message}`;
          }
          this.setData({ results });
        },
      );
    } catch (e: any) {
      wx.showToast({ title: e.message || '生成失败', icon: 'none' });
    } finally {
      this.setData({ generating: false });
    }
  },

  switchTitle(e: any) {
    const { idx, t } = e.currentTarget.dataset;
    const results = [...this.data.results];
    results[idx].selectedTitleIndex = Number(t);
    this.setData({ results });
  },

  async saveAsDraft(e: any) {
    const idx = Number(e.currentTarget.dataset.idx);
    const r = this.data.results[idx];
    if (!r.result) return;
    const title = r.result.titles?.[r.selectedTitleIndex] ?? '';
    const body = (r.result.body ?? '') + '\n\n' + (r.result.hashtags ?? []).join(' ');
    try {
      const draft = await Api.createDraft({
        accountId: r.accountId,
        kind: 'image',
        title,
        body,
        hashtags: r.result.hashtags ?? [],
      });
      wx.showToast({ title: '已保存到草稿' });
      wx.navigateTo({ url: `/pages/draft/edit?id=${draft.id}` });
    } catch (e: any) {
      wx.showToast({ title: e.message || '保存失败', icon: 'none' });
    }
  },
});
