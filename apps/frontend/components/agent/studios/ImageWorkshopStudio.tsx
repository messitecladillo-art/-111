'use client';

import { useEffect, useMemo, useState } from 'react';
import { ACCENT } from '@/components/editors/PaperBlocks';
import type { EditorContent } from '@/lib/editor-model';
import { applyCoverImage, applyFrameImage } from '@/lib/editor-model';
import { svgToDataUrl } from '@/lib/agent/studio-tools';
import { placeResult } from '@/lib/report-placement';
import { appendRegisteredResult } from '@/lib/result-registration';
import { assertTrueVector } from '@/lib/svg-safety';
import { descriptiveInfographicSVG } from '@/lib/diagram-figures';
import {
  buildInfographicResultSnapshot,
  buildReportDrivenImagePrompt,
  extractDescriptivePanelsFromReport,
  IMAGE_GEN_MODELS,
  REPORT_IMAGE_TASKS,
  type ReportImageTaskId,
} from '@/lib/agent/image-gen-engine';
import type { ResultSnapshot } from '@/lib/research-quality';
import styles from './Studio.module.css';

export default function ImageWorkshopStudio({
  content,
  onUpdateReport,
  onSaveArtifact,
  onJumpToSection,
}: {
  content: EditorContent;
  onUpdateReport: (next: EditorContent, message: string) => void;
  onSaveArtifact?: (title: string, svg: string) => void;
  onJumpToSection?: (sectionId: string) => void;
}) {
  const [task, setTask] = useState<ReportImageTaskId>('descriptive_infographic');
  const [modelId, setModelId] = useState<string>(IMAGE_GEN_MODELS[0].id);
  const defaultSecId = useMemo(
    () =>
      content.report.find(s => /描述|样本|现状/u.test(s.title))?.id
      ?? content.report.find(s => !/^(?:封面|目录)/u.test(s.title))?.id
      ?? content.report[0]?.id
      ?? '',
    [content.report],
  );
  const [targetSectionId, setTargetSectionId] = useState<string>(defaultSecId);
  const [prompt, setPrompt] = useState<string>(() =>
    buildReportDrivenImagePrompt(content, 'descriptive_infographic', defaultSecId),
  );
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [customModelName, setCustomModelName] = useState('');
  const [showGatewayConfig, setShowGatewayConfig] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [liveImageUrl, setLiveImageUrl] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'vector' | 'live'>('vector');
  const [latestSnapshot, setLatestSnapshot] = useState<ResultSnapshot | null>(null);
  const [previewSvg, setPreviewSvg] = useState<string>('');
  const [status, setStatus] = useState(
    '已挂载报告冻结统计快照：点击「调用生图」即可驱动 Nano Banana / Imagen 或合成描述统计复合图。',
  );

  const accentHex = `#${(ACCENT[content.accent] || '0F766E').replace('#', '')}`;
  const stats = useMemo(() => extractDescriptivePanelsFromReport(content), [content]);
  const activeTaskSpec = REPORT_IMAGE_TASKS.find(t => t.id === task) ?? REPORT_IMAGE_TASKS[0];
  const activeModelSpec = IMAGE_GEN_MODELS.find(m => m.id === modelId) ?? IMAGE_GEN_MODELS[0];

  const reportSig = `${content.title}|${content.report.map(s => s.id).join(',')}|${(content.quality?.results.length ?? 0) > 0 ? '1' : '0'}`;
  const [syncedSig, setSyncedSig] = useState(reportSig);
  if (syncedSig !== reportSig) {
    setSyncedSig(reportSig);
    const preferDesc = content.report.find(s => /描述|样本|现状/u.test(s.title))?.id;
    const nextTarget =
      preferDesc && (!targetSectionId || targetSectionId === 'abstract' || !content.report.some(s => s.id === targetSectionId))
        ? preferDesc
        : !content.report.some(s => s.id === targetSectionId)
          ? defaultSecId
          : targetSectionId;
    if (nextTarget !== targetSectionId) setTargetSectionId(nextTarget);
    setPrompt(buildReportDrivenImagePrompt(content, task, nextTarget || defaultSecId));
  }

  const semanticFigureTitle = useMemo(() => {
    const baseTitle = (content.title || '研究报告').replace(/[（(].*?[）)]/gu, '').trim().slice(0, 20) || '研究报告';
    return `${baseTitle}${activeTaskSpec.label}`;
  }, [content.title, activeTaskSpec.label]);

  // Keep synchronous deterministic vector composite ready for preview & instant report embedding
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const snap = await buildInfographicResultSnapshot({
          content,
          title: semanticFigureTitle,
          prompt,
        });
        const svg = assertTrueVector(descriptiveInfographicSVG(snap, accentHex));
        if (alive) {
          setLatestSnapshot(snap);
          setPreviewSvg(svg);
        }
      } catch {
        // Ignore transient invalid intermediate state
      }
    })();
    return () => {
      alive = false;
    };
  }, [content, accentHex, semanticFigureTitle, prompt]);

  const handleSelectTask = (nextTask: ReportImageTaskId) => {
    setTask(nextTask);
    const spec = REPORT_IMAGE_TASKS.find(t => t.id === nextTask);
    if (spec?.recommendedModelId) setModelId(spec.recommendedModelId);
    setPrompt(buildReportDrivenImagePrompt(content, nextTask, targetSectionId || defaultSecId));
    setStatus(`已切换为「${spec?.label ?? nextTask}」并依据当前报告数据重建 Prompt。`);
  };

  const refreshPromptFromReport = () => {
    const nextPrompt = buildReportDrivenImagePrompt(content, task, targetSectionId || defaultSecId);
    setPrompt(nextPrompt);
    setStatus(`已从报告《${content.title || '当前课题'}》（n=${stats.sampleN}）重新提取统计字段与配图提示词。`);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setStatus(`正在请求 ${activeModelSpec.shortLabel} 生成「${activeTaskSpec.label}」…`);
    try {
      // Refresh verified data-bound snapshot first
      const snap = await buildInfographicResultSnapshot({
        content,
        title: semanticFigureTitle,
        prompt,
      });
      const vectorSvg = assertTrueVector(descriptiveInfographicSVG(snap, accentHex));
      setLatestSnapshot(snap);
      setPreviewSvg(vectorSvg);

      const res = await fetch('/api/agent/image-gen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId,
          prompt,
          task,
          aspect: activeTaskSpec.aspect,
          apiKey: apiKey.trim() || undefined,
          baseUrl: baseUrl.trim() || undefined,
          customModelName: customModelName.trim() || undefined,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        mode?: 'live_api' | 'data_bound_composite';
        imageDataUrl?: string;
        fallbackReason?: string;
        error?: string;
      };

      if (json.mode === 'live_api' && json.imageDataUrl) {
        setLiveImageUrl(json.imageDataUrl);
        setViewMode('live');
        onSaveArtifact?.(`${activeModelSpec.shortLabel}-${activeTaskSpec.shortLabel}`, vectorSvg);
        setStatus(`✓ ${activeModelSpec.shortLabel} 生图成功！可切换「AI原图 / 统计复合图」对比并一键写入报告。`);
      } else {
        setLiveImageUrl(null);
        setViewMode('vector');
        onSaveArtifact?.(`${activeTaskSpec.shortLabel}-数据复合图`, vectorSvg);
        setStatus(
          json.fallbackReason
            || `已生成绑定当前报告真实冻结数据（n=${stats.sampleN}，${stats.distributions.length + stats.dimensionMeans.length} 项指标）的高清复合信息图。`,
        );
      }
    } catch (error) {
      setViewMode('vector');
      setStatus(error instanceof Error ? `已切换数据复合图模式：${error.message}` : '已完成数据复合信息图生成。');
    } finally {
      setGenerating(false);
    }
  };

  const insertInfographicIntoReport = async () => {
    try {
      const snap =
        latestSnapshot
        ?? (await buildInfographicResultSnapshot({
          content,
          title: `${content.title || '研究报告'} · ${activeTaskSpec.label}`,
          prompt,
        }));
      const appended = appendRegisteredResult(content, { result: snap });
      const chosenSection = targetSectionId && appended.report.some(s => s.id === targetSectionId) ? targetSectionId : undefined;
      const placed = placeResult(appended, snap.id, chosenSection ? { sectionId: chosenSection } : undefined);
      onUpdateReport(
        placed.content,
        `已将「${snap.title}」插入报告章节「${placed.content.report.find(s => s.id === placed.sectionId)?.title ?? placed.sectionId}」，纸面预览与 Word/LaTeX 同步生效。`,
      );
      onJumpToSection?.(placed.sectionId);
      setStatus(`✓ 已写入报告章节（n=${snap.n}，SHA-256 指纹已锁定）。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '插入报告失败，请先确认报告已初始化章节。');
    }
  };

  const applyAsA4PageArt = () => {
    const src = viewMode === 'live' && liveImageUrl ? liveImageUrl : previewSvg ? svgToDataUrl(previewSvg) : '';
    if (!src) return;
    const isFrame = task === 'report_frame';
    try {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 1000;
        canvas.height = 1414;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = isFrame ? 'rgba(255,255,255,0)' : '#fcfaf5';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (viewMode === 'live' && liveImageUrl) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        } else {
          ctx.drawImage(img, 60, 400, 880, 495);
        }
        const pngBase64 = canvas.toDataURL('image/png').split(',')[1] ?? '';
        const note = `${activeModelSpec.shortLabel} · ${activeTaskSpec.label}`;
        const next = isFrame
          ? applyFrameImage(content, {
              schema: 'FrameImage/v1',
              mime: 'image/png',
              data: pngBase64,
              widthPx: 1000,
              heightPx: 1414,
              note,
            })
          : applyCoverImage(content, {
              schema: 'CoverImage/v1',
              mime: 'image/png',
              data: pngBase64,
              widthPx: 1000,
              heightPx: 1414,
              note,
            });
        onUpdateReport(next, `已将生成图像应用为 1000×1414 A4 ${isFrame ? '学术页框' : '报告封面'}。`);
        setStatus(`✓ 已应用为 1000×1414 A4 ${isFrame ? '学术页框' : '报告封面'}。`);
      };
      img.src = src;
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'A4 图像应用失败。');
    }
  };

  const downloadAsset = () => {
    if (viewMode === 'live' && liveImageUrl) {
      const a = document.createElement('a');
      a.href = liveImageUrl;
      a.download = `evix-${task}-${modelId}.png`;
      a.click();
      return;
    }
    if (!previewSvg) return;
    const url = URL.createObjectURL(new Blob([previewSvg], { type: 'image/svg+xml;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `evix-${task}.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className={styles.studio}>
      <div className={styles.studioHeader}>
        <h4>报告生图与统计信息图工坊</h4>
        <span className={styles.monoTag}>
          n={stats.sampleN} · {stats.distributions.length + stats.dimensionMeans.length} 项数据锚点
        </span>
      </div>

      {/* 1. 生图任务选择 */}
      <div className={styles.segBar} role="tablist" aria-label="生图任务类型">
        {REPORT_IMAGE_TASKS.map(t => (
          <button
            key={t.id}
            type="button"
            className={`${styles.segBtn} ${task === t.id ? styles.segBtnActive : ''}`}
            aria-pressed={task === t.id}
            onClick={() => handleSelectTask(t.id)}
          >
            {t.shortLabel}
          </button>
        ))}
      </div>

      {/* 2. 模型引擎 + 目标章节 + 提示词 */}
      <div className={styles.panel}>
        <div className={styles.row}>
          <label className={styles.field} style={{ flex: 2, minWidth: 160 }}>
            <span>生图模型引擎</span>
            <select
              className={styles.select}
              aria-label="选择生图模型引擎"
              value={modelId}
              onChange={e => setModelId(e.target.value)}
            >
              {IMAGE_GEN_MODELS.map(m => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field} style={{ flex: 1.4, minWidth: 120 }}>
            <span>插入目标章节</span>
            <select
              className={styles.select}
              aria-label="选择插入目标章节"
              value={targetSectionId}
              onChange={e => setTargetSectionId(e.target.value)}
            >
              {content.report
                .filter(s => !/^(?:封面|目录)/u.test(s.title))
                .map(s => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
            </select>
          </label>
        </div>

        <div className={styles.row} style={{ justifyContent: 'space-between' }}>
          <span className={styles.badge}>
            {activeTaskSpec.aspect} · {activeModelSpec.badge}
          </span>
          <div className={styles.row}>
            <button type="button" className={styles.btn} onClick={refreshPromptFromReport}>
              ⚡ 从报告提取 Prompt
            </button>
            <button
              type="button"
              className={styles.btn}
              aria-expanded={showGatewayConfig}
              onClick={() => setShowGatewayConfig(v => !v)}
            >
              {showGatewayConfig ? '收起 API 配置' : 'API 网关配置'}
            </button>
          </div>
        </div>

        {showGatewayConfig && (
          <div className={styles.itemCard} style={{ gap: 6 }}>
            <div className={styles.row}>
              <input
                type="password"
                className={styles.input}
                style={{ flex: 1 }}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="Gemini / OpenAI / Proxy API Key（留空则自动读服务端环境变量或用复合引擎）"
              />
            </div>
            <div className={styles.row}>
              <input
                className={styles.input}
                style={{ flex: 1 }}
                value={baseUrl}
                onChange={e => setBaseUrl(e.target.value)}
                placeholder="可选 Base URL（兼容代理网关地址）"
              />
              <input
                className={styles.input}
                style={{ flex: 1 }}
                value={customModelName}
                onChange={e => setCustomModelName(e.target.value)}
                placeholder={`自定义模型ID（默认 ${activeModelSpec.apiModel}）`}
              />
            </div>
          </div>
        )}

        <label className={styles.field}>
          <span>报告需求生图提示词（遵循 research-descriptive-infographics 规范）</span>
          <textarea
            className={styles.textarea}
            rows={4}
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="自动依据报告数据与章节生成视觉提示词…"
          />
        </label>

        <button
          type="button"
          className={`${styles.btn} ${styles.btnPrimary}`}
          disabled={generating}
          onClick={() => void handleGenerate()}
        >
          {generating ? '⏳ 正在请求模型生成…' : `✦ 调用 ${activeModelSpec.shortLabel} 生成图像`}
        </button>
      </div>

      {/* 3. 实时预览与入文落盘 */}
      <div className={styles.panel}>
        {liveImageUrl && (
          <div className={styles.segBar}>
            <button
              type="button"
              className={`${styles.segBtn} ${viewMode === 'live' ? styles.segBtnActive : ''}`}
              onClick={() => setViewMode('live')}
            >
              AI 模型原图 ({activeModelSpec.shortLabel})
            </button>
            <button
              type="button"
              className={`${styles.segBtn} ${viewMode === 'vector' ? styles.segBtnActive : ''}`}
              onClick={() => setViewMode('vector')}
            >
              锁定数据复合图（入文版）
            </button>
          </div>
        )}

        {viewMode === 'live' && liveImageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element -- displays user/model generated image data URL directly */
          <img className={styles.previewImg} src={liveImageUrl} alt={activeTaskSpec.label} />
        ) : (
          previewSvg && <div className={styles.previewSvg} dangerouslySetInnerHTML={{ __html: previewSvg }} />
        )}

        <div className={styles.row}>
          {task === 'report_cover' || task === 'report_frame' ? (
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={applyAsA4PageArt}>
              ✦ 应用为 A4 {task === 'report_frame' ? '学术页框' : '报告封面'}
            </button>
          ) : (
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => void insertInfographicIntoReport()}>
              ✦ 一键插入当前报告章节
            </button>
          )}
          <button
            type="button"
            className={styles.btn}
            onClick={() => {
              if (previewSvg) onSaveArtifact?.(`生图-${activeTaskSpec.shortLabel}`, previewSvg);
              setStatus('已存入右侧灵感素材架。');
            }}
          >
            存入素材架
          </button>
          <button type="button" className={styles.btn} onClick={downloadAsset}>
            ↓ 下载资产
          </button>
        </div>
      </div>

      <div className={styles.statusBar}>{status}</div>
    </div>
  );
}
