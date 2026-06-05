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
      const totalSpent = memberOrders.reduce((sum, o) => sum + parseFloat(o.totalAmount || 0), 0).toFixed(2);
      
      return {
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
    // 传入 memberId 进行过滤
    const memberLogs = await db.list(TABLES.RECHARGES, { memberId: member.id });
    const formattedLogs = memberLogs
      .map(l => ({
        ...l,
        timestamp: util.formatTime(new Date(l.timestamp))
      }));

    this.setData({
      showRecharge: true,
      currentMember: member,
      rechargeAmount: '',
      receivedAmount: '',
      rechargeLogs: formattedLogs
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
    
    // 获取该会员的所有充值记录
    const memberRecharges = await db.list(TABLES.RECHARGES, { memberId: member.id });
    const formattedRecharges = memberRecharges.map(l => ({
      ...l,
      typeLabel: '充值',
      amountDisplay: `+￥${l.receivedAmount}`,
      time: util.formatTime(new Date(l.timestamp))
    }));

    // 获取该会员的所有历史消费记录
    const memberOrders = await db.list(TABLES.ORDERS, { memberId: member.id });
    const formattedOrders = memberOrders.map(o => ({
      ...o,
      typeLabel: '消费',
      amountDisplay: `-￥${o.totalAmount}`,
      time: util.formatTime(new Date(o.createdAt))
    }));

    // 合并并按时间倒序排序
    const mergedRecords = [...formattedRecharges, ...formattedOrders].sort((a, b) => new Date(b.time) - new Date(a.time));

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

    wx.showLoading({ title: '处理中' });
    try {
      // 1. 调用后端统一充值接口
      await db.add(TABLES.RECHARGES, {
        memberId: currentMember.id,
        amount: amount,
        receivedAmount: received,
        cashierName: getApp().globalData.currentCashierName || '管理员'
      });

      wx.showToast({ title: '充值成功' });
      
      // 2. 刷新列表和当前会员状态
      await this.loadData();
      const updatedMember = await db.get(TABLES.MEMBERS, currentMember.id);
      const memberLogs = await db.list(TABLES.RECHARGES, { memberId: currentMember.id });
      const formattedLogs = memberLogs.map(l => ({
        ...l,
        timestamp: util.formatTime(new Date(l.timestamp))
      }));
      
      this.setData({
        rechargeAmount: '',
        receivedAmount: '',
        rechargeLogs: formattedLogs,
        currentMember: updatedMember
      });

    } catch (err) {
      console.error('充值失败:', err);
      wx.showToast({ title: '充值失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
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
    // 先清空搜索框，确保 loadData 后的 filterMembers 能显示全部数据
    this.setData({ searchQuery: '' });
    await this.loadData();
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
