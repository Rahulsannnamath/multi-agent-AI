// apps/web/src/pages/CodeBrowser.tsx
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, FileCode, Folder } from 'lucide-react';
import { projectsApi } from '../services/api';
import clsx from 'clsx';

interface GeneratedFile {
  path: string;
  content: string;
  language: string;
  purpose: string;
  agentType: string;
  requirements: string[];
  architectureComponents: string[];
}

function getLanguageColor(lang: string) {
  const colors: Record<string, string> = {
    typescript: '#3178c6',
    javascript: '#f7df1e',
    json: '#f59e0b',
    css: '#06b6d4',
    html: '#e34c26',
    markdown: '#818cf8',
    shell: '#34d399',
  };
  return colors[lang.toLowerCase()] ?? '#6b7280';
}

export function CodeBrowser() {
  const { id } = useParams<{ id: string }>();
  const [files, setFiles] = useState<GeneratedFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<GeneratedFile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    projectsApi.getState(id!)
      .then((res) => {
        const gen = res.data?.generation;
        if (gen?.files) {
          setFiles(gen.files);
          if (gen.files.length > 0) setSelectedFile(gen.files[0]);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  // Build file tree
  const buildTree = (files: GeneratedFile[]) => {
    const tree: Record<string, GeneratedFile[]> = {};
    for (const file of files) {
      const parts = file.path.split('/');
      const dir = parts.slice(0, -1).join('/') || 'root';
      if (!tree[dir]) tree[dir] = [];
      tree[dir].push(file);
    }
    return tree;
  };

  const tree = buildTree(files);

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500">Loading generated code...</div>;
  if (files.length === 0) return <div className="p-8 text-center text-gray-500">No generated files available yet. Run code generation first.</div>;

  return (
    <div className="flex flex-col h-screen">
      <div className="flex items-center gap-4 p-4 bg-gray-900 border-b border-gray-800 flex-shrink-0">
        <Link to={`/projects/${id}`} className="btn-secondary py-1.5 text-sm flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>
        <h1 className="font-semibold text-white">Generated Code Browser</h1>
        <span className="badge badge-info">{files.length} files</span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* File tree */}
        <div className="w-64 bg-gray-900 border-r border-gray-800 overflow-y-auto flex-shrink-0">
          {Object.entries(tree).map(([dir, dirFiles]) => (
            <div key={dir}>
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-gray-500 font-medium uppercase tracking-wide border-b border-gray-800">
                <Folder className="w-3 h-3" />
                <span className="truncate">{dir}</span>
              </div>
              {dirFiles.map((file) => {
                const fileName = file.path.split('/').pop() ?? file.path;
                const isSelected = selectedFile?.path === file.path;
                return (
                  <button
                    key={file.path}
                    onClick={() => setSelectedFile(file)}
                    className={clsx(
                      'w-full flex items-center gap-2 px-4 py-2 text-sm transition-colors text-left',
                      isSelected
                        ? 'bg-indigo-600/20 text-indigo-300'
                        : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                    )}
                  >
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: getLanguageColor(file.language) }}
                    />
                    <span className="truncate font-mono text-xs">{fileName}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Code viewer */}
        {selectedFile ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* File header */}
            <div className="px-4 py-3 border-b border-gray-800 bg-gray-900/50 flex items-center gap-3 flex-shrink-0">
              <FileCode className="w-4 h-4 text-gray-400" />
              <span className="font-mono text-sm text-gray-300">{selectedFile.path}</span>
              <span
                className="px-2 py-0.5 rounded text-xs font-medium text-white ml-2"
                style={{ backgroundColor: getLanguageColor(selectedFile.language) + '40', border: `1px solid ${getLanguageColor(selectedFile.language)}40` }}
              >
                {selectedFile.language}
              </span>
              <span className="ml-auto text-xs text-gray-600">{selectedFile.purpose}</span>
            </div>

            {/* Traceability */}
            {(selectedFile.requirements.length > 0 || selectedFile.architectureComponents.length > 0) && (
              <div className="px-4 py-2 border-b border-gray-800 flex items-center gap-3 text-xs flex-shrink-0">
                <span className="text-gray-600">Implements:</span>
                {selectedFile.requirements.map((r) => (
                  <span key={r} className="badge badge-purple">{r}</span>
                ))}
                {selectedFile.architectureComponents.map((c) => (
                  <span key={c} className="badge badge-info">{c}</span>
                ))}
              </div>
            )}

            {/* Code */}
            <pre className="flex-1 overflow-auto p-4 text-xs font-mono text-gray-300 bg-gray-950 leading-relaxed">
              <code>{selectedFile.content}</code>
            </pre>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-600">
            Select a file to view its contents
          </div>
        )}
      </div>
    </div>
  );
}
