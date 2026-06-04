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
  async list(table) {
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
        // 在线查询当日已完成订单（可根据需要扩展后端接口）
        const history = await this._request(`/store/cashier/orders/today/${this.storeId}`);
        return history || [];
      
      case TABLES.MEMBERS:
        // 建议使用专门的搜索接口，此处仅为占位
        return [];
      
      default:
        return [];
    }
  }

  /**
   * 获取单条数据
   */
  async get(table, id) {
    if (table === TABLES.MEMBERS) {
      return await this._request(`/store/member/${id}`);
    }
    return null;
  }

  /**
   * 新增数据（主要用于创建订单）
   */
  async add(table, data) {
    if (table === TABLES.ORDERS) {
      const payload = {
        store_id: this.storeId,
        orders: [{
          local_id: Date.now().toString(),
          member_id: data.memberId,
          total_amount: Math.round(parseFloat(data.totalAmount) * 100),
          created_at: util.formatTime(new Date()),
          items: data.items.map(i => ({
            goods_id: i.id,
            version_id: i.versions?.[0]?.id || i.id,
            count: i.quantity,
            price: Math.round(parseFloat(i.price) * 100)
          }))
        }]
      };
      const [res] = await this._request('/store/cashier/sync/orders', 'POST', payload);
      if (res && res.status === 'success') {
        wx.showToast({ title: '结算成功' });
        return { ...data, id: res.remote_id };
      }
      throw new Error('结算失败');
    }
  }

  /**
   * 移除数据（例如取消挂单，由于挂单现在也建议在线化，此处根据实际业务调整）
   */
  async remove(table, id) {
    console.log('Remove not implemented for online mode');
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
