import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { NextResponse } from 'next/server';
import { boundedGatewayJson, localGatewayAllowed } from '@/lib/agent/local-gateway-policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AUTONOMOUS_CLI_TIMEOUT_MS = 90_000;

function resolveBackendPython(backendRoot: string): string {
  const winVenv = path.join(backendRoot, '.venv', 'Scripts', 'python.exe');
  if (fs.existsSync(winVenv)) return winVenv;
  const nixVenv = path.join(backendRoot, '.venv', 'bin', 'python');
  if (fs.existsSync(nixVenv)) return nixVenv;
  return process.platform === 'win32' ? 'python' : 'python3';
}

function buildPythonLaunchConfig() {
  const frontendRoot = process.cwd();
  const appsDir = path.dirname(frontendRoot);
  const repoRoot = path.dirname(appsDir);
  const backendRoot = path.join(appsDir, ['back', 'end'].join(''));
  const authoredDir = path.join(repoRoot, ['.local', 'authored'].join('/'));
  const pythonBin = resolveBackendPython(backendRoot);

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PYTHONPATH: 'src',
    PYTHONIOENCODING: 'utf-8',
    PYTHONUNBUFFERED: '1',
    EVIXLOCAL_AUTHORED_DIR: process.env.EVIXLOCAL_AUTHORED_DIR || authoredDir,
    EVIXLOCAL_AUTHORED_SLEEP: '0',
  };
  delete env.OPENAI_API_KEY;
  delete env.DEEPSEEK_API_KEY;

  return { backendRoot, pythonBin, env };
}

function runPythonAutonomousCli(payload: unknown): Promise<Record<string, unknown>> {
  const { backendRoot, pythonBin, env } = buildPythonLaunchConfig();

  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin, ['-m', 'application.autonomous_cli'], {
      cwd: backendRoot,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('自主探索分析运行超时（超过 90 秒），请缩小范围后重试。'));
    }, AUTONOMOUS_CLI_TIMEOUT_MS);

    const outChunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    child.stdout.on('data', chunk => outChunks.push(Buffer.from(chunk)));
    child.stderr.on('data', chunk => errChunks.push(Buffer.from(chunk)));
    child.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', code => {
      clearTimeout(timer);
      const stdout = Buffer.concat(outChunks).toString('utf8').trim();
      const stderr = Buffer.concat(errChunks).toString('utf8').trim();
      if (code !== 0 || !stdout) {
        reject(new Error(stderr || `自主探索服务未能正常完成 (${code})。`));
        return;
      }
      try {
        resolve(JSON.parse(stdout) as Record<string, unknown>);
      } catch {
        reject(new Error('自主探索服务返回的数据格式无效。'));
      }
    });

    child.stdin.on('error', () => undefined);
    child.stdin.write(JSON.stringify(payload ?? {}), 'utf8');
    child.stdin.end();
  });
}

