const { db, TABLES } = require('../../../utils/db');

Page({
  data: {
    cashiers: [],
    showAdd: false,
    currentCashier: null,
    newName: '',
    newUsername: ''
  },


  onShow() {
    this.loadData();
  },

  async loadData() {
    const cashiers = await db.list(TABLES.CASHIERS);
    this.setData({ cashiers });
  },

  toggleAdd() {
    this.setData({ 
      showAdd: !this.data.showAdd, 
      newName: '', 
      newUsername: ''
    });
  },

  onInput(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ [field]: e.detail.value });
  },

  async addCashier() {
    const { newName, newUsername } = this.data;
    if (!newName || !newUsername) {
      wx.showToast({ title: '请填写完整信息', icon: 'none' });
      return;
    }

    // 检查用户名唯一性
    const cashiers = await db.list(TABLES.CASHIERS);
    if (cashiers.find(c => c.username === newUsername)) {
      wx.showToast({ title: '该手机号已存在', icon: 'none' });
      return;
    }

    await db.add(TABLES.CASHIERS, {
      name: newName,
      username: newUsername,
      status: 'active' // 默认启用
    });

    this.toggleAdd();
    this.loadData();
    wx.showToast({ title: '添加成功' });
  },

  async toggleStatus(e) {

    const { id, status } = e.currentTarget.dataset;
    const newStatus = status === 'active' ? 'disabled' : 'active';
    
    await db.update(TABLES.CASHIERS, id, {
      status: newStatus
    });

    this.loadData();
    wx.showToast({ title: newStatus === 'active' ? '已启用' : '已禁用' });
  },

  async deleteCashier(e) {
    const { id } = e.currentTarget.dataset;
    wx.showModal({
      title: '提示',
      content: '确定删除该收银员吗？',
      success: async (res) => {
        if (res.confirm) {
          await db.remove(TABLES.CASHIERS, id);
          this.loadData();
        }
      }
    });
  }
});
