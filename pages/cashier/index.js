const { db, TABLES } = require('../../utils/db');
const util = require('../../utils/util');

Page({
  data: {
    storeId: '',
    categories: [],
    products: [],
    filteredProducts: [],
    activeCategoryId: 'all',
    searchKeyword: '',
    cart: [],
    totalAmount: '0.00',
    showCartDetail: false,
    showSuspendedList: false,
    showOrderHistory: false,
    historyOrders: [],
    historyPage: 1,
    historyPageSize: 5,
    historyHasMore: true,
    historyLoading: false,
    todayOrderCount: 0,
    showOrderDetailModal: false,
    selectedOrder: null,
    suspendedOrdersCount: 0,
    suspendedOrders: [],
    showWeightModal: false,
    tempProduct: null,
    inputWeight: '',
    searchPhone: '',
    member: null
  },

  onLoad(options) {
    if (options.sid) {
      this.setData({ storeId: options.sid });
      db.setStoreId(options.sid);
    } else {
      const sid = db.getStoreId();
      this.setData({ storeId: sid });
    }
  },

  resetCart() {
    this.setData({
      cart: [],
      totalAmount: '0.00',
      member: null,
      searchPhone: '',
      searchKeyword: '',
      showCartDetail: false
    });
  },

  async onShow() {
    // 检查是否需要清空购物车（结算成功后返回，支持全局变量和本地存储双重校验）
    const app = getApp();
    const shouldClear = (app && app.globalData && app.globalData.shouldClearCart) || wx.getStorageSync('shouldClearCart');
    
    if (shouldClear) {
      this.resetCart();
      if (app && app.globalData) {
        app.globalData.shouldClearCart = false;
        app.globalData.currentOrder = null;
      }
      wx.removeStorageSync('shouldClearCart');
    }




    wx.showLoading({ title: '加载中' });
    try {
      await this.loadData();
      await this.updateSuspendedData();
    } catch (err) {
      console.error('onShow error:', err);
    } finally {
      wx.hideLoading();
    }
  },


  async loadData() {
    try {
      if (!this.data.storeId) return;

      // 1. 获取分类
      const res = await db._request(`/store/category/${this.data.storeId}`, 'GET', {});
      const categories = (res || []).map(c => ({ id: c.category_id, name: c.name }));

      // 2. 获取商品
      let products = await db.list(TABLES.PRODUCTS);
      products = products.filter(p => p.status !== 'off');
      
      this.setData({ 
        categories: [{ id: 'all', name: '全部' }, ...categories],
        products,
        activeCategoryId: 'all' // 进入时默认选中全部
      }, () => {
        this.applyFilter();
      });
    } catch (err) {
      console.error('加载收银台数据失败:', err);
      wx.showToast({ title: '加载数据失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  async updateSuspendedData() {
    const orders = await db.list(TABLES.ORDERS);
    const suspendedOrders = orders.filter(o => o.status === 'pending');
    
    // 增加商品详情和小计计算
    const processedOrders = suspendedOrders.map(o => {
      const itemsWithSubtotal = o.items.map(item => {
        let subtotal = 0;
        const price = parseFloat(item.price) || 0;
        const qty = parseFloat(item.quantity) || 0;
        if (item.billingMode === 'weight') {
          subtotal = (price * qty / 500);
        } else {
          subtotal = (price * qty);
        }
        return {
          ...item,
          subtotal: subtotal.toFixed(2)
        };
      });

      return {
        ...o,
        items: itemsWithSubtotal,
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
      // 重置分页状态
      this.setData({
        historyOrders: [],
        historyPage: 1,
        historyHasMore: true,
        todayOrderCount: 0
      });
      // 加载订单数据和总数
      await Promise.all([
        this.loadHistoryOrders(),
        this.loadTodayOrderCount()
      ]);
    }
  },

  async loadTodayOrderCount() {
    try {
      const storeId = this.data.storeId;
      const count = await db._request(`/store/cashier/orders/today/${storeId}/count`, 'GET');
      this.setData({ todayOrderCount: count || 0 });
    } catch (err) {
      console.error('获取今日订单数失败:', err);
    }
  },

  async loadHistoryOrders() {
    const { historyPage, historyPageSize, historyLoading, historyHasMore, storeId } = this.data;
    
    if (historyLoading || !historyHasMore) return;
    
    this.setData({ historyLoading: true });
    wx.showLoading({ title: '加载中' });
    
    try {
      const historyOrders = await db._request(
        `/store/cashier/orders/today/${storeId}?page=${historyPage}&pageSize=${historyPageSize}`, 
        'GET'
      );
      
      // 后端已经返回了处理好的格式（memberName, memberPhone, items, billingMode 等）
      // 我们只需要对时间进行简单的格式化显示即可
      const processedOrders = (historyOrders || []).map(o => ({
        ...o,
        createdAt: util.formatTime(new Date(o.createdAt))
      }));
      
      // 判断是否还有更多数据
      const hasMore = processedOrders.length === historyPageSize;
      
      this.setData({
        historyOrders: [...this.data.historyOrders, ...processedOrders],
        historyPage: historyPage + 1,
        historyHasMore: hasMore,
        historyLoading: false
      });
    } catch (err) {
      console.error('获取历史订单失败:', err);
      wx.showToast({ title: '获取历史记录失败', icon: 'none' });
      this.setData({ historyLoading: false });
    } finally {
      wx.hideLoading();
    }
  },

  // 滚动到底部加载更多
  onHistoryScrollToLower() {
    if (this.data.historyHasMore && !this.data.historyLoading) {
      this.loadHistoryOrders();
    }
  },

  // 显示订单详情
  showOrderDetail(e) {
    const { order } = e.currentTarget.dataset;
    this.setData({
      showOrderDetailModal: true,
      selectedOrder: order
    });
  },

  // 关闭订单详情
  closeOrderDetail() {
    this.setData({
      showOrderDetailModal: false,
      selectedOrder: null
    });
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

    this.setData({ cart: [], totalAmount: '0.00', member: null, searchKeyword: '', showCartDetail: false });
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
    wx.showLoading({ title: '搜索中' });
    try {
      const member = await db.searchMember(this.data.searchPhone);
      if (member) {
        this.setData({ 
          member: {
            ...member,
            id: member.member_id,
            balance: (member.balance / 100).toFixed(2)
          }
        });
        wx.showToast({ title: '识别成功' });
      } else {
        wx.showToast({ title: '未找到会员', icon: 'none' });
      }
    } catch (err) {
      console.error('搜索会员失败:', err);
      wx.showToast({ title: '搜索失败', icon: 'none' });
    } finally {
      wx.hideLoading();
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
