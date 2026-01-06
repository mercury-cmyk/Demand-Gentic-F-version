import { db } from '../db';
import { accounts, contacts, verificationContacts } from '@shared/schema';
import { sql } from 'drizzle-orm';

/**
 * Fix corrupt characters in database - Question marks that replaced special characters
 */
async function fixCorruptCharacters() {
  console.log('[Character Fix] Starting corrupt character repair...');

  try {
    // Fix accounts table
    console.log('[Character Fix] Fixing accounts table...');
    const accountsFixed = await db.execute(sql`
      UPDATE accounts
      SET name = 
        REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
        REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
        REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
        REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
        name,
        'l?A', 'l''A'),
        '?ilins', 'Žilins'),
        '?iline', 'Žiline'),
        '?eleb', 'Çeleb'),
        'A+?r', 'Aér'),
        'f?r ', 'für '),
        'tr?n', 'trên'),
        'gi? ', 'giá '),
        'd?n', 'dân'),
        'Vi?t', 'Việt'),
        'c?l?k', 'cılık'),
        'tÔm', 'tâm'),
        'c¶n', 'cơn'),
        'Savunma Havac?l?k', 'Savunma Havacılık'),
        'C¶ng', 'Công'),
        '?Azer', '"Azer'),
        'tion?', 'tion"'),
        'AFAC ?', 'AFAC –'),
        'Mar?a', 'María'),
        'SantaMar?a', 'SantaMaría'),
        'Velocità', 'Velocità'),
        'g?n?rale', 'générale'),
        'Simulaci?n', 'Simulación'),
        'A.?', 'A.Ş'),
        'in?s', 'inės'),
        'Yollar?', 'Yolları'),
        'Woman?s', 'Woman''s'),
        'fen?x', 'fênix'),
        'amap?', 'amapá'),
        'A?reas', 'Aéreas'),
        'G?teborg', 'Göteborg'),
        'G?k?en', 'Gökçen'),
        'TEKNOLOJ?', 'TEKNOLOJİ'),
        '? CICA', '– CICA'),
        'Empordef ?', 'Empordef –'),
        'Informação', 'Informação'),
        'NAME?', 'NAME')
      WHERE name LIKE '%?%' OR name LIKE '%Ô%' OR name LIKE '%¶%'
    `);

    console.log(`[Character Fix] Fixed ${accountsFixed.rowCount || 0} accounts`);

    // Fix contacts table
    console.log('[Character Fix] Fixing contacts table...');
    const contactsFixed = await db.execute(sql`
      UPDATE contacts
      SET 
        full_name = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
          full_name,
          'G?kh', 'Gökh'),
          'Ar?k', 'Arık'),
          'Payla?', 'Paylaş'),
          'Krüg', 'Krüg'),
          'Márq', 'Márq'),
          'Spén', 'Spén'),
          'García', 'García'),
        job_title = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
          COALESCE(job_title, ''),
          'Bak?m', 'Bakım'),
          'Müd', 'Müd'),
          'Türk', 'Türk'),
          'López', 'López'),
          'Muñoz', 'Muñoz'),
          'Piña', 'Piña'),
          'Téllez', 'Téllez'),
          'Touriñán', 'Touriñán'),
          'Hernández', 'Hernández')
      WHERE full_name LIKE '%?%' OR job_title LIKE '%?%'
    `);

    console.log(`[Character Fix] Fixed ${contactsFixed.rowCount || 0} contacts`);

    // Fix verification_contacts table
    console.log('[Character Fix] Fixing verification_contacts table...');
    const vContactsFixed = await db.execute(sql`
      UPDATE verification_contacts
      SET 
        full_name = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
          REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
          REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
          full_name,
          'G?kh', 'Gökh'),
          'Ar?k', 'Arık'),
          'Payla?', 'Paylaş'),
          'Krüg', 'Krüg'),
          'Márq', 'Márq'),
          'Spén', 'Spén'),
          'García', 'García'),
          '?BRAH?M', 'İBRAHİM'),
          'CEM?L', 'CEMİL'),
          'Zupan?i?', 'Zupančič'),
          '?nestasaki', 'Anastasaki'),
          'Beno+?t', 'Benoît'),
          'Lind?n', 'Lindén'),
          'An?l', 'Anıl'),
          'Kosifo?lu', 'Kosifoğlu'),
          'S?bastien', 'Sébastien'),
          'R?fenach', 'Röfenach'),
          'Casta?o', 'Castaño'),
          'Ji?í', 'Jiří'),
          'Ozoli??', 'Ozoliņš'),
          'Tu?ba', 'Tuğba'),
          'Or?i?', 'Oršić'),
          'Rodr?guez', 'Rodríguez'),
          'AL?', 'ALİ'),
          'NUR?', 'NURİ'),
          'Supi?', 'Supić'),
          '?i?', 'čič'),
          'Kinaci', 'Kınacı'),
          'Beno?t', 'Benoît'),
          'Sandrt', 'Sandra'),
        title = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
          COALESCE(title, ''),
          'Bak?m', 'Bakım'),
          'Müd', 'Müd'),
          'Türk', 'Türk'),
          'López', 'López'),
          'Muñoz', 'Muñoz'),
          'Piña', 'Piña'),
          'Téllez', 'Téllez'),
          'Touriñán', 'Touriñán'),
          'Hernández', 'Hernández')
      WHERE full_name LIKE '%?%' OR title LIKE '%?%'
    `);

    console.log(`[Character Fix] Fixed ${vContactsFixed.rowCount || 0} verification contacts`);

    console.log('[Character Fix] ✅ Character repair completed successfully');
  } catch (error) {
    console.error('[Character Fix] ❌ Error fixing corrupt characters:', error);
    throw error;
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  fixCorruptCharacters()
    .then(() => {
      console.log('[Character Fix] Script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('[Character Fix] Script failed:', error);
      process.exit(1);
    });
}

export { fixCorruptCharacters };
