const { db } = require('../../utils/db');
const app = getApp();

Page({
  data: {
    userInfo: null,
    hasUserInfo: false,
    showBindPhone: false,
    phone: '',
    smsCode: '',
    countdown: 0,
    openid: ''
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

  onInputPhone(e) {
    this.setData({ phone: e.detail.value });
  },

  onInputSmsCode(e) {
    this.setData({ smsCode: e.detail.value });
  },

  toggleBindPhone() {
    this.setData({ showBindPhone: !this.data.showBindPhone });
  },

  async getSmsCode() {
    if (this.data.countdown > 0) return;
    const { phone } = this.data;
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      return wx.showToast({ title: '请输入正确的手机号', icon: 'none' });
    }

    try {
      wx.showLoading({ title: '正在发送...' });
      const { token } = await db._request(`/auth/sms-token?phone=${phone}`);
      await db._request('/auth/send-sms', 'POST', { phone, token });
      wx.hideLoading();
      wx.showToast({ title: '验证码已发送' });
      
      this.setData({ countdown: 60 });
      this.timer = setInterval(() => {
        if (this.data.countdown <= 0) {
          clearInterval(this.timer);
          return;
        }
        this.setData({ countdown: this.data.countdown - 1 });
      }, 1000);
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: err.data?.message || '发送失败', icon: 'none' });
    }
  },

  async onBindPhone() {
    const { phone, smsCode, openid } = this.data;
    if (!phone || !smsCode) {
      return wx.showToast({ title: '请填写完整信息', icon: 'none' });
    }

    try {
      wx.showLoading({ title: '正在绑定...' });
      const res = await db._request('/auth/wx/phone-login', 'POST', {
        phone,
        smsCode,
        openid,
        appType: 'cashier'
      });
      
      wx.hideLoading();
      if (res.data) {
        app.globalData.userInfo = res.data;
        wx.showToast({ title: '绑定成功', icon: 'success' });
        setTimeout(() => {
          wx.reLaunch({ url: '/pages/index/index' });
        }, 1000);
      }
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: err.data?.message || '绑定失败', icon: 'none' });
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
        const user = loginRes.data;
        // 如果手机号是虚拟的（由时间戳生成，长度通常 > 11）或者缺失，则引导绑定
        if (!user.phone || user.phone.length > 11) {
          wx.hideLoading();
          this.setData({
            showBindPhone: true,
            openid: loginRes.openid
          });
          wx.showToast({ title: '请先验证手机号', icon: 'none' });
          return;
        }

        app.globalData.userInfo = user;
        if (loginRes.openid) {
          wx.setStorageSync('openid', loginRes.openid);
        }
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