Page({
  navTo(e) {
    wx.navigateTo({
      url: e.currentTarget.dataset.url
    });
  }
});
