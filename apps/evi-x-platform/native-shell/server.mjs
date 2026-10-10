// Isolated ONLYOFFICE browser shell for local development. It serves no app
// API, user files, credentials or arbitrary static paths. Production must put
// this shell on a separate HTTPS hostname with the same origin policy.
import http from "node:http";
import { randomBytes } from "node:crypto";

function configuredOrigin(raw, label) {
  if (!raw || raw.trim() !== raw) throw Error(`${label} must be an explicit origin`);
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol) || url.pathname !== "/" || url.search || url.hash || url.username || url.password || raw.replace(/\/$/, "") !== url.origin) throw Error(`${label} must be an exact origin`);
  return url.origin;
}

const parentOrigin = configuredOrigin(process.env.EVI_X_ONLYOFFICE_BROWSER_APP_ORIGIN, "EVI_X_ONLYOFFICE_BROWSER_APP_ORIGIN");
const docsOrigin = configuredOrigin(process.env.EVI_X_ONLYOFFICE_BROWSER_ORIGIN, "EVI_X_ONLYOFFICE_BROWSER_ORIGIN");
const port = Number(process.env.EVI_X_ONLYOFFICE_SHELL_PORT || "3002");
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error("Invalid EVI_X_ONLYOFFICE_SHELL_PORT");
// A different port on 127.0.0.1 is NOT a cookie boundary. The app and Docs
// use the other two local names, while this shell binds a separate loopback
// host so even an HttpOnly app session cookie is not sent to the shell.
const shellHost = "127.0.0.2";
const shellOrigin = `http://${shellHost}:${port}`;
if (parentOrigin === shellOrigin || docsOrigin === shellOrigin || docsOrigin === parentOrigin) throw Error("The app, shell and Docs must have distinct origins");
if (process.env.EVI_X_ONLYOFFICE_LOCAL_DEV !== "1" || !["localhost", "127.0.0.1"].includes(new URL(parentOrigin).hostname) || !["localhost", "127.0.0.1"].includes(new URL(docsOrigin).hostname) || new URL(parentOrigin).hostname === new URL(docsOrigin).hostname) throw Error("The built-in shell server requires three distinct local hosts and synthetic-development only");

function page(nonce) {
  const settings = JSON.stringify({ parentOrigin, docsOrigin, channel: "evix-onlyoffice-editor-v1" }).replaceAll("<", "\\u003c");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#editor{margin:0;width:100%;height:100%;overflow:hidden;background:#f8fafc}#error{font:14px/1.6 system-ui,sans-serif;padding:20px;color:#713f12}</style></head><body><div id="editor"></div><script nonce="${nonce}">(function(){"use strict";const settings=${settings};let boundNonce=null,instance=null;function notify(type,message){if(boundNonce)window.parent.postMessage({channel:settings.channel,nonce:boundNonce,type,message:typeof message==="string"?message.slice(0,200):undefined},settings.parentOrigin)}function validScript(raw){try{const url=new URL(raw);return url.origin===settings.docsOrigin&&url.pathname==="/web-apps/apps/api/documents/api.js"&&!url.search&&!url.hash&&!url.username&&!url.password}catch{return false}}function fail(message){document.getElementById("error")?.remove();const p=document.createElement("p");p.id="error";p.textContent=message;document.body.appendChild(p);notify("error",message)}window.addEventListener("message",function(event){if(event.source!==window.parent||event.origin!==settings.parentOrigin||!event.data||event.data.channel!==settings.channel)return;const data=event.data;if(data.type==="init"&&!boundNonce){if(typeof data.nonce!=="string"||!/^[0-9a-f-]{36}$/i.test(data.nonce)||!validScript(data.scriptUrl)||!data.config||typeof data.config!=="object"||typeof data.config.token!=="string"||!data.config.document||typeof data.config.document.key!=="string")return;boundNonce=data.nonce;const script=document.createElement("script");script.src=data.scriptUrl;script.referrerPolicy="no-referrer";script.onerror=function(){fail("ONLYOFFICE 服务脚本无法加载。")};script.onload=function(){try{if(!window.DocsAPI||!window.DocsAPI.DocEditor)throw Error("ONLYOFFICE 编辑器接口未就绪。");const config=data.config;config.events={onAppReady:function(){notify("app-ready")},onDocumentReady:function(){notify("document-ready")},onDocumentStateChange:function(change){notify("dirty",change&&change.data?"yes":"no")},onRequestClose:function(){notify("request-close")},onError:function(error){notify("error",error&&error.data?String(error.data.errorCode||"编辑器错误"):"编辑器错误")}};instance=new window.DocsAPI.DocEditor("editor",config)}catch(error){fail(error&&error.message?String(error.message):"编辑器启动失败。")}};document.head.appendChild(script);return}if(data.type==="destroy"&&boundNonce&&data.nonce===boundNonce){try{instance&&instance.destroyEditor&&instance.destroyEditor()}catch{}notify("destroyed")}})})();</script></body></html>`;
}

const server = http.createServer((request, response) => {
  if (request.headers.host !== `${shellHost}:${port}`) {
    response.writeHead(421, { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8", "x-content-type-options": "nosniff" });
    response.end("Misdirected request");
    return;
  }
  const url = new URL(request.url || "/", shellOrigin);
  if (request.method !== "GET" || url.pathname !== "/" || url.search || url.hash) {
    response.writeHead(404, { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8", "x-content-type-options": "nosniff" });
    response.end("Not found");
    return;
  }
  const nonce = randomBytes(18).toString("base64");
  const csp = [
    "default-src 'none'",
    `script-src 'nonce-${nonce}' ${docsOrigin}`,
    `frame-src ${docsOrigin}`,
    `connect-src ${docsOrigin}`,
    `img-src ${docsOrigin} data:`,
    `font-src ${docsOrigin} data:`,
    "style-src 'unsafe-inline'",
    `form-action ${docsOrigin}`,
    `frame-ancestors ${parentOrigin}`,
    "base-uri 'none'",
    "object-src 'none'",
  ].join("; ");
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "content-security-policy": csp,
    "referrer-policy": "no-referrer",
    "permissions-policy": "camera=(), geolocation=(), microphone=(), payment=()",
    "x-content-type-options": "nosniff",
    "cross-origin-resource-policy": "same-origin",
  });
  response.end(page(nonce));
});
server.listen(port, shellHost, () => {
  process.stdout.write(`ONLYOFFICE isolated shell listening on ${shellOrigin}\n`);
});
