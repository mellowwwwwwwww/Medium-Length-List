import jwt from 'jsonwebtoken';
import { query } from './_db.js';
import { LIST1, LIST2 } from './_config.js';

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const DISCORD_UPDATE_WEBHOOK_URL = process.env.DISCORD_UPDATE_WEBHOOK_URL;
const DISCORD_UPDATE_WEBHOOK_URL_2 = process.env.DISCORD_UPDATE_WEBHOOK_URL_2;
const DISCORD_COMPLETION_WEBHOOK_URL = process.env.DISCORD_COMPLETION_WEBHOOK_URL;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;   // optional: lets the records bot turn usernames into pings
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID;     // optional: your Discord server's ID

function buildChangesDiff(oldData, newData) {
    let diffs = [];
    const oldObj = oldData || {};
    const newObj = newData || {};
    const keys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

    for (const key of keys) {
        if (key === 'records' || key === 'updated_at' || key === '_id') continue;

        const oldVal = oldObj[key];
        const newVal = newObj[key];

        if (JSON.stringify(oldVal) === JSON.stringify(newVal)) continue;

        const oldStr = typeof oldVal === 'object' ? JSON.stringify(oldVal) : String(oldVal);
        const newStr = typeof newVal === 'object' ? JSON.stringify(newVal) : String(newVal);

        const isOldEmpty = oldVal === undefined || oldVal === null || oldVal === '';
        const isNewEmpty = newVal === undefined || newVal === null || newVal === '';

        if (isOldEmpty && !isNewEmpty) {
            diffs.push(`Added "${newStr}" to **${key}**`);
        } else if (!isOldEmpty && isNewEmpty) {
            diffs.push(`Removed "${oldStr}" from **${key}**`);
        } else {
            diffs.push(`Changed **${key}** "${oldStr}"\nto "${newStr}"`);
        }
    }
    return diffs.join('\n\n');
}

export async function getLogins() {
    try {
        const result = await query("SELECT data FROM public.system WHERE key = '_logins'");

        if (result.rows.length === 0) {
            return { management: [], admins: [], mods: [] };
        }

        return { management: [], admins: [], mods: [], ...(result.rows[0].data || {}) };
    } catch (err) {
        console.error("Database Error (getLogins):", err);
        return { management: [], admins: [], mods: [] };
    }
}

export async function verifyToken(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new Error('No token provided');
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const { management, admins, mods } = await getLogins();
        const allUsers = [...(management || []), ...(admins || []), ...(mods || [])];
        
        if (!decoded.username || !allUsers.some(u => u.username?.toLowerCase() === decoded.username.toLowerCase())) {
            throw new Error('User revoked');
        }
        
        return decoded;
    } catch (err) {
        throw new Error('Invalid or expired token');
    }
}

// ---- Records channel helpers --------------------------------------------------
const RECORDS_BOT_NAME = "MLL Manager";
const RECORDS_BOT_AVATAR = "https://medium-length-list.vercel.app/list_icon.png";
const MAX_DETAILED_BULK_POSTS = 6; // keeps bulk approvals inside the serverless time limit

