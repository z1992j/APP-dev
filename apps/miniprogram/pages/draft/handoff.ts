import { Api } from '../../utils/api';

// XHS deep links — wrapping with our own H5 page in production is recommended
// (Universal Link / intent://) for reliability. This page is the in-app fallback.
const XHS_SCHEME = 'xhsdiscover://hey_home_feed/';

Page({
  data: {
    id: '',
    title: '',
    body: '',
    media: [] as Array<{ url: string }>,
    savedAll: false,
    copied: false,
  },

  async onLoad(q: Record<string, string>) {
    if (!q.id) return;
    this.setData({ id: q.id });
    const d = await Api.getDraft(q.id);
    this.setData({ title: d.title, body: d.body, media: d.media || [] });

    // Step 1 — save images
    await this.saveImages();
    // Step 2 — copy text
    await this.copyContent();
    // Step 3 — try open XHS
    this.openXhs();
  },

  async saveImages() {
    for (const m of this.data.media) {
      try {
        await new Promise<void>((resolve, reject) =>
          wx.saveImageToPhotosAlbum({ filePath: m.url, success: () => resolve(), fail: reject }),
        );
      } catch {
        // permission denied -> continue, leave to manual
      }
    }
    this.setData({ savedAll: true });
  },

  async copyContent() {
    const txt = [this.data.title, this.data.body].filter(Boolean).join('\n\n');
    await new Promise<void>((resolve) =>
      wx.setClipboardData({ data: txt, success: () => resolve(), fail: () => resolve() }),
    );
    this.setData({ copied: true });
  },

  openXhs() {
    // Mini-programs can't directly call URL Scheme. The reliable path is opening
    // an own H5 page that performs Universal Link / intent fallback. Stub: hint user.
    wx.showModal({
      title: '即将打开小红书',
      content: '小程序无法直接唤起 App。请回到桌面打开小红书，发布页粘贴文案 + 从相册选图即可。',
      showCancel: false,
    });
  },

  retryOpen() {
    this.openXhs();
  },

  async onPublishedUrl(e: any) {
    const url = e.detail.value as string;
    if (!url) return;
    try {
      await Api.publishedDraft(this.data.id, url);
      wx.showToast({ title: '已记录笔记链接' });
      wx.navigateBack({ delta: 1 });
    } catch (e: any) {
      wx.showToast({ title: e.message || '链接无效', icon: 'none' });
    }
  },
});

export const XHS_SCHEME_EXPORT = XHS_SCHEME;
