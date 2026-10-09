const scale = 1; // decimal places points are rounded to

// The original curve gave 250 points for #1. Multiplying the whole curve keeps the
// shape (how fast points drop) identical while making #1 worth 250 * 2 = 500.
const POINTS_MULTIPLIER = 2;

export const PACK_MULTIPLIER = 0.33;

export function score(rank, percent, minPercent) {
    if (rank > 150) {
        return 0;
    }

    const listSize = 150;

    const coefficient = (-249 * POINTS_MULTIPLIER) / Math.pow(listSize - 1, 0.4);

    let score = (coefficient * Math.pow(rank - 1, 0.4) + 250 * POINTS_MULTIPLIER) *
        ((percent - (minPercent - 1)) / (100 - (minPercent - 1)));

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
