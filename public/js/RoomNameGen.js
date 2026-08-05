'use strict';

/**
 * Имена комнат: бренд/товар с optrf.store + дата/время.
 * Пример: darkside-29-07-2026-12:06
 * Только латиница (кириллица в room name запрещена).
 */
(() => {
    const WORDS = [
        // бренды табака / смесей
        'adalya',
        'antagonist',
        'bliss',
        'darkside',
        'deus',
        'dogma',
        'element',
        'husky',
        'joy',
        'kraken',
        'lilu',
        'marinage',
        'mrbrew',
        'muassel',
        'oven',
        'palitra',
        'satyr',
        'snobless',
        'take',
        'tangiers',
        'trofimoffs',
        'baza',
        'dusha',
        'severnyy',
        'hooligan',
        'afzal',
        'bonche',
        'frigate',
        'jent',
        'jibiar',
        'mattpear',
        'milano',
        'musthave',
        'nash',
        'ready',
        'sapphirecrown',
        'sebero',
        'serbetli',
        'spectrum',
        'starline',
        'morpheus',
        'chaba',
        'hook',
        'chabacco',
        // кальяны / комплектующие
        'alphahookah',
        'elbomber',
        'hoob',
        'mamay',
        'unionhookah',
        'tortuga',
        'sway',
        'ykap',
        'blade',
        'cwp',
        'mexanika',
        'misha',
        'mlclan',
        'starbuzz',
        'nagran',
        'apex',
        'ismod',
        // уголь / chew / прочее с витрины
        'cocobrico',
        'cocoloco',
        'flames',
        'oasis',
        'crown',
        'drymost',
        'stalker',
        'adex',
        'orishas',
        'vaporesso',
        'xros',
        // товары / линейки / вкусы с витрины (латиницей)
        'plombir',
        'malinovoevarene',
        'heavyfeijoa',
        'heavykiwi',
        'heavyperfume',
        'raspberrypeony',
        'pakoroban',
        'fruittallity',
        'mohitoyota',
        'citruswave',
        'mintslide',
        'foreveryoung',
        'kaleegrapefruit',
        'maraschini',
        'juicymango',
        'peachesinsyrup',
        'capablanca',
        'pinotnoir',
        'elysium',
        'totem',
        'alphabowl',
        'fusion',
        'turkdesign',
        'golite',
        'blackgold',
        'persimmon',
        'borodinskiy',
        'masala',
    ];

    function pad2(n) {
        return String(n).padStart(2, '0');
    }

    function formatStamp(date = new Date()) {
        const dd = pad2(date.getDate());
        const mm = pad2(date.getMonth() + 1);
        const yyyy = date.getFullYear();
        const hh = pad2(date.getHours());
        const mi = pad2(date.getMinutes());
        return `${dd}-${mm}-${yyyy}-${hh}-${mi}`;
    }

    function pickWord() {
        return WORDS[Math.floor(Math.random() * WORDS.length)];
    }

    function generate(date = new Date()) {
        return `${pickWord()}-${formatStamp(date)}`;
    }

    window.RoomNameGen = {
        WORDS,
        generate,
        formatStamp,
        pickWord,
    };
})();
