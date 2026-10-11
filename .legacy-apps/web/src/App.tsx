// apps/web/src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { NewProject } from './pages/NewProject';
import { ProjectDetail } from './pages/ProjectDetail';
import { ArchitectureView } from './pages/ArchitectureView';
import { EvaluationView } from './pages/EvaluationView';
import { CodeBrowser } from './pages/CodeBrowser';
import { ComparisonView } from './pages/ComparisonView';
import { ExperimentsView } from './pages/ExperimentsView';
import { ProvidersView } from './pages/ProvidersView';
import { DocumentationView } from './pages/DocumentationView';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="projects/new" element={<NewProject />} />
          <Route path="projects/:id" element={<ProjectDetail />} />
          <Route path="projects/:id/architecture" element={<ArchitectureView />} />
          <Route path="projects/:id/evaluation" element={<EvaluationView />} />
          <Route path="projects/:id/code" element={<CodeBrowser />} />
          <Route path="experiments" element={<ExperimentsView />} />
          <Route path="experiments/:id/compare" element={<ComparisonView />} />
          <Route path="providers" element={<ProvidersView />} />
          <Route path="docs" element={<DocumentationView />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
