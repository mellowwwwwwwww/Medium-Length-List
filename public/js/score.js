const scale = 1;

export const LIST_SIZE = 300;

// The named sections of the list. Dividers are drawn from these automatically,
// so a section only shows up once a level actually reaches that position.
export const MAIN_LIST_END = 100;
export const EXTENDED_LIST_END = 200;
export const LIST_SECTIONS = [
    { name: 'Main List', from: 1, to: MAIN_LIST_END },
    { name: 'Extended List', from: MAIN_LIST_END + 1, to: EXTENDED_LIST_END },
    { name: 'Legacy List', from: EXTENDED_LIST_END + 1, to: LIST_SIZE },
    { name: 'Dead List', from: LIST_SIZE + 1, to: Infinity },
];

export function sectionOf(rank) {
    return LIST_SECTIONS.find((section) => rank <= section.to) || LIST_SECTIONS[LIST_SECTIONS.length - 1];
}

const TOP_POINTS = 500;
const BOTTOM_POINTS = 2;
const DECAY = 3.54;

export const PACK_MULTIPLIER = 0.33;

export function score(rank, percent, minPercent) {
    if (rank > LIST_SIZE) {
        return 0;
    }

    const position = (rank - 1) / (LIST_SIZE - 1);
    const base = BOTTOM_POINTS + (TOP_POINTS - BOTTOM_POINTS) *
        (Math.exp(-DECAY * position) - Math.exp(-DECAY)) / (1 - Math.exp(-DECAY));

    let score = base * ((percent - (minPercent - 1)) / (100 - (minPercent - 1)));

    score = Math.max(0, score);

    if (percent != 100) {
        return round(score - score / 3);
    }

    return Math.max(round(score), 0);
}

export function round(num) {
    if (!('' + num).includes('e')) {
        return +(Math.round(num + 'e+' + scale) + 'e-' + scale);
    } else {
        var arr = ('' + num).split('e');
        var sig = '';
        if (+arr[1] + scale > 0) {
            sig = '+';
        }
        return +(
            Math.round(+arr[0] + 'e' + sig + (+arr[1] + scale)) +
            'e-' +
            scale
        );
    }
}
