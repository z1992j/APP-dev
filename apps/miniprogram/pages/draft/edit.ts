import { Api } from '../../utils/api';
import { ensureLogin } from '../../utils/auth';

interface Violation {
  text: string;
  start: number;
  end: number;
  level: 'red' | 'yellow' | 'info';
  category: string;
  suggestion?: string;
}

Page({
  data: {
    id: '',
    title: '',
    body: '',
    media: [] as Array<{ url: string; key: string }>,
    hashtags: [] as string[],
    accountId: '',
    accountName: '',
    status: 'draft',
    publishedUrl: '',
    saving: false,
    violations: [] as Violation[],
    lintPassed: true,
    lintLoading: false,
    showLintPanel: false,
  },

  saveTimer: null as any,

  async onLoad(query: Record<string, string>) {
    await ensureLogin();
    if (!query.id) {
      wx.showToast({ title: '缺少草稿 id', icon: 'none' });
      return;
    }
    this.setData({ id: query.id });
    await this.loadDraft();
  },

  async loadDraft() {
    try {
      const d = await Api.getDraft(this.data.id);
      this.setData({
        title: d.title || '',
        body: d.body || '',
        media: d.media || [],
        hashtags: d.hashtags || [],
        accountId: d.accountId || (d.account?.id ?? ''),
        accountName: d.account?.nickname || '',
        status: d.status,
        publishedUrl: d.publishedUrl || '',
      });
    } catch (e: any) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
    }
  },

  onTitleInput(e: any) {
    this.setData({ title: e.detail.value });
    this.queueSave();
  },

  onBodyInput(e: any) {
    this.setData({ body: e.detail.value });
    this.queueSave();
  },

  queueSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.save(), 1500);
  },

  async save() {
    if (this.data.saving) return;
    this.setData({ saving: true });
    try {
      await Api.updateDraft(this.data.id, {
        kind: 'image',
        title: this.data.title,
        body: this.data.body,
        media: this.data.media,
        hashtags: this.data.hashtags,
      });
    } catch (e: any) {
      wx.showToast({ title: e.message || '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  async chooseImages() {
    if (this.data.media.length >= 18) {
      return wx.showToast({ title: '最多 18 张', icon: 'none' });
    }
    const remain = 18 - this.data.media.length;
    const res = await new Promise<any>((resolve, reject) =>
      wx.chooseMedia({
        count: remain,
        mediaType: ['image'],
        sizeType: ['compressed'],
        success: resolve,
        fail: reject,
      }),
    );
    const added: Array<{ url: string; key: string }> = [];
    for (const file of res.tempFiles) {
      try {
        const sign = await Api.signMedia('image', extOf(file.tempFilePath), file.size);
        // Production: wx.uploadFile to sign.uploadUrl. Stub: store local path.
        added.push({ url: file.tempFilePath, key: sign.key });
      } catch (e: any) {
        wx.showToast({ title: e.message || '上传失败', icon: 'none' });
      }
    }
    this.setData({ media: [...this.data.media, ...added] }, () => this.queueSave());
  },

  removeImage(e: any) {
    const idx = Number(e.currentTarget.dataset.idx);
    const media = [...this.data.media];
    media.splice(idx, 1);
    this.setData({ media }, () => this.queueSave());
  },

  async runLint() {
    this.setData({ lintLoading: true, showLintPanel: true });
    try {
      const res = await Api.lint(this.data.body, this.data.title);
      this.setData({ violations: res.violations, lintPassed: res.passed });
      if (res.passed) {
        wx.showToast({ title: '检查通过 ✓' });
      }
    } catch (e: any) {
      wx.showToast({ title: e.message || '检查失败', icon: 'none' });
    } finally {
      this.setData({ lintLoading: false });
    }
  },

  closeLint() {
    this.setData({ showLintPanel: false });
  },

  applyFix(e: any) {
    const idx = Number(e.currentTarget.dataset.idx);
    const v = this.data.violations[idx];
    if (!v?.suggestion) return;
    const target = `${this.data.title}\n${this.data.body}`;
    const replaced = target.replace(v.text, v.suggestion);
    const [title, ...rest] = replaced.split('\n');
    this.setData(
      { title, body: rest.join('\n') },
      () => {
        this.runLint();
        this.queueSave();
      },
    );
  },

  async handoff() {
    await this.save();
    if (!this.data.lintPassed) {
      const ok = await new Promise<boolean>((resolve) =>
        wx.showModal({
          title: '违禁词未处理',
          content: '建议先处理高风险词再发布。仍然继续？',
          success: (r) => resolve(r.confirm),
        }),
      );
      if (!ok) return;
    }
    try {
      await Api.handoffDraft(this.data.id);
      wx.navigateTo({
        url: `/pages/draft/handoff?id=${this.data.id}`,
      });
    } catch (e: any) {
      wx.showToast({ title: e.message || '操作失败', icon: 'none' });
    }
  },

  async submitPublishedUrl(e: any) {
    const url = e.detail.value as string;
    if (!url) return;
    try {
      await Api.publishedDraft(this.data.id, url);
      wx.showToast({ title: '已记录' });
      this.loadDraft();
    } catch (e: any) {
      wx.showToast({ title: e.message || '链接无效', icon: 'none' });
    }
  },
});

function extOf(path: string): string {
  const i = path.lastIndexOf('.');
  return i === -1 ? 'jpg' : path.slice(i + 1);
}
