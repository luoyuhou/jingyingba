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
    expectedPoints: 0
  },

  async onLoad() {
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
      const maxDiscount = (availablePoints / ratio).toFixed(2);
      discountAmount = Math.min(parseFloat(maxDiscount), parseFloat(order.totalAmount));
      pointsToUse = Math.floor(discountAmount * ratio);
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
      // 1. 更新会员数据（积分和余额）
      if (member) {
        const updateData = {};
        // 扣除积分，增加新产生的积分
        const earnPoints = Math.floor(parseFloat(payableAmount) * (settings.pointsPerYuan || 1));
        updateData.points = (member.points || 0) - pointsToUse + earnPoints;
        
        if (paymentMethod === 'balance') {
          updateData.balance = (member.balance || 0) - parseFloat(payableAmount);
        }
        
        await db.update(TABLES.MEMBERS, member.id, updateData);
      }

      // 2. 保存订单
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
      
      // 设置标记，返回收银台时清空购物车
      getApp().globalData.shouldClearCart = true;
      
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '支付失败', icon: 'none' });
    }
  }
});
