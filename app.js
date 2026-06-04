// app.js
App({
  onLaunch() {
    console.log('App onLaunch triggered');
  },
  globalData: {
    userInfo: null,
    currentOrder: null,
    resumedOrder: null,
    currentCashierId: 'admin'
  }
})
