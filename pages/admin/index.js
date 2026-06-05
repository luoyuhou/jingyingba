const { db } = require('../../utils/db');

Page({
  data: {
    sid: ''
  },
  onShow() {
    // 每次显示时重新获取最新的 store_id，确保“中间值”生效
    const sid = db.getStoreId();
    this.setData({ sid });
    if (!sid) {
      wx.showToast({ title: '请先选择门店', icon: 'none' });
      setTimeout(() => {
        wx.reLaunch({ url: '/pages/index/index' });
      }, 1000);
    }
  },
  navTo(e) {
    wx.navigateTo({
      url: e.currentTarget.dataset.url
    });
  }
});
