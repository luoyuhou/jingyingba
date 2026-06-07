const { db, TABLES } = require('../../utils/db');

Page({
  data: {
    order: null,
    settings: null,
    pointsToUse: 0,
    discountAmount: 0,
    payableAmount: 0,
    usePoints: false,
    member: null,
    searchPhone: '',
    paymentMethod: 'cash', // 'cash' 或 'balance'
    expectedPoints: 0,
    scrollHeight: 0  // scroll-view 高度，由 JS 动态计算
  },

  async onLoad() {
    // 底部结算栏高度 140rpx，转换为 px（rpx 基准：screenWidth / 750）
    const { windowHeight, screenWidth } = wx.getSystemInfoSync();
    const footerPx = Math.ceil(140 * screenWidth / 750);
    this.setData({ scrollHeight: windowHeight - footerPx });

    const order = getApp().globalData.currentOrder;
    const settings = await db.getSettings();
    
    // 检查是否为积分抵扣日
    const today = new Date().getDate();
    const isRedemptionDay = !settings.redemptionDays || settings.redemptionDays.length === 0 || settings.redemptionDays.includes(today);

    this.setData({ 
      order, 
      settings,
      isRedemptionDay,
      payableAmount: order.totalAmount,
      member: order.member || null
    }, () => {
      this.calculateExpectedPoints();
    });
  },

  onPhoneInput(e) {
    this.setData({ searchPhone: e.detail.value });
  },

  async searchMember() {
    if (!this.data.searchPhone) return;
    const members = await db.list(TABLES.MEMBERS);
    const member = members.find(m => m.phone === this.data.searchPhone);
    if (member) {
      this.setData({ member, usePoints: false, discountAmount: 0, pointsToUse: 0 }, () => {
        this.updatePayableAmount();
      });
      wx.showToast({ title: '已匹配会员' });
    } else {
      wx.showToast({ title: '未找到会员', icon: 'none' });
    }
  },

  calculateExpectedPoints() {
    const { payableAmount, settings } = this.data;
    const points = Math.floor(parseFloat(payableAmount) * (settings.pointsPerYuan || 1));
    this.setData({ expectedPoints: points });
  },

  updatePayableAmount() {
    const total = parseFloat(this.data.order.totalAmount);
    const discount = parseFloat(this.data.discountAmount || 0);
    const payable = (total - discount).toFixed(2);
    this.setData({ payableAmount: payable }, () => {
      this.calculateExpectedPoints();
    });
  },

  togglePoints(e) {
    const usePoints = e.detail.value;
    const { isRedemptionDay, settings, member, order } = this.data;
    
    if (usePoints) {
      if (!isRedemptionDay) {
        wx.showModal({
          title: '提示',
          content: `今日非积分抵扣日，每月${settings.redemptionDays.join(',')}号方可使用积分。`,
          showCancel: false
        });
        this.setData({ usePoints: false });
        return;
      }
      if (!member) {
        wx.showToast({ title: '请先选择会员', icon: 'none' });
        this.setData({ usePoints: false });
        return;
      }
    }

    let discountAmount = 0;
    let pointsToUse = 0;

    if (usePoints && member) {
      const availablePoints = member.points || 0;
      const ratio = settings.pointsRedemptionRatio || 100;
      // 先计算最多可抵扣的积分（根据订单金额限制）
      const maxDiscountByAmount = parseFloat(order.totalAmount);
      const maxDiscountByPoints = availablePoints / ratio;
      // 取较小值作为实际抵扣金额
      discountAmount = Math.min(maxDiscountByAmount, maxDiscountByPoints);
      // 根据实际抵扣金额计算使用的积分（确保积分和金额完全对应）
      pointsToUse = Math.round(discountAmount * ratio);
      // 重新校准抵扣金额，确保与积分严格一致
      discountAmount = pointsToUse / ratio;
    }

    this.setData({
      usePoints,
      discountAmount,
      pointsToUse
    }, () => {
      this.updatePayableAmount();
    });
  },

  selectPaymentMethod(e) {
    const { method } = e.currentTarget.dataset;
    if (method === 'balance' && (!this.data.member || this.data.member.balance < parseFloat(this.data.payableAmount))) {
      wx.showToast({ title: '余额不足', icon: 'none' });
      return;
    }
    this.setData({ paymentMethod: method });
  },

  async confirmPayment() {
    const { order, pointsToUse, discountAmount, payableAmount, settings, member, paymentMethod } = this.data;
    
    if (paymentMethod === 'balance') {
      if (!member) return;
      if (member.balance < parseFloat(payableAmount)) {
        wx.showToast({ title: '余额不足', icon: 'none' });
        return;
      }
    }

    wx.showLoading({ title: '处理中' });

    try {
      // 1. 保存订单（余额和积分扣除现在由后端在 orders/sync 事务中处理，不再由前端 PATCH 修改）
      const finalOrder = await db.add(TABLES.ORDERS, {
        items: order.items,
        totalAmount: order.totalAmount,
        discountAmount,
        payableAmount,
        pointsUsed: pointsToUse,
        earnPoints: member ? Math.floor(parseFloat(payableAmount) * (settings.pointsPerYuan || 1)) : 0,
        memberId: member ? member.id : null,
        paymentMethod,
        status: 'completed',
        cashierId: getApp().globalData.currentCashierId || 'admin'
      });

      wx.hideLoading();
      wx.showToast({ title: '支付成功' });
      
      // 直接通过页面栈清空收银台购物车，确保返回时已清空
      const pages = getCurrentPages();
      const prevPage = pages.find(p => p.route === 'pages/cashier/index');
      if (prevPage) {
        if (typeof prevPage.resetCart === 'function') {
          prevPage.resetCart();
        } else {
          prevPage.setData({
            cart: [],
            totalAmount: '0.00',
            member: null,
            searchPhone: '',
            searchKeyword: '',
            showCartDetail: false
          });
        }
      }

      
      // 双重保险：设置 Storage 标记和全局变量
      wx.setStorageSync('shouldClearCart', true);
      getApp().globalData.shouldClearCart = true;
      getApp().globalData.currentOrder = null;
      
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);


    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '支付失败', icon: 'none' });
    }
  }
});
