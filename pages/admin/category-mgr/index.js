const { db, TABLES } = require('../../../utils/db');

Page({
  data: {
    categories: [],
    showAdd: false,
    newName: '',
    activeId: '',
    storeId: ''
  },

  onLoad() {
    // 优先从持久化的“中间值”中获取 store_id
    const sid = db.getStoreId();
    if (sid) {
      this.setData({ storeId: sid });
    } else {
      wx.showToast({ title: '门店信息失效', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1000);
    }
  },

  onShow() {
    this.loadData();
  },

  async loadingCategory() {
    try {
        // 调用后端接口获取分类列表
        const res = await db._request(`/store/category/${this.data.storeId}`, 'GET', {});
        const categories = res || [];
        this.setData({ 
          categories,
          activeId: this.data.activeId || (categories[0] ? categories[0].category_id : '')
        });
      } catch (err) {
        console.error('加载分类失败:', err);
        wx.showToast({ title: '加载失败', icon: 'none' });
      }
  },

  async loadData() {
    this.loadingCategory();
  },

  selectCategory(e) {
    this.setData({ activeId: e.currentTarget.dataset.id });
  },

  toggleAdd() {
    this.setData({ showAdd: !this.data.showAdd, newName: '' });
  },

  onInput(e) {
    this.setData({ newName: e.detail.value });
  },

  async addCategory() {
    if (!this.data.newName) return;
    try {
      wx.showLoading({ title: '保存中...' });
      // 明确指定 pid 为 0，并带上 store_id
      await db._request('/store/category', 'POST', {
        name: this.data.newName,
        pid: '0',
        store_id: this.data.storeId
      });
      this.toggleAdd();
      this.loadData();
      wx.hideLoading();
      wx.showToast({ title: '添加成功' });
      this.loadingCategory();
    } catch (err) {
      wx.hideLoading();
      console.error('添加分类失败:', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  async deleteCategory(e) {
    const id = this.data.activeId;
    wx.showModal({
      title: '提示',
      content: '确定删除该分类吗？',
      success: async (res) => {
        if (res.confirm) {
        //   await db.remove(TABLES.CATEGORIES, id);
            await db._request(`/store/category/${id}`, "DELETE");
            this.loadingCategory();
        }
      }
    });
  }
});
