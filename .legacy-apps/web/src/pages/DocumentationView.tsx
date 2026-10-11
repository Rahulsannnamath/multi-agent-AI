// apps/web/src/pages/DocumentationView.tsx
import { BookOpen } from 'lucide-react';

const docs = [
  {
    title: 'Architecture Overview',
    content: `The platform uses a multi-agent pipeline where each agent has a single responsibility:

1. **Requirements Agent** — Transforms natural language into structured, ID-tagged requirements (REQ-001...)
2. **Architecture Agent** — Designs system components and connections in React Flow format
3. **Database Agent** — Designs MongoDB schemas with Mongoose models
4. **API Agent** — Designs REST endpoints with OpenAPI-compatible output
5. **Security Agent** — Performs evidence-based security analysis (no fake "all clear")
6. **Architecture Evaluator** — Runs 15+ deterministic rules across 6 dimensions
7. **Review Agent** — Reviews the complete design for blockers and inconsistencies
8. **Code Generation Agents** — Generate real, runnable frontend/backend code
9. **Debug/Repair Agent** — Analyzes failures and produces targeted patches`,
  },
  {
    title: 'LLM Providers',
    content: `Only two providers are supported:

**Ollama (local)**
- No API key required
- Models: qwen2.5:0.5b, gemma3:4b, llama3.2, etc.
- Configure: OLLAMA_BASE_URL, OLLAMA_MODEL

**OpenAI (cloud)**
- Requires OPENAI_API_KEY
- Models: gpt-4o, gpt-4o-mini, gpt-4-turbo
- Configure: OPENAI_API_KEY, OPENAI_MODEL

The LLM API key is NEVER sent to the frontend. It is always used server-side only.`,
  },
  {
    title: 'Architecture Evaluation Rules',
    content: `The evaluator runs deterministic rules — no LLM judge is used.

**Scalability:** SCALE-001 (load balancer), SCALE-002 (caching), SCALE-003 (DB resilience)
**Availability:** AVAIL-001 (SPOF detection), AVAIL-002 (monitoring)  
**Security:** SEC-001 (unauthenticated endpoints), SEC-002 (rate limiting), SEC-003 (critical findings), SEC-004 (transport encryption)
**Performance:** PERF-001 (missing indexes), PERF-002 (cache/CDN)
**Maintainability:** MAINT-001 (requirement traceability), MAINT-002 (auth component)
**Consistency:** CONS-001 (API/DB entity references), CONS-002 (requirement coverage by API)

**Score formula:** passedRules / totalRules * 100 per dimension
**Overall:** average of all dimensions`,
  },
  {
    title: 'Comparison Metrics',
    content: `20 deterministic metrics are computed — no LLM judge:

- Schema Validity (1 = valid, 0 = invalid)
- Completeness Score (% of required sections)
- Requirements Coverage (satisfiedReqs / totalReqs)
- Architecture Consistency (evaluator score / 100)
- API Completeness (endpoints / requirements)
- Database Consistency (from CONS-001 rule)
- Security Rule Score (securityScore / 100)
- Build Success (1 or 0)
- Test Pass Rate (passed / total)
- Health Check Success (1 or 0)
- Runtime Success (1 or 0)
- Repair Iterations (lower is better)
- Generated File Count
- Requirement-to-Code Traceability
- Design-to-Code Consistency
- Total Tokens Used
- Estimated API Cost (USD)
- Acceptance Criteria Pass Rate

**Overall Score = buildSuccess*20 + testPassRate*20 + security*15 + reqCoverage*15 + health*10 + runtime*10 + traceability*5 + acceptance*5**`,
  },
  {
    title: 'Daytona Sandbox',
    content: `The platform integrates with Daytona for isolated code execution.

**Why Daytona?**
Generated code is UNTRUSTED. It must never run directly on the host system.

**What happens in the sandbox:**
1. Workspace created
2. Generated files uploaded
3. npm install
4. npm run build
5. Application started
6. Health check: GET /health
7. Tests run: npm test
8. Logs collected
9. Debug/repair if failures
10. Workspace destroyed

**Without Daytona:**
The system clearly displays "Daytona is not configured" — it never pretends the sandbox ran.`,
  },
  {
    title: 'Security',
    content: `Key security controls:

- API keys are NEVER sent to the frontend
- Generated code paths are validated (no directory traversal)
- Secrets are sanitized from LLM prompts and logs
- The sandbox environment does not receive host credentials
- Environment variables are explicitly allowlisted for sandbox execution
- Logs are sanitized before being passed to debug agents
- OpenAI key format is verified without making unnecessary API calls`,
  },
];

export function DocumentationView() {
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <BookOpen className="w-8 h-8 text-indigo-400" />
        <div>
          <h1 className="text-3xl font-bold text-white">Documentation</h1>
          <p className="text-gray-400 mt-1">Multi-Agent AI App Builder — Platform Guide</p>
        </div>
      </div>

      <div className="space-y-6">
        {docs.map((doc) => (
          <div key={doc.title} className="card">
            <h2 className="text-lg font-semibold text-white mb-4">{doc.title}</h2>
            <div className="prose prose-invert prose-sm max-w-none">
              {doc.content.split('\n').map((line, i) => {
                if (line.startsWith('**') && line.endsWith('**')) {
                  return <p key={i} className="font-semibold text-indigo-300 mt-3 mb-1">{line.slice(2, -2)}</p>;
                }
                if (line.startsWith('- ')) {
                  return <p key={i} className="text-gray-400 text-sm pl-3">· {line.slice(2)}</p>;
                }
                if (line.match(/^\d+\./)) {
                  return <p key={i} className="text-gray-300 text-sm">{line}</p>;
                }
                if (line === '') return <br key={i} />;
                return <p key={i} className="text-gray-300 text-sm">{line}</p>;
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
