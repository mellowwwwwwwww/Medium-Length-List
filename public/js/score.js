const scale = 3;

export const PACK_MULTIPLIER = 0.33;

export function score(rank, percent, minPercent) {
    if (rank > 150) {
        return 0;
    }

    const listSize = 150;

    const coefficient = -249 / Math.pow(listSize - 1, 0.4);

    let score = (coefficient * Math.pow(rank - 1, 0.4) + 250) *
        ((percent - (minPercent - 1)) / (100 - (minPercent - 1)));

    score = Math.max(0, score);

    if (percent != 100) {
        return round(score - score / 1);
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
