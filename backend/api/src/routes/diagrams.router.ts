// apps/api/src/routes/diagrams.router.ts
// CRUD routes for Architecture Designer diagrams.

import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'crypto';
import { DiagramModel } from '../db/models/diagram.model.js';

export const diagramsRouter = Router();

const BLANK_XML =
  '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>';

// ── POST /api/diagrams — Create a new diagram ────────────────────────────────
diagramsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { name, diagramXml } = req.body as { name?: string; diagramXml?: string };

    const diagramId = randomUUID();
    const diagram = await DiagramModel.create({
      diagramId,
      name: (name && typeof name === 'string' && name.trim()) || 'Untitled Diagram',
      diagramXml: (diagramXml && typeof diagramXml === 'string') ? diagramXml : BLANK_XML,
    });

    return res.status(201).json({
      diagramId: diagram.diagramId,
      name: diagram.name,
      createdAt: diagram.createdAt,
    });
  } catch (err) {
    console.error('[diagrams] POST error:', err);
    return res.status(500).json({ error: 'Failed to create diagram' });
  }
});

// ── GET /api/diagrams — List all diagrams ─────────────────────────────────────
diagramsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const diagrams = await DiagramModel.find(
      {},
      { diagramId: 1, name: 1, createdAt: 1, updatedAt: 1, _id: 0 }
    ).sort({ updatedAt: -1 });

    return res.json(diagrams);
  } catch (err) {
    console.error('[diagrams] GET list error:', err);
    return res.status(500).json({ error: 'Failed to fetch diagrams' });
  }
});

// ── GET /api/diagrams/:id — Get a single diagram with XML ────────────────────
diagramsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const diagram = await DiagramModel.findOne(
      { diagramId: req.params['id'] },
      { diagramId: 1, name: 1, diagramXml: 1, createdAt: 1, updatedAt: 1, _id: 0 }
    );

    if (!diagram) {
      return res.status(404).json({ error: 'Diagram not found' });
    }

    return res.json(diagram);
  } catch (err) {
    console.error('[diagrams] GET error:', err);
    return res.status(500).json({ error: 'Failed to fetch diagram' });
  }
});

// ── PUT /api/diagrams/:id — Update diagram name and/or XML ───────────────────
diagramsRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const { name, diagramXml } = req.body as { name?: string; diagramXml?: string };

    const updates: Record<string, unknown> = {};
    if (name && typeof name === 'string') updates.name = name.trim();
    if (diagramXml && typeof diagramXml === 'string') updates.diagramXml = diagramXml;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const diagram = await DiagramModel.findOneAndUpdate(
      { diagramId: req.params['id'] },
      { $set: updates },
      { new: true, projection: { diagramId: 1, name: 1, updatedAt: 1, _id: 0 } }
    );

    if (!diagram) {
      return res.status(404).json({ error: 'Diagram not found' });
    }

    return res.json(diagram);
  } catch (err) {
    console.error('[diagrams] PUT error:', err);
    return res.status(500).json({ error: 'Failed to update diagram' });
  }
});

// ── DELETE /api/diagrams/:id — Delete a diagram ──────────────────────────────
diagramsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const result = await DiagramModel.deleteOne({ diagramId: req.params['id'] });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Diagram not found' });
    }

    return res.json({ message: 'Diagram deleted' });
  } catch (err) {
    console.error('[diagrams] DELETE error:', err);
    return res.status(500).json({ error: 'Failed to delete diagram' });
  }
});

// ── POST /api/diagrams/:id/generate-architecture — AI architecture generation ─
diagramsRouter.post('/:id/generate-architecture', async (req: Request, res: Response) => {
  try {
    const { prompt } = req.body as { prompt?: string };

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'prompt is required' });
    }

    const diagram = await DiagramModel.findOne({ diagramId: req.params['id'] });
    if (!diagram) {
      return res.status(404).json({ error: 'Diagram not found' });
    }

    // Use OpenAI to generate architecture
    const apiKey = process.env['OPENAI_API_KEY'];
    if (!apiKey) {
      return res.status(400).json({ error: 'OpenAI API key not configured' });
    }

    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey });

    const systemPrompt = `You are a senior software architect. The user will describe a system and you must generate a valid draw.io (mxGraph) XML diagram representing the architecture.

RULES:
- Return ONLY valid mxGraphModel XML. No explanation, no markdown fences, no extra text.
- Use rectangles for services/components, cylinders for databases, clouds for external services, diamonds for decision points.
- Use proper arrows to show data flow and connections.
- Lay out components in a clear, readable grid with proper spacing (use x/y coordinates with at least 200px gaps).
- Use descriptive labels on each shape and connection.
- Include colors: blue (#dae8fc, stroke #6c8ebf) for frontend, green (#d5e8d4, stroke #82b366) for backend, orange (#ffe6cc, stroke #d6b656) for databases, purple (#e1d5e7, stroke #9673a6) for external/AI services, red (#f8cecc, stroke #b85450) for caches/queues.
- Make the diagram professional and detailed with all components the user describes.
- Use style attributes for shapes: "rounded=1;whiteSpace=wrap;html=1;fillColor=COLOR;strokeColor=STROKE;fontSize=12;fontStyle=1"
- Use style attributes for edges: "edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#666666;strokeWidth=2;"
- Every mxCell with a vertex or edge must have parent="1".
- Start IDs from 2 (0 and 1 are reserved for root cells).
- The XML must start with <mxGraphModel> and end with </mxGraphModel>.`;

    const model = process.env['OPENAI_MODEL'] ?? 'gpt-4o';
    const isLuna = model === 'gpt-6-luna' || model.startsWith('gpt-6-luna-');

    const completion = await openai.chat.completions.create({
      model,
      max_completion_tokens: 16384,
      // gpt-6-luna only supports default temperature (1); use reasoning_effort instead
      ...(isLuna
        ? { reasoning_effort: 'medium' as const }
        : { temperature: 0.3 }),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Generate a draw.io architecture diagram for: ${prompt.trim()}` },
      ],
    });

    let xml = completion.choices[0]?.message?.content ?? '';

    // Strip markdown fences if present
    xml = xml.trim();
    xml = xml.replace(/^```(?:xml)?\s*/i, '').replace(/\s*```$/i, '');

    // Basic validation
    if (!xml.includes('<mxGraphModel') || !xml.includes('</mxGraphModel>')) {
      return res.status(500).json({
        error: 'AI generated invalid diagram XML. Please try again.',
      });
    }

    // Save the generated diagram
    diagram.diagramXml = xml;
    await diagram.save();

    return res.json({
      diagramId: diagram.diagramId,
      diagramXml: xml,
      message: 'Architecture diagram generated successfully',
    });
  } catch (err) {
    console.error('[diagrams] AI generation error:', err);
    const message = err instanceof Error ? err.message : 'AI generation failed';
    return res.status(500).json({ error: message });
  }
});
