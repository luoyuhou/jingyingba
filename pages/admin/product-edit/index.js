const { db, TABLES } = require('../../../utils/db');

Page({
  data: {
    id: '',
    name: '',
    price: '',
    billingMode: 'piece',
    selectedCategoryIds: [],
    categories: []
  },

  async onLoad(options) {
    const categories = await db.list(TABLES.CATEGORIES);
    this.setData({ categories });

    if (options.id) {
      const product = await db.get(TABLES.PRODUCTS, options.id);
      if (product) {
        this.setData({
          id: product.id,
          name: product.name,
          price: product.price,
          billingMode: product.billingMode || 'piece',
          selectedCategoryIds: product.categoryIds || []
        });
      }
    }
  },

  onInput(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ [field]: e.detail.value });
  },

  toggleCategory(e) {
    const { id } = e.currentTarget.dataset;
    let selected = [...this.data.selectedCategoryIds];
    const index = selected.indexOf(id);
    if (index === -1) {
      selected.push(id);
    } else {
      selected.splice(index, 1);
    }
    this.setData({ selectedCategoryIds: selected });
  },

  async save() {
    const { id, name, price, billingMode, selectedCategoryIds } = this.data;
    if (!name || !price) {
      wx.showToast({ title: '请填写完整信息', icon: 'none' });
      return;
    }

    const data = {
      name,
      price: parseFloat(price),
      billingMode: billingMode || 'piece',
      categoryIds: selectedCategoryIds
    };

    if (id) {
      await db.update(TABLES.PRODUCTS, id, data);
    } else {
      await db.add(TABLES.PRODUCTS, data);
    }

    wx.showToast({ title: '保存成功' });
    setTimeout(() => wx.navigateBack(), 1500);
  }
});
