'use client';

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import type { PaperAnnotation } from '@/components/editors/PaperPages';
import { useKeyedListMotion } from '../useEvixMotion';
import type { EditorContent } from '@/lib/editor-model';
import type { Questionnaire } from '@/lib/questionnaire';
import styles from './Studio.module.css';

function StudioLoading() {
  return <p role="status">正在载入创作工坊</p>;
}

const CrossRefStudio = dynamic(() => import('./CrossRefStudio'), { loading: StudioLoading });
const DrawDiagramStudio = dynamic(() => import('./DrawDiagramStudio'), { loading: StudioLoading });
const ImageWorkshopStudio = dynamic(() => import('./ImageWorkshopStudio'), { loading: StudioLoading });
const QaDefenseStudio = dynamic(() => import('./QaDefenseStudio'), { loading: StudioLoading });
const QuickSurveyStudio = dynamic(() => import('./QuickSurveyStudio'), { loading: StudioLoading });
const SteeringAnnotationStudio = dynamic(() => import('./SteeringAnnotationStudio'), { loading: StudioLoading });
const TeamLiaisonStudio = dynamic(() => import('./TeamLiaisonStudio'), { loading: StudioLoading });
const CorpusObservatory = dynamic(() => import('@/components/landing/CorpusObservatory'), { loading: StudioLoading });

export type StudioTabId =
  | 'draw'
  | 'image'
  | 'crossref'
  | 'survey'
  | 'qa'
  | 'steering'
  | 'team'
  | 'corpus'
  | 'library';

export interface StudioHubSpec {
  id: 'visual' | 'data_collect' | 'writing' | 'defense' | 'library';
  icon: string;
  short: string;
  label: string;
  defaultTab: StudioTabId;
  subTabs: ReadonlyArray<{ id: StudioTabId; label: string }>;
}

/** 化繁为简：由原本 8 个杂乱工坊入口收敛为 4 个高内聚创作中心 */
export const STUDIO_HUBS: readonly StudioHubSpec[] = [
  {
    id: 'visual',
    icon: '✦',
    short: '视觉生图',
    label: '视觉配图 · 统计信息图 · 研究流程图',
    defaultTab: 'image',
    subTabs: [
      { id: 'image', label: '🎨 主题配图与统计图' },
      { id: 'draw', label: '◇ 架构流程图' },
    ],
  },
  {
    id: 'data_collect',
    icon: '☑',
    short: '问卷深访',
    label: '定量问卷快搭与自然深访语料生成',
    defaultTab: 'survey',
    subTabs: [{ id: 'survey', label: '问卷设计与深访语料' }],
  },
  {
    id: 'writing',
    icon: '✎',
    short: '文风润色',
    label: '写作润色与去套话 · 文献交叉引用 · 国奖图谱',
    defaultTab: 'steering',
    subTabs: [
      { id: 'steering', label: '🧼 文风润色与批注' },
      { id: 'crossref', label: '§ 文献交叉引用' },
      { id: 'corpus', label: '⊞ 国奖图谱' },
    ],
  },
  {
    id: 'defense',
    icon: '◈',
    short: '答辩协同',
    label: '原文标红问辩与 6 人小队协同',
    defaultTab: 'qa',
    subTabs: [
      { id: 'qa', label: '🔍 原文标红问辩' },
      { id: 'team', label: '◎ 6人小队分工' },
    ],
  },
  {
    id: 'library',
    icon: '⊞',
    short: '资料库',
    label: '数据图 · 学术三线表 · 流程框图 · 中国省市县风物志',
    defaultTab: 'library',
    subTabs: [{ id: 'library', label: '⊞ 打开全屏资料库' }],
  },
];

const STUDIO_TABS: ReadonlyArray<{ id: StudioTabId; icon: string; label: string; short: string }> = [
  { id: 'image', icon: '✦', label: '主题配图与统计信息图', short: '视觉生图' },
  { id: 'draw', icon: '◇', label: '研究架构与流程图', short: '流程图' },
  { id: 'survey', icon: '☑', label: '定量问卷与深访语料', short: '问卷深访' },
  { id: 'steering', icon: '✎', label: '写作润色与批注精修', short: '文风润色' },
  { id: 'crossref', icon: '§', label: '智能文献交叉引用', short: '交叉引用' },
  { id: 'corpus', icon: '⊞', label: '国奖范式图谱', short: '国奖图谱' },
  { id: 'qa', icon: '◈', label: '原文标红与答辩问辩', short: '答辩问辩' },
  { id: 'team', icon: '◎', label: '6人小队协同', short: '团队6席' },
  { id: 'library', icon: '⊞', label: '研究资料与县域风物库', short: '资料库' },
];

