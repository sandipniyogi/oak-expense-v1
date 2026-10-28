import express from 'express';
import cors from 'cors';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import ExcelJS from 'exceljs';
import sharp from 'sharp';

const { Pool } = pg;
const app = express();
const port = process.env.PORT || 4000;
const uploadDir = process.env.UPLOAD_DIR || '/app/uploads';
const ocrUrl = process.env.OCR_URL || 'http://localhost:8001';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
if(process.env.OAK_SYNC_ENABLED==='1')await pool.query(fs.readFileSync(new URL('./automation-schema.sql',import.meta.url),'utf8'));

fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir, limits: { fileSize: 12 * 1024 * 1024 } });

// Normalize uploaded images to PNG before OCR/storage. This lets the UI accept
// common formats such as JPG/JPEG, PNG, WebP, GIF, TIFF, BMP, AVIF and, when
// supported by the installed Sharp/libvips build, HEIC/HEIF.
async function normalizeUploadedImage(file) {
  if (!file) throw new Error('file required');

  const originalBytes = fs.readFileSync(file.path);
  try {
    const image = sharp(originalBytes, { animated: false, failOn: 'error' });
    const metadata = await image.metadata();
    if (!metadata.format) throw new Error('Unsupported image format');

    // rotate() honors EXIF orientation, then PNG gives OCR/Excel one predictable format.
    const normalizedBytes = await image.rotate().png().toBuffer();
    fs.writeFileSync(file.path, normalizedBytes);

    return {
      bytes: normalizedBytes,
      mimetype: 'image/png',
      original_format: metadata.format,
      stored_format: 'png'
    };
  } catch (err) {
    try { fs.unlinkSync(file.path); } catch (_e) {}
    const error = new Error(
      'Unsupported image. Please use JPG/JPEG, PNG, WebP, GIF, TIFF, BMP, AVIF, or another standard image format.'
    );
    error.status = 400;
    error.cause = err;
    throw error;
  }
}

app.use(cors());
app.use(express.json());

app.get('/health', async (_req, res) => {
  const db = await pool.query('select now() as now');
  res.json({ ok: true, db: db.rows[0].now });
});

app.get('/meta', async (_req, res) => {
  const [users, categories, reportUsers] = await Promise.all([
    pool.query('select id,name,role from users where active=true order by created_at'),
    pool.query('select id,name from categories order by name'),
    pool.query('select id,name,active from users order by name')
  ]);
  res.json({ users: users.rows, categories: categories.rows, report_users: reportUsers.rows });
});

