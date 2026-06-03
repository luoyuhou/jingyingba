const { db, TABLES } = require('../../../utils/db');

Page({
  data: {
    categories: [],
    showAdd: false,
    newName: '',
    activeId: ''
  },

  onShow() {
    this.loadData();
  },

  async loadData() {
    const categories = await db.list(TABLES.CATEGORIES);
    this.setData({ 
      categories,
      activeId: this.data.activeId || (categories[0] ? categories[0].id : '')
    });
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
    await db.add(TABLES.CATEGORIES, { name: this.data.newName });
    this.toggleAdd();
    this.loadData();
    wx.showToast({ title: '添加成功' });
  },

  async deleteCategory(e) {
    const { id } = e.currentTarget.dataset;
    wx.showModal({
      title: '提示',
      content: '确定删除该分类吗？',
      success: async (res) => {
        if (res.confirm) {
          await db.remove(TABLES.CATEGORIES, id);
          this.loadData();
        }
      }
    });
  }
});
