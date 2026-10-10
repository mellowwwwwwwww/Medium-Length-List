import { query } from './_db.js';

// Private staff-only notes ("List Placement"), kept in their own table so the public
// levels API can never return them. Only /api/staff-notes (login required) reads them.
let tableReady = false;

export async function ensureStaffNotesTable() {
    if (tableReady) return;
    await query(`
        CREATE TABLE IF NOT EXISTS public.level_staff_notes (
            list_type TEXT NOT NULL,
            level_id INTEGER NOT NULL,
            note TEXT NOT NULL DEFAULT '',
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            PRIMARY KEY (list_type, level_id)
        )
    `);
    // Block Supabase's public REST API from reading this table (the site itself connects directly).
    await query(`ALTER TABLE public.level_staff_notes ENABLE ROW LEVEL SECURITY`);
    tableReady = true;
}

export async function saveStaffNote(listType, levelId, note) {
    await ensureStaffNotesTable();
    const text = String(note ?? '').trim().slice(0, 2000);
    if (!text) {
        await query(`DELETE FROM public.level_staff_notes WHERE list_type = $1 AND level_id = $2`, [listType, levelId]);
        return;
    }
    await query(
        `INSERT INTO public.level_staff_notes (list_type, level_id, note, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (list_type, level_id) DO UPDATE SET note = EXCLUDED.note, updated_at = NOW()`,
        [listType, levelId, text]
    );
}

export async function deleteStaffNote(listType, levelId) {
    await ensureStaffNotesTable();
    await query(`DELETE FROM public.level_staff_notes WHERE list_type = $1 AND level_id = $2`, [listType, levelId]);
}

export async function getStaffNotes(listType) {
    await ensureStaffNotesTable();
    const result = await query(`SELECT level_id, note FROM public.level_staff_notes WHERE list_type = $1`, [listType]);
    const notes = {};
    for (const row of result.rows) notes[row.level_id] = row.note;
    return notes;
}
