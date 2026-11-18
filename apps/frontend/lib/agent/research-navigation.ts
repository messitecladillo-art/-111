import { isRoomId, type RoomId } from './rooms';
import { RESEARCH_STAGES, type ResearchStageId } from './research-stages';

const RESEARCH_ROOMS: Record<ResearchStageId, RoomId | null> = {
  topic: 'diagnose',
  diagnosis: 'diagnose',
  literature: 'diagnose',
  questionnaire: 'design',
  sampling: 'sampling',
  pilot: 'silicon',
  collection: 'workspace',
  quality: 'analysis',
  analysis: 'analysis',
  findings: 'editor',
  report: null,
  review: 'editor',
  export: 'editor',
  defense: 'defense',
};

const ROOM_STAGE: Partial<Record<RoomId, ResearchStageId>> = {
  diagnose: 'diagnosis',
  design: 'questionnaire',
  sampling: 'sampling',
  silicon: 'pilot',
  analysis: 'analysis',
  editor: 'report',
  defense: 'defense',
};

export const defaultResearchStage = (room: RoomId) => ROOM_STAGE[room] ?? null;

export const RESEARCH_OVERVIEW_HASH = '#research';

export function researchStageHash(stage: ResearchStageId): string {
  return '#research/' + stage;
}

export function researchStageFromHash(hash: string): ResearchStageId | null {
  if (!hash.startsWith('#research/')) return null;
  return RESEARCH_STAGES.find(stage => researchStageHash(stage.id) === hash)?.id ?? null;
}

export function agentPanelFromHash(hash: string): RoomId | null {
  const stage = researchStageFromHash(hash);
  if (stage) return RESEARCH_ROOMS[stage];
  const room = hash.slice(1);
  return room === 'lifecycle' ? 'workspace' : isRoomId(room) ? room : null;
}
