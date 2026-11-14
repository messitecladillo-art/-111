'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Service } from '@evix/shared';
import type { ArtifactSeed } from '@/lib/agent/artifact-library';
import type { WorkflowTask, WorkflowRole } from '@/lib/agent/workflow-tasks';
import { createWorkflowController, workflowResearchInput, type WorkflowSnapshot } from './workflow-controller';
import type { WorkflowMutate } from './workflow-client';

export type WorkflowExecutionHost = {
  mutate: WorkflowMutate; isCurrent: () => boolean; onProduced: (seed: ArtifactSeed) => void;
};
type Options = { owner: string | null; projectId: string | null; epoch: number; direction: string;
  context: Record<string, string | number | null>;
  services: readonly Service[]; defaultServiceId: string | null; host?: WorkflowExecutionHost };
const initial = (): WorkflowSnapshot => ({ task: null, phasePreview: null, grant: null, calls: [], surveys: [], roleSelections: {}, busy: false, loading: true, error: '', reconciling: false, restored: false });
const NAMES: Record<WorkflowRole, string> = { research: '研究设计', survey: '问卷与抽样', data: '数据分析', writing: '报告草稿', reviewer: '审阅记录' };
function matchesInput(task: WorkflowTask, options: Options) {
  try {
    const source = workflowResearchInput(options.direction, options.context);
    return task.state.requirements.goal === source.requirements.goal && (task.state.requirements.geography ?? '') === (source.requirements.geography ?? '')
      && (task.state.constraints.notes ?? '') === (source.constraints.notes ?? '');
  } catch { return false; }
}

/** Export every observed stage version independently; applying it to an editor remains an explicit choice. */
export function workflowArtifacts(task: WorkflowTask): ArtifactSeed[] {
  return Object.entries(task.state.agent_outputs).flatMap(([key, output]) => {
    const role = key as WorkflowRole, body = JSON.stringify(output, null, 2), pieces: string[] = [];
    // Chunk without dropping content, respecting the existing editable-text artifact bound.
    for (let offset = 0; offset < body.length; offset += 11000) pieces.push(body.slice(offset, offset + 11000));
    return pieces.map((text, index) => ({ familyId: `workflow:${task.id}:${role}:${index}`, kind: 'text' as const,
      title: `${NAMES[role]}${pieces.length > 1 ? ` · ${index + 1}` : ''}`, origin: 'Agent 阶段成果', status: 'candidate' as const,
      classification: 'unclassified' as const, value: { type: 'text' as const, section: { id: `workflow-${role}-${index}`,
        title: NAMES[role], body: text, source: `任务 ${task.id} · ${role}；模型提案，待用户审阅。` } } }));
  });
}

export function useWorkflowExecution(options: Options) {
  const [snapshot, setSnapshot] = useState(initial), latest = useRef(options);
  const controller = useRef<ReturnType<typeof createWorkflowController> | null>(null);
  useLayoutEffect(() => { latest.current = options; });
  const enabled = !!options.host && !!options.owner && options.owner !== 'guest' && !!options.projectId;
  useEffect(() => {
    if (!enabled) return;
    const owner = options.owner!, projectId = options.projectId!, epoch = options.epoch;
    const current = () => latest.current.owner === owner && latest.current.projectId === projectId
      && latest.current.epoch === epoch && latest.current.host?.isCurrent() === true;
    const emitted = new Set<string>();
    const value = createWorkflowController({ scope: { ownerId: owner, projectId },
      mutate: (...args) => latest.current.host!.mutate(...args), current,
      services: () => latest.current.services, defaultServiceId: () => latest.current.defaultServiceId,
      inputCurrent: task => matchesInput(task, latest.current),
      storage: window.localStorage, onChange: setSnapshot,
      onTask: task => { if (!current()) return; for (const seed of workflowArtifacts(task)) {
        const fingerprint = JSON.stringify(seed.value);
        if (!emitted.has(fingerprint)) { latest.current.host!.onProduced(seed); emitted.add(fingerprint); }
      } },
    });
    controller.current = value;
    void value.restore();
    return () => { value.close(); if (controller.current === value) controller.current = null; };
    // The existing ResearchWorkspace is keyed by account epoch and project, preserving its editors.
  }, [enabled, options.owner, options.projectId, options.epoch]);
  useEffect(() => {
    if (!enabled || snapshot.task?.status !== 'running') return;
    const timer = setInterval(() => { void controller.current?.refresh(); }, 1500);
    return () => clearInterval(timer);
  }, [enabled, snapshot.task?.status]);
  return { ...snapshot, enabled, sourceChanged: !!snapshot.task && !matchesInput(snapshot.task, options),
    canManage: enabled && (!snapshot.task || snapshot.task.state.model_bindings?.ownerId === options.owner),
    start: (goal: string, context?: Record<string, string | number | null>) => controller.current?.start(goal, context),
    onAuthorize: () => { void controller.current?.authorize(); }, onContinue: () => { void controller.current?.resume(); },
    onRefresh: () => { void controller.current?.refresh(); }, onCancel: () => { void controller.current?.stop(); },
    onApprove: () => { void controller.current?.approve(); }, onRevise: (feedback: string) => { void controller.current?.revise(feedback); },
    onRoleSelectionChange: (role: WorkflowRole, id: string | null) => controller.current?.select(role, id),
    onNewTask: () => controller.current?.newTask(),
    onBindDataset: (id: string) => { void controller.current?.bindDataset(id); },
  };
}
