// src/components/modals/AlgorithmInfoModal.tsx

import { useState } from "react";
import type { WorkflowTemplate } from "../../lib/workflowTemplates";

interface Props {
  template: WorkflowTemplate | null;
  onClose: () => void;
}

export default function AlgorithmInfoModal({ template, onClose }: Props) {
  const [lang, setLang] = useState<'en' | 'th'>('en');

  if (!template) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[99999] flex items-center justify-center">
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-[520px] p-6 relative">

        <button
          onClick={onClose}
          className="absolute top-2 right-2 px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300"
        >
          ✕
        </button>

        <h2 className="text-xl font-bold text-teal-400 mb-1">
          {template.name}
        </h2>

        <div className="flex gap-2 mb-3">
          <button
            onClick={() => setLang('en')}
            className={`px-2 py-1 rounded text-xs font-semibold ${lang === 'en' ? 'bg-teal-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
          >
            EN
          </button>
          <button
            onClick={() => setLang('th')}
            className={`px-2 py-1 rounded text-xs font-semibold ${lang === 'th' ? 'bg-teal-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
          >
            TH
          </button>
        </div>

        <p className="text-gray-300 text-sm whitespace-pre-line leading-relaxed mb-3">
          {template.descriptor?.[lang] || template.description}
        </p>

        {template.longDescription && (
          <div className="mt-3 p-3 bg-gray-800 rounded border border-gray-700">
            <h3 className="text-teal-300 font-semibold text-sm mb-2">
              Algorithm Insight
            </h3>

            <p className="text-gray-400 text-xs whitespace-pre-line leading-relaxed">
              {template.longDescription?.[lang]}
            </p>
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-5 w-full bg-teal-600 hover:bg-teal-500 text-white py-2 rounded-md"
        >
          Close
        </button>

      </div>
    </div>
  );
}
