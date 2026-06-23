import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'medsecure.db');
const db = new sqlite3.Database(dbPath);

// Helper to wrap sqlite3 queries in promises
export const query = {
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  },
  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },
  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
};

// Initialize schema and seed data
export async function initDb() {
  // Create tables
  await query.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      password_hash TEXT,
      role TEXT CHECK(role IN ('consumer', 'pharmacist', 'healthcare_worker', 'inspector')),
      verified INTEGER DEFAULT 0,
      license_number TEXT,
      pin_code TEXT,
      language TEXT DEFAULT 'en',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query.run(`
    CREATE TABLE IF NOT EXISTS medicines (
      id TEXT PRIMARY KEY,
      name TEXT,
      generic_name TEXT,
      manufacturer_name TEXT,
      cdsco_license TEXT,
      approved_batch_format TEXT,
      composition TEXT, -- JSON array
      expected_colors TEXT, -- JSON object
      reference_image_url TEXT,
      logo_embedding TEXT -- JSON array of floats
    )
  `);

  await query.run(`
    CREATE TABLE IF NOT EXISTS scans (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      medicine_id TEXT,
      image_url TEXT,
      authenticity_score REAL,
      verdict TEXT CHECK(verdict IN ('verified', 'caution', 'high_risk')),
      ocr_extracted TEXT, -- JSON string
      anomalies TEXT, -- JSON string
      signal_breakdown TEXT, -- JSON string
      lat REAL,
      lng REAL,
      scanned_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(medicine_id) REFERENCES medicines(id)
    )
  `);

  await query.run(`
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      medicine_id TEXT,
      batch_number TEXT,
      report_count INTEGER DEFAULT 1,
      lat REAL,
      lng REAL,
      severity TEXT CHECK(severity IN ('caution', 'high')),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      last_updated TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(medicine_id) REFERENCES medicines(id)
    )
  `);

  // Check if medicines are already seeded
  const countRow = await query.get('SELECT COUNT(*) as count FROM medicines');
  if (countRow.count === 0) {
    console.log('Seeding 500+ CDSCO-listed medicines...');
    
    const brands = [
      { name: "Crocin", generic: "Paracetamol", composition: ["Paracetamol 500mg"], colors: { primary: "#de2c2c", secondary: "#ffffff" } },
      { name: "Calpol", generic: "Paracetamol", composition: ["Paracetamol 650mg"], colors: { primary: "#10b981", secondary: "#ffffff" } },
      { name: "Combiflam", generic: "Ibuprofen & Paracetamol", composition: ["Ibuprofen 400mg", "Paracetamol 325mg"], colors: { primary: "#3b82f6", secondary: "#f59e0b" } },
      { name: "Pantocid", generic: "Pantoprazole", composition: ["Pantoprazole 400mg"], colors: { primary: "#8b5cf6", secondary: "#ffffff" } },
      { name: "Omez", generic: "Omeprazole", composition: ["Omeprazole 20mg"], colors: { primary: "#f43f5e", secondary: "#e2e8f0" } },
      { name: "Asthalin", generic: "Salbutamol", composition: ["Salbutamol 4mg"], colors: { primary: "#06b6d4", secondary: "#ffffff" } },
      { name: "Augmentin", generic: "Amoxicillin & Clavulanate Potassium", composition: ["Amoxicillin 500mg", "Clavulanate Potassium 125mg"], colors: { primary: "#2563eb", secondary: "#ffffff" } },
      { name: "Liv52", generic: "Herbal Formulation", composition: ["Himsra 65mg", "Kasani 65mg"], colors: { primary: "#16a34a", secondary: "#fef08a" } },
      { name: "Shelcal", generic: "Calcium & Vitamin D3", composition: ["Calcium 500mg", "Vitamin D3 250IU"], colors: { primary: "#ea580c", secondary: "#ffffff" } },
      { name: "Limcee", generic: "Vitamin C", composition: ["Vitamin C 500mg"], colors: { primary: "#eab308", secondary: "#ffffff" } },
      { name: "Taxim-O", generic: "Cefixime", composition: ["Cefixime 200mg"], colors: { primary: "#db2777", secondary: "#f3f4f6" } },
      { name: "Allegra", generic: "Fexofenadine", composition: ["Fexofenadine Hydrochloride 120mg"], colors: { primary: "#4f46e5", secondary: "#ffffff" } },
      { name: "Glycomet", generic: "Metformin Hydrochloride", composition: ["Metformin Hydrochloride 500mg"], colors: { primary: "#059669", secondary: "#ffffff" } },
      { name: "Zinetac", generic: "Ranitidine", composition: ["Ranitidine 150mg"], colors: { primary: "#dc2626", secondary: "#e2e8f0" } },
      { name: "Becosules", generic: "Vitamin B-Complex with Vitamin C", composition: ["Vitamin B1 10mg", "Vitamin B2 10mg", "Vitamin C 150mg"], colors: { primary: "#e11d48", secondary: "#ffffff" } },
      { name: "Arkamin", generic: "Clonidine", composition: ["Clonidine Hydrochloride 100mcg"], colors: { primary: "#0d9488", secondary: "#ffffff" } },
      { name: "Voveran", generic: "Diclofenac Sodium", composition: ["Diclofenac Sodium 50mg"], colors: { primary: "#7c3aed", secondary: "#f8fafc" } },
      { name: "Montek-LC", generic: "Montelukast & Levocetirizine", composition: ["Montelukast 10mg", "Levocetirizine 5mg"], colors: { primary: "#475569", secondary: "#38bdf8" } },
      { name: "Pan-D", generic: "Pantoprazole & Domperidone", composition: ["Pantoprazole 40mg", "Domperidone 30mg"], colors: { primary: "#2563eb", secondary: "#fca5a5" } },
      { name: "Atorva", generic: "Atorvastatin", composition: ["Atorvastatin Calcium 10mg"], colors: { primary: "#0f172a", secondary: "#10b981" } }
    ];

    const manufacturers = [
      "Cipla Ltd", "Sun Pharmaceutical Industries", "Dr. Reddy's Laboratories", 
      "GlaxoSmithKline Pharmaceuticals", "Abbott India Ltd", "Sanofi India Ltd", 
      "Alkem Laboratories Ltd", "Torrent Pharmaceuticals", "Lupin Ltd", 
      "Glenmark Pharmaceuticals", "Mankind Pharma", "Zydus Lifesciences", 
      "Intas Pharmaceuticals", "Pfizer India", "Himalaya Wellness Company"
    ];

    const formats = [
      "^BT\\d{4}$", "^GP\\d{5}$", "^[A-Z]{3}\\d{3}$", "^MC\\d{4}$", 
      "^[A-Z]{2}\\d{5}$", "^BC\\d{6}$", "^\\d{2}[A-Z]{2}\\d{2}$"
    ];

    const suffixes = ["", "100", "250", "500", "650", "Duo", "DS", "Active", "Plus", "SR", "XR", "Kid", "Fortis", "OD", "MD"];

    let count = 0;
    
    // Generate 500+ records via combinations
    for (let b = 0; b < brands.length; b++) {
      for (let m = 0; m < manufacturers.length; m++) {
        for (let s = 0; s < suffixes.length; s++) {
          if (count >= 505) break;

          const brand = brands[b];
          const mfg = manufacturers[m];
          const suffix = suffixes[s];
          
          const fullName = suffix ? `${brand.name} ${suffix}` : brand.name;
          const genericName = brand.generic;
          const format = formats[(b + m + s) % formats.length];
          const cdscoLicense = `MFG/CDSCO/${10000 + count}`;
          
          // Modify composition based on suffix if applicable
          let currentComposition = [...brand.composition];
          if (suffix && suffix.includes("500")) {
            currentComposition = currentComposition.map(c => c.replace(/\d+mg/, "500mg"));
          } else if (suffix && suffix.includes("650")) {
            currentComposition = currentComposition.map(c => c.replace(/\d+mg/, "650mg"));
          }

          const mockEmbedding = Array.from({ length: 512 }, () => Math.random().toFixed(4));

          await query.run(
            `INSERT INTO medicines (id, name, generic_name, manufacturer_name, cdsco_license, approved_batch_format, composition, expected_colors, reference_image_url, logo_embedding) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              `med-${count}`,
              fullName,
              genericName,
              mfg,
              cdscoLicense,
              format,
              JSON.stringify(currentComposition),
              JSON.stringify(brand.colors),
              `/reference/med-${count}.jpg`,
              JSON.stringify(mockEmbedding)
            ]
          );
          
          count++;
        }
      }
    }
    console.log(`Seeded ${count} medicine reference records successfully.`);
  }
}
