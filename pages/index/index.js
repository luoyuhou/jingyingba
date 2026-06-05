const { db } = require('../../utils/db');

Page({
  data: {
    stores: [],
    loading: true
  },

  onLoad() {
    console.log('Index Page onLoad');
    this.isFirstLoad = true;
    this.checkSessionAndLoad();
  },

  onShow() {
    console.log('Index Page onShow');
    if (!this.isFirstLoad) {
      this.loadStores(false);
    }
    this.isFirstLoad = false;
  },

  async checkSessionAndLoad() {
    console.log('[Index] Starting session check...');
    try {
      const res = await db._request('/auth/sign-in');
      console.log('[Index] Session check success:', res);
      
      if (res && res.data) {
        getApp().globalData.userInfo = res.data;
        this.loadStores(true);
      } else {
        console.warn('[Index] Session invalid or no data, redirecting to login...');
        wx.reLaunch({ url: '/pages/login/index' });
      }
    } catch (err) {
      console.error('[Index] Session check caught error:', err);
      // 如果不是 401（401 已经在 db.js 处理），我们手动跳转
      if (err.statusCode !== 401) {
        wx.reLaunch({ url: '/pages/login/index' });
      }
    }
  },

  async loadStores(autoSelect = false) {
    try {
      this.setData({ loading: true });
      const res = await db._request('/store');
      const stores = res.data || [];
      this.setData({ 
        stores,
        loading: false
      });
      
      // 仅在初次进入且只有一个门店时自动跳转
      if (autoSelect && stores.length === 1) {
        this.doSelect(stores[0].store_id, stores[0].store_name);
      }
    } catch (err) {
      this.setData({ loading: false });
      console.error('Failed to load stores:', err);
    }
  },

  selectStore(e) {
    const { id, name } = e.currentTarget.dataset;
    this.doSelect(id, name);
  },

  doSelect(id, name) {
    db.setStoreId(id);
    wx.setStorageSync('store_name', name);
    wx.showToast({ title: '已进入' + name, icon: 'none' });
    
    setTimeout(() => {
      wx.navigateTo({ url: `/pages/cashier/index?sid=${id}` });
    }, 1000);
  },

  navToApply() {
    wx.navigateTo({ url: '/pages/apply-store/index' });
  },

  async onLogout() {
    try {
      wx.showLoading({ title: '正在退出...' });
      // 调用后端退出接口，清除服务器 session
      await db._request('/auth/logout', 'DELETE').catch(() => {});
      
      // 清除本地缓存
      wx.clearStorageSync();
      wx.hideLoading();
      
      wx.showToast({ title: '已安全退出', icon: 'success' });
      
      setTimeout(() => {
        wx.reLaunch({ url: '/pages/login/index' });
      }, 800);
    } catch (err) {
      wx.hideLoading();
      wx.clearStorageSync();
      wx.reLaunch({ url: '/pages/login/index' });
    }
  }
});