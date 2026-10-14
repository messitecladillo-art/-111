# 同源 OCR 资源

Tesseract.js 与 core 均为锁定的 7.0.0；语言数据来自 naptha/tessdata 的 4.0.0_best_int。上游资源未修改，SHA-256、来源及许可在 manifest.json 登记。构建逐项核验字节和依赖包，新增或篡改文件使构建失败。

Worker 只加载同源脚本、嵌入 WASM 与中文/英文语言包；不请求 CDN。JavaScript/C++ 与语言包的 Apache 2.0 许可及第三方通知保留在目录。第一次 OCR 按需加载；语言包使用本地 IndexedDB 缓存。
