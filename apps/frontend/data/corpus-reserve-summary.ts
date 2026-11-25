/**
 * Lightweight archive summary for overview surfaces (`Lobby.tsx`) with zero
 * runtime dependencies.
 */

export interface CorpusReserveSummary {
  totalReports: number;
  rawPdfFiles: number;
  totalPages: number;
  avgPages: number;
  medianPages: number;
  minPages: number;
  maxPages: number;
  nationalFirstCount: number;
  cpPropositionCount: number;
  deepSampledDocs: number;
  surveyCategories: number;
  surveyFiles: number;
  topics2027: number;
  rubricTotalPoints: number;
  provenanceLabel: string;
}

export const CORPUS_RESERVE_SUMMARY: CorpusReserveSummary = {
  totalReports: 204,
  rawPdfFiles: 264,
  totalPages: 18234,
  avgPages: 89.4,
  medianPages: 86,
  minPages: 18,
  maxPages: 206,
  nationalFirstCount: 115,
  cpPropositionCount: 7,
  deepSampledDocs: 59,
  surveyCategories: 16,
  surveyFiles: 176,
  topics2027: 50,
  rubricTotalPoints: 100,
  provenanceLabel: '2014–2025 本地国奖 PDF 档案实证统计（N=204，可解析全文结构抽样 n=59）',
};
