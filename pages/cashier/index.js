const { db, TABLES } = require('../../utils/db');
const util = require('../../utils/util');

Page({
  data: {
    categories: [],
    products: [],
    filteredProducts: [],
    activeCategoryId: 'all',
    cart: [],
    totalAmount: 0,
    member: null,
    searchPhone: '',
    searchKeyword: '',
    suspendedOrdersCount: 0,
    suspendedOrders: [],
    showCartDetail: false,
    showSuspendedList: false,
    showOrderHistory: false, // 历史订单弹窗
    historyOrders: [], // 已结算订单列表
    showWeightModal: false, // 称重弹窗
    tempProduct: null, // 待称重商品
    inputWeight: '' // 输入重量 (g)
  },

  async onShow() {
    wx.showLoading({ title: '加载中' });
    await this.loadData();
    // 挂单数据目前建议通过后端拉取，此处仍调用统一 list 接口
    await this.updateSuspendedData();
    wx.hideLoading();
    
    // 检查是否需要清空购物车（结算成功后）

    if (getApp().globalData.shouldClearCart) {
      this.setData({
        cart: [],
        totalAmount: 0,
        member: null,
        searchPhone: '',
        searchKeyword: ''
      });
      getApp().globalData.shouldClearCart = false;
      this.applyFilter();
    }
  },

  async loadData() {
    const categories = await db.list(TABLES.CATEGORIES);
    let products = await db.list(TABLES.PRODUCTS);
    products = products.filter(p => p.status !== 'off');
    
    this.setData({ 
      categories: [{ id: 'all', name: '全部' }, ...categories],
      products,
      filteredProducts: products
    });
  },

  async updateSuspendedData() {
    const orders = await db.list(TABLES.ORDERS);
    const suspendedOrders = orders.filter(o => o.status === 'pending');
    
    // 增加商品预览
    const processedOrders = suspendedOrders.map(o => {
      const preview = o.items.map(i => i.name).join(', ');
      return {
        ...o,
        preview: preview.length > 20 ? preview.substring(0, 20) + '...' : preview,
        createdAt: util.formatTime(new Date(o.createdAt))
      };
    });

    this.setData({ 
      suspendedOrdersCount: suspendedOrders.length,
      suspendedOrders: processedOrders
    });
  },

  selectCategory(e) {
    const { id } = e.currentTarget.dataset;
    this.setData({ activeCategoryId: id, searchKeyword: '' }, () => {
      this.applyFilter();
    });
  },

  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value }, () => {
      this.applyFilter();
    });
  },

  onWeightInput(e) {
    this.setData({ inputWeight: e.detail.value });
  },

  closeWeightModal() {
    this.setData({ showWeightModal: false, tempProduct: null, inputWeight: '' });
  },

  confirmWeight() {
    const { tempProduct, inputWeight } = this.data;
    const weight = parseFloat(inputWeight);
    if (isNaN(weight) || weight <= 0) {
      wx.showToast({ title: '请输入有效重量', icon: 'none' });
      return;
    }

    // 不再预换算比例，直接保存克重
    const quantity = weight;
    
    let cart = [...this.data.cart];
    const index = cart.findIndex(item => item.id === tempProduct.id);
    if (index !== -1) {
      cart[index].quantity += quantity;
    } else {
      cart.push({ ...tempProduct, quantity: quantity });
    }

    this.calculateTotal(cart);
    this.closeWeightModal();
  },

  applyFilter() {
    const { products, activeCategoryId, searchKeyword } = this.data;
    let filtered = products;

    if (activeCategoryId !== 'all') {
      filtered = filtered.filter(p => (p.categoryIds || []).includes(activeCategoryId));
    }

    if (searchKeyword) {
      filtered = filtered.filter(p => p.name.includes(searchKeyword));
    }

    this.setData({ filteredProducts: filtered });
  },

  addToCart(e) {
    const { product } = e.currentTarget.dataset;
    
    // 如果是称重商品，弹出重量输入
    if (product.billingMode === 'weight') {
      this.setData({
        showWeightModal: true,
        tempProduct: product,
        inputWeight: ''
      });
      return;
    }

    let cart = [...this.data.cart];
    const index = cart.findIndex(item => item.id === product.id);
    if (index !== -1) {
      cart[index].quantity += 1;
    } else {
      cart.push({ ...product, quantity: 1 });
    }
    this.calculateTotal(cart);
  },

  updateQuantity(e) {
    const { id, delta } = e.currentTarget.dataset;
    let cart = [...this.data.cart];
    const index = cart.findIndex(item => item.id === id);
    if (index !== -1) {
      const item = cart[index];
      // 如果是称重商品，delta 传入的是 0.1 (代表 50g)，这里可以做特殊处理
      // 实际上在 wxml 中我已经根据 billingMode 传了不同的 delta
      const newQty = item.quantity + delta;
      
      if (newQty > 0) {
        // 限制小数位数，防止 JS 浮点计算错误
        cart[index].quantity = parseFloat(newQty.toFixed(3));
      } else {
        cart.splice(index, 1);
      }
      this.calculateTotal(cart);
    }
  },

  removeFromCart(e) {
    const { id } = e.currentTarget.dataset;
    let cart = this.data.cart.filter(item => item.id !== id);
    this.calculateTotal(cart);
  },

  calculateTotal(cart) {
    const total = cart.reduce((sum, item) => {
      const price = parseFloat(item.price) || 0;
      const qty = parseFloat(item.quantity) || 0;
      if (item.billingMode === 'weight') {
        return sum + (price * qty / 500);
      }
      return sum + (price * qty);
    }, 0);
    this.setData({ cart, totalAmount: total.toFixed(2) });
  },

  toggleCart() {
    if (this.data.cart.length === 0 && !this.data.showCartDetail) return;
    this.setData({ showCartDetail: !this.data.showCartDetail });
  },

  toggleSuspendedList() {
    this.setData({ showSuspendedList: !this.data.showSuspendedList });
  },

  async toggleOrderHistory() {
    const show = !this.data.showOrderHistory;
    this.setData({ showOrderHistory: show });
    if (show) {
      wx.showLoading({ title: '加载中' });
      const orders = await db.list(TABLES.ORDERS);
      const members = await db.list(TABLES.MEMBERS);
      
      const today = util.formatTime(new Date()).split(' ')[0];
      
      const historyOrders = orders
        .filter(o => o.status === 'completed' && o.createdAt.startsWith(today))
        .map(o => {
          const member = members.find(m => m.id === o.memberId);
          return {
            ...o,
            memberName: member ? member.name : '散客',
            memberPhone: member ? member.phone : '',
            createdAt: util.formatTime(new Date(o.createdAt))
          };
        })
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      this.setData({ historyOrders });
      wx.hideLoading();
    }
  },

  async hangUp() {
    if (this.data.cart.length === 0) return;
    
    await db.add(TABLES.ORDERS, {
      items: this.data.cart,
      totalAmount: this.data.totalAmount,
      memberId: this.data.member ? this.data.member.id : null,
      status: 'pending',
      createdAt: util.formatTime(new Date())
    });

    this.setData({ cart: [], totalAmount: 0, member: null, searchKeyword: '', showCartDetail: false });
    await this.updateSuspendedData();
    wx.showToast({ title: '已挂单' });
  },

  async pickUpOrder(e) {
    const { order } = e.currentTarget.dataset;
    // 如果当前购物车不为空，提示是否覆盖或合并（此处简化为覆盖）
    this.setData({
      cart: order.items,
      totalAmount: order.totalAmount,
      showSuspendedList: false
    });
    // 从挂单中移除
    await db.remove(TABLES.ORDERS, order.id);
    await this.updateSuspendedData();
    wx.showToast({ title: '已取出挂单' });
  },

  onPhoneInput(e) {
    this.setData({ searchPhone: e.detail.value });
  },

  navToAdmin() {
    wx.navigateTo({
      url: '/pages/admin/index'
    });
  },

  async searchMember() {
    if (!this.data.searchPhone) return;
    const members = await db.list(TABLES.MEMBERS);
    const member = members.find(m => m.phone === this.data.searchPhone);
    if (member) {
      this.setData({ member });
    } else {
      wx.showToast({ title: '未找到会员', icon: 'none' });
    }
  },

  clearCart() {
    wx.showModal({
      title: '提示',
      content: '确定要清空购物车吗？',
      success: (res) => {
        if (res.confirm) {
          this.setData({ cart: [], totalAmount: '0.00', showCartDetail: false });
        }
      }
    });
  },

  onSlideChange(e) {
    // 处理滑动逻辑
  },

  checkout() {
    if (this.data.cart.length === 0) return;
    const orderData = {
      items: this.data.cart,
      totalAmount: this.data.totalAmount,
      member: this.data.member
    };
    getApp().globalData.currentOrder = orderData;
    wx.navigateTo({ url: '/pages/checkout/index' });
  }
});