// Discord can only ping by numeric user ID. A plain username is shown as text (no ping).
function mentionLine(raw) {
    const v = String(raw || '').trim().replace(/^@/, '').replace(/[`\r\n]/g, '');
    if (!v) return '';
    if (/^\d{17,20}$/.test(v)) return `<@${v}>`;
    return '@' + v.slice(0, 40).replace(/([*_~|>\\])/g, '\\$1');
}

// Turns what the player typed into something Discord can ping.
// Numeric ID -> ping. Username -> looked up in your server if the bot is set up. Otherwise plain text.
async function resolveMention(raw) {
    const cleaned = String(raw || '').trim().replace(/^@/, '').replace(/[`\r\n]/g, '');
    if (!cleaned) return '';
    if (/^\d{17,20}$/.test(cleaned)) return `<@${cleaned}>`;

    if (DISCORD_BOT_TOKEN && DISCORD_GUILD_ID) {
        const name = cleaned.split('#')[0].trim().toLowerCase();   // also copes with old name#1234 style
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 2500);
        try {
            const res = await fetch(
                `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/members/search?query=${encodeURIComponent(name)}&limit=10`,
                { headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` }, signal: controller.signal }
            );
            if (res.ok) {
                const members = await res.json();
                // exact username match only, so we never ping the wrong person
                const hit = members.find(m => m.user?.username?.toLowerCase() === name);
                if (hit) return `<@${hit.user.id}>`;
            } else {
                console.error(`Discord member lookup failed with status ${res.status}`);
            }
        } catch (e) {
            console.error('Discord member lookup error:', e.name === 'AbortError' ? 'timed out' : e);
        } finally {
            clearTimeout(timer);
        }
    }
    return mentionLine(cleaned);
}

function videoUrl(link) {
    const v = String(link || '').trim();
    return /^https?:\/\//i.test(v) ? v : '';
}

async function postWebhook(url, body) {
    for (let attempt = 0; attempt < 3; attempt++) {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (res.status === 429) {
            const info = await res.json().catch(() => ({}));
            await new Promise(r => setTimeout(r, Math.ceil((info.retry_after || 1) * 1000) + 100));
            continue;
        }
        if (!res.ok) console.error(`Webhook failed with status ${res.status}`);
        return res.ok;
    }
    return false;
}

// Posts: [ping line + embed]  then  [video link, so Discord shows its preview underneath]
async function sendRecordResult(url, r) {
    const fields = [{ name: 'Record holder', value: String(r.username || 'Unknown').slice(0, 1024), inline: true }];
    if (r.percent !== undefined && r.percent !== null) fields.push({ name: 'Percent', value: `${r.percent}%`, inline: true });
    if (r.hz) fields.push({ name: 'FPS/Hz', value: String(r.hz).slice(0, 1024), inline: true });
    if (r.notes) fields.push({ name: 'Notes', value: String(r.notes).slice(0, 1024), inline: false });

    const rank = r.rank ? `[#${r.rank}] ` : '';
    const embed = {
        title: `${r.accepted ? '✅' : '❌'} ${rank}${r.levelName || 'Unknown Level'}`.slice(0, 256),
        description: r.accepted ? 'Accepted' : 'Denied',
        color: r.accepted ? 0x2ECC71 : 0xED4245,
        fields
    };

    const mention = await resolveMention(r.discord);
    const first = {
        username: RECORDS_BOT_NAME,
        avatar_url: RECORDS_BOT_AVATAR,
        embeds: [embed],
        allowed_mentions: { parse: ['users'] }
    };
    if (mention) first.content = mention;
    await postWebhook(url, first);

    const vid = videoUrl(r.videoLink);
    if (vid) {
        await postWebhook(url, { username: RECORDS_BOT_NAME, avatar_url: RECORDS_BOT_AVATAR, content: vid, allowed_mentions: { parse: [] } });
    }
}

export async function auditLog(decodedUser, action, details) {
    if (!decodedUser || !decodedUser.username) return;

    const listType = details.list || LIST1;
    const tableName = listType === LIST2 ? 'public.levels_2' : 'public.levels';

    const updateWebhook = listType === LIST2 ? DISCORD_UPDATE_WEBHOOK_URL_2 : DISCORD_UPDATE_WEBHOOK_URL;

    if (updateWebhook) {
        let publicMsg = null;

        const getNeighbors = async (rank) => {
            try {
                const res = await query(
                    `SELECT rank, name FROM ${tableName} WHERE rank = $1 OR rank = $2`,
                    [rank - 1, rank + 1]
                );

                const levelBelowThis = res.rows.find(r => r.rank === rank - 1)?.name;
                const levelAboveThis = res.rows.find(r => r.rank === rank + 1)?.name;

                const parts = [];
                if (levelAboveThis) parts.push(`above **${levelAboveThis}**`);
                if (levelBelowThis) parts.push(`below **${levelBelowThis}**`);

                if (parts.length > 0) return `, ${parts.join(' and ')}`;
                return "";
            } catch (e) {
                console.error("Database Error (getNeighbors):", e);
                return "";
            }
        };

        switch (action) {
            case "ADD_LEVEL":
            case "APPROVE_LEVEL_SUBMISSION":
            case "APPROVE_SUBMISSION":
                if (action === "APPROVE_SUBMISSION" && details.type !== 'level' && !details.rank) break;

                const targetPlacement = details.placement || details.rank;
                const targetName = details.level?.name || details.levelName || details.level || details.name;

                if (targetName && targetPlacement) {
                    const neighbors = await getNeighbors(targetPlacement);
                    publicMsg = `## ${listType} List Update\n- **${targetName}** has been placed at **#${targetPlacement}**${neighbors}`;
                }
                break;

            case "DELETE_LEVEL":
                if (details.level) {
                    const name = details.level.name || details.level;
                    const rankStr = details.rank ? ` (was **#${details.rank}**)` : "";
                    publicMsg = `## ${listType} List Update\n- **${name}** has been removed from the list${rankStr}`;
                }
                break;

            case "LEVEL_REORDER":
                if (details.level && details.oldPos && details.newPos) {
                    const neighbors = await getNeighbors(details.newPos);
                    const name = details.level.name || details.level;
                    publicMsg = `## ${listType} List Update\n- **${name}** has been moved to **#${details.newPos}**${neighbors}\n(Previously #${details.oldPos})`;
                }
                break;

            case "BULK_PROCESS":
                if (details.action === 'approve') {
                    for (const sub of details.submissions) {
                        if (sub.type === 'level') {
                            const rank = sub.rank || sub.placement;
                            const name = sub.name || sub.levelName;
                            if (name && rank) {
                                const neighbors = await getNeighbors(rank);
                                const targetList = sub.list || listType;
                                const msg = `## ${targetList} List Update\n- **${name}** has been placed at **#${rank}**${neighbors}`;

                                try {
                                    const targetHook = targetList === LIST2 ? DISCORD_UPDATE_WEBHOOK_URL_2 : DISCORD_UPDATE_WEBHOOK_URL;
                                    if (!targetHook) continue;
                                    await fetch(targetHook, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            content: msg,
                                            username: "LIST UPDATES",
                                            avatar_url: "https://medium-length-list.vercel.app/list_icon.png"
                                        })
                                    });
                                } catch (e) { console.error("Webhook Error (Bulk Level):", e); }
                            }
                        }
                    }
                }
                break;
        }

        if (publicMsg) {
            try {
                await fetch(updateWebhook, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        content: publicMsg,
                        username: "LIST UPDATES",
                        avatar_url: "https://medium-length-list.vercel.app/list_icon.png"
                    })
                });
            } catch (e) {
                console.error("Webhook Error (Update Webhook):", e);
            }
        }
    }

    if (DISCORD_COMPLETION_WEBHOOK_URL) {
        const posts = [];     // record results, posted in the embed style
        let textMsg = null;   // plain lines (removed records, overflow from large bulk actions)

        if (action === "EDIT_LEVEL") {
            try {
                const oldRecs = details.oldLevel?.records || [];
                const newRecs = details.newLevel?.records || [];
                const levelName = details.newLevel?.name || "Unknown Level";

                const oldMap = new Map(oldRecs.map(r => [r.user?.toLowerCase(), r.user]));
                const newMap = new Map(newRecs.map(r => [r.user?.toLowerCase(), r.user]));

                newRecs.forEach(r => {
                    if (!oldMap.has(r.user?.toLowerCase())) {
                        posts.push({ accepted: true, rank: details.rank, levelName, username: r.user, percent: r.percent, hz: r.hz, videoLink: r.link });
                    }
                });
            } catch (e) {
                console.error("Webhook Error (EDIT_LEVEL Diff):", e);
            }
        }
        else if (action === "APPROVE_RECORD_SUBMISSION" || action === "APPROVE_SUBMISSION") {
            if (details.username && details.percent !== undefined) {
                posts.push({ accepted: true, rank: details.rank, levelName: details.levelName, username: details.username, percent: details.percent, hz: details.hz, notes: details.note, discord: details.discord, videoLink: details.videoLink });
            }
        }
        else if (action === "DENY_SUBMISSION" && details.type !== 'level') {
            posts.push({ accepted: false, rank: details.rank, levelName: details.name, username: details.username, percent: details.percent, hz: details.hz, notes: details.reason, discord: details.discord, videoLink: details.videoLink });
        }
        else if (action === "BULK_PROCESS") {
            const accepted = details.action === 'approve';
            const recordsOnly = (details.submissions || []).filter(s => s.type !== 'level');

            recordsOnly.slice(0, MAX_DETAILED_BULK_POSTS).forEach(s => {
                posts.push({ accepted, rank: s.rank, levelName: s.levelName || s.name, username: s.username, percent: s.percent, hz: s.hz, notes: details.reason, discord: s.discord, videoLink: s.videoLink });
            });

            const rest = recordsOnly.slice(MAX_DETAILED_BULK_POSTS);
            if (rest.length > 0) {
                let list = rest.map(s => `Record: ${s.username} on ${s.levelName || s.name} (${s.percent}%)`).join('\n');
                if (list.length > 1500) list = list.substring(0, 1490) + '...';
                textMsg = `**${rest.length} more record${rest.length > 1 ? 's' : ''} ${accepted ? 'approved' : 'denied'}:**\n${list}`;
            }
        }

        try {
            for (const p of posts) await sendRecordResult(DISCORD_COMPLETION_WEBHOOK_URL, p);
            if (textMsg) {
                await postWebhook(DISCORD_COMPLETION_WEBHOOK_URL, {
                    content: textMsg,
                    allowed_mentions: { parse: [] },
                    username: RECORDS_BOT_NAME,
                    avatar_url: RECORDS_BOT_AVATAR
                });
            }
        } catch (e) {
            console.error("Webhook Error (Completion Webhook):", e);
        }
    }

    if (!DISCORD_WEBHOOK_URL) return;

    const timestamp = new Date().toLocaleString("en-US", { timeZone: "UTC" });
    let embedColor = 0xFFA500;
    let displayTitle = `Admin Action: ${action}`;
    let displayFields = [];
    let fileAttachment = null;
    let fileName = null;

    const userRoleLabel = decodedUser.username.toLowerCase() === 'anticroom'
        ? 'Developer'
        : (decodedUser.role === 'management' ? 'Owner' : (decodedUser.role === 'admin' ? 'Admin' : 'mod'));

    const userField = {
        name: "User",
        value: `${decodedUser.username} (${userRoleLabel})`,
        inline: true
    };

    switch (action) {
        case "ADD_LEVEL":
        case "APPROVE_LEVEL_SUBMISSION":
            embedColor = 0x00FF00;
            displayTitle = action === "APPROVE_LEVEL_SUBMISSION"
                ? `Submission Approved: Level Added (${listType})`
                : `New Level Added (${listType})`;

            displayFields = [
                userField,
                { name: "Level Name", value: details.level?.name || details.levelName || "N/A", inline: true },
                { name: "Rank", value: `#${details.placement || details.rank || "???"}`, inline: true },
                { name: "Creator", value: details.level?.author || details.author || "N/A", inline: true }
            ];
            break;

        case "APPROVE_SUBMISSION":
        case "APPROVE_RECORD_SUBMISSION":
            embedColor = 0x00AA00;
            displayTitle = "Submission Approved: Record Added";
            displayFields = [
                userField,
                { name: "Level", value: details.levelName || "Unknown", inline: true },
                { name: "Player", value: details.username || "Unknown", inline: true },
                { name: "Percent", value: `${details.percent || 0}%`, inline: true }
            ];
            break;

        case "EDIT_LEVEL":
            displayTitle = "Level Edited Manually";
            displayFields = [
                userField,
                { name: "Level Name", value: details.newLevel?.name || "Unknown", inline: true },
                { name: "List", value: listType, inline: true }
            ];

            const levelDiff = buildChangesDiff(details.oldLevel, details.newLevel);
            if (levelDiff) {
                const safeDiff = levelDiff.length > 1000 ? levelDiff.substring(0, 995) + "..." : levelDiff;
                displayFields.push({ name: "Changes", value: safeDiff, inline: false });
            }

            if (details.reason) displayFields.push({ name: "Reason", value: details.reason, inline: false });
            break;

        case "ADD_STAFF":
        case "EDIT_STAFF":
            displayTitle = action === "ADD_STAFF" ? "Staff Member Added" : "Staff Member Edited";
            embedColor = 0x9B59B6;
            displayFields = [
                userField,
                { name: "Target User", value: details.targetUser || "Unknown", inline: true }
            ];

            if (details.oldData || details.newData) {
                const staffDiff = buildChangesDiff(details.oldData, details.newData);
                if (staffDiff) {
                    const safeDiff = staffDiff.length > 1000 ? staffDiff.substring(0, 995) + "..." : staffDiff;
                    displayFields.push({ name: "Changes", value: safeDiff, inline: false });
                }
            } else if (details.role) {
                displayFields.push({ name: "Role Added/Changed", value: details.role, inline: false });
            }
            break;

        case "DELETE_LEVEL":
            embedColor = 0xFF0000;
            displayTitle = "Level Deleted";
            displayFields = [
                userField,
                { name: "Level Name", value: details.level?.name || "Unknown", inline: true },
                { name: "Rank", value: `#${details.rank || "???"}`, inline: true }
            ];
            fileAttachment = JSON.stringify(details.level, null, 2);
            fileName = `backup_${(details.level?.name || 'level').replace(/[^a-z0-9]/gi, '_')}.json`;
            break;

        case "DENY_SUBMISSION":
            embedColor = 0xFF3333;
            displayTitle = "Submission Denied";
            displayFields = [
                userField,
                { name: "Level/Record", value: details.name || details.levelName || "Unknown", inline: true },
                { name: "Submitter", value: details.username || "Unknown", inline: true },
                { name: "Reason", value: details.reason || "No reason provided", inline: false }
            ];
            break;

        case "LEVEL_REORDER":
            embedColor = 0x3498DB;
            displayTitle = "Level Placement Changed";
            displayFields = [
                userField,
                { name: "Level", value: details.level?.name || details.level || "N/A", inline: true },
                { name: "Movement", value: `#${details.oldPos} ➔ #${details.newPos}`, inline: true }
            ];
            break;

        case "BULK_PROCESS":
            embedColor = details.action === 'approve' ? 0x00AA00 : 0xFF3333;
            displayTitle = `Bulk Submission ${details.action === 'approve' ? 'Approved' : 'Denied'}`;

            const lines = details.submissions.map(s => {
                if (s.type === 'level') return `- Level: ${s.name}`;
                return `- Record: ${s.username} on ${s.levelName || s.name} (${s.percent}%)`;
            });

            let chunk = lines.join('\n');
            if (chunk.length > 1000) chunk = chunk.substring(0, 995) + '...';

            displayFields = [
                userField,
                { name: "Items Processed", value: `${details.submissions.length} items`, inline: true }
            ];

            if (details.reason) {
                displayFields.push({ name: "Reason", value: details.reason, inline: false });
            }

            displayFields.push({ name: "Details", value: chunk || "No details", inline: false });
            break;

        default:
            displayFields = [
                userField,
                { name: "Level info", value: `\`\`\`json\n${JSON.stringify(details, null, 2)}\n\`\`\`` }
            ];
            break;
    }

    const payloadJson = {
        username: "MLL Staff Logs",
        avatar_url: "https://medium-length-list.vercel.app/list_icon.png",
        embeds: [{
            title: displayTitle,
            color: embedColor,
            fields: displayFields,
            footer: { text: `MLL Audit • ${timestamp} UTC` }
        }]
    };

    try {
        if (fileAttachment) {
            const formData = new FormData();
            formData.append('payload_json', JSON.stringify(payloadJson));
            const blob = new Blob([fileAttachment], { type: 'application/json' });
            formData.append('file', blob, fileName);
            await fetch(DISCORD_WEBHOOK_URL, { method: 'POST', body: formData });
        } else {
            await fetch(DISCORD_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payloadJson)
            });
        }
    } catch (err) {
        console.error("Webhook Error (Main Discord Payload):", err);
    }
}