export function hubForTab(tab: StudioTabId): StudioHubSpec {
  return STUDIO_HUBS.find(h => h.subTabs.some(st => st.id === tab)) ?? STUDIO_HUBS[0];
}

export default function StudioPanel({
  activeTab,
  onSelectTab,
  onClose,
  content,
  design,
  onSaveDesign,
  onUpdateReport,
  onSaveArtifact,
  onJumpToSection,
  highlightTerms,
  onHighlightChange,
  onOpenKnowledge,
  onAskExternalAi,
  steeringNotes,
  onAddSteering,
  onRemoveSteering,
  annotations,
  onAddAnnotation,
  onToggleAnnotationStatus,
  onRemoveAnnotation,
  onRewriteWithIdea,
  onOpenMainTheater,
  teamId,
  projectId,
  signedIn,
  currentUserEmail,
  csrfToken,
}: {
  activeTab: StudioTabId;
  onSelectTab: (tab: StudioTabId) => void;
  onClose: () => void;
  content: EditorContent;
  design: Questionnaire | null;
  onSaveDesign?: (next: Questionnaire) => Promise<void> | void;
  onUpdateReport: (next: EditorContent, message: string, nextDesign?: Questionnaire | null) => void;
  onSaveArtifact?: (title: string, svg: string) => void;
  onJumpToSection: (sectionId: string) => void;
  highlightTerms: string[];
  onHighlightChange: (terms: string[]) => void;
  onOpenKnowledge?: () => void;
  onAskExternalAi?: (question: string) => void;
  steeringNotes: string[];
  onAddSteering: (note: string) => void;
  onRemoveSteering: (idx: number) => void;
  annotations: PaperAnnotation[];
  onAddAnnotation: (ann: Omit<PaperAnnotation, 'id' | 'status'>) => void;
  onToggleAnnotationStatus: (id: string) => void;
  onRemoveAnnotation: (id: string) => void;
  onRewriteWithIdea: (sectionId: string, quote: string, idea: string) => void;
  onOpenMainTheater?: (payload: {
    design: Questionnaire;
    templateKey: 'residents' | 'students' | 'seniors';
    seed: number;
    population: string;
  }) => void;
  teamId?: string | null;
  projectId?: string | null;
  signedIn: boolean;
  currentUserEmail?: string;
  csrfToken?: string;
}) {
  const activeHub = hubForTab(activeTab);
  const activeTabTitle = STUDIO_TABS.find(item => item.id === activeTab)?.label ?? activeHub.short;
  const hubIds = useMemo(() => STUDIO_HUBS.map(h => h.id), []);
  const hubBarRef = useKeyedListMotion<HTMLDivElement>({
    ids: hubIds,
    activeId: activeHub.id,
    markerAxis: 'horizontal',
  });
  const subTabIds = useMemo(() => activeHub.subTabs.map(st => st.id), [activeHub]);
  const subBarRef = useKeyedListMotion<HTMLDivElement>({
    ids: subTabIds,
    activeId: activeTab,
    markerAxis: 'horizontal',
    enabled: activeHub.subTabs.length > 1,
  });

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div className={styles.panel} style={{ margin: '8px 12px 0', gap: 8 }}>
        <div className={styles.heroHead}>
          <div ref={hubBarRef} role="group" aria-label="创作工坊分类" className={styles.segBar} style={{ flex: 1 }}>
            <span data-motion-marker data-motion-variant="pill" className={styles.segActivePill} aria-hidden="true" />
            {STUDIO_HUBS.map(hub => {
              const isHubActive = hub.id === activeHub.id;
              return (
                <button
                  key={hub.id}
                  data-motion-id={hub.id}
                  type="button"
                  className={`${styles.segBtn} ${isHubActive ? styles.segBtnActive : ''}`}
                  aria-pressed={isHubActive}
                  aria-label={hub.label}
                  title={hub.label}
                  onClick={() => {
                    if (!isHubActive) onSelectTab(hub.defaultTab);
                  }}
                >
                  <span aria-hidden="true">{hub.icon}</span>
                  <span>{hub.short}</span>
                </button>
              );
            })}
          </div>
          <button type="button" className={styles.btn} onClick={onClose} aria-label="收起创作工坊" title="收起创作工坊">
            收起
          </button>
        </div>

        {activeHub.subTabs.length > 1 && (
          <div ref={subBarRef} role="group" aria-label={`${activeHub.short}子面板`} className={styles.segBar}>
            <span data-motion-marker data-motion-variant="pill" className={styles.segActivePill} aria-hidden="true" />
            {activeHub.subTabs.map(st => (
              <button
                key={st.id}
                data-motion-id={st.id}
                type="button"
                className={`${styles.segBtn} ${activeTab === st.id ? styles.segBtnActive : ''}`}
                aria-pressed={activeTab === st.id}
                onClick={() => onSelectTab(st.id)}
              >
                {st.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div key={activeTab} className={styles.studioPaneBody} role="region" aria-label={activeTabTitle}>
      {activeTab === 'draw' && (
        <DrawDiagramStudio
          content={content}
          onUpdateReport={onUpdateReport}
          onSaveArtifact={onSaveArtifact}
        />
      )}
      {activeTab === 'image' && (
        <ImageWorkshopStudio
          content={content}
          onUpdateReport={onUpdateReport}
          onSaveArtifact={onSaveArtifact}
          onJumpToSection={onJumpToSection}
        />
      )}
      {activeTab === 'crossref' && (
        <CrossRefStudio
          content={content}
          onUpdateReport={onUpdateReport}
          onJumpToSection={onJumpToSection}
          projectId={projectId}
          signedIn={signedIn}
          csrfToken={csrfToken}
        />
      )}
      {activeTab === 'survey' && (
        <QuickSurveyStudio
          content={content}
          design={design}
          onSaveDesign={onSaveDesign}
          onUpdateReport={onUpdateReport}
          onOpenMainTheater={onOpenMainTheater}
        />
      )}
      {activeTab === 'qa' && (
        <QaDefenseStudio
          content={content}
          highlightTerms={highlightTerms}
          onHighlightChange={onHighlightChange}
          onJumpToSection={onJumpToSection}
          onOpenKnowledge={onOpenKnowledge}
          onAskExternalAi={onAskExternalAi}
          onPinToAnnotation={onAddAnnotation}
        />
      )}
      {activeTab === 'steering' && (
        <SteeringAnnotationStudio
          content={content}
          onUpdateReport={onUpdateReport}
          steeringNotes={steeringNotes}
          onAddSteering={onAddSteering}
          onRemoveSteering={onRemoveSteering}
          annotations={annotations}
          onAddAnnotation={onAddAnnotation}
          onToggleAnnotationStatus={onToggleAnnotationStatus}
          onRemoveAnnotation={onRemoveAnnotation}
          onRewriteWithIdea={onRewriteWithIdea}
          onJumpToSection={onJumpToSection}
        />
      )}
      {activeTab === 'corpus' && (
        <div style={{ margin: '0 12px 12px' }}>
          <CorpusObservatory compact onInjectSteering={onAddSteering} />
        </div>
      )}
      {activeTab === 'team' && (
        <TeamLiaisonStudio
          content={content}
          teamId={teamId}
          signedIn={signedIn}
          currentUserEmail={currentUserEmail}
          csrfToken={csrfToken}
          onSaveArtifact={onSaveArtifact}
        />
      )}
      {activeTab === 'library' && (
        <div className={styles.panel} style={{ margin: '0 12px 12px' }}>
          <strong>资料库主舞台模式</strong>
          <p className={styles.muted}>
            已在主工作区展开“证见资料库”全览三栏视图，支持数据图、学术三线表、无边框流程框图、装帧视觉与全国省市县五维风物志。
          </p>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => onSelectTab('library')}>
            打开资料库全览舞台
          </button>
        </div>
      )}
      </div>
    </div>
  );
}
