import test from 'node:test';
import assert from 'node:assert/strict';
import { createFx, BOSS_NAMES, BOSS_EPITHETS } from '../../src/render/fx.js';
import { createAudio } from '../../src/audio/synth.js';

test('M1.4 Boss 演出：登场 1.2s 子弹时间(0.35x)、击败 0.8s 慢镜头(0.28x)与判词齐全', () => {
  for (const id of ['horse', 'umbrella', 'youshen']) {
    assert.ok(BOSS_NAMES[id] && BOSS_EPITHETS[id], `缺少夜主 ${id} 名称或判词`);
  }

  const fx = createFx({ seed: 101 });
  assert.equal(fx.timeScale, 1);

  // 登场：1.2s 压暗 + 0.35 倍子弹时间
  fx.onEvent({ type: 'bossSpawn', bossType: 'horse' });
  assert.equal(fx.timeScale, 0.35);
  fx.update(0.6);
  assert.equal(fx.timeScale, 0.35);
  fx.update(0.7);
  assert.equal(fx.timeScale, 1, '1.2s 后应恢复正常流速');

  // 击败：0.8s 慢镜头(0.28x) + 顿帧
  fx.onEvent({ type: 'bossDefeated', bossType: 'horse' });
  assert.equal(fx.timeScale, 0.28);
  assert.ok(fx.hitstop > 0);
  fx.update(0.4);
  assert.equal(fx.timeScale, 0.28);
  fx.update(0.5);
  assert.equal(fx.timeScale, 1, '0.8s 后应恢复正常流速');

  // clear 重置慢动作
  fx.onEvent({ type: 'bossSpawn', bossType: 'youshen' });
  assert.equal(fx.timeScale, 0.35);
  fx.clear();
  assert.equal(fx.timeScale, 1);
});

test('M1.4 Boss 专属配乐：bossSpawn 切入鼓点层，bossDefeated / dawn / 回更房恢复正常配乐', () => {
  const audio = createAudio();
  audio.setMusicMode('run');
  audio.setWatch(3);
  assert.equal(audio.bossMusic, false);

  // 即使关闭音效，Boss 配乐状态仍正常切换
  audio.setEnabled({ sfx: false, music: true });
  audio.onEvents([{ type: 'bossSpawn', bossType: 'umbrella' }]);
  assert.equal(audio.bossMusic, true);

  audio.onEvents([{ type: 'bossDefeated', bossType: 'umbrella' }]);
  assert.equal(audio.bossMusic, false);

  audio.onEvents([{ type: 'bossSpawn', bossType: 'youshen' }]);
  assert.equal(audio.bossMusic, true);
  audio.onEvents([{ type: 'dawn' }]);
  assert.equal(audio.bossMusic, false);

  audio.onEvents([{ type: 'bossSpawn', bossType: 'horse' }]);
  assert.equal(audio.bossMusic, true);
  audio.setMusicMode('menu');
  assert.equal(audio.bossMusic, false);
});
