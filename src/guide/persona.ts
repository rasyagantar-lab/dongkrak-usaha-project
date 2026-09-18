/*
  Who the guide is. Everything that names or shows the character lives here, so a
  different mascot is a one-file change (name, two portraits, a few lines of voice).

  The portraits are the owner's own assets, placed as supplied (public/guide/); the
  application neither fetches nor generates character art.
*/

export const GUIDE_PERSONA = {
  name: 'MITSURU',
  portraits: {
    idle: '/guide/mitsuru-idle.webp',
    talk: '/guide/mitsuru-talk.webp'
  },
  /** Shown when nothing is being pointed at. Rotates slowly; never typewritten. */
  idleLines: [
    'Arahkan kursor ke tombol atau tab mana pun — akan kujelaskan fungsinya.',
    'Setiap bagian di sini punya cerita. Tunjuk saja.',
    'Aku di sini kalau ada yang tidak jelas.'
  ],
  /** Label printed before a history line. */
  factLabel: 'FAKTA',
  /** ms per character for the typewriter; 0 disables. */
  typeSpeedMs: 18,
  /** ms of silence before the portrait returns to idle. */
  idleAfterMs: 4000
} as const;
