/**
 * API 抽象层 - 统一在线运行
 * 移除本地存储逻辑，所有数据操作通过 open-api
 */

const util = require('./util');
const BASE_URL = 'http://127.0.0.1:3000/api'; // 后端 API 地址

const STORAGE_KEY_PREFIX = 'catering_';

const TABLES = {
  CATEGORIES: 'categories',
  PRODUCTS: 'products',
  MEMBERS: 'members',
  ORDERS: 'orders',
  CASHIERS: 'cashiers',
  RECHARGES: 'recharges',
  SETTINGS: 'settings'
};

class DB {
  constructor() {
    this.storeId = wx.getStorageSync(STORAGE_KEY_PREFIX + 'store_id') || '';
  }

  setStoreId(id) {
    this.storeId = id;
    wx.setStorageSync(STORAGE_KEY_PREFIX + 'store_id', id);
  }

  getStoreId() {
    if (this.storeId) return this.storeId;
    this.storeId = wx.getStorageSync(STORAGE_KEY_PREFIX + 'store_id') || '';
    return this.storeId;
  }

  async _request(url, method = 'GET', data = {}) {
    return new Promise((resolve, reject) => {
      const header = {
        'content-type': 'application/json'
      };
      
      // 参考 mini_apps，组装完整的 Cookie 字符串
      const cookieObj = {};
      const cookieNames = ['cookie', 'connect.sid', 'token'];
      cookieNames.forEach(name => {
        const val = wx.getStorageSync(name);
        if (val) {
          const key = name === 'cookie' ? 'connect.sid' : name;
          cookieObj[key] = val;
        }
      });

      const cookieStr = Object.keys(cookieObj).map(key => `${key}=${cookieObj[key]}`).join('; ');
      if (cookieStr) {
        header['Cookie'] = cookieStr;
      }

      console.log(`[DB Request] ${method} ${BASE_URL + url}`, { header, data });

      wx.request({
        url: BASE_URL + url,
        method,
        data,
        header,
        success: (res) => {
          console.log(`[DB Response] ${url} [${res.statusCode}]`);
          
          // 解析并保存 Set-Cookie
          const setCookieHeader = res.header['Set-Cookie'] || res.header['set-cookie'];
          if (setCookieHeader) {
            setCookieHeader.split(',').forEach(item => {
              const pair = item.split(';')[0].split('=');
              if (pair.length === 2) {
                const key = pair[0].trim();
                const val = pair[1].trim();
                wx.setStorageSync(key, val);
                console.log(`[DB Cookie Saved] ${key}=${val}`);
              }
            });
          }

          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(res.data);
          } else if (res.statusCode === 401) {
             console.warn('[DB 401] Unauthorized access to:', url);
             const pages = getCurrentPages();
             const currentPage = pages[pages.length - 1]?.route;
             if (currentPage !== 'pages/login/index') {
                wx.reLaunch({ url: '/pages/login/index' });
             }
             reject({ statusCode: 401, data: res.data });
          } else {
            reject({ statusCode: res.statusCode, data: res.data });
          }
        },
        fail: (err) => {
          console.error(`[DB Request Fail] ${url}`, err);
          wx.showToast({ title: '网络连接失败', icon: 'none' });
          reject(err);
        }
      });
    });
  }

  /**
   * 获取列表数据
   */
  async list(table, params = {}) {
    if (!this.storeId && table !== TABLES.SETTINGS) {
       wx.redirectTo({ url: '/pages/index/index' });
       return [];
    }
    switch (table) {
      case TABLES.CATEGORIES:
      case TABLES.PRODUCTS:
        const data = await this._request(`/store/cashier/sync/${this.storeId}`);
        return table === TABLES.CATEGORIES ? data.categories : data.products;
      
      case TABLES.ORDERS:
        // 1. 获取本地挂单
        const localPending = wx.getStorageSync(`suspended_orders_${this.storeId}`) || [];
        // 2. 在线查询今日已完成订单
        let history = [];
        try {
          // 如果传入了 memberId，则获取该会员的所有历史订单（不仅仅是今日）
          if (params.memberId) {
            history = await this._request(`/store/member/orders/${params.memberId}`);
          } else {
            history = await this._request(`/store/cashier/orders/today/${this.storeId}`);
          }
        } catch (e) {
          console.warn('获取历史订单失败', e);
        }
        // 适配后端返回的字段名，确保 memberId 存在
        const adaptedHistory = (history || []).map(o => ({
          ...o,
          memberId: o.memberId || o.user_id // 优先使用 memberId，兼容后端逻辑
        }));
        return [...localPending, ...adaptedHistory];
      
      case TABLES.MEMBERS:
        const members = await this._request(`/store/member/list/${this.storeId}`, 'GET', params);
        return (members || []).map(m => ({
          ...m,
          id: m.member_id,
          memberId: m.member_id, // 统一字段
          balance: (m.balance / 100).toFixed(2) // 分转元
        }));
      
      case TABLES.RECHARGES:
        // 支持按会员 ID 过滤
        const query = { ...params };
        if (query.memberId) {
          query.member_id = query.memberId;
          delete query.memberId;
        }
        const recharges = await this._request(`/store/member/recharges/${this.storeId}`, 'GET', query);
        return (recharges || []).map(r => ({
          ...r,
          memberId: r.member_id,
          amount: (r.amount / 100).toFixed(2),
          receivedAmount: (r.received_amount / 100).toFixed(2),
          timestamp: r.create_date
        }));


      
      default:
        return [];
    }

  }


  /**
   * 搜索会员
   */
  async searchMember(phone) {
    return await this._request('/store/member/search', 'GET', {
      store_id: this.storeId,
      phone
    });
  }

  /**
   * 获取单条数据
   */
  async get(table, id) {
    if (table === TABLES.MEMBERS) {
      const res = await this._request(`/store/member/${id}`);
      return {
        ...res,
        id: res.member_id,
        balance: (res.balance / 100).toFixed(2)
      };
    }
    return null;
  }


  /**
   * 新增数据
   */
  async add(table, data) {
    if (table === TABLES.MEMBERS) {
      return await this._request('/store/member', 'POST', {
        ...data,
        store_id: this.storeId
      });
    }

    if (table === TABLES.RECHARGES) {
      return await this._request('/store/member/recharge', 'POST', {
        member_id: data.memberId,
        store_id: this.storeId,
        amount: Math.round(data.amount * 100),
        received_amount: Math.round(data.receivedAmount * 100),
        cashier_name: data.cashierName,
        remark: data.remark || ''
      });
    }

    if (table === TABLES.ORDERS) {


      // 挂单：仅保存在本地
      if (data.status === 'pending') {
        const localPending = wx.getStorageSync(`suspended_orders_${this.storeId}`) || [];
        const newOrder = {
          ...data,
          id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        };
        localPending.unshift(newOrder);
        wx.setStorageSync(`suspended_orders_${this.storeId}`, localPending);
        return newOrder;
      }

      // 结算：提交到后端
      const payload = {
        store_id: this.storeId,
        order: {
          local_id: Date.now().toString(),
          member_id: data.memberId,
          total_amount: Math.round(parseFloat(data.totalAmount) * 100),
          payable_amount: Math.round(parseFloat(data.payableAmount || data.totalAmount) * 100),
          payment_method: data.paymentMethod,
          points_used: data.pointsUsed || 0,
          earn_points: data.earnPoints || 0,
          created_at: util.formatTime(new Date()),
          items: data.items.map(i => ({
            goods_id: i.id,
            version_id: i.versions?.[0]?.id || i.id,
            count: i.quantity,
            name: i.name,
            price: Math.round(parseFloat(i.price) * 100)
          }))
        }
      };

      const [res] = await this._request('/store/cashier/order', 'POST', payload);
      if (res && res.status === 'success') {
        wx.showToast({ title: '结算成功' });
        return { ...data, id: res.remote_id };
      }
      throw new Error('结算失败');
    }

    if (table === TABLES.PRODUCTS) {
      const payload = {
        store_id: this.storeId,
        category_id: data.categoryIds?.[0] || '',
        name: data.name,
        description: data.description || '',
        price: Math.round(data.price * 100), // 元转分
        unit_name: data.billingMode === 'weight' ? '斤' : '件',
        count: 9999, // 默认无限库存
        version_number: 'v1'
      };
      return await this._request('/store/goods', 'POST', payload);
    }

    if (table === TABLES.CATEGORIES) {
      return await this._request('/store/category', 'POST', {
        name: data.name,
        pid: '0',
        store_id: this.storeId
      });
    }
  }

  /**
   * 更新数据
   */
  async update(table, id, data) {
    if (table === TABLES.PRODUCTS) {
      const payload = {
        name: data.name,
        category_id: data.categoryIds?.[0],
        price: data.price ? Math.round(data.price * 100) : undefined,
        unit_name: data.billingMode ? (data.billingMode === 'weight' ? '斤' : '件') : undefined,
        status: data.status === 'off' ? 0 : (data.status === 'on' ? 1 : undefined)
      };
      return await this._request(`/store/goods/${id}`, 'PATCH', payload);
    }

    if (table === TABLES.CATEGORIES) {
      return await this._request(`/store/category/${id}`, 'PATCH', data);
    }

    if (table === TABLES.MEMBERS) {
      return await this._request(`/store/member/${id}`, 'PATCH', data);
    }
  }

  /**
   * 移除数据
   */
  async remove(table, id) {
    if (table === TABLES.MEMBERS) {
      return await this._request(`/store/member/${id}`, 'DELETE');
    }

    if (table === TABLES.ORDERS) {

      const localPending = wx.getStorageSync(`suspended_orders_${this.storeId}`) || [];
      const index = localPending.findIndex(o => o.id === id);
      if (index !== -1) {
        localPending.splice(index, 1);
        wx.setStorageSync(`suspended_orders_${this.storeId}`, localPending);
        return true;
      }
    }

    if (table === TABLES.PRODUCTS) {
      return await this._request(`/store/goods/${id}`, 'DELETE');
    }
    if (table === TABLES.CATEGORIES) {
      return await this._request(`/store/category/${id}`, 'DELETE');
    }
  }

  async getSettings() {
    return {
      pointsPerYuan: 1,
      pointsRedemptionRatio: 100,
      redemptionEnabled: true,
      redemptionDays: []
    };
  }
}

const db = new DB();

module.exports = {
  db,
  TABLES
};
