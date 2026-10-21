function setModalOpen(page, open) {
  const tab = typeof page.getTabBar === 'function' && page.getTabBar()
  if (tab && typeof tab.setData === 'function') tab.setData({ hidden:!!open })
}
module.exports = { setModalOpen }
