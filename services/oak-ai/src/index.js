import express from 'express';
import cors from 'cors';

const app = express();
const PORT = Number(process.env.PORT || 4400);
const OLLAMA_URL = String(process.env.OLLAMA_URL || 'http://host.docker.internal:11434').replace(/\/$/, '');
const MODEL = process.env.OLLAMA_MODEL || 'qwen3:8b';
const BUILD = 'oak-local-ai-v2-operations';

app.use(cors());
app.use(express.json({ limit: '1mb' }));

const clean = (v) => String(v ?? '').trim();
const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const upper = (v) => clean(v).toUpperCase();
const normalizedName = (v) => clean(v).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function skuFrom(categoryCode, name) {
  const prefix = upper(categoryCode).replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'OAK';
  const body = upper(name).replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 28) || 'ITEM';
  return `${prefix}-${body}`.slice(0, 40);
}

function allowedUnits(trackingType) {
  if (trackingType === 'weight') return ['g', 'kg'];
  if (trackingType === 'volume') return ['ml', 'L'];
  return ['each'];
}

async function ollama(path, options = {}, timeoutMs = 120000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${OLLAMA_URL}${path}`, { ...options, signal: controller.signal });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = body?.error || `Ollama returned HTTP ${response.status}`;
      throw Object.assign(new Error(message), { status: 502 });
    }
    return body;
  } catch (e) {
    if (e?.name === 'AbortError') throw Object.assign(new Error('Local Ollama request timed out'), { status: 504 });
    if (e?.status) throw e;
    throw Object.assign(new Error(`Cannot reach Ollama at ${OLLAMA_URL}: ${e.message}`), { status: 503 });
  } finally {
    clearTimeout(timer);
  }
}

async function healthPayload() {
  try {
    const tags = await ollama('/api/tags', {}, 10000);
    const names = (tags.models || []).flatMap(m => [m.name, m.model]).filter(Boolean);
    const modelAvailable = names.some(n => n === MODEL || n.startsWith(`${MODEL}:`));
    return {
      ok: true,
      service: 'oak-local-ai',
      build: BUILD,
      ollama_url: OLLAMA_URL,
      model: MODEL,
      model_available: modelAvailable,
      installed_models: [...new Set(names)].slice(0, 30)
    };
  } catch (e) {
    return { ok: false, service: 'oak-local-ai', build: BUILD, ollama_url: OLLAMA_URL, model: MODEL, model_available: false, error: e.message };
  }
}

app.get('/health', async (_req, res) => {
  const h = await healthPayload();
  res.status(h.ok ? 200 : 503).json(h);
});

app.post('/product-proposal', async (req, res, next) => {
  try {
    const prompt = clean(req.body?.prompt);
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    const categories = Array.isArray(req.body?.categories) ? req.body.categories.slice(0, 50) : [];
    const categoryCodes = categories.map(c => upper(c.code)).filter(Boolean);
    const categoryNames = Object.fromEntries(categories.map(c => [upper(c.code), clean(c.name)]));
    if (!categoryCodes.length) categoryCodes.push('KITCHEN', 'BAR', 'SHISHA', 'GENERAL');

    const existingProducts = Array.isArray(req.body?.existing_products)
      ? req.body.existing_products.slice(0, 200).map(p => ({
          name: clean(p.name), sku: upper(p.sku), category_code: upper(p.category_code), subcategory: clean(p.subcategory)
        }))
      : [];

    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        summary: { type: 'string' },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        product: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string' },
            sku: { type: 'string' },
            category_code: { type: 'string', enum: categoryCodes },
            subcategory: { type: 'string' },
            tracking_type: { type: 'string', enum: ['weight', 'volume', 'count'] },
            display_unit: { type: 'string', enum: ['g', 'kg', 'ml', 'L', 'each'] },
            reorder_point: { type: 'number', minimum: 0 },
            par_level: { type: 'number', minimum: 0 },
            notes: { type: 'string' }
          },
          required: ['name', 'sku', 'category_code', 'subcategory', 'tracking_type', 'display_unit', 'reorder_point', 'par_level', 'notes']
        },
        packs: {
          type: 'array',
          maxItems: 12,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              label: { type: 'string' },
              quantity: { type: 'number', exclusiveMinimum: 0 },
              unit: { type: 'string', enum: ['g', 'kg', 'ml', 'L', 'each'] }
            },
            required: ['label', 'quantity', 'unit']
          }
        },
        warnings: { type: 'array', items: { type: 'string' }, maxItems: 10 },
        duplicate_candidates: { type: 'array', items: { type: 'string' }, maxItems: 10 }
      },
      required: ['summary', 'confidence', 'product', 'packs', 'warnings', 'duplicate_candidates']
    };

    const categoryText = categories.length
      ? categories.map(c => `${upper(c.code)} = ${clean(c.name)}`).join(', ')
      : 'KITCHEN, BAR, SHISHA, GENERAL';
    const productText = existingProducts.length
      ? existingProducts.map(p => `${p.sku} | ${p.name} | ${p.category_code} | ${p.subcategory}`).join('\n')
      : '(none)';

    const system = `You are Oak Admin Assistant for Oak Lounge restaurant inventory.\n` +
      `Your job is to PREPARE a product proposal for human approval. You never claim that a database change has already happened.\n` +
      `Use only these Oak categories: ${categoryText}.\n` +
      `Choose tracking_type: weight for ingredients/flavors measured by mass, volume for liquids measured by volume, count for discrete items.\n` +
      `Use compatible units only: weight -> g or kg; volume -> ml or L; count -> each.\n` +
      `For pack sizes, preserve the user's stated commercial pack sizes. Convert 1 kg to quantity 1 unit kg or 1000 unit g consistently.\n` +
      `Do not invent supplier names, prices, current stock, barcodes, or purchase history. If missing, omit from notes and add a warning only when it matters.\n` +
      `Create a short practical SKU. Check the existing product list for likely duplicates and list them in duplicate_candidates.\n` +
      `Return only JSON matching the supplied schema.`;

    const user = `ADMIN REQUEST:\n${prompt}\n\nEXISTING PRODUCTS FOR DUPLICATE CHECK:\n${productText}`;

    const response = await ollama('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        format: schema,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        options: { temperature: 0 }
      })
    });

    const content = response?.message?.content;
    if (!content) throw Object.assign(new Error('Ollama returned an empty response'), { status: 502 });
    let proposal;
    try { proposal = JSON.parse(content); }
    catch { throw Object.assign(new Error('Ollama did not return valid structured JSON'), { status: 502 }); }

    proposal.product = proposal.product || {};
    proposal.product.category_code = categoryCodes.includes(upper(proposal.product.category_code))
      ? upper(proposal.product.category_code)
      : categoryCodes[0];
    proposal.product.name = clean(proposal.product.name);
    proposal.product.sku = upper(proposal.product.sku) || skuFrom(proposal.product.category_code, proposal.product.name);
    proposal.product.subcategory = clean(proposal.product.subcategory);
    proposal.product.tracking_type = ['weight','volume','count'].includes(proposal.product.tracking_type) ? proposal.product.tracking_type : 'weight';
    const units = allowedUnits(proposal.product.tracking_type);
    proposal.product.display_unit = units.includes(proposal.product.display_unit) ? proposal.product.display_unit : units[0];
    proposal.product.reorder_point = Math.max(0, num(proposal.product.reorder_point, 0));
    proposal.product.par_level = Math.max(0, num(proposal.product.par_level, 0));
    proposal.product.notes = clean(proposal.product.notes);
    proposal.summary = clean(proposal.summary);
    proposal.confidence = Math.max(0, Math.min(1, num(proposal.confidence, 0.5)));
    proposal.warnings = Array.isArray(proposal.warnings) ? proposal.warnings.map(clean).filter(Boolean).slice(0, 10) : [];
    proposal.duplicate_candidates = Array.isArray(proposal.duplicate_candidates) ? proposal.duplicate_candidates.map(clean).filter(Boolean).slice(0, 10) : [];

    const deterministicDuplicates = existingProducts.filter(p => {
      const a = normalizedName(p.name);
      const b = normalizedName(proposal.product.name);
      return (a && b && (a === b || a.includes(b) || b.includes(a))) || (p.sku && p.sku === proposal.product.sku);
    }).map(p => `${p.name} (${p.sku})`);
    proposal.duplicate_candidates = [...new Set([...proposal.duplicate_candidates, ...deterministicDuplicates])].slice(0, 10);

    proposal.packs = Array.isArray(proposal.packs) ? proposal.packs.slice(0, 12).map(p => {
      const packUnits = allowedUnits(proposal.product.tracking_type);
      return {
        label: clean(p.label),
        quantity: Math.max(0.0001, num(p.quantity, 1)),
        unit: packUnits.includes(p.unit) ? p.unit : proposal.product.display_unit
      };
    }).filter(p => p.label) : [];

    const health = await healthPayload();
    res.json({ ok: true, proposal, health, model: MODEL, build: BUILD });
  } catch (e) { next(e); }
});


