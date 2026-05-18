import { Api } from './api';

interface AppGlobal {
  globalData: { token: string; user: any; team: any; apiBase: string };
}

export async function ensureLogin(): Promise<void> {
  const a = getApp<AppGlobal>();
  if (a.globalData.token) return;
  await new Promise<void>((resolve, reject) => {
    wx.login({
      success: async (res) => {
        try {
          const { token, user, team } = await Api.wxLogin(res.code);
          a.globalData.token = token;
          a.globalData.user = user;
          a.globalData.team = team;
          wx.setStorageSync('token', token);
          wx.setStorageSync('user', user);
          wx.setStorageSync('team', team);
          resolve();
        } catch (e) {
          reject(e);
        }
      },
      fail: reject,
    });
  });
}

export function logout(): void {
  const a = getApp<AppGlobal>();
  a.globalData.token = '';
  a.globalData.user = null;
  a.globalData.team = null;
  wx.removeStorageSync('token');
  wx.removeStorageSync('user');
  wx.removeStorageSync('team');
}
