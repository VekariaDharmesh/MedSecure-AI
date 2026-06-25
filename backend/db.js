import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

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
    console.log('Seeding CDSCO-listed medicines...');

    const medicines = [
      { name: "Crocin", generic: "Paracetamol", mfg: "GlaxoSmithKline Pharmaceuticals", comp: ["Paracetamol 500mg"], color: "#de2c2c", format: "^BT\\d{4}$" },
      { name: "Crocin 500", generic: "Paracetamol", mfg: "GlaxoSmithKline Pharmaceuticals", comp: ["Paracetamol 500mg"], color: "#de2c2c", format: "^BT\\d{4}$" },
      { name: "Crocin 650", generic: "Paracetamol", mfg: "GlaxoSmithKline Pharmaceuticals", comp: ["Paracetamol 650mg"], color: "#de2c2c", format: "^BT\\d{4}$" },
      { name: "Calpol", generic: "Paracetamol", mfg: "GlaxoSmithKline Pharmaceuticals", comp: ["Paracetamol 500mg"], color: "#10b981", format: "^GP\\d{5}$" },
      { name: "Calpol 650", generic: "Paracetamol", mfg: "GlaxoSmithKline Pharmaceuticals", comp: ["Paracetamol 650mg"], color: "#10b981", format: "^GP\\d{5}$" },
      { name: "Calpol 250", generic: "Paracetamol", mfg: "GlaxoSmithKline Pharmaceuticals", comp: ["Paracetamol 250mg"], color: "#10b981", format: "^GP\\d{5}$" },
      { name: "Combiflam", generic: "Ibuprofen & Paracetamol", mfg: "Sanofi India Ltd", comp: ["Ibuprofen 400mg", "Paracetamol 325mg"], color: "#3b82f6", format: "^[A-Z]{3}\\d{3}$" },
      { name: "Pantocid", generic: "Pantoprazole", mfg: "Sun Pharmaceutical Industries", comp: ["Pantoprazole 40mg"], color: "#8b5cf6", format: "^MC\\d{4}$" },
      { name: "Pantocid 40", generic: "Pantoprazole", mfg: "Sun Pharmaceutical Industries", comp: ["Pantoprazole 40mg"], color: "#8b5cf6", format: "^MC\\d{4}$" },
      { name: "Omez", generic: "Omeprazole", mfg: "Dr. Reddy's Laboratories", comp: ["Omeprazole 20mg"], color: "#f43f5e", format: "^[A-Z]{3}\\d{3}$" },
      { name: "Omez 20", generic: "Omeprazole", mfg: "Dr. Reddy's Laboratories", comp: ["Omeprazole 20mg"], color: "#f43f5e", format: "^[A-Z]{3}\\d{3}$" },
      { name: "Asthalin", generic: "Salbutamol", mfg: "Cipla Ltd", comp: ["Salbutamol 4mg"], color: "#06b6d4", format: "^[A-Z]{2}\\d{5}$" },
      { name: "Asthalin 4", generic: "Salbutamol", mfg: "Cipla Ltd", comp: ["Salbutamol 4mg"], color: "#06b6d4", format: "^[A-Z]{2}\\d{5}$" },
      { name: "Augmentin 625", generic: "Amoxicillin & Clavulanate Potassium", mfg: "GlaxoSmithKline Pharmaceuticals", comp: ["Amoxicillin 500mg", "Clavulanate Potassium 125mg"], color: "#2563eb", format: "^BC\\d{6}$" },
      { name: "Augmentin 375", generic: "Amoxicillin & Clavulanate Potassium", mfg: "GlaxoSmithKline Pharmaceuticals", comp: ["Amoxicillin 250mg", "Clavulanate Potassium 125mg"], color: "#2563eb", format: "^BC\\d{6}$" },
      { name: "Liv52", generic: "Herbal Formulation", mfg: "Himalaya Wellness Company", comp: ["Himsra 65mg", "Kasani 65mg"], color: "#16a34a", format: "^\\d{2}[A-Z]{2}\\d{2}$" },
      { name: "Shelcal", generic: "Calcium & Vitamin D3", mfg: "Torrent Pharmaceuticals", comp: ["Calcium 500mg", "Vitamin D3 250IU"], color: "#ea580c", format: "^[A-Z]{3}\\d{3}$" },
      { name: "Limcee", generic: "Vitamin C", mfg: "Abbott India Ltd", comp: ["Vitamin C 500mg"], color: "#eab308", format: "^[A-Z]{2}\\d{5}$" },
      { name: "Taxim-O", generic: "Cefixime", mfg: "Alkem Laboratories Ltd", comp: ["Cefixime 200mg"], color: "#db2777", format: "^MC\\d{4}$" },
      { name: "Allegra 120", generic: "Fexofenadine", mfg: "Sanofi India Ltd", comp: ["Fexofenadine Hydrochloride 120mg"], color: "#4f46e5", format: "^[A-Z]{3}\\d{3}$" },
      { name: "Glycomet 500", generic: "Metformin Hydrochloride", mfg: "USV Ltd", comp: ["Metformin Hydrochloride 500mg"], color: "#059669", format: "^GP\\d{5}$" },
      { name: "Glycomet 250", generic: "Metformin Hydrochloride", mfg: "USV Ltd", comp: ["Metformin Hydrochloride 250mg"], color: "#059669", format: "^GP\\d{5}$" },
      { name: "Zinetac", generic: "Ranitidine", mfg: "GlaxoSmithKline Pharmaceuticals", comp: ["Ranitidine 150mg"], color: "#dc2626", format: "^BT\\d{4}$" },
      { name: "Becosules", generic: "Vitamin B-Complex", mfg: "Pfizer India", comp: ["Vitamin B1 10mg", "Vitamin B2 10mg", "Vitamin C 150mg"], color: "#e11d48", format: "^[A-Z]{2}\\d{5}$" },
      { name: "Arkamin", generic: "Clonidine", mfg: "Torrent Pharmaceuticals", comp: ["Clonidine Hydrochloride 100mcg"], color: "#0d9488", format: "^MC\\d{4}$" },
      { name: "Voveran", generic: "Diclofenac Sodium", mfg: "Novartis India", comp: ["Diclofenac Sodium 50mg"], color: "#7c3aed", format: "^[A-Z]{3}\\d{3}$" },
      { name: "Montek-LC", generic: "Montelukast & Levocetirizine", mfg: "Sun Pharmaceutical Industries", comp: ["Montelukast 10mg", "Levocetirizine 5mg"], color: "#475569", format: "^BC\\d{6}$" },
      { name: "Pan-D", generic: "Pantoprazole & Domperidone", mfg: "Alkem Laboratories Ltd", comp: ["Pantoprazole 40mg", "Domperidone 30mg"], color: "#2563eb", format: "^[A-Z]{3}\\d{3}$" },
      { name: "Atorva", generic: "Atorvastatin", mfg: "Cipla Ltd", comp: ["Atorvastatin Calcium 10mg"], color: "#0f172a", format: "^[A-Z]{2}\\d{5}$" },
      { name: "Atorva 20", generic: "Atorvastatin", mfg: "Cipla Ltd", comp: ["Atorvastatin Calcium 20mg"], color: "#0f172a", format: "^[A-Z]{2}\\d{5}$" },
      { name: "Nexpro", generic: "Esomeprazole", mfg: "Torrent Pharmaceuticals", comp: ["Esomeprazole 40mg"], color: "#0891b2", format: "^MC\\d{4}$" },
      { name: "Nexpro 20", generic: "Esomeprazole", mfg: "Torrent Pharmaceuticals", comp: ["Esomeprazole 20mg"], color: "#0891b2", format: "^MC\\d{4}$" },
      { name: "Azithral", generic: "Azithromycin", mfg: "Alkem Laboratories Ltd", comp: ["Azithromycin 500mg"], color: "#6366f1", format: "^[A-Z]{3}\\d{3}$" },
      { name: "Dolo 650", generic: "Paracetamol", mfg: "Micro Labs Ltd", comp: ["Paracetamol 650mg"], color: "#f97316", format: "^GP\\d{5}$" },
      { name: "Zerodol", generic: "Aceclofenac", mfg: "Ipca Laboratories", comp: ["Aceclofenac 100mg"], color: "#84cc16", format: "^BT\\d{4}$" },
      { name: "Zerodol SP", generic: "Aceclofenac & Paracetamol", mfg: "Ipca Laboratories", comp: ["Aceclofenac 100mg", "Paracetamol 500mg"], color: "#84cc16", format: "^BT\\d{4}$" },
      { name: "Rantac", generic: "Ranitidine", mfg: "Zydus Cadila", comp: ["Ranitidine 150mg"], color: "#e11d48", format: "^[A-Z]{2}\\d{5}$" },
      { name: "Rantac 300", generic: "Ranitidine", mfg: "Zydus Cadila", comp: ["Ranitidine 300mg"], color: "#e11d48", format: "^[A-Z]{2}\\d{5}$" },
      { name: "Chymoral Forte", generic: "Trypsin & Chymotrypsin", mfg: "Torrent Pharmaceuticals", comp: ["Trypsin 48mg", "Chymotrypsin 10000AU"], color: "#0ea5e9", format: "^[A-Z]{3}\\d{3}$" },
      { name: "Ecosprin", generic: "Aspirin", mfg: "USV Ltd", comp: ["Aspirin 75mg"], color: "#dc2626", format: "^GP\\d{5}$" },
      { name: "Ecosprin 150", generic: "Aspirin", mfg: "USV Ltd", comp: ["Aspirin 150mg"], color: "#dc2626", format: "^GP\\d{5}$" },
      { name: "Cipcal", generic: "Calcium Carbonate", mfg: "Cipla Ltd", comp: ["Calcium Carbonate 500mg", "Vitamin D3 250IU"], color: "#f59e0b", format: "^[A-Z]{2}\\d{5}$" },
      { name: "Deriphyllin", generic: "Etofylline & Theophylline", mfg: "Zydus Cadila", comp: ["Etofylline 77mg", "Theophylline 23mg"], color: "#0891b2", format: "^MC\\d{4}$" },
      { name: "Spasmo Proxyvon", generic: "Dicyclomine & Paracetamol", mfg: "Mankind Pharma", comp: ["Dicyclomine 10mg", "Paracetamol 500mg"], color: "#8b5cf6", format: "^BT\\d{4}$" },
      { name: "Oflox", generic: "Ofloxacin", mfg: "Cipla Ltd", comp: ["Ofloxacin 200mg"], color: "#6366f1", format: "^[A-Z]{3}\\d{3}$" },
      { name: "Norflox", generic: "Norfloxacin", mfg: "Cipla Ltd", comp: ["Norfloxacin 400mg"], color: "#3b82f6", format: "^[A-Z]{3}\\d{3}$" },
      { name: "Cyclopam", generic: "Dicyclomine & Paracetamol", mfg: "Indoco Remedies", comp: ["Dicyclomine 10mg", "Paracetamol 500mg"], color: "#10b981", format: "^GP\\d{5}$" },
      { name: "Mefkind", generic: "Mefenamic Acid", mfg: "Mankind Pharma", comp: ["Mefenamic Acid 500mg"], color: "#f43f5e", format: "^[A-Z]{2}\\d{5}$" },
      { name: "Cifran", generic: "Ciprofloxacin", mfg: "Sun Pharmaceutical Industries", comp: ["Ciprofloxacin 500mg"], color: "#2563eb", format: "^BC\\d{6}$" },
      { name: "Enterogermina", generic: "Probiotic", mfg: "Sanofi India Ltd", comp: ["Bacillus Clausii 2 Billion Spores"], color: "#eab308", format: "^\\d{2}[A-Z]{2}\\d{2}$" },
      { name: "Bifilac", generic: "Probiotic", mfg: "Mankind Pharma", comp: ["Lactobacillus 60M Cells"], color: "#059669", format: "^MC\\d{4}$" },
      { name: "Zincovit", generic: "Multivitamin", mfg: "Apex Laboratories", comp: ["Zinc 10mg", "Vitamin C 50mg", "B-Complex"], color: "#f97316", format: "^[A-Z]{3}\\d{3}$" },
      { name: "Celin", generic: "Vitamin C", mfg: "GlaxoSmithKline Pharmaceuticals", comp: ["Vitamin C 500mg"], color: "#f59e0b", format: "^GP\\d{5}$" },
      { name: "Becadexamin", generic: "Multivitamin", mfg: "GlaxoSmithKline Pharmaceuticals", comp: ["Vitamin A 10000IU", "Vitamin D 800IU", "Vitamin C 150mg"], color: "#e11d48", format: "^GP\\d{5}$" },
      { name: "Folvite", generic: "Folic Acid", mfg: "Cipla Ltd", comp: ["Folic Acid 5mg"], color: "#84cc16", format: "^[A-Z]{2}\\d{5}$" },
      { name: "Neurobion", generic: "Vitamin B-Complex", mfg: "Abbott India Ltd", comp: ["Vitamin B1 100mg", "Vitamin B6 200mg", "Vitamin B12 200mcg"], color: "#0ea5e9", format: "^[A-Z]{3}\\d{3}$" },
      { name: "Gabantin", generic: "Gabapentin", mfg: "Sun Pharmaceutical Industries", comp: ["Gabapentin 300mg"], color: "#6366f1", format: "^[A-Z]{2}\\d{5}$" },
      { name: "Gabapin", generic: "Gabapentin", mfg: "Intas Pharmaceuticals", comp: ["Gabapentin 300mg"], color: "#6366f1", format: "^MC\\d{4}$" },
      { name: "Nodepress", generic: "Amitriptyline", mfg: "Intas Pharmaceuticals", comp: ["Amitriptyline 25mg"], color: "#7c3aed", format: "^MC\\d{4}$" },
      { name: "Amtas", generic: "Amlodipine", mfg: "Intas Pharmaceuticals", comp: ["Amlodipine 5mg"], color: "#0f172a", format: "^[A-Z]{3}\\d{3}$" },
      { name: "Stamlo", generic: "Amlodipine", mfg: "Dr. Reddy's Laboratories", comp: ["Amlodipine 5mg"], color: "#0891b2", format: "^[A-Z]{3}\\d{3}$" },
      { name: "Telma", generic: "Telmisartan", mfg: "Glenmark Pharmaceuticals", comp: ["Telmisartan 40mg"], color: "#dc2626", format: "^BC\\d{6}$" },
      { name: "Telma 80", generic: "Telmisartan", mfg: "Glenmark Pharmaceuticals", comp: ["Telmisartan 80mg"], color: "#dc2626", format: "^BC\\d{6}$" },
      { name: "Covance", generic: "Ramipril", mfg: "Lupin Ltd", comp: ["Ramipril 5mg"], color: "#2563eb", format: "^[A-Z]{2}\\d{5}$" },
      { name: "Cardivas", generic: "Carvedilol", mfg: "Sun Pharmaceutical Industries", comp: ["Carvedilol 6.25mg"], color: "#0d9488", format: "^MC\\d{4}$" },
      { name: "Rosuvas", generic: "Rosuvastatin", mfg: "Sun Pharmaceutical Industries", comp: ["Rosuvastatin 10mg"], color: "#db2777", format: "^[A-Z]{3}\\d{3}$" },
      { name: "Rosuvas 20", generic: "Rosuvastatin", mfg: "Sun Pharmaceutical Industries", comp: ["Rosuvastatin 20mg"], color: "#db2777", format: "^[A-Z]{3}\\d{3}$" },
      { name: "Metolar", generic: "Metoprolol", mfg: "Cipla Ltd", comp: ["Metoprolol 50mg"], color: "#475569", format: "^[A-Z]{2}\\d{5}$" },
      { name: "Betacap", generic: "Propranolol", mfg: "Cipla Ltd", comp: ["Propranolol 40mg"], color: "#6366f1", format: "^[A-Z]{2}\\d{5}$" },
      { name: "Lasix", generic: "Furosemide", mfg: "Sanofi India Ltd", comp: ["Furosemide 40mg"], color: "#f59e0b", format: "^BT\\d{4}$" },
      { name: "Duolin", generic: "Levosalbutamol & Ipratropium", mfg: "Cipla Ltd", comp: ["Levosalbutamol 50mcg", "Ipratropium 20mcg"], color: "#06b6d4", format: "^[A-Z]{2}\\d{5}$" },
      { name: "Foracort", generic: "Budesonide & Formoterol", mfg: "Cipla Ltd", comp: ["Budesonide 200mcg", "Formoterol 6mcg"], color: "#16a34a", format: "^[A-Z]{2}\\d{5}$" },
      { name: "Seroflo", generic: "Fluticasone & Salmeterol", mfg: "Cipla Ltd", comp: ["Fluticasone 250mcg", "Salmeterol 50mcg"], color: "#0f172a", format: "^[A-Z]{2}\\d{5}$" },
      { name: "Montair", generic: "Montelukast", mfg: "Cipla Ltd", comp: ["Montelukast 10mg"], color: "#38bdf8", format: "^[A-Z]{2}\\d{5}$" },
      { name: "Cetrizine", generic: "Cetirizine", mfg: "Cipla Ltd", comp: ["Cetirizine 10mg"], color: "#06b6d4", format: "^[A-Z]{2}\\d{5}$" },
      { name: "Xyzal", generic: "Levocetirizine", mfg: "Dr. Reddy's Laboratories", comp: ["Levocetirizine 5mg"], color: "#8b5cf6", format: "^[A-Z]{3}\\d{3}$" },
      { name: "Claritin", generic: "Loratadine", mfg: "Bayer Pharmaceuticals", comp: ["Loratadine 10mg"], color: "#2563eb", format: "^BC\\d{6}$" },
      { name: "Avil", generic: "Pheniramine", mfg: "Sanofi India Ltd", comp: ["Pheniramine 25mg"], color: "#f43f5e", format: "^BT\\d{4}$" },
      { name: "Domstal", generic: "Domperidone", mfg: "Torrent Pharmaceuticals", comp: ["Domperidone 10mg"], color: "#ea580c", format: "^MC\\d{4}$" },
      { name: "Emeset", generic: "Ondansetron", mfg: "Cipla Ltd", comp: ["Ondansetron 4mg"], color: "#16a34a", format: "^[A-Z]{2}\\d{5}$" },
      { name: "Emeset 8", generic: "Ondansetron", mfg: "Cipla Ltd", comp: ["Ondansetron 8mg"], color: "#16a34a", format: "^[A-Z]{2}\\d{5}$" },
      { name: "Rabez", generic: "Rabeprazole", mfg: "Dr. Reddy's Laboratories", comp: ["Rabeprazole 20mg"], color: "#0d9488", format: "^[A-Z]{3}\\d{3}$" },
      { name: "Rabekind", generic: "Rabeprazole", mfg: "Mankind Pharma", comp: ["Rabeprazole 20mg"], color: "#14b8a6", format: "^BT\\d{4}$" },
      { name: "Sucral", generic: "Sucralfate", mfg: "Sun Pharmaceutical Industries", comp: ["Sucralfate 1gm"], color: "#f59e0b", format: "^[A-Z]{3}\\d{3}$" },
      { name: "Cremaffin", generic: "Liquid Paraffin & Milk of Magnesia", mfg: "Abbott India Ltd", comp: ["Liquid Paraffin 1.25ml", "Milk of Magnesia 3.75ml"], color: "#84cc16", format: "^GP\\d{5}$" },
      { name: "Duphalac", generic: "Lactulose", mfg: "Abbott India Ltd", comp: ["Lactulose 10gm"], color: "#eab308", format: "^GP\\d{5}$" },
      { name: "Prelief", generic: "Lactulose", mfg: "Mankind Pharma", comp: ["Lactulose 10gm"], color: "#f97316", format: "^BT\\d{4}$" },
      { name: "Rasaglin", generic: "Rasagiline", mfg: "Lupin Ltd", comp: ["Rasagiline 1mg"], color: "#6366f1", format: "^[A-Z]{2}\\d{5}$" },
      { name: "Tryptomer", generic: "Amitriptyline", mfg: "Torrent Pharmaceuticals", comp: ["Amitriptyline 25mg"], color: "#7c3aed", format: "^MC\\d{4}$" },
      { name: "Nexito", generic: "Escitalopram", mfg: "Torrent Pharmaceuticals", comp: ["Escitalopram 10mg"], color: "#0ea5e9", format: "^MC\\d{4}$" },
      { name: "Pexep", generic: "Paroxetine", mfg: "Sun Pharmaceutical Industries", comp: ["Paroxetine 12.5mg"], color: "#6366f1", format: "^[A-Z]{3}\\d{3}$" },
      { name: "Daxid", generic: "Imipramine", mfg: "Cipla Ltd", comp: ["Imipramine 25mg"], color: "#db2777", format: "^[A-Z]{2}\\d{5}$" },
      { name: "Lorazepam", generic: "Lorazepam", mfg: "Cipla Ltd", comp: ["Lorazepam 2mg"], color: "#475569", format: "^[A-Z]{2}\\d{5}$" },
      { name: "Niamo", generic: "Azathioprine", mfg: "Glenmark Pharmaceuticals", comp: ["Azathioprine 50mg"], color: "#dc2626", format: "^BC\\d{6}$" },
      { name: "Pregaba", generic: "Pregabalin", mfg: "Sun Pharmaceutical Industries", comp: ["Pregabalin 75mg"], color: "#8b5cf6", format: "^[A-Z]{3}\\d{3}$" },
      { name: "Meftal", generic: "Mefenamic Acid", mfg: "Blue Cross Laboratories", comp: ["Mefenamic Acid 500mg"], color: "#f43f5e", format: "^\\d{2}[A-Z]{2}\\d{2}$" },
      { name: "Podowart", generic: "Podophyllotoxin", mfg: "Cipla Ltd", comp: ["Podophyllotoxin 0.5%"], color: "#475569", format: "^[A-Z]{2}\\d{5}$" },
      { name: "Betnovate", generic: "Betamethasone", mfg: "GlaxoSmithKline Pharmaceuticals", comp: ["Betamethasone 0.1%"], color: "#2563eb", format: "^GP\\d{5}$" },
      { name: "Fungicip", generic: "Clotrimazole", mfg: "Cipla Ltd", comp: ["Clotrimazole 1%"], color: "#ea580c", format: "^[A-Z]{2}\\d{5}$" },
      { name: "Ketoderm", generic: "Ketoconazole", mfg: "Cipla Ltd", comp: ["Ketoconazole 2%"], color: "#f59e0b", format: "^[A-Z]{2}\\d{5}$" },
      { name: "Scalpe", generic: "Ketoconazole", mfg: "Cipla Ltd", comp: ["Ketoconazole 2%"], color: "#f97316", format: "^[A-Z]{2}\\d{5}$" },
      { name: "Candid", generic: "Clotrimazole", mfg: "Glenmark Pharmaceuticals", comp: ["Clotrimazole 1%"], color: "#3b82f6", format: "^BC\\d{6}$" },
      { name: "Odomos", generic: "Mosquito Repellent", mfg: "Himalaya Wellness Company", comp: ["Citronella 12%", "Diethyltoluamide 12%"], color: "#16a34a", format: "^\\d{2}[A-Z]{2}\\d{2}$" },
      { name: "Septilin", generic: "Immunomodulator", mfg: "Himalaya Wellness Company", comp: ["Guduchi 100mg", "Mulethi 100mg"], color: "#059669", format: "^\\d{2}[A-Z]{2}\\d{2}$" },
      { name: "Cystone", generic: "Herbal Formulation", mfg: "Himalaya Wellness Company", comp: ["Pashanbhed 130mg", "Varuna 65mg"], color: "#16a34a", format: "^\\d{2}[A-Z]{2}\\d{2}$" },
      { name: "Rumalaya", generic: "Herbal Formulation", mfg: "Himalaya Wellness Company", comp: ["Guggul 100mg", "Nirgundi 100mg"], color: "#16a34a", format: "^\\d{2}[A-Z]{2}\\d{2}$" },
      { name: "Tentex", generic: "Herbal Formulation", mfg: "Himalaya Wellness Company", comp: ["Mushali 100mg", "Jowakhar 100mg"], color: "#ea580c", format: "^\\d{2}[A-Z]{2}\\d{2}$" },
    ];

    for (let i = 0; i < medicines.length; i++) {
      const m = medicines[i];
      await query.run(
        `INSERT INTO medicines (id, name, generic_name, manufacturer_name, cdsco_license, approved_batch_format, composition, expected_colors, reference_image_url, logo_embedding) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          `med-${i}`,
          m.name,
          m.generic,
          m.mfg,
          `MFG/CDSCO/${10000 + i}`,
          m.format,
          JSON.stringify(m.comp),
          JSON.stringify({ primary: m.color, secondary: "#ffffff" }),
          `/reference/med-${i}.jpg`,
          JSON.stringify([])
        ]
      );
    }
    console.log(`Seeded ${medicines.length} CDSCO reference records successfully.`);
  }

  // Seed default user
  const userCount = await query.get('SELECT COUNT(*) as count FROM users');
  if (userCount.count === 0) {
    console.log('Seeding default CDSCO Inspector user...');
    const defaultEmail = 'inspector@medsecure.gov.in';
    const hash = bcrypt.hashSync('secure-inspector-password', 10);
    await query.run(
      'INSERT INTO users (id, email, password_hash, role, verified, license_number, pin_code) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['usr-inspector-default', defaultEmail, hash, 'inspector', 1, 'CDSCO-INSP-2026-9081', '110001']
    );
  }

  // Seed alerts
  const alertCount = await query.get('SELECT COUNT(*) as count FROM alerts');
  if (alertCount.count === 0) {
    console.log('Seeding regional counterfeit alerts...');
    const alerts = [
      { id: 'alt-1', medicine_id: 'med-2', batch_number: 'INVALID-999-BATCH', report_count: 14, lat: 23.0225, lng: 72.5714, severity: 'high', last_updated: '2026-06-25T12:00:00Z' },
      { id: 'alt-2', medicine_id: 'med-10', batch_number: 'MC8872', report_count: 4, lat: 21.1702, lng: 72.8311, severity: 'caution', last_updated: '2026-06-25T10:15:00Z' },
      { id: 'alt-3', medicine_id: 'med-4', batch_number: 'GP43210', report_count: 8, lat: 22.3072, lng: 73.1812, severity: 'high', last_updated: '2026-06-25T09:45:00Z' },
      { id: 'alt-4', medicine_id: 'med-14', batch_number: 'BT3091', report_count: 2, lat: 19.0760, lng: 72.8777, severity: 'caution', last_updated: '2026-06-24T18:30:00Z' },
      { id: 'alt-5', medicine_id: 'med-18', batch_number: 'MC2290', report_count: 5, lat: 28.6139, lng: 77.2090, severity: 'high', last_updated: '2026-06-25T14:20:00Z' }
    ];

    for (const a of alerts) {
      await query.run(
        'INSERT INTO alerts (id, medicine_id, batch_number, report_count, lat, lng, severity, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [a.id, a.medicine_id, a.batch_number, a.report_count, a.lat, a.lng, a.severity, a.last_updated]
      );
    }
  }

  // Seed scans
  const scanCount = await query.get('SELECT COUNT(*) as count FROM scans');
  if (scanCount.count === 0) {
    console.log('Seeding scan history...');
    const scans = [
      { id: 'scan-1', user_id: 'usr-inspector-default', medicine_id: 'med-3', image_url: '/uploads/calpol_genuine.jpg', score: 98.7, verdict: 'verified', ocr: { name: 'Calpol 500', batch_number: 'GP43210', expiry_date: '08-2027', mfg_date: '08-2024' }, anomalies: [], breakdown: { ocr: 99, visual: 98, batch: 100, barcode: 96, community: 100 }, lat: 28.6139, lng: 77.2090, scanned_at: '2026-06-25T12:00:00Z' },
      { id: 'scan-2', user_id: 'usr-inspector-default', medicine_id: 'med-2', image_url: '/uploads/crocin_counterfeit.jpg', score: 41.5, verdict: 'high_risk', ocr: { name: 'Crocin 650', batch_number: 'INVALID-999-BATCH', expiry_date: '12-2028', mfg_date: '12-2025' }, anomalies: ["Batch number format mismatch: 'INVALID-999-BATCH' violates manufacturer schema '^BT\\d{4}$'"], breakdown: { ocr: 92, visual: 90, batch: 0, barcode: 0, community: 100 }, lat: 23.0225, lng: 72.5714, scanned_at: '2026-06-25T11:30:00Z' },
      { id: 'scan-3', user_id: 'usr-inspector-default', medicine_id: 'med-10', image_url: '/uploads/omez_counterfeit.jpg', score: 72.4, verdict: 'caution', ocr: { name: 'Omez 20', batch_number: 'MC8872', expiry_date: '12-2028', mfg_date: '12-2024' }, anomalies: ["Packaging color profile variance check: Hue mismatch of 18% from CDSCO reference hex color."], breakdown: { ocr: 95, visual: 60, batch: 100, barcode: 85, community: 80 }, lat: 21.1702, lng: 72.8311, scanned_at: '2026-06-24T10:15:00Z' },
      { id: 'scan-4', user_id: 'usr-inspector-default', medicine_id: 'med-8', image_url: '/uploads/pantocid_genuine.jpg', score: 96.2, verdict: 'verified', ocr: { name: 'Pantocid 40', batch_number: 'MC2290', expiry_date: '04-2027', mfg_date: '04-2024' }, anomalies: [], breakdown: { ocr: 98, visual: 95, batch: 95, barcode: 97, community: 100 }, lat: 28.6139, lng: 77.2090, scanned_at: '2026-06-24T09:45:00Z' },
      { id: 'scan-5', user_id: 'usr-inspector-default', medicine_id: 'med-12', image_url: '/uploads/asthalin_genuine.jpg', score: 99.1, verdict: 'verified', ocr: { name: 'Asthalin 4', batch_number: 'AS1029', expiry_date: '10-2027', mfg_date: '10-2024' }, anomalies: [], breakdown: { ocr: 99, visual: 99, batch: 100, barcode: 98, community: 100 }, lat: 19.0760, lng: 72.8777, scanned_at: '2026-06-23T18:30:00Z' },
      { id: 'scan-6', user_id: 'usr-inspector-default', medicine_id: 'med-33', image_url: '/uploads/dolo_genuine.jpg', score: 97.4, verdict: 'verified', ocr: { name: 'Dolo 650', batch_number: 'GP99210', expiry_date: '05-2027', mfg_date: '05-2024' }, anomalies: [], breakdown: { ocr: 98, visual: 96, batch: 98, barcode: 95, community: 100 }, lat: 12.9716, lng: 77.5946, scanned_at: '2026-06-23T15:20:00Z' },
      { id: 'scan-7', user_id: 'usr-inspector-default', medicine_id: 'med-17', image_url: '/uploads/limcee_genuine.jpg', score: 95.8, verdict: 'verified', ocr: { name: 'Limcee', batch_number: 'LM3091', expiry_date: '11-2027', mfg_date: '11-2024' }, anomalies: [], breakdown: { ocr: 96, visual: 95, batch: 96, barcode: 96, community: 100 }, lat: 28.6139, lng: 77.2090, scanned_at: '2026-06-22T14:10:00Z' },
      { id: 'scan-8', user_id: 'usr-inspector-default', medicine_id: 'med-2', image_url: '/uploads/crocin_counterfeit.jpg', score: 32.1, verdict: 'high_risk', ocr: { name: 'Crocin 650', batch_number: 'BT3091', expiry_date: '12-2028', mfg_date: '12-2025' }, anomalies: ["Duplicate batch serial scan detected"], breakdown: { ocr: 92, visual: 85, batch: 0, barcode: 0, community: 100 }, lat: 22.3072, lng: 73.1812, scanned_at: '2026-06-22T11:05:00Z' }
    ];

    for (const s of scans) {
      await query.run(
        `INSERT INTO scans (id, user_id, medicine_id, image_url, authenticity_score, verdict, ocr_extracted, anomalies, signal_breakdown, lat, lng, scanned_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [s.id, s.user_id, s.medicine_id, s.image_url, s.score, s.verdict, JSON.stringify(s.ocr), JSON.stringify(s.anomalies), JSON.stringify(s.breakdown), s.lat, s.lng, s.scanned_at]
      );
    }
  }
}

