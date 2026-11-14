'use client';

import type { PaperAnnotation } from '@/components/editors/PaperPages';
import type { EditorContent } from '@/lib/editor-model';
import type { Questionnaire } from '@/lib/questionnaire';
import CrossRefStudio from './CrossRefStudio';
import DrawDiagramStudio from './DrawDiagramStudio';
import ImageWorkshopStudio from './ImageWorkshopStudio';
import QaDefenseStudio from './QaDefenseStudio';
import QuickSurveyStudio from './QuickSurveyStudio';
import SteeringAnnotationStudio from './SteeringAnnotationStudio';
import TeamLiaisonStudio from './TeamLiaisonStudio';
import CorpusObservatory from '@/components/landing/CorpusObservatory';
import styles from './Studio.module.css';

export type StudioTabId =
  | 'draw'
  | 'image'
  | 'crossref'
  | 'survey'
  | 'qa'
  | 'steering'
  | 'team'
  | 'corpus';

export interface StudioHubSpec {
  id: 'visual' | 'data_collect' | 'writing' | 'defense';
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
    label: 'AI 生图 · 描述性统计复合图 · draw.io 流程图',
    defaultTab: 'image',
    subTabs: [
      { id: 'image', label: '🎨 模型生图 / 统计图' },
      { id: 'draw', label: '◇ 架构流程图' },
    ],
  },
  {
    id: 'data_collect',
    icon: '☑',
    short: '问卷深访',
    label: '定量问卷快搭与去 AI 味深访语料生成',
    defaultTab: 'survey',
    subTabs: [{ id: 'survey', label: '问卷设计 & 深访语料' }],
  },
  {
    id: 'writing',
    icon: '✎',
    short: '写作去味',
    label: '去 AI 味十大 Skill · 文献交叉引用 · 国奖图谱',
    defaultTab: 'steering',
    subTabs: [
      { id: 'steering', label: '🧼 去AI味与批注' },
      { id: 'crossref', label: '§ 文献交叉引用' },
      { id: 'corpus', label: '⊞ 国奖图谱' },
    ],
  },
  {
    id: 'defense',
    icon: 'Q',
    short: '答辩协同',
    label: 'Q/A 原文标红问辩与 6 人小队协同',
    defaultTab: 'qa',
    subTabs: [
      { id: 'qa', label: '🔍 原文标红问辩' },
      { id: 'team', label: '◎ 6人小队分工' },
    ],
  },
];

export const STUDIO_TABS: ReadonlyArray<{ id: StudioTabId; icon: string; label: string; short: string }> = [
  { id: 'image', icon: '✦', label: '模型生图与统计信息图', short: '视觉生图' },
  { id: 'draw', icon: '◇', label: 'draw.io 架构流程图', short: '流程图' },
  { id: 'survey', icon: '☑', label: '定量问卷与深访语料', short: '问卷深访' },
  { id: 'steering', icon: '✎', label: '去 AI 味十大 Skill 与批注', short: '写作去味' },
  { id: 'crossref', icon: '§', label: '智能文献交叉引用', short: '交叉引用' },
  { id: 'corpus', icon: '⊞', label: '国奖范式图谱', short: '国奖图谱' },
  { id: 'qa', icon: 'Q', label: 'Q/A 标红与答辩问辩', short: '答辩问辩' },
  { id: 'team', icon: '◎', label: '6人小队协同', short: '团队6席' },
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
  teamId,
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
  teamId?: string | null;
  signedIn: boolean;
  currentUserEmail?: string;
  csrfToken?: string;
}) {
  const activeHub = hubForTab(activeTab);

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div className={styles.panel} style={{ margin: '8px 12px 0', gap: 8 }}>
        <div className={styles.heroHead}>
          <div className={styles.segBar} style={{ flex: 1 }}>
            {STUDIO_HUBS.map(hub => {
              const isHubActive = hub.id === activeHub.id;
              return (
                <button
                  key={hub.id}
                  type="button"
                  className={`${styles.segBtn} ${isHubActive ? styles.segBtnActive : ''}`}
                  aria-pressed={isHubActive}
                  title={hub.label}
                  onClick={() => {
                    if (!isHubActive) onSelectTab(hub.defaultTab);
                  }}
                >
                  <span>{hub.icon}</span>
                  <span>{hub.short}</span>
                </button>
              );
            })}
          </div>
          <button type="button" className={styles.btn} onClick={onClose} title="收起创作工坊">
            收起
          </button>
        </div>

        {activeHub.subTabs.length > 1 && (
          <div className={styles.segBar}>
            {activeHub.subTabs.map(st => (
              <button
                key={st.id}
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
        />
      )}
      {activeTab === 'survey' && (
        <QuickSurveyStudio
          content={content}
          design={design}
          onSaveDesign={onSaveDesign}
          onUpdateReport={onUpdateReport}
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
    </div>
  );
}
