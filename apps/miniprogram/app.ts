// Global app state and lifecycle.
// Replace API_BASE with your server URL when packaging.

interface GlobalData {
  apiBase: string;
  token: string;
  user: { id: string; nickname?: string; avatarUrl?: string } | null;
  team: { id: string; role: string } | null;
}

App<{ globalData: GlobalData }>({
  globalData: {
    apiBase: 'http://localhost:3000/api/v1',
    token: '',
    user: null,
    team: null,
  },

  onLaunch() {
    const token = wx.getStorageSync('token') as string;
    const user = wx.getStorageSync('user');
    const team = wx.getStorageSync('team');
    if (token) this.globalData.token = token;
    if (user) this.globalData.user = user;
    if (team) this.globalData.team = team;
  },
});
