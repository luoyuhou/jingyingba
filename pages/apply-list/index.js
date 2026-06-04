const { db } = require('../../utils/db');

Page({
  data: {
    list: [],
    loading: false
  },

  onShow() {
    this.loadList();
  },

  async loadList() {
    this.setData({ loading: true });
    try {
      // 这里的接口路径参考 Controller 中的 apply-list
      const res = await db._request('/store/apply-list', 'POST', {
        pageNum: 0,
        pageSize: 5,
        filtered: [],
        sorted: [{ id: 'create_date', desc: true }]
      });
      
      this.setData({ 
        list: res.data || [],
        loading: false 
      });
    } catch (err) {
      this.setData({ loading: false });
      console.error('加载列表失败', err);
    }
  },

  onEdit(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/apply-store/index?id=${id}`
    });
  },

  navToApply() {
    wx.navigateTo({
      url: '/pages/apply-store/index'
    });
  }
});