# Verification ? 10 October 2026

| Check | Observed result |
| --- | --- |
| Shared semantic/layout unit suite | **22 passed**: all seven types, strict validation, references, relationship direction, multiplicities, unique message order, fragment ranges, workspace consistency/migration, serialization, incremental preservation, self loops, parallel edges, obstacle routing and collision checks. |
| AI/API suite | **11 passed**: generation selection, structured schema defaults, malformed/incomplete responses, bounded repair, JSON capability fallback, incremental edits, login/token validation, ownership, request validation, CAS conflicts, operations, separate tab snapshots, whole-project history/restore and exports. |
| Browser suite | **3 passed**: UML editing, attributes/methods, multiplicities, pencil/notes, AI preview preservation, stale preview rejection, bindings, undo/redo, five individual exports, boundary grouping, save/reload/restore, all seven editable tabs, fullscreen/focus, sequence ordering/range validation, separate annotations and ZIP export. The existing React Flow list route/API smoke test passes. |
| Live configured model | **Passed** using unchanged `gpt-6-luna`: Class 6 nodes/5 edges; Sequence 7/6; Activity 15/14; HLD 5/4; Use Case 7/4; State Machine 10/9; Deployment 5/3. Every result passed semantic validation and layout. |
| One-prompt live generation | **Passed**: a small complete e-commerce prompt produced six relevant diagrams: Class 9/6, Sequence 8/10, Activity 11/10, HLD 8/9, Use Case 8/5, State Machine 8/7. Deployment was not required to fill a tab. All share the generated system model and pass layout. |
| Live incremental sequence edit | **Passed**: added an asynchronous audit participant/message while retaining every existing participant/activation/fragment and its manual description. |
| ZIP integrity | **Passed**: 22 entries ? 7 PNG, 7 SVG, 7 diagram JSON, 1 project JSON; archive CRC check succeeded. |
| TypeScript | Frontend application, shared package and isolated studio backend **pass**. |
| Studio ESLint | **Passed** with the isolated configuration. |
| Frontend production build | **Passed**; Vite reports a large lazy-loaded studio bundle warning. |
| Protected-source isolation | **Passed**: all 50 pre-existing source hashes match except the allowed App.tsx, Layout.tsx and API index.ts integration files. No files are missing. React Flow, draw.io, their models/services and the OpenAI provider are untouched. |
| Full backend/repository build | **Blocked** by the two pre-existing Mongoose Mixed-array errors in the protected React Flow model at lines 23?24. That file remains unchanged. |
| Full repository lint | Existing API command has no default ESLint configuration. Studio lint passes independently. |
| Licensed production canvas | Not verified: no tldraw production key was available. Development workflows pass; production requires a valid `VITE_TLDRAW_LICENSE_KEY`. |

Browser AI responses are mocked for repeatable editing/persistence assertions. Separate live scripts exercise the actual existing OpenAI provider and model. API tests use temporary MongoDB; browser tests create local studio documents. No existing application collections are altered.

Artifacts are in `test-results/ai-design-studio`: `studio.png`, `hld.png`, `seven-tabs.png`, individual exports, `all-diagrams.zip`, the seven `live-*-workspace.json` responses and `live-multi-workspace.json`. PNG/SVG exports were inspected, including nested deployment nodes and UML marker placement. The ZIP exporter uses an independent editor and does not change the visible editor's history.

The update uses the existing isolated collection and indexes. No additional database migration or environment variables are required; the version-2 workspace envelope migrates legacy single-diagram documents on read. Existing development credentials remain in the ignored `.env.ai-design-studio.credentials` file.

Production acceptance remains blocked by the protected baseline backend errors and missing production license. There is no existing comprehensive unrelated-feature regression suite; unchanged source hashes and the old route/API smoke test provide the isolation evidence.
