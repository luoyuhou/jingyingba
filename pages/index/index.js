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
        if (res.openid) {
          wx.setStorageSync('openid', res.openid);
        }
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

  /**
   * 触发扫码登录
   */
  async onScanLogin() {
    wx.scanCode({
      onlyFromCamera: true,
      scanType: ['qrCode'],
      success: async (res) => {
        console.log('扫码成功:', res);
        const scanResult = res.result;
        let qrCodeId = '';

        // 1. 解析二维码内容 (支持 JSON, URL 参数, 路径, 纯 UUID)
        try {
          // 情况1: JSON
          try {
            const jsonData = JSON.parse(scanResult);
            if (jsonData.qrCodeId) qrCodeId = jsonData.qrCodeId;
          } catch (e) {}

          // 情况2: URL 参数
          if (!qrCodeId && scanResult.includes('qrCodeId=')) {
            const match = scanResult.match(/qrCodeId=([^&]+)/);
            if (match) qrCodeId = match[1];
          }

          // 情况3: 路径格式
          if (!qrCodeId && scanResult.includes('qr-login/')) {
            qrCodeId = scanResult.split('qr-login/')[1].split('?')[0];
          }

          // 情况4: 纯 UUID
          if (!qrCodeId) {
            const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (uuidPattern.test(scanResult)) qrCodeId = scanResult;
          }
        } catch (error) {
          console.error('解析失败:', error);
        }

        if (!qrCodeId) {
          return wx.showToast({ title: '无效的二维码', icon: 'none' });
        }

        let openid = wx.getStorageSync('openid');
        if (!openid) {
          // 如果本地没有 openid，尝试重新通过 sign-in 接口获取
          try {
            const res = await db._request('/auth/sign-in');
            if (res && res.openid) {
              openid = res.openid;
              wx.setStorageSync('openid', openid);
            }
          } catch (e) {
            console.error('获取 openid 失败:', e);
          }
        }

        if (!openid) {
          wx.showToast({ title: '身份认证失败，请重新登录', icon: 'none' });
          setTimeout(() => wx.reLaunch({ url: '/pages/login/index' }), 1500);
          return;
        }

        // 2. 标记已扫描
        await this.markQrCodeAsScanned(qrCodeId, openid);
      },
      fail: (err) => {
        if (err.errMsg !== 'scanCode:fail cancel') {
          wx.showToast({ title: '扫码失败', icon: 'none' });
        }
      }
    });
  },

  /**
   * 标记二维码为已扫描
   */
  async markQrCodeAsScanned(qrCodeId, openid) {
    try {
      wx.showLoading({ title: '处理中...' });
      await db._request('/auth/qr-code/scan', 'POST', { qrCodeId, openid });
      wx.hideLoading();

      wx.showModal({
        title: '确认登录',
        content: '是否确认登录网页端？',
        confirmText: '确认登录',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            this.confirmQrLogin(qrCodeId, openid);
          }
        }
      });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: err.data?.message || '操作失败', icon: 'none' });
    }
  },

  /**
   * 确认二维码登录
   */
  async confirmQrLogin(qrCodeId, openid) {
    try {
      wx.showLoading({ title: '登录中...' });
      await db._request('/auth/qr-code/confirm', 'POST', { qrCodeId, openid });
      wx.hideLoading();
      wx.showToast({ title: '网页端登录成功', icon: 'success' });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: err.data?.message || '登录失败', icon: 'none' });
    }
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