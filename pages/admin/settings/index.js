const { db } = require('../../../utils/db');

Page({
  data: {
    pointsPerYuan: 1,
    pointsRedemptionRatio: 100,
    redemptionDaysStr: '',
  },

  async onLoad() {
    const settings = await db.getSettings();
    this.setData({
      pointsPerYuan: settings.pointsPerYuan,
      pointsRedemptionRatio: settings.pointsRedemptionRatio,
      redemptionDaysStr: (settings.redemptionDays || []).join(','),
    });
  },

  onInput(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ [field]: e.detail.value });
  },

  async save() {
    const { pointsPerYuan, pointsRedemptionRatio, redemptionDaysStr } = this.data;
    
    // 解析抵扣日
    const redemptionDays = redemptionDaysStr
      .split(/[,，]/)
      .map(d => parseInt(d.trim()))
      .filter(d => !isNaN(d) && d >= 1 && d <= 31);

    await db.saveSettings({
      pointsPerYuan: parseFloat(pointsPerYuan),
      pointsRedemptionRatio: parseFloat(pointsRedemptionRatio),
      redemptionDays: redemptionDays
    });
    wx.showToast({ title: '设置已保存' });
  }
});
