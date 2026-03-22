import { db } from '../db';
import { sql } from 'drizzle-orm';

/**
 * Simple corrupt character fix - runs multiple targeted UPDATE statements
 */
async function fixCorruptCharactersSimple() {
  console.log('[Character Fix] Starting simple corrupt character repair...');

  try {
    // Define replacement patterns
    const patterns = [
      // Accounts - exact matches
      ['? CICA (BD)', '– CICA (BD)'],
      ['?tefan?iková', 'Štefančíková'],
      ['E-NEWS? THE NEWS', 'E-NEWS– THE NEWS'],
      ['Empordef ? Tecnologias', 'Empordef – Tecnologias'],
      ['Texas Woman?s', 'Texas Woman\'s'],
      ['NAME?', 'NAME'],
      
      // Common patterns in accounts and contacts
      ['?iline', 'Žiline'],
      ['?ilins', 'Žilins'],
      ['g?n?rale', 'générale'],
      ['Simulaci?n', 'Simulación'],
      ['A.?', 'A.Ş'],
      ['in?s', 'inės'],
      ['Yollar?', 'Yolları'],
      ['fen?x', 'fênix'],
      ['amap?', 'amapá'],
      ['A?reas', 'Aéreas'],
      ['G?teborg', 'Göteborg'],
      ['G?k?en', 'Gökçen'],
      ['TEKNOLOJ?', 'TEKNOLOJİ'],
      
      // Names with multiple question marks
      ['Agn? Gaidamavi?i?t?', 'Agnė Gaidamavičiūtė'],
      ['Bo?ena S?awi?ska', 'Bożena Sławińska'],
      ['Deimant? Ra??i?t?', 'Deimantė Raščiūtė'],
      ['Egl? Vaitkevi?i?t?', 'Eglė Vaitkevičiūtė'],
      ['?imkus', 'Šimkus'],
      ['Schj?lberg', 'Schjølberg'],
      
      // Common name patterns
      ['?rfan', 'İrfan'],
      ['?BRAH?M', 'İBRAHİM'],
      ['CEM?L', 'CEMİL'],
      ['Zupan?i?', 'Zupančič'],
      ['Lind?n', 'Lindén'],
      ['An?l', 'Anıl'],
      ['Kosifo?lu', 'Kosifoğlu'],
      ['S?bastien', 'Sébastien'],
      ['Casta?o', 'Castaño'],
      ['Ji?í', 'Jiří'],
      ['Ozoli??', 'Ozoliņš'],
      ['Tu?ba', 'Tuğba'],
      ['Or?i?', 'Oršić'],
      ['Rodr?guez', 'Rodríguez'],
      ['AL?', 'ALİ'],
      ['NUR?', 'NURİ'],
      ['Supi?', 'Supić'],
      ['G?kh', 'Gökh'],
      ['Ar?k', 'Arık'],
      ['BEH?YE', 'BEHİYE'],
      ['CAH?DE', 'CAHİDE'],
      ['ÖZESER', 'ÖZESER'],
      ['DUYGU ÇEL?K', 'DUYGU ÇELİK'],
      ['EKREM ERG?N', 'EKREM ERGİN'],
      ['B?la', 'Béla'],
      
      // André variations
      ['Andr+?', 'André'],
      ['Andr?', 'André'],
      ['Beno+?t', 'Benoît'],
      ['Beno?t', 'Benoît'],
      
      // O' names
      ['O?Dell', 'O\'Dell'],
      ['O?Flynn', 'O\'Flynn'],
      ['?nestasaki', 'Anastasaki'],
      
      // More Lithuanian names
      ['Evel?na', 'Evelīna'],
      ['Indr?', 'Indrė'],
      ['Mikalopait?', 'Mikalopaitė'],
      
      // Portuguese
      ['Fran?a', 'França'],
      ['Jo?o', 'João'],
      
      // Spanish
      ['Bad?a', 'Badía'],
      ['Pi?ero', 'Piñero'],
      ['Gonz?lez', 'González'],
      ['Iv?n', 'Iván'],
      ['Guti?rrez', 'Gutiérrez'],
      
      // German
      ['K?nig', 'König'],
      ['Fran?ois', 'François'],
      
      // Turkish uppercase
      ['G?ZEM', 'GÖZEM'],
      ['LÜTF?', 'LÜTFİ'],
      ['D?NLER', 'DİNLER'],
      ['BA?ARAN', 'BAŞARAN'],
      ['GÜMÜ?', 'GÜMÜŞ'],
      ['?EN', 'ŞEN'],
      
      // Hungarian
      ['Istv?n', 'István'],
      
      // Czech/Slovak
      ['Jazbin?ek', 'Jazbinšek'],
      ['Hlavá?ek', 'Hlaváček'],
      ['Má?e', 'Máče'],
      ['Tom?i?', 'Tomčič'],
      ['Bre?i?', 'Brečić'],
      
      // Polish
      ['Ga??zewska', 'Gałęzewska'],
      ['Spycha?a', 'Spychała'],
      ['Micha?', 'Michał'],
      ['Mo?ejko', 'Możejko'],
      ['Bogus?aw', 'Bogusław'],
      
      // Norwegian
      ['Windel?v', 'Windeløv'],
      
      // More Turkish
      ['O?uz', 'Oğuz'],
      ['D³zak?n', 'Düzakın'],
      ['Sar?gül', 'Sarıgül'],
      ['S?nmaz', 'Sönmaz'],
      ['Timu?in', 'Timuçin'],
      ['SEÇK?N', 'SEÇKİN'],
      ['TOPO?RAF', 'TOPOĞRAF'],
      ['Akka?', 'Akkaş'],
      
      // More O' names
      ['O?Brien', 'O\'Brien'],
      ['Setty-O?Connor', 'Setty-O\'Connor'],
      ['Prud?homme', 'Prud\'homme'],
      
      // Czech
      ['Ond?ej', 'Ondřej'],
      
      // Icelandic
      ['P?tur', 'Pétur'],
      ['Hafli?ason', 'Hafliðason'],
      ['?lafsson', 'Ólafsson'],
      
      // More Polish
      ['Ga?azka', 'Gałazka'],
      
      // Slovenian
      ['Ko?ir', 'Košir'],
      ['Bo?njak', 'Božnjak'],
      
      // French
      ['Ren?', 'René'],
      ['Val?rie', 'Valérie'],
      
      // Spanish
      ['Sebasti?n', 'Sebastián'],
      
      // German
      ['R?fenach', 'Röfenach'],
      ['Maysenh?lder', 'Maysenhölder'],
      
      // Serbian
      ['POPOVI?', 'POPOVIĆ'],
      
      // Job titles
      ['Bak?m', 'Bakım'],
      ['Müd', 'Müd'],
    ];

    let totalFixed = 0;

    // Fix accounts table
    for (const [bad, good] of patterns) {
      const result = await db.execute(sql`
        UPDATE accounts
        SET name = REPLACE(name, ${bad}, ${good})
        WHERE name LIKE ${'%' + bad + '%'}
      `);
      if (result.rowCount && result.rowCount > 0) {
        console.log(`[Accounts] Fixed "${bad}" → "${good}": ${result.rowCount} rows`);
        totalFixed += result.rowCount;
      }
    }

    // Fix verification_contacts table
    for (const [bad, good] of patterns) {
      const result = await db.execute(sql`
        UPDATE verification_contacts
        SET 
          full_name = REPLACE(full_name, ${bad}, ${good}),
          title = REPLACE(COALESCE(title, ''), ${bad}, ${good})
        WHERE full_name LIKE ${'%' + bad + '%'} OR title LIKE ${'%' + bad + '%'}
      `);
      if (result.rowCount && result.rowCount > 0) {
        console.log(`[Verification] Fixed "${bad}" → "${good}": ${result.rowCount} rows`);
        totalFixed += result.rowCount;
      }
    }

    // Fix contacts table
    for (const [bad, good] of patterns) {
      const result = await db.execute(sql`
        UPDATE contacts
        SET 
          full_name = REPLACE(full_name, ${bad}, ${good}),
          job_title = REPLACE(COALESCE(job_title, ''), ${bad}, ${good})
        WHERE full_name LIKE ${'%' + bad + '%'} OR job_title LIKE ${'%' + bad + '%'}
      `);
      if (result.rowCount && result.rowCount > 0) {
        console.log(`[Contacts] Fixed "${bad}" → "${good}": ${result.rowCount} rows`);
        totalFixed += result.rowCount;
      }
    }

    console.log(`[Character Fix] ✅ Fixed ${totalFixed} total replacements across all tables`);
  } catch (error) {
    console.error('[Character Fix] ❌ Error:', error);
    throw error;
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  fixCorruptCharactersSimple()
    .then(() => {
      console.log('[Character Fix] Script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('[Character Fix] Script failed:', error);
      process.exit(1);
    });
}

export { fixCorruptCharactersSimple };