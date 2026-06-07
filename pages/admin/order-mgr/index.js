const { db, TABLES } = require('../../../utils/db');
const util = require('../../../utils/util');

Page({
  data: {
    orders: [],
    page: 1,
    pageSize: 10,
    hasMore: true,
    loading: false
  },

  async onLoad(options) {
    await this.loadData();
  },

  async loadData() {
    const { page, pageSize, loading, hasMore } = this.data;

    if (loading || !hasMore) return;

    this.setData({ loading: true });
    wx.showLoading({ title: '加载中' });

    try {
      const storeId = db.getStoreId();
      const orders = await db._request(
        `/store/cashier/orders/today/${storeId}?page=${page}&pageSize=${pageSize}`,
        'GET'
      );

      const processedOrders = (orders || []).map(o => ({
        ...o,
        createdAt: util.formatTime(new Date(o.createdAt))
      }));

      // 判断是否还有更多数据
      const newHasMore = processedOrders.length === pageSize;

      this.setData({
        orders: [...this.data.orders, ...processedOrders],
        page: page + 1,
        hasMore: newHasMore,
        loading: false
      });
    } catch (err) {
      console.error('加载订单列表失败:', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    } finally {
      wx.hideLoading();
    }
  },

  // 滚动到底部加载更多
  onScrollToLower() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadData();
    }
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
