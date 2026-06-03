const { db, TABLES } = require('../../../utils/db');
const util = require('../../../utils/util');

Page({
  data: {
    orders: []
  },

  async onLoad(options) {
    await this.loadData();
  },

  async loadData() {
    let orders = await db.list(TABLES.ORDERS);
    const members = await db.list(TABLES.MEMBERS);
    
    // 仅展示已结算订单
    orders = orders.filter(o => o.status === 'completed');
    
    // 关联会员姓名和手机号
    orders = orders.map(o => {
      const member = members.find(m => m.id === o.memberId);
      return {
        ...o,
        memberName: member ? member.name : '散客',
        memberPhone: member ? member.phone : '',
        createdAt: util.formatTime(new Date(o.createdAt))
      };
    });

    // 按时间倒序
    orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    this.setData({ orders });
  },

  filterStatus(e) {
    const status = e.currentTarget.dataset.status;
    this.setData({ statusFilter: status }, () => this.loadData());
  },

  async pickupOrder(e) {
    const { id } = e.currentTarget.dataset;
    const order = await db.get(TABLES.ORDERS, id);
    if (order && order.status === 'pending') {
      // 获取会员信息（如果存在）
      let member = null;
      if (order.memberId) {
        member = await db.get(TABLES.MEMBERS, order.memberId);
      }

      // 准备恢复到收银台
      const pages = getCurrentPages();
      const cashierPage = pages.find(p => p.route === 'pages/cashier/index');
      
      if (cashierPage) {
        cashierPage.setData({
          cart: order.items,
          totalAmount: order.totalAmount,
          member,
          searchPhone: member ? member.phone : ''
        });
        // 删除该挂单记录
        await db.remove(TABLES.ORDERS, id);
        wx.navigateBack();
      } else {
        // 如果收银台不在页面栈，保存到全局并跳转
        getApp().globalData.resumedOrder = {
          cart: order.items,
          totalAmount: order.totalAmount,
          member
        };
        await db.remove(TABLES.ORDERS, id);
        wx.reLaunch({ url: '/pages/cashier/index' });
      }
    }
  }
});
