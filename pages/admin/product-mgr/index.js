const { db, TABLES } = require('../../../utils/db');

Page({
  data: {
    products: [],
    displayProducts: [],
    categories: [],
    activeCategoryId: 'all',
    searchKeyword: '',
    stats: {
      total: 0,
      onSale: 0,
      offSale: 0,
      soldCount: 0
    },
    showCatModal: false,
    newCatName: '',
    showProductModal: false,
    editingProduct: {
      id: '',
      name: '',
      price: '',
      billingMode: 'piece', // 'piece' or 'weight'
      categoryIds: []
    }
  },

  onShow() {
    this.loadData();
  },

  async loadData() {
    const products = await db.list(TABLES.PRODUCTS);
    const categories = await db.list(TABLES.CATEGORIES);
    const orders = await db.list(TABLES.ORDERS);
    
    // 计算每个商品的已售总数
    const soldMap = {};
    orders.forEach(order => {
      if (order.status === 'completed') {
        order.items.forEach(item => {
          soldMap[item.id] = (soldMap[item.id] || 0) + (item.quantity || 0);
        });
      }
    });
    
    // 映射分类名称
    const categoryMap = {};
    categories.forEach(c => categoryMap[c.id] = c.name);
    
    const formattedProducts = products.map(p => ({
      ...p,
      soldCount: soldMap[p.id] || 0,
      categoryNames: (p.categoryIds || []).map(id => categoryMap[id]).join(', ')
    }));
    
    this.setData({ 
      products: formattedProducts,
      categories: [{ id: 'all', name: '全部' }, ...categories]
    }, () => {
      this.filterProducts();
    });
  },

  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value }, () => {
      this.filterProducts();
    });
  },

  selectCategory(e) {
    this.setData({ activeCategoryId: e.currentTarget.dataset.id }, () => {
      this.filterProducts();
    });
  },

  // 分类管理逻辑
  toggleCatModal() {
    this.setData({ showCatModal: !this.data.showCatModal, newCatName: '' });
  },

  onCatInput(e) {
    this.setData({ newCatName: e.detail.value });
  },

  async addCategory() {
    if (!this.data.newCatName) return;
    await db.add(TABLES.CATEGORIES, { name: this.data.newCatName });
    this.toggleCatModal();
    this.loadData();
    wx.showToast({ title: '分类添加成功' });
  },

  async deleteCategory(e) {
    const { id } = e.currentTarget.dataset;
    if (id === 'all') return;
    wx.showModal({
      title: '提示',
      content: '确定删除该分类吗？',
      success: async (res) => {
        if (res.confirm) {
          await db.remove(TABLES.CATEGORIES, id);
          if (this.data.activeCategoryId === id) {
            this.setData({ activeCategoryId: 'all' });
          }
          this.loadData();
        }
      }
    });
  },

  // 商品编辑逻辑 (Modal)
  openProductModal(e) {
    const id = e.currentTarget.dataset.id;
    if (id) {
      const product = this.data.products.find(p => p.id === id);
      this.setData({
        showProductModal: true,
        editingProduct: { ...product }
      });
    } else {
      this.setData({
        showProductModal: true,
        editingProduct: {
          id: '',
          name: '',
          price: '',
          billingMode: 'piece',
          categoryIds: this.data.activeCategoryId !== 'all' ? [this.data.activeCategoryId] : []
        }
      });
    }
  },

  closeProductModal() {
    this.setData({ showProductModal: false });
  },

  onProductInput(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({
      [`editingProduct.${field}`]: e.detail.value
    });
  },

  toggleProductCat(e) {
    const { id } = e.currentTarget.dataset;
    let categoryIds = [...this.data.editingProduct.categoryIds];
    const index = categoryIds.indexOf(id);
    if (index === -1) {
      categoryIds.push(id);
    } else {
      categoryIds.splice(index, 1);
    }
    this.setData({ 'editingProduct.categoryIds': categoryIds });
  },

  async saveProduct() {
    const { id, name, price, billingMode, categoryIds } = this.data.editingProduct;
    if (!name || !price) {
      wx.showToast({ title: '请填写完整', icon: 'none' });
      return;
    }

    // 检查重名 (排除正在编辑的商品本身)
    const isDuplicate = this.data.products.some(p => p.name === name && p.id !== id);
    if (isDuplicate) {
      wx.showToast({ title: '商品名称已存在', icon: 'none' });
      return;
    }

    const data = {
      name,
      price: parseFloat(price),
      billingMode: billingMode || 'piece',
      categoryIds
    };

    if (id) {
      await db.update(TABLES.PRODUCTS, id, data);
    } else {
      await db.add(TABLES.PRODUCTS, data);
    }

    wx.showToast({ title: '保存成功' });
    this.closeProductModal();
    this.loadData();
  },

  filterProducts() {
    const { products, activeCategoryId, searchKeyword } = this.data;
    let filtered = products;

    // 分类筛选
    if (activeCategoryId && activeCategoryId !== 'all') {
      filtered = filtered.filter(p => {
        const categoryIds = p.categoryIds || [];
        // 确保 ID 类型匹配，增强兼容性
        return categoryIds.some(catId => String(catId) === String(activeCategoryId));
      });
    }

    // 文字检索
    if (searchKeyword) {
      const kw = searchKeyword.trim().toLowerCase();
      filtered = filtered.filter(p => 
        (p.name && p.name.toLowerCase().indexOf(kw) !== -1) || 
        (p.categoryNames && p.categoryNames.toLowerCase().indexOf(kw) !== -1)
      );
    }

    // 统计
    const stats = {
      total: filtered.length,
      onSale: filtered.filter(p => p.status !== 'off').length,
      offSale: filtered.filter(p => p.status === 'off').length,
      soldCount: filtered.reduce((sum, p) => sum + (p.soldCount || 0), 0)
    };

    this.setData({ displayProducts: filtered, stats });
  },

  async toggleStatus(e) {
    const { id, status } = e.currentTarget.dataset;
    const newStatus = status === 'on' ? 'off' : 'on';
    await db.update(TABLES.PRODUCTS, id, { status: newStatus });
    this.loadData();
    wx.showToast({ 
      title: newStatus === 'on' ? '已上架' : '已停售/下架',
      icon: 'none'
    });
  },

  navToEdit(e) {
    const id = e.currentTarget.dataset.id || '';
    wx.navigateTo({
      url: `/pages/admin/product-edit/index?id=${id}`
    });
  },

  async deleteProduct(e) {
    const { id } = e.currentTarget.dataset;
    wx.showModal({
      title: '提示',
      content: '确定删除该商品吗？',
      success: async (res) => {
        if (res.confirm) {
          await db.remove(TABLES.PRODUCTS, id);
          this.loadData();
        }
      }
    });
  }
});