app.post('/receipt-proposal', async (req, res, next) => {
  try {
    const prompt = clean(req.body?.prompt);
    if (!prompt) return res.status(400).json({ error: 'Supplier text or receiving instruction is required' });
    const products = Array.isArray(req.body?.products) ? req.body.products.slice(0, 250).map(p => ({
      sku: upper(p.sku), name: clean(p.name), category_name: clean(p.category_name), display_unit: clean(p.display_unit),
      packs: Array.isArray(p.packs) ? p.packs.slice(0,20).map(x=>({label:clean(x.label),qty_display:num(x.qty_display,0)})) : []
    })) : [];
    if (!products.length) return res.status(400).json({ error: 'Existing product catalog is required for AI receiving' });
    const skus = [...new Set(products.map(p=>p.sku).filter(Boolean))];
    const schema = {
      type:'object', additionalProperties:false,
      properties:{
        summary:{type:'string'}, confidence:{type:'number',minimum:0,maximum:1}, supplier_name:{type:'string'}, reference:{type:'string'},
        lines:{type:'array',maxItems:40,items:{type:'object',additionalProperties:false,properties:{
          sku:{type:'string',enum:[...skus,'UNKNOWN']}, product_name:{type:'string'}, pack_label:{type:'string'}, pack_count:{type:'number',minimum:0},
          quantity:{type:'number',minimum:0}, unit:{type:'string'}, cost_per_pack:{type:'number',minimum:0}, total_cost:{type:'number',minimum:0}, note:{type:'string'}
        },required:['sku','product_name','pack_label','pack_count','quantity','unit','cost_per_pack','total_cost','note']}},
        warnings:{type:'array',items:{type:'string'},maxItems:20}
      },required:['summary','confidence','supplier_name','reference','lines','warnings']
    };
    const catalog = products.map(p=>`${p.sku} | ${p.name} | ${p.category_name} | unit=${p.display_unit} | packs=${p.packs.map(x=>x.label).join('; ')||'none'}`).join('\n');
    const system = `You are Oak Receiving Assistant for Oak Lounge inventory. Prepare a receiving proposal only; never claim stock has been posted.\n`+
      `Match supplier text only to the existing product catalog. Use SKU UNKNOWN when no reliable match exists.\n`+
      `If a commercial pack in the text matches an existing pack label, copy that pack_label and provide pack_count and cost_per_pack when stated.\n`+
      `If no pack match exists but quantity is clear, leave pack_label empty and provide quantity, unit and total_cost.\n`+
      `Never invent prices, quantities, supplier names, invoice numbers or products. Missing numbers must be 0 and should produce a warning.\n`+
      `Return only JSON matching the schema.`;
    const user = `SUPPLIER / RECEIVING TEXT:\n${prompt}\n\nOAK PRODUCT CATALOG:\n${catalog}`;
    const response = await ollama('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:MODEL,stream:false,format:schema,messages:[{role:'system',content:system},{role:'user',content:user}],options:{temperature:0}})});
    const content=response?.message?.content;
    if(!content) throw Object.assign(new Error('Ollama returned an empty response'),{status:502});
    let proposal; try{proposal=JSON.parse(content);}catch{throw Object.assign(new Error('Ollama did not return valid structured JSON'),{status:502});}
    proposal.summary=clean(proposal.summary); proposal.supplier_name=clean(proposal.supplier_name); proposal.reference=clean(proposal.reference);
    proposal.confidence=Math.max(0,Math.min(1,num(proposal.confidence,.5)));
    proposal.warnings=Array.isArray(proposal.warnings)?proposal.warnings.map(clean).filter(Boolean).slice(0,20):[];
    proposal.lines=Array.isArray(proposal.lines)?proposal.lines.slice(0,40).map(line=>{
      const sku=upper(line.sku); const match=products.find(p=>p.sku===sku); const packLabel=clean(line.pack_label);
      const pack=match?.packs?.find(x=>x.label.toLowerCase()===packLabel.toLowerCase());
      return {sku:match?sku:'UNKNOWN',product_name:match?.name||clean(line.product_name),pack_label:pack?.label||packLabel,pack_count:Math.max(0,num(line.pack_count,0)),quantity:Math.max(0,num(line.quantity,0)),unit:clean(line.unit)||match?.display_unit||'',cost_per_pack:Math.max(0,num(line.cost_per_pack,0)),total_cost:Math.max(0,num(line.total_cost,0)),note:clean(line.note),matched:Boolean(match),pack_matched:Boolean(pack)};
    }):[];
    res.json({ok:true,proposal,model:MODEL,build:BUILD});
  } catch(e){ next(e); }
});

app.use((err, _req, res, _next) => {
  const status = err?.status || 500;
  res.status(status).json({ error: err?.message || 'Oak AI error', build: BUILD });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Oak Local AI ${BUILD} listening on ${PORT}; model=${MODEL}; ollama=${OLLAMA_URL}`);
});
