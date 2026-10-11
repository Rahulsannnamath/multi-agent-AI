// apps/api/src/routes/reactflow-architectures.router.ts
import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'crypto';
import { ReactFlowArchitectureModel } from '../db/models/reactflow-architecture.model.js';

export const reactflowArchitecturesRouter = Router();

// ── POST /api/reactflow-architectures — Create a new architecture ──
reactflowArchitecturesRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body as { name?: string; description?: string };

    const architectureId = randomUUID();
    const architecture = await ReactFlowArchitectureModel.create({
      architectureId,
      name: (name && typeof name === 'string' && name.trim()) || 'Untitled Architecture',
      description: description || '',
      nodes: [],
      edges: []
    });

    return res.status(201).json(architecture);
  } catch (err) {
    console.error('[architectures] POST error:', err);
    return res.status(500).json({ error: 'Failed to create architecture' });
  }
});

// ── GET /api/reactflow-architectures — List all architectures ──
reactflowArchitecturesRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const architectures = await ReactFlowArchitectureModel.find(
      {},
      { architectureId: 1, name: 1, description: 1, version: 1, createdAt: 1, updatedAt: 1, _id: 0 }
    ).sort({ updatedAt: -1 });

    return res.json(architectures);
  } catch (err) {
    console.error('[architectures] GET list error:', err);
    return res.status(500).json({ error: 'Failed to fetch architectures' });
  }
});

// ── GET /api/reactflow-architectures/:id — Get a single architecture ──
reactflowArchitecturesRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const architecture = await ReactFlowArchitectureModel.findOne(
      { architectureId: req.params['id'] },
      { _id: 0 }
    );

    if (!architecture) {
      return res.status(404).json({ error: 'Architecture not found' });
    }

    return res.json(architecture);
  } catch (err) {
    console.error('[architectures] GET error:', err);
    return res.status(500).json({ error: 'Failed to fetch architecture' });
  }
});

// ── PUT /api/reactflow-architectures/:id — Update architecture ──
reactflowArchitecturesRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const updates = req.body;
    
    // Increment version if nodes/edges change
    let incVersion = 0;
    if (updates.nodes || updates.edges) {
      incVersion = 1;
    }

    const architecture = await ReactFlowArchitectureModel.findOneAndUpdate(
      { architectureId: req.params['id'] },
      { 
        $set: updates,
        ...(incVersion > 0 ? { $inc: { version: incVersion } } : {})
      },
      { new: true, projection: { _id: 0 } }
    );

    if (!architecture) {
      return res.status(404).json({ error: 'Architecture not found' });
    }

    return res.json(architecture);
  } catch (err) {
    console.error('[architectures] PUT error:', err);
    return res.status(500).json({ error: 'Failed to update architecture' });
  }
});

// ── DELETE /api/reactflow-architectures/:id — Delete an architecture ──
reactflowArchitecturesRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const result = await ReactFlowArchitectureModel.deleteOne({ architectureId: req.params['id'] });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Architecture not found' });
    }

    return res.json({ message: 'Architecture deleted' });
  } catch (err) {
    console.error('[architectures] DELETE error:', err);
    return res.status(500).json({ error: 'Failed to delete architecture' });
  }
});

// ── POST /api/reactflow-architectures/:id/generate — AI generation ──
reactflowArchitecturesRouter.post('/:id/generate', async (req: Request, res: Response) => {
  try {
    const { prompt } = req.body as { prompt?: string };

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'prompt is required' });
    }

    const architecture = await ReactFlowArchitectureModel.findOne({ architectureId: req.params['id'] });
    if (!architecture) {
      return res.status(404).json({ error: 'Architecture not found' });
    }

    const apiKey = process.env['OPENAI_API_KEY'];
    if (!apiKey) {
      return res.status(400).json({ error: 'OpenAI API key not configured' });
    }

    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey });

    const systemPrompt = `You are a senior software architect. Analyze the user's requirement and generate a STRICT STRUCTURED JSON architecture representation.
    
    The JSON must match this structure exactly (return ONLY valid JSON):
    {
      "name": "System Name",
      "description": "System Description",
      "requirements": ["Req 1", "Req 2"],
      "nodes": [
        {
          "id": "unique-node-id",
          "type": "service", // can be: frontend, backend, database, cache, queue, api, auth, storage, loadbalancer, ai, cloud, service
          "name": "Component Name",
          "technology": "e.g. Node.js",
          "framework": "e.g. Express",
          "description": "Component description",
          "position": { "x": 0, "y": 0 }
        }
      ],
      "edges": [
        {
          "source": "source-node-id",
          "target": "target-node-id",
          "label": "e.g. HTTP, SQL, AMQP",
          "type": "request"
        }
      ]
    }
    
    Position nodes logically (e.g. frontend at top, backend in middle, db at bottom, horizontally spaced out by at least 300px, vertically by 200px).
    Ensure node IDs are stable strings without spaces.`;

    const model = process.env['OPENAI_MODEL'] ?? 'gpt-4o';
    const isLuna = model === 'gpt-6-luna' || model.startsWith('gpt-6-luna-');

    const completion = await openai.chat.completions.create({
      model,
      max_completion_tokens: 16384,
      ...(isLuna ? { reasoning_effort: 'medium' as const } : { temperature: 0.3 }),
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt.trim() },
      ],
    });

    const rawJson = completion.choices[0]?.message?.content ?? '{}';
    let parsed;
    try {
      parsed = JSON.parse(rawJson);
    } catch (e) {
      return res.status(500).json({ error: 'AI returned invalid JSON.' });
    }
    
    // Normalize basic layout if position missing
    if (parsed.nodes && Array.isArray(parsed.nodes)) {
      parsed.nodes = parsed.nodes.map((n: any, idx: number) => {
        if (!n.position) {
          n.position = { x: (idx % 3) * 300, y: Math.floor(idx / 3) * 200 };
        }
        return n;
      });
    }

    architecture.name = parsed.name || architecture.name;
    architecture.description = parsed.description || architecture.description;
    architecture.requirements = parsed.requirements || architecture.requirements;
    architecture.nodes = parsed.nodes || [];
    architecture.edges = parsed.edges || [];
    architecture.version += 1;

    await architecture.save();

    return res.json({
      architectureId: architecture.architectureId,
      architecture: parsed,
      message: 'Architecture generated successfully'
    });
  } catch (err) {
    console.error('[architectures] AI generation error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Generation failed' });
  }
});
