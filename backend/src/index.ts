import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import puppeteer from 'puppeteer';

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());

// Setup multer untuk upload file
const upload = multer({ dest: 'uploads/' });

app.post('/upload', upload.single('collection'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const filePath = req.file.path;
  fs.readFile(filePath, 'utf8', async (err, data) => {
    if (err) {
      fs.unlinkSync(filePath);
      return res.status(500).json({ error: 'Failed to read uploaded file' });
    }
    // Ambil logo dan judul custom dari req.body
    const logoBase64 = req.body.logo || null;
    const customTitle = req.body.customTitle || null;
    try {
      const collection = JSON.parse(data);
      if (!collection.info || !collection.item) {
        fs.unlinkSync(filePath);
        return res.status(400).json({ error: 'Invalid Postman collection format' });
      }
      function extractItems(items: any[]): any[] {
        return items.map((item) => {
          if (item.request) {
            return {
              name: item.name,
              description: item.request.description || '',
              method: item.request.method,
              url: typeof item.request.url === 'string' ? item.request.url : (item.request.url.raw || ''),
              headers: item.request.header || [],
              body: item.request.body || null,
              response: item.response || [],
            };
          } else if (item.item) {
            return {
              name: item.name,
              description: item.description || '',
              items: extractItems(item.item),
            };
          }
          return null;
        }).filter(Boolean);
      }
      const extracted = {
        info: collection.info,
        apis: extractItems(collection.item),
      };
      // Fungsi untuk menampilkan data dummy jika value terlalu panjang atau key mengandung file_url
      function truncateValue(key: string, value: any): any {
        if (typeof value === 'string' && (key.toLowerCase().includes('file_url') || value.length > 100)) {
          if (key.toLowerCase().includes('file_url')) {
            return 'data:application/pdf;base64,...';
          }
          return '[truncated]';
        }
        return value;
      }
      function maskSensitive(key: string, value: any): any {
        const k = key.toLowerCase();
        if (k === 'authorization' && typeof value === 'string' && value.trim().toLowerCase().startsWith('bearer ')) {
          return 'Bearer {{access_token}}';
        }
        if (k.includes('authorization') || k.includes('token')) {
          return '{{token_access}}';
        }
        if (k.includes('apikey') || k === 'key' || k.includes('api_key')) {
          return '{{api_key}}';
        }
        if (typeof value === 'string' && value.length > 60) {
          return '[truncated]';
        }
        return value;
      }
      function cleanDescription(desc: string): string {
        if (!desc) return '';
        // Hilangkan baris yang mengandung kata kunci cURL, header, dsb di manapun posisinya
        const keywords = ['generated from curl', '--header', '--data-raw', 'curl '];
        return desc
          .split(/\r?\n/)
          .filter(line => {
            const l = line.toLowerCase();
            return !keywords.some(keyword => l.includes(keyword));
          })
          .join('\n');
      }
      function renderItems(items: any[]): string {
        return items.map((item) => {
          if (item.method) {
            // Headers as table
            const headersHtml = (item.headers && item.headers.length > 0)
              ? `<table style='width:100%;border-collapse:collapse;background:#f9fafb;'>
                  <thead>
                    <tr>
                      <th style='text-align:left;padding:6px 8px;border-bottom:1px solid #e5e7eb;'>Key</th>
                      <th style='text-align:left;padding:6px 8px;border-bottom:1px solid #e5e7eb;'>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${item.headers.filter((h: any) => !h.disabled).map((h: any) => `<tr><td style='padding:6px 8px;border-bottom:1px solid #e5e7eb;'>${h.key}</td><td style='padding:6px 8px;border-bottom:1px solid #e5e7eb;'>${maskSensitive(h.key, h.value)}</td></tr>`).join('')}
                  </tbody>
                </table>`
              : `<p style='margin:0;font-style:italic;color:#6b7280;'>No headers provided.</p>`;

            // Request Body
            let requestBodyHtml = `<p style='margin:0;font-style:italic;color:#6b7280;'>No request body provided.</p>`;
            if (item.body) {
              if (item.body.mode === 'raw' && item.body.raw) {
                try {
                  const json = JSON.parse(item.body.raw);
                  requestBodyHtml = `<pre style='margin:0;background:#f3f4f6;padding:12px;border-radius:6px;white-space:pre-wrap;word-break:break-all;font-family:monospace;'>${JSON.stringify(json, (k, v) => maskSensitive(k, truncateValue(k, v)), 2)}</pre>`;
                } catch (e) {
                  requestBodyHtml = `<pre style='margin:0;background:#f3f4f6;padding:12px;border-radius:6px;white-space:pre-wrap;word-break:break-all;font-family:monospace;'>${truncateValue('raw', item.body.raw)}</pre>`;
                }
              } else if (item.body.mode === 'formdata' && item.body.formdata) {
                requestBodyHtml = `<table style='width:100%;border-collapse:collapse;background:#f9fafb;'>
                  <thead>
                    <tr>
                      <th style='text-align:left;padding:6px 8px;border-bottom:1px solid #e5e7eb;'>Key</th>
                      <th style='text-align:left;padding:6px 8px;border-bottom:1px solid #e5e7eb;'>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${item.body.formdata.map((field: any) => `<tr><td style='padding:6px 8px;border-bottom:1px solid #e5e7eb;'>${field.key}</td><td style='padding:6px 8px;border-bottom:1px solid #e5e7eb;'>${field.value}</td></tr>`).join('')}
                  </tbody>
                </table>`;
              }
            }
            // Response
            let responseHtml = `<p style='margin:0;font-style:italic;color:#6b7280;'>No example response provided.</p>`;
            if (item.response && item.response.length > 0 && item.response[0].body) {
              try {
                const json = JSON.parse(item.response[0].body);
                responseHtml = `<pre style='margin:0;background:#f3f4f6;padding:12px;border-radius:6px;white-space:pre-wrap;word-break:break-all;font-family:monospace;'>${JSON.stringify(json, (k, v) => maskSensitive(k, truncateValue(k, v)), 2)}</pre>`;
              } catch (e) {
                responseHtml = `<pre style='margin:0;background:#f3f4f6;padding:12px;border-radius:6px;white-space:pre-wrap;word-break:break-all;font-family:monospace;'>${truncateValue('body', item.response[0].body)}</pre>`;
              }
            }
            return `
              <div style='margin-bottom:48px;padding:28px 24px 24px 24px;border:1.5px solid #cbd5e1;border-radius:12px;background:#fff;box-shadow:0 2px 8px #0001;'>
                <h3 id="${makeAnchorId(item.name)}" style='font-size:1.3rem;font-weight:700;margin-top:0;margin-bottom:12px;color:#2563eb;'>${item.name}</h3>
                ${item.description ? `<p style='color:#4b5563;margin-bottom:16px;'>${cleanDescription(item.description)}</p>` : ''}
                <div style='margin-bottom:18px;'>
                  <span style='background:#dcfce7;color:#166534;padding:4px 12px;border-radius:9999px;font-size:1rem;font-weight:600;letter-spacing:0.5px;'>${item.method}</span>
                  <code style='background:#f3f4f6;padding:4px 12px;border-radius:6px;font-size:1rem;margin-left:12px;word-break:break-all;'>${item.url}</code>
                </div>
                <div style='margin-bottom:18px;'>
                  <h4 style='font-size:1.08rem;font-weight:700;margin:0 0 8px 0;color:#0f172a;'>Headers</h4>
                  ${headersHtml}
                </div>
                <div style='margin-bottom:18px;'>
                  <h4 style='font-size:1.08rem;font-weight:700;margin:0 0 8px 0;color:#0f172a;'>Request Body</h4>
                  ${requestBodyHtml}
                </div>
                <div style='margin-bottom:0;'>
                  <h4 style='font-size:1.08rem;font-weight:700;margin:0 0 8px 0;color:#0f172a;'>Example Response</h4>
                  ${responseHtml}
                </div>
              </div>
            `;
          } else if (item.items) {
            return `
              <div style='margin-bottom:32px;'>
                <h2 style='font-size:1.5rem;font-weight:700;margin-bottom:12px;border-bottom:2px solid #e5e7eb;padding-bottom:8px;'>${item.name}</h2>
                ${item.description ? `<p style='color:#4b5563;margin-bottom:16px;'>${cleanDescription(item.description)}</p>` : ''}
                ${renderItems(item.items)}
              </div>
            `;
          }
          return '';
        }).join('');
      }
      // Tambahkan fungsi untuk membuat anchor id dari judul endpoint
      function makeAnchorId(name: string) {
        return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      }
      // Sebelum renderItems, buat daftar isi:
      function renderTOC(items: any[], level = 0): string {
        return `<ul style='margin-bottom:${level === 0 ? 40 : 12}px; margin-left:${level * 24}px; padding-left:0;'>${items.map(item => {
          if (item.method) {
            return `<li style='margin-bottom:4px;list-style-type:disc;font-size:1rem;'><a href='#${makeAnchorId(item.name)}' style='color:#2563eb;text-decoration:none;font-size:0.98rem;'>${item.name}</a></li>`;
          } else if (item.items) {
            return `<li style='margin-bottom:18px;list-style-type:none;'><span style='font-weight:700;font-size:1.08rem;'>${item.name}</span>${renderTOC(item.items, level + 1)}</li>`;
          }
          return '';
        }).join('')}</ul>`;
      }
      // Pada renderCover, gunakan logoBase64 dan customTitle jika ada
      function renderCover(info: any): string {
        const logoUrl = logoBase64 || 'https://pijarmahir.id/static/media/logo-pijar.2b5e3e2b.png';
        const title = customTitle || 'API Documentation';
        return `
          <div style='height:90vh;display:flex;flex-direction:column;align-items:center;justify-content:center;'>
            <img src='${logoUrl}' alt='Logo' style='max-width:300px;max-height:180px;margin-bottom:40px;' />
            <h1 style='font-size:2.8rem;font-weight:700;font-family:serif;margin-bottom:24px;color:#1e293b;'>${title}</h1>
            <h2 style='font-size:2rem;font-style:italic;font-family:serif;color:#334155;margin-bottom:0;'>${info.name || ''}</h2>
            ${info.description ? `<div style='margin-top:24px;font-size:1.2rem;color:#64748b;text-align:center;max-width:600px;'>${info.description}</div>` : ''}
          </div>
          <div style='page-break-after:always;'></div>
        `;
      }
      // Pada html, urutannya:
      // 1. renderCover
      // 2. renderTOC + page break
      // 3. renderItems
      const html = `
        <html>
        <head>
          <meta charset='utf-8'/>
          <title>${extracted.info.name} - API Documentation</title>
          <style>
            @page { margin: 2.5cm; }
            body { font-family: 'Segoe UI', Arial, sans-serif; background: #fff; color: #111827; margin: 0; padding: 0; }
            .container { max-width: 800px; margin: 0 auto; padding: 0 24px; background: #fff; }
            h1 { font-size: 2rem; font-weight: 700; margin-bottom: 8px; }
            h2 { font-size: 1.5rem; font-weight: 700; margin-bottom: 12px; }
            h3 { font-size: 1.25rem; font-weight: 600; margin-bottom: 8px; }
            pre, code { font-family: 'Fira Mono', 'Consolas', monospace; }
            ul { list-style-type: none; padding-left: 0; margin: 0; }
          </style>
        </head>
        <body>
          <div class='container'>
            ${renderCover(extracted.info)}
            ${renderTOC(extracted.apis)}
            <div style='page-break-after:always;'></div>
            ${renderItems(extracted.apis)}
          </div>
        </body>
        </html>
      `;
      // Konversi HTML ke PDF dengan Puppeteer
      const pdfFilename = `documentation_${Date.now()}.pdf`;
      const pdfPath = path.join('uploads', pdfFilename);
      try {
        const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        await page.pdf({ path: pdfPath, format: 'A4', printBackground: true });
        await browser.close();
        fs.unlinkSync(filePath); // Hapus file upload asli
        // Kirim link unduh PDF
        const downloadUrl = `/download/${pdfFilename}`;
        res.json({ message: 'PDF generated', downloadUrl });
      } catch (err) {
        fs.unlinkSync(filePath);
        return res.status(500).json({ error: 'Failed to generate PDF' });
      }
    } catch (e) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: 'Invalid JSON file' });
    }
  });
});

// Endpoint untuk download PDF
app.get('/download/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, '../uploads', filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.download(filePath, filename);
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
}); 