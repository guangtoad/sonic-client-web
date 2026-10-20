/*
 *   sonic-client-web  Front end of Sonic cloud real machine platform.
 *   Copyright (C) 2022 SonicCloudOrg
 *
 *   This program is free software: you can redistribute it and/or modify
 *   it under the terms of the GNU Affero General Public License as published
 *   by the Free Software Foundation, either version 3 of the License, or
 *   (at your option) any later version.
 *
 *   This program is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *   GNU Affero General Public License for more details.
 *
 *   You should have received a copy of the GNU Affero General Public License
 *   along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
import JMuxerImport from 'jmuxer';

/**
 * 兼容 jmuxer UMD 在 Vite 预构建下的导出损坏问题：
 *
 * jmuxer 2.1.x 内部 `import { Duplex } from 'stream'`，Vite 将 Node 内建模块
 * `stream` 外部化为浏览器空 Proxy。其 UMD 包装器在工厂函数中只声明了
 * `(exports)` 形参（`module` 不在作用域内），导致条件
 * `typeof module !== 'undefined'` 为 false，转而走全局分支：
 *   globalThis.JMuxer = <构造函数>
 * 而 esbuild 的 `__commonJS` 取的是 `mod.exports`（始终为空对象 `{}`），
 * 致使 `import JMuxer from 'jmuxer'` 拿到的是 `{}`，调用
 * `new JMuxer(...)` 时报 "JMuxer is not a constructor"。
 *
 * 此处按优先级兜底取真实构造函数：默认导入 → default 命名空间 → UMD 全局。
 */
const JMuxer =
  typeof JMuxerImport === 'function'
    ? JMuxerImport
    : JMuxerImport && typeof JMuxerImport.default === 'function'
    ? JMuxerImport.default
    : typeof globalThis !== 'undefined' && typeof globalThis.JMuxer === 'function'
    ? globalThis.JMuxer
    : typeof window !== 'undefined' && typeof window.JMuxer === 'function'
    ? window.JMuxer
    : null;

if (typeof JMuxer !== 'function') {
  console.error(
    '[Scrcpy] JMuxer 构造函数未找到，jmuxer 模块导出异常。请检查 Vite 预构建缓存。'
  );
}

class Scrcpy {
  // 构造
  constructor(props) {
    const {
      excuteMode, // 运行模式
    } = props;
    this.props = props;
    this.excuteMode = excuteMode;
    // JMuxer初始化
    this.initial(props);
    // websocket初始化
    this.websocketInit(props);
    // 监听页面激活状态
    this.onPageFocus();
  }

  cmdFN(cmd) {
    if (cmd.msg == 'size') {
      console.log(`init size: ${cmd.width},${cmd.height}`);
      this.isInit = true;
    }
  }

  initial(props) {
    // 初始化播放器
    if (!this.jmuxer && this.excuteMode == 'Scrcpy') {
      const {
        node, // video dom节点
      } = props;
      this.jmuxer = new JMuxer({
        node: node || 'player',
        mode: 'video',
        flushingTime: 0,
        fps: 60,
        // readFpsFromTrack: true,
        debug: false,
      });
    }
  }

  websocketInit(props) {
    if (!this.websocket) {
      const { socketURL, onmessage } = props;
      this.websocket = new WebSocket(socketURL);
      this.websocket.binaryType = 'arraybuffer';
      this.websocket.addEventListener('message', (event) => {
        if (typeof event.data === 'string') {
          this.cmdFN(JSON.parse(event.data));
          onmessage && onmessage(event);
        } else if (
          typeof event.data === 'object' &&
          this.excuteMode == 'Scrcpy'
        ) {
          // console.log('feed!', this.excuteMode);
          this.jmuxer.feed({
            video: new Uint8Array(event.data),
          });
        } else {
          onmessage && onmessage(event);
        }
      });
      this.websocket.addEventListener('error', (e) => {
        console.log('Socket Error');
        const { onclose } = props;
        onclose && onclose(e);
      });
      this.websocket.addEventListener('open', (e) => {
        // console.log('open!!', e);
        this.websocket.send(
          JSON.stringify({
            type: 'switch',
            detail: this.excuteMode.toLowerCase(),
          })
        );
      });
    }
  }

  switchMode = (mode) => {
    this.excuteMode = mode;
    this.destroy();
    this.initial(this.props);
    this.websocket.send(
      JSON.stringify({
        type: 'switch',
        detail: this.excuteMode.toLowerCase(),
      })
    );
    if (mode !== 'Scrcpy') {
      // 重置播放器
      this.jmuxer && this.jmuxer.reset();
    }
  };

  destroy() {
    this.jmuxer && this.jmuxer.destroy();
    // 释放内存
    this.jmuxer = null;
    window.onfocus = null;
  }

  onPageFocus() {
    const videoDom = document.getElementById(this.props?.node || 'player');
    window.onfocus = function () {
      // 将当前播放进度更新至当前最新缓冲时间
      // 注意：窗口刚获得焦点时 video 可能尚未缓冲任何数据（buffered.length === 0），
      // 此时调用 buffered.end(0) 会抛 IndexSizeError，需先判空。
      if (videoDom && videoDom.buffered && videoDom.buffered.length > 0) {
        try {
          videoDom.currentTime = Math.ceil(videoDom.buffered.end(0));
        } catch (e) {
          // 忽略 TimeRanges 越界等异常，避免阻断 focus 回调
        }
      }
    };
  }
}

export default Scrcpy;