function streamPythonAutonomousCli(payload: Record<string, unknown>, reqSignal: AbortSignal): Response {
  const { backendRoot, pythonBin, env } = buildPythonLaunchConfig();
  const encoder = new TextEncoder();
  let cleanupStream: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (reqSignal.aborted) {
        controller.close();
        return;
      }

      const child = spawn(pythonBin, ['-m', 'application.autonomous_cli'], {
        cwd: backendRoot,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });

      const decoder = new StringDecoder('utf8');
      const errChunks: Buffer[] = [];
      let lineBuffer = '';
      let closed = false;
      let childDone = false;
      let sawTerminalFrame = false;

      const killChild = () => {
        if (!childDone && !child.killed) {
          try {
            child.kill();
          } catch {
            // Child process may already be exiting.
          }
        }
      };

      const finish = () => {
        if (closed) return;
        closed = true;
        clearTimeout(timer);
        reqSignal.removeEventListener('abort', onAbort);
        try {
          controller.close();
        } catch {
          // Stream may already be closed or cancelled.
        }
      };

      const emitLine = (rawLine: string) => {
        const clean = rawLine.replace(/\r$/, '').trim();
        if (!clean || closed) return;
        try {
          const parsed = JSON.parse(clean) as { type?: unknown };
          if (parsed && (parsed.type === 'done' || parsed.type === 'error')) {
            sawTerminalFrame = true;
          }
        } catch {
          // Forward raw line; client parser validates frames.
        }
        try {
          controller.enqueue(encoder.encode(`${clean}\n`));
        } catch {
          closed = true;
          killChild();
        }
      };

      const emitErrorAndFinish = (message: string) => {
        if (!closed) {
          try {
            controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'error', error: message })}\n`));
          } catch {
            // Stream closed before error frame could be written.
          }
        }
        finish();
      };

      const onAbort = () => {
        killChild();
        finish();
      };

      cleanupStream = () => {
        closed = true;
        clearTimeout(timer);
        reqSignal.removeEventListener('abort', onAbort);
        killChild();
      };

      const timer = setTimeout(() => {
        killChild();
        emitErrorAndFinish('自主探索分析运行超时（超过 90 秒），请缩小范围后重试。');
      }, AUTONOMOUS_CLI_TIMEOUT_MS);

      reqSignal.addEventListener('abort', onAbort, { once: true });

      child.stdout.on('data', (chunk: Buffer) => {
        lineBuffer += decoder.write(chunk);
        let nlIdx = lineBuffer.indexOf('\n');
        while (nlIdx !== -1) {
          emitLine(lineBuffer.slice(0, nlIdx));
          lineBuffer = lineBuffer.slice(nlIdx + 1);
          nlIdx = lineBuffer.indexOf('\n');
        }
      });

      child.stderr.on('data', (chunk: Buffer) => {
        errChunks.push(Buffer.from(chunk));
      });

      child.on('error', err => {
        childDone = true;
        clearTimeout(timer);
        emitErrorAndFinish(err.message || '自主探索服务启动未成功。');
      });

      child.on('close', code => {
        childDone = true;
        clearTimeout(timer);
        lineBuffer += decoder.end();
        if (lineBuffer.trim()) {
          emitLine(lineBuffer);
          lineBuffer = '';
        }
        if (closed) return;
        const stderr = Buffer.concat(errChunks).toString('utf8').trim();
        if (!sawTerminalFrame && (code !== 0 || stderr)) {
          emitErrorAndFinish(stderr || `自主探索服务未能正常完成 (${code})。`);
          return;
        }
        if (!sawTerminalFrame) {
          emitErrorAndFinish('自主探索服务未返回完整的结束状态。');
          return;
        }
        finish();
      });

      child.stdin.on('error', () => undefined);
      child.stdin.write(JSON.stringify({ ...payload, stream: true }), 'utf8');
      child.stdin.end();
    },
    cancel() {
      cleanupStream?.();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store, no-transform',
    },
  });
}

export async function POST(req: Request) {
  if (!localGatewayAllowed(req)) {
    return NextResponse.json(
      { ok: false, code: 'offline', error: '本地自主探索服务仅在受信任的本地环境下启用，正式环境请先登录后发起项目研究探索。' },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await boundedGatewayJson(req, 1_500_000);
  } catch {
    return NextResponse.json({ ok: false, code: 'invalid_json', error: '提交的请求内容超出容量上限或格式不正确。' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ ok: false, code: 'invalid_payload', error: '缺少有效的研究探索配置。' }, { status: 422 });
  }

  const bodyObj = body as Record<string, unknown>;
  if (bodyObj.stream === true) {
    return streamPythonAutonomousCli(bodyObj, req.signal);
  }

  try {
    const run = await runPythonAutonomousCli(body);
    return NextResponse.json({ ok: true, run }, { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    return NextResponse.json(
      { ok: false, code: 'autonomous_failed', error: err instanceof Error ? err.message : '自主探索未能完成。' },
      { status: 500 },
    );
  }
}
