'use client';

import { useState } from 'react';
import EditingStudio from './EditingStudio';
import example from '@/data/quality-example.json';
import { parseEditorContent } from '@/lib/editor-model';
import { downloadBlob } from '@/lib/editor-export';

export default function QualityExampleCanvas() {
  const [initial] = useState(() => parseEditorContent(example));
  const [content, setContent] = useState(initial);

  return (
    <EditingStudio
      localOnly
      projectBinding={{
        initialContent: initial,
        status: '本地样板',
        onSnapshot: setContent,
        onSave: () =>
          downloadBlob(
            new Blob([JSON.stringify(content)], { type: 'application/json' }),
            '研究成果样板备份.json',
          ),
      }}
    />
  );
}
