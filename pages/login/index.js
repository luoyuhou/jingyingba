const { db } = require('../../utils/db');
const app = getApp();

Page({
  data: {
    userInfo: null,
    hasUserInfo: false
  },

  onLoad() {
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) {
      this.setData({
        userInfo,
        hasUserInfo: true
      });
    }
  },

  handleUserInfo(e) {
    if (e.detail.userInfo || e.detail.rawData) {
      // 兼容不同版本的微信授权返回
      const userInfo = e.detail.userInfo || JSON.parse(e.detail.rawData);
      this.setData({
        userInfo,
        hasUserInfo: true
      });
      wx.setStorageSync('userInfo', userInfo);
    }
  },

  onLogin() {
    wx.getUserInfo({
      success: (info) => {
        wx.showLoading({ title: '正在登录...' });
        wx.login({
          success: (res) => {
            if (res.code) {
              this.doServerLogin(res.code, info);
            } else {
              wx.hideLoading();
              wx.showToast({ title: '获取code失败', icon: 'none' });
            }
          }
        });
      },
      fail: () => {
        wx.showToast({ title: '请先授权用户信息', icon: 'none' });
      }
    });
  },

  async doServerLogin(code, info) {
    try {
      // 1. 验证 code
      const verifyRes = await db._request('/auth/wx/verify-code', 'POST', { 
        code, 
        appType: 'cashier' 
      });
      
      const uuid = verifyRes.data.uuid;

      // 2. 签名登录
      const loginRes = await db._request('/auth/wx/sign-in', 'POST', {
        uuid,
        signature: info.signature,
        rawData: info.rawData,
        appType: 'cashier'
      });

      wx.hideLoading();
      console.log('[Login] Server response:', loginRes);
      
      if (loginRes && loginRes.data) {
        app.globalData.userInfo = loginRes.data;
        wx.showToast({ title: '登录成功', icon: 'success' });
        
        console.log('[Login] Success, reLaunching to index...');
        setTimeout(() => {
          wx.reLaunch({ 
            url: '/pages/index/index',
            fail: (e) => {
              console.error('[Login] reLaunch failed, trying redirectTo', e);
              wx.redirectTo({ url: '/pages/index/index' });
            }
          });
        }, 600);
      } else {
        console.error('[Login] Response data missing');
        wx.showToast({ title: '登录失败: 返回数据异常', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      console.error('[Login] Error:', err);
      const msg = err.data?.message || err.message || '登录失败';
      wx.showToast({ title: msg, icon: 'none' });
    }
  }
});