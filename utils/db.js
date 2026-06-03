/**
 * 数据库抽象层
 * 支持本地存储 (wx.getStorageSync/setStorageSync) 
 * 预留远程存储接口
 */

const STORAGE_KEY_PREFIX = 'catering_';
const util = require('./util');
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
    this.isRemote = wx.getStorageSync(STORAGE_KEY_PREFIX + 'is_remote') || false;
  }

  setRemote(enabled) {
    this.isRemote = enabled;
    wx.setStorageSync(STORAGE_KEY_PREFIX + 'is_remote', enabled);
  }

  async _getRaw(table) {
    if (this.isRemote) {
      // TODO: 实现远程请求逻辑
      console.log('Fetching from remote:', table);
    }
    return wx.getStorageSync(STORAGE_KEY_PREFIX + table) || [];
  }

  async _saveRaw(table, data) {
    if (this.isRemote) {
      // TODO: 实现远程保存逻辑
      console.log('Saving to remote:', table, data);
    }
    wx.setStorageSync(STORAGE_KEY_PREFIX + table, data);
  }

  async list(table) {
    return await this._getRaw(table);
  }

  async get(table, id) {
    const list = await this._getRaw(table);
    return list.find(item => item.id === id);
  }

  async add(table, data) {
    const list = await this._getRaw(table);
    const newItem = {
      ...data,
      id: Date.now().toString(),
      createdAt: util.formatTime(new Date())
    };
    list.push(newItem);
    await this._saveRaw(table, list);
    return newItem;
  }

  async update(table, id, data) {
    const list = await this._getRaw(table);
    const index = list.findIndex(item => item.id === id);
    if (index !== -1) {
      list[index] = { ...list[index], ...data, updatedAt: util.formatTime(new Date()) };
      await this._saveRaw(table, list);
      return list[index];
    }
    return null;
  }

  async remove(table, id) {
    let list = await this._getRaw(table);
    list = list.filter(item => item.id !== id);
    await this._saveRaw(table, list);
  }

  // 快捷获取配置
  async getSettings() {
    const settings = await this._getRaw(TABLES.SETTINGS);
    return settings[0] || {
      pointsPerYuan: 1, // 每消费1元获得1积分
      pointsRedemptionRatio: 100, // 100积分抵扣1元
      redemptionEnabled: true,
      redemptionDays: [] // 积分抵扣日，例如 [5, 15, 25] 表示每月5, 15, 25号
    };
  }

  async saveSettings(data) {
    await this._saveRaw(TABLES.SETTINGS, [data]);
  }
}

const db = new DB();

module.exports = {
  db,
  TABLES
};
