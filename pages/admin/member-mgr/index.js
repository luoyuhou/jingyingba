const { db, TABLES } = require('../../../utils/db');
const util = require('../../../utils/util');

Page({
  data: {
    members: [],
    filteredMembers: [],
    searchQuery: '',
    showAdd: false,
    showRecharge: false,
    showLogs: false,
    showMemberRecords: false,
    memberRecords: [],
    currentMember: null,
    rechargeAmount: '',
    receivedAmount: '',
    rechargeLogs: [],
    newName: '',
    newPhone: ''
  },

  onShow() {
    this.loadData();
  },

  async loadData() {
    const members = await db.list(TABLES.MEMBERS);
    const orders = await db.list(TABLES.ORDERS);
    const completedOrders = orders.filter(o => o.status === 'completed');

    const memberStats = members.map(member => {
      const memberOrders = completedOrders.filter(o => o.memberId === member.id);
      const orderCount = memberOrders.length;
      const totalSpent = memberOrders.reduce((sum, o) => sum + parseFloat(o.payableAmount || 0), 0).toFixed(2);
      
      return {
        balance: 0, // 默认余额
        ...member,
        orderCount,
        totalSpent
      };
    });

    this.setData({ 
      members: memberStats 
    }, () => {
      this.filterMembers();
    });
  },

  // 充值及记录相关
  async openRecharge(e) {
    const { member } = e.currentTarget.dataset;
    const allLogs = await db.list(TABLES.RECHARGES);
    const memberLogs = allLogs
      .filter(l => l.memberId === member.id)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .map(l => ({
        ...l,
        timestamp: util.formatTime(new Date(l.timestamp))
      }));

    this.setData({
      showRecharge: true,
      currentMember: member,
      rechargeAmount: '',
      receivedAmount: '',
      rechargeLogs: memberLogs
    });
  },

  onRechargeInput(e) {
    const val = e.detail.value;
    this.setData({
      rechargeAmount: val,
      receivedAmount: val // 默认联动到账金额
    });
  },

  closeRecharge() {
    this.setData({ 
      showRecharge: false, 
      currentMember: null,
      rechargeAmount: '',
      receivedAmount: '',
      rechargeLogs: []
    });
  },

  async openMemberRecords(e) {
    const { member } = e.currentTarget.dataset;
    wx.showLoading({ title: '加载中' });
    
    // 获取充值记录
    const allRecharges = await db.list(TABLES.RECHARGES);
    const memberRecharges = allRecharges.filter(l => l.memberId === member.id).map(l => ({
      ...l,
      typeLabel: '充值',
      amountDisplay: `+￥${l.receivedAmount}`,
      time: util.formatTime(new Date(l.timestamp))
    }));

    // 获取消费记录
    const allOrders = await db.list(TABLES.ORDERS);
    const memberOrders = allOrders.filter(o => o.memberId === member.id && o.status === 'completed').map(o => ({
      ...o,
      typeLabel: '消费',
      amountDisplay: `-￥${o.payableAmount}`,
      time: util.formatTime(new Date(o.createdAt))
    }));

    // 合并并按时间倒序排序
    const mergedRecords = [...memberRecharges, ...memberOrders].sort((a, b) => new Date(b.time) - new Date(a.time));

    this.setData({
      showMemberRecords: true,
      currentMember: member,
      memberRecords: mergedRecords
    });
    wx.hideLoading();
  },

  closeMemberRecords() {
    this.setData({
      showMemberRecords: false,
      currentMember: null,
      memberRecords: []
    });
  },

  async submitRecharge() {
    const { currentMember, rechargeAmount, receivedAmount } = this.data;
    const amount = parseFloat(rechargeAmount);
    const received = parseFloat(receivedAmount);

    if (isNaN(amount) || amount <= 0) {
      wx.showToast({ title: '请输入实收金额', icon: 'none' });
      return;
    }
    if (isNaN(received) || received <= 0) {
      wx.showToast({ title: '请输入到账金额', icon: 'none' });
      return;
    }

    const newBalance = (parseFloat(currentMember.balance) || 0) + received;
    
    // 1. 更新会员余额
    await db.update(TABLES.MEMBERS, currentMember.id, { balance: newBalance });

    // 2. 记录充值流水
    await db.add(TABLES.RECHARGES, {
      memberId: currentMember.id,
      memberName: currentMember.name,
      amount: amount,
      receivedAmount: received,
      cashierName: getApp().globalData.currentCashierName || '管理员',
      type: 'recharge',
      timestamp: util.formatTime(new Date())
    });

    wx.showToast({ title: '充值成功' });
    
    // 重新加载数据以刷新列表和弹窗内的记录
    this.loadData();
    
    // 刷新当前弹窗内的记录列表
    const allLogs = await db.list(TABLES.RECHARGES);
    const memberLogs = allLogs
      .filter(l => l.memberId === currentMember.id)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .map(l => ({
        ...l,
        timestamp: util.formatTime(new Date(l.timestamp))
      }));
    
    this.setData({
      rechargeAmount: '',
      receivedAmount: '',
      rechargeLogs: memberLogs,
      'currentMember.balance': newBalance
    });
  },

  onSearch(e) {
    this.setData({ searchQuery: e.detail.value }, () => {
      this.filterMembers();
    });
  },

  filterMembers() {
    const { members, searchQuery } = this.data;
    if (!searchQuery) {
      this.setData({ filteredMembers: members });
      return;
    }

    const filtered = members.filter(m => 
      m.name.includes(searchQuery) || m.phone.includes(searchQuery)
    );
    this.setData({ filteredMembers: filtered });
  },

  toggleAdd() {
    this.setData({ 
      showAdd: !this.data.showAdd, 
      newName: '', 
      newPhone: '' 
    });
  },

  onInput(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ [field]: e.detail.value });
  },

  async addMember() {
    const { newName, newPhone } = this.data;
    if (!newName || !newPhone) {
      wx.showToast({ title: '请填写完整信息', icon: 'none' });
      return;
    }

    // 检查手机号唯一性
    const members = await db.list(TABLES.MEMBERS);
    if (members.find(m => m.phone === newPhone)) {
      wx.showToast({ title: '手机号已存在', icon: 'none' });
      return;
    }

    await db.add(TABLES.MEMBERS, {
      name: newName,
      phone: newPhone,
      points: 0,
      balance: 0
    });

    this.toggleAdd();
    this.loadData();
    wx.showToast({ title: '添加成功' });
  },

  async deleteMember(e) {
    const { id } = e.currentTarget.dataset;
    wx.showModal({
      title: '提示',
      content: '确定删除该会员吗？',
      success: async (res) => {
        if (res.confirm) {
          await db.remove(TABLES.MEMBERS, id);
          this.loadData();
        }
      }
    });
  }
});
