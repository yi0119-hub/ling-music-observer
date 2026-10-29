/* 玲的音樂觀察室 v5 — 可存取、手機優先的分頁導覽（不動 Spotify / 聊天 API）。 */
(() => {
  'use strict';
  const KEY = 'ling-ui-active-tab-v5';
  const tabNames = ['music', 'chat', 'settings'];
  const tabs = new Map(tabNames.map(name => [name, document.getElementById('tab-' + name)]));
  const panels = new Map(tabNames.map(name => [name, document.getElementById('panel-' + name)]));
  if ([...tabs.values(), ...panels.values()].some(node => !node)) return;

  function selectTab(name, { focus = false, scroll = false } = {}) {
    if (!tabs.has(name)) name = 'music';
    for (const key of tabNames) {
      const active = key === name;
      const button = tabs.get(key);
      const panel = panels.get(key);
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
      panel.hidden = !active;
    }
    try { localStorage.setItem(KEY, name); } catch { /* 私密瀏覽或儲存空間限制 */ }
    if (focus) tabs.get(name).focus();
    if (scroll) window.scrollTo({ top: 0, behavior: 'auto' });
  }

  for (const [name, button] of tabs) {
    button.addEventListener('click', () => selectTab(name, { scroll: true }));
    button.addEventListener('keydown', event => {
      const here = tabNames.indexOf(name);
      let next = null;
      if (event.key === 'ArrowRight') next = tabNames[(here + 1) % tabNames.length];
      else if (event.key === 'ArrowLeft') next = tabNames[(here + tabNames.length - 1) % tabNames.length];
      else if (event.key === 'Home') next = tabNames[0];
      else if (event.key === 'End') next = tabNames[tabNames.length - 1];
      if (next !== null) {
        event.preventDefault();
        selectTab(next, { focus: true, scroll: true });
      }
    });
  }

  for (const button of document.querySelectorAll('[data-go-tab]')) {
    button.addEventListener('click', () => selectTab(button.dataset.goTab, { focus: true, scroll: true }));
  }

  let restored = 'music';
  try { restored = localStorage.getItem(KEY) || 'music'; } catch { /* 無儲存權限 */ }
  selectTab(restored);
})();
