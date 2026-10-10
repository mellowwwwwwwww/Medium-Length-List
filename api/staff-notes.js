import { verifyToken } from './_utils.js';
import { LIST1, LIST2 } from './_config.js';
import { getStaffNotes } from './_staffNotes.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        let decoded;
        try {
            decoded = await verifyToken(req);
        } catch (e) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        if (!['mod', 'admin', 'management'].includes(decoded.role)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const listName = req.query.type === LIST2 ? LIST2 : LIST1;
        const notes = await getStaffNotes(listName);
        return res.status(200).json({ notes });
    } catch (error) {
        console.error('Staff notes error:', error);
        return res.status(500).json({ error: 'Could not load notes' });
    }
}
