import type { Metadata } from 'next';
import SubmissionPreflight from '@/components/preflight/SubmissionPreflight';

export const metadata: Metadata = { title: '提交前体检｜证见 EVI-X', description: '检查 Word、PowerPoint、PDF 文件中的身份信息与编辑残留，定位问题并下载检查记录。' };
export default function PreflightPage() { return <SubmissionPreflight standalone/>; }
