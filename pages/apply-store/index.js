const { db } = require('../../utils/db');

Page({
  data: {
    formData: {
      store_name: '',
      phone: '',
      id_name: '',
      id_code: '',
      address: '',
      province: '',
      city: '',
      area: '',
      town: ''
    },
    regionRange: [[], [], [], []], // 省, 市, 区, 镇
    regionIndex: [0, 0, 0, 0],
    regionText: '',
    submitting: false,
    editId: null // 如果是修改模式，会有这个 ID
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ editId: options.id });
      this.loadDetail(options.id);
    }
    this.initRegion();
  },

  async loadDetail(id) {
    try {
      const res = await db._request(`/store/${id}`);
      if (res) {
        this.setData({
          formData: res,
          regionText: `${res.province_name || ''} ${res.city_name || ''} ${res.area_name || ''} ${res.town_name || ''}`
        });
      }
    } catch (err) {
      console.error('加载详情失败', err);
    }
  },

  async initRegion() {
    // 加载省份
    const provinces = await db._request('/general/province');
    const range = [provinces, [], [], []];
    this.setData({ 'regionRange': range });
  },

  async onRegionColumnChange(e) {
    const { column, value } = e.detail;
    const range = this.data.regionRange;
    const index = this.data.regionIndex;
    index[column] = value;

    if (column < 3) {
      // 重置后面的列
      for (let i = column + 1; i < 4; i++) {
        index[i] = 0;
        range[i] = [];
      }
      
      const parentCode = range[column][value].code;
      const subRes = await db._request(`/general/province?pid=${parentCode}`);
      range[column + 1] = subRes;
      
      this.setData({ regionRange: range, regionIndex: index });
    } else {
      this.setData({ regionIndex: index });
    }
  },

  onRegionChange(e) {
    const index = e.detail.value;
    const range = this.data.regionRange;
    const province = range[0][index[0]] || {};
    const city = range[1][index[1]] || {};
    const area = range[2][index[2]] || {};
    const town = range[3][index[3]] || {};

    this.setData({
      'formData.province': province.code || '',
      'formData.city': city.code || '',
      'formData.area': area.code || '',
      'formData.town': town.town || '',
      regionText: `${province.name || ''} ${city.name || ''} ${area.name || ''} ${town.name || ''}`,
      regionIndex: index
    });
  },

  async onSubmit(e) {
    const values = e.detail.value;
    const { formData, editId } = this.data;
    
    // 合并表单数据
    const payload = {
      ...values,
      province: formData.province,
      city: formData.city,
      area: formData.area,
      town: formData.town,
      store_id: editId || undefined
    };

    // 校验
    if (!payload.store_name) return wx.showToast({ title: '请输入店铺名', icon: 'none' });
    if (!payload.phone || payload.phone.length !== 11) return wx.showToast({ title: '手机号格式错误', icon: 'none' });
    if (!payload.id_name) return wx.showToast({ title: '请输入姓名', icon: 'none' });
    if (!payload.id_code || payload.id_code.length !== 18) return wx.showToast({ title: '身份证格式错误', icon: 'none' });
    if (!payload.province) return wx.showToast({ title: '请选择地区', icon: 'none' });
    if (!payload.address) return wx.showToast({ title: '请输入详细地址', icon: 'none' });

    this.setData({ submitting: true });
    try {
      await db._request('/store', 'POST', payload);
      
      wx.showToast({ title: '提交成功', icon: 'success' });
      setTimeout(() => {
        wx.redirectTo({ url: '/pages/apply-list/index' });
      }, 1500);
    } catch (err) {
      wx.showToast({ title: '提交失败: ' + (err.data?.message || '未知错误'), icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  navToHistory() {
    wx.navigateTo({ url: '/pages/apply-list/index' });
  }
});