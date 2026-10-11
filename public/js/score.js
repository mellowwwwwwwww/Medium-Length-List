const scale = 1;

export const LIST_SIZE = 300;

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
