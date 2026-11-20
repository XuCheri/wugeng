// 设置项：更房和暂停菜单共用。
import { h, segmented } from './dom.js';

const ONOFF = [{ value: true, label: '开' }, { value: false, label: '关' }];

/** onChange(nextSettings) 每次改动都会回调（调用方负责写档与应用）。 */
export function settingsBody(settings, onChange) {
  const set = (k) => (v) => { settings[k] = v; onChange({ ...settings }); };
  return h('div', { class: 'settings' },
    segmented('音效', ONOFF, settings.sfx, set('sfx')),
    segmented('乐声', ONOFF, settings.music, set('music')),
    segmented('震屏', ONOFF, settings.shake, set('shake')),
    segmented('伤害字', [
      { value: 'all', label: '全显' }, { value: 'crit', label: '只暴击' }, { value: 'off', label: '不显' },
    ], settings.dmgText, set('dmgText')),
    segmented('低画质', ONOFF, settings.lowQuality, set('lowQuality')));
}
