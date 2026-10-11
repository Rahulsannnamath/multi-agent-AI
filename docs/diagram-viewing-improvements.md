# Diagram viewing improvements

The existing tldraw editor, ELK layout engine, typed graph schema, persistence, and generation orchestration are retained.

## Modified implementation files

- `backend/packages/ai-design-studio/src/layout.ts`: content-based wrapping and compact class dimensions; reduced ELK layer, node, container, and sequence participant spacing; inheritance and realization place parent classes above children. Dedicated sequence timelines and message ordering remain. Existing orthogonal obstacle routing, label collision checks, UML markers, and grouped containers remain.
- `backend/api/src/ai-design-studio/ai.ts`: generation-only validation caps diagrams at 24 components and 36 connections; classes at 8 attributes and 6 methods; titles at 80 characters and descriptions at 400. Limits are enforced in both structured-output schemas and response parsing, including fallback responses. Existing persisted graphs and incremental editing retain their existing schema limits.
- `frontend/web/src/ai-design-studio/viewing.tsx` (new): floating viewport controls, semantic zoom, explicit Overview/Detail, selection focus and return, interactive hideable minimap, and viewport size observation. View state belongs to each editor, outside its document records. Node rendering updates at detail-level boundaries rather than recomputing layout on each camera movement.
- `frontend/web/src/ai-design-studio/canvas.ts`: generated layouts and explicit Auto Arrange fit after two animation frames. Fits include shape bounds, routed edges, and label geometry, reserve room for native and floating controls, cap initial enlargement at 100%, and extend the default minimum zoom for wide saved diagrams. Restored snapshots retain their camera and manually edited positions.
- `frontend/web/src/ai-design-studio/shapes.tsx`: wrapped titles and class members, consistent typography, content minimums during resizing, progressive visual detail, and focus dimming. Relationship types, arrowheads, cardinalities, guards, sequence order, and sequence/deployment protocols remain visible. SVG exports always render full details.
- `frontend/web/src/ai-design-studio/Studio.tsx`: viewport controls integration, guarded explicit arrangement, Fullscreen control, Escape exit, and panel suppression in fullscreen.
- `frontend/web/src/ai-design-studio/studio.css`: floating controls, minimap, responsive canvas containment, and fullscreen spacing.

## Modified tests

- `backend/packages/ai-design-studio/test/layout.test.ts`: 3-, 24-, and 60-node saved graphs, collision checks, long-member wrapping, and inheritance direction.
- `backend/api/test/ai-design-studio-generation.test.ts`: rejection of oversized AI responses even when a provider ignores structured-output limits.
- `backend/api/test/ai-design-studio/viewport.spec.ts` (new): isolated browser tests using generated fixtures and mocked API persistence; all seven views, initial fit, modes preserving records, semantic zoom, focus dimming and camera return, explicit arrangement, manual camera preservation, fullscreen/Escape/resize, save/reload, full-detail SVG exports, and large-diagram minimap/fit.
- `backend/api/test/ai-design-studio/workspace.spec.ts`: updated fullscreen button names.

## Validation

- AI design studio build and 27 package tests pass, including all seven generated types and legacy state machine.
- Four generation/orchestration tests pass.
- Browser viewport regression passes in Chrome. Class and large-diagram screenshots are in `test-results/ai-design-studio/viewport-class.png` and `viewport-large.png`.
- Frontend application typechecking and production build pass. Vite still reports large bundle warnings.
- Full backend typechecking reports two errors in the untouched `backend/api/src/db/models/reactflow-architecture.model.ts` Mixed array definitions (lines 23 and 24).

## Scope and limits

The seven native generated views are Architecture, Class, Sequence, Activity, Use Case, Component, and Deployment. The codebase does not have a native ER diagram schema/renderer; this change does not introduce a new diagram type. Legacy state machines remain supported. No live OpenAI calls were required for these regression tests.

Very large saved diagrams can fit the viewport, but fitting cannot make every label readable. Semantic zoom, focus, native zoom/pan, and the minimap provide detail navigation; new AI generation is capped at medium complexity. Crossing minimization is heuristic and does not guarantee zero crossings for every graph. Saved diagrams keep their positions until the user chooses Auto Arrange.