// Store a screenshot without running OCR. This is used by the Manual / Other App flow.
// The returned image_path is saved on the expense, so the same screenshot is later
// embedded in the XLSX report by /reports/expenses.xlsx.
app.post('/attachments', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file required' });
    const normalized = await normalizeUploadedImage(req.file);
    const bytes = normalized.bytes;
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    const duplicate = await pool.query(
      "select id, amount, expense_date from expenses where image_sha256=$1 or exists (select 1 from jsonb_array_elements(case when jsonb_typeof(ocr_raw->'combined_payments')='array' then ocr_raw->'combined_payments' else '[]'::jsonb end) part where part->>'image_sha256'=$1) limit 1", [sha256]
    );

    res.json({
      image_path: path.basename(req.file.path),
      image_sha256: sha256,
      original_format: normalized.original_format,
      stored_format: normalized.stored_format,
      duplicate: duplicate.rows[0] || null
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post('/ocr', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file required' });
    const normalized = await normalizeUploadedImage(req.file);
    const bytes = normalized.bytes;
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');

    const duplicate = await pool.query(
      "select id, amount, expense_date from expenses where image_sha256=$1 or exists (select 1 from jsonb_array_elements(case when jsonb_typeof(ocr_raw->'combined_payments')='array' then ocr_raw->'combined_payments' else '[]'::jsonb end) part where part->>'image_sha256'=$1) limit 1", [sha256]
    );

    const form = new FormData();
    form.append('file', new Blob([bytes], { type: normalized.mimetype }), 'oak-upload.png');
    const response = await fetch(`${ocrUrl}/extract`, { method: 'POST', body: form });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'OCR failed');

    res.json({
      ...data,
      image_path: path.basename(req.file.path),
      image_sha256: sha256,
      original_format: normalized.original_format,
      stored_format: normalized.stored_format,
      duplicate: duplicate.rows[0] || null
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

async function findOrCreateMerchantId(client, merchant, categoryId) {
  if (!merchant || !String(merchant).trim()) return null;
  const name = String(merchant).trim();
  const found = await client.query(
    'select id from merchants where lower(name)=lower($1) limit 1',
    [name]
  );
  if (found.rows[0]) return found.rows[0].id;
  const inserted = await client.query(
    'insert into merchants(name, default_category_id) values ($1,$2) returning id',
    [name, categoryId || null]
  );
  return inserted.rows[0].id;
}

async function removeStoredImageIfUnused(imagePath) {
  if(process.env.OAK_SYNC_ENABLED==='1')return; // Retain peer attachments and conflict evidence.
  if (!imagePath) return;
  const safeName = path.basename(imagePath);
  const refs = await pool.query(
    "select count(*)::int as count from expenses where image_path=$1 or exists (select 1 from jsonb_array_elements(case when jsonb_typeof(ocr_raw->'combined_payments')='array' then ocr_raw->'combined_payments' else '[]'::jsonb end) part where part->>'image_path'=$1)",
    [safeName]
  );
  if (Number(refs.rows[0]?.count || 0) > 0) return;
  const filePath = path.join(uploadDir, safeName);
  try { fs.unlinkSync(filePath); } catch (err) {
    if (err.code !== 'ENOENT') console.warn('Could not remove screenshot:', err.message);
  }
}

function assertStoredAttachment(imagePath) {
  if (!imagePath) return null;
  const safeName = path.basename(String(imagePath));
  const filePath = path.join(uploadDir, safeName);
  if (!fs.existsSync(filePath)) {
    const error = new Error('Replacement screenshot was not found on the server. Upload it again.');
    error.status = 400;
    throw error;
  }
  return safeName;
}

app.post('/expenses', async (req, res) => {
  const {
    user_id, category_id, amount, currency='CNY', payment_method,
    expense_date, merchant, transaction_id, description,
    reimbursement_required=false, image_path, image_sha256,
    ocr_raw={}, ocr_confidence=null
  } = req.body;

  if (!user_id || !amount) return res.status(400).json({ error: 'user_id and amount are required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const saveKey=req.get('Idempotency-Key');
    let requestHash;
    if(saveKey){
      if(process.env.OAK_SYNC_ENABLED!=='1')throw Object.assign(new Error('Retry-safe phone saving requires automation.'),{status:503});
      if(!/^[A-Za-z0-9:._-]{1,150}$/.test(saveKey))throw Object.assign(new Error('Invalid save key'),{status:400});
      requestHash=crypto.createHash('sha256').update(JSON.stringify(req.body)).digest('hex');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[saveKey]);
      const previous=(await client.query('SELECT * FROM oak_phone_saves WHERE id=$1',[saveKey])).rows[0];
      if(previous){
        if(previous.request_hash!==requestHash)throw Object.assign(new Error('Receipt was already submitted with different details.'),{status:409});
        const expense=(await client.query('SELECT * FROM expenses WHERE id=$1',[previous.expense_id])).rows[0];
        if(!expense)throw Object.assign(new Error('Receipt was saved and subsequently deleted.'),{status:410});
        await client.query('COMMIT');return res.json(expense);
      }
    }
    const merchantId = await findOrCreateMerchantId(client, merchant, category_id);

    const status = reimbursement_required ? 'pending' : 'not_required';
    const result = await client.query(`
      insert into expenses(
        user_id, merchant_id, category_id, amount, currency, payment_method,
        expense_date, transaction_id, description, reimbursement_required,
        reimbursement_status, image_path, image_sha256, ocr_raw, ocr_confidence
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      returning *`, [
        user_id, merchantId, category_id || null, amount, currency, payment_method || null,
        expense_date || null, transaction_id || null, description || null, reimbursement_required,
        status, image_path || null, image_sha256 || null, ocr_raw, ocr_confidence
      ]);
    if(saveKey)await client.query('INSERT INTO oak_phone_saves(id,request_hash,expense_id) VALUES($1,$2,$3)',[saveKey,requestHash,result.rows[0].id]);
    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(e.status||500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// Combine reviewed payment images into one expense. Amounts are in CNY cents.
app.post('/expenses/combined', async (req, res) => {
  const {user_id,category_id,merchant,payment_method,expense_date,description,reimbursement_required=false,parts} = req.body || {};
  if (!user_id || !String(merchant || '').trim() || !Array.isArray(parts) || parts.length < 1 || parts.length > 20)
    return res.status(400).json({error:'Choose a payer, enter the vendor and select 1 to 20 screenshots.'});
  const client = await pool.connect();
  try {
    const validated = parts.map(p => {
      const entries = Array.isArray(p.amounts) ? p.amounts : [p.amount];
      if (!entries.length || entries.length > 50) throw Object.assign(new Error('Enter between 1 and 50 amounts per screenshot.'),{status:400});
      const amountCents = entries.map(entry => {
        const amount=String(entry ?? '').trim();
        if (!/^\d+(?:\.\d{1,2})?$/.test(amount)) throw Object.assign(new Error('Each amount must be a positive number with at most two decimal places.'),{status:400});
        const [whole,fraction='']=amount.split('.');
        const cents=Number(whole)*100+Number((fraction+'00').slice(0,2));
        if(!Number.isSafeInteger(cents)||cents<=0||cents>999999999999) throw Object.assign(new Error('Invalid payment amount.'),{status:400});
        return cents;
      });
      const cents=amountCents.reduce((a,b)=>a+b,0);
      if(!Number.isSafeInteger(cents)||cents>999999999999) throw Object.assign(new Error('Screenshot total is too large.'),{status:400});
      const image_path=assertStoredAttachment(p.image_path);
      if (!image_path || image_path !== p.image_path) throw Object.assign(new Error('Each payment requires a valid uploaded screenshot.'),{status:400});
      const image_sha256=crypto.createHash('sha256').update(fs.readFileSync(path.join(uploadDir,image_path))).digest('hex');
      return {amount:(cents/100).toFixed(2),amounts:amountCents.map(n=>(n/100).toFixed(2)),image_path,image_sha256,expense_date:p.expense_date || null,original_filename:String(p.original_filename||'').slice(0,255),ocr_raw:p.ocr_raw||{}};
    });
    if (validated.reduce((n,p)=>n+p.amounts.length,0) < 2) throw Object.assign(new Error('Enter at least two payment amounts.'),{status:400});
    const hashes=validated.map(p=>p.image_sha256);
    if (new Set(hashes).size !== hashes.length) throw Object.assign(new Error('The same screenshot was selected more than once.'),{status:400});
    const cents=validated.reduce((sum,p)=>sum+Math.round(Number(p.amount)*100),0);
    if (!Number.isSafeInteger(cents) || cents > 999999999999) throw Object.assign(new Error('Combined total is too large.'),{status:400});
    await client.query('BEGIN');
    // Refuse known duplicates, including individual images from an existing combined expense.
    const duplicate=await client.query(`select id from expenses where image_sha256=any($1::text[]) or exists (select 1 from jsonb_array_elements(case when jsonb_typeof(ocr_raw->'combined_payments')='array' then ocr_raw->'combined_payments' else '[]'::jsonb end) part where part->>'image_sha256'=any($1::text[])) limit 1`,[hashes]);
    if(duplicate.rows.length) throw Object.assign(new Error('A screenshot is already attached to a saved expense. Check duplicates before combining.'),{status:409});
    const merchantId=await findOrCreateMerchantId(client,merchant,category_id);
    const result=await client.query(`insert into expenses(user_id,merchant_id,category_id,amount,currency,payment_method,expense_date,description,reimbursement_required,reimbursement_status,image_path,image_sha256,ocr_raw) values($1,$2,$3,$4,'CNY',$5,$6,$7,$8,$9,$10,$11,$12) returning *`,[user_id,merchantId,category_id||null,(cents/100).toFixed(2),payment_method||null,expense_date||null,description||null,Boolean(reimbursement_required),reimbursement_required?'pending':'not_required',validated[0].image_path,validated[0].image_sha256,{source:'combined',combined_payments:validated}]);
    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch(e) { try { await client.query('ROLLBACK'); } catch {} res.status(e.status||500).json({error:e.message}); }
  finally { client.release(); }
});

app.get('/expenses', async (_req, res) => {
  const q = await pool.query(`
    select e.id,e.user_id,e.category_id,e.amount,e.currency,e.payment_method,e.expense_date,e.description,
      e.reimbursement_required,e.reimbursement_status,e.image_path,e.image_sha256,e.ocr_confidence,e.created_at,
      case when jsonb_typeof(e.ocr_raw->'combined_payments')='array' then jsonb_array_length(e.ocr_raw->'combined_payments') else 0 end as combined_count,
      u.name as paid_by, c.name as category, m.name as merchant
    from expenses e
    left join users u on u.id=e.user_id
    left join categories c on c.id=e.category_id
    left join merchants m on m.id=e.merchant_id
    order by coalesce(e.expense_date, e.created_at::date) desc, e.created_at desc
    limit 100`);
  res.json(q.rows);
});

// Update a saved expense in place. A replacement screenshot is first uploaded
// through POST /attachments, then its image_path/image_sha256 are sent here.
app.put('/expenses/:id', async (req, res) => {
  const id = req.params.id;
  const {
    user_id, category_id, amount, currency='CNY', payment_method,
    expense_date, merchant, description, reimbursement_required=false,
    image_path, image_sha256, remove_screenshot=false,
    ocr_raw, ocr_confidence
  } = req.body;

  if (!user_id || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    return res.status(400).json({ error: 'user_id and a positive amount are required' });
  }

  const client = await pool.connect();
  let oldImagePath = null;
  try {
    await client.query('BEGIN');
    const currentResult = await client.query(
      'select image_path,image_sha256,ocr_raw,ocr_confidence from expenses where id=$1 for update',
      [id]
    );
    const current = currentResult.rows[0];
    if (!current) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Expense not found' });
    }

    if (Array.isArray(current.ocr_raw?.combined_payments)) {
      await client.query('ROLLBACK');
      return res.status(400).json({error:'Combined expenses cannot be edited yet. Delete and recreate the entry if a correction is needed.'});
    }
    oldImagePath = current.image_path;
    const merchantId = await findOrCreateMerchantId(client, merchant, category_id);
    const status = reimbursement_required ? 'pending' : 'not_required';

    let nextImagePath = current.image_path;
    let nextImageSha = current.image_sha256;
    let nextOcrRaw = current.ocr_raw;
    let nextOcrConfidence = current.ocr_confidence;

    if (remove_screenshot) {
      nextImagePath = null;
      nextImageSha = null;
      nextOcrRaw = null;
      nextOcrConfidence = null;
    } else if (image_path) {
      nextImagePath = assertStoredAttachment(image_path);
      nextImageSha = image_sha256 || null;
      nextOcrRaw = Object.prototype.hasOwnProperty.call(req.body, 'ocr_raw') ? ocr_raw : current.ocr_raw;
      nextOcrConfidence = Object.prototype.hasOwnProperty.call(req.body, 'ocr_confidence') ? ocr_confidence : null;
    }

    const updated = await client.query(`
      update expenses set
        user_id=$2,
        merchant_id=$3,
        category_id=$4,
        amount=$5,
        currency=$6,
        payment_method=$7,
        expense_date=$8,
        description=$9,
        reimbursement_required=$10,
        reimbursement_status=$11,
        image_path=$12,
        image_sha256=$13,
        ocr_raw=$14,
        ocr_confidence=$15
      where id=$1
      returning *`, [
        id, user_id, merchantId, category_id || null, Number(amount), currency || 'CNY',
        payment_method || null, expense_date || null, description || null,
        Boolean(reimbursement_required), status, nextImagePath, nextImageSha,
        nextOcrRaw, nextOcrConfidence
      ]);

    await client.query('COMMIT');

    if (oldImagePath && oldImagePath !== nextImagePath) {
      await removeStoredImageIfUnused(oldImagePath);
    }

    res.json(updated.rows[0]);
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_rollbackError) {}
    // If a newly-uploaded attachment was never attached because the update failed,
    // leave it in uploads rather than risking removal of a referenced image.
    res.status(e.status || 500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// Delete an expense. Its screenshot is also removed when no other expense references it.
app.delete('/expenses/:id', async (req, res) => {
  const client = await pool.connect();
  let imagePath = null;
  let additionalPaths = [];
  try {
    await client.query('BEGIN');
    const found = await client.query('select image_path,ocr_raw from expenses where id=$1 for update', [req.params.id]);
    if (!found.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Expense not found' });
    }
    imagePath = found.rows[0].image_path;
    additionalPaths = Array.isArray(found.rows[0].ocr_raw?.combined_payments) ? found.rows[0].ocr_raw.combined_payments.map(p=>p.image_path) : [];
    await client.query('delete from expenses where id=$1', [req.params.id]);
    await client.query('COMMIT');
    for (const p of new Set([imagePath,...additionalPaths].filter(Boolean))) await removeStoredImageIfUnused(p);
    res.json({ ok: true });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_rollbackError) {}
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// View an individual screenshot from a combined expense.
app.get('/expenses/:id/combined-screenshot/:index', async (req,res) => {
  try {
    const index=Number(req.params.index);
    const result=await pool.query('select ocr_raw from expenses where id=$1',[req.params.id]);
    const parts=result.rows[0]?.ocr_raw?.combined_payments;
    if(!Number.isInteger(index)||index<0||!Array.isArray(parts)||!parts[index]?.image_path) return res.status(404).json({error:'Screenshot not found'});
    const filename=path.join(uploadDir,path.basename(parts[index].image_path));
    if(!fs.existsSync(filename)) return res.status(404).json({error:'Screenshot file is missing'});
    const bytes=fs.readFileSync(filename);const ext=detectImageExtension(bytes);
    if(!ext)return res.status(415).json({error:'Unsupported image'});
    res.type(ext==='jpeg'?'image/jpeg':'image/png').send(bytes);
  }catch(e){res.status(500).json({error:e.message});}
});

// Show the stored screenshot in the browser for verification.
app.get('/expenses/:id/screenshot', async (req, res) => {
  try {
    const result = await pool.query('select image_path from expenses where id=$1', [req.params.id]);
    const imagePath = result.rows[0]?.image_path;
    if (!imagePath) return res.status(404).json({ error: 'No screenshot attached' });

    const safeName = path.basename(imagePath);
    const filePath = path.join(uploadDir, safeName);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Screenshot file is missing' });

    const bytes = fs.readFileSync(filePath);
    const extension = detectImageExtension(bytes);
    res.setHeader('Content-Type', extension === 'jpeg' ? 'image/jpeg' : 'image/png');
    res.setHeader('Content-Disposition', 'inline');
    res.send(bytes);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function parseReportFilters(query) {
  const paymentMethod = String(query.payment_method || 'all').toLowerCase();
  const from = query.from ? String(query.from) : '';
  const to = query.to ? String(query.to) : '';
  const amount = query.amount == null ? '' : String(query.amount).trim();
  if (amount && (!/^\d{1,10}(?:\.\d{1,2})?$/.test(amount))) {
    throw Object.assign(new Error('Amount must be a non-negative number with at most two decimal places, for example 250.00.'), {status:400});
  }
  const userId = query.user_id ? String(query.user_id) : '';
  if(userId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    throw Object.assign(new Error('Paid by must be a valid user ID.'),{status:400});
  }

  if (!['all', 'wechat', 'alipay', 'other'].includes(paymentMethod)) {
    const error = new Error('payment_method must be all, wechat, alipay, or other');
    error.status = 400;
    throw error;
  }

  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (from && !datePattern.test(from)) {
    const error = new Error('from must be YYYY-MM-DD');
    error.status = 400;
    throw error;
  }
  if (to && !datePattern.test(to)) {
    const error = new Error('to must be YYYY-MM-DD');
    error.status = 400;
    throw error;
  }
  if (from && to && from > to) {
    const error = new Error('from date cannot be after to date');
    error.status = 400;
    throw error;
  }

  const filters = [];
  const params = [];
  const addParam = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  if(amount) filters.push(`e.amount = ${addParam(amount)}::numeric`);
  if(userId) filters.push(`e.user_id = ${addParam(userId)}::uuid`);
  if (paymentMethod !== 'all') {
    filters.push(`lower(coalesce(e.payment_method, '')) = ${addParam(paymentMethod)}`);
  }
  if (from) {
    filters.push(`coalesce(e.expense_date, e.created_at::date) >= ${addParam(from)}::date`);
  }
  if (to) {
    filters.push(`coalesce(e.expense_date, e.created_at::date) <= ${addParam(to)}::date`);
  }

  return {
    paymentMethod,
    amount,
    userId,
    from,
    to,
    params,
    whereSql: filters.length ? `where ${filters.join(' and ')}` : ''
  };
}

async function getExpenseReport(query) {
  const filter = parseReportFilters(query);
  const { params, whereSql } = filter;
  let payerName='All people';
  if(filter.userId){
    const payer=await pool.query('select name from users where id=$1',[filter.userId]);
    if(!payer.rows[0]) throw Object.assign(new Error('Selected payer was not found.'),{status:400});
    payerName=payer.rows[0].name;
  }

  const summarySql = `
    select
      count(*)::int as transaction_count,
      coalesce(sum(e.amount), 0) as total_amount,
      count(*) filter (where lower(coalesce(e.payment_method,''))='wechat')::int as wechat_count,
      coalesce(sum(e.amount) filter (where lower(coalesce(e.payment_method,''))='wechat'), 0) as wechat_total,
      count(*) filter (where lower(coalesce(e.payment_method,''))='alipay')::int as alipay_count,
      coalesce(sum(e.amount) filter (where lower(coalesce(e.payment_method,''))='alipay'), 0) as alipay_total,
      count(*) filter (
        where lower(coalesce(e.payment_method,'')) not in ('wechat','alipay')
           or e.payment_method is null
      )::int as other_count,
      coalesce(sum(e.amount) filter (
        where lower(coalesce(e.payment_method,'')) not in ('wechat','alipay')
           or e.payment_method is null
      ), 0) as other_total,
      count(*) filter (where e.reimbursement_required=true and e.reimbursement_status='pending')::int as reimbursement_pending_count,
      coalesce(sum(e.amount) filter (where e.reimbursement_required=true and e.reimbursement_status='pending'), 0) as reimbursement_pending_total
    from expenses e
    ${whereSql}`;

  const rowsSql = `
    select
      e.id,
      e.amount,
      e.currency,
      e.payment_method,
      e.expense_date,
      e.description,
      e.reimbursement_required,
      e.reimbursement_status,
      e.image_path,
      e.ocr_raw,
      e.created_at,
      u.name as paid_by,
      c.name as category,
      m.name as merchant
    from expenses e
    left join users u on u.id=e.user_id
    left join categories c on c.id=e.category_id
    left join merchants m on m.id=e.merchant_id
    ${whereSql}
    order by coalesce(e.expense_date, e.created_at::date) desc, e.created_at desc
    limit 5000`;

  const [summaryResult, rowsResult] = await Promise.all([
    pool.query(summarySql, params),
    pool.query(rowsSql, params)
  ]);

  return {
    generated_at: new Date().toISOString(),
    filter: {
      payment_method: filter.paymentMethod,
      user_id: filter.userId || null,
      paid_by: payerName,
      amount: filter.amount || null,
      from: filter.from || null,
      to: filter.to || null
    },
    summary: summaryResult.rows[0],
    rows: rowsResult.rows
  };
}

function reportRowDate(row) {
  if (row.expense_date) {
    if (typeof row.expense_date === 'string') return row.expense_date.slice(0, 10);
    return row.expense_date.toISOString().slice(0, 10);
  }
  if (row.created_at) return new Date(row.created_at).toISOString().slice(0, 10);
  return '';
}

function paymentLabel(method) {
  if (method === 'wechat') return 'WeChat';
  if (method === 'alipay') return 'Alipay';
  if (method === 'cash') return 'Cash';
  if (method === 'card') return 'Card';
  if (method === 'other') return 'Other app';
  return method || 'Unknown';
}

function detectImageExtension(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) {
    return 'png';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg';
  }
  return null;
}

function imageDimensions(buffer, extension) {
  try {
    if (extension === 'png' && buffer.length >= 24) {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }
    if (extension === 'jpeg') {
      let offset = 2;
      const sofMarkers = new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);
      while (offset + 9 < buffer.length) {
        if (buffer[offset] !== 0xff) {
          offset += 1;
          continue;
        }
        const marker = buffer[offset + 1];
        if (marker === 0xd8 || marker === 0xd9) {
          offset += 2;
          continue;
        }
        if (offset + 4 > buffer.length) break;
        const segmentLength = buffer.readUInt16BE(offset + 2);
        if (segmentLength < 2) break;
        if (sofMarkers.has(marker) && offset + 9 < buffer.length) {
          return {
            height: buffer.readUInt16BE(offset + 5),
            width: buffer.readUInt16BE(offset + 7)
          };
        }
        offset += 2 + segmentLength;
      }
    }
  } catch (_e) {
    return null;
  }
  return null;
}

function fitImage(dimensions, maxWidth = 150, maxHeight = 120) {
  if (!dimensions?.width || !dimensions?.height) return { width: 90, height: 115 };
  const scale = Math.min(maxWidth / dimensions.width, maxHeight / dimensions.height, 1);
  return {
    width: Math.max(30, Math.round(dimensions.width * scale)),
    height: Math.max(30, Math.round(dimensions.height * scale))
  };
}

function effectiveReportDates(report) {
  const dates = report.rows.map(reportRowDate).filter(Boolean).sort();
  return {
    start: report.filter.from || dates[0] || '—',
    end: report.filter.to || dates[dates.length - 1] || '—'
  };
}

app.get('/reports/expenses', async (req, res) => {
  try {
    res.json(await getExpenseReport(req.query));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Real Excel export. Unlike CSV, XLSX can contain the original payment screenshot.
// Each transaction is one row and the screenshot is embedded in the final column.
app.get('/reports/expenses.xlsx', async (req, res) => {
  try {
    const report = await getExpenseReport(req.query);
    const dates = effectiveReportDates(report);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Oak Expense System';
    workbook.created = new Date();
    workbook.modified = new Date();

    const sheet = workbook.addWorksheet('Expense Report', {
      views: [{ state: 'frozen', ySplit: 7 }],
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
    });

    // Professional Excel palette. These colors are intentionally applied here rather
    // than through a separate Excel template so the workbook remains self-contained.
    const excelColors = {
      dark: 'FF1F2937',
      dark2: 'FF111827',
      white: 'FFFFFFFF',
      muted: 'FF6B7280',
      border: 'FFD1D5DB',
      totalFill: 'FFFFF2CC',
      totalText: 'FF7A4B00',
      countFill: 'FFE5E7EB',
      wechatFill: 'FFDDF4E4',
      wechatText: 'FF176B3A',
      alipayFill: 'FFDDEBFF',
      alipayText: 'FF1456A0',
      otherFill: 'FFF3E8FF',
      otherText: 'FF6B21A8',
      amountFill: 'FFFFF9E6',
      amountText: 'FF7A4B00',
      categoryFill: 'FFEFF6FF',
      categoryText: 'FF1D4ED8',
      uncategorizedFill: 'FFFFF1F2',
      uncategorizedText: 'FFBE123C',
      pendingFill: 'FFFFE4E6',
      pendingText: 'FFB42318',
      okFill: 'FFEAF7EE',
      okText: 'FF1F7A3D'
    };

    const thinBorder = {
      top: { style: 'thin', color: { argb: excelColors.border } },
      left: { style: 'thin', color: { argb: excelColors.border } },
      bottom: { style: 'thin', color: { argb: excelColors.border } },
      right: { style: 'thin', color: { argb: excelColors.border } }
    };

    sheet.mergeCells('A1:J1');
    sheet.getCell('A1').value = 'OAK EXPENSE REPORT';
    sheet.getCell('A1').font = { bold: true, size: 19, color: { argb: excelColors.white } };
    sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: excelColors.dark2 } };
    sheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'left' };
    sheet.getRow(1).height = 30;

    sheet.mergeCells('A2:J2');
    sheet.getCell('A2').value = `${paymentLabel(report.filter.payment_method)} · Paid by: ${report.filter.paid_by}${report.filter.amount ? ` · Amount: CNY ${report.filter.amount}` : ''} · ${dates.start} → ${dates.end}`;
    sheet.getCell('A2').font = { bold: true, size: 11, color: { argb: excelColors.dark } };
    sheet.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
    sheet.getCell('A2').alignment = { vertical: 'middle', horizontal: 'left' };

    sheet.mergeCells('A3:J3');
    sheet.getCell('A3').value = `Generated: ${new Date(report.generated_at).toLocaleString('en-GB')}`;
    sheet.getCell('A3').font = { size: 9, color: { argb: excelColors.muted } };

    // Summary row. Labels and values use matching fills so totals can be spotted
    // immediately when the workbook is opened by Sandip/Vicky/Yolanda.
    sheet.getCell('A5').value = 'TOTAL SPEND';
    sheet.getCell('B5').value = Number(report.summary.total_amount || 0);
    sheet.getCell('B5').numFmt = '¥#,##0.00';
    sheet.getCell('D5').value = 'TRANSACTIONS';
    sheet.getCell('E5').value = Number(report.summary.transaction_count || 0);
    sheet.getCell('G5').value = 'WECHAT';
    sheet.getCell('H5').value = Number(report.summary.wechat_total || 0);
    sheet.getCell('H5').numFmt = '¥#,##0.00';
    sheet.getCell('I5').value = 'ALIPAY';
    sheet.getCell('J5').value = Number(report.summary.alipay_total || 0);
    sheet.getCell('J5').numFmt = '¥#,##0.00';

    const summaryBlocks = [
      { label: 'A5', value: 'B5', fill: excelColors.totalFill, text: excelColors.totalText, valueSize: 15 },
      { label: 'D5', value: 'E5', fill: excelColors.countFill, text: excelColors.dark, valueSize: 14 },
      { label: 'G5', value: 'H5', fill: excelColors.wechatFill, text: excelColors.wechatText, valueSize: 14 },
      { label: 'I5', value: 'J5', fill: excelColors.alipayFill, text: excelColors.alipayText, valueSize: 14 }
    ];

    for (const block of summaryBlocks) {
      for (const address of [block.label, block.value]) {
        const cell = sheet.getCell(address);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: block.fill } };
        cell.border = thinBorder;
        cell.alignment = { vertical: 'middle', horizontal: address === block.value ? 'right' : 'left' };
      }
      sheet.getCell(block.label).font = { bold: true, size: 9, color: { argb: block.text } };
      sheet.getCell(block.value).font = { bold: true, size: block.valueSize, color: { argb: block.text } };
    }
    sheet.getRow(5).height = 26;

    const tableRows = report.rows.map(row => [
      reportRowDate(row),
      row.paid_by || '',
      row.category || 'Uncategorized',
      row.merchant || '',
      paymentLabel(row.payment_method),
      Number(row.amount || 0),
      row.currency || 'CNY',
      row.reimbursement_required ? (row.reimbursement_status || 'pending') : 'not required',
      row.description || '',
      row.image_path ? '' : 'No screenshot'
    ]);

    if (tableRows.length) {
      const expensesTable = sheet.addTable({
        name: 'ExpensesTable',
        ref: 'A7',
        headerRow: true,
        totalsRow: true,
        style: { theme: 'TableStyleMedium2', showRowStripes: true },
        columns: [
          { name: 'Date', totalsRowLabel: `TOTAL ${dates.start} → ${dates.end}` },
          { name: 'Paid by' },
          { name: 'Category' },
          { name: 'Merchant' },
          { name: 'Payment method' },
          { name: 'Amount', totalsRowFunction: 'sum' },
          { name: 'Currency' },
          { name: 'Reimbursement' },
          { name: 'Description' },
          { name: 'Payment screenshot' }
        ],
        rows: tableRows
      });

      // Excel tables expose a filter dropdown on every header automatically.
      // Keeping the rows inside a real table means users can filter Date, Paid by,
      // Category, Merchant, Payment method, Amount, Currency, Reimbursement,
      // Description, and Screenshot independently in Excel.
      const firstDataRow = 8;
      const lastDataRow = firstDataRow + report.rows.length - 1;
      sheet.getColumn(6).numFmt = '¥#,##0.00';

      // Make the header stronger than Excel's default table theme so the report remains
      // readable when printed or opened in Numbers.
      for (let col = 1; col <= 10; col += 1) {
        const headerCell = sheet.getRow(7).getCell(col);
        headerCell.font = { bold: true, color: { argb: excelColors.white } };
        headerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: excelColors.dark } };
        headerCell.alignment = { vertical: 'middle', horizontal: col === 6 ? 'right' : 'left', wrapText: true };
        headerCell.border = thinBorder;
      }
      sheet.getRow(7).height = 24;

      for (let i = 0; i < report.rows.length; i += 1) {
        const row = report.rows[i];
        const excelRow = firstDataRow + i;
        const worksheetRow = sheet.getRow(excelRow);
        worksheetRow.alignment = { vertical: 'top', wrapText: true };

        // Important transaction values are visually emphasized without changing
        // the underlying numbers used by Excel formulas.
        const categoryCell = sheet.getCell(`C${excelRow}`);
        const categoryName = String(row.category || 'Uncategorized').trim() || 'Uncategorized';
        const isUncategorized = categoryName.toLowerCase() === 'uncategorized';
        categoryCell.font = {
          bold: true,
          color: { argb: isUncategorized ? excelColors.uncategorizedText : excelColors.categoryText }
        };
        categoryCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: isUncategorized ? excelColors.uncategorizedFill : excelColors.categoryFill }
        };

        const merchantCell = sheet.getCell(`D${excelRow}`);
        merchantCell.font = { bold: true, color: { argb: excelColors.dark } };

        const paymentCell = sheet.getCell(`E${excelRow}`);
        const method = String(row.payment_method || '').toLowerCase();
        if (method === 'wechat') {
          paymentCell.font = { bold: true, color: { argb: excelColors.wechatText } };
          paymentCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: excelColors.wechatFill } };
        } else if (method === 'alipay') {
          paymentCell.font = { bold: true, color: { argb: excelColors.alipayText } };
          paymentCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: excelColors.alipayFill } };
        } else if (method) {
          paymentCell.font = { bold: true, color: { argb: excelColors.otherText } };
          paymentCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: excelColors.otherFill } };
        }

        const amountCell = sheet.getCell(`F${excelRow}`);
        amountCell.font = { bold: true, size: 11, color: { argb: excelColors.amountText } };
        amountCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: excelColors.amountFill } };
        amountCell.alignment = { horizontal: 'right', vertical: 'top' };

        const reimbursementCell = sheet.getCell(`H${excelRow}`);
        if (row.reimbursement_required && String(row.reimbursement_status || '').toLowerCase() === 'pending') {
          reimbursementCell.font = { bold: true, color: { argb: excelColors.pendingText } };
          reimbursementCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: excelColors.pendingFill } };
        } else {
          reimbursementCell.font = { color: { argb: excelColors.okText } };
          reimbursementCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: excelColors.okFill } };
        }

        if (!row.image_path) continue;

        const safeName = path.basename(row.image_path);
        const imageFile = path.join(uploadDir, safeName);
        if (!fs.existsSync(imageFile)) {
          sheet.getCell(`J${excelRow}`).value = 'Screenshot file missing';
          continue;
        }

        const imageBuffer = fs.readFileSync(imageFile);
        const extension = detectImageExtension(imageBuffer);
        if (!extension) {
          sheet.getCell(`J${excelRow}`).value = 'Screenshot format not supported in Excel export';
          continue;
        }

        const size = fitImage(imageDimensions(imageBuffer, extension));
        worksheetRow.height = Math.max(95, Math.ceil(size.height * 0.78));
        const imageId = workbook.addImage({ buffer: imageBuffer, extension });
        sheet.addImage(imageId, {
          tl: { col: 9.12, row: excelRow - 1 + 0.08 },
          ext: { width: size.width, height: size.height },
          editAs: 'oneCell'
        });
      }

      // Keep the table total numeric and easy to maintain in Excel, while making
      // the final accounting total impossible to miss.
      const totalRow = lastDataRow + 1;
      for (let col = 1; col <= 10; col += 1) {
        const totalCell = sheet.getRow(totalRow).getCell(col);
        totalCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: excelColors.dark2 } };
        totalCell.font = { bold: true, color: { argb: excelColors.white }, size: col === 6 ? 12 : 10 };
        totalCell.border = thinBorder;
        totalCell.alignment = { vertical: 'middle', horizontal: col === 6 ? 'right' : 'left', wrapText: true };
      }
      sheet.getCell(`F${totalRow}`).numFmt = '¥#,##0.00';
      sheet.getRow(totalRow).height = 24;
    } else {
      sheet.getCell('A7').value = 'No expenses match this report.';
      sheet.getCell('A7').font = { italic: true, color: { argb: 'FF777777' } };
    }

    const widths = [13, 16, 24, 28, 18, 14, 11, 18, 32, 25];
    widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
    sheet.getColumn(6).alignment = { horizontal: 'right', vertical: 'top' };
    sheet.getColumn(9).alignment = { vertical: 'top', wrapText: true };
    sheet.getColumn(10).alignment = { vertical: 'top', horizontal: 'center', wrapText: true };

    sheet.headerFooter.oddFooter = `Oak Expense System · ${dates.start} to ${dates.end}`;

    // CATEGORY SUMMARY -------------------------------------------------------
    // A second worksheet makes the Category field useful for accounting instead
    // of being only a label on each transaction. Each row is one category with
    // count, total, average, share of total spend, and payment-method breakdown.
    const categoryMap = new Map();
    for (const row of report.rows) {
      const category = String(row.category || 'Uncategorized').trim() || 'Uncategorized';
      const amount = Number(row.amount || 0);
      const method = String(row.payment_method || '').toLowerCase();

      if (!categoryMap.has(category)) {
        categoryMap.set(category, {
          category,
          transactions: 0,
          total: 0,
          wechat: 0,
          alipay: 0,
          other: 0
        });
      }

      const bucket = categoryMap.get(category);
      bucket.transactions += 1;
      bucket.total += amount;
      if (method === 'wechat') bucket.wechat += amount;
      else if (method === 'alipay') bucket.alipay += amount;
      else bucket.other += amount;
    }

    const grandTotal = Number(report.summary.total_amount || 0);
    const categoryRows = Array.from(categoryMap.values())
      .sort((a, b) => b.total - a.total)
      .map(item => [
        item.category,
        item.transactions,
        item.total,
        item.transactions ? item.total / item.transactions : 0,
        grandTotal ? item.total / grandTotal : 0,
        item.wechat,
        item.alipay,
        item.other
      ]);

    const categorySheet = workbook.addWorksheet('Category Summary', {
      views: [{ state: 'frozen', ySplit: 5 }],
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
    });

    categorySheet.mergeCells('A1:H1');
    categorySheet.getCell('A1').value = 'CATEGORY SUMMARY';
    categorySheet.getCell('A1').font = { bold: true, size: 18, color: { argb: excelColors.white } };
    categorySheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: excelColors.dark2 } };
    categorySheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'left' };
    categorySheet.getRow(1).height = 28;

    categorySheet.mergeCells('A2:H2');
    categorySheet.getCell('A2').value = `${paymentLabel(report.filter.payment_method)} · Paid by: ${report.filter.paid_by}${report.filter.amount ? ` · Amount: CNY ${report.filter.amount}` : ''} · ${dates.start} → ${dates.end}`;
    categorySheet.getCell('A2').font = { bold: true, color: { argb: excelColors.dark } };
    categorySheet.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };

    categorySheet.getCell('A3').value = 'TOTAL SPEND';
    categorySheet.getCell('B3').value = grandTotal;
    categorySheet.getCell('B3').numFmt = '¥#,##0.00';
    categorySheet.getCell('A3').font = { bold: true, color: { argb: excelColors.totalText } };
    categorySheet.getCell('B3').font = { bold: true, size: 14, color: { argb: excelColors.totalText } };
    for (const address of ['A3', 'B3']) {
      categorySheet.getCell(address).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: excelColors.totalFill } };
      categorySheet.getCell(address).border = thinBorder;
    }

    if (categoryRows.length) {
      const categoryTable = categorySheet.addTable({
        name: 'CategorySummaryTable',
        ref: 'A5',
        headerRow: true,
        totalsRow: true,
        style: { theme: 'TableStyleMedium2', showRowStripes: true },
        columns: [
          { name: 'Category', totalsRowLabel: 'TOTAL' },
          { name: 'Transactions', totalsRowFunction: 'sum' },
          { name: 'Total spend', totalsRowFunction: 'sum' },
          { name: 'Average transaction' },
          { name: '% of total spend' },
          { name: 'WeChat' , totalsRowFunction: 'sum' },
          { name: 'Alipay', totalsRowFunction: 'sum' },
          { name: 'Other app', totalsRowFunction: 'sum' }
        ],
        rows: categoryRows
      });
      const firstCategoryRow = 6;
      const lastCategoryRow = firstCategoryRow + categoryRows.length - 1;
      const categoryTotalRow = lastCategoryRow + 1;

      for (let col = 1; col <= 8; col += 1) {
        const headerCell = categorySheet.getRow(5).getCell(col);
        headerCell.font = { bold: true, color: { argb: excelColors.white } };
        headerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: excelColors.dark } };
        headerCell.border = thinBorder;
        headerCell.alignment = { vertical: 'middle', horizontal: col === 1 ? 'left' : 'right', wrapText: true };
      }

      for (let r = firstCategoryRow; r <= lastCategoryRow; r += 1) {
        const categoryCell = categorySheet.getCell(`A${r}`);
        const categoryName = String(categoryCell.value || 'Uncategorized');
        const isUncategorized = categoryName.toLowerCase() === 'uncategorized';
        categoryCell.font = { bold: true, color: { argb: isUncategorized ? excelColors.uncategorizedText : excelColors.categoryText } };
        categoryCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isUncategorized ? excelColors.uncategorizedFill : excelColors.categoryFill } };
        categorySheet.getCell(`C${r}`).numFmt = '¥#,##0.00';
        categorySheet.getCell(`D${r}`).numFmt = '¥#,##0.00';
        categorySheet.getCell(`E${r}`).numFmt = '0.0%';
        categorySheet.getCell(`F${r}`).numFmt = '¥#,##0.00';
        categorySheet.getCell(`G${r}`).numFmt = '¥#,##0.00';
        categorySheet.getCell(`H${r}`).numFmt = '¥#,##0.00';
      }

      for (let col = 1; col <= 8; col += 1) {
        const totalCell = categorySheet.getRow(categoryTotalRow).getCell(col);
        totalCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: excelColors.dark2 } };
        totalCell.font = { bold: true, color: { argb: excelColors.white } };
        totalCell.border = thinBorder;
      }
      for (const col of ['C', 'F', 'G', 'H']) categorySheet.getCell(`${col}${categoryTotalRow}`).numFmt = '¥#,##0.00';
    } else {
      categorySheet.getCell('A5').value = 'No categories match this report.';
      categorySheet.getCell('A5').font = { italic: true, color: { argb: excelColors.muted } };
    }

    const categoryWidths = [28, 15, 18, 20, 18, 16, 16, 16];
    categoryWidths.forEach((width, index) => { categorySheet.getColumn(index + 1).width = width; });
    for (let col = 2; col <= 8; col += 1) categorySheet.getColumn(col).alignment = { horizontal: 'right', vertical: 'top' };
    categorySheet.headerFooter.oddFooter = `Oak Expense System · Category Summary · ${dates.start} to ${dates.end}`;

    // Individual evidence for combined expenses; values here are not added to totals.
    const combinedRows = report.rows.filter(row=>Array.isArray(row.ocr_raw?.combined_payments));
    if(combinedRows.length){
      const evidence=workbook.addWorksheet('Combined screenshots');
      evidence.addRow(['Expense date','Vendor','Combined total','Payment','Payment date','Amount','Screenshot','Amounts in screenshot']);
      evidence.getRow(1).font={bold:true};
      [15,28,18,12,15,16,34,36].forEach((width,i)=>{evidence.getColumn(i+1).width=width;});
      for(const row of combinedRows){
        for(const [i,part] of row.ocr_raw.combined_payments.entries()){
          const r=evidence.addRow([reportRowDate(row),row.merchant||'',Number(row.amount),i+1,part.expense_date||'',Number(part.amount),'',Array.isArray(part.amounts)?part.amounts.map(a=>'¥'+a).join(' + '):'']);
          r.getCell(3).numFmt='¥#,##0.00';r.getCell(6).numFmt='¥#,##0.00';
          const filename=path.join(uploadDir,path.basename(part.image_path||''));
          if(!part.image_path||!fs.existsSync(filename)){r.getCell(7).value='Screenshot missing';continue;}
          const bytes=fs.readFileSync(filename), ext=detectImageExtension(bytes);
          if(!ext){r.getCell(7).value='Unsupported image';continue;}
          const size=fitImage(imageDimensions(bytes,ext),200,240);
          r.height=Math.max(45,Math.ceil(size.height*0.78));
          const img=workbook.addImage({buffer:bytes,extension:ext});
          evidence.addImage(img,{tl:{col:6.1,row:r.number-1+0.06},ext:{width:size.width,height:size.height},editAs:'oneCell'});
        }
      }
    }

    const filename = `oak-expense-report-${report.filter.payment_method}-${report.filter.user_id||'all-people'}-${dates.start}-to-${dates.end}.xlsx`
      .replaceAll('—', 'all');
    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(buffer));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

app.listen(port, () => console.log(`Oak API listening on ${port}`));
