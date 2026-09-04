const MENU_LINK = 'rumbo-guardian-analyze-link';
const MENU_SELECTION = 'rumbo-guardian-analyze-selection';

function installMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_LINK,
      title: 'Analizar enlace con RUMBO Guardian',
      contexts: ['link']
    });
    chrome.contextMenus.create({
      id: MENU_SELECTION,
      title: 'Analizar texto con RUMBO Guardian',
      contexts: ['selection']
    });
  });
}

chrome.runtime.onInstalled.addListener(installMenus);

async function openAnalysis(kind, value) {
  const token = crypto.randomUUID();
  const key = `pendingAnalysis:${token}`;
  const payload = { kind, value: String(value || '').slice(0, 12000), createdAt: Date.now() };
  await chrome.storage.session.set({ [key]: payload });
  await chrome.tabs.create({ url: chrome.runtime.getURL(`report.html?token=${encodeURIComponent(token)}`) });
}

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === MENU_LINK && info.linkUrl) openAnalysis('url', info.linkUrl);
  if (info.menuItemId === MENU_SELECTION && info.selectionText) openAnalysis('message', info.selectionText);
});
