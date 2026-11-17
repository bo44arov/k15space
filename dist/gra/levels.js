// Coordinates refer to the original, unedited studio photographs.
window.K15_LEVELS = [
  {
    id: 'aura', name: 'AURA', image: '/images/workshop-k15.jpg',
    width: 1013, height: 675,
    description: 'Світла студія AURA зі столом, рослиною та білою етажеркою',
    objects: [
      { id: 'leaf', name: 'Великий листок', x: 195, y: 185, w: 54, h: 94, digit: '1', clue: 'Біля рослини захована записка. На ній цифра 1.' },
      { id: 'card', name: 'Рожева листівка', x: 689, y: 201, w: 25, h: 29, digit: '5', clue: 'На звороті листівки написано 5.' },
      { id: 'pencils', name: 'Олівці у склянці', x: 687, y: 249, w: 26, h: 31, digit: '4', clue: 'На склянці з олівцями маленька наліпка з цифрою 4.' },
      { id: 'vase', name: 'Золотиста ваза', x: 727, y: 141, w: 25, h: 50, digit: '0', clue: 'Під вазою лежить папірець із цифрою 0.' },
      { id: 'handle', name: 'Дверна ручка', x: 919, y: 229, w: 29, h: 33, clue: 'На дверях підказка про порядок цифр. Ваза → олівці → листок → листівка.' },
    ],
  },
  {
    id: 'sakura', name: 'SAKURA', image: '/images/hero-k15.jpg',
    width: 900, height: 675,
    description: 'Студія SAKURA з великими вікнами, гірляндою та столом',
    objects: [
      { id: 'star', name: 'Зірка гірлянди', x: 386, y: 136, w: 49, h: 58 },
      { id: 'jar', name: 'Скляна банка', x: 655, y: 326, w: 28, h: 38 },
      { id: 'candles', name: 'Свічки', x: 684, y: 317, w: 25, h: 55 },
      { id: 'flowers', name: 'Рожеві квіти', x: 716, y: 335, w: 40, h: 45 },
      { id: 'socket', name: 'Розетка біля підлоги', x: 869, y: 482, w: 31, h: 26 },
    ],
  },
];

// A fictional puzzle for the game, unrelated to access to the real studios.
window.K15_DOOR_ORDER = ['vase', 'pencils', 'leaf', 'card'];
